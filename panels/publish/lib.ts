// Publish panel: platform specs, character counting, the post plan model, time zones, the Zernio
// payload builder and the request the panel sends to the chat agent. No React in here.
// The Zernio key never reaches the panel: the local bridge holds it and talks to Zernio.
import type { Delivery } from './media'

export const PLAN_PATH = '/publish/plan.json'
export const PLAN_BACKUP_PATH = '/publish/plan.unreadable.json'
export const COPY_PATH = '/publish/copy.json'
export const RULES_PATH = '/publish/skill/rules.json'
export const SKILL_FILES = '/publish/skill/SKILL.md, /publish/skill/rules.json and /publish/skill/format.md'
// Everything about one brand lives here and belongs to the user: voice, facts, links, words to avoid,
// extra skills to load, a rewrite pass to run. README.md says what to read.
export const KNOWLEDGE_README = '/publish/knowledge/README.md'

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
export const rid = () => Math.random().toString(36).slice(2, 10)
export const uuid = () => (crypto as any).randomUUID?.() ?? `${rid()}-${rid()}-${rid()}-${rid()}`
export const fmtBytes = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)
export const baseName = (file: string) => file.split(/[\\/]/).pop() || file
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
// Small stable hash, used to tell whether a piece of copy changed
export const hash = (text: string) => {
	let h = 5381
	for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
	return (h >>> 0).toString(36)
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : [])
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {})
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
const int = (v: unknown, min: number, max: number, fallback: number) => {
	const n = Math.round(Number(v))
	return Number.isFinite(n) && v !== null && v !== '' ? Math.min(max, Math.max(min, n)) : fallback
}
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback)

// Pull a chat id out of whatever chat::NewChat returned
export const findChatId = (value: unknown): string | null => {
	if (!value) return null
	if (typeof value === 'string') return /^[\w-]{6,}$/.test(value) ? value : null
	if (typeof value !== 'object') return null
	const o = value as Record<string, unknown>
	// Kino returns the id as a bare string under `result`: { actionId, ran, result: '<chatId>' }
	for (const key of ['chatId', 'conversationId', 'id', 'result']) if (typeof o[key] === 'string' && /^[\w-]{6,}$/.test(o[key] as string)) return o[key] as string
	for (const v of Object.values(o)) {
		const found = typeof v === 'object' ? findChatId(v) : null
		if (found) return found
	}
	return null
}

// ---------- platforms ----------
export type PlatformKey = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'linkedin' | 'twitter' | 'threads' | 'bluesky'
export const PLATFORM_KEYS: PlatformKey[] = ['youtube', 'tiktok', 'instagram', 'facebook', 'linkedin', 'twitter', 'threads', 'bluesky']

type Spec = { label: string; title?: number; text: number; firstComment?: number; thread?: boolean; tags?: number; video: 'main' | 'vertical'; color: string }
// Hard limits from the Zernio API reference and platform docs. rules.json from the skill can tighten them.
export const SPEC: Record<PlatformKey, Spec> = {
	youtube: { label: 'YouTube', title: 100, text: 5000, firstComment: 10000, tags: 500, video: 'main', color: '#ff4e45' },
	tiktok: { label: 'TikTok', text: 2200, video: 'vertical', color: '#25f4ee' },
	instagram: { label: 'Instagram', text: 2200, firstComment: 2200, video: 'vertical', color: '#e1306c' },
	facebook: { label: 'Facebook', title: 255, text: 63206, firstComment: 8000, video: 'main', color: '#1877f2' },
	linkedin: { label: 'LinkedIn', text: 3000, firstComment: 1250, video: 'main', color: '#0a66c2' },
	twitter: { label: 'X', text: 280, thread: true, video: 'main', color: 'var(--kp-brand-x)' },
	threads: { label: 'Threads', text: 500, firstComment: 500, thread: true, video: 'vertical', color: 'var(--kp-brand-threads)' },
	bluesky: { label: 'Bluesky', text: 300, thread: true, video: 'main', color: '#1185fe' },
}
export const labelOf = (key: string) => SPEC[key as PlatformKey]?.label ?? key
export const labels = (keys: readonly string[]) => keys.map(labelOf).join(', ')

// What the panel reads from /publish/skill/rules.json. Everything is optional: without the file the
// built-in limits and choices apply.
export type Rules = {
	voice?: { banned?: string[] }
	platforms?: Partial<
		Record<PlatformKey, { limits?: { title?: number; text?: number; textPremium?: number; hashtagsMax?: number; tagsTotal?: number; tagMax?: number; foldChars?: number; urlChars?: number }; hashtags?: { recommended?: [number, number] } }>
	>
	params?: { tone?: Record<string, unknown>; length?: Record<string, unknown>; cta?: Record<string, unknown>; emoji?: Record<string, unknown> }
}
export const parseRules = (text?: string): Rules | null => {
	if (!text) return null
	try {
		const rules = JSON.parse(text)
		return rules && typeof rules === 'object' && !Array.isArray(rules) ? rules : null
	} catch {
		return null
	}
}

const pos = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined)
export type Limits = { title?: number; text: number; hashtagsMax?: number; tagsTotal: number; tagMax: number; foldChars?: number; recommended?: [number, number]; urlChars: number }
export const limitsFor = (key: PlatformKey, rules: Rules | null, premiumX = false): Limits => {
	const r = obj(rules?.platforms?.[key])
	const l = obj(r.limits)
	const base = SPEC[key]
	// the skill may ask for less than the platform allows, never for more
	const cap = (v: unknown, hard: number) => Math.min(pos(v) ?? hard, hard)
	const rec = obj(r.hashtags).recommended
	return {
		title: base.title ? cap(l.title, base.title) : undefined,
		text: key === 'twitter' && premiumX ? Math.min(pos(l.textPremium) ?? 25000, 25000) : cap(l.text, base.text),
		hashtagsMax: typeof l.hashtagsMax === 'number' && l.hashtagsMax >= 0 ? l.hashtagsMax : undefined,
		tagsTotal: cap(l.tagsTotal, base.tags ?? 500),
		tagMax: cap(l.tagMax, 100),
		foldChars: pos(l.foldChars),
		recommended: Array.isArray(rec) && rec.length === 2 && rec.every(n => typeof n === 'number') ? (rec as [number, number]) : undefined,
		urlChars: pos(l.urlChars) ?? 23,
	}
}

