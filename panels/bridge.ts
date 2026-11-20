// Shared client for the local Kino bridge: where it listens, the pairing token, JSON and binary requests,
// a connection hook and the card panels show while the bridge is missing.
//
// Panels run inside Kino's page and cannot reach the machine on their own, so anything that needs a
// process, a file outside the project or a secret goes through the bridge on 127.0.0.1. Everything in a
// panel that does not need those keeps working while the bridge is off: write panels so the gate covers
// only the part that needs it.
import { createElement as h, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { PROJECT_ID as INSTALLED_PROJECT_ID } from './project'
import { ALLOW, MACHINE, MONO_FONT, PAIR_DIALOG, SETUP_BRIDGE, SETUP_BRIDGE_HINT, UI_FONT, UPDATE_BRIDGE, UPDATE_BRIDGE_HINT, YOUR_MACHINE } from './platform'

export const DEFAULT_PORT = 47680
// Device-local keys. Never put the token in panel source or panel settings: both sync to the team.
export const TOKEN_KEY = 'kino-terminal:token'
const PORT_KEY = 'kino-bridge:port'

const stored = (key: string) => {
	try {
		return localStorage.getItem(key)
	} catch {
		return null
	}
}

/** Port the bridge listens on. Matches KINO_TERMINAL_PORT; the offline bridge card has a field to change it. */
export const bridgePort = () => {
	const port = Number(stored(PORT_KEY))
	return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : DEFAULT_PORT
}
export const setBridgePort = (port: number | null) => {
	try {
		if (port && Number.isInteger(port) && port >= 1024 && port <= 65535 && port !== DEFAULT_PORT) localStorage.setItem(PORT_KEY, String(port))
		else localStorage.removeItem(PORT_KEY)
	} catch {}
}
export const bridgeUrl = (path = '') => `http://127.0.0.1:${bridgePort()}${path}`
export const bridgeWsUrl = (path = '') => `ws://127.0.0.1:${bridgePort()}${path}`

export const getToken = () => stored(TOKEN_KEY)
export const setToken = (token: string) => {
	try {
		localStorage.setItem(TOKEN_KEY, token)
	} catch {}
}
export const clearToken = () => {
	try {
		localStorage.removeItem(TOKEN_KEY)
	} catch {}
}

/** The Kino project this panel runs in: the editor URL first, then the id written at install time. */
export const projectId = () => {
	try {
		return new URLSearchParams(window.location.search).get('project') || INSTALLED_PROJECT_ID
	} catch {
		return INSTALLED_PROJECT_ID
	}
}

// ---------- requests ----------
/** status 0: the bridge is not reachable. 401: this device is not paired (or the pairing was revoked). */
export class BridgeError extends Error {
	status: number
	/** The route's JSON reply, for routes that say more than `error`. */
	body: any
	constructor(message: string, status: number, body?: unknown) {
		super(message)
		this.name = 'BridgeError'
		this.status = status
		this.body = body
	}
}

type Init = { method?: string; body?: unknown; signal?: AbortSignal }

const send = async (path: string, init?: Init) => {
	const token = getToken()
	if (!token) throw new BridgeError('Not connected to the bridge.', 401)
	try {
		return await fetch(bridgeUrl(path), {
			method: init?.method ?? 'GET',
			headers: { authorization: `Bearer ${token}`, ...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}) },
			body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
			signal: init?.signal,
		})
	} catch (error) {
		if ((error as { name?: string })?.name === 'AbortError') throw error
		throw new BridgeError('The Kino bridge is not running.', 0)
	}
}

/** JSON request to a token-gated bridge route. Throws BridgeError with the route's own message. */
export const api = async (path: string, init?: Init) => {
	const response = await send(path, init)
	const body = await response.json().catch(() => ({}))
	if (!response.ok) throw new BridgeError(typeof body?.error === 'string' ? body.error : `Request failed (${response.status}).`, response.status, body)
	return body
}

/** Binary response (images, audio) from a token-gated bridge route. */
export const apiBlob = async (path: string, init?: Init) => {
	const response = await send(path, init)
	if (!response.ok) {
		const body = await response.json().catch(() => ({}))
		throw new BridgeError(typeof body?.error === 'string' ? body.error : `Request failed (${response.status}).`, response.status, body)
	}
	return response.blob()
}

export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

// ---------- connection ----------
export type BridgeState = 'checking' | 'ok' | 'offline' | 'outdated' | 'unpaired' | 'pairing'
export type Health = { version: number; features: string[]; platform: string }

const readHealth = async (): Promise<Health> => {
	const body = await fetch(bridgeUrl('/health')).then(response => response.json())
	return { version: Number(body?.version) || 0, features: Array.isArray(body?.features) ? body.features.map(String) : [], platform: String(body?.platform ?? '') }
}

