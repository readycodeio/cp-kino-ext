// Thumbnails panel hooks: library images as blob URLs, and the designs and brand files in project source.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAssetFromAssetId, useDisplayedRootFilesState, useProjectSource } from 'kino/panel'
import { EMPTY_DOC, parseDoc, serializeDoc, type Design, type Doc, type El } from '../../thumbs/model'
import { DEFAULT_BRAND, normBrand, type Brand } from '../../thumbs/ui/brand'
import { onFontsChange } from '../../thumbs/ui/fonts'
import { BRAND_PATH, DESIGNS_PATH, RULES_PATH, parseRules } from './lib'

// ---------- library images ----------
// url: a blob URL the art can draw and an export can read. remote: the file could not be fetched into a
// blob, so the preview shows it from its own URL and an export may leave it out. missing: not in this library.
export type Media = { url?: string; remote?: boolean; missing?: boolean }
const MISSING_AFTER_MS = 9000

// Renders nothing: one per library image in use. kino: URLs do not resolve in panels and remote URLs
// cannot be read back from a canvas, so each file is fetched once into a blob URL.
export const MediaLoader = ({ id, onMedia }: { id: string; onMedia: (id: string, media: Media | null) => void }) => {
	const asset = useAssetFromAssetId(id) as any
	const src = (asset?.remoteUrl ?? asset?.timelineItemUrl) as string | File | null | undefined
	const srcRef = useRef(src)
	srcRef.current = src
	// a File may be a new object on every render: follow what it is, not which object it is
	const srcKey = !src ? '' : typeof src === 'string' ? src : `file:${src.name}:${src.size}:${src.lastModified}`
	useEffect(() => {
		const current = srcRef.current
		if (!current) {
			// Kino gives no "not found": an id that never resolves counts as missing, so it cannot hold up exports
			const timer = setTimeout(() => onMedia(id, { missing: true }), MISSING_AFTER_MS)
			return () => clearTimeout(timer)
		}
		let live = true
		let made = ''
		if (typeof current !== 'string') {
			made = URL.createObjectURL(current)
			onMedia(id, { url: made })
		} else
			fetch(current, { mode: 'cors' })
				.then(response => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
				.then(blob => {
					if (!live) return
					made = URL.createObjectURL(blob)
					onMedia(id, { url: made })
				})
				.catch(() => live && onMedia(id, { url: current, remote: true }))
		return () => {
			live = false
			if (made) URL.revokeObjectURL(made)
		}
	}, [srcKey, id])
	// forget the entry together with the loader, so a revoked URL is never drawn
	useEffect(() => () => onMedia(id, null), [id])
	return null
}

/** Blob URLs for library media. The panel renders one MediaLoader per id and passes it onMedia. */
export const useMediaMap = () => {
	const [media, setMedia] = useState<Record<string, Media>>({})
	const onMedia = useCallback((id: string, next: Media | null) => {
		setMedia(map => {
			if (!next) {
				if (!(id in map)) return map
				const { [id]: _gone, ...rest } = map
				return rest
			}
			const prev = map[id]
			if (prev && prev.url === next.url && prev.missing === next.missing && prev.remote === next.remote) return map
			return { ...map, [id]: next }
		})
	}, [])
	const key = Object.entries(media)
		.map(([id, m]) => `${id}:${m.url ?? ''}`)
		.join('|')
	const assets = useMemo(() => Object.fromEntries(Object.entries(media).map(([id, m]) => [id, m.url])) as Record<string, string | undefined>, [key])
	return { media, assets, onMedia }
}

/** Re-renders the caller when a font finishes loading or gives up. The counter works as an effect dependency. */
export const useFontTick = () => {
	const [tick, setTick] = useState(0)
	useEffect(() => onFontsChange(() => setTick(n => n + 1)), [])
	return tick
}

// ---------- project files ----------
const useFiles = () => ((useDisplayedRootFilesState() as any)?.files ?? {}) as Record<string, string>

// The skill's machine-readable rules; null until the skill exists
export const useRules = () => {
	const text = useFiles()[RULES_PATH]
	return useMemo(() => parseRules(text), [text])
}

type JsonFile<T> = {
	path: string
	empty: T
	/** Null when the text is not this kind of file (cut off, not JSON): the panel then keeps what it has. */
	parse: (text: string) => T | null
	serialize: (value: T) => string
	/** Combine the panel's unsaved edits with a version someone else wrote. */
	merge: (base: T, local: T, remote: T) => T
	historyLabel: string
	onError: (message: string) => void
	/** Called when the file changed from outside the panel: an agent, a teammate, or undo. */
	onExternal?: (before: T, after: T) => void
}

// A JSON file in project source, edited in the panel and by others at the same time.
// Edits are saved after a short pause through commitSource, so each one is undoable in Kino.
// base is the last version both sides agreed on. With it a change from outside can be told apart from
// the panel's own unsaved edits, and the two are merged instead of one overwriting the other.
const useJsonFile = <T,>(file: JsonFile<T>) => {
	const fileText = useFiles()[file.path]
	const source = useProjectSource() as any
	const [value, setValue] = useState<T>(() => (typeof fileText === 'string' ? file.parse(fileText) : null) ?? file.empty)
	const valueRef = useRef(value)
	const base = useRef(value)
	const synced = useRef<string | undefined>(fileText)
	const dirty = useRef(false)
	const timer = useRef<any>(null)
	const fileRef = useRef(file)
	fileRef.current = file
	const sourceRef = useRef(source)
	sourceRef.current = source

	// Take in a version of the file the panel did not write. False when it cannot be read.
	const absorb = useCallback((text: string) => {
		const remote = fileRef.current.parse(text)
		if (!remote) return false
		const before = valueRef.current
		// the first sight of the file is a load, not a change someone made
		const first = synced.current === undefined && !dirty.current
		const next = dirty.current ? fileRef.current.merge(base.current, before, remote) : remote
		base.current = remote
		synced.current = text
		valueRef.current = next
		setValue(next)
		if (!first) fileRef.current.onExternal?.(before, next)
		return true
	}, [])

	const save = useCallback(() => {
		clearTimeout(timer.current)
		timer.current = null
		if (!dirty.current) return
		const f = fileRef.current
		try {
			const before = sourceRef.current.readSource()
			const disk = before.files?.[f.path]
			// A file that cannot be read is half-written by someone or broken by hand. Saving now would
			// replace whatever is in it, so wait: the edits stay in the panel until the file reads again.
			if (typeof disk === 'string' && disk.trim() && f.parse(disk) === null) {
				f.onError(`${f.path} is not valid JSON right now. Your edits stay in the panel and are saved once it is. Undo in Kino restores the last good version.`)
				timer.current = setTimeout(save, 2500)
				return
			}
			// someone wrote the file since the panel last looked: merge first, then save the result
			if (typeof disk === 'string' && disk !== synced.current) absorb(disk)
			const text = f.serialize(valueRef.current)
			dirty.current = false
			if (text === disk) {
				base.current = valueRef.current
				return
			}
			const after = { ...before, files: { ...before.files, [f.path]: text } }
			if (sourceRef.current.commitSource({ before, after, historyLabel: f.historyLabel }) === false) {
				dirty.current = true
				f.onError('Kino did not save the edit. The project may be read-only, or this panel was replaced by a newer copy.')
				return
			}
			synced.current = text
			base.current = valueRef.current
		} catch (error) {
			dirty.current = true
			f.onError(`Could not save ${f.path}: ${error instanceof Error ? error.message : String(error)}`)
		}
	}, [absorb])

	useEffect(() => {
		if (fileText === undefined || fileText === synced.current) return
		if (!absorb(fileText)) return
		// the merged result differs from the file: write it back
		if (dirty.current) {
			clearTimeout(timer.current)
			timer.current = setTimeout(save, 600)
		}
	}, [fileText, absorb, save])

	// an edit made just before the panel closes is still saved
	useEffect(() => () => save(), [save])

	const update = useCallback(
		(fn: (value: T) => T) => {
			const next = fn(valueRef.current)
			if (next === valueRef.current) return
			valueRef.current = next
			dirty.current = true
			setValue(next)
			clearTimeout(timer.current)
			timer.current = setTimeout(save, 600)
		},
		[save],
	)
	const broken = useMemo(() => typeof fileText === 'string' && fileText.trim() !== '' && fileRef.current.parse(fileText) === null, [fileText])
	return { value, update, flush: save, exists: fileText !== undefined, broken }
}

// ---------- designs: three-way merge by design and element id ----------
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const byId = <T extends { id: string }>(list: T[]) => new Map(list.map(item => [item.id, item]))

// Each side keeps what only it changed. Where both changed the same thing the panel's edit wins:
// it is what the user is looking at, and the other version is still in Kino's history.
const mergeList = <T extends { id: string }>(base: T[], local: T[], remote: T[], both: (b: T, l: T, r: T) => T): T[] => {
	const b = byId(base)
	const l = byId(local)
	const r = byId(remote)
	const out: T[] = []
	for (const item of remote) {
		const mine = l.get(item.id)
		const was = b.get(item.id)
		if (!mine) {
			// not in the panel: new from outside, or deleted here (then it stays deleted)
			if (!was) out.push(item)
		} else if (!was) out.push(mine)
		else if (same(mine, was)) out.push(item)
		else out.push(same(item, was) ? mine : both(was, mine, item))
	}
	// what the panel added, and what it edited while the other side deleted it
	for (const item of local) if (!r.has(item.id) && (!b.has(item.id) || !same(item, b.get(item.id)))) out.push(item)
	return out
}

const mergeFields = <T extends Record<string, any>>(b: T, l: T, r: T, skip: string[] = []): T => {
	const out: Record<string, any> = { ...r }
	for (const key of new Set([...Object.keys(l), ...Object.keys(b)])) if (!skip.includes(key) && !same(l[key], b[key])) out[key] = l[key]
	return out as T
}

const mergeEl = (b: El, l: El, r: El): El => {
	if (b.type !== l.type || l.type !== r.type) return l
	const merged = mergeFields(b, l, r, ['children'])
	if (l.type === 'stack' && b.type === 'stack' && r.type === 'stack') (merged as any).children = mergeList(b.children, l.children, r.children, (_base, mine) => mine)
	return merged
}

const mergeDesign = (b: Design, l: Design, r: Design): Design => ({
	...mergeFields(b, l, r, ['elements', 'background']),
	background: mergeFields(b.background, l.background, r.background),
	elements: mergeList(b.elements, l.elements, r.elements, mergeEl),
})

export const mergeDocs = (base: Doc, local: Doc, remote: Doc): Doc => ({
	version: 2,
	videoTitle: local.videoTitle !== base.videoTitle ? local.videoTitle : remote.videoTitle,
	chatId: local.chatId !== base.chatId ? local.chatId : remote.chatId,
	designs: mergeList(base.designs, local.designs, remote.designs, mergeDesign),
})

/** What differs between two versions of the designs: for the "updated" notice and the highlights. */
export type Changes = { added: string[]; changed: string[]; removed: number; elements: Record<string, string[]> }
export const diffDocs = (before: Doc, after: Doc): Changes | null => {
	const was = byId(before.designs)
	const now = byId(after.designs)
	const out: Changes = { added: [], changed: [], removed: before.designs.filter(d => !now.has(d.id)).length, elements: {} }
	for (const d of after.designs) {
		const old = was.get(d.id)
		if (!old) out.added.push(d.id)
		else if (!same(old, d)) {
			out.changed.push(d.id)
			const olds = byId(old.elements)
			out.elements[d.id] = d.elements.filter(e => !same(olds.get(e.id), e)).map(e => e.id)
		}
	}
	return out.added.length || out.changed.length || out.removed ? out : null
}

// Designs live in /thumbs/designs.json so they travel with the project, every edit is undoable,
// and the chat agent can write them too.
export const useDesignsDoc = (onError: (message: string) => void, onExternal: (changes: Changes) => void) => {
	const file = useJsonFile<Doc>({
		path: DESIGNS_PATH,
		empty: EMPTY_DOC,
		parse: parseDoc,
		serialize: serializeDoc,
		merge: mergeDocs,
		historyLabel: 'Edit thumbnails',
		onError,
		onExternal: (before, after) => {
			const changes = diffDocs(before, after)
			if (changes) onExternal(changes)
		},
	})
	return { doc: file.value, update: file.update, flush: file.flush, broken: file.broken }
}

const parseBrandFile = (text: string): Brand | null => {
	try {
		const json = JSON.parse(text)
		return json && typeof json === 'object' && !Array.isArray(json) ? normBrand(json) : null
	} catch {
		return null
	}
}

// Fields changed in the panel win, one level into colors and fonts; everything else follows the file
const mergeBrand = (base: Brand, local: Brand, remote: Brand): Brand => ({
	...mergeFields(base, local, remote, ['colors', 'fonts']),
	colors: mergeFields(base.colors, local.colors, remote.colors),
	fonts: mergeFields(base.fonts, local.fonts, remote.fonts),
})

// The brand kit in /thumbs/brand.json. A project without the file gets the neutral kit, and the file
// is only created once something is changed in the Brand tab.
export const useBrand = (onError: (message: string) => void) => {
	const file = useJsonFile<Brand>({
		path: BRAND_PATH,
		empty: DEFAULT_BRAND,
		parse: parseBrandFile,
		serialize: brand => JSON.stringify(brand, null, '\t') + '\n',
		merge: mergeBrand,
		historyLabel: 'Edit thumbnail brand kit',
		onError,
	})
	return { brand: file.value, update: file.update, exists: file.exists }
}