// ---------- counting ----------
const segmenter = (() => {
	try {
		return new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' })
	} catch {
		return null
	}
})()
const graphemes = (text: string): string[] => (segmenter ? Array.from(segmenter.segment(text), (s: any) => s.segment as string) : [...text])
// emoji as X sees them: pictographs, flags (two regional indicators) and keycaps
const PICTO = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u
const URLS = /\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+\.[^\s<>"']+/gi
// twitter-text weights: Latin, Greek, Cyrillic and common punctuation count 1, everything else 2
const xWeight = (cp: number) => (cp <= 0x10ff || (cp >= 0x2000 && cp <= 0x200d) || (cp >= 0x2010 && cp <= 0x201f) || (cp >= 0x2032 && cp <= 0x2037) ? 1 : 2)
/** Length the way X counts it: every link is 23, every emoji 2, CJK 2. */
export const countX = (text: string, urlChars = 23) => {
	let n = 0
	const rest = text.normalize('NFC').replace(URLS, match => {
		n += urlChars
		return /[.,;:!?)\]]+$/.exec(match)?.[0] ?? '' // punctuation after a link is not part of it
	})
	for (const g of graphemes(rest)) n += PICTO.test(g) ? 2 : [...g].reduce((sum, c) => sum + xWeight(c.codePointAt(0) ?? 0), 0)
	return n
}
const bytes = (text: string) => new TextEncoder().encode(text).length
export const chars = (text: string) => [...text].length
/**
 * Length of a post body the way each platform counts it: X weighs links and emoji, Bluesky counts
 * what the reader sees (graphemes), the YouTube API counts bytes, the rest count UTF-16 units,
 * so an emoji is 2 there. When unsure this errs on the high side.
 */
export const measure = (key: PlatformKey, text: string, urlChars = 23) => (key === 'twitter' ? countX(text, urlChars) : key === 'bluesky' ? graphemes(text).length : key === 'youtube' ? bytes(text) : text.length)

// ---------- copy.json (written by the agent) ----------
export type Option = { id: string; angle: string; title?: string; text: string; hashtags: string[]; tags?: string[]; firstComment?: string; thread?: string[]; why?: string }
export type CopyDoc = { requestId: string; updated: string; platforms: Partial<Record<PlatformKey, { options: Option[]; notes?: string }>> }

// A block of nothing but hashtags at the end of the text belongs in the hashtags field: the panel
// appends that field itself, so leaving the block in would post the tags twice.
const TRAILING_TAGS = /\n\s*((?:#[\p{L}\p{N}_]+[ \t]*)+)\s*$/u
const splitTags = (text: string, tags: string[]) => {
	const match = TRAILING_TAGS.exec(text)
	if (!match) return { text, tags }
	return { text: text.slice(0, match.index).trimEnd(), tags: [...tags, ...match[1].trim().split(/\s+/)] }
}

/** copy.json as the panel uses it. `error` is set when the file exists but cannot be used. */
export const parseCopy = (text?: string): { copy: CopyDoc | null; error: string } => {
	if (!text || !text.trim()) return { copy: null, error: '' }
	let raw: any
	try {
		raw = JSON.parse(text)
	} catch (error) {
		return { copy: null, error: `copy.json is not valid JSON (${error instanceof Error ? error.message : 'parse error'}). Ask the agent to write it again.` }
	}
	const platforms: CopyDoc['platforms'] = {}
	for (const key of PLATFORM_KEYS) {
		const p = obj(obj(obj(raw).platforms)[key])
		if (!Array.isArray(p.options)) continue
		const options: Option[] = []
		p.options.slice(0, 6).forEach((item: unknown, i: number) => {
			const o = obj(item)
			const split = splitTags(str(o.text).trim(), strs(o.hashtags))
			if (!split.text && !str(o.title).trim()) return // nothing to post
			options.push({
				id: str(o.id) || `${key}-${i + 1}`,
				angle: str(o.angle) || `Option ${i + 1}`,
				title: str(o.title).trim() || undefined,
				text: split.text,
				hashtags: hashtagList(split.tags.join(' ')),
				tags: strs(o.tags),
				firstComment: str(o.firstComment).trim() || undefined,
				thread: strs(o.thread),
				why: str(o.why) || undefined,
			})
		})
		if (options.length) platforms[key] = { notes: str(p.notes) || undefined, options }
	}
	return { copy: { requestId: str(obj(raw).requestId), updated: str(obj(raw).updated), platforms }, error: '' }
}
/** Identity of an option's wording, so the panel notices when the agent reuses an id for new text. */
export const optionHash = (o: Option) => hash(JSON.stringify([o.title ?? '', o.text, o.hashtags, o.tags ?? [], o.firstComment ?? '', o.thread ?? []]))
export const optionsHash = (copy: CopyDoc | null, key: PlatformKey) => (copy?.platforms[key]?.options ?? []).map(optionHash).join('.')

// ---------- plan.json (owned by the panel) ----------
export type Params = { tone: string; length: string; cta: string; link: string; keywords: string; emoji: string; hashtags: number; language: string; humanize: number; audience: string; notes: string }
export type When = 'now' | 'schedule' | 'draft'
const WHENS: readonly When[] = ['now', 'schedule', 'draft']
/** The words of one platform's post. */
export type Draft = { pick: string; src: string; title: string; text: string; hashtags: string; tags: string; firstComment: string; thread: string[] }
export type PlatPlan = Draft & {
	on: boolean
	accountId: string
	// pick: option id the copy came from; src: that option's hash when it was picked
	// hashtags: space separated, as typed; tags: YouTube, comma separated; thread: follow-up posts
	undo?: Draft // what the editor held before the last option switch or reset
	note: string // extra brief for this platform only
	when: When // always the value in effect: the plan's own when unless ownWhen
	at: string // datetime-local value, wall time in plan.timezone
	ownWhen: boolean
	video: 'main' | 'vertical'
	opts: Record<string, any>
}
export type Upload = { url: string; at: number }
// YouTube ignores a thumbnail passed with the upload, so the panel sets it once YouTube has the video
export type ThumbJob = { state: 'pending' | 'done' | 'error'; url: string; name?: string; note?: string }
export type HistoryEntry = { at: string; postId?: string; mode: When; platforms: PlatformKey[]; status: string; http?: number; urls?: Partial<Record<PlatformKey, string>>; errors?: string[]; thumb?: ThumbJob }
/**
 * What became of the last send for one platform.
 * 'rejected' means the request was refused and no post exists, so the platform goes out with the next send.
 * Every other status means a Zernio post exists, and the platform is left alone until the user clears it.
 */
export type SentStatus = 'published' | 'publishing' | 'scheduled' | 'draft' | 'failed' | 'rejected'
export type Sent = { at: string; mode: When; when?: string; postId?: string; status: SentStatus; url?: string; error?: string }
/** A create request that left the panel and got no clear answer. Kept until its outcome is known. */
export type Pending = { key: string; mode: When; at: string; keys: PlatformKey[]; payload: Record<string, any>; sentAt: number; error?: string }
export type Plan = {
	version: 1
	chatId?: string
	// seen: hash of each requested platform's options when the request went out
	pendingRequest?: { requestId: string; platforms: PlatformKey[]; at: number; seen?: Record<string, string> }
	profileId: string
	timezone: string
	when: When
	at: string
	// main, vertical: Kino media ids. cover169, cover916: file name of a Thumbnails export, '' for the newest, 'none' for no cover.
	// mainPath, verticalPath: only read from older files. Paths now stay on the device (usePaths).
	media: { main: string; mainPath: string; vertical: string; verticalPath: string; cover169: string; cover916: string }
	uploads: Record<string, Upload>
	params: Params
	platforms: Record<PlatformKey, PlatPlan>
	sent: Partial<Record<PlatformKey, Sent>>
	outbox: Pending[]
	history: HistoryEntry[]
}

export const localZone = () => {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
	} catch {
		return 'UTC'
	}
}
const validZone = (tz: string) => {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz })
		return !!tz
	} catch {
		return false
	}
}

