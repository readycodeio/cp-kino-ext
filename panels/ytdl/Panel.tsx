// YT Downloader: paste a link or search YouTube, download through the local Kino bridge
// (yt-dlp via the @kevinwatt/yt-dlp-mcp MCP server), preview the file, then import it into Kino.
// Built with createElement rather than JSX: generated panels currently hit React #31 with JSX.
import { createElement as h, useCallback, useEffect, useRef, useState } from 'react'
import { MediaPreview, runAction, useAvailableActions, usePanelSettings } from 'kino/panel'
import '../theme'
import { IS_MAC, MACHINE, YOUR_MACHINE, FILE_MANAGER, SHOW_IN, PAIR_DIALOG, ALLOW, START_BRIDGE, START_BRIDGE_HINT, PICKER_HINT, PICKER_HINT_SHORT, MONO_FONT, UI_FONT as PLATFORM_UI_FONT } from '../platform'

const BRIDGE = 'http://127.0.0.1:47680'
const TOKEN_KEY = 'kino-terminal:token' // shared with the Terminal panel, device-local, never in panel source or settings
const IMPORT_ACTION = 'library::ImportLocalFiles'
const STYLE_ID = 'kino-ytdl-css'
const UI_FONT = PLATFORM_UI_FONT
const MONO = MONO_FONT
const BG = 'var(--kp-bg)'
const TEXT = 'var(--kp-text)'
const DIM = 'var(--kp-dim)'
const LINE = 'var(--kp-line)'
const RED = 'var(--kp-red)'

type Kind = 'video' | 'audio' | 'transcript'
type BridgeState = 'checking' | 'ok' | 'offline' | 'outdated' | 'unpaired' | 'pairing'
type Video = { id: string; title: string; url: string; channel: string | null; duration: number | null; thumbnail: string | null }
type Info = Video & { uploadDate: string | null; views: number | null; width: number | null; height: number | null; isLive: boolean }
type Job = {
	id: string
	url: string
	kind: Kind
	resolution: string
	startTime?: string
	endTime?: string
	status: 'queued' | 'running' | 'done' | 'error'
	title: string | null
	channel: string | null
	duration: number | null
	thumbnail: string | null
	startedAt: number | null
	finishedAt: number | null
	bytes: number
	file: string | null
	error: string | null
}
type FileRow = { name: string; path: string; size: number; mtime: number }

class BridgeError extends Error {
	status: number
	constructor(message: string, status: number) {
		super(message)
		this.status = status
	}
}

const api = async (path: string, init?: { method?: string; body?: unknown }) => {
	const token = localStorage.getItem(TOKEN_KEY)
	if (!token) throw new BridgeError('Not connected.', 401)
	let response: Response
	try {
		response = await fetch(BRIDGE + path, {
			method: init?.method ?? 'GET',
			headers: {
				authorization: `Bearer ${token}`,
				...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}),
			},
			body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
		})
	} catch {
		throw new BridgeError('The Kino bridge is not running.', 0)
	}
	const body = await response.json().catch(() => ({}))
	if (!response.ok) throw new BridgeError(typeof body.error === 'string' ? body.error : `Request failed (${response.status}).`, response.status)
	return body
}

// ---------- formatting ----------
const pad = (n: number) => String(n).padStart(2, '0')
const fmtDur = (seconds: number | null | undefined) => {
	if (seconds == null || !Number.isFinite(seconds)) return ''
	const s = Math.round(seconds)
	const hours = Math.floor(s / 3600)
	const minutes = Math.floor((s % 3600) / 60)
	return hours ? `${hours}:${pad(minutes)}:${pad(s % 60)}` : `${minutes}:${pad(s % 60)}`
}
const fmtBytes = (bytes: number) =>
	bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`
const fmtViews = (n: number | null) => (n == null ? '' : `${new Intl.NumberFormat('en', { notation: 'compact' }).format(n)} views`)
const fmtDate = (d: string | null) =>
	d && /^\d{8}$/.test(d)
		? new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
		: ''
const fmtAgo = (ms: number) => {
	const minutes = Math.round((Date.now() - ms) / 60000)
	if (minutes < 1) return 'just now'
	if (minutes < 60) return `${minutes} min ago`
	const hours = Math.round(minutes / 60)
	return hours < 24 ? `${hours} h ago` : new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
/** "1:05", "65", "0:01:05.5" -> "00:01:05" / "00:01:05.500"; "" -> ""; invalid -> null */
const toHms = (text: string) => {
	const value = text.trim()
	if (!value) return ''
	const parts = value.split(':')
	if (parts.length > 3 || parts.some(part => part === '' || !/^\d+(\.\d+)?$/.test(part))) return null
	const total = parts.map(Number).reduce((acc, n) => acc * 60 + n, 0)
	const hours = Math.floor(total / 3600)
	const minutes = Math.floor((total % 3600) / 60)
	const seconds = total - hours * 3600 - minutes * 60
	const ms = Math.round((seconds % 1) * 1000)
	return `${pad(hours)}:${pad(minutes)}:${pad(Math.floor(seconds))}${ms ? `.${String(ms).padStart(3, '0')}` : ''}`
}
const looksLikeUrl = (text: string) => /^https?:\/\//i.test(text) || /^(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(text)
const toUrl = (text: string) => (/^https?:\/\//i.test(text) ? text : `https://${text}`)
const mediaKindOf = (name: string) =>
	/\.(mp4|webm|mkv|mov)$/i.test(name) ? 'video' : /\.(m4a|mp3|opus|ogg|wav|aac|flac)$/i.test(name) ? 'audio' : 'text'
