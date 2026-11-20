// Kino Terminal: your shell in a panel (your login shell on macOS and Linux, PowerShell on Windows),
// starting in the current project's folder. Talks to the local Kino bridge over a WebSocket (/pty).
// The address and the pairing token come from ../bridge, shared with the other panels.
// Written with createElement instead of JSX: panel JSX currently renders as plain objects (React #31).
import { createElement as h, useEffect, useRef, useState } from 'react'
import { usePanelSettings } from 'kino/panel'
import { Terminal } from '@xterm/xterm@6.0.0'
import { FitAddon } from '@xterm/addon-fit@0.11.0'
import { XTERM_CSS } from './xtermCss'
import { useKinoTheme, type KinoTheme } from '../theme'
import { IS_MAC, IS_WIN, FILE_MANAGER, MONO_FONT, UI_FONT } from '../platform'
import { BridgeCard, bridgeUrl, bridgeWsUrl, clearToken, getToken, projectId, setToken } from '../bridge'

const STYLE_ID = 'kino-terminal-xterm-css'
const FONT = MONO_FONT
const MIN_FONT = 9
const MAX_FONT = 24

type Status = 'connecting' | 'connected' | 'unpaired' | 'pairing' | 'offline' | 'exited'

// xterm draws on a canvas and needs literal colours, so each Kino theme gets its own palette.
const DARK_THEME = {
	background: '#0f0f11',
	foreground: '#e4e4e7',
	cursor: '#e4e4e7',
	cursorAccent: '#0f0f11',
	selectionBackground: 'rgba(120, 150, 255, 0.35)',
	black: '#27272a',
	red: '#f87171',
	green: '#4ade80',
	yellow: '#facc15',
	blue: '#60a5fa',
	magenta: '#c084fc',
	cyan: '#22d3ee',
	white: '#d4d4d8',
	brightBlack: '#71717a',
	brightRed: '#fca5a5',
	brightGreen: '#86efac',
	brightYellow: '#fde047',
	brightBlue: '#93c5fd',
	brightMagenta: '#d8b4fe',
	brightCyan: '#67e8f9',
	brightWhite: '#fafafa',
}

// Light palette on Kino's light workbench background (#f5f3ee); ANSI shades follow GitHub Light.
const LIGHT_THEME: typeof DARK_THEME = {
	background: '#f5f3ee',
	foreground: '#2a2826',
	cursor: '#2a2826',
	cursorAccent: '#f5f3ee',
	selectionBackground: 'rgba(9, 105, 218, 0.2)',
	black: '#2a2826',
	red: '#cf222e',
	green: '#1a7f37',
	yellow: '#9a6700',
	blue: '#0969da',
	magenta: '#8250df',
	cyan: '#1b7c83',
	white: '#6e7781',
	brightBlack: '#57606a',
	brightRed: '#a40e26',
	brightGreen: '#116329',
	brightYellow: '#7d4e00',
	brightBlue: '#0550ae',
	brightMagenta: '#6639ba',
	brightCyan: '#136061',
	brightWhite: '#8c959f',
}

const TERM_THEME: Record<KinoTheme, typeof DARK_THEME> = { dark: DARK_THEME, light: LIGHT_THEME }

const STATUS_COLOR: Record<Status, string> = {
	connected: 'var(--kp-st-ok)',
	connecting: 'var(--kp-st-wait)',
	pairing: 'var(--kp-st-wait)',
	unpaired: 'var(--kp-st-bad)',
	offline: 'var(--kp-st-bad)',
	exited: 'var(--kp-st-off)',
}

const STATUS_LABEL: Record<Status, string> = {
	connected: '',
	connecting: 'Connecting',
	pairing: 'Waiting for approval',
	unpaired: 'Not connected',
	offline: 'Bridge offline',
	exited: 'Exited',
}

// macOS: Cmd shortcuts the terminal keeps; every other Cmd shortcut still reaches Kino.
// Windows/Linux: Ctrl is terminal input (Ctrl+C, Ctrl+R, ...), so every key stays in the terminal.
const TERMINAL_CMD_KEYS = new Set(['c', 'v', 'x', 'a', 'k', 'z'])

const ensureCss = () => {
	if (document.getElementById(STYLE_ID)) return
	const style = document.createElement('style')
	style.id = STYLE_ID
	style.textContent = XTERM_CSS
	document.head.appendChild(style)
}