export const DEFAULT_OPTS: Record<PlatformKey, Record<string, any>> = {
	youtube: { visibility: 'public', madeForKids: false, notifySubscribers: true, categoryId: '22', playlistId: '', containsSyntheticMedia: false },
	tiktok: { privacyLevel: '', allowComment: true, allowDuet: true, allowStitch: true, commercialContentType: 'none', videoMadeWithAi: false, inboxDraft: false },
	instagram: { shareToFeed: true, isAiGenerated: false, collaborators: '' },
	facebook: { contentType: 'feed', isAiGenerated: false },
	linkedin: {},
	twitter: { replySettings: '', premium: false, madeWithAi: false },
	threads: { topic_tag: '' },
	bluesky: {},
}

const normDraft = (raw: unknown): Draft => {
	const d = obj(raw)
	return { pick: str(d.pick), src: str(d.src), title: str(d.title), text: str(d.text), hashtags: str(d.hashtags), tags: str(d.tags), firstComment: str(d.firstComment), thread: strs(d.thread) }
}
export const draftOf = (p: Draft): Draft => normDraft(p)
export const hasWords = (d: Draft) => !!(d.title.trim() || d.text.trim() || d.hashtags.trim() || d.tags.trim() || d.firstComment.trim() || d.thread.some(t => t.trim()))

export const DEFAULT_PARAMS: Params = { tone: 'plain', length: 'medium', cta: 'watch', link: '', keywords: '', emoji: 'none', hashtags: 3, language: 'en', humanize: 2, audience: '', notes: '' }
const normParams = (raw: unknown, base: Params): Params => {
	const p = obj(raw)
	const text = (key: keyof Params) => (typeof p[key] === 'string' ? (p[key] as string) : (base[key] as string))
	return {
		tone: text('tone') || base.tone,
		length: text('length') || base.length,
		// plans from before the skill renamed this call to action
		cta: (text('cta') === 'discord' ? 'community' : text('cta')) || base.cta,
		link: text('link'),
		keywords: text('keywords'),
		emoji: text('emoji') || base.emoji,
		hashtags: int(p.hashtags, 0, 10, base.hashtags),
		language: text('language') || base.language,
		humanize: int(p.humanize, 0, 3, base.humanize),
		audience: text('audience'),
		notes: text('notes'),
	}
}

// Choices from the last project on this device, so a new project starts from them. The brief stays behind:
// it is about one video.
export type Remembered = { params?: Partial<Params>; on?: string[] }
export const rememberOf = (plan: Plan): Remembered => ({ params: { ...plan.params, notes: '', link: '', keywords: '' }, on: PLATFORM_KEYS.filter(k => plan.platforms[k].on) })

