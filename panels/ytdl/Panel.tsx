// YT Downloader: paste a link or search YouTube, download through the local Kino bridge
// (yt-dlp via the @kevinwatt/yt-dlp-mcp MCP server), preview the file, then import it into Kino.
// Each download names its file format (video: MP4, MKV, MOV; audio: MP3, M4A, WAV); the bridge converts with ffmpeg.
// Without the bridge the panel still offers Kino desktop's own YouTube import.
// Built with createElement rather than JSX: generated panels currently hit React #31 with JSX.
import { createElement as h, useCallback, useEffect, useRef, useState } from 'react'
import { MediaPreview, runAction, useAvailableActions, usePanelSettings } from 'kino/panel'
import '../theme'
import { IS_MAC, IS_WIN, FILE_MANAGER, SHOW_IN, PICKER_HINT, PICKER_HINT_SHORT, MONO_FONT, UI_FONT as PLATFORM_UI_FONT } from '../platform'
import { api, BridgeCard, bridgeMessage, errorText, useBridge } from '../bridge'

const IMPORT_ACTION = 'library::ImportLocalFiles'
// Kino desktop's built-in importer. It takes no arguments: it opens Kino's own YouTube dialog.
const YOUTUBE_ACTION = 'library::ImportYouTube'
const STYLE_ID = 'kino-ytdl-css'
const UI_FONT = PLATFORM_UI_FONT
const MONO = MONO_FONT
const BG = 'var(--kp-bg)'
const TEXT = 'var(--kp-text)'
const DIM = 'var(--kp-dim)'
const LINE = 'var(--kp-line)'
const RED = 'var(--kp-red)'
const AMBER = 'var(--kp-amber)'

type Kind = 'video' | 'audio' | 'transcript'
type Video = { id: string; title: string; url: string; channel: string | null; duration: number | null; thumbnail: string | null }
type Info = Video & { uploadDate: string | null; views: number | null; width: number | null; height: number | null; isLive: boolean; isUpcoming?: boolean }
type Job = {
	id: string
	url: string
	kind: Kind
	resolution: string
	startTime?: string
	endTime?: string
	language?: string
	status: 'queued' | 'running' | 'done' | 'error' | 'canceled'
	title: string | null
	channel: string | null
	duration: number | null
	thumbnail: string | null
	videoId?: string | null
	startedAt: number | null
	finishedAt: number | null
	bytes: number
	file: string | null
	error: string | null
	format?: string | null
	phase?: string | null
	note?: string | null
}
type FileRow = { name: string; path: string; size: number; mtime: number }
type Tool = { name: string; version: string | null; required: boolean; why: string; install: string }
// `tools` is missing on a bridge from before folder and stop support: those controls hide then.
type Status = { ytdlp?: string | null; downloadsDir?: string; defaultDir?: string; folderError?: string; tools?: Tool[] }

const VIDEO_FORMATS = [
	{ value: 'mp4', label: 'MP4', title: 'Opens almost everywhere. H.264 up to 1080p on most sites; higher resolutions keep the site’s codec.' },
	{ value: 'mkv', label: 'MKV', title: 'Holds any codec, so it never needs re-encoding.' },
	{ value: 'mov', label: 'MOV', title: 'For QuickTime and Final Cut. Above 1080p the picture is usually re-encoded, which takes a while.' },
]
const AUDIO_FORMATS = [
	{ value: 'mp3', label: 'MP3', title: 'Plays everywhere. Converted from the site’s audio.' },
	{ value: 'm4a', label: 'M4A', title: 'AAC. Usually what the site has, so nothing is converted.' },
	{ value: 'wav', label: 'WAV', title: 'Uncompressed. Large files, no quality gained over the source.' },
]
const pick = (list: { value: string }[], value: unknown, fallback: string) => (list.some(item => item.value === value) ? String(value) : fallback)

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
		? new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
		: ''
const fmtAgo = (ms: number) => {
	const minutes = Math.round((Date.now() - ms) / 60000)
	if (minutes < 1) return 'just now'
	if (minutes < 60) return `${minutes} min ago`
	const hours = Math.round(minutes / 60)
	return hours < 24 ? `${hours} h ago` : new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
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
// yt-dlp-mcp puts a UTC timestamp before the extension so names never collide. Nobody needs to read it.
const displayName = (name: string) => name.replace(/ \d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}Z(?=\.\w+$)/, '')
const baseName = (file: string) => file.split(/[\\/]/).pop() ?? file
const tildify = (dir: string) => dir.replace(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/, '~')
const isOver = (job: Job) => job.status === 'done' || job.status === 'error' || job.status === 'canceled'

