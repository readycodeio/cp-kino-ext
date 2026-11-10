// Thumbnail art for the Thumbnails panel (/panels/thumbs), styled with the OB:MP kit.
// Renders a v2 Design (see ./model.ts): a background plus freely placed elements.
// Uses plain <img> with blob URLs: remotion's Img fails inside panels. Built with createElement like the panels.
// Every element carries data-el (its id, for selection) and data-thumb (role). Elements the panel checks also carry
// data-count (counts toward clutter) and data-fs/data-cap (rendered text size).
import { createElement as h } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { loadFont as loadFira } from '@remotion/google-fonts/FiraSans'
import { c } from '../brand'
import { CenterRule, Emblem } from '../ui/ornaments'
import { PRESETS, anchorXY, hAlign, unit } from './model'
import type { Design, El, HeadlineEl, TextEl, BadgeEl, LogoEl, CardEl, EmblemEl, ImageEl, ArrowEl, StackEl, Background, Shade, FontId } from './model'

const fira = loadFira('normal', { weights: ['400', '600', '700', '800', '900'], subsets: ['latin'] })
export const FIRA_FAMILY = String(fira.fontFamily).replace(/["']/g, '')

export const FONTS: Record<FontId, { family: string; weight: number; upper: boolean; tracking: number; lh: number; cap: number }> = {
	petrock: { family: '"Kingthings Petrock", "Palatino Linotype", Georgia, serif', weight: 400, upper: false, tracking: 0, lh: 0.98, cap: 0.68 },
	fira: { family: `${fira.fontFamily}, "Segoe UI", system-ui, sans-serif`, weight: 900, upper: true, tracking: -0.01, lh: 0.92, cap: 0.69 },
}
const TEXT = `${fira.fontFamily}, "Segoe UI", system-ui, sans-serif`
const INK = '#140d08'

// ---------- text measuring (canvas, same font props as render) ----------
let ctx: CanvasRenderingContext2D | null = null
const measure = (text: string, family: string, weight: number, size: number, tracking = 0) => {
	ctx ??= document.createElement('canvas').getContext('2d')
	if (!ctx) return text.length * size * 0.5
	ctx.font = `${weight} ${size}px ${family}`
	;(ctx as any).letterSpacing = `${tracking * size}px`
	return ctx.measureText(text).width
}
// Largest size up to `base` at which every line fits in maxW
const fitSize = (lines: string[], family: string, weight: number, tracking: number, base: number, maxW: number) =>
	Math.max(4, Math.floor(Math.min(base, ...lines.map(line => (base * maxW) / Math.max(1, measure(line, family, weight, base, tracking))))))

export const headlineLines = (e: Pick<HeadlineEl, 'text' | 'font'>) => {
	const f = FONTS[e.font] ?? FONTS.fira
	return e.text
		.split('|')
		.map(s => s.trim())
		.filter(Boolean)
		.map(s => (f.upper ? s.toUpperCase() : s))
}

const STATUS_COLORS: Record<string, string> = { success: c.success, online: c.success, accent: c.accent, ember: c.accent, warning: c.warning, danger: c.error, error: c.error, offline: c.error, muted: c.rule }
export const statusColor = (v: string) => STATUS_COLORS[v] ?? (v || c.success)
const hexA = (hex: string, a: number) => {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex)
	if (!m) return `rgba(108,192,112,${a})`
	const n = parseInt(m[1], 16)
	return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}

// ---------- background ----------
const abs = (style: CSSProperties): CSSProperties => ({ position: 'absolute', ...style })

const shadeCss = (s: Shade, a: number) => {
	const k = (v: number) => `rgba(13,11,9,${(v * a).toFixed(3)})`
	switch (s) {
		case 'vignette':
			return `radial-gradient(ellipse 80% 72% at 50% 50%, ${k(0)} 0%, ${k(0.55)} 70%, ${k(0.92)} 100%)`
		case 'top':
			return `linear-gradient(180deg, ${k(0.9)} 0%, ${k(0.5)} 34%, ${k(0)} 56%, ${k(0)} 76%, ${k(0.6)} 100%)`
		case 'bottom':
			return `linear-gradient(0deg, ${k(0.9)} 0%, ${k(0.5)} 34%, ${k(0)} 56%, ${k(0)} 80%, ${k(0.5)} 100%)`
		case 'left':
			return `linear-gradient(90deg, ${k(0.9)} 0%, ${k(0.62)} 34%, ${k(0)} 64%), linear-gradient(0deg, ${k(0.6)} 0%, ${k(0)} 30%)`
		case 'right':
			return `linear-gradient(270deg, ${k(0.9)} 0%, ${k(0.62)} 34%, ${k(0)} 64%), linear-gradient(0deg, ${k(0.6)} 0%, ${k(0)} 30%)`
		case 'topBottom':
			return `linear-gradient(180deg, ${k(0.88)} 0%, ${k(0.55)} 30%, ${k(0)} 50%, ${k(0)} 62%, ${k(0.78)} 100%)`
		default:
			return 'none'
	}
}

const Backdrop = ({ bg, src, W, H }: { bg: Background; src?: string; W: number; H: number }) => {
	const scale = Math.max(bg.zoom, 1 + bg.blur * 0.004)
	return h(
		'div',
		{ 'data-thumb': 'background', style: abs({ left: 0, top: 0, width: W, height: H, overflow: 'hidden', background: c.page }) },
		src
			? h('img', {
					src,
					style: abs({
						left: 0,
						top: 0,
						width: W,
						height: H,
						objectFit: 'cover',
						objectPosition: `${bg.focusX}% ${bg.focusY}%`,
						transform: `scale(${scale})`,
						transformOrigin: `${bg.focusX}% ${bg.focusY}%`,
						filter: `${bg.blur > 0 ? `blur(${bg.blur}px) ` : ''}brightness(${(1 - bg.dim).toFixed(3)}) saturate(1.08)`,
						// own compositing layer: without it Chromium clips a blurred image to part of the frame inside a scaled player
						willChange: 'transform',
					}),
				})
			: null,
		bg.shade !== 'none' && bg.shadeAmount > 0 ? h('div', { style: abs({ left: 0, top: 0, width: W, height: H, background: shadeCss(bg.shade, bg.shadeAmount) }) }) : null,
	)
}

// ---------- text pieces ----------
const treatment = (t: HeadlineEl['treatment'], size: number, color: string): CSSProperties =>
	t === 'outline'
		? {
				color,
				WebkitTextStroke: `${Math.max(3, size * 0.075).toFixed(1)}px ${INK}`,
				paintOrder: 'stroke fill',
				textShadow: `0 ${(size * 0.05).toFixed(1)}px 0 rgba(0,0,0,.6), 0 0 ${(size * 0.35).toFixed(1)}px rgba(0,0,0,.55)`,
			}
		: t === 'shadow'
			? {
					color,
					textShadow: `0 ${(size * 0.035).toFixed(1)}px ${(size * 0.03).toFixed(1)}px rgba(0,0,0,.9), 0 0 ${(size * 0.22).toFixed(1)}px rgba(0,0,0,.8), 0 0 ${(size * 0.6).toFixed(1)}px rgba(0,0,0,.45)`,
				}
			: { color }

const withAccent = (line: string, accent: string, color: string): ReactNode[] => {
	const a = accent.trim()
	if (!a) return [line]
	const out: ReactNode[] = []
	const lower = line.toLowerCase()
	const al = a.toLowerCase()
	let i = 0
	let k = 0
	while (i < line.length) {
		const j = lower.indexOf(al, i)
		if (j < 0) {
			out.push(line.slice(i))
			break
		}
		if (j > i) out.push(line.slice(i, j))
		out.push(h('span', { key: k++, style: { color } }, line.slice(j, j + a.length)))
		i = j + a.length
	}
	return out
}

type Ctx = { W: number; H: number; u: number; assets: Record<string, string | undefined>; align: 'start' | 'center' | 'end' }
const flexAlign = (a: Ctx['align']) => (a === 'start' ? 'flex-start' : a === 'end' ? 'flex-end' : 'center')

const Headline = (e: HeadlineEl, x: Ctx) => {
	const f = FONTS[e.font] ?? FONTS.fira
	const lines = headlineLines(e)
	if (!lines.length) return null
	const box = e.treatment === 'box'
	const maxW = (e.w / 100) * x.W
	const size = fitSize(lines, f.family, f.weight, f.tracking, e.size * x.u, box ? maxW / 1.36 : maxW)
	const accent = e.accentColor || (box ? c.accentLift : c.accent)
	return h(
		'div',
		{
			'data-thumb': 'title',
			'data-count': '1',
			'data-fs': size,
			'data-cap': f.cap,
			style: { display: 'flex', flexDirection: 'column', alignItems: flexAlign(x.align), textAlign: x.align === 'start' ? 'left' : x.align === 'end' ? 'right' : 'center', gap: box ? size * 0.1 : 0 },
		},
		...lines.map((line, i) =>
			h(
				'div',
				{
					key: i,
					style: {
						fontFamily: f.family,
						fontWeight: f.weight,
						fontSize: size,
						lineHeight: f.lh,
						letterSpacing: `${f.tracking}em`,
						whiteSpace: 'nowrap',
						...treatment(e.treatment, size, e.color || c.fgHeading),
						...(box
							? {
									background: 'rgba(15,12,9,.9)',
									border: `${Math.max(2, size * 0.02)}px solid rgba(203,182,140,.6)`,
									padding: `${size * 0.08}px ${size * 0.18}px ${size * 0.12}px`,
									textShadow: 'none',
								}
							: null),
					},
				},
				...withAccent(line, e.accent, accent),
			),
		),
	)
}

const Text = (e: TextEl, x: Ctx) => {
	const f = FONTS[e.font] ?? FONTS.fira
	const weight = e.font === 'petrock' ? 400 : e.weight
	const lines = e.text.split('|').map(s => (e.upper ? s.trim().toUpperCase() : s.trim())).filter(Boolean)
	if (!lines.length) return null
	const size = fitSize(lines, f.family, weight, e.tracking, e.size * x.u, (e.w / 100) * x.W)
	return h(
		'div',
		{
			'data-thumb': 'text',
			'data-count': '0',
			'data-fs': size,
			'data-cap': 0.7,
			style: {
				display: 'flex',
				flexDirection: 'column',
				alignItems: flexAlign(x.align),
				fontFamily: f.family,
				fontWeight: weight,
				fontSize: size,
				lineHeight: 1.2,
				letterSpacing: `${e.tracking}em`,
				color: e.color || c.rule,
				textShadow: `0 2px 3px rgba(0,0,0,.9), 0 0 ${size * 0.6}px rgba(0,0,0,.7)`,
				whiteSpace: 'nowrap',
			},
		},
		...lines.map((l, i) => h('div', { key: i }, l)),
	)
}

const Badge = (e: BadgeEl, x: Ctx) => {
	const text = e.text.trim()
	if (!text) return null
	// padding adds about 1 em plus tracking: fit the label so the pill stays inside w
	const size = fitSize([text.toUpperCase()], TEXT, 800, 0.06, e.size * x.u, (e.w / 100) * x.W - e.size * x.u)
	return h(
		'div',
		{
			'data-thumb': 'badge',
			'data-count': '1',
			'data-fs': size,
			'data-cap': 0.7,
			style: {
				display: 'inline-flex',
				alignItems: 'center',
				fontFamily: TEXT,
				fontWeight: 800,
				fontSize: size,
				lineHeight: 1,
				letterSpacing: '0.06em',
				textTransform: 'uppercase',
				color: e.color || c.onAccent,
				background: e.fill || c.accent,
				padding: `${size * 0.28}px ${size * 0.5}px ${size * 0.24}px`,
				boxShadow: `0 ${size * 0.12}px ${size * 0.4}px rgba(0,0,0,.55)`,
				whiteSpace: 'nowrap',
			},
		},
		text,
	)
}

const Logo = (e: LogoEl, x: Ctx) => {
	const width = (e.w / 100) * x.W
	const src = x.assets.logo
	return h('img', {
		src: src || undefined,
		'data-thumb': 'logo',
		'data-count': '1',
		style: {
			display: 'block',
			width,
			height: (width * 237) / 719,
			visibility: src ? 'visible' : 'hidden',
			filter: `drop-shadow(0 0 ${width * 0.05}px rgba(255,138,31,${e.glow})) drop-shadow(0 ${width * 0.01}px ${width * 0.015}px rgba(0,0,0,.8))`,
		},
	})
}

// Veiled OB:MP panel with an oversized status line, server name and player count
const Card = (e: CardEl, x: Ctx) => {
	const width = (e.w / 100) * x.W
	const u = width / 800
	const col = statusColor(e.statusColor)
	const fit = (text: string, family: string, weight: number, tracking: number, base: number, room: number) => fitSize([text], family, weight, tracking, base, room)
	const inner = width - 108 * u
	const statusFs = e.status.trim() ? fit(e.status, TEXT, 800, 0.04, 64 * u, inner - (e.dot ? 62 * u : 0)) : 0
	const nameFs = e.server.trim() ? fit(e.server, FONTS.petrock.family, 400, 0, 92 * u, inner) : 0
	const playersText = [e.players.trim(), e.playersLabel.trim()].filter(Boolean).join(' ')
	const playersFs = e.players.trim() ? fit(playersText, TEXT, 700, 0, 56 * u, inner - (e.icon ? 90 * u : 0)) : 0
	return h(
		'div',
		{
			'data-thumb': 'card',
			'data-count': '1',
			style: {
				width,
				boxSizing: 'border-box',
				padding: `${44 * u}px ${54 * u}px ${48 * u}px`,
				background: 'rgba(15,12,9,.86)',
				border: `${Math.max(2, 3 * u)}px solid rgba(203,182,140,.55)`,
				boxShadow: `0 ${30 * u}px ${70 * u}px -${10 * u}px rgba(0,0,0,.8), inset 0 0 ${80 * u}px rgba(112,72,24,.35)`,
				display: 'flex',
				flexDirection: 'column',
				gap: 22 * u,
			},
		},
		e.status.trim()
			? h(
					'div',
					{
						'data-thumb': 'card-status',
						'data-fs': statusFs,
						'data-cap': 0.7,
						style: { display: 'flex', alignItems: 'center', gap: 22 * u, fontFamily: TEXT, fontWeight: 800, fontSize: statusFs, lineHeight: 1, letterSpacing: '0.04em', color: col, whiteSpace: 'nowrap' },
					},
					e.dot ? h('div', { style: { width: 40 * u, height: 40 * u, borderRadius: '50%', background: col, boxShadow: `0 0 0 ${8 * u}px ${hexA(col, 0.22)}, 0 0 ${36 * u}px ${hexA(col, 0.9)}`, flex: 'none' } }) : null,
					e.status,
				)
			: null,
		h('div', { style: { height: Math.max(1.5, 2 * u), background: 'linear-gradient(90deg, rgba(203,182,140,.7), rgba(203,182,140,0))' } }),
		e.server.trim()
			? h('div', { 'data-thumb': 'card-name', 'data-fs': nameFs, 'data-cap': 0.68, style: { fontFamily: FONTS.petrock.family, fontSize: nameFs, lineHeight: 1, color: c.fgHeading, whiteSpace: 'nowrap' } }, e.server)
			: null,
		e.players.trim()
			? h(
					'div',
					{
						'data-thumb': 'card-players',
						'data-fs': playersFs,
						'data-cap': 0.7,
						style: { display: 'flex', alignItems: 'center', gap: 20 * u, fontFamily: TEXT, fontWeight: 700, fontSize: playersFs, lineHeight: 1, color: c.fg, whiteSpace: 'nowrap' },
					},
					e.icon ? h('div', { style: { color: c.rule, display: 'flex' } }, h(Emblem, { name: 'fellowship', size: 70 * u })) : null,
					playersText,
				)
			: null,
	)
}

const Rule = (e: El, x: Ctx) => h('div', { 'data-thumb': 'rule', 'data-count': '0', style: { opacity: 0.9, display: 'flex', justifyContent: 'center' } }, h(CenterRule, { width: Math.round((e.w / 100) * x.W) }))

const EmblemEl_ = (e: EmblemEl, x: Ctx) =>
	h(
		'div',
		{ 'data-thumb': 'emblem', 'data-count': '1', style: { color: e.color || c.rule, display: 'flex', filter: `drop-shadow(0 ${e.size * x.u * 0.03}px ${e.size * x.u * 0.06}px rgba(0,0,0,.8))` } },
		h(Emblem, { name: e.icon as any, size: e.size * x.u }),
	)

const Image = (e: ImageEl, x: Ctx) => {
	const width = (e.w / 100) * x.W
	const height = e.h ? (e.h / 100) * x.H : undefined
	const src = x.assets[e.src]
	const b = Math.max(2, 4 * x.u)
	return h(
		'div',
		{
			'data-thumb': 'image',
			'data-count': '1',
			style: {
				width,
				height: height ?? (src ? undefined : width * 0.5625),
				boxSizing: 'border-box',
				border: e.border ? `${b}px solid rgba(203,182,140,.75)` : undefined,
				boxShadow: e.shadow ? `0 ${24 * x.u}px ${60 * x.u}px -${8 * x.u}px rgba(0,0,0,.85)` : undefined,
				background: 'rgba(15,12,9,.6)',
				overflow: 'hidden',
			},
		},
		src ? h('img', { src, style: { display: 'block', width: '100%', height: height ? '100%' : 'auto', objectFit: e.fit } }) : null,
	)
}

const Arrow = (e: ArrowEl, x: Ctx) => {
	const width = (e.w / 100) * x.W
	const col = e.color || c.accent
	return h(
		'svg',
		{ 'data-thumb': 'arrow', 'data-count': '1', width, height: width * 0.62, viewBox: '0 0 100 62', style: { display: 'block', overflow: 'visible', filter: `drop-shadow(0 ${width * 0.03}px ${width * 0.05}px rgba(0,0,0,.75))` } },
		h('path', { d: 'M4 22 L58 22 L58 6 L96 31 L58 56 L58 40 L4 40 Z', fill: col, stroke: INK, strokeWidth: 4, strokeLinejoin: 'round' }),
	)
}

const body = (e: El, x: Ctx): ReactNode => {
	switch (e.type) {
		case 'headline':
			return Headline(e, x)
		case 'text':
			return Text(e, x)
		case 'badge':
			return Badge(e, x)
		case 'logo':
			return Logo(e, x)
		case 'card':
			return Card(e, x)
		case 'rule':
			return Rule(e, x)
		case 'emblem':
			return EmblemEl_(e, x)
		case 'image':
			return Image(e, x)
		case 'arrow':
			return Arrow(e, x)
		case 'stack':
			return Stack(e, x)
	}
}

// Column of children, laid out in flow; the stack itself is what gets positioned
const Stack = (e: StackEl, x: Ctx) => {
	const kids = e.children.filter(k => k.visible !== false)
	const cx = { ...x, align: e.align }
	return h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', alignItems: flexAlign(e.align), gap: e.gap * x.u } },
		...kids.map(k => {
			const b = body(k, cx)
			if (!b) return null
			return h('div', { key: k.id, 'data-el': k.id, style: { display: 'flex', justifyContent: flexAlign(e.align), opacity: k.opacity ?? 1, transform: k.rotate ? `rotate(${k.rotate}deg)` : undefined } }, b)
		}),
	)
}