const SENT: readonly SentStatus[] = ['published', 'publishing', 'scheduled', 'draft', 'failed', 'rejected']
const normSent = (raw: unknown): Sent | undefined => {
	const s = obj(raw)
	if (!str(s.at) || !SENT.includes(s.status)) return undefined
	return { at: str(s.at), mode: oneOf(s.mode, WHENS, 'now'), when: str(s.when) || undefined, postId: str(s.postId) || undefined, status: s.status, url: /^https?:\/\//.test(str(s.url)) ? s.url : undefined, error: str(s.error) || undefined }
}
const normHistory = (raw: unknown): HistoryEntry[] =>
	(Array.isArray(raw) ? raw : [])
		.map(item => {
			const e = obj(item)
			if (!str(e.at)) return null
			const thumb = obj(e.thumb)
			const urls = Object.fromEntries(Object.entries(obj(e.urls)).filter(([, v]) => typeof v === 'string' && /^https?:\/\//.test(v)))
			return {
				at: str(e.at),
				postId: str(e.postId) || undefined,
				mode: oneOf(e.mode, WHENS, 'now'),
				platforms: strs(e.platforms).filter(k => PLATFORM_KEYS.includes(k as PlatformKey)) as PlatformKey[],
				status: str(e.status),
				http: typeof e.http === 'number' ? e.http : undefined,
				urls,
				errors: strs(e.errors),
				thumb: str(thumb.url) && ['pending', 'done', 'error'].includes(thumb.state) ? { state: thumb.state, url: thumb.url, name: str(thumb.name) || undefined, note: str(thumb.note) || undefined } : undefined,
			} as HistoryEntry
		})
		.filter((e): e is HistoryEntry => !!e)
		.slice(0, 30)

export const UPLOAD_TTL = 24 * 3600_000
export const freshUploads = (uploads: Record<string, Upload>) => Object.fromEntries(Object.entries(uploads).filter(([, u]) => Date.now() - u.at < UPLOAD_TTL))

/**
 * plan.json into a complete plan. Every field is checked, so a file from an older panel, a hand edit or a
 * half-written file never crashes the panel. `broken` is true when the text was there but not JSON.
 */
export const parsePlan = (text?: string, remembered: Remembered = {}): { plan: Plan; broken: boolean } => {
	let raw: Record<string, any> = {}
	let broken = false
	if (text && text.trim()) {
		try {
			raw = obj(JSON.parse(text))
		} catch {
			broken = true
		}
	}
	const fresh = !raw.platforms // no plan yet: start from what this device used last
	const rawPlats = obj(raw.platforms)
	const defaultOn = (key: PlatformKey) => (fresh && Array.isArray(remembered.on) && remembered.on.length ? remembered.on.includes(key) : key === 'youtube' || key === 'instagram')

	// Files from before the shared time kept one per platform: the first enabled one becomes the shared time
	const lead = PLATFORM_KEYS.map(k => obj(rawPlats[k])).find(p => p.on === true) ?? {}
	const when: When = oneOf(raw.when, WHENS, oneOf(lead.when, WHENS, 'now'))
	const at = typeof raw.at === 'string' ? raw.at : str(lead.at)
	const hasShared = WHENS.includes(raw.when)

	const platforms = {} as Record<PlatformKey, PlatPlan>
	for (const key of PLATFORM_KEYS) {
		const p = obj(rawPlats[key])
		const own = hasShared ? bool(p.ownWhen, false) : WHENS.includes(p.when) && (p.when !== when || (p.when === 'schedule' && str(p.at) !== at))
		platforms[key] = {
			...normDraft(p),
			on: bool(p.on, defaultOn(key)),
			accountId: str(p.accountId),
			undo: p.undo ? normDraft(p.undo) : undefined,
			note: str(p.note),
			when: own ? oneOf(p.when, WHENS, when) : when,
			at: own ? str(p.at) : at,
			ownWhen: own,
			video: oneOf(p.video, ['main', 'vertical'] as const, SPEC[key].video),
			opts: { ...DEFAULT_OPTS[key], ...obj(p.opts) },
		}
	}
	const pending = obj(raw.pendingRequest)
	const media = obj(raw.media)
	const uploads = Object.fromEntries(
		Object.entries(obj(raw.uploads))
			.filter(([, u]) => /^https:\/\//.test(str(obj(u).url)) && typeof obj(u).at === 'number')
			.map(([key, u]) => [key, { url: (u as Upload).url, at: (u as Upload).at }]),
	)
	const sent: Plan['sent'] = {}
	for (const key of PLATFORM_KEYS) {
		const s = normSent(obj(raw.sent)[key])
		if (s) sent[key] = s
	}
	const plan: Plan = {
		version: 1,
		chatId: str(raw.chatId) || undefined,
		pendingRequest: str(pending.requestId)
			? { requestId: pending.requestId, platforms: strs(pending.platforms).filter(k => PLATFORM_KEYS.includes(k as PlatformKey)) as PlatformKey[], at: Number(pending.at) || 0, seen: Object.fromEntries(Object.entries(obj(pending.seen)).filter(([, v]) => typeof v === 'string')) as Record<string, string> }
			: undefined,
		profileId: str(raw.profileId),
		timezone: validZone(str(raw.timezone)) ? raw.timezone : localZone(),
		when,
		at,
		media: { main: str(media.main), mainPath: str(media.mainPath), vertical: str(media.vertical), verticalPath: str(media.verticalPath), cover169: baseName(str(media.cover169)), cover916: baseName(str(media.cover916)) },
		uploads: freshUploads(uploads),
		params: normParams(raw.params, fresh ? normParams(remembered.params, DEFAULT_PARAMS) : DEFAULT_PARAMS),
		platforms,
		sent,
		outbox: (Array.isArray(raw.outbox) ? raw.outbox : [])
			.map(item => {
				const o = obj(item)
				const keys = strs(o.keys).filter(k => PLATFORM_KEYS.includes(k as PlatformKey)) as PlatformKey[]
				const pending: Pending = { key: str(o.key), mode: oneOf(o.mode, WHENS, 'now'), at: str(o.at), keys, payload: obj(o.payload), sentAt: Number(o.sentAt) || 0, error: str(o.error) || undefined }
				return pending.key && keys.length && Object.keys(pending.payload).length ? [pending] : []
			})
			.flat(),
		history: normHistory(raw.history),
	}
	return { plan, broken }
}

/** Set the shared time and carry it to every platform that has no time of its own. */
export const withWhen = (plan: Plan, when: When, at: string): Plan => ({
	...plan,
	when,
	at,
	platforms: Object.fromEntries(PLATFORM_KEYS.map(k => [k, plan.platforms[k].ownWhen ? plan.platforms[k] : { ...plan.platforms[k], when, at }])) as Plan['platforms'],
})

// ---------- copy helpers ----------
export const hashtagList = (text: string) => {
	const seen = new Set<string>()
	return text
		.split(/[\s,]+/)
		.map(t => t.trim().replace(/^#+/, ''))
		.filter(Boolean)
		.map(t => `#${t}`)
		.filter(t => !seen.has(t.toLowerCase()) && !!seen.add(t.toLowerCase()))
}
export const tagList = (text: string) =>
	text
		.split(',')
		.map(t => t.trim())
		.filter(Boolean)
// YouTube counts the commas between tags, and quotes around every tag that has a space
export const tagsLength = (tags: string[]) => tags.reduce((sum, t) => sum + t.length + (/\s/.test(t) ? 2 : 0), 0) + Math.max(0, tags.length - 1)
const inlineTags = (text: string) => (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length
export const hashtagCount = (p: Draft) => hashtagList(p.hashtags).length + inlineTags(p.text)

// What actually goes out: the body plus the hashtag block (Zernio does not append hashtags itself)
export const finalText = (p: Draft) => {
	const tags = hashtagList(p.hashtags).join(' ')
	const body = p.text.trim()
	return tags ? (body ? `${body}\n\n${tags}` : tags) : body
}
export const threadPosts = (key: PlatformKey, p: Draft) => (SPEC[key].thread ? p.thread.map(t => t.trim()).filter(Boolean) : [])

export const fromOption = (o: Option, keepTitle = ''): Draft => ({
	pick: o.id,
	src: optionHash(o),
	title: o.title ?? keepTitle,
	text: o.text,
	hashtags: o.hashtags.join(' '),
	tags: (o.tags ?? []).join(', '),
	firstComment: o.firstComment ?? '',
	thread: o.thread ?? [],
})
const sameWords = (a: Draft, b: Draft) => a.title === b.title && a.text === b.text && a.hashtags === b.hashtags && a.tags === b.tags && a.firstComment === b.firstComment && JSON.stringify(a.thread) === JSON.stringify(b.thread)
/** The option the draft came from, if the agent's file still has it with the same wording. */
export const sourceOption = (p: Draft, options: Option[]) => options.find(o => o.id === p.pick && (!p.src || optionHash(o) === p.src))
export const isEdited = (p: Draft, o: Option) => !sameWords(draftOf(p), fromOption(o, o.title ? '' : p.title))

export type Level = 'ok' | 'warn' | 'fail' | 'info'
/** Where a problem is fixed, so the status line can jump there. */
export type Area = 'setup' | 'video' | 'copy' | 'time' | 'options'
export type Check = { level: Level; text: string; area?: Area }

// ---------- time ----------
const stamp = (local: string) => Date.parse(`${local.length === 16 ? `${local}:00` : local}Z`)
// The wall clock a UTC instant shows in a zone, as if that reading were UTC
const wallAt = (ms: number, tz: string) => {
	const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
	const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]))
	return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
}
/** Wall time in an IANA zone to a UTC timestamp. NaN when the text or the zone is not usable. */
export const zonedToUtc = (local: string, tz: string) => {
	const wall = stamp(local)
	if (Number.isNaN(wall)) return NaN
	try {
		// Two passes: the offset at the first guess can sit on the other side of a clock change
		const guess = wall - (wallAt(wall, tz) - wall)
		return wall - (wallAt(guess, tz) - guess)
	} catch {
		return NaN
	}
}
/** False for a wall time the zone skips when clocks go forward (02:30 on that night). */
export const wallExists = (local: string, tz: string) => {
	const t = zonedToUtc(local, tz)
	return !Number.isNaN(t) && wallAt(t, tz) === stamp(local)
}
const pad = (n: number) => String(n).padStart(2, '0')
/** Tomorrow at 17:00 on the wall clock of the plan's zone, as a datetime-local value. */
export const defaultAt = (tz: string) => {
	let wall: number
	try {
		wall = wallAt(Date.now(), tz)
	} catch {
		wall = Date.now()
	}
	const d = new Date(wall + 24 * 3600_000)
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T17:00`
}
export const fmtTime = (ms: number, tz?: string) => {
	if (Number.isNaN(ms)) return ''
	const options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
	try {
		return new Date(ms).toLocaleString(undefined, { ...options, timeZone: tz || undefined })
	} catch {
		return new Date(ms).toLocaleString(undefined, options)
	}
}
export const fmtWhen = (iso: string | undefined, tz?: string) => {
	if (!iso) return ''
	const ms = Date.parse(iso)
	return Number.isNaN(ms) ? iso : fmtTime(ms, tz)
}
const zoneCity = (tz: string) => (tz.split('/').pop() ?? tz).replace(/_/g, ' ')
/** A scheduled wall time for people: in the plan's zone, and in the viewer's own zone when they differ. */
export const scheduleText = (at: string, tz: string) => {
	const t = zonedToUtc(at, tz)
	if (!at || Number.isNaN(t)) return 'no time set'
	const here = localZone()
	const same = here === tz || wallAt(t, here) === wallAt(t, tz)
	return same ? fmtTime(t, tz) : `${fmtTime(t, tz)} ${zoneCity(tz)} time (${fmtTime(t, here)} your time)`
}
export const whenText = (when: When, at: string, tz: string) => (when === 'now' ? 'Now' : when === 'draft' ? 'Draft in Zernio' : scheduleText(at, tz))
// Zernio needs a little lead time; a post scheduled for the past could go out at once
export const LEAD_MS = 5 * 60_000

// ---------- accounts ----------
export type Account = { id: string; platform: string; username?: string | null; displayName?: string | null; profileId?: string | null; active?: boolean; needsReconnection?: boolean }
export type Profile = { id: string; name: string; isDefault: boolean }
export const handle = (a: Account) => `@${a.username || a.displayName || a.id}`
/** Accounts of one profile. A workspace with several profiles holds several brands: never mix them. */
export const inProfile = (accounts: Account[], profileId: string) => accounts.filter(a => !profileId || !a.profileId || a.profileId === profileId)
/**
 * The account a platform posts to. A saved pick that is gone is a problem, not a reason to post
 * somewhere else, and with several accounts the user has to choose one.
 */
export const accountFor = (key: PlatformKey, p: PlatPlan, accounts: Account[]): { account: Account | null; list: Account[]; problem: '' | 'none' | 'gone' | 'pick' } => {
	const list = accounts.filter(a => a.platform === key)
	if (!list.length) return { account: null, list, problem: 'none' }
	if (p.accountId) {
		const account = list.find(a => a.id === p.accountId) ?? null
		return { account, list, problem: account ? '' : 'gone' }
	}
	return list.length === 1 ? { account: list[0], list, problem: '' } : { account: null, list, problem: 'pick' }
}

// ---------- checks ----------
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Entries of rules.json voice.banned found in the text. Words match whole, anything else as written. */
export const bannedIn = (text: string, rules: Rules | null) => {
	const list = strs(rules?.voice?.banned).filter(w => w.trim())
	return list.filter(word => {
		if (!/^[\p{L}\p{N}' -]+$/u.test(word)) return text.includes(word)
		try {
			return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(word)}(?![\\p{L}\\p{N}])`, 'iu').test(text)
		} catch {
			return text.toLowerCase().includes(word.toLowerCase()) // browsers without lookbehind
		}
	})
}

