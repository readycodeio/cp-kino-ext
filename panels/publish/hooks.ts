// Publish panel hooks: project files (copy.json read-only, plan.json owned by the panel) and the bridge + Zernio state.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDisplayedRootFilesState, useProjectSource } from 'kino/panel'
import { BRIDGE, BridgeError, COPY_PATH, PLAN_PATH, RULES_PATH, TOKEN_KEY, api, normPlan, parseCopy, parseRules, type Account, type Plan } from './lib'

const useFiles = () => ((useDisplayedRootFilesState() as any)?.files ?? {}) as Record<string, string>

export const useCopyDoc = () => {
	const text = useFiles()[COPY_PATH]
	return useMemo(() => parseCopy(text), [text])
}
export const useRules = () => {
	const text = useFiles()[RULES_PATH]
	return useMemo(() => parseRules(text), [text])
}

// plan.json lives in the project so choices travel with it and every edit is undoable
export const usePlan = (onError: (message: string) => void) => {
	const fileText = useFiles()[PLAN_PATH]
	const source = useProjectSource() as any
	const [plan, setPlan] = useState<Plan>(() => normPlan(fileText))
	const planRef = useRef(plan)
	const committed = useRef<string | undefined>(fileText)
	const timer = useRef<any>(null)

	useEffect(() => {
		if (fileText === undefined || fileText === committed.current) return
		committed.current = fileText
		const next = normPlan(fileText)
		planRef.current = next
		setPlan(next)
	}, [fileText])

	const flush = useCallback(() => {
		clearTimeout(timer.current)
		try {
			const before = source.readSource()
			const text = JSON.stringify(planRef.current, null, 2) + '\n'
			if (text === committed.current) return
			committed.current = text
			const after = { ...before, files: { ...before.files, [PLAN_PATH]: text } }
			if (source.commitSource({ before, after, historyLabel: 'Edit post plan' }) === false) onError('Kino did not accept the post plan edit.')
		} catch (error) {
			onError(`Could not save the post plan: ${error instanceof Error ? error.message : String(error)}`)
		}
	}, [source, onError])

	const update = useCallback(
		(fn: (plan: Plan) => Plan, now = false) => {
			const next = fn(planRef.current)
			planRef.current = next
			setPlan(next)
			clearTimeout(timer.current)
			if (now) flush()
			else timer.current = setTimeout(flush, 600)
		},
		[flush],
	)
	useEffect(() => () => clearTimeout(timer.current), [])
	return { plan, update, planRef }
}

export type BridgeState = 'checking' | 'ok' | 'offline' | 'outdated' | 'unpaired' | 'pairing'
export type KeyState = 'unknown' | 'none' | 'invalid' | 'ok'

export const useZernio = () => {
	const [bridge, setBridge] = useState<BridgeState>('checking')
	const [keyState, setKeyState] = useState<KeyState>('unknown')
	const [keyNote, setKeyNote] = useState('')
	const [note, setNote] = useState('')
	const [features, setFeatures] = useState<string[]>([])
	const [profiles, setProfiles] = useState<{ id: string; name: string; timezone: string | null; isDefault: boolean }[]>([])
	const [accounts, setAccounts] = useState<Account[]>([])
	const [loadingAccounts, setLoadingAccounts] = useState(false)

	// Map transport and key errors onto state; return a message for the note line
	const fail = useCallback((error: unknown) => {
		if (error instanceof BridgeError) {
			if (error.status === 0) setBridge('offline')
			else if (error.status === 401) setBridge('unpaired')
			else if (error.status === 412) setKeyState('none')
			else if (error.status === 424) setKeyState('invalid')
			return error.message
		}
		return error instanceof Error ? error.message : String(error)
	}, [])

	const loadAccounts = useCallback(async () => {
		setLoadingAccounts(true)
		try {
			const [p, a] = await Promise.all([api('/zernio/profiles'), api('/zernio/accounts')])
			setProfiles(p.profiles ?? [])
			setAccounts(a.accounts ?? [])
		} catch (error) {
			setNote(fail(error))
		} finally {
			setLoadingAccounts(false)
		}
	}, [fail])

	const check = useCallback(async () => {
		try {
			const health = await fetch(`${BRIDGE}/health`).then(response => response.json())
			const list = Array.isArray(health.features) ? health.features : []
			setFeatures(list)
			// v7 adds renders, probes and the YouTube thumbnail route; posting without them sends the wrong shapes
			if (!list.includes('publish-media')) {
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
			const status = await api('/zernio/status?verify=1')
			setBridge('ok')
			setNote('')
			if (!status.configured) setKeyState('none')
			else if (status.verified) {
				setKeyState('ok')
				setKeyNote('')
				loadAccounts()
			} else {
				setKeyState('invalid')
				setKeyNote(String(status.error ?? ''))
			}
		} catch (error) {
			setNote(fail(error))
		}
	}, [fail, loadAccounts])

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
		setNote('')
		fetch(`${BRIDGE}/pair`, { method: 'POST' })
			.then(async response => {
				const body = await response.json().catch(() => ({}))
				if (response.ok && typeof body.token === 'string') {
					localStorage.setItem(TOKEN_KEY, body.token)
					check()
				} else {
					setBridge('unpaired')
					setNote(typeof body.error === 'string' ? body.error : `Pairing failed (${response.status}).`)
				}
			})
			.catch(() => setBridge('offline'))
	}

	return { bridge, keyState, keyNote, note, setNote, pair, fail, check, profiles, accounts, loadAccounts, loadingAccounts, canPrompt: bridge === 'ok' && features.includes('thumbs-prompt'), ready: bridge === 'ok' && keyState === 'ok' }
}
