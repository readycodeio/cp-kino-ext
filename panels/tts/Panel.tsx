// Voiceover: ElevenLabs text to speech inside Kino, Studio style.
// Pick a voice (your configured default first), write with ElevenLabs syntax, generate a few takes, audition them,
// then put the one you like on the timeline at the playhead or into the library.
// Speech runs through the local Kino bridge, which hands it to a separate worker process: the
// ElevenLabs key never reaches this panel or the bridge itself.
// Built with createElement rather than JSX: generated panels currently hit React #31 with JSX.
import { Component, createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFps, useRemotionPlayer, useTimelinePosition } from 'kino/panel'
import { cssVar, useKinoTheme } from '../theme'
import { IS_MAC, IS_WIN, MACHINE, YOUR_MACHINE, SHOW_IN, PAIR_DIALOG, ALLOW, MOD_ENTER, START_BRIDGE, START_BRIDGE_HINT, MONO_FONT, UI_FONT as PLATFORM_UI_FONT } from '../platform'

const BRIDGE = 'http://127.0.0.1:47680'
const TOKEN_KEY = 'kino-terminal:token' // shared with the Terminal and YT Downloader panels, device-local
const PREFS_KEY = 'kino-voiceover:prefs'
const DRAFT_KEY = 'kino-voiceover:draft'
const HIDDEN_KEY = 'kino-voiceover:hidden'
const STYLE_ID = 'kino-vo-css'
const DEFAULT_MODEL = 'eleven_v4'
const MODEL_ORDER = [
	'eleven_v4',
	'eleven_v4_turbo',
	'eleven_v3',
	'eleven_v3_conversational',
	'eleven_multilingual_v2',
	'eleven_flash_v2_5',
	'eleven_turbo_v2_5',
	'eleven_flash_v2',
	'eleven_turbo_v2',
]
const PHONEME_MODELS = ['eleven_flash_v2', 'eleven_turbo_v2', 'eleven_monolingual_v1']
const FORMATS = [
	{ value: 'mp3_44100_192', label: 'MP3 44.1 kHz, 192 kbps' },
	{ value: 'mp3_44100_128', label: 'MP3 44.1 kHz, 128 kbps' },
	{ value: 'mp3_44100_96', label: 'MP3 44.1 kHz, 96 kbps' },
	{ value: 'mp3_22050_32', label: 'MP3 22 kHz, 32 kbps' },
	{ value: 'wav_48000', label: 'WAV 48 kHz' },
	{ value: 'wav_44100', label: 'WAV 44.1 kHz' },
	{ value: 'wav_24000', label: 'WAV 24 kHz' },
	{ value: 'wav_22050', label: 'WAV 22 kHz' },
	{ value: 'wav_16000', label: 'WAV 16 kHz' },
	{ value: 'opus_48000_192', label: 'Opus 48 kHz, 192 kbps' },
	{ value: 'opus_48000_128', label: 'Opus 48 kHz, 128 kbps' },
]
const BATCH_PAGE = 12

const UI_FONT = PLATFORM_UI_FONT
const MONO = MONO_FONT
const BG = 'var(--kp-bg)'
const TEXT = 'var(--kp-text)'
const DIM = 'var(--kp-dim)'
const FAINT = 'rgba(var(--kp-ink),0.3)'
const LINE = 'var(--kp-line)'
const RED = 'var(--kp-red)'
const AMBER = 'var(--kp-amber)'

type BridgeState = 'checking' | 'ok' | 'offline' | 'outdated' | 'unpaired' | 'pairing' | 'nokey'
type Voice = {
	id: string
	name: string
	category: string
	labels: Record<string, string> | null
	description: string | null
	previewUrl: string | null
	fineTuned: string[]
	settings: Record<string, number | boolean> | null
}
type Model = {
	id: string
	name: string
	description: string | null
	canUseStyle: boolean
	canUseSpeakerBoost: boolean
	maxChars: number | null
	costFactor: number
	languages: { id: string; name: string }[]
}
type Req = { [key: string]: any }
type Take = {
	file: string
	name: string
	mtime: number
	duration: number | null
	voiceId: string | null
	voiceName: string | null
	modelId: string | null
	outputFormat: string | null
	characters: number | null
	characterCost: number | null
	seed: number | null
	created: string | null
	batch: string
	take: number
	takes: number
	source: string
	mediaId: string | null
	request: Req | null
	error?: string
}
type Quota = { tier: string | null; used: number; limit: number; resetUnix: number | null }
type Dict = { id: string; versionId: string; name: string; rules?: number | null; description?: string | null }
type Fx = { id: string; name: string; description?: string | null }
type Effects = { filters: Fx[]; environments: Fx[]; noises: Fx[] }
type VS = { stability: number | null; similarity: number | null; style: number | null; speed: number | null; boost: boolean | null; clone: number | null }
type Adv = {
	seed: string
	language: string
	normalization: string
	format: string
	name: string
	previous: string
	next: string
	dicts: string[]
	filter: string
	environment: string
	sendLevel: number
	noise: string
	distance: number | null
	pan: number
	pvcAsIvc: boolean
}
type Prefs = { voiceId: string; modelId: string; takes: number; vsByVoice: Record<string, VS>; adv: Adv; chips: string }
type Pending = { text: string; takes: number; startedAt: number; voiceName: string; modelId: string }

const EMPTY_VS: VS = { stability: null, similarity: null, style: null, speed: null, boost: null, clone: null }
const DEFAULT_ADV: Adv = {
	seed: '',
	language: '',
	normalization: 'auto',
	format: 'mp3_44100_192',
	name: '',
	previous: '',
	next: '',
	dicts: [],
	filter: '',
	environment: '',
	sendLevel: 0.3,
	noise: '',
	distance: null,
	pan: 0,
	pvcAsIvc: false,
}

class BridgeError extends Error {
	status: number
	body: Req
	constructor(message: string, status: number, body: Req = {}) {
		super(message)
		this.status = status
		this.body = body
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
	if (!response.ok) throw new BridgeError(typeof body.error === 'string' ? body.error : `Request failed (${response.status}).`, response.status, body)
	return body
}

const apiBlob = async (path: string) => {
	const token = localStorage.getItem(TOKEN_KEY)
	if (!token) throw new BridgeError('Not connected.', 401)
	let response: Response
	try {
		response = await fetch(BRIDGE + path, { headers: { authorization: `Bearer ${token}` } })
	} catch {
		throw new BridgeError('The Kino bridge is not running.', 0)
	}
	if (!response.ok) {
		const body = await response.json().catch(() => ({}))
		throw new BridgeError(typeof body.error === 'string' ? body.error : `Audio request failed (${response.status}).`, response.status, body)
	}
	return response.blob()
}

// ---------- audio cache: blob URL + waveform peaks per file ----------
type Loaded = { url: string; peaks: number[]; duration: number }
const audioCache = new Map<string, Promise<Loaded>>()
const PEAKS = 160
const loadAudio = (key: string, path: string): Promise<Loaded> => {
	const hit = audioCache.get(key)
	if (hit) return hit
	const entry = apiBlob(path).then(async blob => {
		const url = URL.createObjectURL(blob)
		let peaks: number[] = []
		let duration = 0
		try {
			const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await blob.arrayBuffer())
			duration = buffer.duration
			const data = buffer.getChannelData(0)
			const step = Math.max(1, Math.floor(data.length / PEAKS))
			for (let i = 0; i < PEAKS; i++) {
				let max = 0
				const end = Math.min(data.length, (i + 1) * step)
				for (let j = i * step; j < end; j += 2) {
					const value = Math.abs(data[j])
					if (value > max) max = value
				}
				peaks.push(max)
			}
			const top = Math.max(0.01, ...peaks)
			peaks = peaks.map(value => Math.sqrt(value / top))
		} catch {
			peaks = []
		}
		return { url, peaks, duration }
	})
	entry.catch(() => audioCache.delete(key))
	audioCache.set(key, entry)
	if (audioCache.size > 80) {
		const oldest = audioCache.keys().next().value as string
		const stale = audioCache.get(oldest)
		audioCache.delete(oldest)
		stale?.then(item => URL.revokeObjectURL(item.url)).catch(() => {})
	}
	return entry
}
const audioPath = (file: string) => `/tts/audio?file=${encodeURIComponent(file)}`