export type Ctx = { accounts: Account[]; rules: Rules | null; canPost: boolean; delivery?: Delivery; tiktokConsent?: boolean }

/** What is wrong with one platform's words. The text is short enough for a status line. */
export const copyChecks = (key: PlatformKey, p: PlatPlan, rules: Rules | null): Check[] => {
	const s = SPEC[key]
	const lim = limitsFor(key, rules, !!p.opts.premium)
	const out: Check[] = []
	const add = (level: Level, text: string) => out.push({ level, text, area: 'copy' })
	const body = finalText(p)
	const n = measure(key, body, lim.urlChars)
	if (!p.text.trim()) add('fail', 'No copy yet')
	else if (n > lim.text) add('fail', `Copy is ${n - lim.text} over the limit (${n} of ${lim.text})`)
	if (key === 'youtube' && !p.title.trim()) add('fail', 'No title yet')
	const usesTitle = key === 'youtube' || (key === 'facebook' && p.opts.contentType === 'reel')
	if (usesTitle && lim.title && chars(p.title.trim()) > lim.title) add('fail', `Title is ${chars(p.title.trim()) - lim.title} over the limit`)
	// the YouTube API refuses angle brackets in titles and descriptions
	if (key === 'youtube' && /[<>]/.test(p.title + body)) add('fail', 'YouTube does not accept < or > in the title or description')
	if (key === 'youtube') {
		const tags = tagList(p.tags)
		if (tagsLength(tags) > lim.tagsTotal) add('fail', `Tags are ${tagsLength(tags) - lim.tagsTotal} over the limit of ${lim.tagsTotal}`)
		else if (tags.some(t => t.length > lim.tagMax)) add('fail', `One tag is over ${lim.tagMax} characters`)
	}
	const nTags = hashtagCount(p)
	if (lim.hashtagsMax !== undefined && nTags > lim.hashtagsMax) add('fail', `${plural(nTags, 'hashtag')}, ${s.label} allows ${lim.hashtagsMax}`)
	if (s.firstComment && p.firstComment.trim().length > s.firstComment) add('fail', `First comment is over ${s.firstComment} characters`)
	threadPosts(key, p).forEach((t, i) => measure(key, t, lim.urlChars) > lim.text && add('fail', `Thread post ${i + 2} is over the limit`))
	const banned = bannedIn([p.title, p.text, p.firstComment, ...p.thread].join('\n'), rules)
	if (banned.length) add('warn', `Uses ${banned.slice(0, 3).map(w => `"${w}"`).join(', ')}, which the house rules avoid`)
	return out
}

