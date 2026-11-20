// Interactive preview: click to select, drag to move with snapping, corner handle to resize,
// arrow keys to nudge. Element boxes are measured from the rendered art ([data-el] in ThumbArt).
// Locked elements are drawn but cannot be picked, moved or deleted here: select them in the layer list.
import { createElement as h, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Thumbnail } from '@remotion/player'
import { ThumbArt } from '../../thumbs/ThumbArt'
import { PRESETS, anchorXY, findEl, flatten, mapEl, parentOf, removeEl, type Design, type El, type Rect, type Zone } from '../../thumbs/model'
import type { Brand } from '../../thumbs/ui/brand'
import { modKey } from '../platform'
import { useFontTick } from './hooks'

export type BoxMap = Record<string, Rect>
export type OverlayMode = string // 'safe' | 'off' | a zone group name

const SNAP = 6 // screen px
const ACCENT = '#ff8a1f'
const GUIDE_COLOR = '#ff4fd8'
const CHANGED_COLOR = '#4ade80'
const TEXTUAL = new Set(['headline', 'text', 'badge', 'card'])
const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

// Uniform scale: text sizes, widths, gaps, and every item of a stack
export const scaleEl = (e: El, s: number): El => {
	const w = Math.min(200, Math.max(1, r2(e.w * s)))
	switch (e.type) {
		case 'headline':
		case 'text':
		case 'badge':
		case 'emblem':
			return { ...e, w, size: Math.max(8, Math.round(e.size * s)) } as El
		case 'image':
			return { ...e, w, h: e.h ? r2(e.h * s) : e.h }
		case 'shape':
			return { ...e, w, h: Math.min(200, Math.max(0.2, r2(e.h * s))) }
		case 'stack':
			return { ...e, w, gap: r2(e.gap * s), children: e.children.map(c => scaleEl(c, s)) }
		default:
			return { ...e, w }
	}
}

type Drag = {
	kind: 'move' | 'resize'
	id: string
	cx: number
	cy: number
	el: El
	box: Rect
	moved: boolean
	anchor?: { x: number; y: number }
	v0?: { x: number; y: number }
}

type Props = {
	design: Design
	assets: Record<string, string | undefined>
	brand: Brand
	width: number
	height: number
	safe: Rect
	zones: Zone[]
	overlay: OverlayMode
	sel: string | null
	setSel: (id: string | null) => void
	onChange: (fn: (d: Design) => Design) => void
	boxesRef: { current: BoxMap }
	/** Elements to outline because someone else just changed them. */
	changed?: string[]
	onDuplicate?: (id: string) => void
}

const inside = (b: Rect, x: number, y: number, pad = 3) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad
const touches = (a: Rect, b: Rect) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1