const electron = () =>
	(window as unknown as {
		electron?: { shell?: { openPath?: (path: string) => unknown }; clipboard?: { writeText?: (text: string) => unknown } }
	}).electron
const copyText = (text: string) => {
	const fallback = () => electron()?.clipboard?.writeText?.(text)
	if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(fallback)
	else fallback()
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
	boxSizing: 'border-box' as const,
}
const notice = {
	margin: '8px 10px 0',
	padding: 10,
	borderRadius: 6,
	border: `1px solid ${LINE}`,
	background: 'rgba(var(--kp-ink),0.03)',
	color: DIM,
	fontSize: 12,
	lineHeight: 1.5,
	display: 'flex',
	flexDirection: 'column' as const,
	gap: 6,
}
// A click must not move keyboard focus onto the button: Space would then press it again instead of playing the timeline.
const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault()

const Btn = (props: { label: string; title?: string; onClick: () => void; disabled?: boolean; style?: object; primary?: boolean }) =>
	h(
		'button',
		{
			className: props.primary ? undefined : 'kino-ytdl-btn',
			title: props.title,
			disabled: props.disabled,
			onMouseDown: keepFocus,
			onClick: (event: { stopPropagation: () => void }) => {
				event.stopPropagation()
				props.onClick()
			},
			style: { ...(props.primary ? primary : button), ...(props.disabled ? { opacity: 0.4, cursor: 'default' } : {}), ...props.style },
		},
		props.label,
	)

