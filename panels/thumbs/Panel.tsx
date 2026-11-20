// Thumbnails: prompt, design, check and export platform thumbnails (YouTube, Shorts/TikTok/Reels, Instagram, square, X)
// with the project's brand kit. Art is a Remotion component (thumbs/ThumbArt.tsx) built from free elements
// (thumbs/model.ts), shown live through @remotion/player's Thumbnail and edited directly in the preview.
// The skill in /thumbs/skill drives the agent, the recipes and the checks. Designs live in /thumbs/designs.json
// and the brand kit in /thumbs/brand.json, so the chat agent can write both.
// Built with createElement rather than JSX: generated panels currently hit React #31 with JSX.
import { createElement as h, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Thumbnail } from '@remotion/player'
import { runAction, useFps, usePanelSettings, useTimelineDuration } from 'kino/panel'
import { ThumbArt, designFonts } from '../../thumbs/ThumbArt'
import {
	DEFAULT_CONTENT,
	LAYOUTS,
	PRESETS,
	adaptDesign,
	baseName,
	cloneEl,
	contentOf,
	designMedia,
	duplicateEl,
	layoutElements,
	layoutOf,
	mapEl,
	moveEl,
	newDesign,
	normBg,
	normEl,
	parentOf,
	pasteStyle,
	rid,
	styleOf,
	type Anchor,
	type Design,
	type El,
	type ElStyle,
	type LayoutId,
	type PresetId,
	type Rect,
	type StackEl,
} from '../../thumbs/model'
import type { Brand } from '../../thumbs/ui/brand'
import { fontState } from '../../thumbs/ui/fonts'
import { BridgeCard, api, apiBlob, projectId, useBridge } from '../bridge'
import { IS_MAC, UPDATE_BRIDGE, UPDATE_BRIDGE_HINT, modKey } from '../platform'
import { accentHue, colorStats, encode, fmtBytes, fontsSettled, measureBoxes, platformOf, rasterize, runChecks, settle, shrink, slug, toBlob, toDataUrl, type Box, type Check, type Stats } from './lib'
import { MediaLoader, useBrand, useDesignsDoc, useFontTick, useMediaMap, useRules, type Changes, type Media } from './hooks'
import { Preview, type BoxMap } from './preview'
import { PromptBar, PromptDialog, composeEdit, composeNew, findChatId, type Scope, type ScopeOption } from './prompt'
import { BG, Btn, DIM, EMBER, GREEN, LINE, MONO, RED, Segmented, Select, TEXT, UI_FONT, ensureCss, input, label } from './ui'
import { BrandTab, CheckTab, EditTab, FeedTab, GuideTab } from './views'

type Analysis = { id: string; boxes: Box[]; stats: Stats; bytes: number; feed: string }
type Out = { blob: Blob; format: 'png' | 'jpeg'; quality: number | null; over: boolean; w: number; h: number }
type Pending = { requestId: string; ask: string; what: string; copied: boolean; status?: string }
const r1 = (n: number) => Math.round(n * 10) / 10
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
// Stands in for "the selected design" while the project has none, so the hooks below always have one
const PLACEHOLDER: Design = newDesign('youtube', 'hero', { id: 'placeholder' })