/**
 * Follow the bridge: is it running, does it have what this panel needs, is this device paired.
 * - `needs`: bridge features this panel cannot work without. Missing ones give 'outdated'.
 * - `probe`: an authenticated request that proves the panel's own routes work. Runs after pairing; its
 *   errors land in `note` unless they are connection errors.
 */
export const useBridge = (options: { needs?: string[]; probe?: () => Promise<unknown> } = {}) => {
	const [bridge, setBridge] = useState<BridgeState>('checking')
	const [note, setNote] = useState('')
	const [health, setHealth] = useState<Health | null>(null)
	const optionsRef = useRef(options)
	optionsRef.current = options
	const bridgeRef = useRef(bridge)
	bridgeRef.current = bridge
	const live = useRef(true)
	useEffect(
		() => () => {
			live.current = false
		},
		[],
	)

	const check = useCallback(async () => {
		let info: Health
		try {
			info = await readHealth()
		} catch {
			if (live.current) setBridge('offline')
			return
		}
		if (!live.current) return
		setHealth(info)
		if ((optionsRef.current.needs ?? []).some(feature => !info.features.includes(feature))) return setBridge('outdated')
		if (!getToken()) return setBridge('unpaired')
		try {
			// 'auth' bridges answer a cheap token check; older ones are checked by the panel's own probe
			if (info.features.includes('auth')) await api('/auth')
			await optionsRef.current.probe?.()
			if (!live.current) return
			setBridge('ok')
			setNote('')
		} catch (error) {
			if (!live.current) return
			if (error instanceof BridgeError && error.status === 401) {
				clearToken()
				setBridge('unpaired')
			} else if (error instanceof BridgeError && error.status === 0) setBridge('offline')
			else {
				// the bridge answered: the connection is fine, the panel's own route has something to say
				setBridge('ok')
				setNote(errorText(error))
			}
		}
	}, [])

	useEffect(() => {
		check()
	}, [check])

	// Keep looking while the bridge is away, and look again when the window comes back to the front
	useEffect(() => {
		if (bridge !== 'offline' && bridge !== 'outdated') return
		const timer = setInterval(check, 4000)
		return () => clearInterval(timer)
	}, [bridge, check])
	useEffect(() => {
		const onFocus = () => {
			// not while the pairing dialog is up: a check there would put the panel back on "Connect"
			if (document.visibilityState === 'visible' && bridgeRef.current !== 'pairing') check()
		}
		document.addEventListener('visibilitychange', onFocus)
		return () => document.removeEventListener('visibilitychange', onFocus)
	}, [check])
	// Pairing is per computer: when another panel gets the token, this one should connect without a click
	useEffect(() => {
		if (bridge !== 'unpaired') return
		const timer = setInterval(() => getToken() && check(), 3000)
		return () => clearInterval(timer)
	}, [bridge, check])

	const pair = useCallback(() => {
		setBridge('pairing')
		setNote('')
		fetch(bridgeUrl('/pair'), { method: 'POST' })
			.then(async response => {
				const body = await response.json().catch(() => ({}))
				if (!live.current) return
				if (response.ok && typeof body?.token === 'string') {
					setToken(body.token)
					check()
				} else {
					setBridge('unpaired')
					setNote(typeof body?.error === 'string' ? body.error : `Pairing failed (${response.status}).`)
				}
			})
			.catch(() => live.current && setBridge('offline'))
	}, [check])

	/** Route a caught error: connection errors move the state, everything else comes back as text. */
	const fail = useCallback((error: unknown) => {
		if (error instanceof BridgeError && error.status === 401) {
			clearToken()
			setBridge('unpaired')
		} else if (error instanceof BridgeError && error.status === 0) setBridge('offline')
		return errorText(error)
	}, [])

	const has = useCallback((feature: string) => Boolean(health?.features.includes(feature)), [health])

	return { bridge, ready: bridge === 'ok', note, setNote, health, has, check, pair, fail }
}

// ---------- the card ----------
const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => {})

const Command = ({ text }: { text: string }) => {
	const [copied, setCopied] = useState(false)
	return h(
		'div',
		{ style: { display: 'flex', alignItems: 'stretch', gap: 6 } },
		h(
			'code',
			{ style: { flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 5, background: 'rgba(var(--kp-ink),0.06)', fontFamily: MONO_FONT, fontSize: 11, color: 'var(--kp-text)', userSelect: 'text', wordBreak: 'break-all' } },
			text,
		),
		h(
			'button',
			{
				onClick: () => {
					copy(text)
					setCopied(true)
					setTimeout(() => setCopied(false), 1400)
				},
				style: { padding: '0 9px', borderRadius: 5, border: '1px solid rgba(var(--kp-ink),0.12)', background: 'rgba(var(--kp-ink),0.04)', color: 'rgba(var(--kp-ink),0.75)', fontSize: 11, fontFamily: UI_FONT, cursor: 'pointer', flex: 'none' },
			},
			copied ? 'Copied' : 'Copy',
		),
	)
}

