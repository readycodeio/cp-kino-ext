// Publish panel: bridge client, platform specs, the post plan model and the Zernio payload builder.
// The Zernio key never reaches the panel: the local bridge (127.0.0.1:47680) holds it and talks to Zernio.

export const BRIDGE = 'http://127.0.0.1:47680'
export const TOKEN_KEY = 'kino-terminal:token' // shared with the other bridge panels, device-local
export const PLAN_PATH = '/publish/plan.json'
export const COPY_PATH = '/publish/copy.json'
export const RULES_PATH = '/publish/skill/rules.json'
export const SKILL_FILES = '/publish/skill/SKILL.md, /publish/skill/rules.json and /publish/skill/format.md'
// Product knowledge (facts, links, names) for the project, e.g. the OB:MP skill. README.md there says what to read.
export const KNOWLEDGE_DIR = '/publish/knowledge'
export { MOUNT_HINT } from '../project'
import { MOUNT_HINT } from '../project'

// ---------- bridge ----------
export class BridgeError extends Error {
	status: number
	code?: string
	constructor(message: string, status: number, code?: string) {
		super(message)
		this.status = status
		this.code = code
	}
}

export const api = async (path: string, init?: { method?: string; body?: unknown }) => {
	const token = localStorage.getItem(TOKEN_KEY)
	if (!token) throw new BridgeError('Not connected.', 401)
	let response: Response
	try {
		response = await fetch(BRIDGE + path, {
			method: init?.method ?? 'GET',
			headers: { authorization: `Bearer ${token}`, ...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}) },
			body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
		})
	} catch {
		throw new BridgeError('The Kino bridge is not running.', 0)
	}
	const body = await response.json().catch(() => ({}))
	if (!response.ok) throw new BridgeError(typeof body.error === 'string' ? body.error : `Request failed (${response.status}).`, response.status, body.code)
	return body
}

export const apiBlob = async (path: string) => {
	const token = localStorage.getItem(TOKEN_KEY)
	if (!token) throw new BridgeError('Not connected.', 401)
	const response = await fetch(BRIDGE + path, { headers: { authorization: `Bearer ${token}` } }).catch(() => {
		throw new BridgeError('The Kino bridge is not running.', 0)
	})
	if (!response.ok) throw new BridgeError(`Image request failed (${response.status}).`, response.status)
	return response.blob()
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
export const rid = () => Math.random().toString(36).slice(2, 10)
export const uuid = () => (crypto as any).randomUUID?.() ?? `${rid()}-${rid()}-${rid()}-${rid()}`
export const fmtBytes = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)
export const chars = (text: string) => [...text].length

// Pull a chat id out of whatever chat::NewChat returned
export const findChatId = (value: unknown): string | null => {
	if (!value) return null
	if (typeof value === 'string') return /^[\w-]{6,}$/.test(value) ? value : null
	if (typeof value !== 'object') return null
	const o = value as Record<string, unknown>
	for (const key of ['chatId', 'conversationId', 'id']) if (typeof o[key] === 'string' && o[key]) return o[key] as string
	for (const v of Object.values(o)) {
		const found = typeof v === 'object' ? findChatId(v) : null
		if (found) return found
	}
	return null
}

// ---------- platforms ----------
export type PlatformKey = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'linkedin' | 'twitter' | 'threads' | 'bluesky'
export const PLATFORM_KEYS: PlatformKey[] = ['youtube', 'tiktok', 'instagram', 'facebook', 'linkedin', 'twitter', 'threads', 'bluesky']

type Spec = { label: string; short: string; title?: number; text: number; firstComment?: number; thread?: boolean; tags?: number; video: 'main' | 'vertical'; color: string }
// Hard limits from the Zernio API reference and platform docs; rules.json from the skill can override text/title
export const SPEC: Record<PlatformKey, Spec> = {
	youtube: { label: 'YouTube', short: 'YT', title: 100, text: 5000, firstComment: 10000, tags: 500, video: 'main', color: '#ff4e45' },
	tiktok: { label: 'TikTok', short: 'TT', text: 2200, video: 'vertical', color: '#25f4ee' },
	instagram: { label: 'Instagram', short: 'IG', text: 2200, firstComment: 2200, video: 'vertical', color: '#e1306c' },
	facebook: { label: 'Facebook', short: 'FB', title: 255, text: 63206, firstComment: 8000, video: 'main', color: '#1877f2' },
	linkedin: { label: 'LinkedIn', short: 'IN', text: 3000, firstComment: 1250, video: 'main', color: '#0a66c2' },
	twitter: { label: 'X', short: 'X', text: 280, thread: true, video: 'main', color: 'var(--kp-brand-x)' },
	threads: { label: 'Threads', short: 'TH', text: 500, firstComment: 500, thread: true, video: 'vertical', color: 'var(--kp-brand-threads)' },
	bluesky: { label: 'Bluesky', short: 'BS', text: 300, thread: true, video: 'main', color: '#1185fe' },
}

