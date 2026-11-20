// Publish panel hooks: project files (copy.json read-only, plan.json owned by the panel), values kept on
// this device, and the bridge + Zernio state on top of the shared bridge client.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDisplayedRootFilesState, useProjectSource } from 'kino/panel'
import { BridgeError, api, apiBlob, getToken, useBridge } from '../bridge'
import { COPY_PATH, PLAN_BACKUP_PATH, PLAN_PATH, RULES_PATH, freshUploads, parseCopy, parsePlan, parseRules, rememberOf, type Account, type Plan, type Profile, type Remembered } from './lib'
import type { Cover } from './media'

const useFiles = () => ((useDisplayedRootFilesState() as any)?.files ?? {}) as Record<string, string>

const readLocal = <T,>(key: string, fallback: T): T => {
	try {
		const value = JSON.parse(localStorage.getItem(key) ?? 'null')
		return value && typeof value === 'object' ? value : fallback
	} catch {
		return fallback
	}
}
const writeLocal = (key: string, value: unknown) => {
	try {
		localStorage.setItem(key, JSON.stringify(value))
	} catch {}
}

export const useCopyDoc = () => {
	const text = useFiles()[COPY_PATH]
	return useMemo(() => parseCopy(text), [text])
}
export const useRules = () => {
	const text = useFiles()[RULES_PATH]
	return useMemo(() => parseRules(text), [text])
}

// ---------- plan.json ----------
const REMEMBER_KEY = 'kino-publish:last'
// Local paths and day-old upload links have no place in a file that syncs to the whole team
const forDisk = (plan: Plan): Plan => ({ ...plan, media: { ...plan.media, mainPath: '', verticalPath: '' }, uploads: freshUploads(plan.uploads) })

/**
 * plan.json lives in the project so choices travel with it and every edit is undoable in Kino.
 * Edits are saved after a short pause; `update(fn, true)` saves at once (before anything is sent).
 * `unreadable` is true while the file on disk is not JSON: the panel then works on a fresh plan and
 * keeps the old text in plan.unreadable.json when it first saves.
 */
export const usePlan = (onError: (message: string) => void) => {
	const fileText = useFiles()[PLAN_PATH]
	const source = useProjectSource() as any
	const first = useMemo(() => parsePlan(fileText, readLocal<Remembered>(REMEMBER_KEY, {})), [])
	const [plan, setPlan] = useState<Plan>(first.plan)
	const [unreadable, setUnreadable] = useState(first.broken)
	const planRef = useRef(plan)
	const committed = useRef<string | undefined>(fileText)
	const brokenText = useRef<string | undefined>(first.broken ? fileText : undefined)
	const dirty = useRef(false)
	const timer = useRef<any>(null)

	const adopt = useCallback((text: string) => {
		committed.current = text
		const next = parsePlan(text, readLocal<Remembered>(REMEMBER_KEY, {}))
		brokenText.current = next.broken ? text : undefined
		setUnreadable(next.broken)
		planRef.current = next.plan
		setPlan(next.plan)
	}, [])

	useEffect(() => {
		if (fileText === undefined || fileText === committed.current) return
		// Words being typed right now win over a change that arrives from elsewhere
		if (dirty.current) return
		adopt(fileText)
	}, [fileText, adopt])

	const flush = useCallback(() => {
		clearTimeout(timer.current)
		timer.current = null
		if (!dirty.current) return
		try {
			const before = source.readSource()
			const disk = before.files?.[PLAN_PATH]
			// The file showed up before this panel had read it: take it rather than write over it
			if (typeof disk === 'string' && committed.current === undefined) {
				dirty.current = false
				return adopt(disk)
			}
			const text = JSON.stringify(forDisk(planRef.current), null, 2) + '\n'
			dirty.current = false
			writeLocal(REMEMBER_KEY, rememberOf(planRef.current))
			if (text === disk) {
				committed.current = text
				return
			}
			const files = { ...before.files, [PLAN_PATH]: text }
			if (brokenText.current !== undefined) files[PLAN_BACKUP_PATH] = brokenText.current
			const saved = source.commitSource({ before, after: { ...before, files }, historyLabel: 'Edit post plan' })
			committed.current = text
			brokenText.current = undefined
			setUnreadable(false)
			// false means Kino took no change although the text differs: a read-only project or a detached panel
			if (saved === false) onError('Kino did not save the post plan. The project may be read-only.')
		} catch (error) {
			dirty.current = true
			onError(`Could not save the post plan: ${error instanceof Error ? error.message : String(error)}`)
		}
	}, [source, onError, adopt])
	const flushRef = useRef(flush)
	flushRef.current = flush

	const update = useCallback((fn: (plan: Plan) => Plan, now = false) => {
		const next = fn(planRef.current)
		if (next !== planRef.current) {
			planRef.current = next
			dirty.current = true
			setPlan(next)
		}
		clearTimeout(timer.current)
		if (now) flushRef.current()
		else if (dirty.current) timer.current = setTimeout(() => flushRef.current(), 600)
	}, [])
	// Closing the panel must not drop the last half second of typing
	useEffect(() => () => flushRef.current(), [])
	return { plan, update, planRef, unreadable }
}