const tildify = (dir: string, home: string) => (home && dir.startsWith(home) ? `~${dir.slice(home.length)}` : dir)
const electronShell = () =>
	(window as unknown as { electron?: { shell?: { openPath?: (path: string) => unknown } } }).electron?.shell
const copyText = (text: string) => {
	navigator.clipboard?.writeText(text).catch(() => {
		;(window as unknown as { electron?: { clipboard?: { writeText?: (t: string) => unknown } } }).electron?.clipboard?.writeText?.(text)
	})
}

// "~/clips", "/tmp/x/" and "C:\\Work\\" in one comparable form, to tell whether the bridge used the start folder.
const samePath = (a: string, b: string, home: string) => {
	const norm = (value: string) => {
		const full = home && /^~(?=$|[\\/])/.test(value) ? home + value.slice(1) : value
		const trimmed = full.replace(/[\\/]+$/, '')
		return IS_WIN ? trimmed.replace(/\//g, '\\').toLowerCase() : trimmed
	}
	return norm(a) === norm(b)
}
const dim = (text: string) => `\x1b[2m[${text}]\x1b[0m\r\n`
// Mouse clicks on header buttons must not take keyboard focus away from the shell.
const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault()

type Api = { pair: () => void; restart: () => void; retry: () => void }

const buttonStyle = {
	height: 20,
	padding: '0 7px',
	border: '1px solid rgba(var(--kp-ink),0.1)',
	borderRadius: 5,
	background: 'rgba(var(--kp-ink),0.04)',
	color: 'rgba(var(--kp-ink),0.75)',
	fontSize: 11,
	fontFamily: UI_FONT,
	cursor: 'pointer',
	lineHeight: '18px',
	flexShrink: 0,
}

const quiet = (event: { stopPropagation: () => void }) => event.stopPropagation()

export default function TerminalPanel() {
	const [settings, setSettings] = usePanelSettings({ fontSize: 12, startDir: '' })
	const settingsRef = useRef(settings)
	settingsRef.current = settings

	const hostRef = useRef<HTMLDivElement | null>(null)
	const termRef = useRef<Terminal | null>(null)
	const fitRef = useRef<FitAddon | null>(null)
	const apiRef = useRef<Api | null>(null)
	const [status, setStatus] = useState<Status>('connecting')
	const [note, setNote] = useState('')
	const [cwd, setCwd] = useState('')
	const [home, setHome] = useState('')
	const [editingDir, setEditingDir] = useState(false)
	const [dirDraft, setDirDraft] = useState('')
	const theme = useKinoTheme()
	const themeRef = useRef(theme)
	themeRef.current = theme

	useEffect(() => {
		if (termRef.current) termRef.current.options.theme = TERM_THEME[theme]
	}, [theme])

	useEffect(() => {
		ensureCss()
		const host = hostRef.current
		if (!host) return
		const project = projectId()
		const sessionKey = `kino-terminal:session:${project || 'none'}`
		const term = new Terminal({
			fontFamily: FONT,
			fontSize: settingsRef.current.fontSize,
			lineHeight: 1.15,
			cursorBlink: true,
			scrollback: 10000,
			macOptionIsMeta: true,
			theme: TERM_THEME[themeRef.current],
		})
		const fit = new FitAddon()
		term.loadAddon(fit)
		term.open(host)
		termRef.current = term
		fitRef.current = fit

		const encoder = new TextEncoder()
		let socket: WebSocket | null = null
		let statusNow: Status = 'connecting'
		let disposed = false
		let restartPending = false
		let retryTimer = 0
		let attempt = 0

		const show = (next: Status, message = '') => {
			statusNow = next
			setStatus(next)
			setNote(message)
		}
		const safeFit = () => {
			if (host.clientWidth > 0 && host.clientHeight > 0) {
				try {
					fit.fit()
				} catch {}
			}
		}
		const send = (data: string | Uint8Array) => {
			if (socket?.readyState === WebSocket.OPEN) socket.send(data)
		}
		const scheduleRetry = () => {
			window.clearTimeout(retryTimer)
			attempt += 1
			retryTimer = window.setTimeout(connect, Math.min(1000 * 2 ** Math.min(attempt, 4), 15000))
		}

		// The shell is gone and will not come back by itself: say why, then wait for a key press.
		const stop = (reason: string) => {
			sessionStorage.removeItem(sessionKey)
			term.write(`\r\n${dim(reason)}`)
			show('exited')
		}

		function connect() {
			window.clearTimeout(retryTimer)
			if (disposed) return
			// A connection is already open or on its way (Retry pressed twice, the token watcher below)
			if (socket && socket.readyState <= WebSocket.OPEN) return
			const token = getToken()
			if (!token) return show('unpaired')
			show('connecting')
			safeFit()
			let opened = false
			let ws: WebSocket
			try {
				ws = new WebSocket(bridgeWsUrl('/pty'))
			} catch {
				show('offline')
				scheduleRetry()
				return
			}
			ws.binaryType = 'arraybuffer'
			socket = ws
			const wanted = sessionStorage.getItem(sessionKey)
			const startDir = settingsRef.current.startDir
			ws.onopen = () => {
				opened = true
				ws.send(
					JSON.stringify({
						t: 'hello',
						token,
						sessionId: wanted ?? undefined,
						projectId: project,
						cwd: startDir || undefined,
						cols: term.cols,
						rows: term.rows,
					}),
				)
			}
			ws.onmessage = event => {
				if (typeof event.data !== 'string') {
					term.write(new Uint8Array(event.data as ArrayBuffer))
					return
				}
				let message: { t: string; [key: string]: unknown }
				try {
					message = JSON.parse(event.data)
				} catch {
					return
				}
				if (message.t === 'ready') {
					attempt = 0
					sessionStorage.setItem(sessionKey, String(message.sessionId))
					const dir = String(message.cwd ?? '')
					const homeDir = String(message.home ?? '')
					setCwd(dir)
					setHome(homeDir)
					term.reset() // a resumed session replays its scrollback next
					if (!message.resumed) {
						// The old shell could not be picked up again: it ended, or the bridge restarted.
						if (wanted) term.write(dim('new shell: the previous one is gone'))
						// The bridge falls back quietly when the start folder does not exist.
						if (startDir && dir && !samePath(startDir, dir, homeDir)) term.write(dim(`start folder not found: ${startDir}`))
					}
					show('connected')
					safeFit()
					send(JSON.stringify({ t: 'resize', cols: term.cols, rows: term.rows }))
				} else if (message.t === 'exit') {
					sessionStorage.removeItem(sessionKey)
					if (!restartPending) stop(`exited with code ${message.exitCode}. Press any key for a new shell`)
				} else if (message.t === 'error') {
					term.write(`\r\n\x1b[31m${String(message.message)}\x1b[0m\r\n`)
				}
			}
			ws.onclose = event => {
				if (socket !== ws) return
				socket = null
				if (disposed) return
				if (restartPending) {
					restartPending = false
					sessionStorage.removeItem(sessionKey)
					connect()
				} else if (event.code === 4401) {
					clearToken()
					show('unpaired', 'The bridge no longer knows this pairing. Connect again.')
				} else if (event.code === 4429) {
					// Retrying would only fail again until a shell is closed
					stop('The bridge has too many shells open. Close a Terminal panel you no longer need, then press any key')
				} else if (event.code === 4500) {
					// The shell could not start. The bridge printed why just above.
					stop('Press any key to try again')
				} else if (statusNow === 'exited') {
					// wait for a key press
				} else if (!opened) {
					show('offline')
					scheduleRetry()
				} else {
					show('connecting', 'Connection lost, reconnecting')
					scheduleRetry()
				}
			}
		}

		const pair = () => {
			show('pairing')
			fetch(bridgeUrl('/pair'), { method: 'POST' })
				.then(async response => {
					const body = await response.json().catch(() => ({}))
					if (disposed) return
					if (response.ok && typeof body.token === 'string') {
						setToken(body.token)
						connect()
					} else {
						show('unpaired', typeof body.error === 'string' ? body.error : `Pairing failed (${response.status}).`)
					}
				})
				.catch(() => {
					if (disposed) return
					show('offline')
					scheduleRetry()
				})
		}

		const restart = () => {
			sessionStorage.removeItem(sessionKey)
			if (socket?.readyState === WebSocket.OPEN) {
				restartPending = true
				send(JSON.stringify({ t: 'kill' }))
				socket.close(1000)
			} else {
				term.reset()
				connect()
			}
		}

		apiRef.current = { pair, restart, retry: connect }

		term.onData(data => {
			if (statusNow === 'exited') {
				connect()
				return
			}
			send(encoder.encode(data))
		})
		term.onBinary(data => send(Uint8Array.from(data, char => char.charCodeAt(0) & 255)))
		term.onResize(({ cols, rows }) => send(JSON.stringify({ t: 'resize', cols, rows })))
		term.attachCustomKeyEventHandler(event => {
			if (!IS_MAC) {
				// Windows Terminal conventions: Ctrl+C copies when text is selected (else it interrupts),
				// Ctrl+Shift+C copies, Ctrl+V / Ctrl+Shift+V paste through the browser's paste event.
				if (event.type !== 'keydown' || !event.ctrlKey || event.altKey || event.metaKey) return true
				const key = event.key.toLowerCase()
				if (key === 'c' && (event.shiftKey || term.hasSelection())) {
					if (term.hasSelection()) copyText(term.getSelection())
					term.clearSelection()
					event.preventDefault()
					return false
				}
				if (key === 'v') return false
				return true
			}
			if (event.type !== 'keydown' || !event.metaKey || event.ctrlKey || event.altKey) return true
			const key = event.key.toLowerCase()
			if (key === 'c') {
				if (term.hasSelection()) copyText(term.getSelection())
				event.preventDefault()
				return false
			}
			if (key === 'k') {
				term.clear()
				event.preventDefault()
				return false
			}
			if (key === 'a') {
				term.selectAll()
				event.preventDefault()
				return false
			}
			return true
		})

		// Keep typing out of Kino's editor shortcuts (space, J/K/L, delete, ...). Cmd shortcuts other
		// than copy/paste/select-all/clear/undo still reach Kino.
		const isolateKey = (event: KeyboardEvent) => {
			if (IS_MAC && event.metaKey && !TERMINAL_CMD_KEYS.has(event.key.toLowerCase())) return
			event.stopPropagation()
		}
		const isolate = (event: Event) => event.stopPropagation()
		const keyEvents = ['keydown', 'keyup', 'keypress'] as const
		const clipboardEvents = ['copy', 'cut', 'paste'] as const
		keyEvents.forEach(name => host.addEventListener(name, isolateKey))
		clipboardEvents.forEach(name => host.addEventListener(name, isolate))

		let frame = 0
		const observer = new ResizeObserver(() => {
			cancelAnimationFrame(frame)
			frame = requestAnimationFrame(safeFit)
		})
		observer.observe(host)

		// Pairing is shared: when another panel connects, this one follows without a click.
		const tokenWatch = window.setInterval(() => {
			if (statusNow === 'unpaired' && getToken()) connect()
		}, 3000)
		// Coming back to the window is a good moment to look for the bridge again.
		const onVisible = () => {
			if (document.visibilityState === 'visible' && statusNow === 'offline') connect()
		}
		document.addEventListener('visibilitychange', onVisible)

		safeFit()
		connect()

		return () => {
			disposed = true
			window.clearTimeout(retryTimer)
			window.clearInterval(tokenWatch)
			document.removeEventListener('visibilitychange', onVisible)
			cancelAnimationFrame(frame)
			observer.disconnect()
			keyEvents.forEach(name => host.removeEventListener(name, isolateKey))
			clipboardEvents.forEach(name => host.removeEventListener(name, isolate))
			socket?.close(1000) // the bridge keeps the shell for 15 minutes so a re-docked panel resumes it
			socket = null
			apiRef.current = null
			termRef.current = null
			fitRef.current = null
			term.dispose()
		}
	}, [])

	useEffect(() => {
		const term = termRef.current
		if (!term || term.options.fontSize === settings.fontSize) return
		term.options.fontSize = settings.fontSize
		try {
			fitRef.current?.fit()
		} catch {}
	}, [settings.fontSize])

	const setFontSize = (delta: number) =>
		setSettings(previous => ({
			...previous,
			fontSize: Math.min(MAX_FONT, Math.max(MIN_FONT, previous.fontSize + delta)),
		}))

	const saveStartDir = () => {
		const next = dirDraft.trim()
		setEditingDir(false)
		if (next === settings.startDir) return
		setSettings(previous => ({ ...previous, startDir: next }))
		settingsRef.current = { ...settingsRef.current, startDir: next }
		apiRef.current?.restart()
	}

	const shell = electronShell()
	const label = cwd ? tildify(cwd, home) : STATUS_LABEL[status]

	const header = h(
		'div',
		{
			style: {
				display: 'flex',
				alignItems: 'center',
				gap: 6,
				height: 30,
				padding: '0 8px 0 10px',
				borderBottom: '1px solid rgba(var(--kp-ink),0.07)',
				fontSize: 11,
				fontFamily: UI_FONT,
				color: 'rgba(var(--kp-ink),0.6)',
				flexShrink: 0,
				userSelect: 'none' as const,
			},
		},
		h('span', {
			title: STATUS_LABEL[status] || 'Connected',
			style: { width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[status], flexShrink: 0 },
		}),
		editingDir
			? h('input', {
					autoFocus: true,
					value: dirDraft,
					placeholder: 'Start folder, like ~/clips. Empty: the project folder. Enter starts a new shell there.',
					onChange: (event: { target: { value: string } }) => setDirDraft(event.target.value),
					onKeyDown: (event: { key: string; stopPropagation: () => void }) => {
						event.stopPropagation()
						if (event.key === 'Enter') saveStartDir()
						if (event.key === 'Escape') setEditingDir(false)
					},
					// Typing or pasting a path here must not reach Kino's editor shortcuts or its clip paste
					onKeyUp: quiet,
					onKeyPress: quiet,
					onCopy: quiet,
					onCut: quiet,
					onPaste: quiet,
					onBlur: () => setEditingDir(false),
					style: {
						flex: 1,
						minWidth: 0,
						height: 20,
						padding: '0 6px',
						borderRadius: 4,
						border: '1px solid rgba(var(--kp-ink),0.18)',
						background: 'var(--kp-well)',
						color: 'var(--kp-text)',
						fontFamily: FONT,
						fontSize: 11,
						outline: 'none',
					},
				})
			: h(
					'span',
					{
						title: cwd
							? `${cwd}\nStart folder: ${settings.startDir || 'project folder'}. Click to change it (starts a new shell).`
							: 'Click to set the folder new shells start in',
						onClick: () => {
							setDirDraft(settings.startDir)
							setEditingDir(true)
						},
						style: {
							flex: 1,
							minWidth: 0,
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap' as const,
							fontFamily: FONT,
							cursor: 'text',
							direction: 'rtl' as const,
							textAlign: 'left' as const,
						},
					},
					h('bdi', null, label + (status !== 'connected' && cwd ? `  ·  ${STATUS_LABEL[status]}` : '')),
				),
		h('button', { title: `Smaller text (now ${settings.fontSize} px)`, onMouseDown: keepFocus, onClick: () => setFontSize(-1), style: buttonStyle }, 'A−'),
		h('button', { title: `Larger text (now ${settings.fontSize} px)`, onMouseDown: keepFocus, onClick: () => setFontSize(1), style: buttonStyle }, 'A+'),
		shell?.openPath && cwd
			? h('button', { title: `Show this folder in ${FILE_MANAGER}`, onMouseDown: keepFocus, onClick: () => shell.openPath?.(cwd), style: buttonStyle }, FILE_MANAGER)
			: null,
		h(
			'button',
			{ title: 'Close this shell and start a new one', onMouseDown: keepFocus, onClick: () => apiRef.current?.restart(), style: buttonStyle },
			'New',
		),
	)

	// The shared card covers the shell while the bridge is away, unpaired or waiting for approval.
	const overlay =
		status === 'unpaired' || status === 'pairing' || status === 'offline'
			? h(
					'div',
					{
						style: {
							position: 'absolute',
							inset: 0,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							padding: 16,
							overflowY: 'auto' as const,
							background: 'rgba(var(--kp-bg-rgb),0.94)',
						},
					},
					h(BridgeCard, {
						bridge: status,
						note,
						uses: 'The terminal',
						onPair: () => apiRef.current?.pair(),
						onRetry: () => apiRef.current?.retry(),
					}),
				)
			: null

	return h(
		'div',
		{
			style: {
				display: 'flex',
				flexDirection: 'column',
				width: '100%',
				height: '100%',
				minHeight: 0,
				background: TERM_THEME[theme].background,
				overflow: 'hidden',
			},
		},
		header,
		h(
			'div',
			{ style: { position: 'relative', flex: 1, minHeight: 0 } },
			h('div', { ref: hostRef, style: { position: 'absolute', inset: 0, padding: '6px 4px 4px 10px' } }),
			overlay,
		),
	)
}