export type Rules = {
	summary?: string
	voice?: { banned?: string[]; rules?: string[] }
	platforms?: Partial<Record<PlatformKey, { label?: string; limits?: { title?: number; text?: number; textPremium?: number; hashtagsMax?: number; tagsTotal?: number; foldChars?: number }; hashtags?: { recommended?: [number, number]; placement?: string }; structure?: string[]; cta?: string; avoid?: string[] }>>
	angles?: { id: string; name: string; when?: string; example?: string }[]
}
export const parseRules = (text?: string): Rules | null => {
	if (!text) return null
	try {
		const rules = JSON.parse(text)
		return rules && typeof rules === 'object' ? rules : null
	} catch {
		return null
	}
}

export type Limits = { title?: number; text: number; hashtagsMax?: number; tagsTotal?: number; foldChars?: number; recommended?: [number, number] }
export const limitsFor = (key: PlatformKey, rules: Rules | null, premiumX = false): Limits => {
	const r = rules?.platforms?.[key]
	const base = SPEC[key]
	const text = key === 'twitter' && premiumX ? (r?.limits?.textPremium ?? 25000) : (r?.limits?.text ?? base.text)
	return { title: r?.limits?.title ?? base.title, text, hashtagsMax: r?.limits?.hashtagsMax, tagsTotal: r?.limits?.tagsTotal ?? base.tags, foldChars: r?.limits?.foldChars, recommended: r?.hashtags?.recommended }
}

// ---------- copy.json (written by the agent) ----------
export type Option = { id: string; angle: string; title?: string; text: string; hashtags: string[]; tags?: string[]; firstComment?: string; thread?: string[]; why?: string; rules?: string[] }
export type CopyDoc = { version: number; updated?: string; requestId?: string; video?: { mediaId?: string; title?: string; summary?: string }; platforms: Partial<Record<PlatformKey, { options: Option[]; notes?: string }>> }

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strs = (v: unknown) => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : [])
export const parseCopy = (text?: string): CopyDoc | null => {
	if (!text) return null
	try {
		const raw = JSON.parse(text)
		const platforms: CopyDoc['platforms'] = {}
		for (const key of PLATFORM_KEYS) {
			const p = raw?.platforms?.[key]
			if (!p || !Array.isArray(p.options)) continue
			platforms[key] = {
				notes: str(p.notes) || undefined,
				options: p.options.slice(0, 6).map((o: any, i: number) => ({
					id: str(o?.id) || `${key}-${i + 1}`,
					angle: str(o?.angle) || `Option ${i + 1}`,
					title: str(o?.title) || undefined,
					text: str(o?.text),
					hashtags: strs(o?.hashtags),
					tags: strs(o?.tags),
					firstComment: str(o?.firstComment) || undefined,
					thread: strs(o?.thread),
					why: str(o?.why) || undefined,
					rules: strs(o?.rules),
				})),
			}
		}
		return { version: Number(raw?.version) || 1, updated: str(raw?.updated), requestId: str(raw?.requestId), video: raw?.video, platforms }
	} catch {
		return null
	}
}