export const Preview = (props: Props) => {
	const { design, assets, brand, width, height, safe, zones, overlay, sel, setSel, onChange, boxesRef } = props
	const p = PRESETS[design.preset]
	const fontTick = useFontTick()
	const k = width / p.w
	const ref = useRef<HTMLDivElement>(null)
	const drag = useRef<Drag | null>(null)
	const [live, setLiveState] = useState<{ id: string; el: El } | null>(null)
	// pointer events can arrive faster than renders: the drop reads the latest position from here
	const liveRef = useRef<{ id: string; el: El } | null>(null)
	const setLive = (next: { id: string; el: El } | null) => {
		liveRef.current = next
		setLiveState(next)
	}
	const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] })
	const [hover, setHover] = useState<string | null>(null)
	const [boxes, setBoxes] = useState<BoxMap>({})

	const shown: Design = live ? { ...design, elements: design.elements.map(e => (e.id === live.id ? live.el : e)) } : design
	const shownKey = JSON.stringify(shown.elements) + width + height + Object.values(assets).join('|')

	// measure every element box (screen px, relative to the preview)
	const measure = () => {
		const root = ref.current
		if (!root) return
		const base = root.getBoundingClientRect()
		const out: BoxMap = {}
		const comp: BoxMap = {}
		root.querySelectorAll('[data-el]').forEach(node => {
			const id = node.getAttribute('data-el')!
			const r = node.getBoundingClientRect()
			out[id] = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }
			comp[id] = { x: out[id].x / k, y: out[id].y / k, w: r.width / k, h: r.height / k }
		})
		boxesRef.current = comp
		setBoxes(prev => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out))
	}
	useLayoutEffect(() => {
		measure()
		const raf = requestAnimationFrame(measure)
		const t1 = setTimeout(measure, 250)
		const t2 = setTimeout(measure, 900)
		return () => {
			cancelAnimationFrame(raf)
			clearTimeout(t1)
			clearTimeout(t2)
		}
	}, [shownKey, brand, fontTick])

	const tops = design.elements.filter(e => e.visible !== false)
	const isLocked = (id: string | null) => !!id && (findEl(design.elements, id)?.locked === true || parentOf(design.elements, id)?.locked === true)
	const topOf = (id: string | null) => (id ? (parentOf(design.elements, id)?.id ?? id) : null)
	const selTop = topOf(sel)

	// top-most element under the point; a second click inside a selected stack picks the item under it
	const hit = (x: number, y: number) => {
		for (let i = tops.length - 1; i >= 0; i--) {
			const e = tops[i]
			const b = boxes[e.id]
			if (e.locked || !b || !inside(b, x, y)) continue
			if (e.type === 'stack' && selTop === e.id) {
				const child = e.children.find(c => c.visible !== false && !c.locked && boxes[c.id] && inside(boxes[c.id], x, y, 0))
				if (child) return { top: e, pick: child.id }
			}
			return { top: e, pick: e.id }
		}
		return null
	}

	const local = (ev: { clientX: number; clientY: number }) => {
		const base = ref.current!.getBoundingClientRect()
		return { x: ev.clientX - base.left, y: ev.clientY - base.top }
	}

	const onPointerDown = (ev: any) => {
		if (ev.button !== 0) return
		ref.current?.focus()
		const pt = local(ev)
		const found = hit(pt.x, pt.y)
		if (!found) {
			setSel(null)
			return
		}
		setSel(found.pick)
		const box = boxes[found.top.id]
		if (!box) return
		drag.current = { kind: 'move', id: found.top.id, cx: ev.clientX, cy: ev.clientY, el: found.top, box, moved: false }
		ev.currentTarget.setPointerCapture?.(ev.pointerId)
	}

	const onHandleDown = (ev: any) => {
		ev.stopPropagation()
		ev.preventDefault()
		const e = design.elements.find(x => x.id === selTop)
		const box = e && boxes[e.id]
		if (!e || !box || e.locked) return
		const { ax, ay } = anchorXY(e.anchor)
		const anchor = { x: (e.x / 100) * width, y: (e.y / 100) * height }
		const corner = { x: ax === 100 ? box.x : box.x + box.w, y: ay === 100 ? box.y : box.y + box.h }
		const v0 = { x: corner.x - anchor.x, y: corner.y - anchor.y }
		if (Math.hypot(v0.x, v0.y) < 4) return
		drag.current = { kind: 'resize', id: e.id, cx: ev.clientX, cy: ev.clientY, el: e, box, moved: false, anchor, v0 }
		ref.current?.setPointerCapture?.(ev.pointerId)
		ref.current?.focus()
	}

	const snapAxis = (edges: number[], targets: number[]) => {
		let best: { d: number; t: number } | null = null
		for (const a of edges)
			for (const t of targets) {
				const d = t - a
				if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t }
			}
		return best
	}

	const onPointerMove = (ev: any) => {
		const g = drag.current
		if (!g) {
			const pt = local(ev)
			const found = hit(pt.x, pt.y)
			const id = found ? found.top.id : null
			if (id !== hover) setHover(id)
			return
		}
		let dx = ev.clientX - g.cx
		let dy = ev.clientY - g.cy
		if (!g.moved && Math.hypot(dx, dy) < 3) return
		g.moved = true
		if (g.kind === 'resize') {
			const v = { x: g.v0!.x + dx, y: g.v0!.y + dy }
			const s = Math.min(6, Math.max(0.15, (v.x * g.v0!.x + v.y * g.v0!.y) / (g.v0!.x ** 2 + g.v0!.y ** 2)))
			setLive({ id: g.id, el: scaleEl(g.el, s) })
			setGuides({ x: [], y: [] })
			return
		}
		if (ev.shiftKey) {
			if (Math.abs(dx) > Math.abs(dy)) dy = 0
			else dx = 0
		}
		const gx: number[] = []
		const gy: number[] = []
		if (!ev.altKey) {
			const b = { x: g.box.x + dx, y: g.box.y + dy, w: g.box.w, h: g.box.h }
			const sx = safe.x * k
			const sy = safe.y * k
			const sw = safe.w * k
			const sh = safe.h * k
			const others = tops.filter(e => e.id !== g.id).map(e => boxes[e.id]).filter(Boolean)
			const tx = [0, width / 2, width, sx, sx + sw / 2, sx + sw, ...others.flatMap(o => [o.x, o.x + o.w / 2, o.x + o.w])]
			const ty = [0, height / 2, height, sy, sy + sh / 2, sy + sh, ...others.flatMap(o => [o.y, o.y + o.h / 2, o.y + o.h])]
			const bx = ev.shiftKey && dx === 0 ? null : snapAxis([b.x, b.x + b.w / 2, b.x + b.w], tx)
			const by = ev.shiftKey && dy === 0 ? null : snapAxis([b.y, b.y + b.h / 2, b.y + b.h], ty)
			if (bx) {
				dx += bx.d
				gx.push(bx.t)
			}
			if (by) {
				dy += by.d
				gy.push(by.t)
			}
		}
		setGuides({ x: gx, y: gy })
		setLive({ id: g.id, el: { ...g.el, x: r1(g.el.x + (dx / width) * 100), y: r1(g.el.y + (dy / height) * 100) } as El })
	}

	const end = () => {
		const g = drag.current
		drag.current = null
		setGuides({ x: [], y: [] })
		const dropped = liveRef.current
		if (g?.moved && dropped) {
			const el = dropped.el
			onChange(d => ({ ...d, elements: mapEl(d.elements, el.id, () => el) }))
		}
		setLive(null)
	}

	const onKeyDown = (ev: any) => {
		if (!sel) return
		// Shift for big steps, Alt for fine ones
		const step = ev.shiftKey ? 2 : ev.altKey ? 0.1 : 0.5
		const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
		const m = moves[ev.key]
		if (m && selTop) {
			ev.preventDefault()
			if (isLocked(selTop)) return
			onChange(d => ({ ...d, elements: mapEl(d.elements, selTop, e => ({ ...e, x: r1(e.x + m[0]), y: r1(e.y + m[1]) }) as El) }))
		} else if (ev.key === 'Escape') {
			setSel(selTop !== sel ? selTop : null)
		} else if (ev.key === 'Delete' || ev.key === 'Backspace') {
			ev.preventDefault()
			if (isLocked(sel)) return
			const id = sel
			onChange(d => ({ ...d, elements: removeEl(d.elements, id) }))
			setSel(null)
		} else if ((ev.key === 'd' || ev.key === 'D') && modKey(ev) && props.onDuplicate) {
			ev.preventDefault()
			props.onDuplicate(sel)
		}
	}

	// clear stale hover when the design changes under it
	useEffect(() => {
		if (hover && !boxes[hover]) setHover(null)
	}, [boxes])

	// ---------- overlay ----------
	const S = (n: number) => n * k
	const hard = overlay === 'off' ? [] : overlay === 'safe' ? zones.filter(z => z.hard) : zones.filter(z => z.group === overlay)
	const hardRects = hard.filter(z => z.hard).map(z => ({ x: S(z.x), y: S(z.y), w: S(z.w), h: S(z.h) }))
	const safeRect = { x: S(safe.x), y: S(safe.y), w: S(safe.w), h: S(safe.h) }
	const flags = overlay === 'off' ? [] : flatten(shown.elements)
		.filter(e => e.visible !== false && TEXTUAL.has(e.type) && boxes[e.id])
		.map(e => {
			const b = boxes[e.id]
			const inZone = hardRects.some(z => touches(b, z))
			const outSafe = b.x < safeRect.x - 1 || b.y < safeRect.y - 1 || b.x + b.w > safeRect.x + safeRect.w + 1 || b.y + b.h > safeRect.y + safeRect.h + 1
			return inZone || outSafe ? { id: e.id, b, color: inZone ? '#f87171' : '#fcd34d' } : null
		})
		.filter(Boolean) as { id: string; b: Rect; color: string }[]
	const rect = (key: string, b: Rect, style: Record<string, any>) => h('rect', { key, x: b.x, y: b.y, width: Math.max(0, b.w), height: Math.max(0, b.h), fill: 'none', ...style })
	const selBox = sel ? boxes[sel] : null
	const topBox = selTop ? boxes[selTop] : null
	const topEl = selTop ? design.elements.find(e => e.id === selTop) : null
	const handle = (() => {
		if (!topEl || !topBox || topEl.locked || drag.current?.kind === 'move') return null
		const { ax, ay } = anchorXY(topEl.anchor)
		return { x: ax === 100 ? topBox.x : topBox.x + topBox.w, y: ay === 100 ? topBox.y : topBox.y + topBox.h }
	})()
	const readout = live && boxes[live.id] ? (drag.current?.kind === 'resize' ? `${Math.round((live.el.w / (drag.current.el.w || 1)) * 100)}%` : `x ${live.el.x.toFixed(1)}  y ${live.el.y.toFixed(1)}`) : ''

	const svg = h(
		'svg',
		{ width, height, style: { position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible' } },
		// zones: drawn as one flat layer so overlaps don't stack up
		overlay !== 'off' ? h('g', { key: 'zones', opacity: overlay === 'safe' ? 0.22 : 0.3 }, ...hardRects.map((z, i) => h('rect', { key: i, x: z.x, y: z.y, width: z.w, height: z.h, fill: '#d7223f' }))) : null,
		overlay !== 'off' && overlay !== 'safe'
			? h(
					'g',
					{ key: 'soft' },
					...hard.filter(z => !z.hard).map(z => rect(`s${z.id}`, { x: S(z.x), y: S(z.y), w: S(z.w), h: S(z.h) }, { stroke: '#fcd34d', strokeWidth: 1, strokeDasharray: '5 4', fill: 'rgba(252,211,77,0.08)' })),
					...hard.map(z =>
						h('text', { key: `t${z.id}`, x: S(z.x) + 4, y: S(z.y) + 12, fontSize: 10, fill: '#fff', style: { paintOrder: 'stroke', stroke: 'rgba(0,0,0,.75)', strokeWidth: 3, fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif' } }, z.label),
					),
				)
			: null,
		overlay !== 'off' ? rect('safe', safeRect, { stroke: ACCENT, strokeOpacity: 0.85, strokeWidth: 1, strokeDasharray: '6 4' }) : null,
		overlay !== 'off' ? h('line', { key: 'cx', x1: width / 2, x2: width / 2, y1: 0, y2: height, stroke: 'rgba(255,255,255,.22)', strokeDasharray: '2 5' }) : null,
		overlay !== 'off' ? h('line', { key: 'cy', y1: height / 2, y2: height / 2, x1: 0, x2: width, stroke: 'rgba(255,255,255,.14)', strokeDasharray: '2 5' }) : null,
		...flags.map(f => rect(`f${f.id}`, f.b, { stroke: f.color, strokeWidth: 1.2, strokeDasharray: '3 3' })),
		...(props.changed ?? []).filter(id => boxes[id]).map(id => rect(`ch${id}`, { x: boxes[id].x - 3, y: boxes[id].y - 3, w: boxes[id].w + 6, h: boxes[id].h + 6 }, { stroke: CHANGED_COLOR, strokeWidth: 1.5, strokeDasharray: '6 4', className: 'kino-thumbs-pulse' })),
		hover && hover !== selTop && boxes[hover] && !live ? rect('hover', boxes[hover], { stroke: 'rgba(255,255,255,.55)', strokeWidth: 1 }) : null,
		topBox && sel !== selTop ? rect('parent', topBox, { stroke: ACCENT, strokeOpacity: 0.5, strokeWidth: 1, strokeDasharray: '4 3' }) : null,
		selBox ? rect('sel', selBox, { stroke: ACCENT, strokeWidth: 1.5 }) : null,
		...guides.x.map((x, i) => h('line', { key: `gx${i}`, x1: x, x2: x, y1: 0, y2: height, stroke: GUIDE_COLOR, strokeWidth: 1 })),
		...guides.y.map((y, i) => h('line', { key: `gy${i}`, y1: y, y2: y, x1: 0, x2: width, stroke: GUIDE_COLOR, strokeWidth: 1 })),
		readout ? h('text', { key: 'ro', x: Math.min(width - 90, Math.max(4, boxes[live!.id].x)), y: Math.max(12, boxes[live!.id].y - 6), fontSize: 11, fill: '#fff', style: { paintOrder: 'stroke', stroke: 'rgba(0,0,0,.8)', strokeWidth: 3, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' } }, readout) : null,
	)

	return h(
		'div',
		{
			ref,
			tabIndex: 0,
			onPointerDown,
			onPointerMove,
			onPointerUp: end,
			onPointerCancel: end,
			onPointerLeave: () => !drag.current && setHover(null),
			onKeyDown,
			onDragStart: (ev: any) => ev.preventDefault(),
			style: { position: 'relative', width, height, background: '#000', boxShadow: '0 0 0 1px rgba(var(--kp-ink),0.08)', outline: 'none', userSelect: 'none', touchAction: 'none', cursor: hover || live ? 'move' : 'default', flex: 'none' },
		},
		h(Thumbnail, { component: ThumbArt as any, inputProps: { design: shown, assets, brand }, compositionWidth: p.w, compositionHeight: p.h, frameToDisplay: 0, durationInFrames: 1, fps: 30, style: { width, height, pointerEvents: 'none' } }),
		svg,
		handle
			? h('div', {
					onPointerDown: onHandleDown,
					title: 'Drag to resize',
					style: { position: 'absolute', left: handle.x - 5, top: handle.y - 5, width: 10, height: 10, background: '#fff', border: `1.5px solid ${ACCENT}`, borderRadius: 2, cursor: 'nwse-resize', boxSizing: 'border-box' },
				})
			: null,
	)
}
