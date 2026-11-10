// Thumbnails panel: the Edit, Check, Feed and Guide tabs.
import { createElement as h, useState } from 'react'
import { MediaPicker } from 'kino/panel'
import { BG_LABELS, EL_LABELS, EMBLEMS, LAYOUTS, PRESETS, SHADES, findEl, makeEl, mapEl, moveEl, parentOf, removeEl } from '../../thumbs/model'
import type { Anchor, Design, El, ElType, PresetId, StackEl } from '../../thumbs/model'
import type { Check, Rules } from './lib'
import { fmtClock, platformOf } from './lib'
import { AnchorPicker, Btn, ColorIn, DIM, Dot, EMBER, Field, GUIDE, Grid, LEVEL_COLOR, LINE, Range, Section, Segmented, Select, TEXT, TextIn, Toggle, UI_FONT, label } from './ui'

const opts = (rec: Record<string, string>) => Object.entries(rec).map(([value, label]) => ({ value, label }))
const divider = { borderTop: `1px solid ${LINE}`, paddingTop: 12 }
const BRAND_SWATCHES = [
	{ value: '#f6f1e7', label: 'Parchment' },
	{ value: '#ff8a1f', label: 'Ember' },
	{ value: '#ffa045', label: 'Ember light' },
	{ value: '#cbb68c', label: 'Gold rule' },
	{ value: '#6cc070', label: 'Online green' },
	{ value: '#e3b341', label: 'Warning' },
	{ value: '#d7223f', label: 'Danger' },
	{ value: '#0d0b09', label: 'Ink' },
]
const STATUS_OPTS = [
	{ value: 'success', label: 'Online' },
	{ value: 'accent', label: 'Ember' },
	{ value: 'warning', label: 'Warning' },
	{ value: 'danger', label: 'Offline' },
]

export const elLabel = (e: El) => {
	const snippet =
		e.type === 'headline' || e.type === 'text' || e.type === 'badge'
			? e.text.replace(/\|/g, ' ')
			: e.type === 'card'
				? e.status
				: e.type === 'emblem'
					? e.icon
					: e.type === 'image'
						? (BG_LABELS[e.src] ?? 'library image')
						: e.type === 'stack'
							? `${e.children.length} item${e.children.length === 1 ? '' : 's'}`
							: ''
	return e.name || (snippet ? `${EL_LABELS[e.type]} · ${snippet}` : EL_LABELS[e.type])
}