// ---------- plan.json (owned by the panel) ----------
export type Tone = 'plain' | 'hype' | 'dry-funny' | 'technical'
export type Params = { tone: Tone; length: 'short' | 'medium' | 'long'; cta: 'none' | 'watch' | 'comment' | 'follow' | 'link' | 'discord'; link: string; keywords: string; emoji: 'none' | 'light' | 'some'; hashtags: number; language: string; humanize: number; audience: string; notes: string }
export type When = 'now' | 'schedule' | 'draft'
export type PlatPlan = {
	on: boolean
	accountId: string
	pick: string // option id the copy came from
	title: string
	text: string
	hashtags: string // space separated, as typed
	tags: string // YouTube, comma separated
	firstComment: string
	thread: string[] // follow-up posts for X, Threads, Bluesky
	when: When
	at: string // datetime-local value, wall time in plan.timezone
	video: 'main' | 'vertical'
	opts: Record<string, any>
}
export type Upload = { url: string; at: number }
// YouTube ignores a thumbnail passed with the upload, so the panel sets it once YouTube has the video
export type ThumbJob = { state: 'pending' | 'done' | 'error'; url: string; name?: string; note?: string }
export type HistoryEntry = { at: string; postId?: string; mode: When; platforms: PlatformKey[]; status: string; http?: number; urls?: Partial<Record<PlatformKey, string>>; errors?: string[]; thumb?: ThumbJob }
export type Plan = {
	version: 1
	chatId?: string
	pendingRequest?: { requestId: string; platforms: PlatformKey[]; at: number }
	profileId: string
	timezone: string
	media: { main: string; mainPath: string; vertical: string; verticalPath: string; cover169: string; cover916: string }
	uploads: Record<string, Upload>
	params: Params
	platforms: Record<PlatformKey, PlatPlan>
	history: HistoryEntry[]
}

export const localZone = () => {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
	} catch {
		return 'UTC'
	}
}

export const DEFAULT_OPTS: Record<PlatformKey, Record<string, any>> = {
	youtube: { visibility: 'public', madeForKids: false, notifySubscribers: true, categoryId: '20', playlistId: '', containsSyntheticMedia: false },
	tiktok: { privacyLevel: '', allowComment: true, allowDuet: true, allowStitch: true, commercialContentType: 'none', videoMadeWithAi: false, inboxDraft: false },
	instagram: { shareToFeed: true, isAiGenerated: false, collaborators: '' },
	facebook: { contentType: 'feed', isAiGenerated: false },
	linkedin: {},
	twitter: { replySettings: '', premium: false, madeWithAi: false },
	threads: { topic_tag: '' },
	bluesky: {},
}

const defaultPlat = (key: PlatformKey): PlatPlan => ({
	on: key === 'youtube' || key === 'instagram',
	accountId: '',
	pick: '',
	title: '',
	text: '',
	hashtags: '',
	tags: '',
	firstComment: '',
	thread: [],
	when: 'draft',
	at: '',
	video: SPEC[key].video,
	opts: { ...DEFAULT_OPTS[key] },
})

export const DEFAULT_PARAMS: Params = { tone: 'plain', length: 'medium', cta: 'discord', link: '', keywords: '', emoji: 'none', hashtags: 3, language: 'en', humanize: 2, audience: 'PC gamers, modders and server hosts', notes: '' }

export const normPlan = (text?: string): Plan => {
	let raw: any = {}
	try {
		raw = text ? JSON.parse(text) : {}
	} catch {}
	const platforms = {} as Record<PlatformKey, PlatPlan>
	for (const key of PLATFORM_KEYS) {
		const p = raw?.platforms?.[key] ?? {}
		const base = defaultPlat(key)
		platforms[key] = { ...base, ...p, thread: strs(p.thread), opts: { ...base.opts, ...(p.opts ?? {}) } }
	}
	return {
		version: 1,
		chatId: str(raw.chatId) || undefined,
		pendingRequest: raw.pendingRequest?.requestId ? raw.pendingRequest : undefined,
		profileId: str(raw.profileId),
		timezone: str(raw.timezone) || localZone(),
		media: { main: '', mainPath: '', vertical: '', verticalPath: '', cover169: '', cover916: '', ...(raw.media ?? {}) },
		uploads: raw.uploads && typeof raw.uploads === 'object' ? raw.uploads : {},
		params: { ...DEFAULT_PARAMS, ...(raw.params ?? {}) },
		platforms,
		history: Array.isArray(raw.history) ? raw.history.slice(0, 30) : [],
	}
}

// ---------- copy helpers ----------
export const hashtagList = (text: string) =>
	text
		.split(/[\s,]+/)
		.map(t => t.trim())
		.filter(Boolean)
		.map(t => (t.startsWith('#') ? t : `#${t}`))
export const tagList = (text: string) =>
	text
		.split(',')
		.map(t => t.trim())
		.filter(Boolean)

// What actually goes out: the body plus the hashtag block (Zernio does not append hashtags itself)
export const finalText = (p: PlatPlan) => {
	const tags = hashtagList(p.hashtags).join(' ')
	const body = p.text.trim()
	return tags ? (body ? `${body}\n\n${tags}` : tags) : body
}

