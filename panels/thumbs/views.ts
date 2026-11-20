// Thumbnails panel: the Edit, Brand, Check, Feed and Guide tabs.
import { createElement as h, useState } from 'react'
import { MediaPicker } from 'kino/panel'
import { EL_LABELS, LAYOUTS, PRESETS, SHADES, TREATMENTS, findEl, layoutOf, makeEl, mapEl, moveEl, parentOf, removeEl } from '../../thumbs/model'
import type { Anchor, Design, El, ElStyle, ElType, PresetId, StackEl } from '../../thumbs/model'
import { COLOR_LABELS, DEFAULT_BRAND, mediaOf, type Brand, type BrandColors } from '../../thumbs/ui/brand'
import { fontList, fontOf, fontState, type FontRole } from '../../thumbs/ui/fonts'
import { iconNames } from '../../thumbs/ui/icons'
import type { Check, Rules } from './lib'
import { BRAND_PATH, fmtClock, platformOf } from './lib'
import type { Media } from './hooks'
import { AnchorPicker, Btn, ColorIn, DIM, Dot, EMBER, Field, GREEN, GUIDE, Grid, LEVEL_COLOR, LINE, MONO, RED, Range, Section, Segmented, Select, TEXT, TextIn, Toggle, UI_FONT, input, label, type Swatch } from './ui'

const opts = (rec: Record<string, string>) => Object.entries(rec).map(([value, label]) => ({ value, label }))
const divider = { borderTop: `1px solid ${LINE}`, paddingTop: 12 }
const r1 = (n: number) => Math.round(n * 10) / 10
const note = (text: string, key?: string) => h('div', { key, style: { fontSize: 11, color: DIM, lineHeight: 1.45 } }, text)

// Brand colors as tokens, so a design follows the kit when its colors change
const swatchesOf = (brand: Brand): Swatch[] => [
	...(['text', 'accent', 'accentAlt', 'muted', 'body', 'success', 'warning', 'danger', 'ink', 'page'] as (keyof BrandColors)[]).map(key => ({ value: key, label: `${COLOR_LABELS[key]} (brand)`, css: brand.colors[key] })),
	...brand.swatches.map(s => ({ value: s.value, label: s.label })),
	{ value: '#ffffff', label: 'White' },
	{ value: '#000000', label: 'Black' },
]
const LABEL_COLORS = [
	{ value: 'success', label: 'Good' },
	{ value: 'accent', label: 'Accent' },
	{ value: 'warning', label: 'Warning' },
	{ value: 'danger', label: 'Alert' },
]

const srcName = (src: string, brand: Brand) => brand.images.find(i => i.key === src)?.label ?? (mediaOf(src, brand) ? 'Library image' : src ? `"${src}" (not in the brand kit)` : 'None')
const srcOptions = (src: string, brand: Brand, none: string) => [{ value: '', label: none }, ...brand.images.map(i => ({ value: i.key, label: i.label })), ...(src && !brand.images.some(i => i.key === src) ? [{ value: src, label: srcName(src, brand) }] : [])]
const fontOptions = (current: string | undefined, brand: Brand, role: FontRole) => {
	const all = fontList(brand)
	return [{ value: '', label: `Brand ${role} font (${fontOf('', brand, role).label})` }, ...all.map(f => ({ value: f.id, label: f.label })), ...(current && !all.some(f => f.id === current) ? [{ value: current, label: `${current} (not in this kit)` }] : [])]
}

export const elLabel = (e: El, brand: Brand = DEFAULT_BRAND) => {
	const snippet =
		e.type === 'headline' || e.type === 'text' || e.type === 'badge'
			? e.text.replace(/\|/g, ' ')
			: e.type === 'card'
				? e.label || e.title
				: e.type === 'emblem'
					? e.icon
					: e.type === 'image'
						? srcName(e.src, brand)
						: e.type === 'shape'
							? e.shape === 'ellipse'
								? 'ellipse'
								: 'rectangle'
							: e.type === 'stack'
								? `${e.children.length} item${e.children.length === 1 ? '' : 's'}`
								: ''
	return e.name || (snippet ? `${EL_LABELS[e.type]} · ${snippet}` : EL_LABELS[e.type])
}