/** Everything the panel can check before anything leaves the machine, most blocking first. */
export const platformChecks = (key: PlatformKey, plan: Plan, ctx: Ctx): Check[] => {
	const p = plan.platforms[key]
	const out: Check[] = []
	if (ctx.delivery) out.push(...ctx.delivery.checks)
	out.push(...copyChecks(key, p, ctx.rules))
	if (p.when === 'schedule') {
		const t = zonedToUtc(p.at, plan.timezone)
		if (!p.at || Number.isNaN(t)) out.push({ level: 'fail', text: 'No time set', area: 'time' })
		else if (!wallExists(p.at, plan.timezone)) out.push({ level: 'fail', text: 'That time is skipped when the clocks change', area: 'time' })
		else if (t < Date.now() + LEAD_MS) out.push({ level: 'fail', text: 'The time is in the past or under 5 minutes away', area: 'time' })
	}
	if (key === 'tiktok' && p.when !== 'draft' && !p.opts.privacyLevel) out.push({ level: 'fail', text: 'Choose who can view it on TikTok', area: 'options' })
	if (key === 'tiktok' && p.when !== 'draft' && ctx.tiktokConsent === false) out.push({ level: 'fail', text: 'Tick the TikTok consent box', area: 'options' })
	if (ctx.canPost) {
		const { account, problem } = accountFor(key, p, ctx.accounts)
		const label = SPEC[key].label
		if (problem === 'none') out.push({ level: 'fail', text: `No ${label} account connected`, area: 'setup' })
		else if (problem === 'gone') out.push({ level: 'fail', text: `The ${label} account picked earlier is no longer connected`, area: 'setup' })
		else if (problem === 'pick') out.push({ level: 'fail', text: `Choose which ${label} account to post to`, area: 'setup' })
		else if (account && (account.needsReconnection || account.active === false)) out.push({ level: 'fail', text: `${handle(account)} needs reconnecting`, area: 'setup' })
	}
	if (key === 'youtube' && p.opts.visibility === 'public' && p.when === 'now') out.push({ level: 'info', text: 'Goes public as soon as YouTube finishes processing' })
	return out
}
export const blockers = (checks: Check[]) => checks.filter(c => c.level === 'fail')

