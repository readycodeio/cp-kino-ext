// Publish: one path from a finished video to posts on several platforms.
//   1 Video: what goes out, the cut and cover each platform gets.
//   2 Copy:  the chat agent writes 3 options per platform (house skill in /publish/skill, brand in
//            /publish/knowledge), the user picks one and edits it in place.
//   3 Go:    review every word, file and time, then post now or schedule through Zernio.
// Posting is optional: copy works with no bridge at all, cuts need the bridge, only posting needs a Zernio key.
// The key stays in the local bridge; the panel only ever sees post data.
// The plan (choices, edits, results) lives in /publish/plan.json; the agent writes options to /publish/copy.json.
// Built with createElement rather than JSX: generated panels currently hit React #31 with JSX.
import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { runAction } from 'kino/panel'
import { BridgeError, api, errorText, projectId } from '../bridge'
import { MACHINE, SHOW_IN } from '../platform'
import { useCopyDoc, useCovers, usePaths, usePlan, useRules, useZernio } from './hooks'
import {
	PLATFORM_KEYS,
	SPEC,
	UPLOAD_TTL,
	accountFor,
	blockers,
	buildPosts,
	composeCopyMessage,
	findChatId,
	fmtBytes,
	freshUploads,
	hasWords,
	inProfile,
	labels,
	optionsHash,
	platformChecks,
	platformEntry,
	plural,
	sleep,
	tagList,
	uuid,
	whenText,
	zonedToUtc,
	type Area,
	type Check,
	type HistoryEntry,
	type Level,
	type Pending,
	type Plan,
	type PlatformKey,
	type PlatPlan,
	type Resolved,
	type SentStatus,
	type ThumbJob,
	type When,
} from './lib'
import { cacheable, deliveryFor, mediaSources, rendersFor, type Delivery, type ProbeState, type Source } from './media'
import { AskDialog, CopySection, GoSection, Notice, PlatformsBar, PromptDialog, ReviewDialog, SetupDialog, VideoSection, sentStatus, type Ask, type Cut, type Progress, type Status } from './views'
import { AMBER, BG, Btn, Dot, FONT, GREEN, LINE, RED, STRONG, Step, TEXT, copyText, ensureCss, ink } from './ui'

