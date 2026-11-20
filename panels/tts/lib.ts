// Voiceover panel: constants, types, the audio cache and the per-model syntax rules. No React in here.
import { apiBlob } from '../bridge'
import { MONO_FONT, UI_FONT as PLATFORM_UI_FONT } from '../platform'

export const PREFS_KEY = 'kino-voiceover:prefs'
export const DRAFT_KEY = 'kino-voiceover:draft'
export const HIDDEN_KEY = 'kino-voiceover:hidden'
export const STYLE_ID = 'kino-vo-css'
export const DEFAULT_MODEL = 'eleven_v4'
export const MODEL_ORDER = [
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
export const PHONEME_MODELS = ['eleven_flash_v2', 'eleven_turbo_v2', 'eleven_monolingual_v1']
// 128 kbps MP3 first: it is the default because every ElevenLabs plan can make it, the free one included.
export const FORMATS = [
	{ value: 'mp3_44100_128', label: 'MP3 44.1 kHz, 128 kbps' },
	{ value: 'mp3_44100_192', label: 'MP3 44.1 kHz, 192 kbps (paid plans)' },
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
export const BATCH_PAGE = 12

export const UI_FONT = PLATFORM_UI_FONT
export const MONO = MONO_FONT
export const BG = 'var(--kp-bg)'
export const TEXT = 'var(--kp-text)'
export const DIM = 'var(--kp-dim)'
export const FAINT = 'rgba(var(--kp-ink),0.3)'
export const LINE = 'var(--kp-line)'
export const RED = 'var(--kp-red)'
export const AMBER = 'var(--kp-amber)'

// What GET /tts/status says about this computer. Fields past `defaults` are missing on an older bridge.
export type Status = {
	hasKey?: boolean
	outputDir?: string
	sdk?: string
	voiceDir?: string
	defaults?: { voiceId?: string | null; modelId?: string | null; outputFormat?: string | null }
	configFile?: string
	defaultDir?: string
	ffprobe?: boolean
	ffprobeInstall?: string
}
export type Voice = {
	id: string
	name: string
	category: string
	labels: Record<string, string> | null
	description: string | null
	previewUrl: string | null
	fineTuned: string[]
	settings: Record<string, number | boolean> | null
}
export type Model = {
	id: string
	name: string
	description: string | null
	canUseStyle: boolean
	canUseSpeakerBoost: boolean
	maxChars: number | null
	costFactor: number
	languages: { id: string; name: string }[]
}
export type Req = { [key: string]: any }
export type Take = {
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
export type Quota = { tier: string | null; used: number; limit: number; resetUnix: number | null }
export type Dict = { id: string; versionId: string; name: string; rules?: number | null; description?: string | null }
export type Fx = { id: string; name: string; description?: string | null }
export type Effects = { filters: Fx[]; environments: Fx[]; noises: Fx[] }
export type VS = { stability: number | null; similarity: number | null; style: number | null; speed: number | null; boost: boolean | null; clone: number | null }
export type Adv = {
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
export type Prefs = { voiceId: string; modelId: string; takes: number; vsByVoice: Record<string, VS>; adv: Adv; chips: string }
export type Pending = { text: string; takes: number; startedAt: number; voiceName: string; modelId: string }

export const EMPTY_VS: VS = { stability: null, similarity: null, style: null, speed: null, boost: null, clone: null }
export const DEFAULT_ADV: Adv = {
	seed: '',
	language: '',
	normalization: 'auto',
	format: 'mp3_44100_128',
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

// ---------- audio cache: blob URL + waveform peaks per file ----------
export type Loaded = { url: string; peaks: number[]; duration: number }
export const audioCache = new Map<string, Promise<Loaded>>()
export const PEAKS = 160
export const loadAudio = (key: string, path: string): Promise<Loaded> => {
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
export const audioPath = (file: string) => `/tts/audio?file=${encodeURIComponent(file)}`

// ---------- helpers ----------
export const readJson = (key: string, fallback: any) => {
	try {
		const value = JSON.parse(localStorage.getItem(key) ?? 'null')
		return value ?? fallback
	} catch {
		return fallback
	}
}
export const writeJson = (key: string, value: unknown) => {
	try {
		localStorage.setItem(key, JSON.stringify(value))
	} catch {}
}
export const drop = (object: Req) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ''))
export const plain = (text: unknown) => (typeof text === 'string' ? text.replace(/\s*[\u2014\u2013]\s*/g, ', ') : '')
export const pad = (n: number) => String(n).padStart(2, '0')
export const fmtInt = (n: number) => new Intl.NumberFormat('en').format(Math.round(n))
export const fmtSec = (seconds: number | null | undefined) => {
	if (seconds == null || !Number.isFinite(seconds)) return ''
	if (seconds < 60) return `${seconds.toFixed(1)}s`
	const s = Math.round(seconds)
	return `${Math.floor(s / 60)}:${pad(s % 60)}`
}
export const fmtTc = (frame: number | null | undefined, fps: number | null | undefined) => {
	if (frame == null || !fps) return '--:--'
	const whole = Math.floor(frame / fps)
	const f = Math.round(frame - whole * fps)
	const hours = Math.floor(whole / 3600)
	const minutes = Math.floor((whole % 3600) / 60)
	return `${hours ? `${hours}:${pad(minutes)}` : pad(minutes)}:${pad(whole % 60)}:${pad(f)}`
}
export const fmtAgo = (ms: number) => {
	if (!Number.isFinite(ms)) return ''
	const minutes = Math.round((Date.now() - ms) / 60000)
	if (minutes < 1) return 'just now'
	if (minutes < 60) return `${minutes} min ago`
	const hours = Math.round(minutes / 60)
	return hours < 24 ? `${hours} h ago` : new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
export const whenOf = (take: Take) => {
	const parsed = take.created ? Date.parse(take.created) : NaN
	return Number.isFinite(parsed) ? parsed : take.mtime
}
export const tildify = (dir: string) => dir.replace(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/, '~')
export const isTagModel = (id: string) => /^eleven_v[34]/.test(id)
export const isV4 = (id: string) => id.startsWith('eleven_v4')
export const isV3Only = (id: string) => id.startsWith('eleven_v3')
export const shortModel = (name: string) => plain(name).replace(/^Eleven\s+/i, '')
export const labelOf = (value: string) => value.replace(/_/g, ' ')
export const CATEGORY: Record<string, string> = { professional: 'Professional clone', cloned: 'Instant clone', generated: 'Designed voice', premade: 'Default voice' }

// ---------- syntax ----------
export type Seg = { text: string; kind?: string }
export const SEG_STYLE: Record<string, object> = {
	tag: { color: 'var(--kp-violet)', background: 'rgba(167,139,250,0.16)', borderRadius: 3 },
	break: { color: AMBER, background: 'rgba(252,211,77,0.12)', borderRadius: 3 },
	ipa: { color: 'var(--kp-cyan)', background: 'rgba(103,232,249,0.12)', borderRadius: 3 },
	pause: { color: 'var(--kp-green)' },
	caps: { color: 'var(--kp-strong)', textDecoration: 'underline', textDecorationColor: 'rgba(var(--kp-ink),0.45)', textUnderlineOffset: 3 },
	bad: { color: RED, background: 'rgba(252,165,165,0.12)', borderRadius: 3, textDecoration: 'underline wavy rgba(252,165,165,0.7)' },
}
export const segmentsOf = (text: string, modelId: string): Seg[] => {
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

export const lintOf = (text: string, model: Model | undefined, modelId: string) => {
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

export type Chip = { label: string; title?: string; run: { kind: 'tag' | 'raw' | 'wrap' | 'caps'; a?: string; b?: string; select?: boolean } }
export const tag = (name: string, title?: string): Chip => ({ label: name, title, run: { kind: 'tag', a: name } })
export const chipGroups = (modelId: string): { id: string; label: string; chips: Chip[] }[] => {
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

export const HELP_TAGS = [
	['[whispers] [excited] [sarcastic]', 'Audio tags in square brackets steer the words after them. Free-form tags like [nervously] often work too.'],
	['[laughs] [sighs] [applause]', 'Reactions and sound effects, placed where they should happen.'],
	['[short pause] [long pause] ...', 'Pauses. <break> tags are ignored on v3 and v4.'],
	['CAPS', 'Emphasis on a word. Punctuation (! ? ...) shapes rhythm.'],
	['[strong French accent]', 'Accent switch for what follows.'],
	['/ˈkiːnoʊ/', 'v4 only: IPA between slashes for exact pronunciation.'],
	['Stability', 'v3: Creative is most expressive but can drift, Natural stays closest to the voice, Robust is steady but follows tags less.'],
]
export const HELP_SSML = [
	['<break time="1.5s" />', 'Pause of up to 3 seconds. Too many in one take can make it unstable.'],
	['<phoneme alphabet="ipa" ph="ˈkiːnoʊ">Kino</phoneme>', 'Exact pronunciation on Flash v2, Turbo v2 and English v1. alphabet="cmu-arpabet" also works.'],
	['[tags]', 'Not supported: these models read square brackets out loud. Switch to v3 or v4 for tags.'],
	['Style', 'Multilingual v2: exaggerates the speaker style. Leave at 0 for the most stable read.'],
]
export const HELP_ALL = [
	['Dictionaries', 'Pronunciation dictionaries apply to every model (Advanced, up to 3).'],
	['Previous / next text', 'Context for continuity when a line is part of a longer read.'],
	['Text normalization', 'Spells out numbers, dates and units. Auto lets the model decide.'],
]
