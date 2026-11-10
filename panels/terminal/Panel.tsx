// Kino Terminal: your shell in a panel (zsh/bash on macOS, PowerShell on Windows), starting in the
// current project's folder. Talks to the local bridge (cp-kino-ext, `npm start`) over ws://127.0.0.1:47680.
// Written with createElement instead of JSX: panel JSX currently renders as plain objects (React #31).
import { createElement as h, useEffect, useRef, useState } from 'react'
import { usePanelSettings } from 'kino/panel'
import { Terminal } from '@xterm/xterm@6.0.0'
import { FitAddon } from '@xterm/addon-fit@0.11.0'
import { XTERM_CSS } from './xtermCss'
import { useKinoTheme, type KinoTheme } from '../theme'
import { IS_MAC, MACHINE, YOUR_MACHINE, FILE_MANAGER, PAIR_DIALOG, ALLOW, START_BRIDGE, START_BRIDGE_HINT, MONO_FONT, UI_FONT } from '../platform'

const BRIDGE = '127.0.0.1:47680'
const TOKEN_KEY = 'kino-terminal:token' // device-local, never stored in shared panel source or settings
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

const projectIdFromUrl = () => new URLSearchParams(window.location.search).get('project') ?? ''
const tildify = (dir: string, home: string) => (home && dir.startsWith(home) ? `~${dir.slice(home.length)}` : dir)
const electronShell = () =>
	(window as unknown as { electron?: { shell?: { openPath?: (path: string) => unknown } } }).electron?.shell
const copyText = (text: string) => {
	navigator.clipboard?.writeText(text).catch(() => {
		;(window as unknown as { electron?: { clipboard?: { writeText?: (t: string) => unknown } } }).electron?.clipboard?.writeText?.(text)
	})
}

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

const primaryButtonStyle = {
	...buttonStyle,
	height: 28,
	padding: '0 14px',
	background: 'var(--kp-text)',
	color: 'var(--kp-bg)',
	border: 'none',
	fontWeight: 600,
	fontSize: 12,
}

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
		const projectId = projectIdFromUrl()
		const sessionKey = `kino-terminal:session:${projectId || 'none'}`
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

		function connect() {
			window.clearTimeout(retryTimer)
			if (disposed) return
			const token = localStorage.getItem(TOKEN_KEY)
			if (!token) return show('unpaired')
			show('connecting')
			safeFit()
			let opened = false
			const ws = new WebSocket(`ws://${BRIDGE}/pty`)
			ws.binaryType = 'arraybuffer'
			socket = ws
			ws.onopen = () => {
				opened = true
				ws.send(
					JSON.stringify({
						t: 'hello',
						token,
						sessionId: sessionStorage.getItem(sessionKey) ?? undefined,
						projectId,
						cwd: settingsRef.current.startDir || undefined,
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
					setCwd(String(message.cwd ?? ''))
					setHome(String(message.home ?? ''))
					term.reset() // a resumed session replays its scrollback next
					show('connected')
					safeFit()
					send(JSON.stringify({ t: 'resize', cols: term.cols, rows: term.rows }))
				} else if (message.t === 'exit') {
					sessionStorage.removeItem(sessionKey)
					if (!restartPending) {
						term.write(`\r\n\x1b[2m[exited with code ${message.exitCode}. Press any key for a new shell]\x1b[0m\r\n`)
						show('exited')
					}
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
					localStorage.removeItem(TOKEN_KEY)
					show('unpaired', 'The bridge no longer recognises this pairing. Connect again.')
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
			fetch(`http://${BRIDGE}/pair`, { method: 'POST' })
				.then(async response => {
					const body = await response.json().catch(() => ({}))
					if (response.ok && typeof body.token === 'string') {
						localStorage.setItem(TOKEN_KEY, body.token)
						connect()
					} else {
						show('unpaired', typeof body.error === 'string' ? body.error : `Pairing failed (${response.status}).`)
					}
				})
				.catch(() => show('offline'))
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

		safeFit()
		connect()

		return () => {
			disposed = true
			window.clearTimeout(retryTimer)
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
					placeholder: 'Start folder (empty = project folder)',
					onChange: (event: { target: { value: string } }) => setDirDraft(event.target.value),
					onKeyDown: (event: { key: string; stopPropagation: () => void }) => {
						event.stopPropagation()
						if (event.key === 'Enter') saveStartDir()
						if (event.key === 'Escape') setEditingDir(false)
					},
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
							? `${cwd}\nStart folder: ${settings.startDir || 'project folder'} (click to change)`
							: 'Click to set the start folder',
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
		h('button', { title: 'Smaller text', onClick: () => setFontSize(-1), style: buttonStyle }, 'A−'),
		h('button', { title: 'Larger text', onClick: () => setFontSize(1), style: buttonStyle }, 'A+'),
		shell?.openPath && cwd
			? h('button', { title: `Show this folder in ${FILE_MANAGER}`, onClick: () => shell.openPath?.(cwd), style: buttonStyle }, FILE_MANAGER)
			: null,
		h(
			'button',
			{ title: 'Close this shell and start a new one', onClick: () => apiRef.current?.restart(), style: buttonStyle },
			'New',
		),
	)

	const overlayCard = (title: string, body: unknown, action?: { label: string; onClick: () => void }) =>
		h(
			'div',
			{
				style: {
					position: 'absolute',
					inset: 0,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					padding: 16,
					background: 'rgba(var(--kp-bg-rgb),0.94)',
					fontFamily: UI_FONT,
				},
			},
			h(
				'div',
				{ style: { maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 10, color: 'rgba(var(--kp-ink),0.7)', fontSize: 12, lineHeight: 1.5 } },
				h('div', { style: { color: 'var(--kp-strong)', fontSize: 14, fontWeight: 600 } }, title),
				body,
				note ? h('div', { style: { color: 'var(--kp-red)' } }, note) : null,
				action ? h('div', null, h('button', { onClick: action.onClick, style: primaryButtonStyle }, action.label)) : null,
			),
		)

	const code = (text: string) =>
		h(
			'code',
			{
				style: {
					display: 'block',
					padding: '6px 8px',
					borderRadius: 5,
					background: 'rgba(var(--kp-ink),0.06)',
					fontFamily: FONT,
					fontSize: 11,
					color: 'var(--kp-text)',
					userSelect: 'text' as const,
					wordBreak: 'break-all' as const,
				},
			},
			text,
		)

	const overlay =
		status === 'unpaired'
			? overlayCard(
					'Connect the terminal',
					h('div', null, `Kino Terminal runs your shell through a small bridge on ${MACHINE}. Click Connect, then choose ${ALLOW} in the dialog that appears. You only do this once per computer.`),
					{ label: 'Connect', onClick: () => apiRef.current?.pair() },
				)
			: status === 'pairing'
				? overlayCard(`Approve on ${YOUR_MACHINE}`, h('div', null, `Choose ${ALLOW} in ${PAIR_DIALOG}. It may be behind the Kino window.`))
				: status === 'offline'
					? overlayCard(
							'Terminal bridge is not running',
							h(
								'div',
								{ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
								h('div', null, `${START_BRIDGE_HINT} This panel reconnects by itself.`),
								code(START_BRIDGE),
							),
							{ label: 'Retry now', onClick: () => apiRef.current?.retry() },
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