// Stands in for a file that is not uploaded yet when Zernio does a dry run
const PLACEHOLDER = 'https://example.com/kino-publish-placeholder.mp4'
// Answers that mean Zernio (or the bridge) refused the request, so no post was created.
// Anything else (no answer, a timeout, a server error) leaves the outcome open.
const REFUSED = [400, 401, 402, 403, 404, 412, 413, 415, 422, 424, 429]
const WATCH_MS = 30 * 60_000
type Review = { keys: PlatformKey[]; phase: 'review' | 'working' | 'done'; step: string; progress: Progress[]; error: string; validation: Check[] | null; validating: boolean }
type Note = { level: Level; text: string }

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const platformStatus = (mode: When, entry: any, post: any): SentStatus => {
	const raw = String(entry?.status ?? post?.status ?? '')
	if (raw === 'failed' || entry?.errorMessage) return 'failed'
	if (mode === 'draft' || raw === 'draft') return 'draft'
	if (raw === 'published') return 'published'
	if (mode === 'schedule' || raw === 'scheduled') return 'scheduled'
	return 'publishing'
}
const httpUrl = (value: unknown) => (typeof value === 'string' && /^https?:\/\//.test(value) ? value : undefined)

export default function Panel() {
	useEffect(ensureCss, [])
	const project = useMemo(projectId, [])
	const [note, setNote] = useState<Note | null>(null)
	const [busy, setBusy] = useState('')
	const say = useCallback((text: string, level: Level = 'info') => setNote(text ? { level, text } : null), [])
	const onPlanError = useCallback((message: string) => setNote({ level: 'fail', text: message }), [])
	const { plan, update, planRef, unreadable } = usePlan(onPlanError)
	const { copy, error: copyError } = useCopyDoc()
	const copyRef = useRef(copy)
	copyRef.current = copy
	const rules = useRules()
	const z = useZernio()
	const { bridge, keyState, fail, canPost } = z
	const bridgeOk = bridge === 'ok'
	const { paths, setPaths } = usePaths(project, plan.media)
	const pathsRef = useRef(paths)
	pathsRef.current = paths

	const [setup, setSetup] = useState(false)
	const [ask, setAsk] = useState<Ask | null>(null)
	const [promptBox, setPromptBox] = useState<{ text: string; note: string } | null>(null)
	const [active, setActive] = useState<PlatformKey | null>(null)
	const [openPlat, setOpenPlat] = useState<PlatformKey | null>(null)
	const anchors = useRef<Record<string, HTMLElement | null>>({})

	const act = (what: string, fn: () => Promise<string | void>) => {
		setBusy(what)
		setNote(null)
		return fn()
			.then(message => message && say(message))
			.catch(error => say(fail(error), 'fail'))
			.finally(() => setBusy(''))
	}
	const setPlat = useCallback((k: PlatformKey, fn: (p: PlatPlan) => PlatPlan) => update(x => ({ ...x, platforms: { ...x.platforms, [k]: fn(x.platforms[k]) } })), [update])
	const setParams = useCallback((fn: (p: Plan['params']) => Plan['params']) => update(x => ({ ...x, params: fn(x.params) })), [update])
	const setMedia = useCallback((patch: Partial<Plan['media']>) => update(x => ({ ...x, media: { ...x.media, ...patch } })), [update])
	const on = PLATFORM_KEYS.filter(k => plan.platforms[k].on)

	// A Zernio workspace with several profiles holds several brands: only the chosen one's accounts count
	const profileId = z.profiles.some(p => p.id === plan.profileId) ? plan.profileId : (z.profiles.find(p => p.isDefault)?.id ?? z.profiles[0]?.id ?? '')
	const accounts = useMemo(() => inProfile(z.accounts, z.profiles.length > 1 ? profileId : ''), [z.accounts, z.profiles.length, profileId])
	const accountsRef = useRef(accounts)
	accountsRef.current = accounts

	// ---------- copy requests to the agent ----------
	const openChat = async (create = false) => {
		try {
			let chatId: string | null = planRef.current.chatId ?? null
			if (!chatId && create) {
				chatId = findChatId(await runAction('chat::NewChat', project ? { projectId: project } : {}, { source: 'button' }))
				if (chatId) update(x => ({ ...x, chatId: chatId! }), true)
			}
			if (chatId) await runAction('chat::OpenInNewTab', { chatId }, { source: 'button' })
			return chatId
		} catch (error) {
			say(`Could not open the chat: ${errorText(error)}`, 'fail')
			return null
		}
	}

	// One click through the bridge when it can send prompts; otherwise copy the request and open a chat tab
	const sendToAgent = async (message: string): Promise<string> => {
		let why = ''
		if (z.canPrompt && project) {
			try {
				const r = await api('/thumbs/prompt', { method: 'POST', body: { projectId: project, chatId: planRef.current.chatId, message } })
				if (typeof r.chatId === 'string' && r.chatId !== planRef.current.chatId) update(x => ({ ...x, chatId: r.chatId }), true)
				return `Sent to the agent${r.created ? ' in a new chat' : ''}. The options show up here when it has written them.`
			} catch (error) {
				why = `The bridge could not send it (${fail(error)}). `
			}
		}
		const copied = await copyText(message)
		const chatId = await openChat(true)
		const where = chatId ? 'the chat that just opened' : 'a new chat in this project'
		if (copied) return `${why}The request is on the clipboard. Paste it into ${where} and send it.`
		// the clipboard is only open for a moment after a click: hand the text over for a manual copy
		setPromptBox({ text: message, note: `${why}Copy the request and send it in ${where}.` })
		return ''
	}

	const onGenerate = (platforms: PlatformKey[], fresh = false) => {
		if (!platforms.length || busy) return
		act('Asking the agent', async () => {
			const requestId = uuid()
			const pl = planRef.current
			const fromLibrary = pl.media.main || pl.media.vertical
			const message = composeCopyMessage({
				requestId,
				projectId: project,
				platforms,
				params: pl.params,
				notes: Object.fromEntries(platforms.map(k => [k, pl.platforms[k].note])),
				video: { mediaId: fromLibrary, path: fromLibrary ? '' : pathsRef.current.main || pathsRef.current.vertical },
				shown: fresh ? platforms.flatMap(k => copyRef.current?.platforms[k]?.options ?? []) : undefined,
			})
			// Saved before the request leaves, so an answer that comes back at once is still recognised
			update(x => ({ ...x, pendingRequest: { requestId, platforms, at: Date.now(), seen: Object.fromEntries(platforms.map(k => [k, optionsHash(copyRef.current, k)])) } }), true)
			setActive(current => (current && platforms.includes(current) ? current : platforms[0]))
			try {
				return await sendToAgent(message)
			} catch (error) {
				update(x => (x.pendingRequest?.requestId === requestId ? { ...x, pendingRequest: undefined } : x), true)
				throw error
			}
		})
	}

	// The answer: copy.json carries the request id, or at least new options for a platform that was asked for
	// (an agent may forget the id). Platforms can arrive one write at a time, so a partial answer waits a little.
	const pending = plan.pendingRequest
	useEffect(() => {
		if (!pending || !copy) return
		const hasOptions = (k: PlatformKey) => (copy.platforms[k]?.options.length ?? 0) > 0
		const got = pending.platforms.filter(k => hasOptions(k) && (pending.seen ? optionsHash(copy, k) !== (pending.seen[k] ?? '') : copy.requestId === pending.requestId))
		// the right id with nothing new still counts as an answer, or the panel would wait forever
		if (!got.length && copy.requestId !== pending.requestId) return
		const missing = pending.platforms.filter(k => !got.includes(k))
		const finish = () => {
			update(x => (x.pendingRequest?.requestId === pending.requestId ? { ...x, pendingRequest: undefined } : x), true)
			if (got.length) setActive(current => (current && got.includes(current) ? current : got[0]))
			if (!got.length) say(`The agent answered but wrote nothing new for ${labels(missing)}. Open the chat to see why, or ask again.`, 'warn')
			else say(missing.length ? `New options for ${labels(got)}. Nothing new came for ${labels(missing)}: ask again for those.` : `New options for ${labels(got)}. Choose one, then edit it. Your own edits stay as they are.`, missing.length ? 'warn' : 'ok')
		}
		if (!missing.length) return finish()
		const timer = setTimeout(finish, 45_000)
		return () => clearTimeout(timer)
	}, [copy, pending?.requestId])
	const [, tick] = useState(0)
	useEffect(() => {
		if (!pending) return
		const timer = setInterval(() => tick(n => n + 1), 30_000)
		return () => clearInterval(timer)
	}, [pending?.requestId])
	const waiting = pending ? { platforms: pending.platforms, minutes: Math.floor((Date.now() - pending.at) / 60_000) } : null

	// ---------- video: probes, covers, what each platform gets ----------
	const onBridgeError = useCallback((error: unknown) => say(fail(error), 'fail'), [fail, say])
	const { covers, reload: reloadCovers, loading: coversLoading } = useCovers(bridgeOk, project, onBridgeError)
	// The bridge reads size, shape and length of the chosen videos so each platform gets a file it shows right
	const [probes, setProbes] = useState<Record<string, ProbeState>>({})
	const probing = useRef(new Set<string>())
	const sources = mediaSources(plan, paths)
	useEffect(() => {
		if (!bridgeOk) return
		for (const s of [sources.main, sources.vertical]) {
			const known = s ? probes[s.key] : undefined
			if (!s || probing.current.has(s.key) || (known && !('error' in known))) continue
			probing.current.add(s.key)
			api('/zernio/media/probe', { method: 'POST', body: { source: s.source } })
				.then(r => setProbes(x => ({ ...x, [s.key]: r })))
				.catch(error => {
					const text = fail(error)
					// a lost connection says nothing about the file: leave it unprobed and try again later
					if (!(error instanceof BridgeError && (error.status === 0 || error.status === 401))) setProbes(x => ({ ...x, [s.key]: { error: text } }))
				})
				.finally(() => probing.current.delete(s.key))
		}
	}, [bridgeOk, sources.main?.key, sources.vertical?.key])
	const deliveries = useMemo(() => Object.fromEntries(PLATFORM_KEYS.map(k => [k, deliveryFor(k, plan, paths, covers, probes)])) as Record<PlatformKey, Delivery>, [plan, paths, covers, probes])
	const deliveriesRef = useRef(deliveries)
	deliveriesRef.current = deliveries

	// Renders run on this machine through the bridge (ffmpeg); a finished render is reused by file name
	const [cutState, setCutState] = useState<Record<string, Partial<Cut>>>({})
	const render = async (s: Source, onProgress: (value: number) => void): Promise<string> => {
		const start = (preset: string) => api('/zernio/media/render', { method: 'POST', body: { projectId: project || undefined, source: s.source, preset } })
		const track = (patch: Partial<Cut>) => setCutState(x => ({ ...x, [s.key]: { ...x[s.key], ...patch } }))
		track({ state: 'rendering', progress: 0, error: undefined })
		try {
			let job = await start(s.render!).catch(error => {
				// a bridge from before this preset existed still knows the older one
				if (s.fallback && error instanceof BridgeError && error.status === 400 && /preset/i.test(error.message)) return start(s.fallback)
				throw error
			})
			for (;;) {
				if (job.state === 'done' && job.file) {
					track({ state: 'done', progress: 1, file: job.file, size: job.size })
					return job.file
				}
				if (job.state === 'error') throw new Error(`Could not render the ${s.label}: ${job.error ?? 'unknown error'}`)
				const value = Number(job.progress) || 0
				track({ progress: value })
				onProgress(value)
				await sleep(1200)
				job = await api(`/zernio/media/render/status?id=${encodeURIComponent(job.id)}`)
			}
		} catch (error) {
			track({ state: 'error', error: errorText(error) })
			throw error
		}
	}
	const needed = rendersFor(deliveries, on)
	const cuts: Cut[] = needed.map(s => ({ key: s.key, label: s.label, for: s.for, state: 'idle', progress: 0, ...cutState[s.key] }))
	const onRenderCuts = () =>
		act('Rendering', async () => {
			let n = 0
			for (const s of needed) {
				if (cutState[s.key]?.state === 'done') continue
				await render(s, () => {})
				n++
			}
			return n ? `${plural(n, 'cut')} rendered. ${SHOW_IN} takes you to the file.` : ''
		})
	const onReveal = (file: string) => api('/zernio/media/reveal', { method: 'POST', body: { file } }).catch(error => say(fail(error), 'fail'))

	// ---------- per-platform data from Zernio ----------
	const ytAccount = accountFor('youtube', plan.platforms.youtube, accounts).account
	const ttAccount = accountFor('tiktok', plan.platforms.tiktok, accounts).account
	const [playlists, setPlaylists] = useState<{ id: string; title: string }[]>([])
	useEffect(() => {
		if (!canPost || !ytAccount || !plan.platforms.youtube.on) return
		let live = true
		api(`/zernio/youtube/playlists?accountId=${encodeURIComponent(ytAccount.id)}`)
			.then(r => live && setPlaylists(Array.isArray(r.playlists) ? r.playlists : []))
			.catch(error => live && say(`Could not load the YouTube playlists: ${fail(error)}`, 'warn'))
		return () => {
			live = false
		}
	}, [canPost, ytAccount?.id, plan.platforms.youtube.on])
	const [tiktokInfo, setTiktokInfo] = useState<any>(null)
	useEffect(() => {
		if (!canPost || !ttAccount || !plan.platforms.tiktok.on) return
		let live = true
		api(`/zernio/tiktok/creator-info?accountId=${encodeURIComponent(ttAccount.id)}&mediaType=video`)
			.then(r => live && setTiktokInfo(r))
			.catch(error => live && say(`Could not load the TikTok options: ${fail(error)}`, 'warn'))
		return () => {
			live = false
		}
	}, [canPost, ttAccount?.id, plan.platforms.tiktok.on])

	// ---------- where each platform stands ----------
	const checks = Object.fromEntries(PLATFORM_KEYS.map(k => [k, platformChecks(k, plan, { accounts, rules, canPost, delivery: deliveries[k] })])) as Record<PlatformKey, Check[]>
	const held = (pl: Plan, k: PlatformKey) => pl.outbox.some(o => o.keys.includes(k))
	// a post exists for this platform (in any state), so it never goes out again by itself
	const isOut = (pl: Plan, k: PlatformKey) => !!pl.sent[k] && pl.sent[k]!.status !== 'rejected'
	const sendable = on.filter(k => !held(plan, k) && !isOut(plan, k) && !blockers(checks[k]).length)
	const statusOf = (k: PlatformKey): Status => {
		if (held(plan, k)) return { level: 'warn', text: 'Outcome unknown, see Go', area: 'time' }
		const sent = plan.sent[k]
		if (sent && sent.status !== 'rejected') return sentStatus(sent, plan.timezone)
		const fails = blockers(checks[k])
		const mine = fails.find(c => c.area !== 'setup')
		if (mine) return { level: 'fail', text: mine.text, area: mine.area }
		if (!canPost) return { level: 'info', text: 'Copy is ready. Posting is not set up', area: 'setup' }
		if (fails[0]) return { level: 'fail', text: fails[0].text, area: fails[0].area }
		if (sent) return sentStatus(sent, plan.timezone)
		const p = plan.platforms[k]
		return { level: 'ok', text: p.when === 'now' ? 'Ready to post' : p.when === 'draft' ? 'Ready to save as a draft' : `Ready for ${whenText(p.when, p.at, plan.timezone)}` }
	}
	const status = Object.fromEntries(PLATFORM_KEYS.map(k => [k, statusOf(k)])) as Record<PlatformKey, Status>

	// Exactly one next step is marked: the video first, then the copy, then the review
	const hasVideo = !!(sources.main || sources.vertical)
	const next: 'video' | 'copy' | 'go' | '' = !on.length ? '' : !hasVideo ? 'video' : on.some(k => !hasWords(plan.platforms[k]) && !copy?.platforms[k]?.options.length) ? 'copy' : 'go'

	const jump = (k: PlatformKey, area?: Area) => {
		if (area === 'setup') return setSetup(true)
		const target = area === 'video' ? 'video' : area === 'copy' ? 'copy' : 'go'
		if (target === 'copy') setActive(k)
		if (target === 'go') setOpenPlat(k)
		anchors.current[target]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
	}

	// ---------- building posts ----------
	const cached = (key: string) => {
		const u = planRef.current.uploads[key]
		return u && Date.now() - u.at < UPLOAD_TTL && cacheable(key) ? u.url : ''
	}
	const build = (keys: PlatformKey[], urls: Record<string, string>, consent: boolean) => {
		const pl = planRef.current
		const entries = keys.map(k => {
			const p = pl.platforms[k]
			const { video: v, cover: c } = deliveriesRef.current[k]
			const media: Resolved = { video: v && urls[v.key] ? { url: urls[v.key], type: 'video' } : undefined, cover: c && urls[c.key] ? urls[c.key] : undefined }
			return { key: k, when: p.when, at: p.at, entry: platformEntry(k, p, accountFor(k, p, accountsRef.current).account?.id ?? '', media, pl.params, consent) }
		})
		const yt = pl.platforms.youtube
		return buildPosts(entries, pl.timezone, keys.includes('youtube') ? tagList(yt.tags) : [], keys.includes('youtube') ? yt.title.trim() : '')
	}
	const sourcesFor = (keys: PlatformKey[]) => {
		const map = new Map<string, Source>()
		for (const k of keys) {
			const { video: v, cover: c } = deliveriesRef.current[k]
			if (v) map.set(v.key, v)
			if (c) map.set(c.key, c)
		}
		return [...map.values()]
	}
	const upload = async (s: Source, set: (patch: Partial<Progress>) => void): Promise<string> => {
		let source = s.source
		if (s.render) {
			set({ state: 'rendering', value: 0 })
			source = { path: await render(s, value => set({ value })) }
		}
		const start = await api('/zernio/media/upload', { method: 'POST', body: { source } })
		set({ state: 'uploading', value: 0, label: `${cap(s.label)}: ${start.name}${start.total ? ` (${fmtBytes(start.total)})` : ''}${start.source === 'cloud' ? ', from Kino cloud' : ''}` })
		for (;;) {
			await sleep(1000)
			const st = await api(`/zernio/media/upload/status?id=${encodeURIComponent(start.jobId)}`)
			if (st.state === 'done' && st.publicUrl) {
				set({ state: 'done', value: 1 })
				return st.publicUrl
			}
			if (st.state === 'error') throw new Error(`Could not upload the ${s.label}: ${st.error ?? 'unknown error'}`)
			set({ value: st.total ? (Number(st.bytes) || 0) / st.total : 0 })
		}
	}
	const keepUpload = (key: string, url: string) => cacheable(key) && update(x => ({ ...x, uploads: { ...freshUploads(x.uploads), [key]: { url, at: Date.now() } } }), true)

	// ---------- sending ----------
	// Every create request is written to plan.outbox before it leaves and taken out when its outcome is
	// known. The same id goes to the bridge and on to Zernio as the idempotency key, so asking twice
	// (a second click, a retry after a dropped connection) cannot make a second post.
	const looked = useRef(new Set<string>())
	const settle = (item: Pending, result: any) => {
		const post = result?.post ?? {}
		const entries: any[] = Array.isArray(post.platforms) ? post.platforms : []
		const at = new Date().toISOString()
		const postId = typeof post._id === 'string' ? post._id : undefined
		const sent: Plan['sent'] = {}
		for (const k of item.keys) {
			const e = entries.find(x => x?.platform === k)
			sent[k] = { at, mode: item.mode, when: item.at || undefined, postId, status: platformStatus(item.mode, e, post), url: httpUrl(e?.platformPostUrl), error: e?.errorMessage ? String(e.errorMessage).slice(0, 400) : undefined }
		}
		// Zernio stores a thumbnail sent with a YouTube upload but never applies it, so set it after
		const ytCover = (item.payload.platforms ?? []).find((p: any) => p?.platform === 'youtube')?.customMedia?.[0]?.thumbnail
		const thumb: ThumbJob | undefined = item.mode !== 'draft' && postId && httpUrl(ytCover) && sent.youtube?.status !== 'failed' ? { state: 'pending', url: ytCover, name: deliveriesRef.current.youtube.coverName || undefined } : undefined
		const entry: HistoryEntry = {
			at,
			postId,
			mode: item.mode,
			platforms: item.keys,
			status: String(post.status ?? (result?.http === 207 ? 'partial' : 'created')),
			http: typeof result?.http === 'number' ? result.http : undefined,
			urls: Object.fromEntries(item.keys.filter(k => sent[k]?.url).map(k => [k, sent[k]!.url!])),
			errors: item.keys.filter(k => sent[k]?.error).map(k => `${SPEC[k].label}: ${sent[k]!.error}`),
			thumb,
		}
		update(x => ({ ...x, outbox: x.outbox.filter(o => o.key !== item.key), sent: { ...x.sent, ...sent }, history: [entry, ...x.history].slice(0, 30) }), true)
	}
	const refuse = (item: Pending, why: string) => {
		const at = new Date().toISOString()
		update(x => ({ ...x, outbox: x.outbox.filter(o => o.key !== item.key), sent: { ...x.sent, ...Object.fromEntries(item.keys.map(k => [k, { at, mode: item.mode, status: 'rejected' as const, error: why.slice(0, 400) }])) } }), true)
	}
	const dispatch = async (item: Pending) => {
		looked.current.add(item.key)
		update(x => ({ ...x, outbox: [...x.outbox.filter(o => o.key !== item.key), { ...item, error: undefined }] }), true)
		try {
			settle(item, await api('/zernio/posts/create', { method: 'POST', body: { payload: item.payload, idempotencyKey: item.key, confirm: true } }))
		} catch (error) {
			const why = fail(error)
			// 409 from Zernio is a refusal (a duplicate, a conflict); from the bridge it means the first try is still running
			const refused = error instanceof BridgeError && (REFUSED.includes(error.status) || (error.status === 409 && !/already being sent/i.test(error.message)))
			if (refused) refuse(item, why)
			else update(x => ({ ...x, outbox: x.outbox.map(o => (o.key === item.key ? { ...o, error: why } : o)) }), true)
		}
	}
	// What became of a request with no clear answer: first the bridge's own record, then Zernio's post list
	const resolve = async (item: Pending): Promise<string> => {
		try {
			const r = await api(`/zernio/posts/sent?key=${encodeURIComponent(item.key)}`)
			if (r.state === 'done' && r.result) {
				settle(item, r.result)
				return `Found it: the post for ${labels(item.keys)} went through.`
			}
			if (r.state === 'sending') return 'The bridge is still sending this post. Check again in a minute.'
			if (r.state === 'error' && !r.unreachable) {
				refuse(item, String(r.error ?? 'Zernio refused the post.'))
				return `Zernio refused the post for ${labels(item.keys)}, so nothing was created.`
			}
		} catch (error) {
			if (!(error instanceof BridgeError && (error.status === 404 || error.status === 400))) throw error
		}
		const list = await api('/zernio/posts?limit=30')
		const hit = (Array.isArray(list.posts) ? list.posts : []).find((p: any) => p?.metadata?.key === item.key)
		if (hit) {
			settle(item, { post: hit })
			return `Found it in Zernio: the post for ${labels(item.keys)} exists.`
		}
		return `The 30 newest posts in Zernio do not include this one. Look in your Zernio dashboard. If it is not there either, press Send again.`
	}
	// A send from an earlier session that never got its answer: look it up once, quietly
	useEffect(() => {
		if (!canPost) return
		for (const item of plan.outbox) {
			if (looked.current.has(item.key)) continue
			looked.current.add(item.key)
			resolve(item).catch(() => {})
		}
	}, [canPost, plan.outbox.length])
	const onOutbox = (item: Pending, what: 'check' | 'resend' | 'discard') => {
		if (what === 'discard') return setAsk({ title: 'Forget this send?', text: `The panel stops tracking the post for ${labels(item.keys)}. Do this once you know whether it went out: afterwards these platforms can be sent again.`, yes: 'Forget it', run: () => update(x => ({ ...x, outbox: x.outbox.filter(o => o.key !== item.key) }), true) })
		if (what === 'check') return void act('Checking', () => resolve(item))
		setAsk({
			title: 'Send this post again?',
			text: `The post for ${labels(item.keys)} goes to Zernio again exactly as you confirmed it (${item.mode === 'now' ? 'publishes now' : item.mode === 'draft' ? 'draft' : whenText(item.mode, item.at, plan.timezone)}), under the same id. If Zernio already has it, it answers with that post and makes no second one.`,
			yes: 'Send again',
			run: () =>
				act('Sending', async () => {
					await dispatch(item)
					const left = planRef.current.outbox.find(o => o.key === item.key)
					if (left) throw new Error(`Still no clear answer for ${labels(item.keys)}: ${left.error ?? 'no reply'}`)
					return `Done for ${labels(item.keys)}. Each platform line shows the result.`
				}),
		})
	}

	// Fresh status from Zernio for the posts this plan knows about
	const applyPost = (post: any) => {
		const entries: any[] = Array.isArray(post?.platforms) ? post.platforms : []
		update(x => {
			const sent = { ...x.sent }
			let changed = false
			for (const k of PLATFORM_KEYS) {
				const s = sent[k]
				if (!s || !s.postId || s.postId !== post?._id) continue
				const e = entries.find(p => p?.platform === k)
				const next = { ...s, status: platformStatus(s.mode, e, post), url: httpUrl(e?.platformPostUrl) ?? s.url, error: e?.errorMessage ? String(e.errorMessage).slice(0, 400) : undefined }
				if (next.status !== s.status || next.url !== s.url || next.error !== s.error) {
					sent[k] = next
					changed = true
				}
			}
			return changed ? { ...x, sent } : x
		}, true)
	}
	const refreshSent = async (quiet: boolean) => {
		const ids = [...new Set(PLATFORM_KEYS.map(k => planRef.current.sent[k]?.postId).filter((id): id is string => !!id))]
		const gone: PlatformKey[] = []
		for (const id of ids) {
			try {
				const data = await api(`/zernio/post?id=${encodeURIComponent(id)}`)
				applyPost(data.post ?? data)
			} catch (error) {
				if (error instanceof BridgeError && error.status === 404) gone.push(...PLATFORM_KEYS.filter(k => planRef.current.sent[k]?.postId === id))
				else if (!quiet) throw error
				else fail(error)
			}
		}
		// deleted in Zernio (a cancelled schedule, a removed draft): the platform is free to go out again
		if (gone.length) update(x => ({ ...x, sent: Object.fromEntries(Object.entries(x.sent).filter(([k]) => !gone.includes(k as PlatformKey))) }), true)
		return gone.length ? `The Zernio post for ${labels(gone)} no longer exists, so ${gone.length === 1 ? 'it' : 'they'} can be sent again.` : ''
	}
	// Keep looking while something is on its way out: a post that is publishing, or a schedule whose time has come
	const watching = PLATFORM_KEYS.some(k => {
		const s = plan.sent[k]
		if (!s?.postId) return false
		if (s.status === 'publishing') return Date.now() - Date.parse(s.at) < WATCH_MS
		const due = s.status === 'scheduled' && s.when ? zonedToUtc(s.when, plan.timezone) : NaN
		return !Number.isNaN(due) && Date.now() > due && Date.now() - due < WATCH_MS
	})
	useEffect(() => {
		if (!canPost || !watching) return
		const look = () => refreshSent(true).then(text => text && say(text), () => {})
		look()
		const timer = setInterval(look, 20_000)
		return () => clearInterval(timer)
	}, [canPost, watching])

	const [review, setReview] = useState<Review | null>(null)
	const [consent, setConsent] = useState(false)
	const patchReview = (patch: Partial<Review>) => setReview(r => (r ? { ...r, ...patch } : r))
	const onReview = () => {
		if (!sendable.length || busy) return
		setConsent(false)
		setNote(null)
		setReview({ keys: sendable, phase: 'review', step: '', progress: [], error: '', validation: null, validating: false })
	}

	// Dry run of Zernio's own validation. Nothing is posted.
	const onValidate = async () => {
		if (!review) return
		patchReview({ validating: true, validation: null, error: '' })
		try {
			const urls: Record<string, string> = {}
			let placeholder = false
			for (const s of sourcesFor(review.keys)) {
				const url = cached(s.key)
				if (url) urls[s.key] = url
				else if (!s.key.startsWith('t:')) {
					urls[s.key] = PLACEHOLDER
					placeholder = true
				}
			}
			const out: Check[] = []
			for (const post of build(review.keys, urls, true)) {
				const r = await api('/zernio/validate', { method: 'POST', body: { payload: post.payload } })
				// complaints about the stand-in file say nothing about the real one
				const aboutFile = (text: string, code?: string) => placeholder && (code === 'MEDIA_UNDECODABLE' || /placeholder|example\.com|fetch|download|decod|reach|url/i.test(text))
				for (const e of Array.isArray(r.errors) ? r.errors : []) if (!aboutFile(String(e?.error), e?.code)) out.push({ level: 'fail', text: `${SPEC[e?.platform as PlatformKey]?.label ?? e?.platform ?? 'Post'}: ${e?.error}` })
				for (const w of Array.isArray(r.warnings) ? r.warnings : []) if (!aboutFile(String(w?.warning))) out.push({ level: 'warn', text: `${SPEC[w?.platform as PlatformKey]?.label ?? w?.platform ?? 'Post'}: ${w?.warning}` })
			}
			if (placeholder) out.push({ level: 'info', text: 'The files are not uploaded yet, so Zernio could not check them. It does when you send.' })
			patchReview({ validation: out, validating: false })
		} catch (error) {
			patchReview({ validating: false, error: `The dry run failed: ${fail(error)}` })
		}
	}

	const posting = useRef(false)
	const runPost = async () => {
		// the ref closes the gap between two fast clicks, before React has disabled the button
		if (!review || review.phase !== 'review' || posting.current) return
		posting.current = true
		const keys = review.keys
		setBusy('Sending')
		setNote(null)
		patchReview({ phase: 'working', error: '', step: 'Getting the files ready...', progress: [] })
		try {
			// The dialog may have been open for a while: check again against the clock and the plan as it is now
			const pl = planRef.current
			const late = keys.flatMap(k => [
				...(pl.platforms[k].on && !isOut(pl, k) && !held(pl, k) ? [] : [`${SPEC[k].label}: the plan changed since the review opened`]),
				...blockers(platformChecks(k, pl, { accounts: accountsRef.current, rules, canPost: true, delivery: deliveriesRef.current[k], tiktokConsent: consent })).map(c => `${SPEC[k].label}: ${c.text}`),
			])
			if (late.length) throw new Error(`Nothing was sent. ${late.join('. ')}.`)
			// 1. renders and uploads (kept for a day, so a second try does not upload twice)
			const urls: Record<string, string> = {}
			const todo = sourcesFor(keys).filter(s => {
				const url = cached(s.key)
				if (url) urls[s.key] = url
				return !url
			})
			patchReview({ progress: todo.map(s => ({ label: cap(s.label), value: 0, state: 'waiting' })) })
			for (let i = 0; i < todo.length; i++) {
				const set = (patch: Partial<Progress>) => setReview(r => (r ? { ...r, progress: r.progress.map((x, j) => (j === i ? { ...x, ...patch } : x)) } : r))
				try {
					const url = await upload(todo[i], set)
					urls[todo[i].key] = url
					keepUpload(todo[i].key, url)
				} catch (error) {
					set({ state: 'error' })
					throw error
				}
			}
			// 2. one Zernio post per time: now, each scheduled time, drafts
			const posts = build(keys, urls, consent)
			for (let i = 0; i < posts.length; i++) {
				const post = posts[i]
				patchReview({ step: `Sending ${labels(post.keys)} to Zernio${posts.length > 1 ? ` (${i + 1} of ${posts.length})` : ''}...${post.mode === 'now' ? ' Publishing can take a few minutes.' : ''}` })
				const key = uuid()
				await dispatch({ key, mode: post.mode, at: post.at, keys: post.keys, payload: { ...post.payload, metadata: { ...post.payload.metadata, key } }, sentAt: Date.now() })
			}
			patchReview({ phase: 'done', step: '' })
			setConsent(false)
		} catch (error) {
			// nothing has been sent at this point: uploads and checks come before the first post
			patchReview({ phase: 'review', step: '', error: fail(error) })
		} finally {
			posting.current = false
			setBusy('')
		}
	}

	const onRetry = (k: PlatformKey) => {
		const postId = plan.sent[k]?.postId
		if (!postId) return
		setAsk({
			title: 'Retry in Zernio?',
			text: `Zernio tries the failed platforms of this post again, with the same text and files. Platforms that already went out are left alone.`,
			yes: 'Retry',
			run: () =>
				act('Retrying', async () => {
					const r = await api('/zernio/posts/retry', { method: 'POST', body: { id: postId } })
					if (r.post) applyPost(r.post)
					else await refreshSent(false)
					return 'Retry sent. The platform line shows the new result.'
				}),
		})
	}
	const onClear = (keys: PlatformKey[]) => {
		const clear = () => update(x => ({ ...x, sent: Object.fromEntries(Object.entries(x.sent).filter(([k]) => !keys.includes(k as PlatformKey))) }), true)
		const out = keys.filter(k => ['published', 'publishing', 'scheduled'].includes(plan.sent[k]?.status ?? ''))
		if (!out.length) return clear()
		setAsk({ title: 'Send again?', text: `${labels(out)} already ${out.length === 1 ? 'has a post' : 'have posts'} from this plan. Forgetting the result lets you send again, and the existing ${out.length === 1 ? 'post stays' : 'posts stay'}: a scheduled one still goes out unless you cancel it under Posts in Zernio.`, yes: 'Forget the result', run: clear })
	}

	// ---------- YouTube thumbnail ----------
	// Runs while the panel is open; a pending job survives in plan.json and resumes on the next open
	const setThumb = (postId: string, thumb: ThumbJob) => update(x => ({ ...x, history: x.history.map(e => (e.postId === postId && e.thumb ? { ...e, thumb } : e)) }), true)
	const thumbTries = useRef<Record<string, { next: number; tries: number }>>({})
	const thumbBusy = useRef(false)
	useEffect(() => {
		if (!canPost) return
		const tickThumb = async () => {
			if (thumbBusy.current) return
			const entry = planRef.current.history.find(e => e.thumb?.state === 'pending' && e.postId && Date.now() >= (thumbTries.current[e.postId]?.next ?? 0))
			if (!entry?.thumb || !entry.postId) return
			const id = entry.postId
			const job = entry.thumb
			const t = (thumbTries.current[id] ??= { next: 0, tries: 0 })
			const stop = (why: string) => setThumb(id, { ...job, state: 'error', note: `${why} Use Set thumbnail under Posts in Zernio to try again.` })
			thumbBusy.current = true
			try {
				if (Date.now() - Date.parse(entry.at) > 6 * 3600_000) return stop('YouTube still had no video after 6 hours.')
				const data = await api(`/zernio/post?id=${encodeURIComponent(id)}`)
				const yt = (data.post?.platforms ?? data.platforms ?? []).find((p: any) => p?.platform === 'youtube')
				if (!yt) return stop('This post has no YouTube entry.')
				if (yt.status === 'failed') return stop('The YouTube upload failed.')
				if (!yt.platformPostId) {
					t.next = Date.now() + 20_000 // YouTube does not have the video yet
					return
				}
				const accountId = typeof yt.accountId === 'string' ? yt.accountId : yt.accountId?._id
				await api('/zernio/youtube/thumbnail', { method: 'POST', body: { postId: id, thumbnailUrl: job.url, accountId, confirm: true } })
				setThumb(id, { ...job, state: 'done', note: undefined })
				say(`YouTube thumbnail set${job.name ? `: "${job.name}"` : ''}. YouTube can take a few minutes to show it.`, 'ok')
			} catch (error) {
				const code = error instanceof BridgeError ? error.status : 0
				t.tries++
				if (code === 412 || code === 424 || t.tries >= 4) stop(`${fail(error)}.`)
				else t.next = Date.now() + (code === 429 ? 60_000 : 30_000 * 2 ** (t.tries - 1))
			} finally {
				thumbBusy.current = false
			}
		}
		const timer = setInterval(tickThumb, 5000)
		tickThumb()
		return () => clearInterval(timer)
	}, [canPost])
	const onSetThumb = (postId: string, accountId?: string) => {
		const d = deliveriesRef.current.youtube
		const cover = d.cover
		if (!cover) return say('There is no 16:9 cover to set. Choose one under Video.', 'fail')
		setAsk({
			title: 'Set the YouTube thumbnail?',
			text: `"${d.coverName}" becomes the thumbnail of this YouTube video. The cover is uploaded to Zernio first.`,
			yes: 'Set thumbnail',
			run: () =>
				act('Setting the thumbnail', async () => {
					let url = cached(cover.key)
					if (!url) {
						url = await upload(cover, () => {})
						keepUpload(cover.key, url)
					}
					await api('/zernio/youtube/thumbnail', { method: 'POST', body: { postId, thumbnailUrl: url, accountId, confirm: true } })
					setThumb(postId, { state: 'done', url, name: d.coverName })
					return `YouTube thumbnail set: "${d.coverName}". YouTube can take a few minutes to show it.`
				}),
		})
	}

	// ---------- posts in Zernio ----------
	const [activity, setActivity] = useState<{ open: boolean; posts: any[]; loading: boolean }>({ open: false, posts: [], loading: false })
	const loadPosts = useCallback(() => {
		setActivity(a => ({ ...a, loading: true }))
		api(`/zernio/posts?limit=10${profileId ? `&profileId=${encodeURIComponent(profileId)}` : ''}`)
			.then(r => setActivity(a => ({ ...a, posts: Array.isArray(r.posts) ? r.posts : [], loading: false })))
			.catch(error => {
				setActivity(a => ({ ...a, loading: false }))
				say(fail(error), 'fail')
			})
	}, [fail, say, profileId])
	const onActivity = (what: 'toggle' | 'refresh') => {
		if (what === 'toggle') setActivity(a => ({ ...a, open: !a.open }))
		if (what === 'refresh' || !activity.open) loadPosts()
	}
	const onPostRetry = (id: string) =>
		setAsk({
			title: 'Retry in Zernio?',
			text: 'Zernio tries the failed platforms of this post again, with the same text and files.',
			yes: 'Retry',
			run: () =>
				act('Retrying', async () => {
					const r = await api('/zernio/posts/retry', { method: 'POST', body: { id } })
					if (r.post) applyPost(r.post)
					loadPosts()
					return `Retry sent. Status: ${r.post?.status ?? r.status ?? 'unknown'}.`
				}),
		})
	const onPostDelete = (id: string) =>
		setAsk({
			title: 'Delete this post from Zernio?',
			text: 'A scheduled post is cancelled and will not go out. This cannot be undone here.',
			yes: 'Delete',
			danger: true,
			run: () =>
				act('Deleting', async () => {
					await api('/zernio/posts/delete', { method: 'POST', body: { id } })
					// the platforms of a deleted post are free to go out again
					update(x => ({ ...x, sent: Object.fromEntries(Object.entries(x.sent).filter(([, s]) => s?.postId !== id)) }), true)
					loadPosts()
					return 'Deleted from Zernio.'
				}),
		})

	// ---------- setup ----------
	const [usage, setUsage] = useState<any>(null)
	const onSaveKey = async (key: string) => {
		setBusy('Saving the key')
		setNote(null)
		try {
			await api('/zernio/key', { method: 'POST', body: { key } })
			await z.check()
			say(`Key saved on ${MACHINE}. Zernio accepts it.`, 'ok')
			return true
		} catch (error) {
			// 424 here is about the key just typed: the one already saved is untouched
			if (error instanceof BridgeError && error.status === 424) say('Zernio rejected that key. The key saved before is unchanged.', 'fail')
			else say(error instanceof BridgeError && error.status !== 0 && error.status !== 401 ? error.message : fail(error), 'fail')
			z.check()
			return false
		} finally {
			setBusy('')
		}
	}
	const onRemoveKey = () =>
		setAsk({
			title: 'Remove the Zernio key?',
			text: `The key is deleted from ${MACHINE}. Posting stops until you add one again. Posts already scheduled in Zernio still go out.`,
			yes: 'Remove the key',
			danger: true,
			run: () =>
				act('Removing the key', async () => {
					await api('/zernio/key/remove', { method: 'POST' })
					await z.check()
					return 'Key removed.'
				}),
		})
	const onConnect = (k: PlatformKey) =>
		act('Opening the sign-in', async () => {
			if (!profileId) throw new Error('Zernio has no profile yet. Create one in the Zernio dashboard, then press Refresh.')
			await api('/zernio/connect', { method: 'POST', body: { platform: k, profileId } })
			return `The ${SPEC[k].label} sign-in is open in your browser. Approve it there, then come back here.`
		})
	const onUsage = () =>
		act('Loading', async () => {
			setUsage(await api('/zernio/usage'))
		})
	const onRefreshAccounts = () => void z.loadAccounts().catch(error => say(fail(error), 'fail'))

	// What posting is waiting for, in one sentence for the Go section and a few words for the header
	const missingAccounts = canPost ? on.filter(k => accountFor(k, plan.platforms[k], accounts).problem) : []
	const posting_ = ((): { level: Level | 'idle'; short: string; long: string } => {
		if (bridge === 'checking' || (bridgeOk && keyState === 'unknown')) return { level: 'idle', short: 'Checking...', long: 'Checking the bridge and the Zernio key...' }
		if (bridge === 'offline') return { level: 'warn', short: 'Bridge is off', long: 'Posting needs the bridge, which is not running. Copy works without it.' }
		if (bridge === 'outdated') return { level: 'warn', short: 'Update the bridge', long: 'Posting needs a newer bridge. Copy works without it.' }
		if (bridge === 'unpaired' || bridge === 'pairing') return { level: 'warn', short: 'Connect the bridge', long: 'Posting needs this panel connected to the bridge. Copy works without it.' }
		if (keyState === 'none') return { level: 'warn', short: 'Set up posting', long: 'Posting needs a Zernio key. Copy and platform cuts work without one.' }
		if (keyState === 'invalid') return { level: 'fail', short: 'Zernio key rejected', long: 'Zernio rejected the saved key. Replace it to post.' }
		if (keyState === 'unreachable') return { level: 'warn', short: 'Zernio not answering', long: 'Zernio did not answer just now, so posting has to wait. Try again from setup.' }
		if (!accounts.length) return { level: 'warn', short: 'Connect accounts', long: '' }
		if (missingAccounts.length) return { level: 'warn', short: `${labels(missingAccounts)}: no account`, long: '' }
		return { level: 'ok', short: plural(accounts.length, 'account'), long: '' }
	})()
	const thumb = plan.history.find(e => e.thumb && e.postId && e.postId === plan.sent.youtube?.postId)?.thumb

	return h(
		'div',
		{ className: 'kpub-root', style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: BG, color: TEXT, fontFamily: FONT, fontSize: 12, overflow: 'hidden' } },
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${LINE}`, flex: 'none', minWidth: 0 } },
			h('div', { style: { fontWeight: 600, fontSize: 13, color: STRONG } }, 'Publish'),
			busy ? h('span', { role: 'status', style: { fontSize: 11, color: AMBER, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 } }, `${busy}...`) : null,
			h('div', { style: { flex: 1 } }),
			h(
				'button',
				{ type: 'button', className: 'kpub-btn', onClick: () => setSetup(true), title: 'Bridge, Zernio key and accounts', style: { display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 9px', borderRadius: 12, border: `1px solid ${ink(0.12)}`, background: ink(0.04), color: ink(0.8), fontSize: 11, fontFamily: FONT, cursor: 'pointer', flex: 'none', maxWidth: '60%', overflow: 'hidden', whiteSpace: 'nowrap' } },
				h(Dot, { color: posting_.level === 'ok' ? GREEN : posting_.level === 'fail' ? RED : posting_.level === 'warn' ? AMBER : ink(0.25) }),
				h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, posting_.short),
			),
		),
		h(
			'div',
			{ className: 'kpub-scroll', style: { flex: 1, minHeight: 0, overflow: 'auto' } },
			h(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: 22, padding: 12, maxWidth: 820, margin: '0 auto', boxSizing: 'border-box' } },
				note || z.note || unreadable
					? h(
							'div',
							{ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
							note ? h(Notice, { level: note.level, actions: h(Btn, { label: 'Dismiss', onClick: () => setNote(null) }) }, note.text) : null,
							z.note ? h(Notice, { level: 'warn', actions: h(Btn, { label: 'Dismiss', onClick: () => z.setNote('') }) }, z.note) : null,
							unreadable ? h(Notice, { level: 'warn' }, 'The saved plan (/publish/plan.json) could not be read, so this is a fresh one. The old file is kept as plan.unreadable.json when you make your first change.') : null,
						)
					: null,
				h(PlatformsBar, { plan, accounts, canPost, status, onToggle: k => setPlat(k, p => ({ ...p, on: !p.on })), onJump: jump }),
				h(
					Step,
					{ n: 1, title: 'Video', anchor: el => void (anchors.current.video = el), right: hasVideo ? (cuts.some(c => c.state !== 'done') ? `${plural(cuts.filter(c => c.state !== 'done').length, 'cut')} to render` : 'ready') : 'no video yet' },
					h(VideoSection, { plan, on, paths, probes, covers, coversLoading, deliveries, cuts, bridge, busy: !!busy, primary: next === 'video', setMedia, setPaths, setPlat, onRefreshCovers: reloadCovers, onRenderCuts, onReveal, onCopied: say, onSetup: () => setSetup(true) }),
				),
				h(
					Step,
					{ n: 2, title: 'Copy', anchor: el => void (anchors.current.copy = el), right: on.length ? `${on.filter(k => hasWords(plan.platforms[k])).length} of ${on.length} written` : '' },
					h(CopySection, { plan, rules, copy, copyError, on, active, setActive, busy: !!busy, canPrompt: z.canPrompt && !!project, primary: next === 'copy', waiting, setPlat, setParams, onGenerate, onOpenChat: () => void openChat(true), onDismissPending: () => update(x => ({ ...x, pendingRequest: undefined }), true), onCopied: say }),
				),
				h(
					Step,
					{ n: 3, title: 'Go', anchor: el => void (anchors.current.go = el), right: on.length ? `${sendable.length} of ${on.length} ready` : '' },
					h(GoSection, {
						plan,
						on,
						accounts,
						canPost,
						whyNot: posting_.long,
						status,
						checks,
						playlists,
						tiktokInfo,
						busy: !!busy,
						primary: next === 'go',
						sendable: canPost ? sendable : [],
						open: openPlat,
						setOpen: setOpenPlat,
						thumb,
						setPlat,
						update,
						onReview,
						onSetup: () => setSetup(true),
						onJump: jump,
						onRetry,
						onClear,
						onRefreshSent: () => void act('Checking', () => refreshSent(false).then(text => text || 'Results are up to date.')),
						onOutbox,
						activity,
						onActivity,
						onPostRetry,
						onPostDelete,
						onSetThumb,
					}),
				),
			),
		),
		review
			? h(ReviewDialog, { ...review, plan, rules, accounts, deliveries, playlists, tiktokInfo, uploads: sourcesFor(review.keys).filter(s => !cached(s.key)), consent, setConsent, onConfirm: runPost, onValidate, onClose: () => review.phase !== 'working' && setReview(null) })
			: null,
		setup
			? h(SetupDialog, {
					bridge,
					bridgeNote: z.note,
					note,
					working: busy,
					keyState,
					keyNote: z.keyNote,
					profiles: z.profiles,
					accounts,
					profileId,
					plan,
					on,
					busy: !!busy,
					loadingAccounts: z.loadingAccounts,
					usage,
					setPlat,
					onPair: z.pair,
					onRetryBridge: () => void z.check(),
					onProfile: id => update(x => ({ ...x, profileId: id })),
					onSaveKey,
					onRemoveKey,
					onConnect,
					onRefresh: onRefreshAccounts,
					onUsage,
					onClose: () => setSetup(false),
				})
			: null,
		promptBox ? h(PromptDialog, { ...promptBox, onOpenChat: () => void openChat(true), onClose: () => setPromptBox(null) }) : null,
		ask ? h(AskDialog, { ask, onClose: () => setAsk(null) }) : null,
	)
}