export const fromOption = (p: PlatPlan, o: Option): PlatPlan => ({
	...p,
	pick: o.id,
	title: o.title ?? p.title,
	text: o.text,
	hashtags: o.hashtags.join(' '),
	tags: (o.tags ?? []).join(', '),
	firstComment: o.firstComment ?? '',
	thread: o.thread ?? [],
})

export const DASHES = /[–—]/

export type Level = 'ok' | 'warn' | 'fail' | 'info'
export type Check = { level: Level; text: string }

// ---------- time ----------
// Wall time in an IANA zone to a UTC timestamp (good to the minute; DST gaps resolve forward)
export const zonedToUtc = (local: string, tz: string) => {
	const guess = Date.parse(`${local.length === 16 ? local + ':00' : local}Z`)
	if (Number.isNaN(guess)) return NaN
	try {
		const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
		const parts = Object.fromEntries(fmt.formatToParts(new Date(guess)).map(x => [x.type, x.value]))
		const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
		return guess - (asUtc - guess)
	} catch {
		return NaN
	}
}
export const fmtWhen = (iso: string | undefined, tz?: string) => {
	if (!iso) return ''
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return iso
	try {
		return d.toLocaleString(undefined, { timeZone: tz || undefined, dateStyle: 'medium', timeStyle: 'short' })
	} catch {
		return d.toLocaleString()
	}
}
export const nextSlot = (hoursAhead = 2) => {
	const d = new Date(Date.now() + hoursAhead * 3600_000)
	d.setMinutes(0, 0, 0)
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`
}

// ---------- Zernio payloads ----------
export type Account = { id: string; platform: string; username?: string; displayName?: string; picture?: string; url?: string; profileId?: string; active?: boolean; needsReconnection?: boolean; tiktokAccountType?: string; rateLimitedUntil?: string }
export type MediaRef = { url: string; type: 'video' | 'image' }
export type Resolved = { video?: MediaRef; cover?: string }

const nonEmpty = (o: Record<string, any>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined && v !== null))

// One Zernio platform entry from the panel's plan for that platform
export const platformEntry = (key: PlatformKey, p: PlatPlan, accountId: string, media: Resolved, params: Params, tz: string, tiktokConsent: boolean) => {
	const content = finalText(p)
	const o = p.opts
	const video = media.video ? { type: media.video.type, url: media.video.url, ...(media.cover && (key === 'youtube' || key === 'facebook' || key === 'linkedin') ? { thumbnail: media.cover } : {}), ...(media.cover && key === 'instagram' ? { instagramThumbnail: media.cover } : {}) } : null
	const entry: Record<string, any> = { platform: key, accountId, customContent: content }
	if (p.when === 'schedule' && p.at) entry.scheduledFor = `${p.at.length === 16 ? p.at + ':00' : p.at}`
	let psd: Record<string, any> = {}
	const thread = SPEC[key].thread ? p.thread.map(t => t.trim()).filter(Boolean) : []
	if (thread.length) {
		// threadItems replaces the published content; the first item carries the video
		psd.threadItems = [{ content, ...(video ? { mediaItems: [video] } : {}) }, ...thread.map(t => ({ content: t }))]
	} else if (video) entry.customMedia = [video]
	switch (key) {
		case 'youtube':
			psd = { ...psd, title: p.title.trim(), visibility: o.visibility, madeForKids: !!o.madeForKids, notifySubscribers: !!o.notifySubscribers, categoryId: String(o.categoryId || '20'), playlistId: o.playlistId, containsSyntheticMedia: !!o.containsSyntheticMedia, firstComment: p.firstComment.trim(), defaultLanguage: params.language }
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

// Group the enabled platforms into at most three Zernio posts: now, scheduled, draft
export const buildPosts = (entries: { key: PlatformKey; when: When; entry: Record<string, any> }[], tz: string, youtubeTags: string[], title: string) => {
	const posts: { mode: When; keys: PlatformKey[]; payload: Record<string, any> }[] = []
	for (const mode of ['now', 'schedule', 'draft'] as When[]) {
		const group = entries.filter(e => e.when === mode)
		if (!group.length) continue
		const first = group[0].entry
		const payload: Record<string, any> = {
			title: title || undefined,
			content: first.customContent,
			platforms: group.map(e => e.entry),
			...(group.some(e => e.key === 'youtube') && youtubeTags.length ? { tags: youtubeTags } : {}),
			metadata: { source: 'kino-publish-panel' },
		}
		if (mode === 'now') payload.publishNow = true
		if (mode === 'draft') payload.isDraft = true
		if (mode === 'schedule') {
			const times = group.map(e => e.entry.scheduledFor as string).filter(Boolean).sort()
			payload.scheduledFor = times[0]
			payload.timezone = tz
		} else for (const e of group) delete e.entry.scheduledFor
		posts.push({ mode, keys: group.map(e => e.key), payload: nonEmpty(payload) })
	}
	return posts
}

// ---------- agent prompt ----------
const LANG: Record<string, string> = { en: 'English', pl: 'Polish', de: 'German', fr: 'French', es: 'Spanish', 'pt-BR': 'Brazilian Portuguese', ru: 'Russian', ja: 'Japanese', 'zh-CN': 'Simplified Chinese' }
export const LANGUAGES = Object.entries(LANG).map(([value, label]) => ({ value, label }))

export const composeCopyMessage = (a: { requestId: string; projectId: string; platforms: PlatformKey[]; params: Params; video: { mediaId: string; name: string; path: string }; feedback?: string; existing?: Option[] }) => {
	const p = a.params
	const names = a.platforms.map(k => `${SPEC[k].label} (key "${k}")`).join(', ')
	const videoLine = a.video.mediaId
		? `Video: ${a.video.name ? `"${a.video.name}", ` : ''}Kino media id ${a.video.mediaId}. Read it first: readVideo on that id, or getEffectiveTranscript on project ${a.projectId}.`
		: a.video.path
			? `Video: the render at ${a.video.path}. Read the edit first with getEffectiveTranscript on project ${a.projectId}.`
			: `Video: the current edit of project ${a.projectId}. Read it first with getEffectiveTranscript.`
	return [
		`Publish panel request ${a.requestId} for project ${a.projectId}.`,
		'',
		`Write social post copy, 3 options each, for: ${names}.`,
		videoLine,
		'Parameters (how to apply each is in the skill):',
		`- tone: ${p.tone}; length: ${p.length}; humanize: ${p.humanize} of 3; emoji: ${p.emoji}; hashtags: ${p.hashtags} per post (platform caps in rules.json win)`,
		`- cta: ${p.cta}${p.link.trim() ? ` (link: ${p.link.trim()})` : ''}`,
		`- language: ${LANG[p.language] ?? p.language}`,
		...(p.keywords.trim() ? [`- search keywords to work in naturally: ${p.keywords.trim()}`] : []),
		...(p.audience.trim() ? [`- audience: ${p.audience.trim()}`] : []),
		...(p.notes.trim() ? [`- notes from the user: ${p.notes.trim()}`] : []),
		...(a.feedback?.trim() ? ['', `The user wants new options. Their feedback: ${a.feedback.trim()}`] : []),
		...(a.existing?.length ? ['Angles already shown (do not repeat them): ' + a.existing.map(o => `"${o.angle}"`).join(', ')] : []),
		'',
		'How:',
		`1. Read the house skill first: ${SKILL_FILES} (project files; mountDir from getCurrentKinoContext${MOUNT_HINT ? `, normally ${MOUNT_HINT}` : ''}). It is the main guideline for panel mechanics. For voice, hooks and what wins on each platform, also load the readym-social-voice skill (or read ~/.claude/skills/readym-social-voice/SKILL.md).`,
		`2. Read the product knowledge next: load the obmp-readym-content-kit skill (or read ~/.claude/skills/obmp-readym-content-kit/SKILL.md), then ${KNOWLEDGE_DIR}/README.md for anything specific to this project. Names, facts, versions and links come only from there or from the video, and the kit's section 0 rules apply.`,
		`3. Write the options into /publish/copy.json in the v1 format from format.md, with requestId "${a.requestId}". Merge: keep the platforms this request does not name.`,
		'4. Every claim must match the video, the content kit or the knowledge files. Never guess a URL, invite link or handle: if none is known, leave it out and say so in "why". Keep hashtags in the hashtags array, never at the end of text.',
		'5. Do not touch /publish/plan.json. Do not post, schedule or call Zernio: the user posts from the panel.',
		'6. Reply in 3 to 5 lines: which angles you chose, which links you used and where they came from. No em-dashes or en-dashes.',
	].join('\n')
}