const Placed = (e: El, x: Ctx) => {
	const { ax, ay } = anchorXY(e.anchor)
	const b = body(e, { ...x, align: hAlign(e.anchor) })
	if (!b) return null
	return h(
		'div',
		{
			key: e.id,
			'data-el': e.id,
			style: abs({
				left: (e.x / 100) * x.W,
				top: (e.y / 100) * x.H,
				width: 'max-content',
				transform: `translate(${-ax}%, ${-ay}%)${e.rotate ? ` rotate(${e.rotate}deg)` : ''}`,
				transformOrigin: `${ax}% ${ay}%`,
				opacity: e.opacity ?? 1,
			}),
		},
		b,
	)
}

// ---------- the still ----------
// renderKey lands on the root as data-key so the panel can tell when a queued render has committed
export const ThumbArt = ({ design, assets, renderKey }: { design: Design; assets: Record<string, string | undefined>; renderKey?: string }) => {
	const p = PRESETS[design.preset] ?? PRESETS.youtube
	const W = p.w
	const H = p.h
	const x: Ctx = { W, H, u: unit(p), assets, align: 'center' }
	return h(
		'div',
		{ 'data-thumb-root': '1', 'data-key': renderKey ?? '', style: { position: 'absolute', left: 0, top: 0, width: W, height: H, overflow: 'hidden', background: c.page } },
		h(Backdrop, { bg: design.background, src: assets[design.background.src], W, H }),
		...design.elements.filter(e => e.visible !== false).map(e => Placed(e, x)),
	)
}