const Segmented = (props: { value: string; options: { value: string; label: string; title?: string }[]; onChange: (value: string) => void }) =>
	h(
		'div',
		{ style: { display: 'flex', padding: 2, gap: 2, borderRadius: 6, background: 'rgba(var(--kp-ink),0.05)', flexShrink: 0 } },
		...props.options.map(option =>
			h(
				'button',
				{
					key: option.value,
					title: option.title,
					onMouseDown: keepFocus,
					onClick: () => props.onChange(option.value),
					style: {
						height: 20,
						padding: '0 9px',
						border: 'none',
						borderRadius: 4,
						fontSize: 11,
						fontFamily: UI_FONT,
						cursor: 'pointer',
						whiteSpace: 'nowrap' as const,
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
				maxWidth: '100%',
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
	const [settings, setSettings] = usePanelSettings({ kind: 'video', resolution: '1080p', language: 'en', videoFormat: 'mp4', audioFormat: 'mp3' })
	const kind = (settings.kind as Kind) || 'video'
	// Views saved before formats existed have no value yet
	const videoFormat = pick(VIDEO_FORMATS, settings.videoFormat, 'mp4')
	const audioFormat = pick(AUDIO_FORMATS, settings.audioFormat, 'mp3')
	const actions = useAvailableActions() as readonly { id?: string; enabled?: boolean; isEnabled?: boolean }[] | undefined
	// 'unknown' while Kino has not listed its actions yet: let the click try, a failure is shown.
	const actionState = (id: string) => {
		const list = actions ?? []
		const found = list.find(action => action.id === id)
		if (!found) return list.length ? 'missing' : 'unknown'
		return found.enabled === false || found.isEnabled === false ? 'disabled' : 'ok'
	}
	const importState = actionState(IMPORT_ACTION)
	const importDisabled = importState === 'disabled' || importState === 'missing'
	const kinoYt = actionState(YOUTUBE_ACTION)
	const kinoYtOff = kinoYt === 'missing' || kinoYt === 'disabled'

	const [status, setStatus] = useState<Status>({})
	const { bridge, ready, note, check, pair, fail, has } = useBridge({
		needs: ['ytdl'],
		probe: async () => setStatus(await api('/ytdl/status')),
	})
	const [view, setView] = useState<'find' | 'downloads'>('find')
	const [query, setQuery] = useState('')
	const [search, setSearch] = useState<{ q: string; videos: Video[]; hasMore: boolean; loading: boolean; error: string; done: boolean }>({
		q: '',
		videos: [],
		hasMore: false,
		loading: false,
		error: '',
		done: false,
	})
	const [info, setInfo] = useState<{ url: string; data: Info | null; loading: boolean; error: string } | null>(null)
	const [trim, setTrim] = useState({ start: '', end: '' })
	const [jobs, setJobs] = useState<Job[]>([])
	const [files, setFiles] = useState<FileRow[]>([])
	const [open, setOpen] = useState<string | null>(null)
	const [dirDraft, setDirDraft] = useState<string | null>(null)
	const [stopping, setStopping] = useState<string[]>([])
	const [flash, setFlash] = useState<{ text: string; tone?: 'error' } | null>(null)
	const [, setTick] = useState(0)
	const prevJobs = useRef<Record<string, string>>({})

	const say = useCallback((text: string, tone?: 'error') => setFlash({ text, tone }), [])
	useEffect(() => {
		if (!flash) return
		const timer = setTimeout(() => setFlash(null), flash.tone === 'error' ? 9000 : 5000)
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

	const modern = Array.isArray(status.tools)
	// An older bridge saves whatever yt-dlp picks: hide the choice instead of promising a format
	const canFormat = has('ytdl-formats')
	const format = !canFormat ? undefined : kind === 'video' ? videoFormat : kind === 'audio' ? audioFormat : undefined
	const missing = (status.tools ?? []).filter(tool => !tool.version)
	const noYtdlp = missing.some(tool => tool.required)

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
					if (before && before !== job.status && isOver(job)) {
						finished = true
						if (job.status === 'done') say(`Saved: ${job.title ?? baseName(job.file ?? '')}`)
						else if (job.status === 'error') say(`Failed: ${job.title ?? job.url}`, 'error')
					}
				}
				// The bridge keeps jobs in memory. Active ones that vanish mean it was restarted.
				const lost = Object.entries(prevJobs.current).filter(([id, state]) => (state === 'queued' || state === 'running') && !next.some(job => job.id === id)).length
				if (lost) say(`${lost} download${lost > 1 ? 's' : ''} stopped because the bridge restarted. Start ${lost > 1 ? 'them' : 'it'} again.`, 'error')
				prevJobs.current = Object.fromEntries(next.map(job => [job.id, job.status]))
				setJobs(next)
				setStopping(current => (current.length ? current.filter(id => next.some(job => job.id === id && job.status === 'running')) : current))
				if (finished || lost) refreshFiles()
			})
			.catch(fail)
	}, [fail, refreshFiles, say])

	const active = jobs.filter(job => !isOver(job)).length
	useEffect(() => {
		if (!ready) return
		refreshJobs()
		refreshFiles()
	}, [ready, refreshJobs, refreshFiles])
	useEffect(() => {
		if (!ready) return
		const timer = setInterval(refreshJobs, active ? 1000 : 10000)
		return () => clearInterval(timer)
	}, [ready, active, refreshJobs])
	useEffect(() => {
		if (!active) return
		const timer = setInterval(() => setTick(n => n + 1), 1000)
		return () => clearInterval(timer)
	}, [active])
	useEffect(() => {
		if (view === 'downloads' && ready) refreshFiles()
	}, [view, ready, refreshFiles])

	// ---------- settings kept by the bridge ----------
	const saveConfig = (body: { downloadsDir?: string }, done?: () => void) => {
		api('/ytdl/config', { method: 'POST', body })
			.then(next => {
				setStatus(next)
				done?.()
			})
			.catch(error => say(fail(error), 'error'))
	}

	// ---------- find ----------
	const loadInfo = (url: string) => {
		setInfo({ url, data: null, loading: true, error: '' })
		setTrim({ start: '', end: '' })
		api(`/ytdl/info?url=${encodeURIComponent(url)}`)
			.then(data => setInfo(current => (current?.url === url ? { url, data, loading: false, error: '' } : current)))
			.catch(error => setInfo(current => (current?.url === url ? { url, data: null, loading: false, error: fail(error) } : current)))
	}

	const runSearch = (q: string, offset = 0) => {
		setSearch(current => ({ ...current, q, loading: true, error: '', done: false, ...(offset ? {} : { videos: [], hasMore: false }) }))
		api(`/ytdl/search?q=${encodeURIComponent(q)}&n=12&offset=${offset}`)
			.then(body =>
				setSearch(current =>
					current.q === q
						? { q, videos: offset ? [...current.videos, ...(body.videos ?? [])] : (body.videos ?? []), hasMore: Boolean(body.hasMore), loading: false, error: '', done: true }
						: current,
				),
			)
			.catch(error => setSearch(current => (current.q === q ? { ...current, loading: false, error: fail(error), done: true } : current)))
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

	const dismiss = (body: { id?: string; finished?: boolean }) =>
		api('/ytdl/jobs/dismiss', { method: 'POST', body })
			.then(refreshJobs)
			.catch(() => {})

	const queue = (body: object, label: string) =>
		api('/ytdl/jobs', { method: 'POST', body })
			.then(() => {
				say(label)
				refreshJobs()
			})
			.catch(error => say(fail(error), 'error'))

	const download = (target: { url: string; title?: string | null; channel?: string | null; duration?: number | null; id?: string }, withTrim = false) => {
		const startTime = withTrim && kind === 'video' ? toHms(trim.start) : ''
		const endTime = withTrim && kind === 'video' ? toHms(trim.end) : ''
		if (startTime === null || endTime === null) {
			say('Trim times look like 1:05 or 0:01:05.5', 'error')
			return
		}
		if (startTime && endTime && startTime >= endTime) {
			say('The trim end has to be after its start.', 'error')
			return
		}
		queue(
			{
				url: target.url,
				kind,
				resolution: settings.resolution,
				format,
				language: settings.language || undefined,
				startTime: startTime || undefined,
				endTime: endTime || undefined,
				title: target.title ?? undefined,
				channel: target.channel ?? undefined,
				duration: target.duration ?? undefined,
				videoId: target.id,
			},
			`Queued ${kind === 'video' ? `${settings.resolution} ${format ? `${format.toUpperCase()} ` : ''}video` : kind === 'audio' && format ? `${format.toUpperCase()} audio` : kind}: ${target.title ?? target.url}`,
		)
	}

	const retry = (job: Job) => {
		dismiss({ id: job.id })
		queue(
			{
				url: job.url,
				kind: job.kind,
				resolution: job.resolution,
				format: job.format ?? undefined,
				language: job.language,
				startTime: job.startTime,
				endTime: job.endTime,
				title: job.title ?? undefined,
				channel: job.channel ?? undefined,
				duration: job.duration ?? undefined,
				videoId: job.videoId ?? undefined,
			},
			`Queued again: ${job.title ?? job.url}`,
		)
	}

	const stop = (job: Job) => {
		if (job.status === 'running') setStopping(current => [...current, job.id])
		api('/ytdl/jobs/cancel', { method: 'POST', body: { id: job.id } })
			.then(refreshJobs)
			.catch(error => {
				setStopping(current => current.filter(id => id !== job.id))
				say(fail(error), 'error')
			})
	}

	// ---------- Kino's own importer ----------
	const kinoImport = (link?: string) => {
		const url = link?.trim() ? toUrl(link.trim()) : ''
		if (url) copyText(url)
		runAction(YOUTUBE_ACTION, {}, { source: 'button' })
			.then(() => say(url ? 'Kino’s YouTube import is open. The link is copied: paste it there.' : 'Kino’s YouTube import is open.'))
			.catch((error: unknown) => say(`Kino’s YouTube import did not open: ${errorText(error)}`, 'error'))
	}

	// ---------- file actions ----------
	const importFile = (file: string) => {
		copyText(file)
		runAction(IMPORT_ACTION, {}, { source: 'button' })
			.then(() => say(`Path copied. ${PICKER_HINT}`))
			.catch((error: unknown) => say(`Kino’s import picker did not open: ${errorText(error)}. The path is copied.`, 'error'))
	}
	const reveal = (file?: string) => {
		api('/ytdl/reveal', { method: 'POST', body: file ? { path: file } : {} }).catch(error => say(fail(error), 'error'))
	}

	// ---------- render: shared ----------
	const kindLabel = kind === 'video' ? `Download ${settings.resolution === 'best' ? 'best' : settings.resolution}` : kind === 'audio' ? 'Download audio' : 'Get transcript'

	const codeLine = (text: string) =>
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'stretch', gap: 6 } },
			h(
				'code',
				{ style: { flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 5, background: 'rgba(var(--kp-ink),0.06)', fontFamily: MONO, fontSize: 11, color: TEXT, userSelect: 'text' as const, wordBreak: 'break-all' as const } },
				text,
			),
			Btn({ label: 'Copy', onClick: () => (copyText(text), say('Copied.')), style: { height: 'auto' } }),
		)

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
							? 'Kino’s import picker is not available here. Use Copy path, then add the file in Kino.'
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

	// What Kino can do alone. Shown inside the bridge card, and when yt-dlp is missing.
	const kinoBlock = h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
		h('div', { style: { color: 'var(--kp-strong)', fontWeight: 600 } }, 'Works without it: Kino’s own YouTube import'),
		h(
			'div',
			null,
			'Kino desktop can download a YouTube video straight into the media library. The bridge adds the rest: resolution choice, audio only, transcripts, trimmed clips, search and sites other than YouTube.',
		),
		h(
			'div',
			{ style: { display: 'flex', gap: 6, flexWrap: 'wrap' as const } },
			h('input', {
				value: query,
				placeholder: 'YouTube link (optional)',
				onChange: (event: { target: { value: string } }) => setQuery(event.target.value),
				onKeyDown: (event: { key: string }) => {
					if (event.key === 'Enter' && !kinoYtOff) kinoImport(query)
				},
				style: { ...input, flex: '1 1 160px' },
			}),
			Btn({
				label: 'Import with Kino',
				title: 'Opens Kino’s YouTube import. A link typed here is copied so you can paste it.',
				disabled: kinoYtOff,
				onClick: () => kinoImport(query),
				style: { height: 26 },
			}),
		),
		kinoYtOff ? h('div', { style: { color: AMBER } }, 'Kino’s YouTube import is only in the Kino desktop app, with a project open.') : null,
	)

	// ---------- render: find ----------
	const optionsRow = h(
		'div',
		{ style: { display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px 8px', flexWrap: 'wrap' as const } },
		Segmented({
			value: kind,
			options: [
				{ value: 'video', label: 'Video' },
				{ value: 'audio', label: 'Audio', title: 'Audio only' },
				{ value: 'transcript', label: 'Transcript', title: 'The subtitles as a text file' },
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
						{ value: 'best', label: 'Best', title: 'The highest resolution the site has, 4K included' },
					],
					onChange: value => setSettings(previous => ({ ...previous, resolution: value })),
				})
			: null,
		kind === 'video' && canFormat
			? Segmented({ value: videoFormat, options: VIDEO_FORMATS, onChange: value => setSettings(previous => ({ ...previous, videoFormat: value })) })
			: null,
		kind === 'audio' && canFormat
			? Segmented({ value: audioFormat, options: AUDIO_FORMATS, onChange: value => setSettings(previous => ({ ...previous, audioFormat: value })) })
			: null,
		kind === 'transcript'
			? h('input', {
					value: settings.language,
					title: 'Subtitle language code, like en, es, ja or pt-BR',
					placeholder: 'en',
					onChange: (event: { target: { value: string } }) => setSettings(previous => ({ ...previous, language: event.target.value.trim().slice(0, 8) })),
					style: { ...input, height: 22, width: 56, fontSize: 11, textAlign: 'center' as const },
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
				{ style: { margin: '4px 10px 10px', padding: 10, borderRadius: 6, background: 'rgba(252,165,165,0.07)', color: RED, fontSize: 12, lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: 6 } },
				h('div', { style: { wordBreak: 'break-word' as const } }, info.error || 'Could not read that link.'),
				h('div', { style: { display: 'flex', gap: 6 } }, Btn({ label: 'Try again', onClick: () => loadInfo(info.url) }), Btn({ label: 'Clear', onClick: () => setInfo(null) })),
			)
		const data = info.data
		const meta = [data.channel, fmtDur(data.duration), fmtViews(data.views), fmtDate(data.uploadDate), data.height ? `${data.height}p source` : '']
			.filter(Boolean)
			.join('  ·  ')
		// A stream that is still running would record until it ends, and one that has not started has nothing to save.
		const blocked = data.isLive ? 'This is live right now. Download it after the stream ends.' : data.isUpcoming ? 'This video has not started yet.' : ''
		return h(
			'div',
			{ style: { margin: '2px 10px 10px', padding: 10, borderRadius: 8, background: 'rgba(var(--kp-ink),0.04)', border: `1px solid ${LINE}` } },
			h(
				'div',
				{ style: { display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' as const } },
				Thumb({ src: data.thumbnail, width: 168, badge: data.isLive ? 'LIVE' : fmtDur(data.duration) }),
				h(
					'div',
					{ style: { flex: '1 1 180px', minWidth: 0 } },
					h('div', { style: { ...clamp2, color: 'var(--kp-strong)', fontSize: 13, fontWeight: 600, lineHeight: 1.35 } }, data.title || data.url),
					h('div', { style: { marginTop: 4, color: DIM, fontSize: 11, lineHeight: 1.4 } }, meta),
					kind === 'video' && !blocked
						? h(
								'div',
								{ style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, color: DIM, fontSize: 11 } },
								h('span', { title: 'Download only part of the video. Needs ffmpeg and takes longer, because the cut is re-encoded.' }, 'Trim'),
								h('input', {
									value: trim.start,
									placeholder: '0:00',
									title: 'Start, like 1:05 (empty: the beginning)',
									onChange: (event: { target: { value: string } }) => setTrim(current => ({ ...current, start: event.target.value })),
									style: { ...input, height: 22, width: 64, fontFamily: MONO, fontSize: 11 },
								}),
								'to',
								h('input', {
									value: trim.end,
									placeholder: fmtDur(data.duration) || 'end',
									title: 'End, like 2:30 (empty: the end)',
									onChange: (event: { target: { value: string } }) => setTrim(current => ({ ...current, end: event.target.value })),
									style: { ...input, height: 22, width: 64, fontFamily: MONO, fontSize: 11 },
								}),
							)
						: null,
					blocked ? h('div', { style: { marginTop: 8, color: AMBER, fontSize: 11, lineHeight: 1.4 } }, blocked) : null,
					h(
						'div',
						{ style: { display: 'flex', gap: 6, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' as const } },
						Btn({
							primary: true,
							label: kindLabel,
							disabled: Boolean(blocked),
							onClick: () => download({ url: data.url, title: data.title, channel: data.channel, duration: data.duration, id: data.id }, true),
						}),
						kinoYt === 'ok' && /youtu\.?be/i.test(data.url)
							? Btn({
									label: 'Import with Kino',
									title: 'Kino’s own YouTube import: the full video, straight into the media library. The link is copied so you can paste it.',
									onClick: () => kinoImport(data.url),
									style: { height: 26 },
								})
							: null,
						Btn({ label: 'Clear', onClick: () => setInfo(null), style: { height: 26 } }),
					),
				),
			),
		)
	}

	const resultRow = (video: Video, index: number) =>
		h(
			'div',
			{
				key: `${video.id}-${index}`,
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

	// Tools the bridge could not find: which one, what it is for, how to install it on this system.
	const toolNotices = missing.map(tool =>
		h(
			'div',
			{ key: tool.name, style: { ...notice, borderColor: tool.required ? 'rgba(252,165,165,0.35)' : LINE } },
			h('div', { style: { color: tool.required ? RED : AMBER, fontWeight: 600 } }, `${tool.name} is not installed`),
			h('div', null, `${tool.why} Install it in a terminal:`),
			codeLine(tool.install),
			h(
				'div',
				{ style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const } },
				Btn({ label: 'Check again', onClick: check }),
				h(
					'span',
					{ style: { fontSize: 11, flex: '1 1 160px' } },
					IS_WIN ? 'On Windows, restart the bridge first so it sees the new program: npm run service -- restart' : 'Installed somewhere unusual? npm run doctor in the panels folder shows where the bridge looks.',
				),
			),
		),
	)
	const folderNotice = status.folderError
		? h(
				'div',
				{ style: { ...notice, borderColor: 'rgba(252,165,165,0.35)' } },
				h('div', { style: { color: RED, wordBreak: 'break-word' as const } }, status.folderError),
				modern ? h('div', null, Btn({ label: 'Change folder', onClick: () => (setView('downloads'), setDirDraft(status.downloadsDir ?? '')) })) : null,
			)
		: null
	const probeNotice = note ? h('div', { style: { ...notice, color: RED } }, note, h('div', null, Btn({ label: 'Check again', onClick: check }))) : null

	const findView = h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } },
		h(
			'div',
			{ style: { display: 'flex', gap: 6, padding: '10px 10px 8px' } },
			h('input', {
				value: query,
				placeholder: 'Paste a link or search YouTube',
				onChange: (event: { target: { value: string } }) => setQuery(event.target.value),
				onKeyDown: (event: { key: string }) => {
					if (event.key === 'Enter' && !noYtdlp) submit()
				},
				style: { ...input, flex: 1 },
			}),
			Btn({ primary: true, label: looksLikeUrl(query.trim()) ? 'Open' : 'Search', onClick: submit, disabled: !query.trim() || noYtdlp }),
		),
		optionsRow,
		h(
			'div',
			{ className: 'kino-ytdl-scroll', style: { flex: 1, minHeight: 0, overflowY: 'auto' as const, borderTop: `1px solid ${LINE}`, paddingBottom: 8 } },
			probeNotice,
			...toolNotices,
			folderNotice,
			noYtdlp ? h('div', { style: notice }, kinoBlock) : null,
			h('div', { style: { height: 8 } }),
			infoCard(),
			search.videos.length ? h('div', { style: { padding: '2px 12px 4px', color: DIM, fontSize: 11 } }, `Results for “${search.q}”`) : null,
			...search.videos.map(resultRow),
			search.loading ? h('div', { style: { padding: '10px 12px', color: DIM, fontSize: 12 } }, 'Searching…') : null,
			search.error
				? h(
						'div',
						{ style: { padding: '10px 12px', color: RED, fontSize: 12, lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: 6 } },
						search.error,
						h('div', null, Btn({ label: 'Try again', onClick: () => runSearch(search.q) })),
					)
				: null,
			search.done && !search.loading && !search.error && !search.videos.length
				? h('div', { style: { padding: '10px 12px', color: DIM, fontSize: 12 } }, `No results for “${search.q}”.`)
				: null,
			search.hasMore && !search.loading
				? h('div', { style: { padding: '6px 10px 12px' } }, Btn({ label: 'More results', onClick: () => runSearch(search.q, search.videos.length) }))
				: null,
			!info && !search.videos.length && !search.loading && !search.error && !search.done && !noYtdlp
				? h(
						'div',
						{ style: { padding: '10px 14px', color: DIM, fontSize: 12, lineHeight: 1.6 } },
						h('div', { style: { color: TEXT, fontWeight: 600, marginBottom: 4 } }, 'Find something to download'),
						'Paste a link from YouTube (or Vimeo, X, TikTok and most video sites) to see details and trim, or type keywords to search YouTube. ',
						'Files land in ',
						h('span', { style: { fontFamily: MONO, color: TEXT } }, tildify(status.downloadsDir ?? '~/Downloads/Kino YouTube')),
						'. From there, Import… brings one into Kino.',
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
				? `${job.resolution === 'best' ? 'Best' : job.resolution}${job.format ? ` ${job.format.toUpperCase()}` : ''} video${job.startTime || job.endTime ? `, ${job.startTime?.replace(/^00:/, '') ?? 'start'} to ${job.endTime?.replace(/^00:/, '') ?? 'end'}` : ''}`
				: job.kind === 'audio'
					? `${job.format ? `${job.format.toUpperCase()} ` : ''}audio`.replace(/^a/, 'A')
					: 'Transcript'
		const elapsed = job.startedAt ? fmtDur((Date.now() - job.startedAt) / 1000) : ''
		const halting = stopping.includes(job.id)
		const line =
			job.status === 'queued'
				? `${what}  ·  waiting`
				: job.status === 'running'
					? `${what}  ·  ${halting ? 'stopping' : job.phase === 'converting' ? `making ${(job.format ?? '').toUpperCase()}` : job.bytes ? fmtBytes(job.bytes) : 'starting'}  ·  ${elapsed}`
					: job.status === 'done'
						? `${what}  ·  ${fmtBytes(job.bytes)}  ·  ${fmtAgo(job.finishedAt ?? Date.now())}`
						: job.status === 'canceled'
							? `${what}  ·  stopped`
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
					h('div', { style: { ...clamp2, color: TEXT, fontSize: 12, lineHeight: 1.35, wordBreak: 'break-word' as const } }, job.title ?? job.url),
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
					job.status === 'done' && job.note ? h('div', { style: { marginTop: 4, color: AMBER, fontSize: 11, lineHeight: 1.4, wordBreak: 'break-word' as const } }, job.note) : null,
					job.status === 'done' && job.file ? fileActions(job.file) : null,
					modern && !isOver(job)
						? h(
								'div',
								{ style: { display: 'flex', gap: 4, marginTop: 6 } },
								Btn({
									label: job.status === 'queued' ? 'Cancel' : halting ? 'Stopping…' : 'Stop',
									title: job.status === 'queued' ? 'Take it out of the queue' : 'Stop this download and delete the unfinished file',
									disabled: halting,
									onClick: () => stop(job),
								}),
							)
						: null,
					job.status === 'error' || job.status === 'canceled'
						? h('div', { style: { display: 'flex', gap: 4, marginTop: 6 } }, Btn({ label: job.status === 'error' ? 'Retry' : 'Start again', onClick: () => retry(job) }))
						: null,
				),
				isOver(job)
					? h(
							'button',
							{
								title: 'Remove from list (keeps the file)',
								onMouseDown: keepFocus,
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

	const saveDir = (value: string) =>
		saveConfig({ downloadsDir: value }, () => {
			setDirDraft(null)
			refreshFiles()
			say(value ? 'Downloads folder changed.' : 'Back to the default downloads folder.')
		})
	const dirEditor =
		dirDraft !== null
			? h(
					'div',
					{ style: { display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderBottom: `1px solid ${LINE}`, color: DIM, fontSize: 11, lineHeight: 1.45 } },
					'New downloads go to this folder on this computer. Files already downloaded stay where they are.',
					h(
						'div',
						{ style: { display: 'flex', gap: 6, flexWrap: 'wrap' as const } },
						h('input', {
							value: dirDraft,
							autoFocus: true,
							placeholder: status.defaultDir ?? 'Full path of a folder',
							onChange: (event: { target: { value: string } }) => setDirDraft(event.target.value),
							onKeyDown: (event: { key: string }) => {
								if (event.key === 'Enter' && dirDraft.trim()) saveDir(dirDraft.trim())
								if (event.key === 'Escape') setDirDraft(null)
							},
							style: { ...input, flex: '1 1 200px', fontFamily: MONO, fontSize: 11 },
						}),
						Btn({ primary: true, label: 'Save', disabled: !dirDraft.trim(), onClick: () => saveDir(dirDraft.trim()), style: { height: 26, lineHeight: '26px' } }),
						status.defaultDir && status.downloadsDir !== status.defaultDir ? Btn({ label: 'Use default', title: status.defaultDir, onClick: () => saveDir(''), style: { height: 26 } }) : null,
						Btn({ label: 'Cancel', onClick: () => setDirDraft(null), style: { height: 26 } }),
					),
				)
			: null

	const downloadsView = h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } },
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: `1px solid ${LINE}` } },
			h(
				'span',
				{
					title: `${status.downloadsDir ?? ''}\nClick to open the folder in ${FILE_MANAGER}`,
					onClick: () => reveal(),
					style: { flex: 1, minWidth: 0, color: DIM, fontSize: 11, fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, cursor: 'pointer' },
				},
				tildify(status.downloadsDir ?? ''),
			),
			modern && dirDraft === null ? Btn({ label: 'Change', title: 'Pick another downloads folder', onClick: () => setDirDraft(status.downloadsDir ?? '') }) : null,
			jobs.some(isOver) ? Btn({ label: 'Clear finished', title: 'Empties this list. The files stay in the folder.', onClick: () => dismiss({ finished: true }) }) : null,
			Btn({ label: 'Refresh', onClick: () => (refreshJobs(), refreshFiles()) }),
		),
		dirEditor,
		h(
			'div',
			{ className: 'kino-ytdl-scroll', style: { flex: 1, minHeight: 0, overflowY: 'auto' as const } },
			folderNotice,
			...jobs.map(jobRow),
			looseFiles.length
				? h('div', { style: { padding: '10px 12px 4px', color: DIM, fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 0.4 } }, 'In the folder')
				: null,
			...looseFiles.map(fileRow),
			!jobs.length && !looseFiles.length
				? h('div', { style: { padding: '18px 14px', color: DIM, fontSize: 12, lineHeight: 1.6 } }, 'Nothing downloaded yet. Find a video on the Find tab and press Download.')
				: null,
		),
	)

	// ---------- render: bridge away ----------
	const awayView = h(
		'div',
		{ className: 'kino-ytdl-scroll', style: { flex: 1, minHeight: 0, overflowY: 'auto' as const, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center' } },
		bridge === 'checking'
			? h('div', { style: { color: DIM, fontSize: 12, padding: 6 } }, 'Looking for the Kino bridge…')
			: h(BridgeCard, { bridge, note, uses: 'Downloading with yt-dlp', onPair: pair, onRetry: check }, kinoBlock),
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
			title: ready ? `Bridge connected. yt-dlp ${status.ytdlp ?? 'not found'}` : (bridgeMessage(bridge)?.title ?? 'Looking for the Kino bridge'),
			style: { width: 7, height: 7, borderRadius: '50%', background: ready && missing.length ? 'var(--kp-yellow)' : dot, flexShrink: 0 },
		}),
		h('span', { style: { color: TEXT, fontSize: 12, fontWeight: 600, marginRight: 'auto', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 } }, 'YT Downloader'),
		ready
			? Segmented({
					value: view,
					options: [
						{ value: 'find', label: 'Find' },
						{ value: 'downloads', label: active ? `Downloads · ${active}` : jobs.length ? `Downloads (${jobs.length})` : 'Downloads' },
					],
					onChange: value => setView(value as 'find' | 'downloads'),
				})
			: null,
	)

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
						wordBreak: 'break-word' as const,
					},
				},
				flash.text,
			)
		: null

	return h(
		'div',
		{
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
				colorScheme: 'var(--kp-scheme)',
			},
		},
		header,
		!ready ? awayView : view === 'find' ? findView : downloadsView,
		toast,
	)
}