// ---------- Zernio payloads ----------
export type MediaRef = { url: string; type: 'video' | 'image' }
export type Resolved = { video?: MediaRef; cover?: string }

const nonEmpty = (o: Record<string, any>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined && v !== null))

// One Zernio platform entry from the panel's plan for that platform
export const platformEntry = (key: PlatformKey, p: PlatPlan, accountId: string, media: Resolved, params: Params, tiktokConsent: boolean) => {
	const content = finalText(p)
	const o = p.opts
	const video = media.video ? { type: media.video.type, url: media.video.url, ...(media.cover && (key === 'youtube' || key === 'facebook' || key === 'linkedin') ? { thumbnail: media.cover } : {}), ...(media.cover && key === 'instagram' ? { instagramThumbnail: media.cover } : {}) } : null
	const entry: Record<string, any> = { platform: key, accountId, customContent: content }
	let psd: Record<string, any> = {}
	const thread = threadPosts(key, p)
	if (thread.length) {
		// threadItems replaces the published content; the first item carries the video
		psd.threadItems = [{ content, ...(video ? { mediaItems: [video] } : {}) }, ...thread.map(t => ({ content: t }))]
	} else if (video) entry.customMedia = [video]
	switch (key) {
		case 'youtube':
			psd = { ...psd, title: p.title.trim(), visibility: o.visibility, madeForKids: !!o.madeForKids, notifySubscribers: !!o.notifySubscribers, categoryId: String(o.categoryId || '22'), playlistId: o.playlistId, containsSyntheticMedia: !!o.containsSyntheticMedia, firstComment: p.firstComment.trim(), defaultLanguage: params.language }
			break
		case 'tiktok':
			psd = {
				...psd,
				privacyLevel: o.privacyLevel,
				allowComment: !!o.allowComment,
				allowDuet: !!o.allowDuet,
				allowStitch: !!o.allowStitch,
				commercialContentType: o.commercialContentType || 'none',
				videoMadeWithAi: !!o.videoMadeWithAi,
				draft: !!o.inboxDraft,
				contentPreviewConfirmed: tiktokConsent,
				expressConsentGiven: tiktokConsent,
				...(media.cover ? { videoCoverImageUrl: media.cover } : {}),
			}
			break
		case 'instagram':
			psd = { ...psd, shareToFeed: !!o.shareToFeed, isAiGenerated: !!o.isAiGenerated, firstComment: p.firstComment.trim(), collaborators: String(o.collaborators || '').split(/[\s,]+/).map((s: string) => s.replace(/^@/, '')).filter(Boolean).slice(0, 3) }
			if (!psd.collaborators.length) delete psd.collaborators
			break
		case 'facebook':
			psd = { ...psd, ...(o.contentType === 'reel' ? { contentType: 'reel', title: p.title.trim() } : {}), isAiGenerated: !!o.isAiGenerated, firstComment: p.firstComment.trim() }
			break
		case 'linkedin':
			psd = { ...psd, firstComment: p.firstComment.trim() }
			break
		case 'twitter':
			psd = { ...psd, replySettings: o.replySettings, madeWithAi: !!o.madeWithAi }
			break
		case 'threads':
			psd = { ...psd, topic_tag: String(o.topic_tag || '').replace(/[.&]/g, '').slice(0, 50), firstComment: p.firstComment.trim() }
			break
		case 'bluesky':
			psd = { ...psd, langs: params.language ? [params.language] : undefined }
			break
	}
	psd = nonEmpty(psd)
	if (Object.keys(psd).length) entry.platformSpecificData = psd
	return entry
}

export type Outgoing = { mode: When; at: string; keys: PlatformKey[]; payload: Record<string, any> }
/**
 * Group platforms into Zernio posts: one for now, one for drafts and one per scheduled time, so every
 * platform goes out at exactly its own time whatever the API does with mixed times in one post.
 */
export const buildPosts = (entries: { key: PlatformKey; when: When; at: string; entry: Record<string, any> }[], tz: string, youtubeTags: string[], title: string): Outgoing[] => {
	const groups = new Map<string, typeof entries>()
	for (const e of entries) {
		const id = e.when === 'schedule' ? `schedule@${e.at}` : e.when
		groups.set(id, [...(groups.get(id) ?? []), e])
	}
	const order = (id: string) => (id === 'now' ? '0' : id === 'draft' ? '2' : `1${id}`)
	return [...groups.keys()]
		.sort((a, b) => order(a).localeCompare(order(b)))
		.map(id => {
			const group = groups.get(id)!
			const { when: mode, at } = group[0]
			const hasYoutube = group.some(e => e.key === 'youtube')
			const payload: Record<string, any> = {
				title: hasYoutube ? title || undefined : undefined,
				content: group[0].entry.customContent,
				platforms: group.map(e => e.entry),
				...(hasYoutube && youtubeTags.length ? { tags: youtubeTags } : {}),
				metadata: { source: 'kino-publish-panel' },
			}
			if (mode === 'now') payload.publishNow = true
			if (mode === 'draft') payload.isDraft = true
			if (mode === 'schedule') {
				// wall time in the plan's zone; Zernio reads it together with `timezone`
				payload.scheduledFor = at.length === 16 ? `${at}:00` : at
				payload.timezone = tz
			}
			return { mode, at: mode === 'schedule' ? at : '', keys: group.map(e => e.key), payload: nonEmpty(payload) }
		})
}