// For people who moved the bridge with KINO_TERMINAL_PORT. Tucked behind a link: almost nobody needs it.
const PortField = ({ onChange }: { onChange: () => void }) => {
	const [open, setOpen] = useState(bridgePort() !== DEFAULT_PORT)
	const [draft, setDraft] = useState(String(bridgePort()))
	const link = { border: 'none', background: 'none', padding: 0, color: 'rgba(var(--kp-ink),0.5)', fontSize: 11, fontFamily: UI_FONT, cursor: 'pointer', textDecoration: 'underline' }
	if (!open) return h('button', { style: link, onClick: () => setOpen(true) }, 'Bridge on another port?')
	const save = () => {
		const port = Number(draft)
		setBridgePort(Number.isInteger(port) ? port : null)
		setDraft(String(bridgePort()))
		onChange()
	}
	return h(
		'label',
		{ style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(var(--kp-ink),0.6)' } },
		'Port',
		h('input', {
			value: draft,
			inputMode: 'numeric',
			onChange: (event: { target: { value: string } }) => setDraft(event.target.value.replace(/\D/g, '').slice(0, 5)),
			onBlur: save,
			onKeyDown: (event: { key: string; stopPropagation: () => void }) => {
				event.stopPropagation()
				if (event.key === 'Enter') save()
			},
			style: { width: 64, height: 22, padding: '0 6px', borderRadius: 4, border: '1px solid rgba(var(--kp-ink),0.18)', background: 'var(--kp-well)', color: 'var(--kp-text)', fontFamily: MONO_FONT, fontSize: 11, outline: 'none' },
		}),
		h('span', null, `default ${DEFAULT_PORT}`),
	)
}

const primary = { height: 28, padding: '0 14px', borderRadius: 5, border: 'none', background: 'var(--kp-text)', color: 'var(--kp-bg)', fontWeight: 600, fontSize: 12, fontFamily: UI_FONT, cursor: 'pointer' }

/** Title and wording for a bridge state. Null when the bridge is fine (or still being checked). */
export const bridgeMessage = (bridge: BridgeState, uses = 'this panel') => {
	if (bridge === 'offline') return { title: 'The Kino bridge is not running', text: `${uses} runs through a small bridge on ${MACHINE}. Set it up once: it then starts with ${YOUR_MACHINE} and this panel connects by itself. ${SETUP_BRIDGE_HINT}`, command: SETUP_BRIDGE, action: 'Retry now' as const }
	if (bridge === 'outdated') return { title: 'Update the Kino bridge', text: `The bridge on ${MACHINE} is older than this panel. ${UPDATE_BRIDGE_HINT}`, command: UPDATE_BRIDGE, action: 'Retry now' as const }
	if (bridge === 'unpaired') return { title: 'Connect this panel', text: `Press Connect, then choose ${ALLOW} in the dialog on ${YOUR_MACHINE}. You do this once per computer, for all panels.`, command: '', action: 'Connect' as const }
	if (bridge === 'pairing') return { title: `Approve on ${YOUR_MACHINE}`, text: `Choose ${ALLOW} in ${PAIR_DIALOG}. It may be behind the Kino window.`, command: '', action: null }
	return null
}

/**
 * What a panel shows in place of the part that needs the bridge. `uses` finishes the sentence
 * "<uses> runs through a small bridge", e.g. "Saving into Kino". `children` is for what still works.
 */
export const BridgeCard = ({ bridge, note, uses, onPair, onRetry, compact, children }: { bridge: BridgeState; note?: string; uses?: string; onPair: () => void; onRetry: () => void; compact?: boolean; children?: ReactNode }) => {
	const message = bridgeMessage(bridge, uses)
	if (!message) return null
	return h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: compact ? 7 : 10, maxWidth: 420, padding: compact ? 10 : 14, borderRadius: 8, border: '1px solid var(--kp-line)', background: 'rgba(var(--kp-ink),0.03)', color: 'rgba(var(--kp-ink),0.7)', fontSize: 12, lineHeight: 1.5, fontFamily: UI_FONT } },
		h('div', { style: { color: 'var(--kp-strong)', fontSize: compact ? 12 : 14, fontWeight: 600 } }, message.title),
		h('div', null, message.text),
		message.command ? h(Command, { text: message.command }) : null,
		note ? h('div', { style: { color: 'var(--kp-red)' } }, note) : null,
		message.action ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } }, h('button', { onClick: message.action === 'Connect' ? onPair : onRetry, style: primary }, message.action), bridge === 'offline' ? h(PortField, { onChange: onRetry }) : null) : null,
		children ? h('div', { style: { borderTop: '1px solid var(--kp-line)', paddingTop: compact ? 7 : 10 } }, children) : null,
	)
}
