// Thumbnails panel hooks: library images as blob URLs, the designs file in project source, and the bridge.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAssetFromAssetId, useDisplayedRootFilesState, useProjectSource } from 'kino/panel'
import { normDoc, type Doc } from '../../thumbs/model'
import { BRIDGE, BridgeError, DESIGNS_PATH, RULES_PATH, TOKEN_KEY, api, parseRules } from './lib'

// kino: URLs do not resolve in panels, and remote URLs would taint the export canvas: fetch once into a blob URL
export const useBlob = (id: string) => {
	const asset = useAssetFromAssetId(id) as any
	const src = asset?.remoteUrl
	const [url, setUrl] = useState<string | undefined>()
	useEffect(() => {
		if (!src || url) return
		if (typeof src !== 'string') {
			setUrl(URL.createObjectURL(src))
			return
		}
		let live = true
		fetch(src, { mode: 'cors' })
			.then(response => response.blob())
			.then(blob => live && setUrl(URL.createObjectURL(blob)))
			.catch(() => live && setUrl(src))
		return () => {
			live = false
		}
	}, [src])
	return url
}

// Renders nothing: one per library image used by a design, so useBlob can run once per id
export const BlobLoader = ({ id, onUrl }: { id: string; onUrl: (id: string, url: string) => void }) => {
	const url = useBlob(id)
	useEffect(() => {
		if (url) onUrl(id, url)
	}, [url, id])
	return null
}

const useFiles = () => ((useDisplayedRootFilesState() as any)?.files ?? {}) as Record<string, string>

// The taste skill's machine-readable rules; null until the skill exists
export const useRules = () => {
	const text = useFiles()[RULES_PATH]
	return useMemo(() => parseRules(text), [text])
}
export const useProjectFile = (path: string): string | undefined => useFiles()[path]

// Designs live in /thumbs/designs.json so they travel with the project and every edit is undoable
export const useDesignsDoc = (onError: (message: string) => void) => {
	const fileText = useFiles()[DESIGNS_PATH]
	const source = useProjectSource() as any
	const [doc, setDoc] = useState<Doc>(() => normDoc(fileText))
	const docRef = useRef(doc)
	const committed = useRef<string | undefined>(fileText)
	const timer = useRef<any>(null)

	useEffect(() => {
		if (fileText === undefined || fileText === committed.current) return
		committed.current = fileText
		const next = normDoc(fileText)
		docRef.current = next
		setDoc(next)
	}, [fileText])

	const commit = useCallback(
		() => {
			clearTimeout(timer.current)
			timer.current = setTimeout(() => {
				try {
					const before = source.readSource()
					// The agent may have appended designs since our last write: keep them
					let latest = docRef.current
					const disk = before.files?.[DESIGNS_PATH]
					if (typeof disk === 'string' && disk !== committed.current) {
						const ids = new Set(latest.designs.map(d => d.id))
						const extra = normDoc(disk).designs.filter(d => !ids.has(d.id))
						if (extra.length) {
							latest = { ...latest, designs: [...latest.designs, ...extra] }
							docRef.current = latest
							setDoc(latest)
						}
					}
					const text = JSON.stringify(latest, null, 2) + '\n'
					if (text === committed.current) return
					const after = { ...before, files: { ...before.files, [DESIGNS_PATH]: text } }
					committed.current = text
					if (source.commitSource({ before, after, historyLabel: 'Edit thumbnails' }) === false) onError('Kino did not accept the thumbnail edit.')
				} catch (error) {
					onError(`Could not save designs: ${error instanceof Error ? error.message : String(error)}`)
				}
			}, 600)
		},
		[source, onError],
	)

	const update = useCallback(
		(fn: (doc: Doc) => Doc) => {
			const next = fn(docRef.current)
			docRef.current = next
			setDoc(next)
			commit()
		},
		[commit],
	)
	return { doc, update }
}

export type BridgeState = 'checking' | 'ok' | 'offline' | 'outdated' | 'unpaired' | 'pairing'

export const useBridge = (projectId: string) => {
	const [bridge, setBridge] = useState<BridgeState>('checking')
	const [note, setNote] = useState('')
	const [features, setFeatures] = useState<string[]>([])

	const check = useCallback(async () => {
		try {
			const health = await fetch(`${BRIDGE}/health`).then(response => response.json())
			setFeatures(Array.isArray(health.features) ? health.features : [])
			if (!Array.isArray(health.features) || !health.features.includes('thumbs')) {
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
			await api(`/thumbs/list?projectId=${encodeURIComponent(projectId)}&n=1`)
			setBridge('ok')
			setNote('')
		} catch (error) {
			if (error instanceof BridgeError && error.status === 401) setBridge('unpaired')
			else if (error instanceof BridgeError && error.status === 0) setBridge('offline')
			else setNote(error instanceof Error ? error.message : String(error))
		}
	}, [projectId])

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

	// Map transport errors onto the bridge state; return a message for anything else
	const fail = useCallback((error: unknown) => {
		if (error instanceof BridgeError && (error.status === 0 || error.status === 401)) {
			setBridge(error.status === 401 ? 'unpaired' : 'offline')
			return error.message
		}
		return error instanceof Error ? error.message : String(error)
	}, [])

	return { bridge, note, pair, fail, check, canPrompt: bridge === 'ok' && features.includes('thumbs-prompt') }
}