const displayName = (name: string) => name.replace(/ \d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}Z(?=\.\w+$)/, '')
const baseName = (file: string) => file.split('/').pop() ?? file
const tildify = (dir: string) => dir.replace(/^\/Users\/[^/]+/, '~')

const electron = () =>
	(window as unknown as {
		electron?: { shell?: { openPath?: (path: string) => unknown }; clipboard?: { writeText?: (text: string) => unknown } }
	}).electron
const copyText = (text: string) => {
	navigator.clipboard?.writeText(text).catch(() => electron()?.clipboard?.writeText?.(text))
}

const ensureCss = () => {
	if (document.getElementById(STYLE_ID)) return
	const style = document.createElement('style')
	style.id = STYLE_ID
	style.textContent =
		'@keyframes kino-ytdl-slide{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}' +
		'.kino-ytdl-row:hover{background:rgba(var(--kp-ink),0.035)}' +
		'.kino-ytdl-btn:hover{background:rgba(var(--kp-ink),0.09)!important;color:var(--kp-strong)!important}' +
		'.kino-ytdl-scroll::-webkit-scrollbar{width:8px}.kino-ytdl-scroll::-webkit-scrollbar-thumb{background:rgba(var(--kp-ink),0.1);border-radius:4px}'
	document.head.appendChild(style)
}

// ---------- small UI pieces ----------
const button = {
	height: 22,
	padding: '0 8px',
	border: '1px solid rgba(var(--kp-ink),0.1)',
	borderRadius: 5,
	background: 'rgba(var(--kp-ink),0.04)',
	color: 'rgba(var(--kp-ink),0.78)',
	fontSize: 11,
	fontFamily: UI_FONT,
	cursor: 'pointer',
	lineHeight: '20px',
	flexShrink: 0,
	whiteSpace: 'nowrap' as const,
}
const primary = { ...button, height: 26, padding: '0 12px', background: TEXT, color: BG, border: 'none', fontWeight: 600, fontSize: 12, lineHeight: '26px' }
const input = {
	height: 26,
	padding: '0 8px',
	borderRadius: 5,
	border: '1px solid rgba(var(--kp-ink),0.14)',
	background: 'var(--kp-well)',
	color: TEXT,
	fontFamily: UI_FONT,
	fontSize: 12,
	outline: 'none',
	minWidth: 0,
}

const Btn = (props: { label: string; title?: string; onClick: () => void; disabled?: boolean; style?: object; primary?: boolean }) =>
	h(
		'button',
		{
			className: props.primary ? undefined : 'kino-ytdl-btn',
			title: props.title,
			disabled: props.disabled,
			onClick: (event: { stopPropagation: () => void }) => {
				event.stopPropagation()
				props.onClick()
			},
			style: { ...(props.primary ? primary : button), ...(props.disabled ? { opacity: 0.4, cursor: 'default' } : {}), ...props.style },
		},
		props.label,
	)

const Segmented = (props: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) =>
	h(
		'div',
		{ style: { display: 'flex', padding: 2, gap: 2, borderRadius: 6, background: 'rgba(var(--kp-ink),0.05)', flexShrink: 0 } },
		...props.options.map(option =>
			h(
				'button',
				{
					key: option.value,
					onClick: () => props.onChange(option.value),
					style: {
						height: 20,
						padding: '0 9px',
						border: 'none',
						borderRadius: 4,
						fontSize: 11,
						fontFamily: UI_FONT,
						cursor: 'pointer',
						background: props.value === option.value ? 'rgba(var(--kp-ink),0.14)' : 'transparent',
						color: props.value === option.value ? 'var(--kp-strong)' : DIM,
						fontWeight: props.value === option.value ? 600 : 400,
					},
				},
				option.label,
			),
		),
	)

