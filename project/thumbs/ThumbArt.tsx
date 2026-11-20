// Thumbnail art for the Thumbnails panel (/panels/thumbs), drawn with the project's brand kit (./ui/brand.ts).
// Renders a v2 Design (see ./model.ts): a background plus freely placed elements.
// Uses plain <img> with blob URLs: remotion's Img fails inside panels. Built with createElement like the panels.
// Every element carries data-el (its id, for selection) and data-thumb (role). Elements the panel checks also carry
// data-count (counts toward clutter) and data-fs/data-cap (rendered text size).
import { createElement as h, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { DEFAULT_BRAND, alpha, colorOf, mediaOf, rgbOf, type Brand } from './ui/brand'
import { capOf, ensureFont, fitSize, fontOf, onFontsChange, stackOf, weightOf, type FontDef } from './ui/fonts'
import { iconDef } from './ui/icons'
import { PRESETS, anchorXY, flatten, hAlign, unit } from './model'
import type { Align, Design, El, HeadlineEl, TextEl, BadgeEl, LogoEl, CardEl, RuleEl, EmblemEl, ImageEl, ShapeEl, ArrowEl, StackEl, Background, Shade } from './model'

export type Assets = Record<string, string | undefined>

// ---------- fonts a design draws with ----------
const headFont = (e: Pick<HeadlineEl, 'font'>, brand: Brand) => fontOf(e.font, brand, 'headline')
export const designFonts = (design: Design, brand: Brand): FontDef[] => {
	const out = new Map<string, FontDef>()
	const add = (f: FontDef) => out.set(f.id, f)
	for (const e of flatten(design.elements)) {
		if (e.type === 'headline') add(headFont(e, brand))
		else if (e.type === 'text') add(fontOf(e.font, brand, 'text'))
		else if (e.type === 'badge') add(fontOf(e.font, brand, 'text'))
		else if (e.type === 'card') {
			add(fontOf('', brand, 'text'))
			add(fontOf(e.titleFont, brand, 'display'))
		} else if (e.type === 'logo' && !mediaOf(e.src || brand.logo.media, brand) && brand.name) add(fontOf('', brand, 'display'))
	}
	return [...out.values()]
}

export const headlineLines = (e: Pick<HeadlineEl, 'text' | 'font' | 'upper'>, brand: Brand = DEFAULT_BRAND) => {
	const upper = e.upper ?? headFont(e, brand).upper
	return e.text
		.split('|')
		.map(s => s.trim())
		.filter(Boolean)
		.map(s => (upper ? s.toUpperCase() : s))
}

// ---------- background ----------
const abs = (style: CSSProperties): CSSProperties => ({ position: 'absolute', ...style })

const shadeCss = (s: Shade, a: number, rgb: [number, number, number]) => {
	const k = (v: number) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(v * a).toFixed(3)})`
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

const Backdrop = ({ bg, src, W, H, brand }: { bg: Background; src?: string; W: number; H: number; brand: Brand }) => {
	const scale = Math.max(bg.zoom, 1 + bg.blur * 0.004)
	const page = colorOf(bg.color, brand, 'page')
	const fill = bg.color2 ? `linear-gradient(135deg, ${page}, ${colorOf(bg.color2, brand, 'page')})` : page
	const shadeRgb = rgbOf(colorOf(bg.shadeColor, brand, 'page')) ?? [0, 0, 0]
	const filter = `${bg.blur > 0 ? `blur(${bg.blur}px) ` : ''}brightness(${(1 - bg.dim).toFixed(3)}) saturate(${bg.saturate})${bg.contrast !== 1 ? ` contrast(${bg.contrast})` : ''}`
	const img = src
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
					filter,
					// own compositing layer: without it Chromium clips a blurred image to part of the frame inside a scaled player
					willChange: 'transform',
				}),
			})
		: null
	return h(
		'div',
		{ 'data-thumb': 'background', style: abs({ left: 0, top: 0, width: W, height: H, overflow: 'hidden', background: fill }) },
		// mirrored as a whole, so focus and zoom keep meaning what the preview shows
		img && bg.flip ? h('div', { style: abs({ left: 0, top: 0, width: W, height: H, transform: 'scaleX(-1)' }) }, img) : img,
		bg.tint && (bg.tintAmount ?? 0) > 0 ? h('div', { style: abs({ left: 0, top: 0, width: W, height: H, background: colorOf(bg.tint, brand, 'accent'), opacity: bg.tintAmount, mixBlendMode: 'color' }) }) : null,
		bg.shade !== 'none' && bg.shadeAmount > 0 ? h('div', { style: abs({ left: 0, top: 0, width: W, height: H, background: shadeCss(bg.shade, bg.shadeAmount, shadeRgb) }) }) : null,
	)
}

// ---------- text pieces ----------
type Fx = { treatment: HeadlineEl['treatment']; stroke?: number; strokeColor?: string; shadow?: number; glowColor?: string }
const px = (n: number) => `${n.toFixed(1)}px`
const dropShadow = (size: number, k: number) => `0 ${px(size * 0.035 * k)} ${px(size * 0.03 * k)} rgba(0,0,0,.9), 0 0 ${px(size * 0.22 * k)} rgba(0,0,0,.8), 0 0 ${px(size * 0.6 * k)} rgba(0,0,0,.45)`

// How a headline is held off the picture. An element's own stroke and shadow settings adjust the treatment's.
const treatment = (e: Fx, size: number, color: string, brand: Brand): CSSProperties => {
	const t = e.treatment
	const k = e.shadow ?? (t === 'plain' || t === 'box' ? 0 : 1)
	const strokeW = e.stroke !== undefined ? e.stroke * size : t === 'outline' ? Math.max(3, size * 0.075) : 0
	const stroke: CSSProperties = strokeW > 0 ? { WebkitTextStroke: `${px(strokeW)} ${colorOf(e.strokeColor, brand, 'ink')}`, paintOrder: 'stroke fill' } : {}
	let textShadow = 'none'
	if (k > 0) {
		if (t === 'outline') textShadow = `0 ${px(size * 0.05 * k)} 0 rgba(0,0,0,.6), 0 0 ${px(size * 0.35 * k)} rgba(0,0,0,.55)`
		else if (t === 'neon') {
			// pale fill, a hard colored edge, a two-tone glow and a dark halo to hold it off the picture
			const glow = e.glowColor ? colorOf(e.glowColor, brand, 'accent') : ''
			const [edge, near, far] = glow ? [glow, alpha(glow, 0.9), alpha(glow, 0.7)] : ['#d93bdc', 'rgba(255,45,149,.9)', 'rgba(224,33,255,.7)']
			textShadow = `${px(-size * 0.03)} ${px(size * 0.034)} 0 ${edge}, 0 ${px(size * 0.03)} ${px(size * 0.06)} rgba(20,4,40,.9), 0 0 ${px(size * 0.14 * k)} ${near}, 0 0 ${px(size * 0.42 * k)} ${far}, 0 0 ${px(size * 0.9 * k)} rgba(20,4,40,.85)`
		} else textShadow = dropShadow(size, k)
	}
	return { color, ...stroke, textShadow }
}

const withAccent = (line: string, accent: string, color: string): ReactNode[] => {
	const a = accent.trim()
	if (!a) return [line]
	const out: ReactNode[] = []
	const lower = line.toLowerCase()
	const al = a.toLowerCase()
	// lowercasing can change a string's length (some scripts): matching by index would then cut words in the wrong place
	if (lower.length !== line.length || al.length !== a.length) return [line]
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

type Ctx = { W: number; H: number; u: number; assets: Assets; align: Align; brand: Brand }
const flexAlign = (a: Align) => (a === 'start' ? 'flex-start' : a === 'end' ? 'flex-end' : 'center')
const textAlign = (a: Align) => (a === 'start' ? 'left' : a === 'end' ? 'right' : 'center')

const Headline = (e: HeadlineEl, x: Ctx) => {
	const f = headFont(e, x.brand)
	const stack = stackOf(f)
	const weight = weightOf(f, e.weight ?? f.weight)
	const tracking = e.tracking ?? f.tracking
	const lines = headlineLines(e, x.brand)
	if (!lines.length) return null
	const box = e.treatment === 'box'
	const maxW = (e.w / 100) * x.W
	const size = fitSize(lines, stack, weight, tracking, e.size * x.u, box ? maxW / 1.36 : maxW)
	const accent = colorOf(e.accentColor, x.brand, box ? 'accentAlt' : 'accent')
	const align = e.align ?? x.align
	return h(
		'div',
		{
			'data-thumb': 'title',
			'data-count': '1',
			'data-fs': size,
			'data-cap': capOf(f, weight),
			style: { display: 'flex', flexDirection: 'column', alignItems: flexAlign(align), textAlign: textAlign(align), gap: box ? size * 0.1 : 0 },
		},
		...lines.map((line, i) =>
			h(
				'div',
				{
					key: i,
					style: {
						fontFamily: stack,
						fontWeight: weight,
						fontSize: size,
						lineHeight: e.lineHeight ?? f.lh,
						letterSpacing: `${tracking}em`,
						whiteSpace: 'nowrap',
						...treatment(e, size, colorOf(e.color, x.brand, 'text'), x.brand),
						...(box
							? {
									background: alpha(colorOf(e.boxColor, x.brand, 'panel'), 0.9),
									border: `${Math.max(2, size * 0.02)}px solid ${alpha(x.brand.colors.muted, 0.6)}`,
									padding: `${size * 0.08}px ${size * 0.18}px ${size * 0.12}px`,
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
	const f = fontOf(e.font, x.brand, 'text')
	const stack = stackOf(f)
	const weight = weightOf(f, e.weight)
	const lines = e.text.split('|').map(s => (e.upper ? s.trim().toUpperCase() : s.trim())).filter(Boolean)
	if (!lines.length) return null
	const size = fitSize(lines, stack, weight, e.tracking, e.size * x.u, (e.w / 100) * x.W)
	const align = e.align ?? x.align
	const k = e.shadow ?? 1
	return h(
		'div',
		{
			'data-thumb': 'text',
			'data-count': '0',
			'data-fs': size,
			'data-cap': capOf(f, weight),
			style: {
				display: 'flex',
				flexDirection: 'column',
				alignItems: flexAlign(align),
				textAlign: textAlign(align),
				fontFamily: stack,
				fontWeight: weight,
				fontSize: size,
				lineHeight: e.lineHeight ?? 1.2,
				letterSpacing: `${e.tracking}em`,
				color: colorOf(e.color, x.brand, 'muted'),
				textShadow: k > 0 ? `0 ${2 * k}px ${3 * k}px rgba(0,0,0,.9), 0 0 ${size * 0.6 * k}px rgba(0,0,0,.7)` : 'none',
				...(e.stroke ? { WebkitTextStroke: `${px(e.stroke * size)} ${colorOf(e.strokeColor, x.brand, 'ink')}`, paintOrder: 'stroke fill' } : null),
				whiteSpace: 'nowrap',
			},
		},
		...lines.map((l, i) => h('div', { key: i }, l)),
	)
}

const Badge = (e: BadgeEl, x: Ctx) => {
	const text = e.upper === false ? e.text.trim() : e.text.trim().toUpperCase()
	if (!text) return null
	const f = fontOf(e.font, x.brand, 'text')
	const stack = stackOf(f)
	const weight = weightOf(f, e.weight ?? 800)
	const tracking = e.tracking ?? 0.06
	// padding adds about 1 em plus tracking: fit the label so the pill stays inside w
	const size = fitSize([text], stack, weight, tracking, e.size * x.u, (e.w / 100) * x.W - e.size * x.u)
	return h(
		'div',
		{
			'data-thumb': 'badge',
			'data-count': '1',
			'data-fs': size,
			'data-cap': capOf(f, weight),
			style: {
				display: 'inline-flex',
				alignItems: 'center',
				fontFamily: stack,
				fontWeight: weight,
				fontSize: size,
				lineHeight: 1,
				letterSpacing: `${tracking}em`,
				color: colorOf(e.color, x.brand, 'onAccent'),
				background: colorOf(e.fill, x.brand, 'accent'),
				padding: `${size * 0.28}px ${size * 0.5}px ${size * 0.24}px`,
				borderRadius: e.radius ? size * 0.76 * e.radius : undefined,
				boxShadow: `0 ${size * 0.12}px ${size * 0.4}px rgba(0,0,0,.55)`,
				whiteSpace: 'nowrap',
			},
		},
		text,
	)
}

// The kit's logo image (or one picked for this element). Without an image the brand name stands in as a wordmark.
const Logo = (e: LogoEl, x: Ctx) => {
	const width = (e.w / 100) * x.W
	const media = mediaOf(e.src || x.brand.logo.media, x.brand)
	const glow = e.glow > 0 ? `drop-shadow(0 0 ${width * 0.05}px ${alpha(colorOf(e.glowColor, x.brand, 'accent'), e.glow)}) ` : ''
	const filter = `${glow}drop-shadow(0 ${width * 0.01}px ${width * 0.015}px rgba(0,0,0,.8))`
	if (!media) {
		const name = x.brand.name.trim()
		if (!name) return null
		const f = fontOf('', x.brand, 'display')
		const label = f.upper ? name.toUpperCase() : name
		const size = fitSize([label], stackOf(f), f.weight, f.tracking, width * 0.4, width)
		return h('div', { 'data-thumb': 'logo', 'data-count': '1', 'data-fs': size, 'data-cap': capOf(f, f.weight), style: { fontFamily: stackOf(f), fontWeight: f.weight, fontSize: size, lineHeight: 1, letterSpacing: `${f.tracking}em`, color: x.brand.colors.text, whiteSpace: 'nowrap', filter } }, label)
	}
	const src = x.assets[media]
	// until the image arrives, hold a wide box so a stack does not jump
	if (!src) return h('div', { 'data-thumb': 'logo', 'data-count': '1', style: { width, height: width * 0.33 } })
	return h('img', { src, 'data-thumb': 'logo', 'data-count': '1', style: { display: 'block', width, height: 'auto', filter } })
}

const Icon = ({ name, size, brand }: { name: string; size: number; brand: Brand }) => {
	const def = iconDef(name, brand)
	return h('svg', { width: size, height: size, viewBox: `0 0 ${def.box} ${def.box}`, style: { display: 'block', overflow: 'visible', filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.7))' } }, h('path', { d: def.d, fill: 'currentColor' }))
}

// Veiled panel with a colored label line, a large title and a line of detail. Empty lines are left out.
const Card = (e: CardEl, x: Ctx) => {
	const c = x.brand.colors
	const width = (e.w / 100) * x.W
	const u = width / 800
	const col = colorOf(e.labelColor, x.brand, 'success')
	const tf = fontOf('', x.brand, 'text')
	const text = stackOf(tf)
	const df = fontOf(e.titleFont, x.brand, 'display')
	const inner = width - 108 * u
	const label = e.label.trim()
	const title = e.title.trim()
	const detail = e.detail.trim()
	const labelFs = label ? fitSize([label], text, weightOf(tf, 800), 0.04, 64 * u, inner - (e.dot ? 62 * u : 0)) : 0
	const titleFs = title ? fitSize([title], stackOf(df), df.weight, 0, 92 * u, inner) : 0
	const detailFs = detail ? fitSize([detail], text, weightOf(tf, 700), 0, 56 * u, inner - (e.icon ? 90 * u : 0)) : 0
	return h(
		'div',
		{
			'data-thumb': 'card',
			'data-count': '1',
			style: {
				width,
				boxSizing: 'border-box',
				padding: `${44 * u}px ${54 * u}px ${48 * u}px`,
				background: alpha(c.panel, 0.86),
				border: `${Math.max(2, 3 * u)}px solid ${alpha(c.muted, 0.55)}`,
				boxShadow: `0 ${30 * u}px ${70 * u}px -${10 * u}px rgba(0,0,0,.8)${c.panelGlow ? `, inset 0 0 ${80 * u}px ${alpha(c.panelGlow, 0.35)}` : ''}`,
				display: 'flex',
				flexDirection: 'column',
				gap: 22 * u,
			},
		},
		label
			? h(
					'div',
					{
						'data-thumb': 'card-label',
						'data-fs': labelFs,
						'data-cap': capOf(tf, weightOf(tf, 800)),
						style: { display: 'flex', alignItems: 'center', gap: 22 * u, fontFamily: text, fontWeight: weightOf(tf, 800), fontSize: labelFs, lineHeight: 1, letterSpacing: '0.04em', color: col, whiteSpace: 'nowrap' },
					},
					e.dot ? h('div', { style: { width: 40 * u, height: 40 * u, borderRadius: '50%', background: col, boxShadow: `0 0 0 ${8 * u}px ${alpha(col, 0.22)}, 0 0 ${36 * u}px ${alpha(col, 0.9)}`, flex: 'none' } }) : null,
					label,
				)
			: null,
		h('div', { style: { height: Math.max(1.5, 2 * u), background: `linear-gradient(90deg, ${alpha(c.muted, 0.7)}, ${alpha(c.muted, 0)})` } }),
		title ? h('div', { 'data-thumb': 'card-title', 'data-fs': titleFs, 'data-cap': capOf(df, df.weight), style: { fontFamily: stackOf(df), fontWeight: df.weight, fontSize: titleFs, lineHeight: 1, color: c.text, whiteSpace: 'nowrap' } }, df.upper ? title.toUpperCase() : title) : null,
		detail
			? h(
					'div',
					{
						'data-thumb': 'card-detail',
						'data-fs': detailFs,
						'data-cap': capOf(tf, weightOf(tf, 700)),
						style: { display: 'flex', alignItems: 'center', gap: 20 * u, fontFamily: text, fontWeight: weightOf(tf, 700), fontSize: detailFs, lineHeight: 1, color: c.body, whiteSpace: 'nowrap' },
					},
					e.icon ? h('div', { style: { color: c.muted, display: 'flex' } }, h(Icon, { name: e.icon, size: 70 * u, brand: x.brand })) : null,
					detail,
				)
			: null,
	)
}

// A fading line, or the kit's ornament between two hairlines when it has one
const Rule = (e: RuleEl, x: Ctx) => {
	const width = Math.round((e.w / 100) * x.W)
	const color = colorOf(e.color, x.brand, 'muted')
	const orn = e.plain ? null : x.brand.divider
	if (!orn) {
		const t = Math.max(1, (e.thickness ?? 3) * x.u)
		return h('div', { 'data-thumb': 'rule', 'data-count': '0', style: { width, height: t, borderRadius: t, opacity: 0.9, background: `linear-gradient(90deg, ${alpha(color, 0)}, ${color} 18%, ${color} 82%, ${alpha(color, 0)})` } })
	}
	const markH = 30
	const markW = (orn.w * markH) / orn.h
	const side = Math.max(0, (width - markW) / 2 + markW * 0.058)
	const line = (dir: number): CSSProperties => abs({ [dir > 0 ? 'left' : 'right']: 0, top: markH / 2, width: side, height: 1.2, background: `linear-gradient(${dir > 0 ? 270 : 90}deg, ${color}, transparent)` })
	return h(
		'div',
		{ 'data-thumb': 'rule', 'data-count': '0', style: { opacity: 0.9, display: 'flex', justifyContent: 'center' } },
		h(
			'div',
			{ style: { position: 'relative', width, height: markH } },
			h('div', { style: line(1) }),
			h(
				'svg',
				{ width: markW, height: markH, viewBox: `0 0 ${orn.w} ${orn.h}`, fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', style: abs({ left: (width - markW) / 2, top: 0, display: 'block' }) },
				...orn.paths.map((p, i) => h('path', { key: i, d: p.d, fill: p.fill, stroke: p.stroke, strokeWidth: p.strokeWidth, opacity: p.opacity, transform: p.transform })),
			),
			h('div', { style: line(-1) }),
		),
	)
}

const Emblem = (e: EmblemEl, x: Ctx) =>
	h(
		'div',
		{ 'data-thumb': 'emblem', 'data-count': '1', style: { color: colorOf(e.color, x.brand, 'muted'), display: 'flex', filter: `drop-shadow(0 ${e.size * x.u * 0.03}px ${e.size * x.u * 0.06}px rgba(0,0,0,.8))` } },
		h(Icon, { name: e.icon, size: e.size * x.u, brand: x.brand }),
	)

const Image = (e: ImageEl, x: Ctx) => {
	const width = (e.w / 100) * x.W
	const height = e.h ? (e.h / 100) * x.H : undefined
	const src = x.assets[mediaOf(e.src, x.brand)]
	const b = Math.max(2, (e.borderWidth ?? 4) * x.u)
	const radius = e.radius ? (e.radius >= 50 ? '50%' : (e.radius / 100) * width) : undefined
	return h(
		'div',
		{
			'data-thumb': 'image',
			'data-count': '1',
			style: {
				width,
				height: height ?? (src ? undefined : width * 0.5625),
				boxSizing: 'border-box',
				border: e.border ? `${b}px solid ${e.borderColor ? colorOf(e.borderColor, x.brand, 'muted') : alpha(x.brand.colors.muted, 0.75)}` : undefined,
				borderRadius: radius,
				boxShadow: e.shadow ? `0 ${24 * x.u}px ${60 * x.u}px -${8 * x.u}px rgba(0,0,0,.85)` : undefined,
				// a mat behind framed or missing pictures; cut-outs without a frame stay see-through
				background: e.border || !src ? alpha(x.brand.colors.panel, 0.6) : undefined,
				overflow: 'hidden',
			},
		},
		src ? h('img', { src, style: { display: 'block', width: '100%', height: height ? '100%' : 'auto', objectFit: e.fit, objectPosition: `${e.focusX ?? 50}% ${e.focusY ?? 50}%`, transform: e.flip ? 'scaleX(-1)' : undefined } }) : null,
	)
}

const Shape = (e: ShapeEl, x: Ctx) =>
	h('div', {
		'data-thumb': 'shape',
		'data-count': '0',
		style: {
			width: (e.w / 100) * x.W,
			height: (e.h / 100) * x.H,
			boxSizing: 'border-box',
			background: colorOf(e.fill, x.brand, 'accent'),
			border: e.borderWidth > 0 ? `${e.borderWidth * x.u}px solid ${colorOf(e.borderColor, x.brand, 'text')}` : undefined,
			borderRadius: e.shape === 'ellipse' ? '50%' : e.radius * x.u,
			boxShadow: e.shadow ? `0 ${16 * x.u}px ${44 * x.u}px -${6 * x.u}px rgba(0,0,0,.8)` : undefined,
		},
	})

const Arrow = (e: ArrowEl, x: Ctx) => {
	const width = (e.w / 100) * x.W
	return h(
		'svg',
		{ 'data-thumb': 'arrow', 'data-count': '1', width, height: width * 0.62, viewBox: '0 0 100 62', style: { display: 'block', overflow: 'visible', filter: `drop-shadow(0 ${width * 0.03}px ${width * 0.05}px rgba(0,0,0,.75))` } },
		h('path', { d: 'M4 22 L58 22 L58 6 L96 31 L58 56 L58 40 L4 40 Z', fill: colorOf(e.color, x.brand, 'accent'), stroke: colorOf(e.strokeColor, x.brand, 'ink'), strokeWidth: 4, strokeLinejoin: 'round' }),
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
			return Emblem(e, x)
		case 'image':
			return Image(e, x)
		case 'shape':
			return Shape(e, x)
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
export const ThumbArt = ({ design, assets, brand: kit, renderKey }: { design: Design; assets: Assets; brand?: Brand; renderKey?: string }) => {
	const brand = kit ?? DEFAULT_BRAND
	// text is measured to fit, so draw again when a font arrives
	const [, setFontTick] = useState(0)
	useEffect(() => onFontsChange(() => setFontTick(n => n + 1)), [])
	for (const f of designFonts(design, brand)) ensureFont(f)
	const p = PRESETS[design.preset] ?? PRESETS.youtube
	const W = p.w
	const H = p.h
	const x: Ctx = { W, H, u: unit(p), assets, align: 'center', brand }
	return h(
		'div',
		{ 'data-thumb-root': '1', 'data-key': renderKey ?? '', style: { position: 'absolute', left: 0, top: 0, width: W, height: H, overflow: 'hidden', background: brand.colors.page } },
		h(Backdrop, { bg: design.background, src: assets[mediaOf(design.background.src, brand)], W, H, brand }),
		...design.elements.filter(e => e.visible !== false).map(e => Placed(e, x)),
	)
}
