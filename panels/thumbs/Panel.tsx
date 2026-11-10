// Thumbnails: prompt, design, check and export platform thumbnails (YouTube, Shorts/TikTok/Reels, Instagram/Reddit, X)
// from the OB:MP kit. Art is a Remotion component (thumbs/ThumbArt.tsx) built from free elements (thumbs/model.ts),
// shown live through @remotion/player's Thumbnail and edited directly in the preview. The house taste skill in
// /thumbs/skill drives the agent, the recipes and the checks. Designs live in /thumbs/designs.json.
// Built with createElement rather than JSX: generated panels currently hit React #31 with JSX.
import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Thumbnail } from '@remotion/player'
import { runAction, useFps, useTimelineDuration } from 'kino/panel'
import { ThumbArt } from '../../thumbs/ThumbArt'
import {
	BG_LABELS,
	LAYOUTS,
	PRESETS,
	adaptDesign,
	contentOf,
	flatten,
	layoutElements,
	newDesign,
	normBg,
	normEl,
	parentOf,
	type Anchor,
	type Design,
	type El,
	type LayoutId,
	type PresetId,
	type Rect,
	type StackEl,
} from '../../thumbs/model'
import { ASSET_IDS, api, apiBlob, buildFontCss, colorStats, encode, fmtBytes, measureBoxes, platformOf, rasterize, rid, runChecks, settle, shrink, slug, toBlob, toDataUrl, type Box, type Stats } from './lib'
import { BlobLoader, useBlob, useBridge, useDesignsDoc, useRules } from './hooks'
import { Preview, type BoxMap } from './preview'
import { PromptDialog, composeFix, composeMessage, findChatId } from './prompt'
import { BG, Btn, DIM, EMBER, LINE, MONO, RED, Segmented, Select, TEXT, UI_FONT, ensureCss, input, label } from './ui'
import { CheckTab, EditTab, FeedTab, GuideTab } from './views'
import { ALLOW, START_BRIDGE, START_BRIDGE_HINT } from '../platform'
import { PROJECT_ID as INSTALLED_PROJECT_ID } from '../project'

// Panels have no project-id hook; fall back to the project the panels were installed into (../project.ts)
const PROJECT_ID = new URLSearchParams(window.location.search).get('project') || INSTALLED_PROJECT_ID
const startCode = () => h('code', { style: { fontFamily: MONO, color: TEXT } }, START_BRIDGE)
type Analysis = { id: string; json: string; boxes: Box[]; stats: Stats; bytes: number; feed: string }
type Out = { blob: Blob; format: 'png' | 'jpeg'; quality: number | null; over: boolean; w: number; h: number }
type Pending = { requestId: string; what: string; set: string; at: number; status?: string }
const r1 = (n: number) => Math.round(n * 10) / 10

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

// Library images a design uses (anything that is not a built-in background key)
const mediaIdsOf = (d: Design) => {
	const ids = new Set<string>()
	if (!BG_LABELS[d.background.src]) ids.add(d.background.src)
	for (const e of flatten(d.elements)) if (e.type === 'image' && !BG_LABELS[e.src]) ids.add(e.src)
	return [...ids].filter(id => /^[\w-]{6,}$/.test(id))
}

// Put a stack item on its own, exactly where it renders now (box in composition px)
const freeEl = (child: El, parent: StackEl, box: Rect | undefined, W: number, H: number): El => {
	if (!box) return { ...child, x: parent.x, y: parent.y, anchor: parent.anchor } as El
	const y = r1(((box.y + box.h / 2) / H) * 100)
	const at: [Anchor, number] = parent.align === 'start' ? ['cl', (box.x / W) * 100] : parent.align === 'end' ? ['cr', ((box.x + box.w) / W) * 100] : ['c', ((box.x + box.w / 2) / W) * 100]
	return { ...child, anchor: at[0], x: r1(at[1]), y, rotate: (child.rotate ?? 0) + (parent.rotate ?? 0) } as El
}