// ---------- values kept on this device ----------
export type Paths = { main: string; vertical: string }
/**
 * Videos picked by file path. A path only means something on this computer, so it stays in this
 * browser's storage, per project, and never enters plan.json. Plans written by older panels carried
 * the path in the file: it is taken over once.
 */
export const usePaths = (projectId: string, legacy: { mainPath: string; verticalPath: string }) => {
	const key = `kino-publish:paths:${projectId || 'none'}`
	const [paths, setState] = useState<Paths>(() => {
		const saved = readLocal<Partial<Paths>>(key, {})
		return { main: typeof saved.main === 'string' ? saved.main : '', vertical: typeof saved.vertical === 'string' ? saved.vertical : '' }
	})
	const setPaths = useCallback(
		(patch: Partial<Paths>) =>
			setState(current => {
				const next = { ...current, ...patch }
				writeLocal(key, next)
				return next
			}),
		[key],
	)
	useEffect(() => {
		if (legacy.mainPath && !paths.main) setPaths({ main: legacy.mainPath })
		if (legacy.verticalPath && !paths.vertical) setPaths({ vertical: legacy.verticalPath })
	}, [legacy.mainPath, legacy.verticalPath])
	return { paths, setPaths }
}

// ---------- bridge + Zernio ----------
/** unknown: not checked yet. unreachable: there is a key, but Zernio did not answer. */
export type KeyState = 'unknown' | 'none' | 'invalid' | 'unreachable' | 'ok'

/**
 * The bridge connection plus the Zernio key and accounts behind it. Only posting needs `canPost`;
 * probes, renders and covers need the bridge alone, and writing copy needs neither.
 */