const Thumb = (props: { src: string | null; width: number; badge?: string }) =>
	h(
		'div',
		{
			style: {
				position: 'relative',
				width: props.width,
				aspectRatio: '16 / 9',
				borderRadius: 5,
				overflow: 'hidden',
				background: 'rgba(var(--kp-ink),0.06)',
				flexShrink: 0,
			},
		},
		props.src
			? h('img', {
					src: props.src,
					alt: '',
					loading: 'lazy',
					referrerPolicy: 'no-referrer',
					onError: (event: { currentTarget: HTMLImageElement }) => (event.currentTarget.style.display = 'none'),
					style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
				})
			: null,
		props.badge
			? h(
					'span',
					{
						style: {
							position: 'absolute',
							right: 3,
							bottom: 3,
							padding: '0 4px',
							borderRadius: 3,
							background: 'rgba(0,0,0,0.8)',
							color: '#fff',
							fontSize: 10,
							lineHeight: '15px',
							fontFamily: UI_FONT,
						},
					},
					props.badge,
				)
			: null,
	)

const clamp2 = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }

// ---------- panel ----------
export default function YtDownloaderPanel() {
	const [settings, setSettings] = usePanelSettings({ kind: 'video', resolution: '1080p', language: 'en' })
	const kind = (settings.kind as Kind) || 'video'
	const actions = useAvailableActions()
	const importAction = (actions ?? []).find(action => (action as { id?: string }).id === IMPORT_ACTION) as
		| { enabled?: boolean; isEnabled?: boolean }
		| undefined
	const importDisabled = importAction ? importAction.enabled === false || importAction.isEnabled === false : false

	const rootRef = useRef<HTMLDivElement | null>(null)
	const [bridge, setBridge] = useState<BridgeState>('checking')
	const [bridgeNote, setBridgeNote] = useState('')
	const [status, setStatus] = useState<{ ytdlp?: string | null; downloadsDir?: string }>({})
	const [view, setView] = useState<'find' | 'downloads'>('find')
	const [query, setQuery] = useState('')
	const [search, setSearch] = useState<{ q: string; videos: Video[]; hasMore: boolean; loading: boolean; error: string }>({
		q: '',
		videos: [],
		hasMore: false,
		loading: false,
		error: '',
	})
	const [info, setInfo] = useState<{ url: string; data: Info | null; loading: boolean; error: string } | null>(null)
	const [trim, setTrim] = useState({ start: '', end: '' })
	const [jobs, setJobs] = useState<Job[]>([])
	const [files, setFiles] = useState<FileRow[]>([])
	const [open, setOpen] = useState<string | null>(null)
	const [flash, setFlash] = useState<{ text: string; tone?: 'error' } | null>(null)
	const [, setTick] = useState(0)
	const prevJobs = useRef<Record<string, string>>({})

	const say = useCallback((text: string, tone?: 'error') => setFlash({ text, tone }), [])
	useEffect(() => {
		if (!flash) return
		const timer = setTimeout(() => setFlash(null), flash.tone === 'error' ? 8000 : 5000)
		return () => clearTimeout(timer)
	}, [flash])

	useEffect(ensureCss, [])

	// Keep typing out of Kino's editor shortcuts (space, J/K/L, delete, ...). These are React handlers on the root,
	// so the field's own handlers (Enter to search) run first; a native listener here would swallow them.
	const isolate = (event: { target: unknown; metaKey?: boolean; key?: string; stopPropagation: () => void }) => {
		const target = event.target as HTMLElement | null
		if (!target || !/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
		if (IS_MAC && event.metaKey && typeof event.key === 'string' && !['a', 'c', 'v', 'x', 'z', 'enter'].includes(event.key.toLowerCase())) return
		event.stopPropagation()
	}

	// ---------- bridge ----------
	const check = useCallback(async () => {
		try {
			const health = await fetch(`${BRIDGE}/health`).then(response => response.json())
			if (!Array.isArray(health.features) || !health.features.includes('ytdl')) {
				setBridge('outdated')
				return
			}
		} catch {
			setBridge('offline')
			return
		}
		if (!localStorage.getItem(TOKEN_KEY)) {
			setBridge('unpaired')
			return
		}
		try {
			setStatus(await api('/ytdl/status'))
			setBridge('ok')
			setBridgeNote('')
		} catch (error) {
			setBridge(error instanceof BridgeError && error.status === 401 ? 'unpaired' : 'offline')
		}
	}, [])

	useEffect(() => {
		check()
	}, [check])

	useEffect(() => {
		if (bridge !== 'offline' && bridge !== 'outdated') return
		const timer = setInterval(check, 4000)
		return () => clearInterval(timer)
	}, [bridge, check])

	const pair = () => {
		setBridge('pairing')
		setBridgeNote('')
		fetch(`${BRIDGE}/pair`, { method: 'POST' })
			.then(async response => {
				const body = await response.json().catch(() => ({}))
				if (response.ok && typeof body.token === 'string') {
					localStorage.setItem(TOKEN_KEY, body.token)
					check()
				} else {
					setBridge('unpaired')
					setBridgeNote(typeof body.error === 'string' ? body.error : `Pairing failed (${response.status}).`)
				}
			})
			.catch(() => setBridge('offline'))
	}

	const fail = useCallback(
		(error: unknown) => {
			if (error instanceof BridgeError && (error.status === 0 || error.status === 401)) {
				setBridge(error.status === 401 ? 'unpaired' : 'offline')
				return ''
			}
			return error instanceof Error ? error.message : String(error)
		},
		[],
	)

	// ---------- jobs + files ----------
	const refreshFiles = useCallback(() => {
		api('/ytdl/files')
			.then(body => setFiles(body.files ?? []))
			.catch(() => {})
	}, [])

	const refreshJobs = useCallback(() => {
		api('/ytdl/jobs')
			.then(body => {
				const next: Job[] = body.jobs ?? []
				let finished = false
				for (const job of next) {
					const before = prevJobs.current[job.id]
					if (before && before !== job.status && (job.status === 'done' || job.status === 'error')) {
						finished = true
						if (job.status === 'done') say(`Saved: ${job.title ?? baseName(job.file ?? '')}`)
						else say(`Failed: ${job.title ?? job.url}`, 'error')
					}
				}
				prevJobs.current = Object.fromEntries(next.map(job => [job.id, job.status]))
				setJobs(next)
				if (finished) refreshFiles()
			})
			.catch(fail)
	}, [fail, refreshFiles, say])

	const active = jobs.filter(job => job.status === 'queued' || job.status === 'running').length
	useEffect(() => {
		if (bridge !== 'ok') return
		refreshJobs()
		refreshFiles()
	}, [bridge, refreshJobs, refreshFiles])
	useEffect(() => {
		if (bridge !== 'ok') return
		const timer = setInterval(refreshJobs, active ? 1000 : 10000)
		return () => clearInterval(timer)
	}, [bridge, active, refreshJobs])
	useEffect(() => {
		if (!active) return
		const timer = setInterval(() => setTick(n => n + 1), 1000)
		return () => clearInterval(timer)
	}, [active])
	useEffect(() => {
		if (view === 'downloads' && bridge === 'ok') refreshFiles()
	}, [view, bridge, refreshFiles])

	// ---------- find ----------
	const loadInfo = (url: string) => {
		setInfo({ url, data: null, loading: true, error: '' })
		setTrim({ start: '', end: '' })
		api(`/ytdl/info?url=${encodeURIComponent(url)}`)
			.then(data => setInfo(current => (current?.url === url ? { url, data, loading: false, error: '' } : current)))
			.catch(error => setInfo(current => (current?.url === url ? { url, data: null, loading: false, error: fail(error) } : current)))
	}

	const runSearch = (q: string, offset = 0) => {
		setSearch(current => ({ ...current, q, loading: true, error: '', ...(offset ? {} : { videos: [], hasMore: false }) }))
		api(`/ytdl/search?q=${encodeURIComponent(q)}&n=12&offset=${offset}`)
			.then(body =>
				setSearch(current =>
					current.q === q
						? { q, videos: offset ? [...current.videos, ...body.videos] : body.videos, hasMore: body.hasMore, loading: false, error: '' }
						: current,
				),
			)
			.catch(error => setSearch(current => (current.q === q ? { ...current, loading: false, error: fail(error) } : current)))
	}

	const submit = () => {
		const text = query.trim()
		if (!text) return
		if (looksLikeUrl(text)) loadInfo(toUrl(text))
		else {
			setInfo(null)
			runSearch(text)
		}
	}

	const download = (target: { url: string; title?: string | null; channel?: string | null; duration?: number | null; id?: string }, withTrim = false) => {
		const startTime = withTrim && kind === 'video' ? toHms(trim.start) : ''
		const endTime = withTrim && kind === 'video' ? toHms(trim.end) : ''
		if (startTime === null || endTime === null) {
			say('Trim times look like 1:05 or 0:01:05.5', 'error')
			return
		}
		api('/ytdl/jobs', {
			method: 'POST',
			body: {
				url: target.url,
				kind,
				resolution: settings.resolution,
				language: settings.language || undefined,
				startTime: startTime || undefined,
				endTime: endTime || undefined,
				title: target.title ?? undefined,
				channel: target.channel ?? undefined,
				duration: target.duration ?? undefined,
				videoId: target.id,
			},
		})
			.then(() => {
				say(`Queued ${kind === 'video' ? `${settings.resolution} video` : kind}: ${target.title ?? target.url}`)
				refreshJobs()
			})
			.catch(error => {
				const message = fail(error)
				if (message) say(message, 'error')
			})
	}

	// ---------- file actions ----------
	const importFile = (file: string) => {
		copyText(file)
		runAction(IMPORT_ACTION, {}, { source: 'button' })
			.then(() => say(`Path copied. ${PICKER_HINT}`))
			.catch((error: unknown) => say(`Import picker failed: ${error instanceof Error ? error.message : String(error)}. Path copied instead.`, 'error'))
	}
	const reveal = (file?: string) => {
		api('/ytdl/reveal', { method: 'POST', body: file ? { path: file } : {} }).catch(error => {
			const message = fail(error)
			if (message) say(message, 'error')
		})
	}
	const dismiss = (body: { id?: string; finished?: boolean }) =>
		api('/ytdl/jobs/dismiss', { method: 'POST', body })
			.then(refreshJobs)
			.catch(() => {})

	// ---------- render: shared ----------
	const kindLabel = kind === 'video' ? `Download ${settings.resolution === 'best' ? 'best' : settings.resolution}` : kind === 'audio' ? 'Download audio' : 'Get transcript'

	const fileActions = (file: string, extra?: unknown) => {
		const mk = mediaKindOf(file)
		return h(
			'div',
			{ style: { display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginTop: 6 } },
			mk !== 'text'
				? Btn({ label: open === file ? 'Hide' : 'Preview', title: 'Play it here without importing', onClick: () => setOpen(open === file ? null : file) })
				: electron()?.shell?.openPath
					? Btn({ label: 'Open', title: 'Open in the default app', onClick: () => electron()?.shell?.openPath?.(file) })
					: null,
			mk !== 'text'
				? Btn({
						label: 'Import…',
						title: importDisabled
							? 'Kino’s import picker is not available in this layout. Use Copy path.'
							: `Opens Kino’s file picker and copies the path. ${PICKER_HINT_SHORT}`,
						disabled: importDisabled,
						onClick: () => importFile(file),
					})
				: null,
			Btn({ label: FILE_MANAGER, title: SHOW_IN, onClick: () => reveal(file) }),
			Btn({ label: 'Copy path', onClick: () => (copyText(file), say('Path copied.')) }),
			extra ?? null,
		)
	}

	const previewFor = (file: string) =>
		open === file
			? h(
					'div',
					{ style: { marginTop: 8, borderRadius: 6, overflow: 'hidden', maxWidth: 480 } },
					h(MediaPreview, { key: file, src: file, alt: displayName(baseName(file)), title: mediaKindOf(file) }),
				)
			: null

	// ---------- render: find ----------
	const optionsRow = h(
		'div',
		{ style: { display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px 8px', flexWrap: 'wrap' as const } },
		Segmented({
			value: kind,
			options: [
				{ value: 'video', label: 'Video' },
				{ value: 'audio', label: 'Audio' },
				{ value: 'transcript', label: 'Transcript' },
			],
			onChange: value => setSettings(previous => ({ ...previous, kind: value })),
		}),
		kind === 'video'
			? Segmented({
					value: settings.resolution,
					options: [
						{ value: '480p', label: '480p' },
						{ value: '720p', label: '720p' },
						{ value: '1080p', label: '1080p' },
						{ value: 'best', label: 'Best' },
					],
					onChange: value => setSettings(previous => ({ ...previous, resolution: value })),
				})
			: null,
		kind === 'transcript'
			? h('input', {
					value: settings.language,
					title: 'Subtitle language code, e.g. en, pl, ja',
					placeholder: 'en',
					onChange: (event: { target: { value: string } }) => setSettings(previous => ({ ...previous, language: event.target.value.trim().slice(0, 8) })),
					style: { ...input, height: 22, width: 52, fontSize: 11, textAlign: 'center' as const },
				})
			: null,
	)

	const infoCard = () => {
		if (!info) return null
		if (info.loading)
			return h('div', { style: { padding: '14px 12px', color: DIM, fontSize: 12 } }, 'Reading video details…')
		if (info.error || !info.data)
			return h(
				'div',
				{ style: { margin: '4px 10px 10px', padding: 10, borderRadius: 6, background: 'rgba(252,165,165,0.07)', color: RED, fontSize: 12, lineHeight: 1.45 } },
				info.error || 'Could not read that link.',
			)
		const data = info.data
		const meta = [data.channel, fmtDur(data.duration), fmtViews(data.views), fmtDate(data.uploadDate), data.height ? `${data.height}p source` : '']
			.filter(Boolean)
			.join('  ·  ')
		return h(
			'div',
			{ style: { margin: '2px 10px 10px', padding: 10, borderRadius: 8, background: 'rgba(var(--kp-ink),0.04)', border: `1px solid ${LINE}` } },
			h(
				'div',
				{ style: { display: 'flex', gap: 10, alignItems: 'flex-start' } },
				Thumb({ src: data.thumbnail, width: 168, badge: data.isLive ? 'LIVE' : fmtDur(data.duration) }),
				h(
					'div',
					{ style: { flex: 1, minWidth: 0 } },
					h('div', { style: { ...clamp2, color: 'var(--kp-strong)', fontSize: 13, fontWeight: 600, lineHeight: 1.35 } }, data.title),
					h('div', { style: { marginTop: 4, color: DIM, fontSize: 11, lineHeight: 1.4 } }, meta),
					kind === 'video'
						? h(
								'div',
								{ style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, color: DIM, fontSize: 11 } },
								'Trim',
								h('input', {
									value: trim.start,
									placeholder: '0:00',
									title: 'Start, e.g. 1:05 (leave empty for the beginning)',
									onChange: (event: { target: { value: string } }) => setTrim(current => ({ ...current, start: event.target.value })),
									style: { ...input, height: 22, width: 64, fontFamily: MONO, fontSize: 11 },
								}),
								'to',
								h('input', {
									value: trim.end,
									placeholder: fmtDur(data.duration) || 'end',
									title: 'End, e.g. 2:30 (leave empty for the end)',
									onChange: (event: { target: { value: string } }) => setTrim(current => ({ ...current, end: event.target.value })),
									style: { ...input, height: 22, width: 64, fontFamily: MONO, fontSize: 11 },
								}),
							)
						: null,
					h(
						'div',
						{ style: { display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' } },
						Btn({
							primary: true,
							label: kindLabel,
							onClick: () => download({ url: data.url, title: data.title, channel: data.channel, duration: data.duration, id: data.id }, true),
						}),
						Btn({ label: 'Clear', onClick: () => setInfo(null) }),
					),
				),
			),
		)
	}

	const resultRow = (video: Video) =>
		h(
			'div',
			{
				key: video.id,
				className: 'kino-ytdl-row',
				title: 'Click for details and trimming',
				onClick: () => loadInfo(video.url),
				style: { display: 'flex', gap: 10, padding: '6px 10px', alignItems: 'center', cursor: 'pointer' },
			},
			Thumb({ src: video.thumbnail, width: 112, badge: fmtDur(video.duration) }),
			h(
				'div',
				{ style: { flex: 1, minWidth: 0 } },
				h('div', { style: { ...clamp2, color: TEXT, fontSize: 12, lineHeight: 1.35 } }, video.title),
				h('div', { style: { marginTop: 3, color: DIM, fontSize: 11 } }, video.channel ?? ''),
			),
			Btn({ label: '↓', title: kindLabel, onClick: () => download(video), style: { width: 28, padding: 0, fontSize: 13 } }),
		)

	const findView = h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } },
		h(
			'div',
			{ style: { display: 'flex', gap: 6, padding: '10px 10px 8px' } },
			h('input', {
				value: query,
				autoFocus: true,
				placeholder: 'Paste a link or search YouTube',
				onChange: (event: { target: { value: string } }) => setQuery(event.target.value),
				onKeyDown: (event: { key: string }) => {
					if (event.key === 'Enter') submit()
				},
				style: { ...input, flex: 1 },
			}),
			Btn({ primary: true, label: looksLikeUrl(query.trim()) ? 'Open' : 'Search', onClick: submit, disabled: !query.trim() }),
		),
		optionsRow,
		h(
			'div',
			{ className: 'kino-ytdl-scroll', style: { flex: 1, minHeight: 0, overflowY: 'auto' as const, borderTop: `1px solid ${LINE}`, paddingTop: 8 } },
			infoCard(),
			search.videos.length ? h('div', { style: { padding: '2px 12px 4px', color: DIM, fontSize: 11 } }, `Results for “${search.q}”`) : null,
			...search.videos.map(resultRow),
			search.loading ? h('div', { style: { padding: '10px 12px', color: DIM, fontSize: 12 } }, 'Searching…') : null,
			search.error ? h('div', { style: { padding: '10px 12px', color: RED, fontSize: 12 } }, search.error) : null,
			search.hasMore && !search.loading
				? h('div', { style: { padding: '6px 10px 12px' } }, Btn({ label: 'More results', onClick: () => runSearch(search.q, search.videos.length) }))
				: null,
			!info && !search.videos.length && !search.loading && !search.error
				? h(
						'div',
						{ style: { padding: '18px 14px', color: DIM, fontSize: 12, lineHeight: 1.6 } },
						h('div', { style: { color: TEXT, fontWeight: 600, marginBottom: 4 } }, 'Find something to download'),
						'Paste a YouTube (or Vimeo, X, TikTok…) link to see details and trim, or type keywords to search YouTube. ',
						'Files land in ',
						h('span', { style: { fontFamily: MONO, color: TEXT } }, tildify(status.downloadsDir ?? '~/Downloads/Kino YouTube')),
						'.',
					)
				: null,
		),
	)

	// ---------- render: downloads ----------
	const jobFiles = new Set(jobs.map(job => job.file).filter(Boolean) as string[])
	const looseFiles = files.filter(file => !jobFiles.has(file.path))

	const jobRow = (job: Job) => {
		const what =
			job.kind === 'video'
				? `${job.resolution === 'best' ? 'Best' : job.resolution} video${job.startTime || job.endTime ? `, ${job.startTime?.replace(/^00:/, '') ?? 'start'} to ${job.endTime?.replace(/^00:/, '') ?? 'end'}` : ''}`
				: job.kind === 'audio'
					? 'Audio'
					: 'Transcript'
		const elapsed = job.startedAt ? fmtDur((Date.now() - job.startedAt) / 1000) : ''
		const line =
			job.status === 'queued'
				? `${what}  ·  waiting`
				: job.status === 'running'
					? `${what}  ·  ${job.bytes ? fmtBytes(job.bytes) : 'starting'}  ·  ${elapsed}`
					: job.status === 'done'
						? `${what}  ·  ${fmtBytes(job.bytes)}  ·  ${fmtAgo(job.finishedAt ?? Date.now())}`
						: what
		return h(
			'div',
			{ key: job.id, style: { padding: '8px 10px', borderBottom: `1px solid ${LINE}` } },
			h(
				'div',
				{ style: { display: 'flex', gap: 10, alignItems: 'flex-start' } },
				Thumb({ src: job.thumbnail, width: 96, badge: fmtDur(job.duration) }),
				h(
					'div',
					{ style: { flex: 1, minWidth: 0 } },
					h('div', { style: { ...clamp2, color: TEXT, fontSize: 12, lineHeight: 1.35 } }, job.title ?? job.url),
					h('div', { style: { marginTop: 3, color: job.status === 'error' ? RED : DIM, fontSize: 11 } }, line),
					job.status === 'running' || job.status === 'queued'
						? h(
								'div',
								{ style: { position: 'relative', height: 3, marginTop: 6, borderRadius: 2, overflow: 'hidden', background: 'rgba(var(--kp-ink),0.08)' } },
								job.status === 'running'
									? h('div', {
											style: { position: 'absolute', inset: 0, width: '40%', background: 'var(--kp-muted)', animation: 'kino-ytdl-slide 1.2s ease-in-out infinite' },
										})
									: null,
							)
						: null,
					job.status === 'error' ? h('div', { style: { marginTop: 4, color: RED, fontSize: 11, lineHeight: 1.4, wordBreak: 'break-word' as const } }, job.error) : null,
					job.status === 'done' && job.file ? fileActions(job.file) : null,
					job.status === 'error'
						? h(
								'div',
								{ style: { display: 'flex', gap: 4, marginTop: 6 } },
								Btn({
									label: 'Retry',
									onClick: () => {
										dismiss({ id: job.id })
										api('/ytdl/jobs', {
											method: 'POST',
											body: { url: job.url, kind: job.kind, resolution: job.resolution, startTime: job.startTime, endTime: job.endTime, title: job.title ?? undefined },
										})
											.then(refreshJobs)
											.catch(error => say(fail(error) || 'Retry failed.', 'error'))
									},
								}),
							)
						: null,
				),
				job.status === 'done' || job.status === 'error'
					? h(
							'button',
							{
								title: 'Remove from list (keeps the file)',
								onClick: () => dismiss({ id: job.id }),
								style: { border: 'none', background: 'transparent', color: DIM, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2 },
							},
							'×',
						)
					: null,
			),
			job.file ? previewFor(job.file) : null,
		)
	}

	const fileRow = (file: FileRow) =>
		h(
			'div',
			{ key: file.path, style: { padding: '8px 12px', borderBottom: `1px solid ${LINE}` } },
			h('div', { style: { color: TEXT, fontSize: 12, lineHeight: 1.35, wordBreak: 'break-word' as const } }, displayName(file.name)),
			h('div', { style: { marginTop: 2, color: DIM, fontSize: 11 } }, `${fmtBytes(file.size)}  ·  ${fmtAgo(file.mtime)}`),
			fileActions(file.path),
			previewFor(file.path),
		)

	const downloadsView = h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } },
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: `1px solid ${LINE}` } },
			h(
				'span',
				{
					title: 'Open the downloads folder',
					onClick: () => reveal(),
					style: { flex: 1, minWidth: 0, color: DIM, fontSize: 11, fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, cursor: 'pointer' },
				},
				tildify(status.downloadsDir ?? ''),
			),
			jobs.some(job => job.status === 'done' || job.status === 'error') ? Btn({ label: 'Clear finished', onClick: () => dismiss({ finished: true }) }) : null,
			Btn({ label: 'Refresh', onClick: () => (refreshJobs(), refreshFiles()) }),
		),
		h(
			'div',
			{ className: 'kino-ytdl-scroll', style: { flex: 1, minHeight: 0, overflowY: 'auto' as const } },
			...jobs.map(jobRow),
			looseFiles.length
				? h('div', { style: { padding: '10px 12px 4px', color: DIM, fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 0.4 } }, 'In the folder')
				: null,
			...looseFiles.map(fileRow),
			!jobs.length && !looseFiles.length
				? h('div', { style: { padding: '18px 14px', color: DIM, fontSize: 12 } }, 'Nothing downloaded yet.')
				: null,
		),
	)

	// ---------- render: chrome ----------
	const dot = { ok: 'var(--kp-green-2)', checking: 'var(--kp-muted)', pairing: 'var(--kp-yellow)', unpaired: 'var(--kp-yellow)', outdated: 'var(--kp-yellow)', offline: 'var(--kp-red-2)' }[bridge]
	const header = h(
		'div',
		{
			style: {
				display: 'flex',
				alignItems: 'center',
				gap: 8,
				height: 34,
				padding: '0 8px 0 10px',
				borderBottom: `1px solid ${LINE}`,
				flexShrink: 0,
				userSelect: 'none' as const,
			},
		},
		h('span', {
			title: bridge === 'ok' ? `Bridge connected · yt-dlp ${status.ytdlp ?? '?'}` : bridge,
			style: { width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 },
		}),
		h('span', { style: { color: TEXT, fontSize: 12, fontWeight: 600, marginRight: 'auto' } }, 'YT Downloader'),
		Segmented({
			value: view,
			options: [
				{ value: 'find', label: 'Find' },
				{ value: 'downloads', label: active ? `Downloads · ${active}` : jobs.length ? `Downloads (${jobs.length})` : 'Downloads' },
			],
			onChange: value => setView(value as 'find' | 'downloads'),
		}),
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
					fontFamily: MONO,
					fontSize: 11,
					color: TEXT,
					userSelect: 'text' as const,
					wordBreak: 'break-all' as const,
				},
			},
			text,
		)

	const overlayCard = (title: string, body: unknown, action?: { label: string; onClick: () => void }) =>
		h(
			'div',
			{ style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(var(--kp-bg-rgb),0.96)' } },
			h(
				'div',
				{ style: { maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 10, color: 'rgba(var(--kp-ink),0.7)', fontSize: 12, lineHeight: 1.5 } },
				h('div', { style: { color: 'var(--kp-strong)', fontSize: 14, fontWeight: 600 } }, title),
				body,
				bridgeNote ? h('div', { style: { color: RED } }, bridgeNote) : null,
				action ? h('div', null, Btn({ primary: true, label: action.label, onClick: action.onClick })) : null,
			),
		)

	const overlay =
		bridge === 'checking'
			? overlayCard('Connecting…', h('div', null, `Looking for the Kino bridge on ${MACHINE}.`))
			: bridge === 'unpaired'
				? overlayCard(
						'Connect to the Kino bridge',
						h(
							'div',
							null,
							`Downloads run through the same local bridge as the Terminal panel. Click Connect, then choose ${ALLOW} in ${PAIR_DIALOG}. If the Terminal panel is already connected, this one is too.`,
						),
						{ label: 'Connect', onClick: pair },
					)
				: bridge === 'pairing'
					? overlayCard(`Approve on ${YOUR_MACHINE}`, h('div', null, `Choose ${ALLOW} in ${PAIR_DIALOG}. It may be behind the Kino window.`))
					: bridge === 'outdated'
						? overlayCard(
								'Restart the bridge',
								h(
									'div',
									{ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
									h('div', null, `The bridge running now predates YouTube support. Stop it (Ctrl+C in the window running it) and start it again. ${START_BRIDGE_HINT}`),
									code(START_BRIDGE),
									h('div', null, 'This panel reconnects by itself.'),
								),
								{ label: 'Check again', onClick: check },
							)
						: bridge === 'offline'
							? overlayCard(
									'Kino bridge is not running',
									h(
										'div',
										{ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
										h('div', null, `${START_BRIDGE_HINT} This panel reconnects by itself.`),
										code(START_BRIDGE),
									),
									{ label: 'Check again', onClick: check },
								)
							: null

	const toast = flash
		? h(
				'div',
				{
					onClick: () => setFlash(null),
					style: {
						position: 'absolute',
						left: 10,
						right: 10,
						bottom: 10,
						padding: '8px 10px',
						borderRadius: 6,
						background: flash.tone === 'error' ? 'var(--kp-error-bg)' : 'var(--kp-toast)',
						border: `1px solid ${flash.tone === 'error' ? 'rgba(252,165,165,0.3)' : 'rgba(var(--kp-ink),0.1)'}`,
						color: flash.tone === 'error' ? RED : TEXT,
						fontSize: 12,
						lineHeight: 1.4,
						boxShadow: '0 6px 20px var(--kp-shadow)',
						cursor: 'pointer',
					},
				},
				flash.text,
			)
		: null

	return h(
		'div',
		{
			ref: rootRef,
			onKeyDown: isolate,
			onKeyUp: isolate,
			onKeyPress: isolate,
			onCopy: isolate,
			onCut: isolate,
			onPaste: isolate,
			style: {
				position: 'relative',
				display: 'flex',
				flexDirection: 'column',
				width: '100%',
				height: '100%',
				minHeight: 0,
				background: BG,
				color: TEXT,
				fontFamily: UI_FONT,
				overflow: 'hidden',
			},
		},
		header,
		view === 'find' ? findView : downloadsView,
		overlay,
		toast,
	)
}