// ---------- brief choices ----------
const LANG: Record<string, string> = { en: 'English', es: 'Spanish', 'pt-BR': 'Brazilian Portuguese', fr: 'French', de: 'German', it: 'Italian', pl: 'Polish', nl: 'Dutch', tr: 'Turkish', ru: 'Russian', uk: 'Ukrainian', ar: 'Arabic', hi: 'Hindi', id: 'Indonesian', ja: 'Japanese', ko: 'Korean', 'zh-CN': 'Simplified Chinese' }
export const LANGUAGES = Object.entries(LANG).map(([value, label]) => ({ value, label }))

export type Choice = { value: string; label: string; title?: string }
const BUILT_IN: Record<'tone' | 'length' | 'cta' | 'emoji', Choice[]> = {
	tone: [{ value: 'plain', label: 'Plain' }, { value: 'hype', label: 'Hype' }, { value: 'dry-funny', label: 'Dry' }, { value: 'technical', label: 'Technical' }],
	length: [{ value: 'short', label: 'Short' }, { value: 'medium', label: 'Medium' }, { value: 'long', label: 'Long' }],
	cta: [{ value: 'none', label: 'None' }, { value: 'watch', label: 'Watch the video' }, { value: 'comment', label: 'Ask for comments' }, { value: 'follow', label: 'Follow' }, { value: 'link', label: 'Visit a link' }, { value: 'community', label: 'Join the community' }],
	emoji: [{ value: 'none', label: 'None' }, { value: 'light', label: 'Light' }, { value: 'some', label: 'Some' }],
}
const pretty = (id: string) => id.charAt(0).toUpperCase() + id.slice(1).replace(/[-_]+/g, ' ')
/**
 * The choices for one brief parameter. The skill owns the list (rules.json params.<name>, keyed by the
 * value the agent receives), so a project can rename or add tones and calls to action without a panel
 * change. Built-in lists apply when the file has none. A value saved earlier always stays selectable.
 */
export const choicesFor = (name: keyof typeof BUILT_IN, rules: Rules | null, current: string): Choice[] => {
	const fromRules = obj(rules?.params?.[name])
	const ids = Object.keys(fromRules)
	const known = new Map(BUILT_IN[name].map(c => [c.value, c]))
	const list: Choice[] = ids.length >= 2 ? ids.map(id => ({ value: id, label: known.get(id)?.label ?? pretty(id), title: typeof fromRules[id] === 'string' ? fromRules[id] : typeof fromRules[id]?.rule === 'string' ? fromRules[id].rule : undefined })) : BUILT_IN[name]
	return current && !list.some(c => c.value === current) ? [...list, known.get(current) ?? { value: current, label: pretty(current) }] : list
}

// ---------- agent prompt ----------
export const composeCopyMessage = (a: { requestId: string; projectId: string; platforms: PlatformKey[]; params: Params; notes: Partial<Record<PlatformKey, string>>; video: { mediaId: string; path: string }; shown?: Option[] }) => {
	const p = a.params
	const project = a.projectId ? `project ${a.projectId}` : 'the open project'
	const names = a.platforms.map(k => `${SPEC[k].label} (key "${k}")`).join(', ')
	const videoLine = a.video.mediaId
		? `Video: Kino media id ${a.video.mediaId}. Read it first: readVideo on that id, or getEffectiveTranscript on ${project}.`
		: a.video.path
			? `Video: the file at ${a.video.path}. Read the edit first with getEffectiveTranscript on ${project}.`
			: `Video: the current edit of ${project}. Read it first with getEffectiveTranscript.`
	const perPlatform = a.platforms.filter(k => a.notes[k]?.trim()).map(k => `- ${SPEC[k].label} only: ${a.notes[k]!.trim()}`)
	return [
		`Publish panel request ${a.requestId}${a.projectId ? ` for project ${a.projectId}` : ''}.`,
		'',
		`Write social post copy, 3 options each, for: ${names}.`,
		videoLine,
		...(p.notes.trim() ? ['', `Brief from the user: ${p.notes.trim()}`] : []),
		...perPlatform,
		'',
		'Parameters (how to apply each is in the skill):',
		`- tone: ${p.tone}; length: ${p.length}; humanize: ${p.humanize} of 3; emoji: ${p.emoji}; hashtags: ${p.hashtags} per post (platform caps in rules.json win)`,
		`- call to action: ${p.cta}${p.link.trim() ? ` (link: ${p.link.trim()})` : ''}`,
		`- language: ${LANG[p.language] ?? p.language}`,
		...(p.keywords.trim() ? [`- search keywords to work in naturally: ${p.keywords.trim()}`] : []),
		...(p.audience.trim() ? [`- audience: ${p.audience.trim()}`] : []),
		...(a.shown?.length ? ['', `The user asked for new options. Angles already shown, do not repeat them: ${a.shown.map(o => `"${o.angle}"`).join(', ')}`] : []),
		'',
		'How:',
		`1. Read ${KNOWLEDGE_README} before anything else, plus any file it points to, and load every agent skill it names. It belongs to the user and holds everything about the brand: voice, words to avoid, names, facts, links, claims never to make, a rewrite pass to run. Ignore its lines that start with "Example:". If the file is missing or says nothing yet, write in the skill's plain default voice and say so in your reply.`,
		`2. Read the house skill: ${SKILL_FILES}. These are project files; take the project folder from mountDir in getCurrentKinoContext. It covers writing craft, platform limits and the copy.json format.`,
		'3. Order of authority: the honesty rules and hard platform limits of the house skill first, then the knowledge folder and the skills it names, then the craft defaults of the house skill.',
		`4. Write the options into ${COPY_PATH} in the v1 format from format.md, with requestId "${a.requestId}". Merge: keep the platforms this request does not name.`,
		'5. Every claim must match the video or the knowledge folder. Leave out any link, handle, price, date, version or other fact that is in neither, and never guess one: say what you left out in "why". Keep hashtags in the hashtags array, never at the end of text.',
		`6. Do not touch ${PLAN_PATH}. Do not post, schedule or call a posting service: the user posts from the panel.`,
		'7. Reply in 3 to 5 lines: which angles you chose, which links you used and where each came from.',
	].join('\n')
}