// ---------- helpers ----------
const readJson = (key: string, fallback: any) => {
	try {
		const value = JSON.parse(localStorage.getItem(key) ?? 'null')
		return value ?? fallback
	} catch {
		return fallback
	}
}
const writeJson = (key: string, value: unknown) => {
	try {
		localStorage.setItem(key, JSON.stringify(value))
	} catch {}
}
const drop = (object: Req) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ''))
const plain = (text: unknown) => (typeof text === 'string' ? text.replace(/\s*[\u2014\u2013]\s*/g, ', ') : '')
const pad = (n: number) => String(n).padStart(2, '0')
const fmtInt = (n: number) => new Intl.NumberFormat('en').format(Math.round(n))
const fmtSec = (seconds: number | null | undefined) => {
	if (seconds == null || !Number.isFinite(seconds)) return ''
	if (seconds < 60) return `${seconds.toFixed(1)}s`
	const s = Math.round(seconds)
	return `${Math.floor(s / 60)}:${pad(s % 60)}`
}
const fmtTc = (frame: number | null | undefined, fps: number | null | undefined) => {
	if (frame == null || !fps) return '--:--'
	const whole = Math.floor(frame / fps)
	const f = Math.round(frame - whole * fps)
	const hours = Math.floor(whole / 3600)
	const minutes = Math.floor((whole % 3600) / 60)
	return `${hours ? `${hours}:${pad(minutes)}` : pad(minutes)}:${pad(whole % 60)}:${pad(f)}`
}
const fmtAgo = (ms: number) => {
	if (!Number.isFinite(ms)) return ''
	const minutes = Math.round((Date.now() - ms) / 60000)
	if (minutes < 1) return 'just now'
	if (minutes < 60) return `${minutes} min ago`
	const hours = Math.round(minutes / 60)
	return hours < 24 ? `${hours} h ago` : new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
const whenOf = (take: Take) => {
	const parsed = take.created ? Date.parse(take.created) : NaN
	return Number.isFinite(parsed) ? parsed : take.mtime
}
const tildify = (dir: string) => dir.replace(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/, '~')
const projectIdFromUrl = () => new URLSearchParams(window.location.search).get('project') ?? ''
const isTagModel = (id: string) => /^eleven_v[34]/.test(id)
const isV4 = (id: string) => id.startsWith('eleven_v4')
const isV3Only = (id: string) => id.startsWith('eleven_v3')
const shortModel = (name: string) => plain(name).replace(/^Eleven\s+/i, '')
const labelOf = (value: string) => value.replace(/_/g, ' ')
const CATEGORY: Record<string, string> = { professional: 'Professional clone', cloned: 'Instant clone', generated: 'Designed voice', premade: 'Default voice' }

const ensureCss = () => {
	if (document.getElementById(STYLE_ID)) return
	const style = document.createElement('style')
	style.id = STYLE_ID
	style.textContent =
		'@keyframes kino-vo-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}' +
		'.kino-vo-btn:hover{background:rgba(var(--kp-ink),0.09)!important;color:var(--kp-strong)!important}' +
		'.kino-vo-chip:hover{background:rgba(var(--kp-ink),0.1)!important;color:var(--kp-strong)!important}' +
		'.kino-vo-take:hover{background:rgba(var(--kp-ink),0.025)}' +
		'.kino-vo-ta::placeholder{color:rgba(var(--kp-ink),0.3)}' +
		'.kino-vo-ta::selection{background:rgba(147,197,253,0.32);color:transparent}' +
		'.kino-vo-range{accent-color:var(--kp-text);height:14px;margin:0;cursor:pointer}' +
		'.kino-vo-scroll::-webkit-scrollbar{width:8px}.kino-vo-scroll::-webkit-scrollbar-thumb{background:rgba(var(--kp-ink),0.1);border-radius:4px}'
	document.head.appendChild(style)
}

// ---------- syntax ----------
type Seg = { text: string; kind?: string }
const SEG_STYLE: Record<string, object> = {
	tag: { color: 'var(--kp-violet)', background: 'rgba(167,139,250,0.16)', borderRadius: 3 },
	break: { color: AMBER, background: 'rgba(252,211,77,0.12)', borderRadius: 3 },
	ipa: { color: 'var(--kp-cyan)', background: 'rgba(103,232,249,0.12)', borderRadius: 3 },
	pause: { color: 'var(--kp-green)' },
	caps: { color: 'var(--kp-strong)', textDecoration: 'underline', textDecorationColor: 'rgba(var(--kp-ink),0.45)', textUnderlineOffset: 3 },
	bad: { color: RED, background: 'rgba(252,165,165,0.12)', borderRadius: 3, textDecoration: 'underline wavy rgba(252,165,165,0.7)' },
}
const segmentsOf = (text: string, modelId: string): Seg[] => {
	const tags = isTagModel(modelId)
	const rules: { re: string; kind: string }[] = [
		{ re: '\\[[^\\]\\n]{1,80}\\]', kind: tags ? 'tag' : 'bad' },
		{ re: '<break\\b[^>\\n]*>', kind: tags ? 'bad' : 'break' },
		{ re: '<phoneme\\b[^>\\n]*>[^<\\n]*<\\/phoneme>', kind: PHONEME_MODELS.includes(modelId) ? 'ipa' : 'bad' },
		...(isV4(modelId) ? [{ re: '(?<=^|[\\s("])\\/[^\\/\\s][^\\/\\n]{0,60}\\/', kind: 'ipa' }] : []),
		{ re: '\\.\\.\\.|…', kind: 'pause' },
		...(tags ? [{ re: '\\b[A-Z][A-Z]+\\b', kind: 'caps' }] : []),
	]
	const re = new RegExp(rules.map(rule => `(${rule.re})`).join('|'), 'gm')
	const out: Seg[] = []
	let last = 0
	for (let match = re.exec(text); match; match = re.exec(text)) {
		if (!match[0]) {
			re.lastIndex++
			continue
		}
		if (match.index > last) out.push({ text: text.slice(last, match.index) })
		const group = match.slice(1).findIndex(value => value !== undefined)
		out.push({ text: match[0], kind: rules[group]?.kind })
		last = match.index + match[0].length
	}
	if (last < text.length) out.push({ text: text.slice(last) })
	return out
}

const lintOf = (text: string, model: Model | undefined, modelId: string) => {
	const out: string[] = []
	const tags = isTagModel(modelId)
	if (tags) {
		if (/<break\b/i.test(text)) out.push('v3 and v4 ignore <break>. Use [short pause], [long pause] or ... instead.')
		if (/<phoneme\b/i.test(text))
			out.push(isV4(modelId) ? 'v4 does not read <phoneme>. Put IPA between slashes instead, like /ˈkiːnoʊ/.' : 'v3 does not read <phoneme>. Spell the word the way it sounds, or switch to v4 and use /IPA/.')
	} else {
		if (/\[[^\]\n]{1,80}\]/.test(text)) out.push('[Audio tags] only work on v3 and v4. This model reads them out loud.')
		if (/<phoneme\b/i.test(text) && !PHONEME_MODELS.includes(modelId)) out.push('<phoneme> only works on Flash v2, Turbo v2 and English v1. This model skips it.')
		if ([...text.matchAll(/<break\s+time="([\d.]+)\s*s?"/gi)].some(match => Number(match[1]) > 3)) out.push('Breaks max out at 3 seconds.')
		if ((text.match(/<break\b/gi) ?? []).length > 6) out.push('Many breaks in one take can make delivery unstable. Split it if it drifts.')
	}
	const open = (text.match(/\[/g) ?? []).length
	const close = (text.match(/\]/g) ?? []).length
	if (open !== close) out.push('An audio tag is missing a bracket.')
	if (model?.maxChars && text.trim().length > model.maxChars)
		out.push(`${shortModel(model.name)} takes up to ${fmtInt(model.maxChars)} characters per take. Split the text or pick Flash v2.5.`)
	return out
}

type Chip = { label: string; title?: string; run: { kind: 'tag' | 'raw' | 'wrap' | 'caps'; a?: string; b?: string; select?: boolean } }
const tag = (name: string, title?: string): Chip => ({ label: name, title, run: { kind: 'tag', a: name } })
const chipGroups = (modelId: string): { id: string; label: string; chips: Chip[] }[] => {
	if (isTagModel(modelId))
		return [
			{
				id: 'delivery',
				label: 'Delivery',
				chips: ['whispers', 'excited', 'sarcastic', 'curious', 'professional', 'sympathetic', 'reassuring', 'mischievously', 'questioning', 'dismissive', 'crying'].map(name =>
					tag(name, 'Steers how the words after it are spoken'),
				),
			},
			{
				id: 'reactions',
				label: 'Reactions',
				chips: ['laughs', 'laughs harder', 'starts laughing', 'wheezing', 'sighs', 'exhales', 'snorts', 'happy gasp', 'frustrated sigh'].map(name => tag(name)),
			},
			{
				id: 'pacing',
				label: 'Pacing',
				chips: [
					tag('short pause'),
					tag('long pause'),
					tag('pauses'),
					{ label: '...', title: 'Ellipsis: a beat of hesitation', run: { kind: 'raw', a: '...' } },
					{ label: 'CAPS', title: 'Select a word first. Capitals add emphasis.', run: { kind: 'caps' } },
				],
			},
			{
				id: 'sounds',
				label: 'Sounds',
				chips: ['applause', 'clapping', 'gunshot', 'explosion', 'swallows', 'gulps'].map(name => tag(name, 'Sound effect, works best with expressive stability')),
			},
			{
				id: 'accent',
				label: 'Accent',
				chips: ['British', 'American', 'Australian', 'Irish', 'Scottish', 'French', 'German', 'Polish'].map(name =>
					tag(`strong ${name} accent`, 'Switches the accent for what follows'),
				),
			},
			{ id: 'more', label: 'Experimental', chips: [tag('sings', 'Experimental'), tag('woo', 'Experimental')] },
			...(isV4(modelId)
				? [
						{
							id: 'pronounce',
							label: 'Pronounce',
							chips: [
								{
									label: '/IPA/',
									title: 'v4 reads IPA between slashes. Select the word, click, then type its IPA, e.g. /ˈkiːnoʊ/.',
									run: { kind: 'wrap' as const, a: '/', b: '/', select: true },
								},
							],
						},
					]
				: []),
		]
	return [
		{
			id: 'pauses',
			label: 'Pauses',
			chips: ['0.3', '0.5', '1', '1.5', '2', '3'].map(seconds => ({
				label: `${seconds}s`,
				title: `<break time="${seconds}s" />`,
				run: { kind: 'raw' as const, a: `<break time="${seconds}s" />` },
			})),
		},
		...(PHONEME_MODELS.includes(modelId)
			? [
					{
						id: 'pronounce',
						label: 'Pronounce',
						chips: [
							{
								label: 'IPA phoneme',
								title: 'Wraps the selected word. Type the IPA into ph="".',
								run: { kind: 'wrap' as const, a: '<phoneme alphabet="ipa" ph="">', b: '</phoneme>' },
							},
							{
								label: 'CMU phoneme',
								title: 'Wraps the selected word. Type CMU Arpabet into ph="", e.g. K IY1 N OW0.',
								run: { kind: 'wrap' as const, a: '<phoneme alphabet="cmu-arpabet" ph="">', b: '</phoneme>' },
							},
						],
					},
				]
			: []),
	]
}