// Library picker in a floating sheet; mounted only while open
const PickerSheet = ({ title, value, onPick, onClose }: { title: string; value: string | null; onPick: (id: string) => void; onClose: () => void }) => {
	// the picker reports bare ids; strip the kino: scheme in case a build passes it through
	const pick = (id: string) => onPick(String(id).replace(/^kino:/, ''))
	return h(
		'div',
		{ style: { position: 'fixed', inset: 0, zIndex: 50, background: 'var(--kp-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }, onClick: onClose },
		h(
			'div',
			{
				onClick: (e: any) => e.stopPropagation(),
				style: { width: 'min(560px, 92vw)', height: 'min(520px, 86vh)', background: 'var(--kp-modal)', border: '1px solid rgba(var(--kp-ink),.12)', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px var(--kp-shadow-lg)' },
			},
			h('div', { style: { display: 'flex', alignItems: 'center', padding: '8px 10px', borderBottom: `1px solid ${LINE}`, gap: 8 } }, h('span', { style: { ...label, color: TEXT } }, title), h('div', { style: { flex: 1 } }), h(Btn, { label: 'Close', onClick: onClose })),
			h('div', { style: { flex: 1, minHeight: 0, overflow: 'auto' } }, h(MediaPicker as any, { kind: 'image', value: value ? `kino:${value}` : null, onAudition: () => {}, onPick: pick, onConfirm: pick })),
		),
	)
}

// Small picture of a library image, or a word about why there is none
const Thumb = ({ id, assets, media, size = 30 }: { id: string; assets: Record<string, string | undefined>; media?: Record<string, Media>; size?: number }) =>
	assets[id]
		? h('img', { src: assets[id], style: { height: size, maxWidth: size * 2.2, objectFit: 'contain', borderRadius: 3, background: 'rgba(var(--kp-ink),.06)', flex: 'none', display: 'block' } })
		: h('div', { style: { height: size, minWidth: size * 1.6, padding: '0 6px', borderRadius: 3, background: 'rgba(var(--kp-ink),.06)', color: media?.[id]?.missing ? RED : DIM, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', boxSizing: 'border-box' } }, !id ? 'none' : media?.[id]?.missing ? 'not found' : '...')

// A slider for an optional setting: "auto" until it is moved, with a way back
const optRange = (key: string, name: string, value: number | undefined, auto: number, min: number, max: number, step: number, fmt: (v: number) => string, onChange: (v: number | undefined) => void) =>
	h(
		Field,
		{ label: name, key, hint: value === undefined ? 'auto' : undefined },
		h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } }, h('div', { style: { flex: 1, minWidth: 0 } }, h(Range, { value: value ?? auto, min, max, step, onChange, fmt })), value !== undefined ? h(Btn, { label: 'Auto', title: 'Back to the default', onClick: () => onChange(undefined), style: { padding: '0 5px', fontSize: 10 } }) : null),
	)

const glyph = (path: any, on = true) => h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { opacity: on ? 1 : 0.9 } }, path)
// visibility toggle: an eye, so it does not read as a list bullet
const eye = (on: boolean) => glyph([h('path', { key: 1, d: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z' }), h('circle', { key: 2, cx: 12, cy: 12, r: 3 }), on ? null : h('path', { key: 3, d: 'M3 3l18 18' })])
const padlock = (on: boolean) => glyph([h('rect', { key: 1, x: 5, y: 11, width: 14, height: 9, rx: 2 }), h('path', { key: 2, d: on ? 'M8 11V7a4 4 0 0 1 8 0v4' : 'M8 11V7a4 4 0 0 1 7.5-2' })])
const iconBtn = (title: string, on: boolean, dim: boolean, onClick: () => void, child: any) =>
	h(
		'button',
		{
			title,
			onClick: (ev: any) => {
				ev.stopPropagation()
				onClick()
			},
			style: { width: 18, height: 18, padding: 0, border: 'none', background: 'none', cursor: 'pointer', color: on ? EMBER : dim ? 'rgba(var(--kp-ink),.3)' : DIM, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' },
		},
		child,
	)

// ---------- Edit tab ----------
type EditProps = {
	d: Design
	brand: Brand
	assets: Record<string, string | undefined>
	media: Record<string, Media>
	update: (fn: (d: Design) => Design) => void
	sel: string | null
	setSel: (id: string | null) => void
	rules: Rules | null
	advanced: boolean
	setAdvanced: (on: boolean) => void
	/** How many designs are ticked in the strip: the Set field then renames the set for all of them. */
	picked: number
	onSetName: (set: string) => void
	changed: string[]
	copied: ElStyle | null
	onCopyStyle: (e: El) => void
	onPasteStyle: (id: string) => void
	onDuplicate: (id: string) => void
	onOrder: (id: string, to: 'front' | 'back') => void
	onApply: (recipe: string) => void
	onDetach: (id: string) => void
	onUngroup: (id: string) => void
}

export const EditTab = (props: EditProps) => {
	const { d, brand, update, sel, setSel, rules, advanced } = props
	const [picking, setPicking] = useState<null | string>(null)
	const [recipe, setRecipe] = useState<string>(layoutOf(d.recipe) ?? d.recipe ?? 'hero')
	const p = platformOf(d.preset, rules)
	const recipes = [...opts(LAYOUTS), ...(rules?.recipes ?? []).filter(r => !r.platforms || r.platforms.includes(d.preset)).map(r => ({ value: r.id, label: `${r.name} (skill)` }))]
	const recipeValue = recipes.some(r => r.value === recipe) ? recipe : 'hero'
	const selected = sel ? findEl(d.elements, sel) : null
	const parent = sel ? parentOf(d.elements, sel) : undefined
	const setEl = (id: string, patch: Record<string, any>) => update(x => ({ ...x, elements: mapEl(x.elements, id, e => ({ ...e, ...patch }) as El) }))
	const setBg = (patch: Partial<Design['background']>) => update(x => ({ ...x, background: { ...x.background, ...patch } }))
	const bg = d.background
	const swatches = swatchesOf(brand)

	const add = (type: ElType) => {
		const safeW = (p.safe.w / p.w) * 100
		const textual = type === 'headline' || type === 'text' || type === 'badge'
		const e = makeEl(type, { x: 50, y: r1(((p.safe.y + p.safe.h / 2) / p.h) * 100), ...(textual ? { w: Math.min(safeW, 80) } : {}), ...(type === 'image' ? { src: brand.images[0]?.key ?? '' } : {}) })
		update(x => ({ ...x, elements: [...x.elements, e] }))
		setSel(e.id)
		if (type === 'image' && !brand.images.length) setPicking(e.id)
	}

	const layer = (e: El, depth: number, siblings: number, index: number) =>
		h(
			'div',
			{
				key: e.id,
				onClick: () => setSel(e.id),
				style: {
					display: 'flex',
					alignItems: 'center',
					gap: 4,
					height: 26,
					padding: `0 4px 0 ${4 + depth * 16}px`,
					borderRadius: 5,
					cursor: 'pointer',
					background: sel === e.id ? 'rgba(255,138,31,.16)' : 'transparent',
					border: `1px solid ${sel === e.id ? 'rgba(255,138,31,.45)' : 'transparent'}`,
				},
			},
			iconBtn(e.visible === false ? 'Show' : 'Hide', false, e.visible === false, () => setEl(e.id, { visible: e.visible === false }), eye(e.visible !== false)),
			iconBtn(e.locked ? 'Unlock' : 'Lock: keep it from being picked or moved in the preview', !!e.locked, !e.locked, () => setEl(e.id, { locked: e.locked ? undefined : true }), padlock(!!e.locked)),
			h('span', { style: { flex: 1, minWidth: 0, fontSize: 12, color: e.visible === false ? DIM : TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, elLabel(e, brand)),
			props.changed.includes(e.id) ? h('span', { title: 'Just changed from outside the panel', className: 'kino-thumbs-pulse', style: { width: 6, height: 6, borderRadius: 3, background: GREEN, flex: 'none' } }) : null,
			h(Btn, { label: '↑', title: 'Draw earlier (behind)', disabled: index === 0, onClick: () => update(x => ({ ...x, elements: moveEl(x.elements, e.id, -1) })), style: { padding: '0 6px' } }),
			h(Btn, { label: '↓', title: 'Draw later (in front)', disabled: index === siblings - 1, onClick: () => update(x => ({ ...x, elements: moveEl(x.elements, e.id, 1) })), style: { padding: '0 6px' } }),
			h(Btn, {
				label: '×',
				title: 'Delete',
				onClick: () => {
					update(x => ({ ...x, elements: removeEl(x.elements, e.id) }))
					if (sel === e.id) setSel(null)
				},
				style: { padding: '0 7px' },
			}),
		)

	const layers = d.elements.flatMap((e, i) => [layer(e, 0, d.elements.length, i), ...(e.type === 'stack' ? e.children.map((c, j) => layer(c, 1, e.children.length, j)) : [])])
	const bgMedia = mediaOf(bg.src, brand)
	const pickingEl = picking && picking !== 'bg' ? findEl(d.elements, picking) : null

	return h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 14 } },
		picking
			? h(PickerSheet, {
					title: 'Pick an image from the library',
					value: picking === 'bg' ? bgMedia || null : pickingEl && (pickingEl.type === 'image' || pickingEl.type === 'logo') ? mediaOf(pickingEl.src ?? '', brand) || null : null,
					onClose: () => setPicking(null),
					onPick: (id: string) => {
						if (picking === 'bg') setBg({ src: id })
						else setEl(picking, { src: id })
						setPicking(null)
					},
				})
			: null,

		h(
			Section,
			{ title: 'Design' },
			h(
				Grid,
				null,
				h(Field, { label: 'Name' }, h(TextIn, { value: d.name, onChange: name => update(x => ({ ...x, name })) })),
				h(Field, { label: 'Set', hint: props.picked > 1 ? `for all ${props.picked} selected` : undefined }, h(TextIn, { value: d.set, placeholder: 'Group name', onChange: props.onSetName })),
				h(Field, { label: 'Size', wide: true }, h(Select, { value: d.preset, options: Object.entries(PRESETS).map(([value, pr]) => ({ value, label: `${pr.label}  ${pr.w}x${pr.h}` })), onChange: preset => update(x => ({ ...x, preset: preset as PresetId })) })),
			),
			h(
				'div',
				{ style: { display: 'flex', gap: 6, alignItems: 'center' } },
				h('div', { style: { flex: 1, minWidth: 0 } }, h(Select, { value: recipeValue, options: recipes, onChange: setRecipe })),
				h(Btn, { label: 'Apply layout', title: 'Rebuild the elements from this layout, keeping the words and the background image', onClick: () => props.onApply(recipeValue) }),
			),
			d.prompt ? h('div', { style: { fontSize: 11, color: DIM, lineHeight: 1.45, overflowWrap: 'anywhere' } }, h('span', { style: { color: 'rgba(var(--kp-ink),.7)' } }, 'Brief: '), d.prompt) : null,
		),

		h(
			'div',
			{ style: divider },
			h(
				Section,
				{
					title: 'Layers',
					right: h(
						'div',
						{ style: { width: 150 } },
						h(Select, {
							value: '',
							options: [{ value: '', label: '+ Add element' }, ...(Object.keys(EL_LABELS) as ElType[]).filter(t => t !== 'stack').map(t => ({ value: t, label: EL_LABELS[t] }))],
							onChange: v => v && add(v as ElType),
						}),
					),
				},
				layers.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 1 } }, ...layers) : note('No elements. Add one, or apply a layout.'),
				note('Click an element in the preview to select it. Drag to move, drag the corner square to resize. Arrow keys nudge (Shift bigger, Alt finer).'),
			),
		),

		selected
			? h(
					'div',
					{ style: divider },
					h(Inspector, { e: selected, parent, d, brand, assets: props.assets, media: props.media, swatches, safe: p.safe, setEl, setPicking, advanced, setAdvanced: props.setAdvanced, copied: props.copied, onCopyStyle: props.onCopyStyle, onPasteStyle: props.onPasteStyle, onDuplicate: props.onDuplicate, onOrder: props.onOrder, onDetach: props.onDetach, onUngroup: props.onUngroup }),
				)
			: null,

		h(
			'div',
			{ style: divider },
			h(
				Section,
				{ title: 'Background', right: h(Btn, { label: advanced ? 'Fewer settings' : 'More settings', onClick: () => props.setAdvanced(!advanced) }) },
				h(
					'div',
					{ style: { display: 'flex', gap: 6, alignItems: 'center' } },
					bgMedia ? h(Thumb, { id: bgMedia, assets: props.assets, media: props.media }) : null,
					h('div', { style: { flex: 1, minWidth: 0 } }, h(Select, { value: bg.src, options: srcOptions(bg.src, brand, 'No image, a plain color'), onChange: src => setBg({ src }) })),
					h(Btn, { label: 'From library...', title: 'Use any image in the Kino library', onClick: () => setPicking('bg') }),
				),
				bg.src && !bgMedia ? note(`"${bg.src}" is an image name from a brand kit this project does not have. Pick an image, or add it under Brand.`) : null,
				h(
					Grid,
					null,
					...(bg.src
						? [
								h(Field, { label: 'Focus X', key: 'fx' }, h(Range, { value: bg.focusX, min: 0, max: 100, step: 1, onChange: focusX => setBg({ focusX }), fmt: v => `${v}%` })),
								h(Field, { label: 'Focus Y', key: 'fy' }, h(Range, { value: bg.focusY, min: 0, max: 100, step: 1, onChange: focusY => setBg({ focusY }), fmt: v => `${v}%` })),
								h(Field, { label: 'Zoom', key: 'z' }, h(Range, { value: bg.zoom, min: 1, max: 3, step: 0.01, onChange: zoom => setBg({ zoom }), fmt: v => `${v.toFixed(2)}x` })),
								h(Field, { label: 'Dim', key: 'dim' }, h(Range, { value: bg.dim, min: 0, max: 0.9, step: 0.01, onChange: dim => setBg({ dim }), fmt: v => `${Math.round(v * 100)}%` })),
							]
						: [
								h(Field, { label: 'Color', wide: true, key: 'c1' }, h(ColorIn, { value: bg.color, swatches, onChange: color => setBg({ color }) })),
								h(Field, { label: 'Gradient to', wide: true, key: 'c2', hint: 'Auto for a flat color' }, h(ColorIn, { value: bg.color2, swatches, onChange: color2 => setBg({ color2 }) })),
							]),
					h(Field, { label: 'Shade' }, h(Select, { value: bg.shade, options: opts(SHADES), onChange: shade => setBg({ shade: shade as Design['background']['shade'] }) })),
					h(Field, { label: 'Shade amount' }, h(Range, { value: bg.shadeAmount, min: 0, max: 1, step: 0.01, onChange: shadeAmount => setBg({ shadeAmount }), fmt: v => `${Math.round(v * 100)}%` })),
					...(advanced && bg.src
						? [
								h(Field, { label: 'Blur', key: 'bl' }, h(Range, { value: bg.blur, min: 0, max: 40, step: 1, onChange: blur => setBg({ blur }), fmt: v => `${v}px` })),
								h(Field, { label: 'Saturation', key: 'sat' }, h(Range, { value: bg.saturate, min: 0, max: 2, step: 0.01, onChange: saturate => setBg({ saturate }), fmt: v => `${Math.round(v * 100)}%` })),
								h(Field, { label: 'Contrast', key: 'con' }, h(Range, { value: bg.contrast, min: 0.5, max: 1.6, step: 0.01, onChange: contrast => setBg({ contrast }), fmt: v => `${Math.round(v * 100)}%` })),
								h(Field, { label: 'Mirror', key: 'flip' }, h(Toggle, { value: !!bg.flip, label: 'Flip left to right', onChange: flip => setBg({ flip: flip || undefined }) })),
								h(Field, { label: 'Tint', wide: true, key: 'tint', hint: 'a color wash over the picture' }, h(ColorIn, { value: bg.tint, swatches, onChange: tint => setBg({ tint, tintAmount: tint ? (bg.tintAmount ?? 0.35) : undefined }) })),
								bg.tint ? h(Field, { label: 'Tint amount', key: 'ta' }, h(Range, { value: bg.tintAmount ?? 0.35, min: 0, max: 1, step: 0.01, onChange: tintAmount => setBg({ tintAmount }), fmt: v => `${Math.round(v * 100)}%` })) : null,
							]
						: []),
					...(advanced ? [h(Field, { label: 'Shade color', wide: true, key: 'shc' }, h(ColorIn, { value: bg.shadeColor, swatches, onChange: shadeColor => setBg({ shadeColor }) }))] : []),
				),
			),
		),
	)
}

// ---------- selected element ----------
type InspectorProps = {
	e: El
	parent?: StackEl
	d: Design
	brand: Brand
	assets: Record<string, string | undefined>
	media: Record<string, Media>
	swatches: Swatch[]
	safe: { x: number; y: number; w: number; h: number }
	setEl: (id: string, patch: Record<string, any>) => void
	setPicking: (v: string) => void
	advanced: boolean
	setAdvanced: (on: boolean) => void
	copied: ElStyle | null
	onCopyStyle: (e: El) => void
	onPasteStyle: (id: string) => void
	onDuplicate: (id: string) => void
	onOrder: (id: string, to: 'front' | 'back') => void
	onDetach: (id: string) => void
	onUngroup: (id: string) => void
}

const ALIGN_OPTS = [
	{ value: '', label: 'Auto', title: 'Follows the anchor' },
	{ value: 'start', label: 'Left' },
	{ value: 'center', label: 'Center' },
	{ value: 'end', label: 'Right' },
]
const CASE_OPTS = [
	{ value: '', label: 'Auto', title: "The font's own default" },
	{ value: 'upper', label: 'UPPER' },
	{ value: 'typed', label: 'As typed' },
]
const pct = (v: number) => `${Math.round(v * 100)}%`

const Inspector = (props: InspectorProps) => {
	const { e, parent, d, brand, swatches, setEl, setPicking, advanced } = props
	const set = (patch: Record<string, any>) => setEl(e.id, patch)
	const p = PRESETS[d.preset]
	const more = advanced
	const vert = e.anchor === 'c' ? 'c' : e.anchor[0]
	const horiz = e.anchor === 'c' ? 'c' : e.anchor[1]
	const join = (v: string, hz: string) => (v === 'c' && hz === 'c' ? 'c' : `${v}${hz}`) as Anchor
	const left = r1((props.safe.x / p.w) * 100)
	const right = r1(((props.safe.x + props.safe.w) / p.w) * 100)
	const top = r1((props.safe.y / p.h) * 100)
	const bottom = r1(((props.safe.y + props.safe.h) / p.h) * 100)
	const tiny = { padding: '0 6px' }
	const placement = !parent
		? [
				h(Field, { label: 'X', key: 'x' }, h(Range, { value: r1(e.x), min: -10, max: 110, step: 0.1, onChange: x => set({ x }), fmt: v => `${v.toFixed(1)}%` })),
				h(Field, { label: 'Y', key: 'y' }, h(Range, { value: r1(e.y), min: -10, max: 110, step: 0.1, onChange: y => set({ y }), fmt: v => `${v.toFixed(1)}%` })),
				h(
					Field,
					{ label: 'Align', key: 'al', hint: 'to the safe area and the frame center', wide: true },
					h(
						'div',
						{ style: { display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' } },
						h(Btn, { label: 'Left', style: tiny, onClick: () => set({ x: left, anchor: join(vert, 'l') }) }),
						h(Btn, { label: 'Center', title: 'X 50%, anchored on its middle', style: tiny, onClick: () => set({ x: 50, anchor: join(vert, 'c') }) }),
						h(Btn, { label: 'Right', style: tiny, onClick: () => set({ x: right, anchor: join(vert, 'r') }) }),
						h('span', { style: { width: 6 } }),
						h(Btn, { label: 'Top', style: tiny, onClick: () => set({ y: top, anchor: join('t', horiz) }) }),
						h(Btn, { label: 'Middle', title: 'Y 50%, anchored on its middle', style: tiny, onClick: () => set({ y: 50, anchor: join('c', horiz) }) }),
						h(Btn, { label: 'Bottom', style: tiny, onClick: () => set({ y: bottom, anchor: join('b', horiz) }) }),
					),
				),
				more ? h(Field, { label: 'Anchor', key: 'a', hint: 'the point placed on X, Y' }, h(AnchorPicker, { value: e.anchor, onChange: a => set({ anchor: a as Anchor }) })) : null,
			]
		: []
	const textual = e.type === 'headline' || e.type === 'text' || e.type === 'badge'
	const common = [
		e.type !== 'emblem' && e.type !== 'stack' ? h(Field, { label: textual ? 'Max width' : 'Width', key: 'w' }, h(Range, { value: r1(e.w), min: 2, max: 100, step: 0.1, onChange: w => set({ w }), fmt: v => `${v.toFixed(0)}%` })) : null,
		h(Field, { label: 'Rotate', key: 'r' }, h(Range, { value: e.rotate ?? 0, min: -180, max: 180, step: 1, onChange: rotate => set({ rotate }), fmt: v => `${v}°` })),
		h(Field, { label: 'Opacity', key: 'o' }, h(Range, { value: e.opacity ?? 1, min: 0.05, max: 1, step: 0.01, onChange: opacity => set({ opacity }), fmt: pct })),
		more ? h(Field, { label: 'Layer name', key: 'n' }, h(TextIn, { value: e.name ?? '', placeholder: 'optional', onChange: name => set({ name: name || undefined }) })) : null,
	]
	const color = (key: string, name: string, field: string, none = false) => h(Field, { label: name, wide: true, key }, h(ColorIn, { value: (e as any)[field], swatches, none, onChange: v => set({ [field]: v }) }))
	const fontField = (key: string, name: string, field: string, role: FontRole) => h(Field, { label: name, wide: true, key }, h(Select, { value: (e as any)[field] ?? '', options: fontOptions((e as any)[field], brand, role), onChange: v => set({ [field]: field === 'font' && (e.type === 'headline' || e.type === 'text') ? v : v || undefined }) }))
	const weightField = (key: string, role: FontRole, fontId: string | undefined, value: number | undefined, auto: boolean) => {
		const f = fontOf(fontId, brand, role)
		const list = [...(auto ? [{ value: '', label: 'Auto' }] : []), ...f.weights.map(w => ({ value: String(w), label: String(w) }))]
		const current = value === undefined ? '' : String(f.weights.reduce((best, w) => (Math.abs(w - value) < Math.abs(best - value) ? w : best), f.weights[0]))
		return h(Field, { label: 'Weight', key, hint: f.weights.length === 1 ? 'one weight in this font' : undefined }, h(Select, { value: current, options: list, onChange: v => set({ weight: v ? Number(v) : undefined }) }))
	}
	const imagePick = (key: string, name: string, src: string, none: string) =>
		h(
			Field,
			{ label: name, wide: true, key },
			h(
				'div',
				{ style: { display: 'flex', gap: 6, alignItems: 'center' } },
				mediaOf(src, brand) ? h(Thumb, { id: mediaOf(src, brand), assets: props.assets, media: props.media }) : null,
				h('div', { style: { flex: 1, minWidth: 0 } }, h(Select, { value: src, options: srcOptions(src, brand, none), onChange: v => set({ src: v || (e.type === 'logo' ? undefined : '') }) })),
				h(Btn, { label: 'From library...', onClick: () => setPicking(e.id) }),
			),
		)

	let fields: any[] = []
	switch (e.type) {
		case 'headline': {
			const f = fontOf(e.font, brand, 'headline')
			fields = [
				h(Field, { label: 'Headline', hint: '| breaks a line', wide: true, key: 't' }, h(TextIn, { value: e.text, onChange: text => set({ text }) })),
				h(Field, { label: 'Accent word', key: 'ac' }, h(TextIn, { value: e.accent, placeholder: 'drawn in the accent color', onChange: accent => set({ accent }) })),
				h(Field, { label: 'Size', key: 's', hint: 'shrinks to fit' }, h(Range, { value: e.size, min: 30, max: 480, step: 1, onChange: size => set({ size }), fmt: v => `${v}` })),
				fontField('f', 'Font', 'font', 'headline'),
				h(Field, { label: 'Treatment', wide: true, key: 'tr' }, h(Segmented, { value: e.treatment, options: opts(TREATMENTS), onChange: treatment => set({ treatment }) })),
				color('c', 'Text color', 'color'),
				color('cc', 'Accent color', 'accentColor'),
				...(more
					? [
							weightField('wt', 'headline', e.font, e.weight ?? f.weight, true),
							h(Field, { label: 'Case', key: 'cs' }, h(Segmented, { value: e.upper === undefined ? '' : e.upper ? 'upper' : 'typed', options: CASE_OPTS, onChange: v => set({ upper: v === '' ? undefined : v === 'upper' }) })),
							optRange('tk', 'Letter spacing', e.tracking, f.tracking, -0.08, 0.4, 0.005, v => v.toFixed(3), tracking => set({ tracking })),
							optRange('lh', 'Line height', e.lineHeight, f.lh, 0.7, 1.6, 0.01, v => v.toFixed(2), lineHeight => set({ lineHeight })),
							h(Field, { label: 'Line align', wide: true, key: 'aln' }, h(Segmented, { value: e.align ?? '', options: ALIGN_OPTS, onChange: v => set({ align: v || undefined }) })),
							optRange('st', 'Outline', e.stroke, e.treatment === 'outline' ? 0.075 : 0, 0, 0.2, 0.005, v => `${(v * 100).toFixed(1)}%`, stroke => set({ stroke })),
							optRange('sh', 'Shadow', e.shadow, e.treatment === 'plain' || e.treatment === 'box' ? 0 : 1, 0, 2, 0.05, pct, shadow => set({ shadow })),
							color('sc', 'Outline color', 'strokeColor'),
							e.treatment === 'box' ? color('bc', 'Box color', 'boxColor') : null,
							e.treatment === 'neon' ? color('gc', 'Glow color', 'glowColor') : null,
						]
					: []),
			]
			break
		}
		case 'text':
			fields = [
				h(Field, { label: 'Text', hint: '| breaks a line', wide: true, key: 't' }, h(TextIn, { value: e.text, onChange: text => set({ text }) })),
				h(Field, { label: 'Size', key: 's' }, h(Range, { value: e.size, min: 10, max: 260, step: 1, onChange: size => set({ size }), fmt: v => `${v}` })),
				weightField('wt', 'text', e.font, e.weight, false),
				fontField('f', 'Font', 'font', 'text'),
				h(Field, { label: 'Case', key: 'u' }, h(Toggle, { value: e.upper, label: 'Uppercase', onChange: upper => set({ upper }) })),
				h(Field, { label: 'Letter spacing', key: 'tk' }, h(Range, { value: e.tracking, min: -0.05, max: 0.5, step: 0.01, onChange: tracking => set({ tracking }), fmt: v => v.toFixed(2) })),
				color('c', 'Color', 'color'),
				...(more
					? [
							optRange('lh', 'Line height', e.lineHeight, 1.2, 0.8, 2, 0.01, v => v.toFixed(2), lineHeight => set({ lineHeight })),
							optRange('sh', 'Shadow', e.shadow, 1, 0, 2, 0.05, pct, shadow => set({ shadow })),
							h(Field, { label: 'Line align', wide: true, key: 'aln' }, h(Segmented, { value: e.align ?? '', options: ALIGN_OPTS, onChange: v => set({ align: v || undefined }) })),
							optRange('st', 'Outline', e.stroke, 0, 0, 0.2, 0.005, v => `${(v * 100).toFixed(1)}%`, stroke => set({ stroke: stroke || undefined })),
							color('sc', 'Outline color', 'strokeColor'),
						]
					: []),
			]
			break
		case 'badge':
			fields = [
				h(Field, { label: 'Badge text', key: 't' }, h(TextIn, { value: e.text, placeholder: 'e.g. NEW', onChange: text => set({ text }) })),
				h(Field, { label: 'Size', key: 's' }, h(Range, { value: e.size, min: 14, max: 200, step: 1, onChange: size => set({ size }), fmt: v => `${v}` })),
				color('f', 'Fill', 'fill'),
				color('c', 'Text color', 'color'),
				...(more
					? [
							fontField('ff', 'Font', 'font', 'text'),
							weightField('wt', 'text', e.font, e.weight ?? 800, true),
							h(Field, { label: 'Case', key: 'u' }, h(Toggle, { value: e.upper !== false, label: 'Uppercase', onChange: upper => set({ upper: upper ? undefined : false }) })),
							optRange('tk', 'Letter spacing', e.tracking, 0.06, -0.05, 0.4, 0.01, v => v.toFixed(2), tracking => set({ tracking })),
							h(Field, { label: 'Round corners', key: 'rd' }, h(Range, { value: e.radius ?? 0, min: 0, max: 1, step: 0.05, onChange: radius => set({ radius: radius || undefined }), fmt: pct })),
						]
					: []),
			]
			break
		case 'logo':
			fields = [
				h(Field, { label: 'Glow', key: 'g' }, h(Range, { value: e.glow, min: 0, max: 1, step: 0.01, onChange: glow => set({ glow }), fmt: pct })),
				!e.src && !brand.logo.media ? note(brand.name ? 'No logo image in the brand kit, so the brand name is drawn as a wordmark. Set a logo under Brand.' : 'Nothing to draw yet: set a logo or a name under Brand, or pick an image for this element.', 'nl') : null,
				...(more ? [color('gc', 'Glow color', 'glowColor'), imagePick('src', 'Image', e.src ?? '', 'The brand logo')] : []),
			]
			break
		case 'card':
			fields = [
				h(Field, { label: 'Label', key: 'st' }, h(TextIn, { value: e.label, placeholder: 'empty hides it', onChange: v => set({ label: v }) })),
				h(Field, { label: 'Label light', key: 'd' }, h(Toggle, { value: e.dot, label: 'Glowing dot', onChange: dot => set({ dot }) })),
				h(Field, { label: 'Label color', wide: true, key: 'sc' }, h(Segmented, { value: LABEL_COLORS.some(o => o.value === e.labelColor) ? e.labelColor : '', options: LABEL_COLORS, onChange: labelColor => set({ labelColor }) })),
				h(Field, { label: 'Title', key: 'sv' }, h(TextIn, { value: e.title, placeholder: 'empty hides it', onChange: title => set({ title }) })),
				h(Field, { label: 'Detail', key: 'pl' }, h(TextIn, { value: e.detail, placeholder: 'empty hides it', onChange: detail => set({ detail }) })),
				h(Field, { label: 'Detail icon', key: 'ic' }, h(Select, { value: e.icon, options: [{ value: '', label: 'None' }, ...iconNames(brand).map(v => ({ value: v, label: v })), ...(e.icon && !iconNames(brand).includes(e.icon) ? [{ value: e.icon, label: `${e.icon} (not in this kit)` }] : [])], onChange: icon => set({ icon }) })),
				...(more ? [h(Field, { label: 'Custom label color', wide: true, key: 'lc' }, h(ColorIn, { value: LABEL_COLORS.some(o => o.value === e.labelColor) ? undefined : e.labelColor, swatches, onChange: v => set({ labelColor: v ?? 'success' }) })), fontField('tf', 'Title font', 'titleFont', 'display')] : []),
			]
			break
		case 'rule':
			fields = [
				color('c', 'Color', 'color'),
				...(more
					? [
							h(Field, { label: 'Thickness', key: 'th', hint: 'plain line' }, h(Range, { value: e.thickness ?? 3, min: 1, max: 30, step: 1, onChange: thickness => set({ thickness }), fmt: v => `${v}` })),
							brand.divider ? h(Field, { label: 'Style', key: 'pl' }, h(Toggle, { value: !e.plain, label: 'Brand ornament', onChange: on => set({ plain: on ? undefined : true }) })) : null,
						]
					: []),
			]
			break
		case 'emblem':
			fields = [
				h(Field, { label: 'Icon', key: 'i' }, h(Select, { value: e.icon, options: [...iconNames(brand).map(v => ({ value: v, label: v })), ...(iconNames(brand).includes(e.icon) ? [] : [{ value: e.icon, label: `${e.icon} (not in this kit)` }])], onChange: icon => set({ icon }) })),
				h(Field, { label: 'Size', key: 's' }, h(Range, { value: e.size, min: 24, max: 700, step: 1, onChange: size => set({ size }), fmt: v => `${v}` })),
				color('c', 'Color', 'color'),
			]
			break
		case 'image':
			fields = [
				imagePick('src', 'Image', e.src, 'No image yet'),
				e.src && !mediaOf(e.src, brand) ? note(`"${e.src}" is an image name from a brand kit this project does not have.`, 'ni') : null,
				h(Field, { label: 'Height', key: 'hh', hint: '0 keeps the ratio' }, h(Range, { value: e.h ?? 0, min: 0, max: 100, step: 0.5, onChange: v => set({ h: v || undefined }), fmt: v => (v ? `${v}%` : 'auto') })),
				h(Field, { label: 'Fit', key: 'fit' }, h(Segmented, { value: e.fit, options: [{ value: 'cover', label: 'Fill' }, { value: 'contain', label: 'Fit' }], onChange: fit => set({ fit }) })),
				h(Field, { label: 'Frame', key: 'b' }, h(Toggle, { value: e.border, label: 'Border', onChange: border => set({ border }) })),
				h(Field, { label: 'Shadow', key: 'sh' }, h(Toggle, { value: e.shadow, label: 'Drop shadow', onChange: shadow => set({ shadow }) })),
				h(Field, { label: 'Round corners', key: 'rd', hint: '50% makes a circle' }, h(Range, { value: e.radius ?? 0, min: 0, max: 50, step: 1, onChange: radius => set({ radius: radius || undefined }), fmt: v => `${v}%` })),
				...(more
					? [
							h(Field, { label: 'Mirror', key: 'fl' }, h(Toggle, { value: !!e.flip, label: 'Flip left to right', onChange: flip => set({ flip: flip || undefined }) })),
							e.h ? optRange('fx', 'Crop focus X', e.focusX, 50, 0, 100, 1, v => `${v}%`, focusX => set({ focusX })) : null,
							e.h ? optRange('fy', 'Crop focus Y', e.focusY, 50, 0, 100, 1, v => `${v}%`, focusY => set({ focusY })) : null,
							e.border ? optRange('bw', 'Border width', e.borderWidth, 4, 1, 40, 1, v => `${v}`, borderWidth => set({ borderWidth })) : null,
							e.border ? color('bc', 'Border color', 'borderColor') : null,
						]
					: []),
			]
			break
		case 'shape':
			fields = [
				h(Field, { label: 'Shape', key: 'sp' }, h(Segmented, { value: e.shape, options: [{ value: 'rect', label: 'Rectangle' }, { value: 'ellipse', label: 'Ellipse' }], onChange: shape => set({ shape }) })),
				h(Field, { label: 'Height', key: 'hh' }, h(Range, { value: e.h, min: 0.2, max: 100, step: 0.1, onChange: v => set({ h: v }), fmt: v => `${v.toFixed(1)}%` })),
				color('f', 'Fill', 'fill', true),
				h(Field, { label: 'Border', key: 'bw' }, h(Range, { value: e.borderWidth, min: 0, max: 40, step: 1, onChange: borderWidth => set({ borderWidth }), fmt: v => `${v}` })),
				e.shape === 'rect' ? h(Field, { label: 'Round corners', key: 'rd' }, h(Range, { value: e.radius, min: 0, max: 200, step: 1, onChange: radius => set({ radius }), fmt: v => `${v}` })) : null,
				e.borderWidth > 0 ? color('bc', 'Border color', 'borderColor') : null,
				h(Field, { label: 'Shadow', key: 'sh' }, h(Toggle, { value: e.shadow, label: 'Drop shadow', onChange: shadow => set({ shadow }) })),
			]
			break
		case 'arrow':
			fields = [color('c', 'Color', 'color'), more ? color('sc', 'Outline color', 'strokeColor') : null, note('Rotate points it: 0 is right, 90 down, 180 left.', 'ar')]
			break
		case 'stack':
			fields = [
				h(Field, { label: 'Gap', key: 'g' }, h(Range, { value: e.gap, min: 0, max: 160, step: 1, onChange: gap => set({ gap }), fmt: v => `${v}` })),
				h(Field, { label: 'Align', key: 'al' }, h(Segmented, { value: e.align, options: [{ value: 'start', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'end', label: 'Right' }], onChange: align => set({ align }) })),
			]
			break
	}

	return h(
		Section,
		{
			title: `${EL_LABELS[e.type]}${parent ? ' (in a stack)' : ''}`,
			right: h(Btn, { label: advanced ? 'Fewer settings' : 'More settings', title: 'Weight, spacing, outline, shadow and other fine settings', onClick: () => props.setAdvanced(!advanced) }),
		},
		h(
			'div',
			{ style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
			h(Btn, { label: 'Duplicate', onClick: () => props.onDuplicate(e.id) }),
			h(Btn, { label: 'Copy style', title: 'Copy font, colors and effects', onClick: () => props.onCopyStyle(e) }),
			h(Btn, { label: 'To front', title: 'Draw it on top of its siblings', onClick: () => props.onOrder(e.id, 'front') }),
			h(Btn, { label: 'To back', title: 'Draw it behind its siblings', onClick: () => props.onOrder(e.id, 'back') }),
			props.copied ? h(Btn, { label: 'Paste style', title: `Apply the style copied from a ${EL_LABELS[props.copied.type].toLowerCase()}`, onClick: () => props.onPasteStyle(e.id) }) : null,
			parent ? h(Btn, { label: 'Move out of stack', title: 'Place it on its own, where it is now', onClick: () => props.onDetach(e.id) }) : null,
			e.type === 'stack' ? h(Btn, { label: 'Ungroup', title: 'Turn every item into its own freely placed element', onClick: () => props.onUngroup(e.id) }) : null,
		),
		h(Grid, null, ...fields, ...placement, ...common),
		e.locked ? note('Locked: it cannot be picked or moved in the preview. Unlock it in the layer list.') : null,
		e.type === 'stack' ? note(`Items move together and resizing scales all of them. ${p.short} frame ${p.w}x${p.h}.`) : null,
		parent ? note('Position comes from the stack. Drag the stack, or move this out of it to place it freely.') : null,
	)
}

// ---------- Brand tab ----------
type BrandProps = {
	brand: Brand
	exists: boolean
	update: (fn: (brand: Brand) => Brand) => void
	assets: Record<string, string | undefined>
	media: Record<string, Media>
}

const colorWell = (key: string, name: string, value: string, onChange: (v: string) => void) =>
	h(
		Field,
		{ label: name, key },
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'center', gap: 6 } },
			h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000', onChange: (e: any) => onChange(e.target.value), style: { width: 26, height: 24, padding: 0, border: 'none', background: 'none', cursor: 'pointer', flex: 'none' } }),
			h('input', { value, placeholder: 'none', onChange: (e: any) => onChange(e.target.value), spellCheck: false, style: { ...input, fontFamily: MONO, fontSize: 11 } }),
		),
	)

export const BrandTab = ({ brand, exists, update, assets, media }: BrandProps) => {
	const [picking, setPicking] = useState<null | 'logo' | 'image'>(null)
	const setColor = (key: keyof BrandColors, value: string) => update(b => ({ ...b, colors: { ...b.colors, [key]: value } }))
	const setFont = (role: FontRole, id: string) => update(b => ({ ...b, fonts: { ...b.fonts, [role]: id } }))
	const fonts = fontList(brand).map(f => ({ value: f.id, label: f.label }))
	const fontSelect = (role: FontRole, name: string, hint: string) =>
		h(Field, { label: name, hint, key: role, wide: true }, h(Select, { value: brand.fonts[role], options: fonts.some(f => f.value === brand.fonts[role]) ? fonts : [...fonts, { value: brand.fonts[role], label: `${brand.fonts[role]} (not available)` }], onChange: id => setFont(role, id) }))
	const addImage = (id: string) =>
		update(b => {
			if (b.images.some(i => i.media === id)) return b
			let n = b.images.length + 1
			while (b.images.some(i => i.key === `image-${n}`)) n++
			return { ...b, images: [...b.images, { key: `image-${n}`, label: `Image ${n}`, media: id }] }
		})
	return h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 14 } },
		picking
			? h(PickerSheet, {
					title: picking === 'logo' ? 'Pick your logo from the library' : 'Add a brand image from the library',
					value: picking === 'logo' ? brand.logo.media || null : null,
					onClose: () => setPicking(null),
					onPick: (id: string) => {
						if (picking === 'logo') update(b => ({ ...b, logo: { media: id } }))
						else addImage(id)
						setPicking(null)
					},
				})
			: null,
		h(
			Section,
			{ title: 'Brand kit' },
			note(`What every thumbnail in this project is drawn with. ${exists ? 'Saved' : 'It is saved'} in ${BRAND_PATH}${exists ? '' : ' on the first change'}, where the agent reads it too.`),
			h(Field, { label: 'Name', hint: 'channel or product' }, h(TextIn, { value: brand.name, placeholder: 'Shown in the feed previews, and as a wordmark when there is no logo', onChange: name => update(b => ({ ...b, name })) })),
		),
		h(
			'div',
			{ style: divider },
			h(
				Section,
				{ title: 'Logo' },
				h(
					'div',
					{ style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
					h(Thumb, { id: brand.logo.media, assets, media, size: 40 }),
					h(Btn, { label: brand.logo.media ? 'Change...' : 'Pick from library...', onClick: () => setPicking('logo') }),
					brand.logo.media ? h(Btn, { label: 'Remove', onClick: () => update(b => ({ ...b, logo: { media: '' } })) }) : null,
				),
				note('A PNG with a transparent background works best. It is what the Logo element draws.'),
			),
		),
		h(
			'div',
			{ style: divider },
			h(
				Section,
				{ title: 'Images', right: h(Btn, { label: '+ Add from library...', onClick: () => setPicking('image') }) },
				brand.images.length
					? h(
							'div',
							{ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
							...brand.images.map(image =>
								h(
									'div',
									{ key: image.key, style: { display: 'flex', gap: 6, alignItems: 'center' } },
									h(Thumb, { id: image.media, assets, media }),
									h('div', { style: { flex: 1, minWidth: 0 } }, h(TextIn, { value: image.label, onChange: text => update(b => ({ ...b, images: b.images.map(i => (i.key === image.key ? { ...i, label: text } : i)) })) })),
									h('span', { title: 'The name designs and the agent use for this image', style: { fontFamily: MONO, fontSize: 10, color: DIM, flex: 'none', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, image.key),
									h(Btn, { label: '×', title: 'Remove from the kit. Designs that use it show an empty image until you pick another.', onClick: () => update(b => ({ ...b, images: b.images.filter(i => i.key !== image.key) })), style: { padding: '0 7px' } }),
								),
							),
						)
					: note('Key art, backgrounds and product shots you reuse. They show up by name in every image list, and the agent can ask for them by name. Any other library image still works through "From library...".'),
			),
		),
		h(
			'div',
			{ style: divider },
			h(
				Section,
				{ title: 'Colors', right: h(Btn, { label: 'Reset', title: 'Back to the neutral colors', onClick: () => update(b => ({ ...b, colors: DEFAULT_BRAND.colors })) }) },
				h(Grid, null, ...(Object.keys(COLOR_LABELS) as (keyof BrandColors)[]).map(key => colorWell(key, COLOR_LABELS[key], brand.colors[key], v => setColor(key, v)))),
				note('Elements set to Auto, or to one of the brand swatches, follow these. Any CSS color works in the text boxes.'),
			),
		),
		h(
			'div',
			{ style: divider },
			h(
				Section,
				{ title: 'Fonts' },
				h(Grid, null, fontSelect('headline', 'Headlines', ''), fontSelect('text', 'Small text and badges', ''), fontSelect('display', 'Card titles and wordmark', '')),
				...brand.fonts.custom.map(f => {
					const state = fontState(fontOf(f.id, brand, 'text'))
					return h('div', { key: f.id, style: { fontSize: 11, color: state === 'failed' ? RED : DIM } }, `${f.label}: ${state === 'failed' ? 'did not load, check its url in the brand file' : state === 'ready' ? 'loaded' : state === 'loading' ? 'loading' : 'loads when a design uses it'}`)
				}),
				note(`Your own font files, extra icons, a divider ornament and extra swatches go in ${BRAND_PATH} by hand or through the agent. /thumbs/skill/format.md lists the fields.`),
			),
		),
	)
}

// ---------- Check tab ----------
export const CheckTab = ({ checks, busy, error, rules, onAskFix, canAsk }: { checks: Check[]; busy: boolean; error: string; rules: Rules | null; onAskFix: () => void; canAsk: boolean }) => {
	const fails = checks.filter(c => c.level === 'fail').length
	const warns = checks.filter(c => c.level === 'warn').length
	const oks = checks.filter(c => c.level === 'ok').length
	return h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 2 } },
		h(
			'div',
			{ style: { display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, padding: '2px 0 10px', flexWrap: 'wrap' } },
			h('span', { style: { color: LEVEL_COLOR.ok } }, `${oks} pass`),
			h('span', { style: { color: LEVEL_COLOR.warn } }, `${warns} warning${warns === 1 ? '' : 's'}`),
			h('span', { style: { color: LEVEL_COLOR.fail } }, `${fails} problem${fails === 1 ? '' : 's'}`),
			h('span', { style: { color: DIM, fontSize: 11 } }, busy ? 'Measuring...' : 'Measured from a full-size render'),
			h('div', { style: { flex: 1 } }),
			h(Btn, { label: 'Ask the agent to fix', title: 'Sends these results to the Thumbnails chat. The agent fixes this design in place.', disabled: !canAsk || fails + warns === 0, onClick: onAskFix }),
		),
		error ? h('div', { style: { color: LEVEL_COLOR.fail, fontSize: 12, paddingBottom: 8 } }, error) : null,
		...checks.map(c =>
			h(
				'div',
				{ key: c.id, style: { display: 'flex', gap: 10, padding: '8px 0', borderTop: `1px solid ${LINE}`, alignItems: 'flex-start' } },
				h('div', { style: { paddingTop: 5 } }, h(Dot, { color: LEVEL_COLOR[c.level] })),
				h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 } }, h('div', { style: { fontSize: 12, color: TEXT, fontWeight: 600 } }, c.label), h('div', { style: { fontSize: 11, color: DIM, lineHeight: 1.45, overflowWrap: 'anywhere' } }, c.detail)),
			),
		),
		rules?.rubric?.length
			? h(
					'div',
					{ style: { ...divider, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 } },
					h('span', { style: { ...label, color: TEXT } }, 'Taste rubric, judge by eye'),
					...rules.rubric.map(r => h('div', { key: r.id, style: { fontSize: 12, color: 'rgba(var(--kp-ink),.75)', lineHeight: 1.45, display: 'flex', gap: 8 } }, h('span', { style: { color: EMBER } }, '□'), r.question)),
				)
			: null,
	)
}