export const useZernio = () => {
	const [keyState, setKeyState] = useState<KeyState>('unknown')
	const [keyNote, setKeyNote] = useState('')
	const [profiles, setProfiles] = useState<Profile[]>([])
	const [accounts, setAccounts] = useState<Account[]>([])
	const [loadingAccounts, setLoadingAccounts] = useState(false)
	const live = useRef(true)
	useEffect(
		() => () => {
			live.current = false
		},
		[],
	)

	const loadAccounts = useCallback(async () => {
		setLoadingAccounts(true)
		try {
			const [p, a] = await Promise.all([api('/zernio/profiles'), api('/zernio/accounts')])
			if (!live.current) return
			setProfiles(Array.isArray(p.profiles) ? p.profiles : [])
			setAccounts(Array.isArray(a.accounts) ? a.accounts : [])
		} finally {
			if (live.current) setLoadingAccounts(false)
		}
	}, [])

	// Runs after every successful bridge check, also when the window comes back to the front:
	// that is how a new account shows up after the sign-in in the browser.
	const probe = useCallback(async () => {
		const status = await api('/zernio/status?verify=1')
		if (!live.current) return
		if (!status.configured) {
			setKeyState('none')
			setKeyNote('')
			setAccounts([])
			setProfiles([])
		} else if (status.verified) {
			setKeyState('ok')
			setKeyNote('')
			await loadAccounts()
		} else {
			// Older bridges send no reason: tell "no answer" from "rejected" by the wording
			const unreachable = status.reason ? status.reason === 'unreachable' : /reach|timed out/i.test(String(status.error ?? ''))
			setKeyState(unreachable ? 'unreachable' : 'invalid')
			setKeyNote(String(status.error ?? ''))
		}
	}, [loadAccounts])

	const b = useBridge({ needs: ['zernio', 'publish-media'], probe })
	const bridgeFail = b.fail
	/** Route a caught error: key and connection problems move the state, the text comes back for the note line. */
	const fail = useCallback(
		(error: unknown) => {
			if (error instanceof BridgeError && error.status === 412) setKeyState('none')
			if (error instanceof BridgeError && error.status === 424) setKeyState('invalid')
			return bridgeFail(error)
		},
		[bridgeFail],
	)
	// The prompt route only needs a paired bridge that knows it, even one too old for posting
	const canPrompt = (b.bridge === 'ok' || b.bridge === 'outdated') && b.has('thumbs-prompt') && !!getToken()
	return { ...b, fail, keyState, keyNote, profiles, accounts, loadAccounts, loadingAccounts, canPrompt, canPost: b.ready && keyState === 'ok' }
}

// ---------- covers (Thumbnails panel exports) ----------
/** Covers exported by the Thumbnails panel for this project, newest first, with a preview URL each. */
export const useCovers = (enabled: boolean, projectId: string, onError: (error: unknown) => void) => {
	const [covers, setCovers] = useState<Cover[]>([])
	const [loading, setLoading] = useState(false)
	const urls = useRef(new Map<string, string>())
	const live = useRef(true)
	const reload = useCallback(async () => {
		setLoading(true)
		try {
			const body = await api(`/thumbs/list?projectId=${encodeURIComponent(projectId)}&n=60`)
			const items: any[] = (Array.isArray(body.items) ? body.items : []).filter((item: any) => item?.file && item.width && item.height)
			const idOf = (item: any) => `${item.file}:${item.mtime}`
			const todo = items.filter(item => !urls.current.has(idOf(item)))
			// a few at a time: the previews are full-size images
			const worker = async () => {
				for (let item = todo.shift(); item; item = todo.shift()) {
					try {
						const url = URL.createObjectURL(await apiBlob(`/thumbs/file?path=${encodeURIComponent(item.file)}`))
						if (live.current) urls.current.set(idOf(item), url)
						else URL.revokeObjectURL(url)
					} catch {}
				}
			}
			await Promise.all([worker(), worker(), worker(), worker()])
			if (!live.current) return
			const keep = new Set(items.map(idOf))
			for (const [id, url] of urls.current) {
				if (keep.has(id)) continue
				URL.revokeObjectURL(url)
				urls.current.delete(id)
			}
			setCovers(items.map(item => ({ file: item.file, name: String(item.name ?? ''), title: item.title || undefined, w: item.width, h: item.height, mtime: Number(item.mtime) || 0, bytes: item.bytes, url: urls.current.get(idOf(item)) })))
		} catch (error) {
			if (live.current) onError(error)
		} finally {
			if (live.current) setLoading(false)
		}
	}, [projectId, onError])
	useEffect(() => {
		if (enabled) reload()
	}, [enabled, reload])
	useEffect(
		() => () => {
			live.current = false
			for (const url of urls.current.values()) URL.revokeObjectURL(url)
		},
		[],
	)
	return { covers, reload, loading }
}