// Library picker in a floating sheet; mounted only while open
const PickerSheet = ({ value, onPick, onClose }: { value: string | null; onPick: (id: string) => void; onClose: () => void }) =>
	h(
		'div',
		{ style: { position: 'fixed', inset: 0, zIndex: 50, background: 'var(--kp-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }, onClick: onClose },
		h(
			'div',
			{
				onClick: (e: any) => e.stopPropagation(),
				style: { width: 'min(560px, 92vw)', height: 'min(520px, 86vh)', background: 'var(--kp-modal)', border: '1px solid rgba(var(--kp-ink),.12)', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px var(--kp-shadow-lg)' },
			},
			h('div', { style: { display: 'flex', alignItems: 'center', padding: '8px 10px', borderBottom: `1px solid ${LINE}`, gap: 8 } }, h('span', { style: { ...label, color: TEXT } }, 'Pick an image from the library'), h('div', { style: { flex: 1 } }), h(Btn, { label: 'Close', onClick: onClose })),
			h('div', { style: { flex: 1, minHeight: 0, overflow: 'auto' } }, h(MediaPicker as any, { kind: 'image', value: value ? `kino:${value}` : null, onAudition: () => {}, onPick: (id: string) => onPick(id), onConfirm: (id: string) => onPick(id) })),
		),
	)

const srcOptions = (src: string) => [...opts(BG_LABELS), ...(BG_LABELS[src] ? [] : [{ value: src, label: 'Library image' }])]

// ---------- Edit tab ----------
type EditProps = {
	d: Design
	update: (fn: (d: Design) => Design) => void
	sel: string | null
	setSel: (id: string | null) => void
	rules: Rules | null
	onApply: (recipe: string) => void
	onDetach: (id: string) => void
	onUngroup: (id: string) => void
}

export const EditTab = (props: EditProps) => {
	const { d, update, sel, setSel, rules } = props
	const [picking, setPicking] = useState<null | string>(null)
	const [recipe, setRecipe] = useState<string>(d.recipe ?? 'hero')
	const p = platformOf(d.preset, rules)
	const recipes = [...opts(LAYOUTS), ...(rules?.recipes ?? []).filter(r => !r.platforms || r.platforms.includes(d.preset)).map(r => ({ value: r.id, label: `${r.name} (skill)` }))]
	const selected = sel ? findEl(d.elements, sel) : null
	const parent = sel ? parentOf(d.elements, sel) : undefined
	const setEl = (id: string, patch: Record<string, any>) => update(x => ({ ...x, elements: mapEl(x.elements, id, e => ({ ...e, ...patch }) as El) }))
	const setBg = (patch: Partial<Design['background']>) => update(x => ({ ...x, background: { ...x.background, ...patch } }))

	const add = (type: ElType) => {
		const safeW = (p.safe.w / p.w) * 100
		const textual = type === 'headline' || type === 'text' || type === 'badge'
		const e = makeEl(type, { x: 50, y: ((p.safe.y + p.safe.h / 2) / p.h) * 100, ...(textual ? { w: Math.min(safeW, 80) } : {}) })
		update(x => ({ ...x, elements: [...x.elements, e] }))
		setSel(e.id)
	}

	// visibility toggle: an eye, so it does not read as a list bullet
	const eye = (on: boolean) =>
		h(
			'svg',
			{ width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
			h('path', { d: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z' }),
			h('circle', { cx: 12, cy: 12, r: 3 }),
			on ? null : h('path', { d: 'M3 3l18 18' }),
		)
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
			h(
				'button',
				{
					title: e.visible === false ? 'Show' : 'Hide',
					onClick: (ev: any) => {
						ev.stopPropagation()
						setEl(e.id, { visible: e.visible === false })
					},
					style: { width: 18, height: 18, padding: 0, border: 'none', background: 'none', cursor: 'pointer', color: e.visible === false ? 'rgba(var(--kp-ink),.3)' : DIM, display: 'flex', alignItems: 'center', justifyContent: 'center' },
				},
				eye(e.visible !== false),
			),
			h('span', { style: { flex: 1, minWidth: 0, fontSize: 12, color: e.visible === false ? DIM : TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, elLabel(e)),
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

	return h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 14 } },
		picking
			? h(PickerSheet, {
					value: picking === 'bg' ? (BG_LABELS[d.background.src] ? null : d.background.src) : null,
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
				h(Field, { label: 'Set' }, h(TextIn, { value: d.set, placeholder: 'Group name', onChange: set => update(x => ({ ...x, set })) })),
				h(Field, { label: 'Platform', wide: true }, h(Select, { value: d.preset, options: Object.entries(PRESETS).map(([value, pr]) => ({ value, label: `${pr.label}  ${pr.w}x${pr.h}` })), onChange: preset => update(x => ({ ...x, preset: preset as PresetId })) })),
			),
			h(
				'div',
				{ style: { display: 'flex', gap: 6, alignItems: 'center' } },
				h('div', { style: { flex: 1, minWidth: 0 } }, h(Select, { value: recipe, options: recipes, onChange: setRecipe })),
				h(Btn, { label: 'Apply layout', title: 'Rebuild the elements from this layout, keeping the words and the background', onClick: () => props.onApply(recipe) }),
			),
			d.prompt ? h('div', { style: { fontSize: 11, color: DIM, lineHeight: 1.45 } }, h('span', { style: { color: 'rgba(var(--kp-ink),.7)' } }, 'Brief: '), d.prompt) : null,
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
				layers.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 1 } }, ...layers) : h('div', { style: { fontSize: 12, color: DIM } }, 'No elements. Add one, or apply a layout.'),
				h('div', { style: { fontSize: 11, color: DIM, lineHeight: 1.45 } }, 'Click an element in the preview to select it. Drag to move, drag the corner square to resize, arrow keys nudge (Shift for bigger steps).'),
			),
		),

		selected ? h('div', { style: divider }, h(Inspector, { e: selected, parent, d, setEl, setPicking, onDetach: props.onDetach, onUngroup: props.onUngroup })) : null,

		h(
			'div',
			{ style: divider },
			h(
				Section,
				{ title: 'Background' },
				h(
					'div',
					{ style: { display: 'flex', gap: 6, alignItems: 'center' } },
					h('div', { style: { flex: 1, minWidth: 0 } }, h(Select, { value: d.background.src, options: srcOptions(d.background.src), onChange: src => setBg({ src }) })),
					h(Btn, { label: 'From library…', onClick: () => setPicking('bg') }),
				),
				h(
					Grid,
					null,
					h(Field, { label: 'Focus X' }, h(Range, { value: d.background.focusX, min: 0, max: 100, step: 1, onChange: focusX => setBg({ focusX }), fmt: v => `${v}%` })),
					h(Field, { label: 'Focus Y' }, h(Range, { value: d.background.focusY, min: 0, max: 100, step: 1, onChange: focusY => setBg({ focusY }), fmt: v => `${v}%` })),
					h(Field, { label: 'Zoom' }, h(Range, { value: d.background.zoom, min: 1, max: 2.5, step: 0.01, onChange: zoom => setBg({ zoom }), fmt: v => `${v.toFixed(2)}x` })),
					h(Field, { label: 'Blur' }, h(Range, { value: d.background.blur, min: 0, max: 24, step: 1, onChange: blur => setBg({ blur }), fmt: v => `${v}px` })),
					h(Field, { label: 'Dim' }, h(Range, { value: d.background.dim, min: 0, max: 0.85, step: 0.01, onChange: dim => setBg({ dim }), fmt: v => `${Math.round(v * 100)}%` })),
					h(Field, { label: 'Shade amount' }, h(Range, { value: d.background.shadeAmount, min: 0, max: 1, step: 0.01, onChange: shadeAmount => setBg({ shadeAmount }), fmt: v => `${Math.round(v * 100)}%` })),
					h(Field, { label: 'Shade', wide: true }, h(Select, { value: d.background.shade, options: opts(SHADES), onChange: shade => setBg({ shade: shade as Design['background']['shade'] }) })),
				),
			),
		),
	)
}

// ---------- selected element ----------
type InspectorProps = { e: El; parent?: StackEl; d: Design; setEl: (id: string, patch: Record<string, any>) => void; setPicking: (v: string) => void; onDetach: (id: string) => void; onUngroup: (id: string) => void }

const Inspector = ({ e, parent, d, setEl, setPicking, onDetach, onUngroup }: InspectorProps) => {
	const set = (patch: Record<string, any>) => setEl(e.id, patch)
	const p = PRESETS[d.preset]
	const vert = e.anchor === 'c' ? 'c' : e.anchor[0]
	const horiz = e.anchor === 'c' ? 'c' : e.anchor[1]
	const join = (v: string, hz: string) => (v === 'c' && hz === 'c' ? 'c' : `${v}${hz}`) as Anchor
	const placement = !parent
		? [
				h(Field, { label: 'X', key: 'x' }, h(Range, { value: Math.round(e.x * 10) / 10, min: -10, max: 110, step: 0.1, onChange: x => set({ x }), fmt: v => `${v.toFixed(1)}%` })),
				h(Field, { label: 'Y', key: 'y' }, h(Range, { value: Math.round(e.y * 10) / 10, min: -10, max: 110, step: 0.1, onChange: y => set({ y }), fmt: v => `${v.toFixed(1)}%` })),
				h(
					Field,
					{ label: 'Anchor', key: 'a', hint: 'the point placed on X, Y', wide: true },
					h(
						'div',
						{ style: { display: 'flex', gap: 10, alignItems: 'center' } },
						h(AnchorPicker, { value: e.anchor, onChange: a => set({ anchor: a as Anchor }) }),
						h(Btn, { label: 'Centre across', title: 'X 50%, anchored on its middle', onClick: () => set({ x: 50, anchor: join(vert, 'c') }) }),
						h(Btn, { label: 'Centre down', title: 'Y 50%, anchored on its middle', onClick: () => set({ y: 50, anchor: join('c', horiz) }) }),
					),
				),
			]
		: []
	const textual = e.type === 'headline' || e.type === 'text' || e.type === 'badge'
	const common = [
		e.type !== 'emblem' && e.type !== 'stack' ? h(Field, { label: textual ? 'Max width' : 'Width', key: 'w' }, h(Range, { value: Math.round(e.w * 10) / 10, min: 3, max: 100, step: 0.1, onChange: w => set({ w }), fmt: v => `${v.toFixed(0)}%` })) : null,
		h(Field, { label: 'Rotate', key: 'r' }, h(Range, { value: e.rotate ?? 0, min: -30, max: 30, step: 0.5, onChange: rotate => set({ rotate }), fmt: v => `${v}°` })),
		h(Field, { label: 'Opacity', key: 'o' }, h(Range, { value: e.opacity ?? 1, min: 0.1, max: 1, step: 0.01, onChange: opacity => set({ opacity }), fmt: v => `${Math.round(v * 100)}%` })),
	]

	let fields: any[] = []
	switch (e.type) {
		case 'headline':
			fields = [
				h(Field, { label: 'Headline', hint: '| breaks a line', wide: true, key: 't' }, h(TextIn, { value: e.text, onChange: text => set({ text }) })),
				h(Field, { label: 'Accent word', key: 'ac' }, h(TextIn, { value: e.accent, placeholder: 'drawn in ember', onChange: accent => set({ accent }) })),
				h(Field, { label: 'Size', key: 's', hint: 'shrinks to fit' }, h(Range, { value: e.size, min: 40, max: 420, step: 1, onChange: size => set({ size }), fmt: v => `${v}` })),
				h(Field, { label: 'Font', wide: true, key: 'f' }, h(Segmented, { value: e.font, options: [{ value: 'fira', label: 'Fira Black' }, { value: 'petrock', label: 'Petrock' }], onChange: font => set({ font }) })),
				h(Field, { label: 'Treatment', wide: true, key: 'tr' }, h(Segmented, { value: e.treatment, options: [{ value: 'outline', label: 'Outline' }, { value: 'shadow', label: 'Shadow' }, { value: 'box', label: 'Box' }, { value: 'plain', label: 'Plain' }], onChange: treatment => set({ treatment }) })),
				h(Field, { label: 'Text colour', wide: true, key: 'c' }, h(ColorIn, { value: e.color, swatches: BRAND_SWATCHES, onChange: color => set({ color }) })),
				h(Field, { label: 'Accent colour', wide: true, key: 'cc' }, h(ColorIn, { value: e.accentColor, swatches: BRAND_SWATCHES, onChange: accentColor => set({ accentColor }) })),
			]
			break
		case 'text':
			fields = [
				h(Field, { label: 'Text', hint: '| breaks a line', wide: true, key: 't' }, h(TextIn, { value: e.text, onChange: text => set({ text }) })),
				h(Field, { label: 'Size', key: 's' }, h(Range, { value: e.size, min: 12, max: 220, step: 1, onChange: size => set({ size }), fmt: v => `${v}` })),
				h(Field, { label: 'Tracking', key: 'tk' }, h(Range, { value: e.tracking, min: -0.05, max: 0.5, step: 0.01, onChange: tracking => set({ tracking }), fmt: v => v.toFixed(2) })),
				h(Field, { label: 'Font', key: 'f' }, h(Segmented, { value: e.font, options: [{ value: 'fira', label: 'Fira' }, { value: 'petrock', label: 'Petrock' }], onChange: font => set({ font }) })),
				h(Field, { label: 'Weight', key: 'wt' }, h(Select, { value: String(e.weight), options: ['400', '600', '700', '800', '900'].map(v => ({ value: v, label: v })), onChange: v => set({ weight: Number(v) }) })),
				h(Field, { label: 'Case', key: 'u' }, h(Toggle, { value: e.upper, label: 'Uppercase', onChange: upper => set({ upper }) })),
				h(Field, { label: 'Colour', wide: true, key: 'c' }, h(ColorIn, { value: e.color, swatches: BRAND_SWATCHES, onChange: color => set({ color }) })),
			]
			break
		case 'badge':
			fields = [
				h(Field, { label: 'Badge text', key: 't' }, h(TextIn, { value: e.text, placeholder: 'e.g. 2 MIN', onChange: text => set({ text }) })),
				h(Field, { label: 'Size', key: 's' }, h(Range, { value: e.size, min: 16, max: 160, step: 1, onChange: size => set({ size }), fmt: v => `${v}` })),
				h(Field, { label: 'Fill', wide: true, key: 'f' }, h(ColorIn, { value: e.fill, swatches: BRAND_SWATCHES, onChange: fill => set({ fill }) })),
				h(Field, { label: 'Text colour', wide: true, key: 'c' }, h(ColorIn, { value: e.color, swatches: BRAND_SWATCHES, onChange: color => set({ color }) })),
			]
			break
		case 'logo':
			fields = [h(Field, { label: 'Glow', key: 'g' }, h(Range, { value: e.glow, min: 0, max: 1, step: 0.01, onChange: glow => set({ glow }), fmt: v => `${Math.round(v * 100)}%` }))]
			break
		case 'card':
			fields = [
				h(Field, { label: 'Status line', key: 'st' }, h(TextIn, { value: e.status, placeholder: 'SERVER ONLINE', onChange: status => set({ status }) })),
				h(Field, { label: 'Status light', key: 'd' }, h(Toggle, { value: e.dot, label: 'Glowing dot', onChange: dot => set({ dot }) })),
				h(Field, { label: 'Status colour', wide: true, key: 'sc' }, h(Segmented, { value: STATUS_OPTS.some(o => o.value === e.statusColor) ? e.statusColor : '', options: STATUS_OPTS, onChange: statusColor => set({ statusColor }) })),
				h(Field, { label: 'Server name', key: 'sv' }, h(TextIn, { value: e.server, placeholder: 'empty hides it', onChange: server => set({ server }) })),
				h(Field, { label: 'Players', key: 'pl' }, h(TextIn, { value: e.players, placeholder: 'empty hides it', onChange: players => set({ players }) })),
				h(Field, { label: 'Players label', key: 'pll' }, h(TextIn, { value: e.playersLabel, placeholder: 'players', onChange: playersLabel => set({ playersLabel }) })),
				h(Field, { label: 'Icon', key: 'ic' }, h(Toggle, { value: e.icon, label: 'Fellowship icon', onChange: icon => set({ icon }) })),
			]
			break
		case 'emblem':
			fields = [
				h(Field, { label: 'Icon', key: 'i' }, h(Select, { value: e.icon, options: EMBLEMS.map(v => ({ value: v, label: v })), onChange: icon => set({ icon }) })),
				h(Field, { label: 'Size', key: 's' }, h(Range, { value: e.size, min: 24, max: 700, step: 1, onChange: size => set({ size }), fmt: v => `${v}` })),
				h(Field, { label: 'Colour', wide: true, key: 'c' }, h(ColorIn, { value: e.color, swatches: BRAND_SWATCHES, onChange: color => set({ color }) })),
			]
			break
		case 'image':
			fields = [
				h(
					Field,
					{ label: 'Image', wide: true, key: 'src' },
					h('div', { style: { display: 'flex', gap: 6 } }, h('div', { style: { flex: 1, minWidth: 0 } }, h(Select, { value: e.src, options: srcOptions(e.src), onChange: src => set({ src }) })), h(Btn, { label: 'From library…', onClick: () => setPicking(e.id) })),
				),
				h(Field, { label: 'Height', key: 'hh', hint: '0 keeps the ratio' }, h(Range, { value: e.h ?? 0, min: 0, max: 100, step: 0.5, onChange: v => set({ h: v || undefined }), fmt: v => (v ? `${v}%` : 'auto') })),
				h(Field, { label: 'Fit', key: 'fit' }, h(Segmented, { value: e.fit, options: [{ value: 'cover', label: 'Fill' }, { value: 'contain', label: 'Fit' }], onChange: fit => set({ fit }) })),
				h(Field, { label: 'Frame', key: 'b' }, h(Toggle, { value: e.border, label: 'Gold border', onChange: border => set({ border }) })),
				h(Field, { label: 'Shadow', key: 'sh' }, h(Toggle, { value: e.shadow, label: 'Drop shadow', onChange: shadow => set({ shadow }) })),
			]
			break
		case 'arrow':
			fields = [h(Field, { label: 'Colour', wide: true, key: 'c' }, h(ColorIn, { value: e.color, swatches: BRAND_SWATCHES, onChange: color => set({ color }) }))]
			break
		case 'stack':
			fields = [
				h(Field, { label: 'Gap', key: 'g' }, h(Range, { value: e.gap, min: 0, max: 160, step: 1, onChange: gap => set({ gap }), fmt: v => `${v}` })),
				h(Field, { label: 'Align', key: 'al' }, h(Segmented, { value: e.align, options: [{ value: 'start', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'end', label: 'Right' }], onChange: align => set({ align }) })),
			]
			break
	}

	return h(
		Section,
		{
			title: `${EL_LABELS[e.type]}${parent ? ' (in a stack)' : ''}`,
			right: h(
				'div',
				{ style: { display: 'flex', gap: 6 } },
				parent ? h(Btn, { label: 'Move out of stack', title: 'Place it on its own, where it is now', onClick: () => onDetach(e.id) }) : null,
				e.type === 'stack' ? h(Btn, { label: 'Ungroup', title: 'Turn every item into its own freely placed element', onClick: () => onUngroup(e.id) }) : null,
			),
		},
		h(Grid, null, ...fields, ...placement, ...common),
		e.type === 'stack' ? h('div', { style: { fontSize: 11, color: DIM } }, `Items move together and resizing scales all of them. ${p.short} frame ${p.w}x${p.h}.`) : null,
		parent ? h('div', { style: { fontSize: 11, color: DIM } }, 'Position comes from the stack. Drag the stack, or move this out of it to place it freely.') : null,
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
			h(Btn, { label: 'Ask the agent to fix', title: 'Sends these results to the thumbnails chat; the agent fixes this design with the house skill', disabled: !canAsk || fails + warns === 0, onClick: onAskFix }),
		),
		error ? h('div', { style: { color: LEVEL_COLOR.fail, fontSize: 12, paddingBottom: 8 } }, error) : null,
		...checks.map(c =>
			h(
				'div',
				{ key: c.id, style: { display: 'flex', gap: 10, padding: '8px 0', borderTop: `1px solid ${LINE}`, alignItems: 'flex-start' } },
				h('div', { style: { paddingTop: 5 } }, h(Dot, { color: LEVEL_COLOR[c.level] })),
				h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 } }, h('div', { style: { fontSize: 12, color: TEXT, fontWeight: 600 } }, c.label), h('div', { style: { fontSize: 11, color: DIM, lineHeight: 1.45 } }, c.detail)),
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
const img = (src: string, w: number, ht: number, radius: number) => h('img', { src, style: { width: w, height: ht, objectFit: 'cover', borderRadius: radius, display: 'block', background: '#222', flex: 'none' } })
const chip = (text: string) =>
	h('span', { style: { position: 'absolute', right: 6, bottom: 6, background: 'rgba(0,0,0,.8)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '1px 4px', borderRadius: 4, fontFamily: 'Roboto, Arial, sans-serif' } }, text)
const caption = (text: string) => h('div', { style: { fontSize: 11, color: DIM, marginBottom: 6 } }, text)
const ytTitle = (text: string, size = 14) =>
	h('div', { style: { fontSize: size, lineHeight: 1.35, color: '#f1f1f1', fontWeight: 500, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontFamily: 'Roboto, Arial, sans-serif' } }, text)
const meta = (text: string) => h('div', { style: { fontSize: 12, color: '#aaa', fontFamily: 'Roboto, Arial, sans-serif', marginTop: 2 } }, text)
const frame = (title: string, ...children: any[]) => h('div', { style: { display: 'flex', flexDirection: 'column', padding: 12, borderRadius: 8, background: '#0f0f0f', border: `1px solid ${LINE}`, overflow: 'hidden' } }, caption(title), ...children)

export const FeedTab = ({ d, src, videoTitle, seconds }: { d: Design; src: string | null; videoTitle: string; seconds: number }) => {
	if (!src) return h('div', { style: { color: DIM, fontSize: 12 } }, 'Rendering previews...')
	const title = videoTitle || d.name
	const dur = fmtClock(seconds || 0)
	const blocks: any[] = []
	if (d.preset === 'youtube') {
		blocks.push(
			frame(
				'YouTube home, phone (350 px)',
				h('div', { style: { position: 'relative', width: 350 } }, img(src, 350, 197, 0), chip(dur)),
				h('div', { style: { display: 'flex', gap: 10, marginTop: 10, width: 350 } }, h('div', { style: { width: 36, height: 36, borderRadius: '50%', background: '#ff8a1f', flex: 'none' } }), h('div', { style: { minWidth: 0 } }, ytTitle(title), meta('OB:MP'))),
			),
			frame('Up next sidebar, desktop (168 px)', h('div', { style: { display: 'flex', gap: 8, width: 360 } }, h('div', { style: { position: 'relative' } }, img(src, 168, 94, 8), chip(dur)), h('div', { style: { minWidth: 0 } }, ytTitle(title, 13), meta('OB:MP')))),
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
		blocks.push(
			frame('Instagram feed (350 px)', img(src, 350, 437, 0)),
			frame('Profile grid (3:4 crop, 130 px)', h('div', { style: { display: 'flex', gap: 3 } }, img(src, 130, 173, 0), h('div', { style: { width: 130, height: 173, background: '#1c1c1c' } }), h('div', { style: { width: 130, height: 173, background: '#1c1c1c' } }))),
		)
	}
	if (d.preset === 'x') {
		blocks.push(
			frame('X timeline (350 px)', h('div', { style: { width: 350, fontSize: 14, color: '#e7e9ea', marginBottom: 8, fontFamily: UI_FONT } }, title), img(src, 350, 197, 16)),
			frame('Reddit card (350 px)', h('div', { style: { width: 350, fontSize: 15, fontWeight: 600, color: '#d7dadc', marginBottom: 8, fontFamily: UI_FONT } }, title), img(src, 350, 197, 12)),
		)
	}
	return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } }, ...blocks, h('div', { style: { fontSize: 11, color: DIM } }, 'Real sizes on screen. Squint test: can you still read the headline in the smallest one?'))
}

// ---------- Guide tab: the house taste skill first, then the official specs ----------
const link = (url: string | undefined, text: string, key?: any) => (url ? h('a', { key, className: 'kino-thumbs-link', href: url, target: '_blank', rel: 'noreferrer' }, text) : h('span', { key }, text))
const para = (key: any, ...children: any[]) => h('div', { key, style: { fontSize: 12, lineHeight: 1.5, color: 'rgba(var(--kp-ink),0.78)' } }, ...children)
const heading = (text: string) => h('div', { style: { ...label, color: TEXT, marginTop: 6 } }, text)

export const GuideTab = ({ rules, preset }: { rules: Rules | null; preset: PresetId }) => {
	const refs = new Map((rules?.references ?? []).map(r => [r.id, r]))
	const cite = (ids?: string[]) => {
		const list = (ids ?? []).map(id => refs.get(id)).filter(Boolean) as NonNullable<Rules['references']>
		if (!list.length) return null
		return h('span', { style: { color: DIM } }, ' (', ...list.flatMap((r, i) => [i ? ', ' : '', link(r.url, r.title.length > 42 ? `${r.title.slice(0, 40)}…` : r.title, i)]), ')')
	}
	const plat = rules?.platforms?.[preset]
	const house = rules
		? [
				h('div', { key: 'title', style: { display: 'flex', alignItems: 'baseline', gap: 8 } }, h('span', { style: { fontSize: 14, fontWeight: 650, color: TEXT } }, rules.name ?? 'House thumbnail skill'), rules.updated ? h('span', { style: { fontSize: 11, color: DIM } }, `updated ${rules.updated}`) : null),
				rules.summary ? para('sum', rules.summary) : null,
				h('div', { key: 'src', style: { fontSize: 11, color: DIM } }, 'The agent follows this for every design it makes. Source: /thumbs/skill/SKILL.md and rules.json.'),
				rules.principles?.length ? heading('Principles') : null,
				...(rules.principles ?? []).map(pr => para(pr.id, h('b', { style: { color: TEXT, fontWeight: 600 } }, pr.title), '. ', pr.rule, pr.why ? h('span', { style: { color: DIM } }, ` ${pr.why}`) : null, cite(pr.refs))),
				plat?.notes?.length ? heading(`${PRESETS[preset].short} notes`) : null,
				...(plat?.notes ?? []).map((n, i) => para(`pn${i}`, n)),
				rules.copy?.do?.length || rules.copy?.dont?.length ? heading('Copy') : null,
				...(rules.copy?.do ?? []).map((t, i) => para(`do${i}`, h('span', { style: { color: LEVEL_COLOR.ok } }, 'Do: '), t)),
				...(rules.copy?.dont ?? []).map((t, i) => para(`dont${i}`, h('span', { style: { color: LEVEL_COLOR.fail } }, "Don't: "), t)),
				...(rules.copy?.patterns?.length ? [para('pat', h('span', { style: { color: DIM } }, 'Patterns: '), rules.copy.patterns.join(' · '))] : []),
				rules.examples?.length ? heading('Studied examples') : null,
				...(rules.examples ?? []).map((ex, i) => para(`ex${i}`, link(ex.url, ex.title ?? ex.channel ?? 'example'), ex.channel && ex.title ? h('span', { style: { color: DIM } }, ` · ${ex.channel}`) : null, ex.why ? `: ${ex.why}` : '')),
			]
		: [para('none', 'The house taste skill is not installed yet, so agent-made designs fall back to the official guidelines below.')]
	return h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
		...house,
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