const download = (blob: Blob, name: string) => {
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = name
	document.body.appendChild(a)
	a.click()
	a.remove()
	setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// Put a stack item on its own, exactly where it renders now (box in composition px)
const freeEl = (child: El, parent: StackEl, box: Rect | undefined, W: number, H: number): El => {
	if (!box) return { ...child, x: parent.x, y: parent.y, anchor: parent.anchor } as El
	const y = r1(((box.y + box.h / 2) / H) * 100)
	const at: [Anchor, number] = parent.align === 'start' ? ['cl', (box.x / W) * 100] : parent.align === 'end' ? ['cr', ((box.x + box.w) / W) * 100] : ['c', ((box.x + box.w / 2) / W) * 100]
	return { ...child, anchor: at[0], x: r1(at[1]), y, rotate: (child.rotate ?? 0) + (parent.rotate ?? 0) } as El
}

const mergeChanges = (a: Changes | null, b: Changes): Changes =>
	a ? { added: [...new Set([...a.added, ...b.added])], changed: [...new Set([...a.changed, ...b.changed])].filter(id => !a.added.includes(id)), removed: a.removed + b.removed, elements: { ...a.elements, ...b.elements } } : b

// Memoized: every strip card draws a full thumbnail, and only the design being edited should draw again
type CardProps = { d: Design; assets: Record<string, string | undefined>; brand: Brand; active: boolean; picked: boolean; changed: boolean; onPick: (ev: any, id: string) => void }
const Card = memo(({ d, assets, brand, active, picked, changed, onPick }: CardProps) => {
	const inputProps = useMemo(() => ({ design: d, assets, brand }), [d, assets, brand])
	const onClick = (ev: any) => onPick(ev, d.id)
	const p = PRESETS[d.preset]
	const ht = 64
	const w = Math.round((ht * p.w) / p.h)
	return h(
		'div',
		{
			className: 'kino-thumbs-card',
			onClick,
			title: `${d.name} · ${p.label}${d.prompt ? `\n${d.prompt}` : ''}`,
			style: { position: 'relative', display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer', padding: 4, borderRadius: 6, flex: 'none', border: `1px solid ${active ? EMBER : picked ? 'rgba(255,138,31,.55)' : 'rgba(var(--kp-ink),0.08)'}`, background: active ? 'rgba(255,138,31,0.1)' : picked ? 'rgba(255,138,31,0.05)' : 'transparent' },
		},
		h('div', { style: { width: w, height: ht, overflow: 'hidden', borderRadius: 3, background: '#000' } }, h(Thumbnail, { component: ThumbArt as any, inputProps, compositionWidth: p.w, compositionHeight: p.h, frameToDisplay: 0, durationInFrames: 1, fps: 30, style: { width: w, height: ht } })),
		picked ? h('div', { style: { position: 'absolute', left: 7, top: 7, width: 14, height: 14, borderRadius: 7, background: EMBER, color: '#111', fontSize: 10, fontWeight: 700, lineHeight: '14px', textAlign: 'center' } }, '✓') : null,
		changed ? h('div', { title: 'Just changed from outside the panel', className: 'kino-thumbs-pulse', style: { position: 'absolute', right: 7, top: 7, width: 8, height: 8, borderRadius: 4, background: GREEN, boxShadow: '0 0 0 2px rgba(0,0,0,.5)' } }) : null,
		h('div', { style: { width: Math.max(w, 64), fontSize: 10, color: active ? TEXT : DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, d.name),
	)
})

// One hidden loader per library image id
const MediaLoaders = ({ ids, onMedia }: { ids: string[]; onMedia: (id: string, media: Media | null) => void }) => h('div', { style: { display: 'none' } }, ...ids.map(id => h(MediaLoader, { key: id, id, onMedia })))

export default function Panel() {
	useEffect(ensureCss, [])
	const pid = useMemo(() => projectId(), [])
	const [note, setNote] = useState('')
	const [saveErr, setSaveErr] = useState('')
	const [renderErr, setRenderErr] = useState('')
	const [changes, setChanges] = useState<Changes | null>(null)
	const [selId, setSelId] = useState('')
	const [pending, setPending] = useState<Pending | null>(null)
	const pendingRef = useRef(pending)
	pendingRef.current = pending
	const onExternal = useCallback((c: Changes) => {
		setChanges(prev => mergeChanges(prev, c))
		// while a request is out, jump to the first design the agent adds
		if (pendingRef.current && c.added.length) setSelId(c.added[0])
	}, [])
	const { doc, update, flush, broken } = useDesignsDoc(setSaveErr, onExternal)
	const { brand, update: updateBrand, exists: brandExists } = useBrand(setSaveErr)
	const rules = useRules()
	const bridge = useBridge({ needs: ['thumbs'], probe: () => api(`/thumbs/list?projectId=${encodeURIComponent(pid)}&n=1`) })
	const canSave = bridge.ready
	const canPrompt = bridge.ready && bridge.has('thumbs-prompt')
	const { fps } = useFps() as { fps: number }
	const timeline = useTimelineDuration() as any
	const seconds = (timeline?.rootDurationInFrames ?? timeline?.durationInFrames ?? 0) / (fps || 30)
	const [stored, setStored] = usePanelSettings({ prompts: [] as string[], advanced: false })
	const history = Array.isArray(stored?.prompts) ? stored.prompts.filter(x => typeof x === 'string') : []
	const advanced = stored?.advanced === true

	// highlights fade on their own, so an old change does not keep blinking
	useEffect(() => {
		if (!changes) return
		const timer = setTimeout(() => setChanges(null), 45000)
		return () => clearTimeout(timer)
	}, [changes])

	// ---------- selection ----------
	const empty = doc.designs.length === 0
	const selected = doc.designs.find(d => d.id === selId) ?? doc.designs[0] ?? PLACEHOLDER
	const [picked, setPicked] = useState<string[]>([])
	const pickedDesigns = useMemo(() => doc.designs.filter(d => picked.includes(d.id)), [doc.designs, picked])
	const many = pickedDesigns.length > 1
	const acting = many ? pickedDesigns : empty ? [] : [selected]
	const setName = selected.set || 'Ungrouped'
	const inSet = useMemo(() => doc.designs.filter(d => (d.set || 'Ungrouped') === setName), [doc.designs, setName])
	const onCard = (ev: any, id: string) => {
		if (modKey(ev)) {
			setPicked(list => {
				const start = list.length ? list : [selected.id]
				return start.includes(id) ? start.filter(x => x !== id) : [...start, id]
			})
		} else if (ev.shiftKey) {
			const ids = doc.designs.map(d => d.id)
			const a = ids.indexOf(selected.id)
			const b = ids.indexOf(id)
			setPicked(ids.slice(Math.min(a, b), Math.max(a, b) + 1))
		} else {
			setSelId(id)
			setPicked([])
		}
	}

	// one stable handler for every card, so memoized cards are not redrawn when the panel renders
	const onCardRef = useRef(onCard)
	onCardRef.current = onCard
	const pickCard = useCallback((ev: any, id: string) => onCardRef.current(ev, id), [])

	// a multi-selection that shrinks to one design is just that design
	useEffect(() => {
		if (picked.length !== 1) return
		setSelId(picked[0])
		setPicked([])
	}, [picked])

	const p = PRESETS[selected.preset]
	const plat = platformOf(selected.preset, rules)
	const selectedJson = JSON.stringify(selected)
	const [sel, setSel] = useState<string | null>(null)
	useEffect(() => setSel(null), [selected.id])
	const [tab, setTab] = useState('edit')
	const [overlay, setOverlay] = useState('safe')
	const [format, setFormat] = useState<'auto' | 'png'>('auto')
	const [scale, setScale] = useState(1)
	const [importToLib, setImportToLib] = useState(true)
	const [working, setWorking] = useState('')
	const workingRef = useRef(false)
	const boxesRef = useRef<BoxMap>({})

	const updateSel = useCallback((fn: (d: Design) => Design) => update(x => ({ ...x, designs: x.designs.map(d => (d.id === selected.id ? fn(d) : d)) })), [update, selected.id])

	// ---------- library images and fonts ----------
	const { media, assets, onMedia } = useMediaMap()
	const fontTick = useFontTick()
	const mediaIds = useMemo(() => {
		const ids = new Set<string>()
		for (const d of doc.designs) for (const id of designMedia(d, brand)) ids.add(id)
		// the Brand tab shows every image of the kit, used or not
		if (tab === 'brand' || empty) for (const id of [brand.logo.media, ...brand.images.map(i => i.media)]) if (id) ids.add(id)
		return [...ids].sort()
	}, [doc.designs, brand, tab, empty])
	// ready means settled, not perfect: a missing image or a font that gave up must not block the export
	const readyFor = (d: Design) => designMedia(d, brand).every(id => media[id]?.url || media[id]?.missing) && fontsSettled(designFonts(d, brand))
	const ready = !empty && readyFor(selected)
	const used = empty ? [] : designMedia(selected, brand)
	const lost = used.filter(id => media[id]?.missing).length
	const warnings = [
		lost ? `${plural(lost, 'image')} could not be found in this library and ${lost === 1 ? 'is' : 'are'} left empty. Pick another under Edit.` : '',
		used.some(id => media[id]?.remote) ? 'An image could not be copied into the panel, so it may be missing from exports. Check the export before you post it.' : '',
		...designFonts(selected, brand)
			.filter(f => fontState(f) === 'failed')
			.map(f => `The font ${f.label} did not load, so a fallback is drawn. Check the connection${f.url ? ' and its url in the brand file' : ''}.`),
	].filter(Boolean)

	// ---------- offscreen full-size stage: one render at a time ----------
	const hostRef = useRef<HTMLDivElement>(null)
	const [stage, setStage] = useState<{ design: Design; key: string } | null>(null)
	const queue = useRef<Promise<unknown>>(Promise.resolve())
	const seq = useRef(0)
	const brandRef = useRef(brand)
	brandRef.current = brand
	const renderJob = useCallback((design: Design, work: (player: HTMLElement, root: HTMLElement) => Promise<any>): Promise<any> => {
		const run = async () => {
			const key = `${design.id}:${++seq.current}`
			setStage({ design, key })
			if (!hostRef.current) throw new Error('The panel was closed.')
			const root = await settle(hostRef.current, key, designFonts(design, brandRef.current))
			const player = hostRef.current.querySelector('.__remotion-player') as HTMLElement | null
			if (!player) throw new Error('The thumbnail did not render.')
			return work(player, root)
		}
		const job = queue.current.then(run, run)
		queue.current = job.catch(() => {})
		return job
	}, [])
	const snapshot = (player: HTMLElement, design: Design, at: number) => rasterize(player, at, designFonts(design, brandRef.current), brandRef.current.colors.page)

	// ---------- analysis of the selected design ----------
	const [analysis, setAnalysis] = useState<Analysis | null>(null)
	const [busy, setBusy] = useState(false)
	useEffect(() => {
		if (!ready) return
		let live = true
		const design = selected
		const timer = setTimeout(() => {
			setBusy(true)
			renderJob(design, async (player, root) => {
				const boxes = measureBoxes(root, PRESETS[design.preset].w)
				const canvas = await snapshot(player, design, 1)
				const jpeg = await toBlob(canvas, 'image/jpeg', 0.92)
				return { id: design.id, boxes, stats: colorStats(canvas, accentHue(brandRef.current)), bytes: jpeg.size, feed: shrink(canvas, 760).toDataURL('image/jpeg', 0.9) }
			})
				.then(result => {
					if (!live) return
					setAnalysis(result)
					setRenderErr('')
				})
				.catch(error => live && setRenderErr(`Render failed: ${error instanceof Error ? error.message : String(error)}`))
				.finally(() => live && setBusy(false))
		}, 450)
		return () => {
			live = false
			clearTimeout(timer)
		}
	}, [ready, selectedJson, renderJob, assets, brand, fontTick])

	const current = analysis && analysis.id === selected.id ? analysis : null
	const ytCount = doc.designs.filter(d => d.preset === 'youtube').length
	const checks: Check[] = useMemo(
		() => (current ? runChecks({ design: selected, boxes: current.boxes, stats: current.stats, bytes: current.bytes, videoTitle: doc.videoTitle, videoSeconds: seconds, ytCount, rules, brand }) : []),
		[current, selectedJson, doc.videoTitle, seconds, ytCount, rules, brand],
	)
	const flags = checks.filter(c => c.level === 'fail' || c.level === 'warn').length

	// ---------- busy wrapper: true when the action went through ----------
	const act = async (text: string, fn: () => Promise<string>): Promise<boolean> => {
		if (workingRef.current) return false
		workingRef.current = true
		setWorking(text)
		setNote('')
		try {
			setNote(await fn())
			return true
		} catch (error) {
			setNote(`Failed: ${bridge.fail(error)}`)
			return false
		} finally {
			workingRef.current = false
			setWorking('')
		}
	}

	// ---------- the agent ----------
	const [dialog, setDialog] = useState(false)
	const [scopeChoice, setScope] = useState<Scope>('one')
	// ticking several designs means "these": follow the selection unless the user picked a wider scope
	useEffect(() => setScope(s => (many ? (s === 'one' ? 'picked' : s) : s === 'picked' ? 'one' : s)), [many])
	const scope: Scope = scopeChoice === 'picked' && !many ? 'one' : scopeChoice
	const scopes: ScopeOption[] = [
		{ value: 'one', label: 'This design', count: 1, hint: `Changes "${selected.name}" in place.` },
		...(many ? [{ value: 'picked' as Scope, label: `Selected designs (${pickedDesigns.length})`, count: pickedDesigns.length, hint: `Changes the ${pickedDesigns.length} selected designs in place.` }] : []),
		{ value: 'set', label: `Whole set "${setName}" (${inSet.length})`, count: inSet.length, hint: `Changes all ${plural(inSet.length, 'design')} in "${setName}" in place.` },
		{ value: 'all', label: `All designs (${doc.designs.length})`, count: doc.designs.length, hint: `Changes all ${plural(doc.designs.length, 'design')} in this project in place.` },
		{ value: 'add', label: `New designs in "${setName}"`, count: 1, hint: `Adds designs to "${setName}", starting from "${selected.name}".` },
	]
	const targetsOf = (s: Scope) => (s === 'one' ? [selected] : s === 'picked' ? pickedDesigns : s === 'set' ? inSet : s === 'all' ? doc.designs : [])

	const openChat = (chatId?: string) => {
		const id = chatId ?? doc.chatId
		if (id) runAction('chat::OpenInNewTab', { chatId: id }, { source: 'button' }).catch(error => setNote(`Failed: ${bridge.fail(error)}`))
	}

	// One-click through the bridge when it supports prompts; otherwise copy the prompt and open a chat tab
	const sendToAgent = async (message: string, ask: string, what: string): Promise<string> => {
		let bridgeError = ''
		// the agent works on the file: write pending edits first, so every id in the request exists there
		flush()
		if (canPrompt) {
			try {
				const r = await api('/thumbs/prompt', { method: 'POST', body: { projectId: pid, chatId: doc.chatId, message } })
				if (r.chatId && r.chatId !== doc.chatId) update(x => ({ ...x, chatId: r.chatId }))
				setPending({ requestId: r.requestId ?? '', ask, what, copied: false })
				return `Sent to the agent${r.created ? ' in a new Thumbnails chat' : ''}.`
			} catch (error) {
				// fall back to copy and paste so the request is never lost
				bridgeError = `One-click send failed (${bridge.fail(error)}). `
			}
		}
		try {
			await navigator.clipboard.writeText(message)
		} catch {
			throw new Error(`${bridgeError}Could not copy the prompt either. Click into the panel and try again, or use Copy prompt.`)
		}
		let chatId: string | null = doc.chatId ?? null
		try {
			if (!chatId) {
				chatId = findChatId(await runAction('chat::NewChat', { projectId: pid }, { source: 'button' }))
				if (chatId) update(x => ({ ...x, chatId: chatId! }))
			}
			if (chatId) await runAction('chat::OpenInNewTab', { chatId }, { source: 'button' })
		} catch {}
		setPending({ requestId: '', ask, what, copied: true })
		return bridgeError + (chatId ? 'Prompt copied. Paste it into the chat tab that just opened and send it.' : 'Prompt copied. Paste it into a new chat in this project and send it.')
	}

	const remember = (ask: string) => setStored(prev => ({ ...prev, prompts: [ask, ...(Array.isArray(prev?.prompts) ? prev.prompts : []).filter(x => x !== ask)].slice(0, 12) }))
	const forget = (ask: string | null) => setStored(prev => ({ ...prev, prompts: ask === null ? [] : (Array.isArray(prev?.prompts) ? prev.prompts : []).filter(x => x !== ask) }))
	const editMessage = (ask: string, flagged?: Check[], only?: Scope) => {
		const s = only ?? scope
		return composeEdit({ scope: s, targets: targetsOf(s), set: setName, ask, videoTitle: doc.videoTitle, seconds, projectId: pid, flagged, context: s === 'add' ? selected : null })
	}
	const whatFor = (s: Scope) => {
		const n = targetsOf(s).length
		return s === 'add' ? `New designs for "${setName}" will appear here` : n === 1 ? `"${targetsOf(s)[0].name}" will update here` : `${n} designs will update here`
	}
	const onAsk = (ask: string) => {
		remember(ask)
		return act('Sending', () => sendToAgent(editMessage(ask), ask, whatFor(scope)))
	}
	const onCopyPrompt = (ask: string) =>
		navigator.clipboard
			.writeText(editMessage(ask))
			.then(() => setNote('Prompt copied.'))
			.catch(() => setNote('Failed: could not copy. Click into the panel and try again.'))
	const onAskFix = () => {
		const ask = 'Fix what the panel checks flagged, the way the skill recommends, and keep the idea.'
		act('Sending', () => sendToAgent(editMessage(ask, checks.filter(c => c.level === 'fail' || c.level === 'warn'), 'one'), ask, whatFor('one')))
	}
	const onSendNew = (ask: { brief: string; presets: PresetId[]; variations: number; set: string }) => {
		const message = composeNew({ mode: 'set', ...ask, videoTitle: doc.videoTitle, seconds, projectId: pid, current: empty ? null : selected })
		const n = ask.presets.length * ask.variations
		remember(ask.brief.trim())
		// the dialog stays open when sending fails, so the brief is not lost
		act('Sending', () => sendToAgent(message, ask.brief.trim(), `${plural(n, 'design')} for "${ask.set}" will appear here`)).then(ok => ok && setDialog(false))
	}

	const checkPending = () =>
		pending?.requestId &&
		api(`/thumbs/prompt/status?requestId=${encodeURIComponent(pending.requestId)}`)
			.then(r => setPending(x => (x ? { ...x, status: String(r.status ?? r.state ?? r.detail ?? 'unknown') } : x)))
			.catch(error => setNote(`Failed: ${bridge.fail(error)}`))

	// ---------- export ----------
	const exportOne = (design: Design): Promise<Out> =>
		renderJob(design, async player => {
			const canvas = await snapshot(player, design, scale)
			const out = await encode(canvas, format, PRESETS[design.preset].limitMB)
			return { ...out, w: canvas.width, h: canvas.height }
		})
	const fileName = (design: Design, out: Out) => `${slug(design.name)}-${out.w}x${out.h}.${out.format === 'png' ? 'png' : 'jpg'}`
	const describe = (design: Design, out: Out) => `${out.w}x${out.h} ${out.format.toUpperCase()}${out.quality ? ` q${out.quality}` : ''}, ${fmtBytes(out.blob.size)}${out.over ? ` (over the ${PRESETS[design.preset].limitMB} MB limit)` : ''}`
	const saveKino = async (design: Design, out: Out) =>
		api('/thumbs/save', {
			method: 'POST',
			body: { projectId: pid, name: design.name, format: out.format, data: await toDataUrl(out.blob), preset: design.preset, width: out.w, height: out.h, design, import: importToLib },
		})

	const [saved, setSaved] = useState<any[]>([])
	const [savedDir, setSavedDir] = useState('')
	const urls = useRef(new Map<string, string>())
	const { fail } = bridge
	const loadSaved = useCallback(() => {
		api(`/thumbs/list?projectId=${encodeURIComponent(pid)}&n=12`)
			.then(async body => {
				for (const item of body.items ?? [])
					if (!urls.current.has(item.file))
						try {
							urls.current.set(item.file, URL.createObjectURL(await apiBlob(`/thumbs/file?path=${encodeURIComponent(item.file)}`)))
						} catch {}
				setSaved(body.items ?? [])
				setSavedDir(body.dir ?? '')
			})
			.catch(fail)
	}, [fail, pid])
	useEffect(() => {
		if (canSave) loadSaved()
	}, [canSave, loadSaved])
	useEffect(
		() => () => {
			for (const url of urls.current.values()) URL.revokeObjectURL(url)
		},
		[],
	)

	const exportList = many ? pickedDesigns : doc.designs
	const onSave = () =>
		act('Saving', async () => {
			const out = await exportOne(selected)
			const result = await saveKino(selected, out)
			loadSaved()
			return `Saved ${describe(selected, out)}${result.mediaId ? ', imported into the Thumbnails bin' : result.importError ? `. Import failed: ${result.importError}` : ''}`
		})
	const onDownload = () =>
		act('Rendering', async () => {
			const out = await exportOne(selected)
			download(out.blob, fileName(selected, out))
			return `Downloaded ${describe(selected, out)}`
		})
	const onCopy = () =>
		act('Copying', async () => {
			const png: Blob = await renderJob(selected, async player => toBlob(await snapshot(player, selected, scale), 'image/png'))
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
			return `Copied a ${fmtBytes(png.size)} PNG`
		})
	const onAll = () =>
		act('Exporting', async () => {
			const list = exportList.filter(readyFor)
			let n = 0
			let over = 0
			for (const design of list) {
				setWorking(`Exporting ${++n} of ${list.length}`)
				const out = await exportOne(design)
				if (out.over) over++
				if (canSave) await saveKino(design, out)
				else download(out.blob, fileName(design, out))
			}
			if (canSave) loadSaved()
			const skipped = exportList.length - list.length
			return `${canSave ? `Saved ${plural(n, 'thumbnail')}${importToLib ? ' and imported them into the Thumbnails bin' : ''}` : `Downloaded ${plural(n, 'thumbnail')}`}${over ? `. ${over} over the platform size limit` : ''}${skipped ? `. ${skipped} skipped: still loading images or fonts` : ''}`
		})

	// ---------- design list ----------
	const hasLogo = !!brand.logo.media || !!brand.name.trim()
	const addMany = (designs: Design[]) => {
		update(x => ({ ...x, designs: [...x.designs, ...designs] }))
		if (designs[0]) setSelId(designs[0].id)
		setPicked([])
	}
	const onLayout = (presets: PresetId[], layout: LayoutId, set: string) => {
		const words = empty ? { logo: hasLogo } : contentOf(selected)
		addMany(
			presets
				.map(preset => newDesign(preset, layout, { name: `${LAYOUTS[layout]} · ${PRESETS[preset].short}`, set }, words))
				.map(d => (empty ? d : { ...d, background: normBg({ ...selected.background, shade: d.background.shade, shadeAmount: d.background.shadeAmount }) })),
		)
		setDialog(false)
		setNote(`Added ${presets.length} from the ${LAYOUTS[layout]} layout to "${set}".`)
	}
	const onDuplicate = () => addMany(acting.map(d => ({ ...d, id: rid(), name: `${d.name} copy`, elements: d.elements.map(cloneEl) })))
	const onDelete = () => {
		const gone = new Set(acting.map(d => d.id))
		if (!gone.size) return
		const i = doc.designs.findIndex(d => gone.has(d.id))
		const rest = doc.designs.filter(d => !gone.has(d.id))
		update(x => ({ ...x, designs: x.designs.filter(d => !gone.has(d.id)) }))
		setSelId(rest[Math.max(0, Math.min(i, rest.length) - 1)]?.id ?? '')
		setPicked([])
		setNote(`Deleted ${plural(gone.size, 'design')}. Undo in Kino brings ${gone.size === 1 ? 'it' : 'them'} back.`)
	}
	const onAllSizes = () => {
		const base = baseName(selected.name)
		const have = new Set(doc.designs.filter(d => d.set === selected.set && baseName(d.name) === base).map(d => d.preset))
		const made = (Object.keys(PRESETS) as PresetId[]).filter(preset => !have.has(preset)).map(preset => adaptDesign(selected, preset))
		if (!made.length) {
			setNote('This design already has every size in its set.')
			return
		}
		update(x => ({ ...x, designs: [...x.designs, ...made] }))
		setNote(`Added ${made.map(d => PRESETS[d.preset].short).join(', ')}. Built-in layouts re-flow; free layouts keep their positions inside the safe area, so check each one.`)
	}
	const onSetName = (set: string) => {
		const ids = new Set(acting.map(d => d.id))
		update(x => ({ ...x, designs: x.designs.map(d => (ids.has(d.id) ? { ...d, set } : d)) }))
	}

	// ---------- edit helpers ----------
	const onApply = (id: string) => {
		const c = contentOf(selected)
		const layout = layoutOf(id)
		if (layout) {
			const made = layoutElements(layout, selected.preset, { ...c, title: c.title || DEFAULT_CONTENT.title, accent: c.title ? c.accent : DEFAULT_CONTENT.accent })
			updateSel(d => ({ ...d, recipe: layout, elements: made.elements, background: { ...d.background, shade: made.shade, shadeAmount: made.shadeAmount } }))
			setSel(null)
			return
		}
		const r = rules?.recipes?.find(x => x.id === id)
		if (!r) return
		// a design without words still gets visible placeholders, so nothing a recipe places is dropped
		const title = c.title || DEFAULT_CONTENT.title
		const accent = c.title ? c.accent : DEFAULT_CONTENT.accent
		const tokens: Record<string, string> = { title, accent, badge: c.badge || 'NEW', eyebrow: c.eyebrow || 'A short line of text', label: c.label, cardTitle: c.cardTitle, detail: c.detail, status: c.label, server: c.cardTitle, players: c.detail }
		const sub = (s: unknown) => (typeof s === 'string' ? s.replace(/\{(\w+)\}/g, (_, key) => tokens[key] ?? '') : s)
		const fill = (raw: any): any | null => {
			if (!raw || typeof raw !== 'object') return null
			const e: any = { ...raw, id: undefined }
			for (const key of ['text', 'accent', 'label', 'title', 'detail']) if (key in e) e[key] = sub(e[key])
			// tokens that came out empty get a visible placeholder; words a recipe wrote out (tags such as A and B) stay
			const blank = !String(e.text ?? '').trim()
			if (e.type === 'headline' && blank) Object.assign(e, { text: title, accent })
			if (e.type === 'badge' && blank) e.text = tokens.badge
			if (e.type === 'text' && blank) e.text = tokens.eyebrow
			if (e.type === 'card') {
				// the card always shows this design's own lines; recipes written for earlier versions used other field names
				const { status: _s, statusColor, server: _v, players: _p, playersLabel: _l, ...rest } = e
				return { ...rest, labelColor: rest.labelColor ?? statusColor, label: c.label, title: c.cardTitle, detail: c.detail, icon: typeof rest.icon === 'string' ? rest.icon : '' }
			}
			if (e.type === 'stack') e.children = (Array.isArray(raw.children) ? raw.children : []).map(fill).filter(Boolean)
			return e
		}
		const elements = (r.elements ?? []).map(fill).filter(Boolean).map(normEl).filter(Boolean) as El[]
		const { src: _src, ...bg } = (r.background ?? {}) as Record<string, unknown>
		updateSel(d => ({ ...d, recipe: r.id, elements, background: normBg({ ...d.background, ...bg }) }))
		setSel(null)
		setNote(`Applied the "${r.name}" recipe${r.when ? `: ${r.when}` : '.'}`)
	}
	const onDetach = (id: string) =>
		updateSel(d => {
			const parent = parentOf(d.elements, id)
			const child = parent?.children.find(c => c.id === id)
			if (!parent || !child) return d
			const P = PRESETS[d.preset]
			const free = freeEl(child, parent, boxesRef.current[id], P.w, P.h)
			const rest = parent.children.filter(c => c.id !== id)
			const i = d.elements.findIndex(e => e.id === parent.id)
			const elements = d.elements.slice()
			elements.splice(i, 1, ...(rest.length ? [{ ...parent, children: rest }] : []), free)
			return { ...d, elements }
		})
	const onUngroup = (id: string) => {
		updateSel(d => {
			const stack = d.elements.find(e => e.id === id)
			if (!stack || stack.type !== 'stack') return d
			const P = PRESETS[d.preset]
			const freed = stack.children.map(c => freeEl(c, stack, boxesRef.current[c.id], P.w, P.h))
			const i = d.elements.indexOf(stack)
			const elements = d.elements.slice()
			elements.splice(i, 1, ...freed)
			return { ...d, elements }
		})
		setSel(null)
	}
	const onDuplicateEl = (id: string) => {
		const made = duplicateEl(selected.elements, id)
		if (!made.id) return
		updateSel(d => ({ ...d, elements: made.elements }))
		setSel(made.id)
	}
	const [copied, setCopied] = useState<ElStyle | null>(null)
	const onCopyStyle = (e: El) => {
		setCopied(styleOf(e))
		setNote('Style copied. Select another element and press Paste style.')
	}
	const onPasteStyle = (id: string) => copied && updateSel(d => ({ ...d, elements: mapEl(d.elements, id, e => pasteStyle(e, copied)) }))
	const onOrder = (id: string, to: 'front' | 'back') => updateSel(d => ({ ...d, elements: moveEl(d.elements, id, to) }))

	// ---------- panel and preview sizing ----------
	const rootRef = useRef<HTMLDivElement>(null)
	const [rootH, setRootH] = useState(800)
	useEffect(() => {
		const el = rootRef.current
		if (!el) return
		const observer = new ResizeObserver(([entry]) => setRootH(Math.floor(entry.contentRect.height)))
		observer.observe(el)
		return () => observer.disconnect()
	}, [])
	// a short panel scrolls as one page, so the preview is not squeezed between fixed bars
	const short = rootH < 660
	const previewRef = useRef<HTMLDivElement>(null)
	const [pw, setPw] = useState(520)
	useEffect(() => {
		const el = previewRef.current
		if (!el) return
		const observer = new ResizeObserver(([entry]) => setPw(Math.max(160, Math.floor(entry.contentRect.width))))
		observer.observe(el)
		return () => observer.disconnect()
	}, [empty])
	const maxH = p.shape === 'tall' ? 600 : 500
	const k = Math.min(pw / p.w, maxH / p.h)
	const vw = Math.round(p.w * k)
	const vh = Math.round(p.h * k)
	const groups = Array.from(new Set(plat.zones.map(z => z.group)))
	const overlayValue = overlay === 'safe' || overlay === 'off' || groups.includes(overlay) ? overlay : 'safe'

	// cards grouped by set, in first-seen order
	const sets = useMemo(() => {
		const out: { name: string; designs: Design[] }[] = []
		for (const d of doc.designs) {
			const name = d.set || 'Ungrouped'
			const g = out.find(x => x.name === name)
			if (g) g.designs.push(d)
			else out.push({ name, designs: [d] })
		}
		return out
	}, [doc.designs])
	const changedIds = changes ? [...changes.added, ...changes.changed] : []
	const changedEls = changes?.elements[selected.id] ?? []

	// ---------- pieces ----------
	const line = (color: string, ...children: any[]) => h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: `1px solid ${LINE}`, background: color, fontSize: 11, color: DIM, flex: 'none', flexWrap: 'wrap' } }, ...children)
	// up to two lines, so the part that says what happens next is not cut off
	const grow = (text: string, title?: string) => h('span', { title: title ?? text, style: { flex: 1, minWidth: 160, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' } }, text)
	const short80 = (text: string) => (text.length > 80 ? `${text.slice(0, 78)}...` : text)

	const errorLine = saveErr ? line('var(--kp-error-bg)', h('span', { style: { flex: 1, minWidth: 120, color: RED, overflowWrap: 'anywhere' } }, saveErr), h(Btn, { label: 'Dismiss', onClick: () => setSaveErr('') })) : null

	const pendingLine = pending
		? line(
				'rgba(255,138,31,0.06)',
				h('span', { className: 'kino-thumbs-pulse', style: { width: 6, height: 6, borderRadius: 3, background: EMBER, flex: 'none' } }),
				grow(
					pending.copied
						? `Prompt copied: "${short80(pending.ask)}". Paste it into the chat and send it. ${pending.what} on its own.`
						: `Sent to the agent: "${short80(pending.ask)}". ${pending.what} on its own, no reload needed.${pending.status ? ` Status: ${pending.status}.` : ''}`,
					`${pending.ask}\n\n${pending.what}.`,
				),
				pending.requestId ? h(Btn, { label: 'Status', title: 'Ask Kino how the request is doing', onClick: checkPending }) : null,
				doc.chatId ? h(Btn, { label: 'Open chat', title: 'See what the agent is doing and reply to it', onClick: () => openChat() }) : null,
				h(Btn, { label: 'Dismiss', onClick: () => setPending(null) }),
			)
		: null

	const changesLine = changes
		? line(
				'rgba(74,222,128,0.07)',
				h('span', { style: { width: 6, height: 6, borderRadius: 3, background: GREEN, flex: 'none' } }),
				grow(
					`Designs updated from the project file: ${[changes.added.length ? `${changes.added.length} new` : '', changes.changed.length ? `${changes.changed.length} changed` : '', changes.removed ? `${changes.removed} removed` : ''].filter(Boolean).join(', ')}. Your own unsaved edits were kept. Green marks show what changed.`,
				),
				changedIds.length && !changedIds.includes(selected.id) ? h(Btn, { label: 'Show', onClick: () => setSelId(changedIds[0]) }) : null,
				h(Btn, { label: 'Got it', onClick: () => setChanges(null) }),
			)
		: null

	const [bridgeOpen, setBridgeOpen] = useState(false)
	const bridgeOff = bridge.bridge !== 'ok' && bridge.bridge !== 'checking'
	const bridgeLine = bridgeOff
		? h(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
				h(
					'div',
					{ style: { fontSize: 11, color: DIM, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
					h('span', null, `${bridge.bridge === 'offline' ? 'The bridge is not running' : bridge.bridge === 'outdated' ? 'The bridge needs an update' : 'The bridge is not connected'}, so saving into Kino and one-click prompts are off. Designing, Download and Copy work without it.`),
					h(Btn, { label: bridgeOpen ? 'Hide' : bridge.bridge === 'unpaired' || bridge.bridge === 'pairing' ? 'Connect...' : 'Set up...', onClick: () => setBridgeOpen(v => !v) }),
				),
				bridgeOpen ? h(BridgeCard, { bridge: bridge.bridge, note: bridge.note, uses: 'Saving thumbnails into Kino', onPair: bridge.pair, onRetry: bridge.check, compact: true }) : null,
			)
		: bridge.ready && !canPrompt
			? h('div', { style: { fontSize: 11, color: DIM } }, `This bridge is older and cannot send prompts, so they are copied for you to paste. ${UPDATE_BRIDGE_HINT} `, h('code', { style: { fontFamily: MONO, color: TEXT } }, UPDATE_BRIDGE))
			: bridge.ready && bridge.note
				? h('div', { style: { fontSize: 11, color: RED } }, bridge.note)
				: null

	const header = h(
		'div',
		{ style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${LINE}`, flex: 'none', flexWrap: 'wrap' } },
		h('div', { style: { fontWeight: 600, fontSize: 13, flex: 'none' } }, 'Thumbnails'),
		h('span', { style: { ...label, flex: 'none' } }, 'Video title'),
		// the title feeds the complement check, the feed mock-ups and every prompt
		h('input', { value: doc.videoTitle, placeholder: 'The title viewers will read next to the thumbnail', onChange: (e: any) => update(d => ({ ...d, videoTitle: e.target.value })), style: { ...input, flex: '1 1 160px', width: 'auto' }, spellCheck: false }),
		doc.chatId && !pending ? h(Btn, { label: 'Thumbnails chat', title: 'Open the chat the panel sends prompts to', onClick: () => openChat() }) : null,
	)

	const dialogNode = dialog
		? h(PromptDialog, {
				mode: 'set',
				preset: selected.preset,
				set: `Set ${sets.length + 1}`,
				canPrompt,
				busy: !!working,
				onSend: onSendNew,
				onLayout,
				onClose: () => setDialog(false),
			})
		: null

	const shell = (...children: any[]) =>
		h(
			'div',
			{ ref: rootRef, style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: BG, color: TEXT, fontFamily: UI_FONT, fontSize: 12, overflow: 'hidden' } },
			h(MediaLoaders, { ids: mediaIds, onMedia }),
			dialogNode,
			...children,
		)

	// ---------- a project without designs ----------
	if (empty)
		return shell(
			header,
			errorLine,
			pendingLine,
			h(
				'div',
				{ className: 'kino-thumbs-scroll', style: { flex: 1, minHeight: 0, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' } },
				h(
					'div',
					{ style: { width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 10 } },
					broken ? h('div', { style: { color: RED, lineHeight: 1.5 } }, 'The designs file (/thumbs/designs.json) is not valid JSON, so it cannot be shown. Fix it or undo in Kino. Nothing you make here is saved over it while it is broken.') : null,
					h('div', { style: { fontSize: 15, fontWeight: 600, color: 'var(--kp-strong)' } }, 'No thumbnails yet'),
					h('div', { style: { color: DIM, lineHeight: 1.5 } }, 'Describe a set and let the agent design it for each platform, or start from a layout and edit it by hand. Set your logo, colors and fonts below first if you want them used from the start.'),
					h(
						'div',
						{ style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
						h(Btn, { label: 'Describe a set...', primary: true, onClick: () => setDialog(true) }),
						...(Object.keys(LAYOUTS) as LayoutId[]).map(id => h(Btn, { key: id, label: `Start: ${LAYOUTS[id]}`, title: 'One 16:9 design from this layout. Add the other sizes with All sizes.', onClick: () => onLayout(['youtube'], id, 'Set 1'), style: { height: 26, lineHeight: '24px' } })),
					),
					note ? h('div', { style: { fontSize: 11, color: note.startsWith('Failed') ? RED : DIM } }, note) : null,
					bridgeLine,
				),
				h('div', { style: { width: '100%', maxWidth: 520 } }, h(BrandTab, { brand, exists: brandExists, update: updateBrand, assets, media })),
			),
		)

	const stripActions = h(
		'div',
		{ style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px 0', flexWrap: 'wrap', flex: 'none' } },
		h('span', { style: { fontSize: 11, color: DIM, flex: 1, minWidth: 120 } }, many ? `${pickedDesigns.length} selected` : `${plural(doc.designs.length, 'design')}. ${IS_MAC ? 'Cmd' : 'Ctrl'}-click or Shift-click to select several.`),
		many ? h(Btn, { label: 'Clear selection', onClick: () => setPicked([]) }) : null,
		h(Btn, { label: many ? `Duplicate ${pickedDesigns.length}` : 'Duplicate', onClick: onDuplicate }),
		many ? null : h(Btn, { label: 'All sizes', title: 'Add this design at the sizes its set is missing', onClick: onAllSizes }),
		h(Btn, { label: many ? `Delete ${pickedDesigns.length}` : 'Delete', onClick: onDelete }),
	)
	const strip = h(
		'div',
		{ className: 'kino-thumbs-scroll', style: { display: 'flex', gap: 14, padding: '8px 12px', borderBottom: `1px solid ${LINE}`, overflowX: 'auto', alignItems: 'flex-start', flex: 'none' } },
		...sets.map(g =>
			h(
				'div',
				{ key: g.name, style: { display: 'flex', flexDirection: 'column', gap: 4, flex: 'none' } },
				h(
					'div',
					{ title: 'Click to select every design in this set', onClick: () => setPicked(g.designs.map(d => d.id)), style: { ...label, display: 'flex', gap: 6, alignItems: 'center', paddingLeft: 2, cursor: 'pointer' } },
					g.name,
					h('span', { style: { color: 'rgba(var(--kp-ink),.3)', fontWeight: 400 } }, String(g.designs.length)),
				),
				h('div', { style: { display: 'flex', gap: 6 } }, ...g.designs.map(d => h(Card, { key: d.id, d, assets, brand, active: d.id === selected.id, picked: many && picked.includes(d.id), changed: changedIds.includes(d.id), onPick: pickCard }))),
			),
		),
	)

	const body = h(
		'div',
		{ className: 'kino-thumbs-scroll', style: { flex: short ? 'none' : 1, minHeight: 0, overflow: short ? 'visible' : 'auto', display: 'flex', flexWrap: 'wrap', gap: 16, padding: 12, alignContent: 'flex-start' } },
		h(
			'div',
			{ ref: previewRef, style: { flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 } },
			h(
				'div',
				{ style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
				h('span', { style: { color: DIM } }, `${p.label} · ${p.w}x${p.h}`),
				h('span', { style: { marginLeft: 'auto', ...label } }, 'Overlay'),
				h(
					'div',
					{ style: { width: 150 } },
					h(Select, {
						value: overlayValue,
						options: [{ value: 'safe', label: 'Safe area' }, ...groups.map(g => ({ value: g, label: `${g} UI` })), { value: 'off', label: 'Off' }],
						onChange: setOverlay,
					}),
				),
			),
			h('div', { style: { display: 'flex', justifyContent: 'center' } }, h(Preview, { design: selected, assets, brand, width: vw, height: vh, safe: plat.safe, zones: plat.zones, overlay: overlayValue, sel, setSel, onChange: updateSel, boxesRef, changed: changedEls, onDuplicate: onDuplicateEl })),
			!ready ? h('div', { style: { color: DIM, fontSize: 11 } }, 'Loading images and fonts...') : null,
			...warnings.map((text, i) => h('div', { key: i, style: { color: 'var(--kp-amber)', fontSize: 11, lineHeight: 1.45 } }, text)),
			overlayValue !== 'off' ? h('div', { style: { color: DIM, fontSize: 11, lineHeight: 1.45 } }, overlayValue === 'safe' ? 'Dashed line: safe area for every platform UI at this size. Red: covered by platform UI. Outlined words sit somewhere they may be hidden.' : `${overlayValue} UI on top of the thumbnail. Yellow dashed: soft, sometimes covered.`) : null,
		),
		h(
			'div',
			{ style: { flex: '1 1 320px', maxWidth: 560, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 } },
			h(Segmented, {
				value: tab,
				options: [
					{ value: 'edit', label: 'Edit' },
					{ value: 'brand', label: 'Brand' },
					{ value: 'check', label: flags ? `Check (${flags})` : 'Check' },
					{ value: 'feed', label: 'Feed', title: 'How it looks in the feed, at real sizes' },
					{ value: 'guide', label: 'Guide' },
				],
				onChange: setTab,
			}),
			tab === 'edit'
				? h(EditTab, {
						// a fresh tab per design, so its layout choice and an open picker do not carry over
						key: selected.id,
						d: selected,
						brand,
						assets,
						media,
						update: updateSel,
						sel,
						setSel,
						rules,
						advanced,
						setAdvanced: (on: boolean) => setStored(prev => ({ ...prev, advanced: on })),
						picked: many ? pickedDesigns.length : 1,
						onSetName,
						changed: changedEls,
						copied,
						onCopyStyle,
						onPasteStyle,
						onDuplicate: onDuplicateEl,
						onOrder,
						onApply,
						onDetach,
						onUngroup,
					})
				: tab === 'brand'
					? h(BrandTab, { brand, exists: brandExists, update: updateBrand, assets, media })
					: tab === 'check'
						? h(CheckTab, { checks, busy: busy || !current, error: renderErr, rules, onAskFix, canAsk: !working })
						: tab === 'feed'
							? h(FeedTab, { d: selected, src: current?.feed ?? null, videoTitle: doc.videoTitle, seconds, brand })
							: h(GuideTab, { rules, preset: selected.preset }),
		),
	)

	const exportBar = h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderTop: `1px solid ${LINE}`, flex: 'none' } },
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
			h('div', { style: { width: 130 } }, h(Segmented, { value: format, options: [{ value: 'auto', label: 'JPEG', title: `JPEG, compressed to stay under the ${p.limitMB} MB upload limit` }, { value: 'png', label: 'PNG', title: 'Lossless PNG' }], onChange: v => setFormat(v as 'auto' | 'png') })),
			h('div', { style: { width: 190 } }, h(Segmented, { value: String(scale), options: [{ value: '1', label: `${p.w}x${p.h}` }, { value: '2', label: `${p.w * 2}x${p.h * 2}` }], onChange: v => setScale(Number(v)) })),
			canSave ? h('label', { style: { display: 'flex', alignItems: 'center', gap: 5, color: DIM, fontSize: 11 } }, h('input', { type: 'checkbox', checked: importToLib, onChange: (e: any) => setImportToLib(e.target.checked) }), 'Import into library') : null,
			h('div', { style: { flex: 1 } }),
			h(Btn, { label: 'Copy PNG', onClick: onCopy, disabled: !ready || !!working }),
			h(Btn, { label: 'Download', onClick: onDownload, disabled: !ready || !!working }),
			h(Btn, { label: many ? `Export selected (${exportList.length})` : `Export all (${exportList.length})`, title: canSave ? 'Save each one into Kino' : 'Download each one', onClick: onAll, disabled: !!working }),
			h(Btn, { label: working || 'Save to Kino', title: canSave ? 'Write the file to the Thumbnails folder and import it into the library' : 'Needs the bridge', primary: true, onClick: onSave, disabled: !ready || !!working || !canSave }),
		),
		note ? h('div', { style: { fontSize: 11, color: note.startsWith('Failed') ? RED : DIM, overflowWrap: 'anywhere' } }, note) : null,
		bridgeLine,
		canSave && saved.length
			? h(
					'div',
					{ className: 'kino-thumbs-scroll', style: { display: 'flex', gap: 6, overflowX: 'auto', alignItems: 'center' } },
					h('span', { style: { ...label, flex: 'none' } }, 'Saved'),
					...saved.map(item =>
						h('img', {
							key: item.file,
							src: urls.current.get(item.file),
							title: `${item.title ?? item.name} · ${item.width}x${item.height} · ${fmtBytes(item.bytes)}${item.mediaId ? ' · in library' : ''}`,
							onClick: () => api('/thumbs/reveal', { method: 'POST', body: { file: item.file } }).catch(fail),
							style: { height: 40, borderRadius: 3, cursor: 'pointer', flex: 'none', border: `1px solid ${item.mediaId ? 'rgba(255,138,31,0.6)' : LINE}` },
						}),
					),
					h(Btn, { label: 'Open folder', title: savedDir, onClick: () => api('/thumbs/reveal', { method: 'POST', body: { projectId: pid } }).catch(fail) }),
				)
			: null,
	)

	// offscreen full-size stage used for measuring and exporting
	const stageNode = h(
		'div',
		{ ref: hostRef, 'aria-hidden': true, style: { position: 'fixed', left: -12000, top: 0, pointerEvents: 'none' } },
		stage
			? h(Thumbnail, {
					key: stage.design.preset,
					component: ThumbArt as any,
					inputProps: { design: stage.design, assets, brand, renderKey: stage.key },
					compositionWidth: PRESETS[stage.design.preset].w,
					compositionHeight: PRESETS[stage.design.preset].h,
					frameToDisplay: 0,
					durationInFrames: 1,
					fps: 30,
					style: { width: PRESETS[stage.design.preset].w, height: PRESETS[stage.design.preset].h },
				})
			: null,
	)

	const promptBar = h(PromptBar, { scope, setScope, options: scopes, canPrompt, busy: !!working, history, onForget: forget, onSend: onAsk, onCopy: onCopyPrompt, onNewSet: () => setDialog(true) })

	return shell(
		header,
		errorLine,
		promptBar,
		pendingLine,
		changesLine,
		// one tree for tall and short panels: only the scrolling element changes, so nothing remounts on resize
		h('div', { className: 'kino-thumbs-scroll', style: { flex: 1, minHeight: 0, overflow: short ? 'auto' : 'hidden', display: 'flex', flexDirection: 'column' } }, stripActions, strip, body, exportBar),
		stageNode,
	)
}