const HELP_TAGS = [
	['[whispers] [excited] [sarcastic]', 'Audio tags in square brackets steer the words after them. Free-form tags like [nervously] often work too.'],
	['[laughs] [sighs] [applause]', 'Reactions and sound effects, placed where they should happen.'],
	['[short pause] [long pause] ...', 'Pauses. <break> tags are ignored on v3 and v4.'],
	['CAPS', 'Emphasis on a word. Punctuation (! ? ...) shapes rhythm.'],
	['[strong French accent]', 'Accent switch for what follows.'],
	['/ˈkiːnoʊ/', 'v4 only: IPA between slashes for exact pronunciation.'],
	['Stability', 'v3: Creative is most expressive but can drift, Natural stays closest to the voice, Robust is steady but follows tags less.'],
]
const HELP_SSML = [
	['<break time="1.5s" />', 'Pause of up to 3 seconds. Too many in one take can make it unstable.'],
	['<phoneme alphabet="ipa" ph="ˈkiːnoʊ">Kino</phoneme>', 'Exact pronunciation on Flash v2, Turbo v2 and English v1. alphabet="cmu-arpabet" also works.'],
	['[tags]', 'Not supported: these models read square brackets out loud. Switch to v3 or v4 for tags.'],
	['Style', 'Multilingual v2: exaggerates the speaker style. Leave at 0 for the most stable read.'],
]
const HELP_ALL = [
	['Dictionaries', 'Pronunciation dictionaries apply to every model (Advanced, up to 3).'],
	['Previous / next text', 'Context for continuity when a line is part of a longer read.'],
	['Text normalization', 'Spells out numbers, dates and units. Auto lets the model decide.'],
]

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
const primary = { ...button, height: 26, padding: '0 14px', background: TEXT, color: BG, border: 'none', fontWeight: 600, fontSize: 12, lineHeight: '26px' }
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
const infoLine = { marginTop: 4, color: DIM, fontSize: 11, lineHeight: 1.45 }
const sectionTitle = (text: string, extra?: unknown) =>
	h(
		'div',
		{ style: { display: 'flex', alignItems: 'center', gap: 6, color: DIM, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' as const } },
		h('span', null, text),
		extra ?? null,
	)
const clamp = (lines: number) => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' })

const Btn = (props: { label: string; title?: string; onClick: () => void; disabled?: boolean; style?: object; primary?: boolean }) =>
	h(
		'button',
		{
			className: props.primary ? undefined : 'kino-vo-btn',
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

const IconBtn = (label: string, title: string, onClick: () => void, disabled?: boolean) =>
	h(
		'button',
		{
			className: 'kino-vo-btn',
			title,
			disabled,
			onClick: (event: { stopPropagation: () => void }) => {
				event.stopPropagation()
				onClick()
			},
			style: {
				width: 22,
				height: 22,
				padding: 0,
				border: 'none',
				borderRadius: 5,
				background: 'transparent',
				color: DIM,
				cursor: disabled ? 'default' : 'pointer',
				fontSize: 13,
				lineHeight: '22px',
				flexShrink: 0,
				opacity: disabled ? 0.35 : 1,
			},
		},
		label,
	)

const Segmented = (props: { value: string; options: { value: string; label: string; title?: string }[]; onChange: (value: string) => void }) =>
	h(
		'div',
		{ style: { display: 'flex', padding: 2, gap: 2, borderRadius: 6, background: 'rgba(var(--kp-ink),0.05)', flexShrink: 0, flexWrap: 'wrap' as const } },
		...props.options.map(option =>
			h(
				'button',
				{
					key: option.value,
					title: option.title,
					onClick: () => props.onChange(option.value),
					style: {
						height: 20,
						padding: '0 8px',
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

const Select = (props: { value: string; onChange: (value: string) => void; options: unknown[]; title?: string; disabled?: boolean; style?: object }) =>
	h(
		'select',
		{
			value: props.value,
			title: props.title,
			disabled: props.disabled,
			onChange: (event: { target: { value: string } }) => props.onChange(event.target.value),
			style: { ...input, flex: 1, paddingRight: 4, cursor: 'pointer', ...props.style },
		},
		...props.options,
	)

const Row = (label: string, control: unknown, title?: string) =>
	h(
		'div',
		{ style: { display: 'flex', alignItems: 'center', gap: 8, minHeight: 26 } },
		h('span', { title, style: { width: 96, flexShrink: 0, color: DIM, fontSize: 11, cursor: title ? 'help' : 'default' } }, label),
		h('div', { style: { flex: 1, minWidth: 0, display: 'flex', gap: 6, alignItems: 'center' } }, control),
	)

const Slider = (props: {
	label: string
	title?: string
	value: number | null
	fallback?: number | null
	min: number
	max: number
	step: number
	format?: (n: number) => string
	onChange: (value: number | null) => void
	resetLabel?: string
}) => {
	const shown = props.value ?? props.fallback ?? (props.min + props.max) / 2
	const format = props.format ?? ((n: number) => n.toFixed(2))
	return h(
		'div',
		{ style: { display: 'flex', alignItems: 'center', gap: 8, height: 26 } },
		h('span', { title: props.title, style: { width: 96, flexShrink: 0, color: DIM, fontSize: 11, cursor: props.title ? 'help' : 'default' } }, props.label),
		h('input', {
			type: 'range',
			className: 'kino-vo-range',
			min: props.min,
			max: props.max,
			step: props.step,
			value: shown,
			onChange: (event: { target: { value: string } }) => props.onChange(Number(event.target.value)),
			style: { flex: 1, minWidth: 60, opacity: props.value === null ? 0.45 : 1 },
		}),
		h(
			'span',
			{ title: props.value === null ? props.resetLabel ?? 'Voice default' : undefined, style: { width: 42, textAlign: 'right' as const, fontFamily: MONO, fontSize: 11, color: props.value === null ? FAINT : TEXT } },
			format(shown),
		),
		h(
			'span',
			{ style: { width: 22, flexShrink: 0, visibility: props.value === null ? ('hidden' as const) : ('visible' as const) } },
			IconBtn('↺', props.resetLabel ? `Back to ${props.resetLabel.toLowerCase()}` : 'Back to the voice default', () => props.onChange(null)),
		),
	)
}

// ---------- error boundary + playhead probe ----------
class Boundary extends Component<{ fallback?: unknown; children?: unknown }, { failed: boolean }> {
	state = { failed: false }
	static getDerivedStateFromError() {
		return { failed: true }
	}
	componentDidCatch() {}
	render() {
		return (this.state.failed ? this.props.fallback ?? null : this.props.children) as any
	}
}

type PlayheadSink = { current: { frame: number | null; fps: number | null } }
function PlayheadProbe(props: { sink: PlayheadSink }) {
	const { player, playerRef } = useRemotionPlayer() as { player: unknown; playerRef: unknown }
	const frame = useTimelinePosition({ playerRef } as any) as number
	const { fps } = useFps() as { fps: number }
	const attached = Boolean(player) && Number.isFinite(frame)
	props.sink.current = { frame: attached ? Math.max(0, Math.round(frame)) : null, fps: fps || null }
	return h(
		'span',
		{
			title: 'Playhead. "At playhead" drops takes here.',
			style: { padding: '0 6px', height: 18, lineHeight: '18px', borderRadius: 4, background: 'rgba(var(--kp-ink),0.06)', color: DIM, fontFamily: MONO, fontSize: 10.5 },
		},
		attached ? fmtTc(frame, fps) : '--:--',
	)
}

// ---------- waveform ----------
function Wave(props: { audioKey: string; path: string; active: boolean; audio: HTMLAudioElement; onSeek: (fraction: number, duration: number) => void }) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null)
	const durationRef = useRef(0)
	const [peaks, setPeaks] = useState<number[] | null>(null)
	const theme = useKinoTheme()

	useEffect(() => {
		let live = true
		loadAudio(props.audioKey, props.path)
			.then(data => {
				if (!live) return
				durationRef.current = data.duration
				setPeaks(data.peaks)
			})
			.catch(() => live && setPeaks([]))
		return () => {
			live = false
		}
	}, [props.audioKey, props.path])

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const audio = props.audio
		let raf = 0
		const paint = () => {
			const dpr = window.devicePixelRatio || 1
			const width = canvas.clientWidth
			const height = canvas.clientHeight
			if (!width || !height) return
			if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
				canvas.width = Math.round(width * dpr)
				canvas.height = Math.round(height * dpr)
			}
			const ctx = canvas.getContext('2d')
			if (!ctx) return
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
			ctx.clearRect(0, 0, width, height)
			// Canvas cannot read CSS variables, so resolve the theme's ink once per paint
			const ink = cssVar(canvas, 'ink') || '255,255,255'
			const played = cssVar(canvas, 'strong') || '#fafafa'
			const total = audio.duration || durationRef.current
			const progress = props.active && total ? audio.currentTime / total : 0
			const bars = Math.max(8, Math.floor(width / 3))
			for (let i = 0; i < bars; i++) {
				const value = peaks && peaks.length ? peaks[Math.min(peaks.length - 1, Math.floor((i / bars) * peaks.length))] : 0.14
				const bar = Math.max(2, value * (height - 2))
				ctx.fillStyle =
					(i + 0.5) / bars <= progress ? played : peaks === null || !peaks.length ? `rgba(${ink},0.09)` : props.active ? `rgba(${ink},0.36)` : `rgba(${ink},0.24)`
				ctx.fillRect(i * 3, (height - bar) / 2, 2, bar)
			}
		}
		const loop = () => {
			paint()
			if (props.active && !audio.paused) raf = requestAnimationFrame(loop)
		}
		const restart = () => {
			cancelAnimationFrame(raf)
			loop()
		}
		restart()
		const observer = new ResizeObserver(paint)
		observer.observe(canvas)
		const events = ['play', 'pause', 'seeked', 'ended', 'loadedmetadata']
		if (props.active) events.forEach(name => audio.addEventListener(name, restart))
		return () => {
			cancelAnimationFrame(raf)
			observer.disconnect()
			events.forEach(name => audio.removeEventListener(name, restart))
		}
	}, [peaks, props.active, props.audio, theme])

	return h('canvas', {
		ref: canvasRef,
		title: 'Click to play from here',
		onClick: (event: { clientX: number }) => {
			const canvas = canvasRef.current
			if (!canvas) return
			const rect = canvas.getBoundingClientRect()
			props.onSeek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), durationRef.current)
		},
		style: { flex: '1 1 120px', minWidth: 90, height: 26, cursor: 'pointer', display: 'block' },
	})
}

// ---------- panel ----------
export default function VoiceoverPanel() {
	const rootRef = useRef<HTMLDivElement | null>(null)
	const taRef = useRef<HTMLTextAreaElement | null>(null)
	const versionsRef = useRef<HTMLDivElement | null>(null)
	const audioRef = useRef<HTMLAudioElement | null>(null)
	const playheadRef = useRef<{ frame: number | null; fps: number | null }>({ frame: null, fps: null })

	const [width, setWidth] = useState(0)
	const [bridge, setBridge] = useState<BridgeState>('checking')
	const [bridgeNote, setBridgeNote] = useState('')
	const [status, setStatus] = useState<{ outputDir?: string; sdk?: string; voiceDir?: string; defaults?: { voiceId?: string | null } } | null>(null)
	// Default voice: config.json voice_id or ELEVENLABS_VOICE_ID on this machine (see the bridge's voice worker).
	const defaultVoice = status?.defaults?.voiceId || ''
	const [voices, setVoices] = useState<Voice[] | null>(null)
	const [models, setModels] = useState<Model[] | null>(null)
	const [quota, setQuota] = useState<Quota | null>(null)
	const [dicts, setDicts] = useState<Dict[] | null>(null)
	const [effects, setEffects] = useState<Effects | null>(null)
	// Each voice's saved settings from ElevenLabs. The voice list doesn't carry them, so they come from their own route.
	const [storedVs, setStoredVs] = useState<Record<string, Req>>({})
	const storedLoads = useRef<Record<string, Promise<Req | null>>>({})
	const storedFresh = useRef(false)
	const [prefs, setPrefs] = useState<Prefs>(() => {
		const saved = readJson(PREFS_KEY, {})
		return {
			voiceId: '',
			modelId: DEFAULT_MODEL,
			takes: 2,
			vsByVoice: {},
			chips: 'delivery',
			...saved,
			adv: { ...DEFAULT_ADV, ...(saved.adv ?? {}), name: '' },
		}
	})
	const [text, setText] = useState<string>(() => readJson(DRAFT_KEY, ''))
	const [showAdvanced, setShowAdvanced] = useState(false)
	const [showHelp, setShowHelp] = useState(false)
	const [history, setHistory] = useState<Take[]>([])
	const [historyDir, setHistoryDir] = useState('')
	const [hidden, setHidden] = useState<string[]>(() => readJson(HIDDEN_KEY, []))
	const [batchLimit, setBatchLimit] = useState(BATCH_PAGE)
	const [pending, setPending] = useState<Pending | null>(null)
	const [confirm, setConfirm] = useState<{ estimate: number; remaining: number | null; body: Req } | null>(null)
	const [now, setNow] = useState<{ key: string; playing: boolean } | null>(null)
	const [busy, setBusy] = useState<Record<string, string>>({})
	const [flash, setFlash] = useState<{ text: string; tone?: 'error' } | null>(null)
	const [, setTick] = useState(0)

	const say = useCallback((message: string, tone?: 'error') => setFlash({ text: plain(message), tone }), [])
	useEffect(() => {
		if (!flash) return
		const timer = setTimeout(() => setFlash(null), flash.tone === 'error' ? 9000 : 5000)
		return () => clearTimeout(timer)
	}, [flash])

	useEffect(ensureCss, [])

	useEffect(() => {
		const root = rootRef.current
		if (!root) return
		const observer = new ResizeObserver(entries => setWidth(Math.round(entries[0]?.contentRect.width ?? 0)))
		observer.observe(root)
		return () => observer.disconnect()
	}, [])

	// ---------- persistence ----------
	useEffect(() => writeJson(PREFS_KEY, { ...prefs, adv: { ...prefs.adv, name: '' } }), [prefs])
	useEffect(() => {
		const timer = setTimeout(() => writeJson(DRAFT_KEY, text), 400)
		return () => clearTimeout(timer)
	}, [text])
	useEffect(() => writeJson(HIDDEN_KEY, hidden.slice(-500)), [hidden])

	// ---------- audio ----------
	const audioEl = () => {
		if (!audioRef.current) audioRef.current = new Audio()
		return audioRef.current
	}
	useEffect(() => {
		const audio = audioEl()
		const onPlay = () => setNow(current => (current ? { ...current, playing: true } : current))
		const onStop = () => setNow(current => (current ? { ...current, playing: false } : current))
		audio.addEventListener('play', onPlay)
		audio.addEventListener('pause', onStop)
		audio.addEventListener('ended', onStop)
		return () => {
			audio.removeEventListener('play', onPlay)
			audio.removeEventListener('pause', onStop)
			audio.removeEventListener('ended', onStop)
			audio.pause()
		}
	}, [])

	// ---------- bridge ----------
	const check = useCallback(async () => {
		try {
			const health = await fetch(`${BRIDGE}/health`).then(response => response.json())
			if (!Array.isArray(health.features) || !health.features.includes('tts')) {
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
			const next = await api('/tts/status')
			setStatus(next)
			setBridge(next.hasKey ? 'ok' : 'nokey')
			setBridgeNote('')
		} catch (error) {
			if (error instanceof BridgeError && error.status === 401) setBridge('unpaired')
			else if (error instanceof BridgeError && error.status === 0) setBridge('offline')
			else {
				setBridge('nokey')
				setBridgeNote(error instanceof Error ? error.message : String(error))
			}
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

	const fail = useCallback((error: unknown) => {
		if (error instanceof BridgeError && (error.status === 0 || error.status === 401)) {
			setBridge(error.status === 401 ? 'unpaired' : 'offline')
			return ''
		}
		return error instanceof Error ? error.message : String(error)
	}, [])

	// ---------- data ----------
	const loadHistory = useCallback(() => {
		api('/tts/history?n=240')
			.then(body => {
				setHistory(body.items ?? [])
				setHistoryDir(body.dir ?? '')
			})
			.catch(fail)
	}, [fail])
	const loadQuota = useCallback(() => {
		api('/tts/quota')
			.then(setQuota)
			.catch(() => {})
	}, [])
	const loadStored = useCallback((voiceId: string, fresh = false): Promise<Req | null> => {
		if (!voiceId) return Promise.resolve(null)
		const inFlight = storedLoads.current[voiceId]
		if (inFlight && !fresh) return inFlight
		const load = api(`/tts/voice-settings?voice=${encodeURIComponent(voiceId)}${fresh ? '&fresh=1' : ''}`)
			.then(body => {
				const settings: Req = body.settings ?? {}
				setStoredVs(current => ({ ...current, [voiceId]: settings }))
				return settings
			})
			.catch(() => {
				// Let the next attempt retry instead of caching the failure.
				delete storedLoads.current[voiceId]
				return null
			})
		storedLoads.current[voiceId] = load
		return load
	}, [])
	const loadAll = useCallback(
		(fresh = false) => {
			const q = fresh ? '?fresh=1' : ''
			api(`/tts/voices${q}`)
				.then(body => setVoices(body.voices ?? []))
				.catch(error => {
					const message = fail(error)
					if (message) say(`Voices: ${message}`, 'error')
				})
			api(`/tts/models${q}`)
				.then(body => setModels(body.models ?? []))
				.catch(error => {
					const message = fail(error)
					if (message) say(`Models: ${message}`, 'error')
				})
			if (fresh) {
				setDicts(null)
				setEffects(null)
				storedLoads.current = {}
				storedFresh.current = true
				setStoredVs({})
			}
			loadQuota()
			loadHistory()
		},
		[fail, loadHistory, loadQuota, say],
	)
	useEffect(() => {
		if (bridge === 'ok') loadAll()
	}, [bridge, loadAll])
	// No voice picked yet: start on the configured default, else the first of your own voices, else the first voice.
	useEffect(() => {
		if (prefs.voiceId || !voices?.length) return
		const pick = voices.find(item => item.id === defaultVoice) ?? voices.find(item => item.category !== 'premade') ?? voices[0]
		setPrefs(current => (current.voiceId ? current : { ...current, voiceId: pick.id }))
	}, [voices, defaultVoice, prefs.voiceId])
	useEffect(() => {
		if (bridge !== 'ok' || !prefs.voiceId || storedVs[prefs.voiceId]) return
		loadStored(prefs.voiceId, storedFresh.current)
		storedFresh.current = false
	}, [bridge, prefs.voiceId, storedVs, loadStored])
	useEffect(() => {
		if (bridge !== 'ok' || !showAdvanced) return
		if (!dicts)
			api('/tts/dictionaries')
				.then(body => setDicts(body.dictionaries ?? []))
				.catch(() => setDicts([]))
		if (!effects)
			api('/tts/effects')
				.then(body => setEffects({ filters: body.filters ?? [], environments: body.environments ?? [], noises: body.noises ?? [] }))
				.catch(() => setEffects({ filters: [], environments: [], noises: [] }))
	}, [bridge, showAdvanced, dicts, effects])

	useEffect(() => {
		if (!pending) return
		const timer = setInterval(() => setTick(n => n + 1), 1000)
		return () => clearInterval(timer)
	}, [pending])

	// ---------- derived ----------
	const patch = (next: Partial<Prefs>) => setPrefs(current => ({ ...current, ...next }))
	const setAdv = (next: Partial<Adv>) => setPrefs(current => ({ ...current, adv: { ...current.adv, ...next } }))
	const setVs = (next: Partial<VS>) =>
		setPrefs(current => ({ ...current, vsByVoice: { ...current.vsByVoice, [current.voiceId]: { ...EMPTY_VS, ...current.vsByVoice[current.voiceId], ...next } } }))

	const sortedModels = useMemo(() => {
		const rank = (id: string) => (MODEL_ORDER.includes(id) ? MODEL_ORDER.indexOf(id) : 100)
		return [...(models ?? [])].sort((a, b) => rank(a.id) - rank(b.id))
	}, [models])
	useEffect(() => {
		if (sortedModels.length && !sortedModels.some(model => model.id === prefs.modelId)) patch({ modelId: sortedModels[0].id })
	}, [sortedModels, prefs.modelId])

	const voice = voices?.find(item => item.id === prefs.voiceId)
	const model = sortedModels.find(item => item.id === prefs.modelId)
	const modelId = prefs.modelId
	const adv = prefs.adv
	const vs: VS = { ...EMPTY_VS, ...prefs.vsByVoice[prefs.voiceId] }
	const savedVs: Req | undefined = storedVs[prefs.voiceId]
	const isPvc = voice?.category === 'professional'
	const fineTunedHere = Boolean(voice?.fineTuned?.includes(modelId))
	const cloneAllowed = isPvc && isV4(modelId) && fineTunedHere
	const chars = text.trim().length
	const costFactor = model?.costFactor ?? 1
	const estimate = Math.ceil(chars * costFactor * prefs.takes)
	const remaining = quota ? Math.max(0, quota.limit - quota.used) : null
	const overLimit = Boolean(model?.maxChars && chars > model.maxChars)
	const lint = useMemo(() => lintOf(text, model, modelId), [text, model, modelId])
	const segments = useMemo(() => segmentsOf(text, modelId), [text, modelId])
	const groups = useMemo(() => chipGroups(modelId), [modelId])
	const group = groups.find(item => item.id === prefs.chips) ?? groups[0]
	const languageValue = model?.languages?.some(language => language.id === adv.language) ? adv.language : ''
	const modelName = (id: string | null | undefined) => {
		if (!id) return ''
		const found = sortedModels.find(item => item.id === id)
		return found ? shortModel(found.name) : id.replace(/^eleven_/, '').replace(/_/g, ' ')
	}

	const buildBody = (saved: Req | null | undefined = savedVs): Req => {
		const overrides = drop({
			stability: vs.stability,
			similarity_boost: vs.similarity,
			style: model?.canUseStyle ? vs.style : null,
			speed: vs.speed,
			use_speaker_boost: model?.canUseSpeakerBoost ? vs.boost : null,
			clone_strength: cloneAllowed ? vs.clone : null,
		})
		let voiceSettings: Req | undefined
		if (Object.keys(overrides).length) {
			// A partial voice_settings object resets the missing fields to API defaults, so start from the voice's own settings.
			const base: Req = { ...(saved ?? {}) }
			if (!model?.canUseStyle) delete base.style
			if (!model?.canUseSpeakerBoost) delete base.use_speaker_boost
			voiceSettings = { ...base, ...overrides }
		}
		const filterOn = Boolean(adv.filter || adv.environment || adv.noise || adv.pan || adv.distance !== null)
		return drop({
			text,
			voice_id: prefs.voiceId,
			model_id: modelId,
			output_format: adv.format,
			takes: prefs.takes,
			voice_settings: voiceSettings,
			seed: adv.seed.trim() === '' ? undefined : Number(adv.seed),
			language_code: languageValue || undefined,
			apply_text_normalization: adv.normalization,
			previous_text: adv.previous.trim() || undefined,
			next_text: adv.next.trim() || undefined,
			pronunciation_dictionary_locators: adv.dicts.length
				? adv.dicts
						.map(id => dicts?.find(item => item.id === id))
						.filter(Boolean)
						.map(item => ({ pronunciation_dictionary_id: (item as Dict).id, version_id: (item as Dict).versionId }))
				: undefined,
			audio_effects: filterOn
				? drop({
						filter_preset_id: adv.filter || undefined,
						environment_id: adv.environment || undefined,
						send_level: adv.environment ? adv.sendLevel : undefined,
						background_noise_id: adv.noise || undefined,
						distance: adv.distance ?? undefined,
						pan: adv.pan || undefined,
					})
				: undefined,
			use_pvc_as_ivc: isPvc && adv.pvcAsIvc ? true : undefined,
			name: adv.name.trim() || undefined,
		})
	}

	// ---------- playback ----------
	const play = useCallback(
		async (key: string, path: string, at?: number) => {
			const audio = audioEl()
			try {
				const loaded = await loadAudio(key, path)
				if (audio.src !== loaded.url) audio.src = loaded.url
				if (at !== undefined) audio.currentTime = Math.max(0, at)
				setNow({ key, playing: true })
				await audio.play()
			} catch (error) {
				if ((error as { name?: string })?.name === 'AbortError') return
				const message = fail(error)
				if (message) say(`Playback: ${message}`, 'error')
			}
		},
		[fail, say],
	)
	const toggle = (key: string, path: string) => {
		const audio = audioEl()
		if (now?.key === key) {
			if (audio.paused) audio.play().catch(() => {})
			else audio.pause()
			return
		}
		audio.pause()
		play(key, path, 0)
	}
	const seek = (key: string, path: string, fraction: number, duration: number) => {
		const audio = audioEl()
		if (now?.key === key && audio.duration) {
			audio.currentTime = fraction * audio.duration
			if (audio.paused) audio.play().catch(() => {})
			return
		}
		audio.pause()
		play(key, path, fraction * (duration || 0))
	}

	// ---------- generate ----------
	const generate = (body: Req, confirmed = false) => {
		if (pending) return
		if (!String(body.text ?? '').trim()) return
		setConfirm(null)
		const startedVoice = voices?.find(item => item.id === body.voice_id)?.name ?? 'Voice'
		setPending({ text: String(body.text), takes: Number(body.takes) || 1, startedAt: Date.now(), voiceName: startedVoice, modelId: String(body.model_id ?? '') })
		if (width < 760) setTimeout(() => versionsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50)
		api('/tts/generate', { method: 'POST', body: { ...body, confirmed } })
			.then((result: { takes: Take[] }) => {
				const ok = result.takes.filter(take => !take.error)
				const bad = result.takes.filter(take => take.error)
				setHistory(current => [...ok, ...current.filter(item => !ok.some(fresh => fresh.file === item.file))])
				setBatchLimit(limit => Math.max(limit, BATCH_PAGE))
				if (bad.length) say(`${bad.length} of ${result.takes.length} takes failed: ${bad[0].error}`, 'error')
				if (body.name) setAdv({ name: '' })
				if (ok[0]) play(ok[0].file, audioPath(ok[0].file), 0)
				loadQuota()
			})
			.catch(error => {
				if (error instanceof BridgeError && error.status === 409 && error.body?.needsConfirm) {
					setConfirm({ estimate: Number(error.body.estimate) || 0, remaining: error.body.remaining ?? null, body })
					return
				}
				const message = fail(error)
				if (message) say(message, 'error')
				loadQuota()
			})
			.finally(() => setPending(null))
	}
	const canGenerate = bridge === 'ok' && chars > 0 && !pending && Boolean(prefs.voiceId) && !overLimit
	const generateNow = async () => {
		if (!canGenerate) return
		const touched = Object.values(vs).some(value => value !== null)
		if (!touched || savedVs) {
			generate(buildBody())
			return
		}
		// A slider was moved before the voice's saved settings arrived: fetch them first so the untouched ones keep their values.
		const saved = await loadStored(prefs.voiceId)
		if (!saved) say('Couldn’t read this voice’s saved settings, so untouched sliders use the ElevenLabs defaults.', 'error')
		generate(buildBody(saved))
	}

	// ---------- batch actions ----------
	const requestOf = (take: Take): Req | null => {
		const req = take.request
		if (!req || typeof req.text !== 'string' || !req.text.trim()) return null
		const clean: Req = {}
		for (const [key, value] of Object.entries(req)) if (!key.startsWith('_') && key !== 'seed') clean[key] = value
		return { ...clean, voice_id: take.voiceId ?? req._voice_id ?? prefs.voiceId, output_format: take.outputFormat ?? req._output_format ?? adv.format }
	}
	const reuse = (take: Take) => {
		const req = requestOf(take)
		if (!req) return
		const settings = req.voice_settings ?? {}
		const voiceId = String(req.voice_id)
		const fx = req.audio_effects ?? {}
		setText(req.text)
		setPrefs(current => ({
			...current,
			voiceId,
			modelId: req.model_id ?? current.modelId,
			vsByVoice: {
				...current.vsByVoice,
				[voiceId]: {
					stability: settings.stability ?? null,
					similarity: settings.similarity_boost ?? null,
					style: settings.style ?? null,
					speed: settings.speed ?? null,
					boost: typeof settings.use_speaker_boost === 'boolean' ? settings.use_speaker_boost : null,
					clone: settings.clone_strength ?? null,
				},
			},
			adv: {
				...current.adv,
				seed: '',
				language: req.language_code ?? '',
				normalization: req.apply_text_normalization ?? 'auto',
				format: req.output_format ?? current.adv.format,
				previous: req.previous_text ?? '',
				next: req.next_text ?? '',
				dicts: (req.pronunciation_dictionary_locators ?? []).map((item: Req) => item.pronunciation_dictionary_id),
				filter: fx.filter_preset_id ?? '',
				environment: fx.environment_id ?? '',
				sendLevel: fx.send_level ?? current.adv.sendLevel,
				noise: fx.background_noise_id ?? '',
				distance: fx.distance ?? null,
				pan: fx.pan ?? 0,
				pvcAsIvc: req.use_pvc_as_ivc === true,
			},
		}))
		say('Loaded into the editor.')
		taRef.current?.focus()
	}
	const again = (take: Take) => {
		const req = requestOf(take)
		if (req) generate({ ...req, takes: take.takes || prefs.takes })
	}
	const hide = (batchId: string) => setHidden(current => [...current.filter(id => id !== batchId), batchId])

	const importTake = (take: Take, place: boolean) => {
		setBusy(current => ({ ...current, [take.file]: place ? 'timeline' : 'library' }))
		const probe = playheadRef.current
		api('/tts/import', {
			method: 'POST',
			body: {
				file: take.file,
				place: place ? 'playhead' : undefined,
				projectId: place ? projectIdFromUrl() || undefined : undefined,
				frame: place && probe.frame !== null ? probe.frame : undefined,
				fps: place && probe.fps ? probe.fps : undefined,
			},
		})
			.then(result => {
				setHistory(current => current.map(item => (item.file === take.file ? { ...item, mediaId: result.mediaId } : item)))
				if (result.placed)
					say(
						`V${take.take} is on the timeline at ${fmtTc(result.frame, result.fps)}.${result.warning ? ` Kino reported: ${result.warning}` : ''}`,
						result.warning ? 'error' : undefined,
					)
				else say(result.reused ? 'Already in the Kino library.' : 'Added to the Kino library.')
			})
			.catch(error => {
				const message = fail(error)
				if (message) say(message, 'error')
			})
			.finally(() =>
				setBusy(current => {
					const next = { ...current }
					delete next[take.file]
					return next
				}),
			)
	}
	const reveal = (file?: string) =>
		api('/tts/reveal', { method: 'POST', body: file ? { file } : {} }).catch(error => {
			const message = fail(error)
			if (message) say(message, 'error')
		})

	// ---------- editor ----------
	const insert = (chip: Chip) => {
		const ta = taRef.current
		if (!ta) return
		ta.focus()
		const start = ta.selectionStart
		const end = ta.selectionEnd
		const value = ta.value
		const selected = value.slice(start, end)
		const before = value.slice(0, start)
		const after = value.slice(end)
		const lead = start > 0 && !/\s$/.test(before) ? ' ' : ''
		let insertText = ''
		let select: [number, number] | null = null
		const run = chip.run
		if (run.kind === 'tag') {
			// The tag goes in front of the selection (it steers what follows), or at the caret with one trailing space.
			insertText = selected ? `${lead}[${run.a}] ${selected}` : `${lead}[${run.a}]${/^\s/.test(after) ? '' : ' '}`
		} else if (run.kind === 'raw') {
			insertText = `${run.a === '...' ? '' : lead}${run.a}${/^\s/.test(after) || !after ? '' : ' '}`
		} else if (run.kind === 'caps') {
			if (!selected) {
				say('Select a word first, then click CAPS.')
				return
			}
			insertText = selected === selected.toUpperCase() ? selected.toLowerCase() : selected.toUpperCase()
			select = [start, start + insertText.length]
		} else {
			const a = run.a ?? ''
			const b = run.b ?? ''
			insertText = `${a}${selected}${b}`
			if (run.select) select = [start + a.length, start + a.length + selected.length]
			else if (a.includes('ph=""')) {
				const caret = start + a.indexOf('ph=""') + 4
				select = [caret, caret]
			} else select = [start + a.length + selected.length, start + a.length + selected.length]
		}
		const ok = document.execCommand('insertText', false, insertText)
		if (!ok) setText(before + insertText + after)
		if (select) {
			const [from, to] = select
			requestAnimationFrame(() => taRef.current?.setSelectionRange(from, to))
		}
	}

	const isolate = (event: { target: unknown; metaKey?: boolean; key?: string; stopPropagation: () => void }) => {
		// Keep typing out of Kino's editor shortcuts (space, J/K/L, delete, ...). On macOS ⌘ combos other than editing ones still reach Kino.
		const target = event.target as HTMLElement | null
		if (!target || !/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
		if (IS_MAC && event.metaKey && typeof event.key === 'string' && !['a', 'c', 'v', 'x', 'z', 'enter'].includes(event.key.toLowerCase())) return
		event.stopPropagation()
	}

	// ---------- render: compose ----------
	const mine = (voices ?? []).filter(item => item.category !== 'premade')
	const library = (voices ?? []).filter(item => item.category === 'premade')
	const voiceOption = (item: Voice) =>
		h('option', { key: item.id, value: item.id }, `${plain(item.name)}${item.id === defaultVoice ? '  (default)' : ''}${item.fineTuned?.includes(modelId) ? '  ✓' : ''}`)
	const previewKey = voice ? `voice:${voice.id}` : ''
	const previewPlaying = Boolean(now?.key === previewKey && now?.playing)
	const voiceLabels = voice?.labels ? Object.values(voice.labels).filter(Boolean).map(value => labelOf(String(value))) : []
	// Only models you can pick here; the account also lists internal ones (v4 exp, v4 eval, ...).
	const fineTunedNames = sortedModels.filter(item => voice?.fineTuned?.includes(item.id)).map(item => shortModel(item.name))

	const voiceBlock = h(
		'div',
		null,
		sectionTitle('Voice'),
		h(
			'div',
			{ style: { display: 'flex', gap: 6, marginTop: 6 } },
			Select({
				value: prefs.voiceId,
				disabled: !voices,
				title: voice?.description ? plain(voice.description) : undefined,
				onChange: id => patch({ voiceId: id }),
				options: voices
					? [
							...(voice ? [] : [h('option', { key: 'missing', value: prefs.voiceId }, 'Voice not found on this account')]),
							mine.length ? h('optgroup', { key: 'mine', label: 'My voices' }, ...mine.map(voiceOption)) : null,
							library.length ? h('optgroup', { key: 'lib', label: 'Default voices' }, ...library.map(voiceOption)) : null,
						]
					: [h('option', { key: 'loading', value: prefs.voiceId }, 'Loading voices…')],
			}),
			Btn({
				label: previewPlaying ? '❚❚' : '▶',
				title: 'Play the ElevenLabs sample for this voice',
				disabled: !voice?.previewUrl,
				onClick: () => voice && toggle(previewKey, `/tts/voice-preview?voice=${encodeURIComponent(voice.id)}`),
				style: { height: 26, width: 30, padding: 0, fontSize: 10 },
			}),
		),
		voice
			? h(
					'div',
					{ style: infoLine },
					[CATEGORY[voice.category] ?? labelOf(voice.category), ...voiceLabels].join('  ·  '),
					fineTunedNames.length ? h('span', { style: { color: FAINT } }, `  ·  fine-tuned: ${fineTunedNames.join(', ')}`) : null,
				)
			: null,
		voice && defaultVoice && prefs.voiceId !== defaultVoice && voices?.some(item => item.id === defaultVoice)
			? h(
					'div',
					{ style: { ...infoLine, marginTop: 2 } },
					h(
						'span',
						{ onClick: () => patch({ voiceId: defaultVoice }), style: { color: FAINT, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 } },
						`Back to ${plain(voices?.find(item => item.id === defaultVoice)?.name ?? 'the default voice')}`,
					),
				)
			: null,
	)

	const modelBlock = h(
		'div',
		null,
		sectionTitle('Model'),
		h(
			'div',
			{ style: { display: 'flex', gap: 6, marginTop: 6 } },
			Select({
				value: modelId,
				disabled: !models,
				title: model?.description ? plain(model.description) : undefined,
				onChange: id => patch({ modelId: id }),
				options: models
					? sortedModels.map(item =>
							h(
								'option',
								{ key: item.id, value: item.id },
								`${shortModel(item.name)}${voice?.fineTuned?.includes(item.id) ? '  ✓' : ''}${item.costFactor < 1 ? `  (${item.costFactor}× cost)` : ''}`,
							),
						)
					: [h('option', { key: 'loading', value: modelId }, 'Loading models…')],
			}),
		),
		model
			? h(
					'div',
					{ style: infoLine },
					[
						model.maxChars ? `${fmtInt(model.maxChars)} characters per take` : '',
						model.costFactor !== 1 ? `${model.costFactor}× credits` : 'full credits',
						model.languages?.length ? `${model.languages.length} languages` : '',
						isTagModel(model.id) ? (isV4(model.id) ? 'audio tags, /IPA/' : 'audio tags') : PHONEME_MODELS.includes(model.id) ? '<break>, <phoneme>' : '<break>',
					]
						.filter(Boolean)
						.join('  ·  '),
					voices ? h('span', { style: { color: FAINT } }, '  ·  ✓ = voice fine-tuned') : null,
				)
			: null,
		isPvc && voice && voice.fineTuned?.length && !fineTunedHere
			? h('div', { style: { ...infoLine, color: AMBER } }, `${plain(voice.name)} is not fine-tuned for this model, so it will sound less like the original.`)
			: null,
	)

	const editor = h(
		'div',
		{
			style: {
				position: 'relative',
				borderRadius: 8,
				border: '1px solid rgba(var(--kp-ink),0.14)',
				background: 'var(--kp-well)',
				cursor: 'text',
			},
			onClick: () => taRef.current?.focus(),
		},
		h(
			'div',
			{ 'aria-hidden': true, style: { ...EDITOR_TEXT, color: TEXT, pointerEvents: 'none', minHeight: 156 } },
			...segments.map((segment, index) => (segment.kind ? h('span', { key: index, style: SEG_STYLE[segment.kind] }, segment.text) : segment.text)),
			'​',
		),
		h('textarea', {
			ref: taRef,
			className: 'kino-vo-ta',
			value: text,
			spellCheck: false,
			placeholder: isTagModel(modelId)
				? 'What should it say? Steer delivery with [whispers], [excited] or [laughs], pause with [short pause] or ..., stress a word in CAPS.'
				: 'What should it say? Pause with <break time="1s" />. This model reads [tags] out loud.',
			onChange: (event: { target: { value: string } }) => setText(event.target.value),
			onKeyDown: (event: { key: string; metaKey: boolean; ctrlKey: boolean; preventDefault: () => void; stopPropagation: () => void }) => {
				if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
					event.preventDefault()
					event.stopPropagation()
					generateNow()
				}
			},
			style: {
				...EDITOR_TEXT,
				position: 'absolute',
				inset: 0,
				width: '100%',
				height: '100%',
				color: 'transparent',
				caretColor: 'var(--kp-strong)',
				background: 'transparent',
				border: 'none',
				outline: 'none',
				resize: 'none' as const,
				overflow: 'hidden',
			},
		}),
	)

	const chips = h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const } },
			Segmented({ value: group?.id ?? '', options: groups.map(item => ({ value: item.id, label: item.label })), onChange: id => patch({ chips: id }) }),
			h('span', { style: { flex: 1 } }),
			Btn({ label: showHelp ? 'Hide syntax' : 'Syntax', title: 'What this model understands', onClick: () => setShowHelp(open => !open) }),
		),
		group
			? h(
					'div',
					{ style: { display: 'flex', flexWrap: 'wrap' as const, gap: 4 } },
					...group.chips.map(chip =>
						h(
							'button',
							{
								key: chip.label,
								className: 'kino-vo-chip',
								title: chip.title ?? 'Insert at the cursor',
								onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault(),
								onClick: () => insert(chip),
								style: {
									height: 22,
									padding: '0 8px',
									borderRadius: 11,
									border: `1px solid ${chip.run.kind === 'tag' ? 'rgba(167,139,250,0.28)' : 'rgba(var(--kp-ink),0.12)'}`,
									background: chip.run.kind === 'tag' ? 'rgba(167,139,250,0.08)' : 'rgba(var(--kp-ink),0.04)',
									color: chip.run.kind === 'tag' ? 'var(--kp-violet)' : 'rgba(var(--kp-ink),0.78)',
									fontSize: 11,
									fontFamily: chip.run.kind === 'tag' ? UI_FONT : MONO,
									cursor: 'pointer',
									whiteSpace: 'nowrap' as const,
								},
							},
							chip.run.kind === 'tag' ? `[${chip.label}]` : chip.label,
						),
					),
				)
			: null,
	)

	const helpRows = [...(isTagModel(modelId) ? HELP_TAGS : HELP_SSML), ...HELP_ALL]
	const help = showHelp
		? h(
				'div',
				{ style: { padding: '8px 10px', borderRadius: 6, background: 'rgba(var(--kp-ink),0.035)', border: `1px solid ${LINE}`, display: 'grid', gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.4fr)', gap: '5px 10px' } },
				...helpRows.flatMap(([code, note]) => [
					h('span', { key: `${code}-c`, style: { fontFamily: MONO, fontSize: 10.5, color: 'var(--kp-violet)', wordBreak: 'break-word' as const } }, code),
					h('span', { key: `${code}-n`, style: { fontSize: 11, color: DIM, lineHeight: 1.4 } }, note),
				]),
			)
		: null

	const editorBlock = h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
		sectionTitle('Text'),
		chips,
		help,
		editor,
		lint.length
			? h(
					'div',
					{ style: { display: 'flex', flexDirection: 'column', gap: 2 } },
					...lint.map(message => h('div', { key: message, style: { color: AMBER, fontSize: 11, lineHeight: 1.4 } }, message)),
				)
			: null,
	)

	const pct = (n: number) => `${Math.round(n * 100)}%`
	const settingsBlock = h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 2 } },
		sectionTitle(
			'Voice settings',
			Object.values(vs).some(value => value !== null)
				? h(
						'span',
						{
							onClick: () => setPrefs(current => ({ ...current, vsByVoice: { ...current.vsByVoice, [current.voiceId]: { ...EMPTY_VS } } })),
							style: { marginLeft: 'auto', textTransform: 'none' as const, letterSpacing: 0, fontWeight: 400, color: FAINT, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 },
						},
						'Reset to voice defaults',
					)
				: null,
		),
		h('div', { style: { height: 4 } }),
		isV3Only(modelId)
			? Row(
					'Stability',
					Segmented({
						value: vs.stability === null ? 'default' : vs.stability <= 0.25 ? '0' : vs.stability >= 0.75 ? '1' : '0.5',
						options: [
							{ value: 'default', label: 'Default', title: 'The voice’s saved setting' },
							{ value: '0', label: 'Creative', title: 'Most expressive and responsive to tags, can drift' },
							{ value: '0.5', label: 'Natural', title: 'Closest to the original voice' },
							{ value: '1', label: 'Robust', title: 'Very steady, follows tags less' },
						],
						onChange: value => setVs({ stability: value === 'default' ? null : Number(value) }),
					}),
					'v3 stability works in three steps',
				)
			: Slider({
					label: 'Stability',
					title: 'Lower is more expressive and varied, higher is steadier and more monotone',
					value: vs.stability,
					fallback: savedVs?.stability as number | undefined,
					min: 0,
					max: 1,
					step: 0.01,
					format: pct,
					onChange: value => setVs({ stability: value }),
				}),
		Slider({
			label: 'Similarity',
			title: 'How closely it sticks to the original voice. Too high can copy artifacts from the samples.',
			value: vs.similarity,
			fallback: savedVs?.similarity_boost as number | undefined,
			min: 0,
			max: 1,
			step: 0.01,
			format: pct,
			onChange: value => setVs({ similarity: value }),
		}),
		model?.canUseStyle
			? Slider({
					label: 'Style',
					title: 'Exaggerates the speaker style. Adds latency, 0 is the most stable.',
					value: vs.style,
					fallback: (savedVs?.style as number | undefined) ?? 0,
					min: 0,
					max: 1,
					step: 0.01,
					format: pct,
					onChange: value => setVs({ style: value }),
				})
			: null,
		Slider({
			label: 'Speed',
			title: '0.7× to 1.2×. Extremes can affect quality.',
			value: vs.speed,
			fallback: (savedVs?.speed as number | undefined) ?? 1,
			min: 0.7,
			max: 1.2,
			step: 0.01,
			format: n => `${n.toFixed(2)}×`,
			onChange: value => setVs({ speed: value }),
		}),
		cloneAllowed
			? Slider({
					label: 'Clone strength',
					title: 'How tightly v4 matches your professional clone samples. ElevenLabs recommends 0 unless the voice drifts.',
					value: vs.clone,
					fallback: 0,
					min: 0,
					max: 1,
					step: 0.01,
					format: pct,
					onChange: value => setVs({ clone: value }),
					resetLabel: 'Model default (0)',
				})
			: null,
		model?.canUseSpeakerBoost
			? Row(
					'Speaker boost',
					Segmented({
						value: vs.boost === null ? 'default' : vs.boost ? 'on' : 'off',
						options: [
							{ value: 'default', label: 'Default' },
							{ value: 'on', label: 'On' },
							{ value: 'off', label: 'Off' },
						],
						onChange: value => setVs({ boost: value === 'default' ? null : value === 'on' }),
					}),
					'Boosts likeness to the original speaker, adds a little latency',
				)
			: null,
	)

	const advCount = [
		adv.seed.trim(),
		languageValue,
		adv.normalization !== 'auto',
		adv.format !== DEFAULT_ADV.format,
		adv.name.trim(),
		adv.previous.trim() || adv.next.trim(),
		adv.dicts.length,
		adv.filter || adv.environment || adv.noise || adv.pan || adv.distance !== null,
		adv.pvcAsIvc && isPvc,
	].filter(Boolean).length

	const smallArea = (value: string, placeholder: string, onChange: (value: string) => void) =>
		h('textarea', {
			value,
			placeholder,
			rows: 2,
			className: 'kino-vo-ta-plain',
			onChange: (event: { target: { value: string } }) => onChange(event.target.value),
			style: { ...input, height: 'auto', minHeight: 44, padding: '5px 8px', lineHeight: 1.4, resize: 'vertical' as const, flex: 1, fontSize: 11.5 },
		})

	const fxOptions = (list: Fx[] | undefined, none: string) => [
		h('option', { key: '', value: '' }, none),
		...(list ?? []).map(item => h('option', { key: item.id, value: item.id, title: plain(item.description) }, plain(item.name))),
	]

	const advancedBlock = h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 4 } },
		h(
			'div',
			{
				onClick: () => setShowAdvanced(open => !open),
				style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' as const, padding: '2px 0' },
			},
			h('span', { style: { color: DIM, fontSize: 10, width: 10 } }, showAdvanced ? '▾' : '▸'),
			sectionTitle('Advanced'),
			advCount ? h('span', { style: { color: TEXT, fontSize: 10.5, padding: '0 5px', borderRadius: 8, background: 'rgba(var(--kp-ink),0.1)' } }, String(advCount)) : null,
			h('span', { style: { color: FAINT, fontSize: 11, marginLeft: 6 } }, 'seed, language, format, context, dictionaries, effects'),
		),
		showAdvanced
			? h(
					'div',
					{ style: { display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 16 } },
					Row(
						'Seed',
						h(
							'div',
							{ style: { display: 'flex', gap: 6, alignItems: 'center', flex: 1 } },
							h('input', {
								value: adv.seed,
								inputMode: 'numeric',
								placeholder: 'random',
								onChange: (event: { target: { value: string } }) => setAdv({ seed: event.target.value.replace(/\D/g, '').slice(0, 10) }),
								style: { ...input, width: 120, fontFamily: MONO },
							}),
							h('span', { style: { color: FAINT, fontSize: 11 } }, prefs.takes > 1 ? 'takes use seed, seed+1, …' : ''),
						),
						'Same seed and settings give a near-identical take. Leave empty for variety.',
					),
					model?.languages && model.languages.length > 1
						? Row(
								'Language',
								Select({
									value: languageValue,
									onChange: value => setAdv({ language: value }),
									options: [
										h('option', { key: '', value: '' }, 'Auto-detect'),
										...model.languages.map(language => h('option', { key: language.id, value: language.id }, `${plain(language.name)} (${language.id})`)),
									],
								}),
								'Forces the language. Auto works for most text.',
							)
						: null,
					Row(
						'Normalization',
						Segmented({
							value: adv.normalization,
							options: [
								{ value: 'auto', label: 'Auto' },
								{ value: 'on', label: 'On' },
								{ value: 'off', label: 'Off' },
							],
							onChange: value => setAdv({ normalization: value }),
						}),
						'Spells out numbers, dates and units before speaking',
					),
					Row(
						'Format',
						Select({ value: adv.format, onChange: value => setAdv({ format: value }), options: FORMATS.map(item => h('option', { key: item.value, value: item.value }, item.label)) }),
						'Some formats need a higher ElevenLabs plan. The API will say so.',
					),
					Row(
						'File name',
						h('input', {
							value: adv.name,
							placeholder: 'from the first words',
							onChange: (event: { target: { value: string } }) => setAdv({ name: event.target.value.slice(0, 80) }),
							style: { ...input, flex: 1 },
						}),
						'Used for the next generation only',
					),
					Row('Previous text', smallArea(adv.previous, 'What comes right before this line', value => setAdv({ previous: value.slice(0, 5000) })), 'Context for continuity, not spoken'),
					Row('Next text', smallArea(adv.next, 'What comes right after this line', value => setAdv({ next: value.slice(0, 5000) })), 'Context for continuity, not spoken'),
					Row(
						'Dictionaries',
						dicts === null
							? h('span', { style: { color: FAINT, fontSize: 11 } }, 'Loading…')
							: dicts.length
								? h(
										'div',
										{ style: { display: 'flex', flexDirection: 'column', gap: 2 } },
										...dicts.map(dict =>
											h(
												'label',
												{ key: dict.id, style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, color: TEXT, cursor: 'pointer' } },
												h('input', {
													type: 'checkbox',
													checked: adv.dicts.includes(dict.id),
													disabled: !adv.dicts.includes(dict.id) && adv.dicts.length >= 3,
													onChange: (event: { target: { checked: boolean } }) =>
														setAdv({ dicts: event.target.checked ? [...adv.dicts, dict.id].slice(0, 3) : adv.dicts.filter(id => id !== dict.id) }),
												}),
												plain(dict.name),
												dict.rules ? h('span', { style: { color: FAINT } }, `${dict.rules} rules`) : null,
											),
										),
									)
								: h('span', { style: { color: FAINT, fontSize: 11 } }, 'None on this account. Create them in ElevenLabs, they show up here.'),
						'Up to 3, applied in order',
					),
					Row(
						'Filter',
						Select({ value: adv.filter, onChange: value => setAdv({ filter: value }), disabled: !effects, options: fxOptions(effects?.filters, 'None') }),
						'Voice character: radio, phone, robot…',
					),
					Row(
						'Space',
						Select({ value: adv.environment, onChange: value => setAdv({ environment: value }), disabled: !effects, options: fxOptions(effects?.environments, 'Dry') }),
						'Room reverb',
					),
					adv.environment
						? Slider({
								label: 'Reverb amount',
								value: adv.sendLevel,
								min: 0,
								max: 1,
								step: 0.01,
								format: pct,
								onChange: value => setAdv({ sendLevel: value ?? 0.3 }),
								resetLabel: 'Default (30%)',
							})
						: null,
					Row(
						'Background',
						Select({ value: adv.noise, onChange: value => setAdv({ noise: value }), disabled: !effects, options: fxOptions(effects?.noises, 'Silence') }),
						'Ambience under the voice',
					),
					Slider({
						label: 'Distance',
						title: 'How far the speaker sounds from the mic',
						value: adv.distance,
						fallback: 0,
						min: 0,
						max: 1,
						step: 0.01,
						format: pct,
						onChange: value => setAdv({ distance: value }),
						resetLabel: 'Off',
					}),
					Slider({
						label: 'Pan',
						value: adv.pan === 0 ? null : adv.pan,
						fallback: 0,
						min: -1,
						max: 1,
						step: 0.05,
						format: n => (Math.abs(n) < 0.01 ? 'C' : n < 0 ? `L${Math.round(-n * 100)}` : `R${Math.round(n * 100)}`),
						onChange: value => setAdv({ pan: value ?? 0 }),
						resetLabel: 'Center',
					}),
					isPvc
						? Row(
								'Instant clone',
								h(
									'label',
									{ style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, color: TEXT, cursor: 'pointer' } },
									h('input', { type: 'checkbox', checked: adv.pvcAsIvc, onChange: (event: { target: { checked: boolean } }) => setAdv({ pvcAsIvc: event.target.checked }) }),
									'Use the instant clone of this voice instead of the fine-tuned one',
								),
								'Lower latency, usually less like you',
							)
						: null,
				)
			: null,
	)

	const compose = h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 12px 14px' } },
		voiceBlock,
		modelBlock,
		editorBlock,
		settingsBlock,
		advancedBlock,
	)

	const costLine = chars
		? `${fmtInt(chars)} characters  ·  about ${fmtInt(estimate)} credits${prefs.takes > 1 ? ` for ${prefs.takes} takes` : ''}`
		: 'Nothing to say yet'
	const generateBar = h(
		'div',
		{ style: { borderTop: `1px solid ${LINE}`, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6, background: BG, flexShrink: 0 } },
		confirm
			? h(
					'div',
					{
						style: {
							display: 'flex',
							alignItems: 'center',
							gap: 6,
							padding: '6px 8px',
							borderRadius: 6,
							background: 'rgba(252,211,77,0.08)',
							border: '1px solid rgba(252,211,77,0.25)',
							color: AMBER,
							fontSize: 11.5,
							flexWrap: 'wrap' as const,
						},
					},
					h(
						'span',
						{ style: { flex: 1, minWidth: 160 } },
						`This run uses about ${fmtInt(confirm.estimate)} credits${confirm.remaining !== null ? ` of the ${fmtInt(confirm.remaining)} left` : ''}. Go ahead?`,
					),
					Btn({ primary: true, label: 'Generate', onClick: () => generate(confirm.body, true), style: { height: 22, lineHeight: '22px', fontSize: 11 } }),
					Btn({ label: 'Cancel', onClick: () => setConfirm(null) }),
				)
			: null,
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'center', gap: 8 } },
			h('span', { style: { color: DIM, fontSize: 11 } }, 'Takes'),
			Segmented({
				value: String(prefs.takes),
				options: ['1', '2', '3', '4'].map(value => ({ value, label: value })),
				onChange: value => patch({ takes: Number(value) }),
			}),
			h(
				'span',
				{
					title: remaining !== null ? `${fmtInt(remaining)} credits left this cycle` : undefined,
					style: { flex: 1, minWidth: 0, color: overLimit ? AMBER : DIM, fontSize: 11, textAlign: 'right' as const, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
				},
				costLine,
			),
			Btn({
				primary: true,
				label: pending ? 'Generating…' : 'Generate',
				title: `Generate (${MOD_ENTER})`,
				disabled: !canGenerate,
				onClick: generateNow,
			}),
		),
	)

	// ---------- render: versions ----------
	const batches = useMemo(() => {
		const map = new Map<string, Take[]>()
		for (const item of history) {
			const list = map.get(item.batch) ?? []
			list.push(item)
			map.set(item.batch, list)
		}
		const list = [...map.entries()].map(([id, takes]) => ({ id, takes: takes.sort((a, b) => a.take - b.take) }))
		list.sort((a, b) => whenOf(b.takes[0]) - whenOf(a.takes[0]))
		return list
	}, [history])
	const visible = batches.filter(batch => !hidden.includes(batch.id))
	const hiddenCount = batches.length - visible.length

	const playButton = (active: boolean, playing: boolean, onClick: () => void, title: string) =>
		h(
			'button',
			{
				title,
				onClick: (event: { stopPropagation: () => void }) => {
					event.stopPropagation()
					onClick()
				},
				style: {
					width: 26,
					height: 26,
					borderRadius: 13,
					border: 'none',
					padding: 0,
					flexShrink: 0,
					cursor: 'pointer',
					background: active ? TEXT : 'rgba(var(--kp-ink),0.1)',
					color: active ? BG : TEXT,
					fontSize: playing ? 9 : 10,
					lineHeight: '26px',
					fontFamily: UI_FONT,
				},
			},
			playing ? '❚❚' : '▶',
		)

	const takeRow = (take: Take) => {
		if (take.error)
			return h('div', { key: `err-${take.take}`, style: { padding: '5px 0', color: RED, fontSize: 11, lineHeight: 1.4 } }, `V${take.take} failed: ${plain(take.error)}`)
		const key = take.file
		const path = audioPath(take.file)
		const active = now?.key === key
		const playing = Boolean(active && now?.playing)
		const state = busy[key]
		return h(
			'div',
			{ key, className: 'kino-vo-take', style: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px', margin: '0 -4px', borderRadius: 6, flexWrap: 'wrap' as const } },
			playButton(active, playing, () => toggle(key, path), playing ? 'Pause' : 'Play'),
			h('span', { title: take.seed !== null ? `Seed ${take.seed}` : undefined, style: { width: 20, color: active ? 'var(--kp-strong)' : DIM, fontSize: 11, fontWeight: 600 } }, `V${take.take}`),
			h(Wave, { key: `wave-${key}`, audioKey: key, path, active, audio: audioEl(), onSeek: (fraction: number, duration: number) => seek(key, path, fraction, duration) }),
			h('span', { style: { width: 38, textAlign: 'right' as const, color: DIM, fontFamily: MONO, fontSize: 11, flexShrink: 0 } }, fmtSec(take.duration)),
			h(
				'div',
				{ style: { display: 'flex', gap: 4, alignItems: 'center', marginLeft: 'auto' } },
				Btn({
					label: state === 'timeline' ? 'Placing…' : 'At playhead',
					title: 'Import into Kino and put it on the timeline at the playhead (2 Kino MCP calls, 1 if already in the library)',
					disabled: Boolean(state),
					onClick: () => importTake(take, true),
					style: { background: 'rgba(var(--kp-ink),0.1)', color: 'var(--kp-strong)' },
				}),
				take.mediaId
					? h('span', { title: `Kino media ${take.mediaId}`, style: { color: 'var(--kp-green)', fontSize: 10.5, padding: '0 2px' } }, 'In library')
					: Btn({ label: state === 'library' ? 'Importing…' : 'Library', title: 'Import into the Kino library only', disabled: Boolean(state), onClick: () => importTake(take, false) }),
				IconBtn('↗', SHOW_IN, () => reveal(take.file)),
			),
		)
	}

	const fxSummary = (req: Req | null) => {
		const fx = req?.audio_effects
		if (!fx) return ''
		const names = [fx.filter_preset_id, fx.environment_id, fx.background_noise_id].filter(Boolean).map(id => {
			const all = [...(effects?.filters ?? []), ...(effects?.environments ?? []), ...(effects?.noises ?? [])]
			return plain(all.find(item => item.id === id)?.name ?? labelOf(String(id)))
		})
		return names.length ? `fx: ${names.join(', ')}` : 'fx'
	}

	const card = { padding: '10px 12px', borderRadius: 8, background: 'rgba(var(--kp-ink),0.03)', border: `1px solid ${LINE}` }
	const batchCard = (batch: { id: string; takes: Take[] }) => {
		const first = batch.takes.find(take => !take.error) ?? batch.takes[0]
		const req = first.request
		const said = typeof req?.text === 'string' ? req.text : first.name
		const meta = [
			first.voiceName,
			modelName(first.modelId),
			fmtAgo(whenOf(first)),
			first.characters ? `${fmtInt(first.characters)} chars` : '',
			req?.voice_settings?.speed && req.voice_settings.speed !== 1 ? `${Number(req.voice_settings.speed).toFixed(2)}×` : '',
			fxSummary(req),
		]
			.filter(Boolean)
			.join('  ·  ')
		const reusable = Boolean(requestOf(first))
		return h(
			'div',
			{ key: batch.id, style: card },
			h(
				'div',
				{ style: { display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 } },
				h(
					'div',
					{ style: { flex: 1, minWidth: 0 } },
					h('div', { title: said, style: { ...clamp(3), color: TEXT, fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const } }, said),
					h('div', { style: { marginTop: 3, color: DIM, fontSize: 11 } }, meta),
				),
				h(
					'div',
					{ style: { display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0 } },
					Btn({ label: 'Reuse', title: 'Load this text and its settings into the editor', disabled: !reusable, onClick: () => reuse(first) }),
					Btn({
						label: 'Again',
						title: `New takes of the same text and settings, about ${fmtInt(Math.ceil((req?.text?.trim().length ?? 0) * (sortedModels.find(m => m.id === first.modelId)?.costFactor ?? 1) * (first.takes || 1)))} credits`,
						disabled: !reusable || Boolean(pending) || bridge !== 'ok',
						onClick: () => again(first),
					}),
					IconBtn('×', 'Hide from this list. Files stay in the folder.', () => hide(batch.id)),
				),
			),
			...batch.takes.map(takeRow),
		)
	}

	const pendingCard = pending
		? h(
				'div',
				{ key: 'pending', style: { ...card, borderColor: 'rgba(var(--kp-ink),0.14)' } },
				h('div', { style: { ...clamp(3), color: TEXT, fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-wrap' as const, marginBottom: 2 } }, pending.text),
				h(
					'div',
					{ style: { color: DIM, fontSize: 11, marginBottom: 6 } },
					`${plain(pending.voiceName)}  ·  ${modelName(pending.modelId)}  ·  generating ${pending.takes} take${pending.takes > 1 ? 's' : ''}  ·  ${Math.round((Date.now() - pending.startedAt) / 1000)}s`,
				),
				...Array.from({ length: pending.takes }, (_, index) =>
					h(
						'div',
						{ key: index, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' } },
						h('span', { style: { width: 26, height: 26, borderRadius: 13, background: 'rgba(var(--kp-ink),0.06)', flexShrink: 0 } }),
						h('span', { style: { width: 20, color: FAINT, fontSize: 11, fontWeight: 600 } }, `V${index + 1}`),
						h('div', {
							style: {
								flex: 1,
								height: 20,
								borderRadius: 4,
								background: 'linear-gradient(90deg, rgba(var(--kp-ink),0.03) 0%, rgba(var(--kp-ink),0.11) 50%, rgba(var(--kp-ink),0.03) 100%)',
								backgroundSize: '200% 100%',
								animation: `kino-vo-shimmer 1.6s linear ${index * 0.15}s infinite`,
							},
						}),
					),
				),
			)
		: null

	const outDir = historyDir || status?.outputDir || (IS_WIN ? 'Documents\\ElevenLabs Voiceover' : '~/Documents/ElevenLabs Voiceover')
	const versions = h(
		'div',
		{ ref: versionsRef, style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 12px 16px' } },
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'center', gap: 6 } },
			sectionTitle('Versions', visible.length ? h('span', { style: { color: FAINT, fontWeight: 400 } }, String(visible.length)) : null),
			h('span', { style: { flex: 1 } }),
			Btn({ label: 'Folder', title: `Open ${tildify(outDir)}`, onClick: () => reveal() }),
		),
		pendingCard,
		...visible.slice(0, batchLimit).map(batchCard),
		visible.length > batchLimit
			? h('div', null, Btn({ label: `Show older (${visible.length - batchLimit})`, onClick: () => setBatchLimit(limit => limit + BATCH_PAGE) }))
			: null,
		!visible.length && !pending
			? h(
					'div',
					{ style: { padding: '14px 2px', color: DIM, fontSize: 12, lineHeight: 1.6 } },
					h('div', { style: { color: TEXT, fontWeight: 600, marginBottom: 4 } }, 'No takes yet'),
					`Write something, pick how many takes, press Generate (${MOD_ENTER}). Each take is saved to `,
					h('span', { style: { fontFamily: MONO, color: TEXT } }, tildify(outDir)),
					' with a JSON sidecar of the exact settings, so you can come back to it later.',
				)
			: null,
		hiddenCount
			? h(
					'div',
					{ style: { color: FAINT, fontSize: 11 } },
					`${hiddenCount} hidden. `,
					h('span', { onClick: () => setHidden([]), style: { cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 } }, 'Show all'),
				)
			: null,
	)

	// ---------- render: chrome ----------
	const dot = { ok: 'var(--kp-green-2)', checking: 'var(--kp-muted)', pairing: 'var(--kp-yellow)', unpaired: 'var(--kp-yellow)', outdated: 'var(--kp-yellow)', nokey: 'var(--kp-yellow)', offline: 'var(--kp-red-2)' }[bridge]
	const resetDate = quota?.resetUnix ? new Date(quota.resetUnix * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
	const header = h(
		'div',
		{
			style: { display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 8px 0 12px', borderBottom: `1px solid ${LINE}`, flexShrink: 0, userSelect: 'none' as const },
		},
		h('span', {
			title: bridge === 'ok' ? `Bridge connected${status?.sdk ? `, ElevenLabs SDK ${status.sdk}` : ''}` : bridge,
			style: { width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 },
		}),
		h('span', { style: { color: TEXT, fontSize: 12, fontWeight: 600 } }, 'Voiceover'),
		bridge === 'ok' ? h(Boundary, { fallback: null }, h(PlayheadProbe, { sink: playheadRef })) : null,
		h('span', { style: { flex: 1 } }),
		quota
			? h(
					'span',
					{
						title: `${quota.tier ? `${quota.tier[0].toUpperCase()}${quota.tier.slice(1)} plan: ` : ''}${fmtInt(quota.used)} of ${fmtInt(quota.limit)} credits used${resetDate ? `, resets ${resetDate}` : ''}`,
						style: { color: DIM, fontSize: 11, whiteSpace: 'nowrap' as const },
					},
					`${fmtInt(remaining ?? 0)} credits left`,
				)
			: null,
		IconBtn('↻', 'Reload voices, models, credits and versions', () => loadAll(true), bridge !== 'ok'),
	)

	const code = (value: string) =>
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
			value,
		)

	const overlayCard = (title: string, body: unknown, action?: { label: string; onClick: () => void }) =>
		h(
			'div',
			{ style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(var(--kp-bg-rgb),0.96)', zIndex: 5 } },
			h(
				'div',
				{ style: { maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 10, color: 'rgba(var(--kp-ink),0.7)', fontSize: 12, lineHeight: 1.5 } },
				h('div', { style: { color: 'var(--kp-strong)', fontSize: 14, fontWeight: 600 } }, title),
				body,
				bridgeNote ? h('div', { style: { color: RED } }, plain(bridgeNote)) : null,
				action ? h('div', null, Btn({ primary: true, label: action.label, onClick: action.onClick })) : null,
			),
		)

	const startCmd = START_BRIDGE
	const overlay =
		bridge === 'checking'
			? overlayCard('Connecting…', h('div', null, `Looking for the Kino bridge on ${MACHINE}.`))
			: bridge === 'unpaired'
				? overlayCard(
						'Connect to the Kino bridge',
						h(
							'div',
							null,
							`Voiceover runs through the same local bridge as the Terminal and YT Downloader panels. Click Connect, then choose ${ALLOW} in ${PAIR_DIALOG}. If one of those panels is already connected, this one is too.`,
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
									h('div', null, `The bridge running now predates voiceover support. Stop it (Ctrl+C in the window running it) and start it again. ${START_BRIDGE_HINT}`),
									code(startCmd),
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
										code(startCmd),
									),
									{ label: 'Check again', onClick: check },
								)
							: bridge === 'nokey'
								? overlayCard(
										'ElevenLabs is not set up',
										h(
											'div',
											{ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
											h(
												'div',
												null,
												`The speech worker could not find an ElevenLabs API key. It lives in .env.local in the voice folder on ${MACHINE}, and only the worker reads it. Connect your account in a terminal, then restart the bridge:`,
											),
											code(status?.voiceDir ? `cd "${status.voiceDir}"` : IS_MAC ? 'cd ~/.local/share/elevenlabs-voice' : 'cd "$env:LOCALAPPDATA\\elevenlabs-voice"'),
											code('npx -y @elevenlabs/cli@latest onboard connect --env-path .env.local'),
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
						left: 12,
						right: 12,
						bottom: 58,
						padding: '8px 10px',
						borderRadius: 6,
						background: flash.tone === 'error' ? 'var(--kp-error-bg)' : 'var(--kp-toast)',
						border: `1px solid ${flash.tone === 'error' ? 'rgba(252,165,165,0.3)' : 'rgba(var(--kp-ink),0.1)'}`,
						color: flash.tone === 'error' ? RED : TEXT,
						fontSize: 12,
						lineHeight: 1.4,
						boxShadow: '0 6px 20px var(--kp-shadow)',
						cursor: 'pointer',
						zIndex: 4,
					},
				},
				flash.text,
			)
		: null

	const wide = width >= 760
	const body = wide
		? h(
				'div',
				{ style: { display: 'flex', flex: 1, minHeight: 0 } },
				h(
					'div',
					{ style: { width: '52%', minWidth: 380, maxWidth: 720, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${LINE}` } },
					h('div', { className: 'kino-vo-scroll', style: { flex: 1, minHeight: 0, overflowY: 'auto' as const } }, compose),
					generateBar,
				),
				h('div', { className: 'kino-vo-scroll', style: { flex: 1, minWidth: 0, overflowY: 'auto' as const } }, versions),
			)
		: h(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } },
				h('div', { className: 'kino-vo-scroll', style: { flex: 1, minHeight: 0, overflowY: 'auto' as const } }, compose, h('div', { style: { borderTop: `1px solid ${LINE}` } }), versions),
				generateBar,
			)

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
				colorScheme: 'var(--kp-scheme)',
			},
		},
		header,
		body,
		overlay,
		toast,
	)
}

const EDITOR_TEXT = {
	margin: 0,
	padding: '10px 12px',
	boxSizing: 'border-box' as const,
	fontFamily: UI_FONT,
	fontSize: 13.5,
	lineHeight: '21px',
	letterSpacing: 'normal',
	whiteSpace: 'pre-wrap' as const,
	overflowWrap: 'break-word' as const,
	wordBreak: 'normal' as const,
	tabSize: 4,
	textAlign: 'left' as const,
}