// ---------- feed mock-ups, drawn at real on-screen sizes ----------
// They imitate the platforms' dark mode in both Kino themes, so the colors here are fixed on purpose.
const img = (src: string, w: number, ht: number, radius: number) => h('img', { src, style: { width: w, height: ht, objectFit: 'cover', borderRadius: radius, display: 'block', background: '#222', flex: 'none' } })
const chip = (text: string) =>
	h('span', { style: { position: 'absolute', right: 6, bottom: 6, background: 'rgba(0,0,0,.8)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '1px 4px', borderRadius: 4, fontFamily: 'Roboto, Arial, sans-serif' } }, text)
const caption = (text: string) => h('div', { style: { fontSize: 11, color: '#aaa', marginBottom: 6 } }, text)
const ytTitle = (text: string, size = 14) =>
	h('div', { style: { fontSize: size, lineHeight: 1.35, color: '#f1f1f1', fontWeight: 500, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere', fontFamily: 'Roboto, Arial, sans-serif' } }, text)
const meta = (text: string) => h('div', { style: { fontSize: 12, color: '#aaa', fontFamily: 'Roboto, Arial, sans-serif', marginTop: 2 } }, text)
const frame = (title: string, ...children: any[]) => h('div', { style: { display: 'flex', flexDirection: 'column', padding: 12, borderRadius: 8, background: '#0f0f0f', border: `1px solid ${LINE}`, overflow: 'auto' } }, caption(title), ...children)

export const FeedTab = ({ d, src, videoTitle, seconds, brand }: { d: Design; src: string | null; videoTitle: string; seconds: number; brand: Brand }) => {
	if (!src) return h('div', { style: { color: DIM, fontSize: 12 } }, 'Rendering previews...')
	const title = videoTitle || d.name
	const channel = brand.name || 'Your channel'
	const dur = fmtClock(seconds || 0)
	const blank = (w: number, ht: number) => h('div', { style: { width: w, height: ht, background: '#1c1c1c', flex: 'none' } })
	const blocks: any[] = []
	if (d.preset === 'youtube') {
		blocks.push(
			frame(
				'YouTube home, phone (350 px)',
				h('div', { style: { position: 'relative', width: 350 } }, img(src, 350, 197, 0), chip(dur)),
				h('div', { style: { display: 'flex', gap: 10, marginTop: 10, width: 350 } }, h('div', { style: { width: 36, height: 36, borderRadius: '50%', background: brand.colors.accent, flex: 'none' } }), h('div', { style: { minWidth: 0 } }, ytTitle(title), meta(channel))),
			),
			frame('Up next sidebar, desktop (168 px)', h('div', { style: { display: 'flex', gap: 8, width: 360 } }, h('div', { style: { position: 'relative' } }, img(src, 168, 94, 8), chip(dur)), h('div', { style: { minWidth: 0 } }, ytTitle(title, 13), meta(channel)))),
		)
	}
	if (d.preset === 'vertical') {
		blocks.push(
			frame(
				'Shorts shelf (130 px), TikTok and Reels grids (3:4 crop)',
				h(
					'div',
					{ style: { display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' } },
					h('div', { style: { width: 130 } }, img(src, 130, 231, 8), h('div', { style: { marginTop: 6 } }, ytTitle(title, 12))),
					h('div', { style: { width: 130 } }, img(src, 130, 173, 2), meta('TikTok profile')),
					h('div', { style: { width: 130 } }, img(src, 130, 173, 0), meta('Instagram grid')),
				),
			),
		)
	}
	if (d.preset === 'instagram') {
		blocks.push(frame('Instagram feed (350 px)', img(src, 350, 437, 0)), frame('Profile grid (3:4 crop, 130 px)', h('div', { style: { display: 'flex', gap: 3 } }, img(src, 130, 173, 0), blank(130, 173), blank(130, 173))))
	}
	if (d.preset === 'square') {
		blocks.push(frame('Feed, square (350 px)', img(src, 350, 350, 0)), frame('Instagram profile grid (3:4 crop, 130 px)', h('div', { style: { display: 'flex', gap: 3 } }, img(src, 130, 173, 0), blank(130, 173), blank(130, 173))))
	}
	if (d.preset === 'x') {
		blocks.push(
			frame('X timeline (350 px)', h('div', { style: { width: 350, fontSize: 14, color: '#e7e9ea', marginBottom: 8, fontFamily: UI_FONT, overflowWrap: 'anywhere' } }, title), img(src, 350, 197, 16)),
			frame('Reddit card (350 px)', h('div', { style: { width: 350, fontSize: 15, fontWeight: 600, color: '#d7dadc', marginBottom: 8, fontFamily: UI_FONT, overflowWrap: 'anywhere' } }, title), img(src, 350, 197, 12)),
		)
	}
	return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } }, ...blocks, h('div', { style: { fontSize: 11, color: DIM } }, 'Real sizes on screen. Squint test: can you still read the headline in the smallest one?'))
}

// ---------- Guide tab: the project's thumbnail skill first, then the official specs ----------
const link = (url: string | undefined, text: string, key?: any) => (url ? h('a', { key, className: 'kino-thumbs-link', href: url, target: '_blank', rel: 'noreferrer' }, text) : h('span', { key }, text))
const para = (key: any, ...children: any[]) => h('div', { key, style: { fontSize: 12, lineHeight: 1.5, color: 'rgba(var(--kp-ink),0.78)', overflowWrap: 'anywhere' } }, ...children)
const heading = (text: string) => h('div', { style: { ...label, color: TEXT, marginTop: 6 } }, text)
const words = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) ? v.filter(x => typeof x === 'string').join(' ') : '')

export const GuideTab = ({ rules, preset }: { rules: Rules | null; preset: PresetId }) => {
	const refs = new Map((rules?.references ?? []).map(r => [r.id, r]))
	const cite = (ids?: string[]) => {
		const list = (ids ?? []).map(id => refs.get(id)).filter(Boolean) as NonNullable<Rules['references']>
		if (!list.length) return null
		return h('span', { style: { color: DIM } }, ' (', ...list.flatMap((r, i) => [i ? ', ' : '', link(r.url, r.title.length > 42 ? `${r.title.slice(0, 40)}…` : r.title, i)]), ')')
	}
	const plat = rules?.platforms?.[preset]
	const skill = rules
		? [
				h('div', { key: 'title', style: { display: 'flex', alignItems: 'baseline', gap: 8 } }, h('span', { style: { fontSize: 14, fontWeight: 650, color: TEXT } }, rules.name ?? 'Thumbnail skill'), rules.updated ? h('span', { style: { fontSize: 11, color: DIM } }, `updated ${rules.updated}`) : null),
				rules.summary ? para('sum', rules.summary) : null,
				h('div', { key: 'src', style: { fontSize: 11, color: DIM } }, 'The agent follows this for every design it makes. Source: /thumbs/skill/SKILL.md and rules.json. Edit them to make the taste yours.'),
				rules.principles?.length ? heading('Principles') : null,
				...(rules.principles ?? []).map(pr => para(pr.id, h('b', { style: { color: TEXT, fontWeight: 600 } }, pr.title), '. ', pr.rule, pr.why ? h('span', { style: { color: DIM } }, ` ${pr.why}`) : null, cite(pr.refs))),
				plat?.notes?.length ? heading(`${PRESETS[preset].short} notes`) : null,
				...(plat?.notes ?? []).map((n, i) => para(`pn${i}`, n)),
				rules.copy?.do?.length || rules.copy?.dont?.length ? heading('Copy') : null,
				...(rules.copy?.do ?? []).map((t, i) => para(`do${i}`, h('span', { style: { color: LEVEL_COLOR.ok } }, 'Do: '), t)),
				...(rules.copy?.dont ?? []).map((t, i) => para(`dont${i}`, h('span', { style: { color: LEVEL_COLOR.fail } }, "Don't: "), t)),
				rules.copy?.patterns?.length ? heading('Patterns') : null,
				// a pattern is either a plain string or { pattern, use }
				...(rules.copy?.patterns ?? []).map((pt, i) => (typeof pt === 'string' ? para(`pat${i}`, pt) : para(`pat${i}`, h('b', { style: { color: TEXT, fontWeight: 600 } }, words(pt?.pattern)), pt?.use ? h('span', { style: { color: DIM } }, `  ${words(pt.use)}`) : null))),
				rules.examples?.length ? heading('Studied examples') : null,
				...(rules.examples ?? []).map((ex, i) => {
					const why = words(ex.takeaways) || words(ex.why)
					return para(`ex${i}`, link(ex.url, ex.title ?? ex.channel ?? 'example'), ex.channel && ex.title ? h('span', { style: { color: DIM } }, ` · ${ex.channel}`) : null, why ? `: ${why}` : '')
				}),
			]
		: [para('none', 'This project has no thumbnail skill yet (/thumbs/skill/rules.json), so the agent and the checks fall back to the official guidelines below.')]
	return h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
		...skill,
		h('div', { style: { ...divider, marginTop: 6 } }, h('span', { style: { ...label, color: 'rgba(var(--kp-ink),.72)' } }, 'Official specs and studies')),
		...GUIDE.map(group =>
			h(
				'div',
				{ key: group.title, style: { display: 'flex', flexDirection: 'column', gap: 6 } },
				heading(group.title),
				...group.items.map((item, i) => para(i, item.text, item.url ? h('span', null, ' ', link(item.url, item.source ?? 'source')) : null)),
			),
		),
		rules?.references?.length ? h('div', { style: { ...divider, marginTop: 6 } }, h('span', { style: { ...label, color: 'rgba(var(--kp-ink),.72)' } }, `References (${rules.references.length})`)) : null,
		...(rules?.references ?? []).map(r => {
			const extra = [r.kind, r.year].filter(Boolean).join(', ')
			return para(`ref-${r.id}`, link(r.url, r.title), extra ? h('span', { style: { color: DIM } }, ` · ${extra}`) : null, r.note ? h('span', { style: { color: DIM } }, `. ${r.note}`) : null)
		}),
	)
}
