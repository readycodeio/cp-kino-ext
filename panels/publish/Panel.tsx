// Publish: write post copy per platform with the agent (3 options each, house skill in /publish/skill),
// set schedule and visibility per platform, then upload and post through Zernio via the local bridge.
// The Zernio key stays in the local bridge; the panel only ever sees post data.
// Plan (choices, copy edits, history) lives in /publish/plan.json; the agent writes options to /publish/copy.json.
// Built with createElement rather than JSX: generated panels currently hit React #31 with JSX.
import { createElement as h, useCallback, useEffect, useRef, useState } from 'react'
import { runAction } from 'kino/panel'
import { BG, Btn, DIM, EMBER, GREEN, LINE, MONO, RED, Segmented, TEXT, UI_FONT, ensureCss } from '../thumbs/ui'
import { useCopyDoc, usePlan, useRules, useZernio } from './hooks'
import {
	PLATFORM_KEYS,
	SPEC,
	api,
	apiBlob,
	buildPosts,
	composeCopyMessage,
	findChatId,
	fmtBytes,
	platformEntry,
	sleep,
	tagList,
	uuid,
	BridgeError,
	type Check,
	type HistoryEntry,
	type Plan,
	type PlatformKey,
	type PlatPlan,
	type Resolved,
	type ThumbJob,
	type When,
} from './lib'
import { cacheable, deliveryFor, isProbe, mediaSources, type Cover, type Delivery, type ProbeState, type Source } from './media'
import { ConfirmDialog, CopyTab, PostTab, ScheduleTab, SettingsTab, accountFor, type Outgoing, type Progress } from './views'
import { ALLOW, MACHINE, START_BRIDGE, START_BRIDGE_HINT } from '../platform'
import { PROJECT_ID as INSTALLED_PROJECT_ID } from '../project'

// Panels have no project-id hook; fall back to the project the panels were installed into (../project.ts)
const PROJECT_ID = new URLSearchParams(window.location.search).get('project') || INSTALLED_PROJECT_ID
const PLACEHOLDER = 'https://example.com/kino-publish-placeholder.mp4'
const CACHE_MS = 24 * 3600_000
type Tab = 'copy' | 'schedule' | 'post' | 'settings'
type Pending = { posts: Outgoing[]; sources: Source[]; keys: Record<string, string>; done: string[] }
type Ask = { text: string; yes: string; run: () => void }

const code = (text: string) => h('code', { style: { fontFamily: MONO, color: TEXT } }, text)