const Card = ({ d, assets, active, onClick }: { d: Design; assets: Record<string, string | undefined>; active: boolean; onClick: () => void }) => {
	const p = PRESETS[d.preset]
	const ht = 64
	const w = Math.round((ht * p.w) / p.h)
	return h(
		'div',
		{ className: 'kino-thumbs-card', onClick, title: `${d.name} · ${p.label}${d.prompt ? `\n${d.prompt}` : ''}`, style: { display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer', padding: 4, borderRadius: 6, flex: 'none', border: `1px solid ${active ? EMBER : 'rgba(var(--kp-ink),0.08)'}`, background: active ? 'rgba(255,138,31,0.08)' : 'transparent' } },
		h('div', { style: { width: w, height: ht, overflow: 'hidden', borderRadius: 3, background: '#000' } }, h(Thumbnail, { component: ThumbArt as any, inputProps: { design: d, assets }, compositionWidth: p.w, compositionHeight: p.h, frameToDisplay: 0, durationInFrames: 1, fps: 30, style: { width: w, height: ht } })),
		h('div', { style: { width: Math.max(w, 64), fontSize: 10, color: active ? TEXT : DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, d.name),
	)
}

export default function Panel() {
	useEffect(ensureCss, [])
	const [note, setNote] = useState('')
	const [err, setErr] = useState('')
	const { doc, update } = useDesignsDoc(setErr)
	const rules = useRules()
	const { bridge, note: bridgeNote, pair, fail, canPrompt } = useBridge(PROJECT_ID)
	const { fps } = useFps() as { fps: number }
	const timeline = useTimelineDuration() as any
	const seconds = (timeline?.rootDurationInFrames ?? timeline?.durationInFrames ?? 0) / (fps || 30)

	// built-in kit images and any library images the designs use, as blob URLs, plus embedded fonts
	const builtIn = {
		logo: useBlob(ASSET_IDS.logo),
		keyart: useBlob(ASSET_IDS.keyart),
		tower: useBlob(ASSET_IDS.tower),
		bridge: useBlob(ASSET_IDS.bridge),
		rumare: useBlob(ASSET_IDS.rumare),
		wallpaper: useBlob(ASSET_IDS.wallpaper),
	}
	const [library, setLibrary] = useState<Record<string, string>>({})
	const onLibraryUrl = useCallback((id: string, url: string) => setLibrary(m => (m[id] === url ? m : { ...m, [id]: url })), [])
	const mediaIds = useMemo(() => [...new Set(doc.designs.flatMap(mediaIdsOf))], [doc.designs])
	const assetsKey = Object.values(builtIn).join('|') + '|' + Object.entries(library).map(([k, v]) => k + v).join('|')
	const assets = useMemo(() => ({ ...library, ...builtIn }), [assetsKey])
	const [fontsReady, setFontsReady] = useState(false)
	useEffect(() => {
		buildFontCss().then(() => setFontsReady(true))
	}, [])
	const kitReady = fontsReady && Object.values(builtIn).every(Boolean)
	const readyFor = (d: Design) => kitReady && mediaIdsOf(d).every(id => assets[id])

	const [selId, setSelId] = useState('')
	const selected = doc.designs.find(d => d.id === selId) ?? doc.designs[0]
	const p = PRESETS[selected.preset]
	const plat = platformOf(selected.preset, rules)
	const selectedJson = JSON.stringify(selected)
	const ready = readyFor(selected)
	const [sel, setSel] = useState<string | null>(null)
	useEffect(() => setSel(null), [selected.id])
	const [tab, setTab] = useState('edit')
	const [overlay, setOverlay] = useState('safe')
	const [format, setFormat] = useState<'auto' | 'png'>('auto')
	const [scale, setScale] = useState(1)
	const [importToLib, setImportToLib] = useState(true)
	const [working, setWorking] = useState('')
	const boxesRef = useRef<BoxMap>({})

	const updateSel = useCallback((fn: (d: Design) => Design) => update(x => ({ ...x, designs: x.designs.map(d => (d.id === selected.id ? fn(d) : d)) })), [update, selected.id])

	// ---------- offscreen full-size stage: one render at a time ----------
	const hostRef = useRef<HTMLDivElement>(null)
	const [stage, setStage] = useState<{ design: Design; key: string } | null>(null)
	const queue = useRef<Promise<unknown>>(Promise.resolve())
	const seq = useRef(0)
	const renderJob = useCallback((design: Design, work: (player: HTMLElement, root: HTMLElement) => Promise<any>): Promise<any> => {
		const run = async () => {
			const key = `${design.id}:${++seq.current}`
			setStage({ design, key })
			const root = await settle(hostRef.current!, key)
			return work(hostRef.current!.querySelector('.__remotion-player') as HTMLElement, root)
		}
		const job = queue.current.then(run, run)
		queue.current = job.catch(() => {})
		return job
	}, [])

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
				const canvas = await rasterize(player, 1)
				const jpeg = await toBlob(canvas, 'image/jpeg', 0.92)
				return { id: design.id, json: JSON.stringify(design), boxes, stats: colorStats(canvas), bytes: jpeg.size, feed: shrink(canvas, 760).toDataURL('image/jpeg', 0.9) }
			})
				.then(result => {
					if (!live) return
					setAnalysis(result)
					setErr('')
				})
				.catch(error => live && setErr(`Render failed: ${error instanceof Error ? error.message : String(error)}`))
				.finally(() => live && setBusy(false))
		}, 450)
		return () => {
			live = false
			clearTimeout(timer)
		}
	}, [ready, selectedJson, renderJob, assets])

	const current = analysis && analysis.id === selected.id ? analysis : null
	const ytCount = doc.designs.filter(d => d.preset === 'youtube').length
	const checks = useMemo(
		() => (current ? runChecks({ design: selected, boxes: current.boxes, stats: current.stats, bytes: current.bytes, videoTitle: doc.videoTitle, videoSeconds: seconds, ytCount, rules }) : []),
		[current, selectedJson, doc.videoTitle, seconds, ytCount, rules],
	)
	const flags = checks.filter(c => c.level === 'fail' || c.level === 'warn').length

	// ---------- busy wrapper ----------
	const act = async (text: string, fn: () => Promise<string>) => {
		if (working) return
		setWorking(text)
		setNote('')
		try {
			setNote(await fn())
		} catch (error) {
			setNote(`Failed: ${fail(error)}`)
		} finally {
			setWorking('')
		}
	}

	// ---------- the agent ----------
	const [prompt, setPrompt] = useState<null | 'set' | 'one'>(null)
	const [pending, setPending] = useState<Pending | null>(null)
	const known = useRef<Set<string>>(new Set(doc.designs.map(d => d.id)))
	useEffect(() => {
		const fresh = doc.designs.filter(d => !known.current.has(d.id))
		for (const d of fresh) known.current.add(d.id)
		if (!fresh.length || !pending) return
		setSelId(fresh[0].id)
		setNote(`The agent added ${fresh.length} design${fresh.length > 1 ? 's' : ''}${fresh[0].set ? ` to "${fresh[0].set}"` : ''}.`)
	}, [doc.designs])

	const openChat = (chatId?: string) => {
		const id = chatId ?? doc.chatId
		if (id) runAction('chat::OpenInNewTab', { chatId: id }, { source: 'button' }).catch(error => setNote(`Failed: ${fail(error)}`))
	}

	// One-click through the bridge when it supports prompts; otherwise copy the prompt and open a chat tab
	const sendToAgent = async (message: string, what: string, set: string): Promise<string> => {
		let bridgeError = ''
		if (canPrompt) {
			try {
				const r = await api('/thumbs/prompt', { method: 'POST', body: { projectId: PROJECT_ID, chatId: doc.chatId, message } })
				if (r.chatId && r.chatId !== doc.chatId) update(x => ({ ...x, chatId: r.chatId }))
				setPending({ requestId: r.requestId ?? '', what, set, at: Date.now() })
				return `Sent to the agent${r.created ? ' in a new Thumbnails chat' : ''}. ${what}`
			} catch (error) {
				// fall back to copy and paste so the brief is never lost
				bridgeError = `One-click send failed (${fail(error)}). `
			}
		}
		try {
			await navigator.clipboard.writeText(message)
		} catch {
			throw new Error(`${bridgeError}Could not copy the prompt either. Use Copy prompt instead.`)
		}
		let chatId: string | null = doc.chatId ?? null
		try {
			if (!chatId) {
				chatId = findChatId(await runAction('chat::NewChat', { projectId: PROJECT_ID }, { source: 'button' }))
				if (chatId) update(x => ({ ...x, chatId: chatId! }))
			}
			if (chatId) await runAction('chat::OpenInNewTab', { chatId }, { source: 'button' })
		} catch {}
		setPending({ requestId: '', what, set, at: Date.now() })
		return bridgeError + (chatId ? 'Prompt copied. Paste it into the chat tab that just opened and send it.' : 'Prompt copied. Paste it into a new chat in this project and send it.')
	}

	const checkPending = () =>
		pending?.requestId &&
		api(`/thumbs/prompt/status?requestId=${encodeURIComponent(pending.requestId)}`)
			.then(r => setPending(x => (x ? { ...x, status: String(r.status ?? r.state ?? 'unknown') } : x)))
			.catch(error => setNote(`Failed: ${fail(error)}`))

	const onSendPrompt = (ask: { brief: string; presets: PresetId[]; variations: number; set: string }) => {
		const mode = prompt ?? 'set'
		const message = composeMessage({ mode, ...ask, videoTitle: doc.videoTitle, seconds, projectId: PROJECT_ID, current: mode === 'one' ? selected : null })
		const n = ask.presets.length * ask.variations
		act('Sending', () => sendToAgent(message, `${n} design${n > 1 ? 's' : ''} for "${ask.set}" will appear here as the agent writes them.`, ask.set)).then(() => setPrompt(null))
	}
	const onAskFix = () => act('Sending', () => sendToAgent(composeFix(selected, checks, PROJECT_ID), `It will update "${selected.name}" in place.`, selected.set))

	// ---------- export ----------
	const exportOne = (design: Design): Promise<Out> =>
		renderJob(design, async player => {
			const canvas = await rasterize(player, scale)
			const out = await encode(canvas, format, PRESETS[design.preset].limitMB)
			return { ...out, w: canvas.width, h: canvas.height }
		})
	const fileName = (design: Design, out: Out) => `${slug(design.name)}-${out.w}x${out.h}.${out.format === 'png' ? 'png' : 'jpg'}`
	const describe = (out: Out) => `${out.w}x${out.h} ${out.format.toUpperCase()}${out.quality ? ` q${out.quality}` : ''}, ${fmtBytes(out.blob.size)}${out.over ? ` (over the ${PRESETS[selected.preset].limitMB} MB limit)` : ''}`
	const saveKino = async (design: Design, out: Out) =>
		api('/thumbs/save', {
			method: 'POST',
			body: { projectId: PROJECT_ID, name: design.name, format: out.format, data: await toDataUrl(out.blob), preset: design.preset, width: out.w, height: out.h, design, import: importToLib },
		})

	const [saved, setSaved] = useState<any[]>([])
	const [savedDir, setSavedDir] = useState('')
	const urls = useRef(new Map<string, string>())
	const loadSaved = useCallback(() => {
		api(`/thumbs/list?projectId=${encodeURIComponent(PROJECT_ID)}&n=12`)
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
	}, [fail])
	useEffect(() => {
		if (bridge === 'ok') loadSaved()
	}, [bridge, loadSaved])

	const onSave = () =>
		act('Saving', async () => {
			const out = await exportOne(selected)
			const result = await saveKino(selected, out)
			loadSaved()
			return `Saved ${describe(out)}${result.mediaId ? ', imported into the Thumbnails bin' : result.importError ? `. Import failed: ${result.importError}` : ''}`
		})
	const onDownload = () =>
		act('Rendering', async () => {
			const out = await exportOne(selected)
			download(out.blob, fileName(selected, out))
			return `Downloaded ${describe(out)}`
		})
	const onCopy = () =>
		act('Copying', async () => {
			const png: Blob = await renderJob(selected, async player => toBlob(await rasterize(player, scale), 'image/png'))
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
			return `Copied a ${fmtBytes(png.size)} PNG`
		})
	const onAll = () =>
		act('Exporting all', async () => {
			let n = 0
			for (const design of doc.designs) {
				setWorking(`Exporting ${++n} of ${doc.designs.length}`)
				const out = await exportOne(design)
				if (bridge === 'ok') await saveKino(design, out)
				else download(out.blob, fileName(design, out))
			}
			if (bridge === 'ok') loadSaved()
			return bridge === 'ok' ? `Saved ${n} thumbnails${importToLib ? ' and imported them into the Thumbnails bin' : ''}` : `Downloaded ${n} thumbnails`
		})

	// ---------- design list ----------
	const addMany = (designs: Design[]) => {
		for (const d of designs) known.current.add(d.id)
		update(x => ({ ...x, designs: [...x.designs, ...designs] }))
		if (designs[0]) setSelId(designs[0].id)
	}
	const onLayout = (presets: PresetId[], layout: LayoutId, set: string) => {
		const words = contentOf(selected)
		addMany(
			presets
				.map(preset => newDesign(preset, layout, { name: `${LAYOUTS[layout]} · ${PRESETS[preset].short}`, set }, words))
				.map(d => ({ ...d, background: normBg({ ...selected.background, shade: d.background.shade, shadeAmount: d.background.shadeAmount }) })),
		)
		setPrompt(null)
		setNote(`Added ${presets.length} from the ${LAYOUTS[layout]} layout to "${set}".`)
	}
	const onDuplicate = () => addMany([{ ...selected, id: rid(), name: `${selected.name} copy`, elements: selected.elements.map(e => normEl({ ...e, id: undefined, children: e.type === 'stack' ? e.children.map(c => ({ ...c, id: undefined })) : undefined })!) }])
	const onDelete = () => {
		if (doc.designs.length < 2) return
		const i = doc.designs.findIndex(d => d.id === selected.id)
		update(x => ({ ...x, designs: x.designs.filter(d => d.id !== selected.id) }))
		setSelId(doc.designs[Math.max(0, i - 1)]?.id ?? '')
	}
	const onAllSizes = () => {
		const have = new Set(doc.designs.filter(d => d.set === selected.set && d.name.replace(/ · [^·]+$/, '') === selected.name.replace(/ · [^·]+$/, '')).map(d => d.preset))
		const made = (Object.keys(PRESETS) as PresetId[]).filter(preset => !have.has(preset)).map(preset => adaptDesign(selected, preset))
		if (!made.length) {
			setNote('This design already has every size in its set.')
			return
		}
		for (const d of made) known.current.add(d.id)
		update(x => ({ ...x, designs: [...x.designs, ...made] }))
		setNote(`Added ${made.map(d => PRESETS[d.preset].short).join(', ')}. Built-in layouts re-flow; free layouts keep their positions inside the safe area, so check each one.`)
	}

	// ---------- edit helpers ----------
	const onApply = (id: string) => {
		const c = contentOf(selected)
		if (id in LAYOUTS) {
			const made = layoutElements(id as LayoutId, selected.preset, c)
			updateSel(d => ({ ...d, recipe: id, elements: made.elements, background: { ...d.background, shade: made.shade, shadeAmount: made.shadeAmount } }))
			setSel(null)
			return
		}
		const r = rules?.recipes?.find(x => x.id === id)
		if (!r) return
		const tokens: Record<string, string> = { title: c.title, accent: c.accent, badge: c.badge, eyebrow: c.eyebrow, status: c.status, server: c.server, players: c.players }
		const sub = (s: unknown) => (typeof s === 'string' ? s.replace(/\{(\w+)\}/g, (_, key) => tokens[key] ?? '') : s)
		const fill = (raw: any): any | null => {
			if (!raw || typeof raw !== 'object') return null
			const e: any = { ...raw, id: undefined }
			for (const key of ['text', 'accent', 'status', 'server', 'players']) if (key in e) e[key] = sub(e[key])
			const literal = (v: unknown) => typeof raw[v as string] === 'string' && !raw[v as string].includes('{')
			// keep this design's words in the recipe's composition
			if (e.type === 'headline' && c.title && literal('text')) Object.assign(e, { text: c.title, accent: c.accent })
			if (e.type === 'badge' && c.badge && literal('text')) e.text = c.badge
			if (e.type === 'text' && c.eyebrow && literal('text')) e.text = c.eyebrow
			if (e.type === 'card') Object.assign(e, { status: c.status, server: c.server, players: c.players })
			if ((e.type === 'headline' || e.type === 'text' || e.type === 'badge') && !String(e.text ?? '').trim()) return null
			if (e.type === 'stack') e.children = (raw.children ?? []).map(fill).filter(Boolean)
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

	// ---------- preview sizing ----------
	const previewRef = useRef<HTMLDivElement>(null)
	const [pw, setPw] = useState(520)
	useEffect(() => {
		const el = previewRef.current
		if (!el) return
		const observer = new ResizeObserver(([entry]) => setPw(Math.max(200, Math.floor(entry.contentRect.width))))
		observer.observe(el)
		return () => observer.disconnect()
	}, [])
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

	const bridgeLine =
		bridge === 'ok'
			? canPrompt
				? null
				: h('div', { style: { fontSize: 11, color: DIM } }, 'Prompting copies the message for you to paste. For one-click sending, restart the bridge: in its window press Ctrl+C, then run ', startCode(), ' again.')
			: h(
					'div',
					{ style: { fontSize: 11, color: DIM, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
					bridge === 'outdated'
						? h('span', null, 'Save to Kino needs the updated bridge. In its window press Ctrl+C, then run ', startCode(), ' again. Download and Copy work now.')
						: bridge === 'offline'
							? h('span', null, `Bridge not running, so saving into Kino is off. Download and Copy work now. ${START_BRIDGE_HINT}`)
							: bridge === 'unpaired' || bridge === 'pairing'
								? h('span', { style: { display: 'flex', gap: 8, alignItems: 'center' } }, 'Connect the bridge to save into Kino.', h(Btn, { label: bridge === 'pairing' ? `Waiting for ${ALLOW}...` : 'Connect', onClick: pair, disabled: bridge === 'pairing' }))
								: 'Checking the bridge...',
					bridgeNote ? h('span', { style: { color: RED } }, bridgeNote) : null,
				)

	const pendingLine = pending
		? h(
				'div',
				{ style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: `1px solid ${LINE}`, background: 'rgba(255,138,31,0.06)', fontSize: 11, color: DIM, flex: 'none' } },
				h('span', { style: { width: 6, height: 6, borderRadius: 3, background: EMBER, flex: 'none' } }),
				h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `Agent: ${pending.what}${pending.status ? ` Status: ${pending.status}.` : ''}`),
				pending.requestId ? h(Btn, { label: 'Status', onClick: checkPending }) : null,
				doc.chatId ? h(Btn, { label: 'Open chat', onClick: () => openChat() }) : null,
				h(Btn, { label: 'Dismiss', onClick: () => setPending(null) }),
			)
		: null

	return h(
		'div',
		{ style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: BG, color: TEXT, fontFamily: UI_FONT, fontSize: 12, overflow: 'hidden' } },
		h(BlobLoaders, { ids: mediaIds, onUrl: onLibraryUrl }),
		prompt
			? h(PromptDialog, {
					key: prompt,
					mode: prompt,
					preset: selected.preset,
					set: prompt === 'one' ? selected.set || 'Ungrouped' : `Set ${sets.length + 1}`,
					canPrompt,
					busy: !!working,
					onSend: onSendPrompt,
					onLayout,
					onClose: () => setPrompt(null),
				})
			: null,
		// header: video title (for the complement check, feed mock-ups and the agent)
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${LINE}` } },
			h('div', { style: { fontWeight: 600, fontSize: 13, flex: 'none' } }, 'Thumbnails'),
			h('span', { style: { ...label, flex: 'none' } }, 'Video title'),
			h('input', { value: doc.videoTitle, placeholder: 'The title viewers will read next to the thumbnail', onChange: (e: any) => update(d => ({ ...d, videoTitle: e.target.value })), style: { ...input, flex: 1 }, spellCheck: false }),
			doc.chatId && !pending ? h(Btn, { label: 'Thumbnails chat', title: 'Open the chat the panel sends prompts to', onClick: () => openChat() }) : null,
		),
		pendingLine,
		// design actions: always visible, outside the scrolling strip
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px 0', flexWrap: 'wrap', flex: 'none' } },
			h(Btn, { label: '+ New set', title: 'Describe a set and let the agent design it for each platform', onClick: () => setPrompt('set'), style: { borderColor: 'rgba(255,138,31,.45)', color: EMBER } }),
			h(Btn, { label: '+ New thumbnail', title: 'Describe one thumbnail and let the agent design it', onClick: () => setPrompt('one') }),
			h('div', { style: { flex: 1 } }),
			h(Btn, { label: 'Duplicate', onClick: onDuplicate }),
			h(Btn, { label: 'All sizes', title: 'Add this design at the sizes its set is missing', onClick: onAllSizes }),
			h(Btn, { label: 'Delete', onClick: onDelete, disabled: doc.designs.length < 2 }),
		),
		// design strip, grouped by set
		h(
			'div',
			{ className: 'kino-thumbs-scroll', style: { display: 'flex', gap: 14, padding: '8px 12px', borderBottom: `1px solid ${LINE}`, overflowX: 'auto', alignItems: 'flex-start', flex: 'none' } },
			...sets.map(g =>
				h(
					'div',
					{ key: g.name, style: { display: 'flex', flexDirection: 'column', gap: 4, flex: 'none' } },
					h('div', { style: { ...label, display: 'flex', gap: 6, alignItems: 'center', paddingLeft: 2 } }, g.name, h('span', { style: { color: 'rgba(var(--kp-ink),.3)', fontWeight: 400 } }, String(g.designs.length))),
					h('div', { style: { display: 'flex', gap: 6 } }, ...g.designs.map(d => h(Card, { key: d.id, d, assets, active: d.id === selected.id, onClick: () => setSelId(d.id) }))),
				),
			),
		),
		// body: preview + tabs
		h(
			'div',
			{ className: 'kino-thumbs-scroll', style: { flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexWrap: 'wrap', gap: 16, padding: 12, alignContent: 'flex-start' } },
			h(
				'div',
				{ ref: previewRef, style: { flex: '1 1 420px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 8 } },
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
				h(
					'div',
					{ style: { display: 'flex', justifyContent: 'center' } },
					h(Preview, { design: selected, assets, width: vw, height: vh, safe: plat.safe, zones: plat.zones, overlay: overlayValue, sel, setSel, onChange: updateSel, boxesRef }),
				),
				!ready ? h('div', { style: { color: DIM, fontSize: 11 } }, kitReady ? 'Loading a library image...' : 'Loading images and fonts...') : null,
				overlayValue !== 'off' ? h('div', { style: { color: DIM, fontSize: 11, lineHeight: 1.45 } }, overlayValue === 'safe' ? 'Dashed line: safe area for every platform UI at this size. Red: covered by platform UI. Outlined words sit somewhere they may be hidden.' : `${overlayValue} UI on top of the thumbnail. Yellow dashed: soft, sometimes covered.`) : null,
			),
			h(
				'div',
				{ style: { flex: '1 1 320px', maxWidth: 520, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 10 } },
				h(Segmented, {
					value: tab,
					options: [
						{ value: 'edit', label: 'Edit' },
						{ value: 'check', label: flags ? `Check (${flags})` : 'Check' },
						{ value: 'feed', label: 'In the feed' },
						{ value: 'guide', label: 'Guide' },
					],
					onChange: setTab,
				}),
				tab === 'edit'
					? h(EditTab, { d: selected, update: updateSel, sel, setSel, rules, onApply, onDetach, onUngroup })
					: tab === 'check'
						? h(CheckTab, { checks, busy: busy || !current, error: err, rules, onAskFix, canAsk: !working })
						: tab === 'feed'
							? h(FeedTab, { d: selected, src: current?.feed ?? null, videoTitle: doc.videoTitle, seconds })
							: h(GuideTab, { rules, preset: selected.preset }),
			),
		),
		// export bar
		h(
			'div',
			{ style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderTop: `1px solid ${LINE}`, flex: 'none' } },
			h(
				'div',
				{ style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
				h('div', { style: { width: 130 } }, h(Segmented, { value: format, options: [{ value: 'auto', label: 'JPEG', title: `JPEG, compressed to stay under the ${p.limitMB} MB upload limit` }, { value: 'png', label: 'PNG', title: 'Lossless PNG' }], onChange: v => setFormat(v as 'auto' | 'png') })),
				h('div', { style: { width: 190 } }, h(Segmented, { value: String(scale), options: [{ value: '1', label: `${p.w}x${p.h}` }, { value: '2', label: `${p.w * 2}x${p.h * 2}` }], onChange: v => setScale(Number(v)) })),
				h('label', { style: { display: 'flex', alignItems: 'center', gap: 5, color: DIM, fontSize: 11 } }, h('input', { type: 'checkbox', checked: importToLib, onChange: (e: any) => setImportToLib(e.target.checked) }), 'Import into library'),
				h('div', { style: { flex: 1 } }),
				h(Btn, { label: 'Copy PNG', onClick: onCopy, disabled: !ready || !!working }),
				h(Btn, { label: 'Download', onClick: onDownload, disabled: !ready || !!working }),
				h(Btn, { label: `Export all (${doc.designs.length})`, onClick: onAll, disabled: !kitReady || !!working }),
				h(Btn, { label: working || 'Save to Kino', primary: true, onClick: onSave, disabled: !ready || !!working || bridge !== 'ok' }),
			),
			note ? h('div', { style: { fontSize: 11, color: note.startsWith('Failed') ? RED : DIM } }, note) : null,
			bridgeLine,
			bridge === 'ok' && saved.length
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
						h(Btn, { label: 'Open folder', title: savedDir, onClick: () => api('/thumbs/reveal', { method: 'POST', body: { projectId: PROJECT_ID } }).catch(fail) }),
					)
				: null,
		),
		// offscreen full-size stage used for measuring and exporting
		h(
			'div',
			{ ref: hostRef, 'aria-hidden': true, style: { position: 'fixed', left: -12000, top: 0, pointerEvents: 'none' } },
			stage
				? h(Thumbnail, {
						key: stage.design.preset,
						component: ThumbArt as any,
						inputProps: { design: stage.design, assets, renderKey: stage.key },
						compositionWidth: PRESETS[stage.design.preset].w,
						compositionHeight: PRESETS[stage.design.preset].h,
						frameToDisplay: 0,
						durationInFrames: 1,
						fps: 30,
						style: { width: PRESETS[stage.design.preset].w, height: PRESETS[stage.design.preset].h },
					})
				: null,
		),
	)
}

// One hidden loader per library image id
const BlobLoaders = ({ ids, onUrl }: { ids: string[]; onUrl: (id: string, url: string) => void }) => h('div', { style: { display: 'none' } }, ...ids.map(id => h(BlobLoader, { key: id, id, onUrl })))