export default function Panel() {
	useEffect(ensureCss, [])
	const [note, setNote] = useState('')
	const [busy, setBusy] = useState('')
	const [tab, setTab] = useState<Tab>('copy')
	const [ask, setAsk] = useState<Ask | null>(null)
	const onPlanError = useCallback((message: string) => setNote(`Failed: ${message}`), [])
	const { plan, update, planRef } = usePlan(onPlanError)
	const copy = useCopyDoc()
	const rules = useRules()
	const z = useZernio()
	const { bridge, keyState, accounts, profiles, fail, ready } = z

	const act = (what: string, fn: () => Promise<string | void>) => {
		setBusy(what)
		setNote('')
		return fn()
			.then(message => message && setNote(message))
			.catch(error => setNote(`Failed: ${fail(error)}`))
			.finally(() => setBusy(''))
	}
	const setPlat = (k: PlatformKey, fn: (p: PlatPlan) => PlatPlan) => update(x => ({ ...x, platforms: { ...x.platforms, [k]: fn(x.platforms[k]) } }))
	const setParams = (fn: (p: Plan['params']) => Plan['params']) => update(x => ({ ...x, params: fn(x.params) }))
	const on = PLATFORM_KEYS.filter(k => plan.platforms[k].on)
	const profileId = plan.profileId || profiles.find(p => p.isDefault)?.id || profiles[0]?.id || ''

	// ---------- agent copy requests ----------
	const openChat = () => plan.chatId && runAction('chat::OpenInNewTab', { chatId: plan.chatId }, { source: 'button' }).catch(error => setNote(`Failed: ${fail(error)}`))

	// One-click through the bridge when it supports prompts; otherwise copy the prompt and open a chat tab
	const sendToAgent = async (message: string): Promise<string> => {
		let bridgeError = ''
		if (z.canPrompt) {
			try {
				const r = await api('/thumbs/prompt', { method: 'POST', body: { projectId: PROJECT_ID, chatId: planRef.current.chatId, message } })
				if (r.chatId && r.chatId !== planRef.current.chatId) update(x => ({ ...x, chatId: r.chatId }), true)
				return `Sent to the agent${r.created ? ' in a new chat' : ''}. Options appear here as soon as it writes them.`
			} catch (error) {
				bridgeError = `One-click send failed (${fail(error)}). `
			}
		}
		try {
			await navigator.clipboard.writeText(message)
		} catch {
			throw new Error(`${bridgeError}Could not copy the prompt either.`)
		}
		let chatId: string | null = planRef.current.chatId ?? null
		try {
			if (!chatId) {
				chatId = findChatId(await runAction('chat::NewChat', { projectId: PROJECT_ID }, { source: 'button' }))
				if (chatId) update(x => ({ ...x, chatId: chatId! }), true)
			}
			if (chatId) await runAction('chat::OpenInNewTab', { chatId }, { source: 'button' })
		} catch {}
		return bridgeError + (chatId ? 'Prompt copied. Paste it into the chat tab that just opened and send it.' : 'Prompt copied. Paste it into a new chat in this project and send it.')
	}

	const onGenerate = (platforms: PlatformKey[], feedback?: string) =>
		act('Sending', async () => {
			const requestId = uuid()
			const m = planRef.current.media
			const message = composeCopyMessage({
				requestId,
				projectId: PROJECT_ID,
				platforms,
				params: planRef.current.params,
				video: { mediaId: m.main || m.vertical, name: '', path: m.mainPath || m.verticalPath },
				feedback,
				existing: platforms.length === 1 ? (copy?.platforms[platforms[0]]?.options ?? []) : undefined,
			})
			const result = await sendToAgent(message)
			update(x => ({ ...x, pendingRequest: { requestId, platforms, at: Date.now() } }), true)
			return result
		})

	// options for the pending request landed in copy.json
	useEffect(() => {
		const pending = plan.pendingRequest
		if (!pending || !copy?.requestId || copy.requestId !== pending.requestId) return
		setNote(`New options arrived for ${pending.platforms.map(k => SPEC[k].label).join(', ')}. Click one to use it, then edit freely.`)
		update(x => ({ ...x, pendingRequest: undefined }), true)
	}, [copy?.requestId, plan.pendingRequest?.requestId])

	// ---------- covers (Thumbnails panel exports) ----------
	const [covers, setCovers] = useState<Cover[]>([])
	const coverUrls = useRef(new Map<string, string>())
	const loadCovers = useCallback(() => {
		api(`/thumbs/list?projectId=${encodeURIComponent(PROJECT_ID)}&n=40`)
			.then(async body => {
				const list: Cover[] = []
				for (const item of body.items ?? []) {
					const cacheKey = `${item.file}:${item.mtime}`
					if (!coverUrls.current.has(cacheKey))
						try {
							coverUrls.current.set(cacheKey, URL.createObjectURL(await apiBlob(`/thumbs/file?path=${encodeURIComponent(item.file)}`)))
						} catch {}
					if (item.width && item.height) list.push({ file: item.file, name: item.name, title: item.title, w: item.width, h: item.height, mtime: item.mtime, bytes: item.bytes, url: coverUrls.current.get(cacheKey) })
				}
				setCovers(list)
			})
			.catch(error => setNote(`Failed: ${fail(error)}`))
	}, [fail])
	useEffect(() => {
		if (bridge === 'ok') loadCovers()
	}, [bridge, loadCovers])

	// ---------- what each platform gets (shape, renders, cover) ----------
	// The bridge reads size, shape and length of the picked videos so each platform gets a file it shows right
	const [probes, setProbes] = useState<Record<string, ProbeState>>({})
	const probing = useRef(new Set<string>())
	const { main: mainSource, vertical: verticalSource } = mediaSources(plan)
	useEffect(() => {
		if (bridge !== 'ok') return
		for (const s of [mainSource, verticalSource]) {
			if (!s || probing.current.has(s.key) || isProbe(probes[s.key])) continue
			probing.current.add(s.key)
			api('/zernio/media/probe', { method: 'POST', body: { source: s.source } })
				.then(r => setProbes(x => ({ ...x, [s.key]: r })))
				.catch(error => setProbes(x => ({ ...x, [s.key]: { error: fail(error) } })))
				.finally(() => probing.current.delete(s.key))
		}
	}, [bridge, mainSource?.key, verticalSource?.key])
	const deliveries = Object.fromEntries(PLATFORM_KEYS.map(k => [k, deliveryFor(k, plan, covers, probes)])) as Record<PlatformKey, Delivery>
	const deliveriesRef = useRef(deliveries)
	deliveriesRef.current = deliveries

	// ---------- per-platform data from Zernio ----------
	const ytAccount = accountFor('youtube', plan.platforms.youtube, accounts)
	const ttAccount = accountFor('tiktok', plan.platforms.tiktok, accounts)
	const [playlists, setPlaylists] = useState<{ id: string; title: string; privacy?: string }[]>([])
	useEffect(() => {
		if (!ready || !ytAccount || !plan.platforms.youtube.on) return
		api(`/zernio/youtube/playlists?accountId=${encodeURIComponent(ytAccount.id)}`)
			.then(r => setPlaylists(r.playlists ?? []))
			.catch(error => setNote(`Failed: ${fail(error)}`))
	}, [ready, ytAccount?.id, plan.platforms.youtube.on])
	const [tiktokInfo, setTiktokInfo] = useState<any>(null)
	const [tiktokConsent, setTiktokConsent] = useState(false)
	useEffect(() => {
		if (!ready || !ttAccount || !plan.platforms.tiktok.on) return
		api(`/zernio/tiktok/creator-info?accountId=${encodeURIComponent(ttAccount.id)}&mediaType=video`)
			.then(setTiktokInfo)
			.catch(error => setNote(`Failed: ${fail(error)}`))
	}, [ready, ttAccount?.id, plan.platforms.tiktok.on])

	const [posts, setPosts] = useState<any[]>([])
	const [loadingPosts, setLoadingPosts] = useState(false)
	const loadPosts = useCallback(() => {
		setLoadingPosts(true)
		api(`/zernio/posts?limit=10${profileId ? `&profileId=${encodeURIComponent(profileId)}` : ''}`)
			.then(r => setPosts(r.posts ?? []))
			.catch(error => setNote(`Failed: ${fail(error)}`))
			.finally(() => setLoadingPosts(false))
	}, [fail, profileId])
	useEffect(() => {
		if (ready && tab === 'post') loadPosts()
	}, [ready, tab])

	const [usage, setUsage] = useState<any>(null)

	// ---------- building posts ----------
	const cached = (key: string) => {
		const u = planRef.current.uploads[key]
		return u && Date.now() - u.at < CACHE_MS && cacheable(key) ? u.url : ''
	}
	const resolvedFor = (k: PlatformKey, urls: Record<string, string>): Resolved => {
		const { video: v, cover: c } = deliveriesRef.current[k]
		return { video: v && urls[v.key] ? { url: urls[v.key], type: 'video' } : undefined, cover: c && urls[c.key] ? urls[c.key] : undefined }
	}
	const build = (keys: PlatformKey[], urls: Record<string, string>) => {
		const pl = planRef.current
		const entries = keys.map(k => {
			const p = pl.platforms[k]
			const account = accountFor(k, p, accounts)
			return { key: k, when: p.when, entry: platformEntry(k, p, account?.id ?? '', resolvedFor(k, urls), pl.params, pl.timezone, tiktokConsent) }
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

	// ---------- validate (dry run, nothing is posted) ----------
	const [validation, setValidation] = useState<Check[] | null>(null)
	const onValidate = () =>
		act('Checking', async () => {
			const keys = on.filter(k => accountFor(k, plan.platforms[k], accounts))
			const skipped = on.filter(k => !keys.includes(k))
			const urls: Record<string, string> = {}
			let placeholder = false
			for (const s of sourcesFor(keys)) {
				const url = cached(s.key)
				if (url) urls[s.key] = url
				else if (!s.key.startsWith('t:')) {
					urls[s.key] = PLACEHOLDER
					placeholder = true
				}
			}
			const out: Check[] = []
			for (const post of build(keys, urls)) {
				const r = await api('/zernio/validate', { method: 'POST', body: { payload: post.payload } })
				const media = (text: string, c?: string) => placeholder && (c === 'MEDIA_UNDECODABLE' || /placeholder|example\.com|fetch|download|decod|reach|url/i.test(text))
				const label = (p: string) => SPEC[p as PlatformKey]?.label ?? p ?? 'Post'
				for (const e of r.errors ?? []) if (!media(String(e.error), e.code)) out.push({ level: 'fail', text: `${label(e.platform)}: ${e.error}` })
				for (const w of r.warnings ?? []) if (!media(String(w.warning))) out.push({ level: 'warn', text: `${label(w.platform)}: ${w.warning}` })
			}
			if (placeholder) out.push({ level: 'info', text: 'Videos are not uploaded yet, so Zernio skipped the file checks. They run again when you post.' })
			if (skipped.length) out.push({ level: 'info', text: `Skipped ${skipped.map(k => SPEC[k].label).join(', ')}: not connected.` })
			setValidation(out)
			return out.some(c => c.level === 'fail') ? 'Zernio found problems. See below.' : 'Zernio check passed.'
		})

	// ---------- post ----------
	const [pending, setPending] = useState<Pending | null>(null)
	const [progress, setProgress] = useState<Progress[]>([])
	const onPost = () => {
		const urls: Record<string, string> = {}
		const sources = sourcesFor(on)
		for (const s of sources) urls[s.key] = cached(s.key) || PLACEHOLDER
		const preview = build(on, urls)
		setPending({ posts: preview, sources: sources.filter(s => !cached(s.key)), keys: Object.fromEntries(preview.map(p => [p.mode, uuid()])), done: [] })
	}

	// Renders run locally through the bridge (ffmpeg); finished renders are reused by file name
	const render = async (s: Source, set: (patch: Partial<Progress>) => void): Promise<string> => {
		let job = await api('/zernio/media/render', { method: 'POST', body: { projectId: PROJECT_ID, source: s.source, preset: s.render } })
		set({ state: 'rendering', bytes: 0, total: 1, label: `${s.label}: rendering` })
		for (;;) {
			if (job.state === 'done' && job.file) return job.file
			if (job.state === 'error') throw new Error(`${s.label} render failed: ${job.error ?? 'unknown error'}`)
			await sleep(1500)
			job = await api(`/zernio/media/render/status?id=${encodeURIComponent(job.id)}`)
			set({ state: 'rendering', bytes: job.progress ?? 0, total: 1 })
		}
	}

	const upload = async (s: Source, i: number): Promise<string> => {
		const set = (patch: Partial<Progress>) => setProgress(list => list.map((x, j) => (j === i ? { ...x, ...patch } : x)))
		const source = s.render ? { path: await render(s, set) } : s.source
		const start = await api('/zernio/media/upload', { method: 'POST', body: { source } })
		set({ state: 'uploading', total: start.total ?? 0, label: `${s.label}: ${start.name}${start.total ? ` (${fmtBytes(start.total)})` : ''}${start.source === 'cloud' ? ', from Kino cloud' : ''}` })
		for (;;) {
			await sleep(1000)
			const st = await api(`/zernio/media/upload/status?id=${encodeURIComponent(start.jobId)}`)
			set({ bytes: st.bytes ?? 0, total: st.total ?? 0, state: st.state })
			if (st.state === 'done' && st.publicUrl) return st.publicUrl
			if (st.state === 'error') throw new Error(`${s.label} upload failed: ${st.error ?? 'unknown error'}`)
		}
	}

	const runPost = () =>
		act('Posting', async () => {
			if (!pending) return
			const keys = PLATFORM_KEYS.filter(k => planRef.current.platforms[k].on)
			// 1. uploads (cached for a day, so a retry does not upload twice)
			const sources = sourcesFor(keys)
			const urls: Record<string, string> = {}
			const todo = sources.filter(s => {
				const url = cached(s.key)
				if (url) urls[s.key] = url
				return !url
			})
			setProgress(todo.map(s => ({ label: s.label, bytes: 0, total: 0, state: 'starting' })))
			for (let i = 0; i < todo.length; i++) {
				const url = await upload(todo[i], i)
				urls[todo[i].key] = url
				if (cacheable(todo[i].key)) update(x => ({ ...x, uploads: { ...x.uploads, [todo[i].key]: { url, at: Date.now() } } }), true)
			}
			// 2. one Zernio post per mode (now, scheduled, draft), each with its own idempotency key
			const results: HistoryEntry[] = []
			const errors: string[] = []
			const done = [...pending.done]
			for (const post of build(keys, urls)) {
				if (done.includes(post.mode)) continue
				try {
					const r = await api('/zernio/posts/create', { method: 'POST', body: { payload: post.payload, idempotencyKey: pending.keys[post.mode] ?? uuid(), confirm: true } })
					const pp: any[] = r.post?.platforms ?? []
					const failed = pp.filter(x => x.status === 'failed' || x.errorMessage)
					// Zernio stores a thumbnail sent with a YouTube upload but never applies it, so set it after
					const ytCover = deliveriesRef.current.youtube.cover
					const thumb: ThumbJob | undefined =
						post.mode !== 'draft' && post.keys.includes('youtube') && ytCover && urls[ytCover.key] && r.post?._id ? { state: 'pending', url: urls[ytCover.key], name: deliveriesRef.current.youtube.coverName } : undefined
					results.push({
						thumb,
						at: new Date().toISOString(),
						postId: r.post?._id,
						mode: post.mode,
						platforms: post.keys,
						status: String(r.post?.status ?? (r.http === 207 ? 'partial' : 'created')),
						http: r.http,
						urls: Object.fromEntries(pp.filter(x => x.platformPostUrl).map(x => [x.platform, x.platformPostUrl])),
						errors: [...failed.map(x => `${SPEC[x.platform as PlatformKey]?.label ?? x.platform}: ${x.errorMessage ?? 'failed'}`), ...(r.warnings ?? []).map((w: any) => (typeof w === 'string' ? w : (w.message ?? w.warning ?? JSON.stringify(w))))],
					})
					done.push(post.mode)
				} catch (error) {
					errors.push(`${modeLabel(post.mode)} (${post.keys.map(k => SPEC[k].label).join(', ')}): ${fail(error)}`)
				}
			}
			if (results.length) update(x => ({ ...x, history: [...results, ...x.history].slice(0, 30) }), true)
			if (ready) loadPosts()
			if (errors.length) {
				setPending(p => (p ? { ...p, done } : p))
				throw new Error(`${errors.join(' | ')}${results.length ? ' The other posts went through.' : ''} Fix it and press the button again: finished posts are not sent twice.`)
			}
			setPending(null)
			setTiktokConsent(false)
			setTab('post')
			const failedPlatforms = results.flatMap(r => r.errors ?? [])
			const summary = results.map(r => `${modeLabel(r.mode)}: ${r.platforms.map(k => SPEC[k].label).join(', ')} (${r.status})`).join('; ')
			return failedPlatforms.length ? `Done with problems. ${summary}. ${failedPlatforms.join(' ')}` : `Done. ${summary}.`
		})

	// ---------- YouTube thumbnail ----------
	// Runs while the panel is open; a pending job survives in plan.json and resumes on the next open
	const setThumb = (postId: string, thumb: ThumbJob) => update(x => ({ ...x, history: x.history.map(e => (e.postId === postId && e.thumb ? { ...e, thumb } : e)) }), true)
	const thumbTries = useRef<Record<string, { next: number; tries: number }>>({})
	const thumbBusy = useRef(false)
	useEffect(() => {
		if (!ready) return
		const tick = async () => {
			if (thumbBusy.current) return
			const entry = planRef.current.history.find(e => e.thumb?.state === 'pending' && e.postId && Date.now() >= (thumbTries.current[e.postId]?.next ?? 0))
			if (!entry?.thumb || !entry.postId) return
			const id = entry.postId
			const job = entry.thumb
			const t = (thumbTries.current[id] ??= { next: 0, tries: 0 })
			const stop = (note: string) => setThumb(id, { ...job, state: 'error', note: `${note} Use Set thumbnail under Recent posts to try again.` })
			thumbBusy.current = true
			try {
				if (Date.now() - Date.parse(entry.at) > 6 * 3600_000) return stop('YouTube still had no video after 6 hours.')
				const data = await api(`/zernio/post?id=${encodeURIComponent(id)}`)
				const yt = (data.post?.platforms ?? data.platforms ?? []).find((p: any) => p.platform === 'youtube')
				if (!yt) return stop('This post has no YouTube entry.')
				if (yt.status === 'failed') return stop('The YouTube upload failed.')
				if (!yt.platformPostId) {
					t.next = Date.now() + 20_000 // YouTube does not have the video yet
					return
				}
				const accountId = typeof yt.accountId === 'string' ? yt.accountId : yt.accountId?._id
				await api('/zernio/youtube/thumbnail', { method: 'POST', body: { postId: id, thumbnailUrl: job.url, accountId, confirm: true } })
				setThumb(id, { ...job, state: 'done', note: undefined })
				setNote(`YouTube thumbnail set: "${job.name ?? 'cover'}". YouTube can take a few minutes to show it.`)
			} catch (error) {
				const status = error instanceof BridgeError ? error.status : 0
				t.tries++
				if (status === 412 || status === 424 || t.tries >= 4) stop(`${fail(error)}.`)
				else t.next = Date.now() + (status === 429 ? 60_000 : 30_000 * 2 ** (t.tries - 1))
			} finally {
				thumbBusy.current = false
			}
		}
		const timer = setInterval(tick, 5000)
		tick()
		return () => clearInterval(timer)
	}, [ready])

	const onSetThumb = (postId: string, accountId?: string) => {
		const d = deliveriesRef.current.youtube
		const cover = d.cover
		if (!cover) return setNote('Failed: no YouTube cover. Pick one in the Schedule tab.')
		setAsk({
			text: `Set "${d.coverName}" as the thumbnail of this YouTube video? The cover uploads to Zernio storage first.`,
			yes: 'Set thumbnail',
			run: () =>
				act('Setting thumbnail', async () => {
					let url = cached(cover.key)
					if (!url) {
						setProgress([{ label: cover.label, bytes: 0, total: 0, state: 'starting' }])
						url = await upload(cover, 0)
						update(x => ({ ...x, uploads: { ...x.uploads, [cover.key]: { url, at: Date.now() } } }), true)
					}
					await api('/zernio/youtube/thumbnail', { method: 'POST', body: { postId, thumbnailUrl: url, accountId, confirm: true } })
					setThumb(postId, { state: 'done', url, name: d.coverName })
					return `YouTube thumbnail set: "${d.coverName}". YouTube can take a few minutes to show it.`
				}),
		})
	}

	const onRetry = (id: string) =>
		setAsk({
			text: 'Retry the failed platforms of this post now?',
			yes: 'Retry',
			run: () =>
				act('Retrying', async () => {
					const r = await api('/zernio/posts/retry', { method: 'POST', body: { id } })
					loadPosts()
					return `Retry sent. Status: ${r.post?.status ?? r.status ?? 'unknown'}.`
				}),
		})
	const onDelete = (id: string) =>
		setAsk({
			text: 'Delete this post from Zernio? Scheduled publishing for it is cancelled.',
			yes: 'Delete',
			run: () =>
				act('Deleting', async () => {
					await api('/zernio/posts/delete', { method: 'POST', body: { id } })
					loadPosts()
					return 'Deleted from Zernio.'
				}),
		})

	// ---------- settings ----------
	const onSaveKey = async (key: string) => {
		setBusy('Saving key')
		setNote('')
		try {
			await api('/zernio/key', { method: 'POST', body: { key } })
			setNote(`Key saved on ${MACHINE} and accepted by Zernio.`)
			await z.check()
			return true
		} catch (error) {
			if (error instanceof BridgeError && error.status === 424) setNote('Failed: Zernio rejected that key. The saved key is unchanged.')
			else setNote(`Failed: ${fail(error)}`)
			return false
		} finally {
			setBusy('')
		}
	}
	const onRemoveKey = () =>
		setAsk({
			text: `Remove the Zernio key from ${MACHINE}? Posting stops working until you add one again.`,
			yes: 'Remove',
			run: () =>
				act('Removing', async () => {
					await api('/zernio/key/remove', { method: 'POST' })
					await z.check()
					return 'Key removed.'
				}),
		})
	const onConnect = (k: PlatformKey) =>
		act('Connecting', async () => {
			if (!profileId) throw new Error('No Zernio profile yet. Refresh, or create one in the Zernio dashboard.')
			await api('/zernio/connect', { method: 'POST', body: { platform: k, profileId } })
			return `Opened the ${SPEC[k].label} sign-in in your browser. Approve it there, then press Refresh in Settings.`
		})
	const onUsage = () =>
		act('Loading', async () => {
			setUsage(await api('/zernio/usage'))
		})

	// ---------- layout ----------
	const statusLine =
		bridge === 'ok'
			? keyState === 'none'
				? h('span', null, 'Add your Zernio API key in Settings to post. Copy and planning work now.')
				: keyState === 'invalid'
					? h('span', null, 'Zernio rejected the saved key. Replace it in Settings.')
					: null
			: bridge === 'outdated'
				? h('span', null, 'Posting needs the updated bridge (v7 or newer). In its window press Ctrl+C, then run ', code(START_BRIDGE), ' again.')
				: bridge === 'offline'
					? h('span', null, `Bridge not running. ${START_BRIDGE_HINT}`)
					: bridge === 'unpaired' || bridge === 'pairing'
						? h('span', { style: { display: 'flex', gap: 8, alignItems: 'center' } }, 'Connect the bridge to post.', h(Btn, { label: bridge === 'pairing' ? `Waiting for ${ALLOW}...` : 'Connect', onClick: z.pair, disabled: bridge === 'pairing' }))
						: h('span', null, 'Checking the bridge...')
	const zColor = ready ? GREEN : bridge === 'checking' || keyState === 'unknown' ? DIM : RED
	const message = note || z.note

	return h(
		'div',
		{ style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: BG, color: TEXT, fontFamily: UI_FONT, fontSize: 12, overflow: 'hidden' } },
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${LINE}`, flex: 'none' } },
			h('div', { style: { fontWeight: 600, fontSize: 13 } }, 'Publish'),
			h(Segmented, { value: tab, options: [{ value: 'copy', label: 'Copy' }, { value: 'schedule', label: 'Schedule' }, { value: 'post', label: 'Post' }, { value: 'settings', label: 'Settings' }], onChange: v => setTab(v as Tab) }),
			h('div', { style: { flex: 1 } }),
			h('span', { title: ready ? `Zernio connected: ${accounts.length} account${accounts.length === 1 ? '' : 's'}` : 'Zernio not ready', style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: DIM } }, h('span', { style: { width: 7, height: 7, borderRadius: '50%', background: zColor } }), 'Zernio'),
		),
		statusLine ? h('div', { style: { padding: '6px 12px', fontSize: 11, color: DIM, borderBottom: `1px solid ${LINE}`, flex: 'none' } }, statusLine) : null,
		message || busy
			? h('div', { style: { padding: '6px 12px', fontSize: 11, color: message.startsWith('Failed') ? RED : busy ? EMBER : DIM, borderBottom: `1px solid ${LINE}`, flex: 'none', display: 'flex', gap: 8, alignItems: 'center' } }, h('span', { style: { flex: 1 } }, busy ? `${busy}...` : message), !busy && message ? h(Btn, { label: 'Dismiss', onClick: () => (setNote(''), z.setNote('')) }) : null)
			: null,
		h(
			'div',
			{ className: 'kino-thumbs-scroll', style: { flex: 1, minHeight: 0, overflow: 'auto', padding: 12 } },
			tab === 'copy'
				? h(CopyTab, { plan, setPlat, setParams, copy, rules, accounts, canPrompt: z.canPrompt, busy: !!busy, onGenerate, onOpenChat: openChat, onDismissPending: () => update(x => ({ ...x, pendingRequest: undefined }), true) })
				: tab === 'schedule'
					? h(ScheduleTab, { plan, setPlat, setPlan: update, accounts, covers, probes, deliveries, playlists, tiktokInfo, tiktokConsent, setTiktokConsent, rules, onRefreshCovers: loadCovers, onConnect })
					: tab === 'post'
						? h(PostTab, { plan, accounts, rules, tiktokConsent, busy: !!busy || !ready, progress, deliveries, validation, posts, loadingPosts, onValidate, onPost, onRefreshPosts: loadPosts, onRetry, onDelete, onSetThumb })
						: h(SettingsTab, { keyState, keyNote: z.keyNote, profiles, accounts, plan, setPlan: update, busy: !!busy || bridge !== 'ok', usage, onSaveKey, onRemoveKey, onConnect, onRefresh: z.loadAccounts, onUsage }),
			tab === 'post' && plan.history.length
				? h(
						'div',
						{ style: { marginTop: 14, display: 'flex', flexDirection: 'column', gap: 4 } },
						h('span', { style: { fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: DIM, fontWeight: 600 } }, 'Sent from this panel'),
						...plan.history.slice(0, 8).map((e, i) =>
							h(
								'div',
								{ key: i, style: { fontSize: 11, color: DIM, display: 'flex', gap: 8, flexWrap: 'wrap' } },
								h('span', { style: { fontFamily: MONO } }, e.at.slice(0, 16).replace('T', ' ')),
								h('span', { style: { color: TEXT } }, `${modeLabel(e.mode)}: ${e.platforms.map(k => SPEC[k]?.label ?? k).join(', ')}`),
								h('span', null, e.status),
								...Object.entries(e.urls ?? {}).map(([k, url]) => h('a', { key: k, href: url, target: '_blank', rel: 'noreferrer', className: 'kino-thumbs-link' }, SPEC[k as PlatformKey]?.label ?? k)),
								e.errors?.length ? h('span', { style: { color: RED } }, e.errors.join(' ')) : null,
								e.thumb
									? h(
											'span',
											{ style: { color: e.thumb.state === 'error' ? RED : e.thumb.state === 'done' ? GREEN : DIM } },
											e.thumb.state === 'pending' ? 'YouTube thumbnail: waiting for YouTube to have the video' : e.thumb.state === 'done' ? 'YouTube thumbnail set' : `YouTube thumbnail not set: ${e.thumb.note ?? 'unknown error'}`,
										)
									: null,
							),
						),
					)
				: null,
		),
		pending ? h(ConfirmDialog, { posts: pending.posts.filter(p => !pending.done.includes(p.mode)), plan, accounts, sources: pending.sources, deliveries, busy: !!busy, onConfirm: runPost, onClose: () => !busy && setPending(null) }) : null,
		ask
			? h(
					'div',
					{ onClick: () => setAsk(null), style: { position: 'fixed', inset: 0, zIndex: 70, background: 'var(--kp-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
					h(
						'div',
						{ onClick: (e: any) => e.stopPropagation(), style: { width: 'min(380px, 92vw)', background: BG, border: `1px solid ${LINE}`, borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 20px 60px var(--kp-shadow-lg)' } },
						h('div', { style: { fontSize: 12, lineHeight: 1.5 } }, ask.text),
						h(
							'div',
							{ style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
							h(Btn, { label: 'Cancel', onClick: () => setAsk(null) }),
							h(Btn, {
								label: ask.yes,
								primary: true,
								onClick: () => {
									const run = ask.run
									setAsk(null)
									run()
								},
							}),
						),
					),
				)
			: null,
	)
}

const modeLabel = (mode: When) => (mode === 'now' ? 'Published' : mode === 'schedule' ? 'Scheduled' : 'Draft')
