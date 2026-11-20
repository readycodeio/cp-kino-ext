// Thumbnail design model v2: a background plus a list of freely placed elements.
// Shared by the art (ThumbArt.tsx), the Thumbnails panel and the agents that write /thumbs/designs.json.
// The file format is documented for agents in /thumbs/skill/format.md: keep the two in step.
// Colors, fonts, the logo and named images come from the brand kit (brand.ts, /thumbs/brand.json).
import { mediaOf, type Brand } from './ui/brand'

export type PresetId = 'youtube' | 'vertical' | 'instagram' | 'square' | 'x'
export type Anchor = 'tl' | 'tc' | 'tr' | 'cl' | 'c' | 'cr' | 'bl' | 'bc' | 'br'
// A built-in font id (fonts.ts), a custom font id from the brand kit, or '' for the kit's font for that role
export type FontId = string
export type Align = 'start' | 'center' | 'end'
export type Treatment = 'outline' | 'shadow' | 'box' | 'plain' | 'neon'
export type ElType = 'headline' | 'text' | 'badge' | 'logo' | 'card' | 'rule' | 'emblem' | 'image' | 'shape' | 'arrow' | 'stack'

// x, y: where the anchor point sits, in % of frame width / height. w: % of frame width (size for boxes,
// max width for text). size: font px on a frame whose short side is 1080. Children of a stack ignore x, y, anchor.
type Base = { id: string; name?: string; x: number; y: number; anchor: Anchor; w: number; visible?: boolean; locked?: boolean; rotate?: number; opacity?: number }
// Optional type overrides: when absent the font, the treatment or the anchor decides.
// stroke is a share of the font size, shadow a strength where 1 is the treatment's own.
type Type = { font: FontId; weight?: number; tracking?: number; lineHeight?: number; align?: Align; stroke?: number; strokeColor?: string; shadow?: number }
export type HeadlineEl = Base & Type & { type: 'headline'; text: string; accent: string; treatment: Treatment; size: number; upper?: boolean; color?: string; accentColor?: string; boxColor?: string; glowColor?: string }
export type TextEl = Base & Type & { type: 'text'; text: string; weight: number; size: number; color?: string; upper: boolean; tracking: number }
export type BadgeEl = Base & { type: 'badge'; text: string; size: number; fill?: string; color?: string; font?: FontId; weight?: number; tracking?: number; upper?: boolean; radius?: number }
export type LogoEl = Base & { type: 'logo'; glow: number; glowColor?: string; src?: string }
export type CardEl = Base & { type: 'card'; label: string; labelColor: string; title: string; detail: string; dot: boolean; icon: string; titleFont?: FontId }
export type RuleEl = Base & { type: 'rule'; color?: string; thickness?: number; plain?: boolean }
export type EmblemEl = Base & { type: 'emblem'; icon: string; size: number; color?: string }
export type ImageEl = Base & { type: 'image'; src: string; h?: number; fit: 'cover' | 'contain'; border: boolean; shadow: boolean; radius?: number; borderColor?: string; borderWidth?: number; focusX?: number; focusY?: number; flip?: boolean }
export type ShapeEl = Base & { type: 'shape'; shape: 'rect' | 'ellipse'; h: number; fill?: string; radius: number; borderColor?: string; borderWidth: number; shadow: boolean }
export type ArrowEl = Base & { type: 'arrow'; color?: string; strokeColor?: string }
export type StackEl = Base & { type: 'stack'; gap: number; align: Align; children: El[] }
export type El = HeadlineEl | TextEl | BadgeEl | LogoEl | CardEl | RuleEl | EmblemEl | ImageEl | ShapeEl | ArrowEl | StackEl

export type Shade = 'none' | 'vignette' | 'top' | 'bottom' | 'left' | 'right' | 'topBottom'
// src: a named brand image, a library media id, or '' for a plain color (color, or a gradient to color2)
export type Background = {
	src: string
	focusX: number
	focusY: number
	zoom: number
	blur: number
	dim: number
	shade: Shade
	shadeAmount: number
	saturate: number
	contrast: number
	flip?: boolean
	tint?: string
	tintAmount?: number
	color?: string
	color2?: string
	shadeColor?: string
}
export type Design = { id: string; name: string; set: string; preset: PresetId; prompt?: string; recipe?: string; background: Background; elements: El[] }
export type Doc = { version: 2; videoTitle: string; chatId?: string; designs: Design[] }

export type Rect = { x: number; y: number; w: number; h: number }
export type Zone = Rect & { id: string; label: string; hard: boolean; group: string }
export type Preset = { label: string; short: string; w: number; h: number; shape: 'land' | 'feed' | 'tall'; limitMB: number; smallest: { label: string; w: number }; safe: Rect; zones: Zone[] }

// Pixel sizes, a symmetric safe rectangle and UI zones per platform, kept in sync with /thumbs/skill/rules.json
// (the skill wins at runtime when it differs).
export const PRESETS: Record<PresetId, Preset> = {
	youtube: {
		label: 'YouTube 16:9',
		short: 'YouTube',
		w: 1920,
		h: 1080,
		shape: 'land',
		limitMB: 2,
		smallest: { label: 'sidebar 168 px', w: 168 },
		safe: { x: 120, y: 60, w: 1680, h: 780 },
		zones: [
			{ id: 'yt-duration', label: 'Duration badge (approx, sized for the 168 px sidebar)', x: 1530, y: 855, w: 390, h: 225, hard: true, group: 'YouTube' },
			{ id: 'yt-hover', label: 'Watch later and queue icons on hover', x: 1800, y: 0, w: 120, h: 190, hard: false, group: 'YouTube' },
			{ id: 'yt-progress', label: 'Watched progress bar', x: 0, y: 1046, w: 1920, h: 34, hard: false, group: 'YouTube' },
		],
	},
	vertical: {
		label: 'Shorts · TikTok · Reels 9:16',
		short: 'Vertical',
		w: 1080,
		h: 1920,
		shape: 'tall',
		limitMB: 8,
		smallest: { label: 'profile grid 130 px', w: 130 },
		// from the skill: strictest of Shorts, TikTok and Reels playback plus the square grid crop, mirrored for symmetry
		safe: { x: 192, y: 420, w: 696, h: 828 },
		zones: [
			{ id: 'grid-34-top', label: 'Instagram 3:4 grid crop', x: 0, y: 0, w: 1080, h: 240, hard: true, group: 'Grid crop' },
			{ id: 'grid-34-bottom', label: 'Instagram 3:4 grid crop', x: 0, y: 1680, w: 1080, h: 240, hard: true, group: 'Grid crop' },
			{ id: 'grid-11-top', label: 'Square grid crop (legacy Instagram, possibly TikTok)', x: 0, y: 0, w: 1080, h: 420, hard: false, group: 'Grid crop' },
			{ id: 'grid-11-bottom', label: 'Square grid crop (legacy Instagram, possibly TikTok)', x: 0, y: 1500, w: 1080, h: 420, hard: false, group: 'Grid crop' },
			{ id: 'sh-top', label: 'Playback top bar (first frame only)', x: 0, y: 0, w: 1080, h: 288, hard: false, group: 'Shorts' },
			{ id: 'sh-bottom', label: 'Playback title, channel and nav (first frame only)', x: 0, y: 1248, w: 1080, h: 672, hard: false, group: 'Shorts' },
			{ id: 'sh-left', label: 'Playback left margin (first frame only)', x: 0, y: 0, w: 48, h: 1920, hard: false, group: 'Shorts' },
			{ id: 'sh-right', label: 'Playback action column (first frame only)', x: 888, y: 0, w: 192, h: 1920, hard: false, group: 'Shorts' },
			{ id: 'sh-shelf-title', label: 'Shelf title and views overlay (approx, unverified)', x: 0, y: 1500, w: 1080, h: 420, hard: true, group: 'Shorts' },
			{ id: 'tt-top', label: 'Playback top bar (first frame only)', x: 0, y: 0, w: 1080, h: 240, hard: false, group: 'TikTok' },
			{ id: 'tt-bottom', label: 'Playback caption and nav (first frame only)', x: 0, y: 1260, w: 1080, h: 660, hard: false, group: 'TikTok' },
			{ id: 'tt-left', label: 'Playback left margin (first frame only)', x: 0, y: 0, w: 120, h: 1920, hard: false, group: 'TikTok' },
			{ id: 'tt-right', label: 'Playback right margin (first frame only)', x: 960, y: 0, w: 120, h: 1920, hard: false, group: 'TikTok' },
			{ id: 'tt-rail', label: 'Playback action rail (first frame only)', x: 780, y: 840, w: 180, h: 1080, hard: false, group: 'TikTok' },
			{ id: 'tt-grid-views', label: 'Profile grid view count (approx)', x: 0, y: 1380, w: 480, h: 300, hard: true, group: 'TikTok' },
			{ id: 'tt-pinned', label: 'Pinned tag, pinned videos only (approx)', x: 0, y: 240, w: 360, h: 180, hard: false, group: 'TikTok' },
			{ id: 'rl-top', label: 'Playback top bar (first frame only)', x: 0, y: 0, w: 1080, h: 269, hard: false, group: 'Reels' },
			{ id: 'rl-bottom', label: 'Playback caption and nav (first frame only)', x: 0, y: 1248, w: 1080, h: 672, hard: false, group: 'Reels' },
			{ id: 'rl-left', label: 'Playback left margin (first frame only)', x: 0, y: 0, w: 65, h: 1920, hard: false, group: 'Reels' },
			{ id: 'rl-right', label: 'Playback right margin (first frame only)', x: 1015, y: 0, w: 65, h: 1920, hard: false, group: 'Reels' },
			{ id: 'rl-grid-views', label: 'Profile grid play count (approx)', x: 0, y: 1560, w: 480, h: 120, hard: true, group: 'Reels' },
		],
	},
	instagram: {
		label: 'Instagram · Reddit 4:5',
		short: 'Instagram',
		w: 1080,
		h: 1350,
		shape: 'feed',
		limitMB: 8,
		smallest: { label: 'profile grid 130 px', w: 130 },
		safe: { x: 80, y: 160, w: 920, h: 1030 },
		zones: [
			{ id: 'ig-34-left', label: '3:4 grid tile side trim (uncertain)', x: 0, y: 0, w: 34, h: 1350, hard: false, group: 'Grid crop' },
			{ id: 'ig-34-right', label: '3:4 grid tile side trim (uncertain)', x: 1046, y: 0, w: 34, h: 1350, hard: false, group: 'Grid crop' },
			{ id: 'ig-11-top', label: 'Legacy square grid crop', x: 0, y: 0, w: 1080, h: 135, hard: false, group: 'Grid crop' },
			{ id: 'ig-11-bottom', label: 'Legacy square grid crop', x: 0, y: 1215, w: 1080, h: 135, hard: false, group: 'Grid crop' },
			{ id: 'ig-multi-icon', label: 'Carousel or Reel icon in the grid (approx)', x: 920, y: 30, w: 130, h: 130, hard: true, group: 'Instagram' },
		],
	},
	square: {
		label: 'Square 1:1',
		short: 'Square',
		w: 1080,
		h: 1080,
		shape: 'feed',
		limitMB: 8,
		smallest: { label: 'profile grid 130 px', w: 130 },
		safe: { x: 150, y: 80, w: 780, h: 920 },
		zones: [
			{ id: 'sq-34-left', label: '3:4 grid tile side crop', x: 0, y: 0, w: 135, h: 1080, hard: false, group: 'Grid crop' },
			{ id: 'sq-34-right', label: '3:4 grid tile side crop', x: 945, y: 0, w: 135, h: 1080, hard: false, group: 'Grid crop' },
		],
	},
	x: {
		label: 'X · Reddit 16:9',
		short: 'X · Reddit',
		w: 1600,
		h: 900,
		shape: 'land',
		limitMB: 5,
		smallest: { label: 'mobile feed 350 px', w: 350 },
		safe: { x: 100, y: 60, w: 1400, h: 690 },
		zones: [
			{ id: 'x-card-crop-top', label: 'Link card 1.91:1 crop', x: 0, y: 0, w: 1600, h: 31, hard: false, group: 'X card' },
			{ id: 'x-card-crop-bottom', label: 'Link card 1.91:1 crop', x: 0, y: 869, w: 1600, h: 31, hard: false, group: 'X card' },
			{ id: 'x-domain', label: 'Link card domain label (approx)', x: 0, y: 760, w: 640, h: 140, hard: true, group: 'X card' },
			{ id: 'x-alt', label: 'ALT badge when alt text is set (approx)', x: 0, y: 820, w: 200, h: 80, hard: false, group: 'X card' },
		],
	},
}

export const EL_LABELS: Record<ElType, string> = {
	headline: 'Headline',
	text: 'Text',
	badge: 'Badge',
	logo: 'Logo',
	card: 'Info card',
	rule: 'Divider',
	emblem: 'Icon',
	image: 'Image',
	shape: 'Shape',
	arrow: 'Arrow',
	stack: 'Stack',
}
export const SHADES: Record<Shade, string> = { none: 'None', vignette: 'Vignette', top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right', topBottom: 'Top and bottom' }
export const TREATMENTS: Record<Treatment, string> = { outline: 'Outline', shadow: 'Shadow', box: 'Box', plain: 'Plain', neon: 'Neon' }
export const LAYOUTS = { hero: 'Headline left', brand: 'Centered', card: 'Info card' } as const
export type LayoutId = keyof typeof LAYOUTS
// Layout ids written by earlier versions of the panel
const LAYOUT_ALIASES: Record<string, LayoutId> = { status: 'card' }
export const layoutOf = (recipe: string | undefined): LayoutId | null => {
	const id = recipe ? (LAYOUT_ALIASES[recipe] ?? recipe) : ''
	return id in LAYOUTS ? (id as LayoutId) : null
}

// ---------- helpers ----------
export const rid = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0')
export const unit = (p: Preset) => Math.min(p.w, p.h) / 1080
export const anchorXY = (a: Anchor) => ({ ax: a[1] === 'l' ? 0 : a[1] === 'r' ? 100 : 50, ay: a[0] === 't' ? 0 : a[0] === 'b' ? 100 : 50 })
export const hAlign = (a: Anchor): Align => (anchorXY(a).ax === 0 ? 'start' : anchorXY(a).ax === 100 ? 'end' : 'center')
const ANCHORS: Anchor[] = ['tl', 'tc', 'tr', 'cl', 'c', 'cr', 'bl', 'bc', 'br']
const ALIGNS: Align[] = ['start', 'center', 'end']
const num = (v: any, d: number, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const str = (v: any, d = '') => (typeof v === 'string' ? v : d)
const bool = (v: any, d: boolean) => (typeof v === 'boolean' ? v : d)
const pick = <T extends string>(v: any, list: readonly T[], d: T): T => (list.includes(v) ? v : d)
// optional fields stay out of the JSON unless someone set them
const optNum = (v: any, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined)
const optStr = (v: any) => (typeof v === 'string' && v ? v : undefined)
const optBool = (v: any) => (typeof v === 'boolean' ? v : undefined)
const optPick = <T extends string>(v: any, list: readonly T[]) => (list.includes(v) ? (v as T) : undefined)

// Defaults per element type; also what "Add element" inserts
export const makeEl = (type: ElType, over: Record<string, any> = {}): El => {
	const base = { id: rid(), x: 50, y: 50, anchor: 'c' as Anchor, w: 60, visible: true }
	const by: Record<ElType, any> = {
		headline: { w: 80, text: 'Your big|Idea', accent: 'Idea', font: '', treatment: 'outline', size: 180 },
		text: { w: 70, text: 'A short line of text', font: '', weight: 600, size: 36, upper: true, tracking: 0.2 },
		badge: { w: 60, text: 'NEW', size: 56 },
		logo: { w: 30, glow: 0.35 },
		card: { w: 44, label: 'LIVE NOW', labelColor: 'success', title: 'Title', detail: 'A line of detail', dot: true, icon: '' },
		rule: { w: 50 },
		emblem: { w: 10, icon: 'star', size: 120 },
		image: { w: 40, src: '', fit: 'cover', border: false, shadow: true },
		shape: { w: 30, h: 20, shape: 'rect', radius: 0, borderWidth: 0, shadow: false },
		arrow: { w: 14, rotate: 0 },
		stack: { w: 80, gap: 20, align: 'center', children: [] },
	}
	return normEl({ ...base, ...by[type], ...over, type })!
}

// Fill defaults and clamp ranges, so hand-written or agent-written JSON always renders.
// Also reads the field names earlier versions wrote (see the card).
export const normEl = (raw: any): El | null => {
	if (!raw || typeof raw !== 'object') return null
	const type = raw.type as ElType
	if (!EL_LABELS[type]) return null
	const base = {
		id: str(raw.id) || rid(),
		name: typeof raw.name === 'string' && raw.name ? raw.name : undefined,
		x: num(raw.x, 50, -50, 150),
		y: num(raw.y, 50, -50, 150),
		anchor: pick(raw.anchor, ANCHORS, 'c'),
		w: num(raw.w, 50, 1, 200),
		visible: bool(raw.visible, true),
		locked: raw.locked === true ? true : undefined,
		rotate: num(raw.rotate, 0, -360, 360),
		opacity: num(raw.opacity, 1, 0, 1),
	}
	const typo = { weight: optNum(raw.weight, 100, 900), tracking: optNum(raw.tracking, -0.1, 1), lineHeight: optNum(raw.lineHeight, 0.6, 2.5), align: optPick(raw.align, ALIGNS), stroke: optNum(raw.stroke, 0, 0.3), strokeColor: optStr(raw.strokeColor), shadow: optNum(raw.shadow, 0, 2) }
	switch (type) {
		case 'headline':
			return { ...base, ...typo, type, text: str(raw.text, 'Headline'), accent: str(raw.accent), font: str(raw.font), treatment: pick(raw.treatment, Object.keys(TREATMENTS) as Treatment[], 'outline'), size: num(raw.size, 180, 8, 600), upper: optBool(raw.upper), color: optStr(raw.color), accentColor: optStr(raw.accentColor), boxColor: optStr(raw.boxColor), glowColor: optStr(raw.glowColor) }
		case 'text':
			return { ...base, ...typo, type, text: str(raw.text, 'Text'), font: str(raw.font), weight: num(raw.weight, 600, 100, 900), size: num(raw.size, 36, 6, 400), color: optStr(raw.color), upper: bool(raw.upper, true), tracking: num(raw.tracking, 0.2, -0.1, 1) }
		case 'badge':
			return { ...base, type, text: str(raw.text, 'BADGE'), size: num(raw.size, 56, 8, 300), fill: optStr(raw.fill), color: optStr(raw.color), font: optStr(raw.font), weight: optNum(raw.weight, 100, 900), tracking: optNum(raw.tracking, -0.1, 1), upper: optBool(raw.upper), radius: optNum(raw.radius, 0, 1) }
		case 'logo':
			return { ...base, type, glow: num(raw.glow, 0.35, 0, 1), glowColor: optStr(raw.glowColor), src: optStr(raw.src) }
		case 'card': {
			// earlier versions called these status, statusColor, server, players and playersLabel, with a yes/no icon
			const old = raw.label === undefined && raw.title === undefined && raw.detail === undefined && (raw.status !== undefined || raw.server !== undefined || raw.players !== undefined)
			const count = str(raw.players).trim()
			return {
				...base,
				type,
				label: str(raw.label ?? raw.status),
				labelColor: str(raw.labelColor ?? raw.statusColor, 'success'),
				title: str(raw.title ?? raw.server),
				detail: raw.detail !== undefined ? str(raw.detail) : count ? [count, str(raw.playersLabel, 'players').trim()].filter(Boolean).join(' ') : '',
				dot: bool(raw.dot, true),
				icon: typeof raw.icon === 'string' ? raw.icon : raw.icon === false ? '' : old || raw.icon === true ? 'group' : '',
				titleFont: optStr(raw.titleFont),
			}
		}
		case 'rule':
			return { ...base, type, color: optStr(raw.color), thickness: optNum(raw.thickness, 1, 60), plain: raw.plain === true ? true : undefined }
		case 'emblem':
			return { ...base, type, icon: str(raw.icon) || 'star', size: num(raw.size, 120, 8, 1200), color: optStr(raw.color) }
		case 'image':
			return {
				...base,
				type,
				src: str(raw.src),
				h: typeof raw.h === 'number' ? num(raw.h, 30, 1, 200) : undefined,
				fit: pick(raw.fit, ['cover', 'contain'], 'cover'),
				border: bool(raw.border, false),
				shadow: bool(raw.shadow, true),
				radius: optNum(raw.radius, 0, 50),
				borderColor: optStr(raw.borderColor),
				borderWidth: optNum(raw.borderWidth, 0, 80),
				focusX: optNum(raw.focusX, 0, 100),
				focusY: optNum(raw.focusY, 0, 100),
				flip: raw.flip === true ? true : undefined,
			}
		case 'shape':
			return { ...base, type, shape: pick(raw.shape, ['rect', 'ellipse'], 'rect'), h: num(raw.h, 20, 0.2, 200), fill: optStr(raw.fill), radius: num(raw.radius, 0, 0, 600), borderColor: optStr(raw.borderColor), borderWidth: num(raw.borderWidth, 0, 0, 80), shadow: bool(raw.shadow, false) }
		case 'arrow':
			return { ...base, type, color: optStr(raw.color), strokeColor: optStr(raw.strokeColor) }
		case 'stack':
			return { ...base, type, gap: num(raw.gap, 20, 0, 400), align: pick(raw.align, ALIGNS, 'center'), children: (Array.isArray(raw.children) ? raw.children : []).map(normEl).filter((e: El | null): e is El => !!e && e.type !== 'stack') }
	}
	return null
}

export const normBg = (raw: any): Background => ({
	src: str(raw?.src),
	focusX: num(raw?.focusX, 50, 0, 100),
	focusY: num(raw?.focusY, 50, 0, 100),
	zoom: num(raw?.zoom, 1, 1, 3),
	blur: num(raw?.blur, 0, 0, 40),
	dim: num(raw?.dim, 0.15, 0, 0.95),
	shade: pick(raw?.shade, Object.keys(SHADES) as Shade[], 'vignette'),
	shadeAmount: num(raw?.shadeAmount, 0.8, 0, 1),
	// 1.08 is what every background got before saturation became a setting
	saturate: num(raw?.saturate, 1.08, 0, 2),
	contrast: num(raw?.contrast, 1, 0.5, 1.6),
	flip: raw?.flip === true ? true : undefined,
	tint: optStr(raw?.tint),
	tintAmount: optNum(raw?.tintAmount, 0, 1),
	color: optStr(raw?.color),
	color2: optStr(raw?.color2),
	shadeColor: optStr(raw?.shadeColor),
})

// Two elements with one id would be selected, moved and deleted together: the later one gets a new id
const uniqueIds = (els: El[]): El[] => {
	const seen = new Set<string>()
	const fix = <T extends El>(e: T): T => {
		const id = seen.has(e.id) ? rid() : e.id
		seen.add(id)
		return id === e.id ? e : { ...e, id }
	}
	return els.map(e => (e.type === 'stack' ? { ...fix(e), children: e.children.map(fix) } : fix(e)))
}

// Accepts v2 designs and the v1 shape (layout + fixed fields), which it converts
export const normDesign = (raw: any): Design | null => {
	if (!raw || typeof raw !== 'object') return null
	if (!Array.isArray(raw.elements) && typeof raw.layout === 'string') return migrateV1(raw)
	const preset = pick(raw.preset, Object.keys(PRESETS) as PresetId[], 'youtube')
	return {
		id: str(raw.id) || rid(),
		name: str(raw.name, 'Untitled'),
		set: str(raw.set),
		preset,
		prompt: typeof raw.prompt === 'string' && raw.prompt ? raw.prompt : undefined,
		recipe: typeof raw.recipe === 'string' && raw.recipe ? (LAYOUT_ALIASES[raw.recipe] ?? raw.recipe) : undefined,
		background: normBg(raw.background),
		elements: uniqueIds((Array.isArray(raw.elements) ? raw.elements : []).map(normEl).filter(Boolean) as El[]),
	}
}

/** The designs file as a document. Null when the text is not a designs file at all (empty, cut off, not JSON). */
export const parseDoc = (text?: string): Doc | null => {
	try {
		const json = JSON.parse(text ?? '')
		if (!json || typeof json !== 'object' || Array.isArray(json)) return null
		const designs = (Array.isArray(json.designs) ? json.designs : []).map(normDesign).filter(Boolean) as Design[]
		const seen = new Set<string>()
		for (const d of designs) {
			if (seen.has(d.id)) d.id = rid()
			seen.add(d.id)
		}
		return { version: 2, videoTitle: str(json.videoTitle), chatId: typeof json.chatId === 'string' && json.chatId ? json.chatId : undefined, designs }
	} catch {
		return null
	}
}
export const EMPTY_DOC: Doc = { version: 2, videoTitle: '', designs: [] }
export const normDoc = (text?: string): Doc => parseDoc(text) ?? EMPTY_DOC
// Tabs, as format.md asks of agents, so the panel and an agent do not reformat each other's writes
export const serializeDoc = (doc: Doc) => JSON.stringify(doc, null, '\t') + '\n'

// ---------- built-in layouts (also used to migrate v1 designs and for All sizes) ----------
export type Content = {
	title: string
	accent: string
	eyebrow: string
	badge: string
	logo: boolean
	font: FontId
	treatment: Treatment
	scale: number
	label: string
	cardTitle: string
	detail: string
}
export const DEFAULT_CONTENT: Content = { title: 'Your big|Idea', accent: 'Idea', eyebrow: '', badge: 'NEW', logo: false, font: '', treatment: 'outline', scale: 1, label: 'LIVE NOW', cardTitle: 'Title', detail: 'A line of detail' }

const BASE_SIZE: Record<LayoutId, Record<Preset['shape'], number>> = {
	hero: { land: 230, feed: 180, tall: 170 },
	brand: { land: 178, feed: 150, tall: 150 },
	card: { land: 200, feed: 150, tall: 160 },
}

export const layoutElements = (layout: LayoutId, preset: PresetId, c: Content): { elements: El[]; shade: Shade; shadeAmount: number } => {
	const p = PRESETS[preset]
	const shape = p.shape
	// everything is placed relative to the safe rectangle, so layouts follow the skill's numbers
	const r = (n: number) => Math.round(n * 10) / 10
	const L = r((p.safe.x / p.w) * 100)
	const T = r((p.safe.y / p.h) * 100)
	const B = r(((p.safe.y + p.safe.h) / p.h) * 100)
	const M = r((T + B) / 2)
	const safeW = r((p.safe.w / p.w) * 100)
	const fit = (w: number) => Math.min(w, safeW)
	const head = (w: number) => makeEl('headline', { text: c.title, accent: c.accent, font: c.font, treatment: c.treatment, size: Math.round(BASE_SIZE[layout][shape] * c.scale), w: fit(w) })
	const eyebrow = (size: number) => (c.eyebrow.trim() ? [makeEl('text', { text: c.eyebrow, size, w: safeW })] : [])
	const badge = (size: number) => (c.badge.trim() ? [makeEl('badge', { text: c.badge, size, w: safeW })] : [])
	const logo = (w: number) => (c.logo ? [makeEl('logo', { w })] : [])
	const card = (w: number, over: Record<string, any> = {}) => makeEl('card', { w: fit(w), label: c.label, title: c.cardTitle, detail: c.detail, ...over })
	const stack = (over: Record<string, any>, children: El[]) => makeEl('stack', { align: 'center', gap: 22, ...over, children })

	if (layout === 'brand') {
		if (shape === 'tall') return { shade: 'vignette', shadeAmount: 0.9, elements: [stack({ x: 50, y: T + 1, anchor: 'tc' }, [...logo(60), ...eyebrow(34), head(safeW), makeEl('rule', { w: 48 }), ...badge(52)])] }
		if (shape === 'feed') return { shade: 'vignette', shadeAmount: 0.9, elements: [stack({ x: 50, y: M, anchor: 'c' }, [...logo(60), ...eyebrow(34), head(safeW), makeEl('rule', { w: 64 }), ...badge(50)])] }
		return { shade: 'vignette', shadeAmount: 0.9, elements: [stack({ x: 50, y: M, anchor: 'c', gap: 20 }, [...logo(30), ...eyebrow(36), head(85), makeEl('rule', { w: 56 }), ...badge(50)])] }
	}
	if (layout === 'card') {
		if (shape === 'tall') return { shade: 'topBottom', shadeAmount: 0.85, elements: [stack({ x: 50, y: T + 1, anchor: 'tc', gap: 30 }, [...logo(36), head(safeW), card(safeW)])] }
		if (shape === 'feed') return { shade: 'vignette', shadeAmount: 0.9, elements: [stack({ x: 50, y: M, anchor: 'c', gap: 30 }, [...logo(40), head(safeW), card(76)])] }
		return {
			shade: 'vignette',
			shadeAmount: 0.9,
			elements: [card(44, { x: L, y: M, anchor: 'cl' }), stack({ x: 73, y: M, anchor: 'c', gap: 24 }, [...logo(26), head(40)])],
		}
	}
	// hero: headline on the quiet side, subject on the other, logo out of the way
	if (shape === 'tall') return { shade: 'topBottom', shadeAmount: 0.9, elements: [stack({ x: 50, y: T + 1, anchor: 'tc', gap: 30 }, [head(safeW), ...badge(54), ...logo(36)])] }
	if (shape === 'feed') return { shade: 'top', shadeAmount: 0.9, elements: [stack({ x: L, y: T, anchor: 'tl', align: 'start', gap: 28 }, [head(safeW), ...badge(52)]), ...logo(34).map(e => ({ ...e, x: L, y: B, anchor: 'bl' as Anchor }))] }
	return { shade: 'left', shadeAmount: 0.9, elements: [stack({ x: L, y: T + 2, anchor: 'tl', align: 'start', gap: 32 }, [head(60), ...badge(60)]), ...logo(22).map(e => ({ ...e, x: L, y: B, anchor: 'bl' as Anchor }))] }
}

export const newDesign = (preset: PresetId, layout: LayoutId, over: Partial<Design> = {}, content: Partial<Content> = {}): Design => {
	const c = { ...DEFAULT_CONTENT, ...content }
	const made = layoutElements(layout, preset, c)
	return {
		id: rid(),
		name: 'New thumbnail',
		set: '',
		preset,
		recipe: layout,
		background: normBg({ focusX: 50, focusY: 50, dim: 0.15, shade: made.shade, shadeAmount: made.shadeAmount }),
		elements: made.elements,
		...over,
	}
}

const withCardIcon = (e: El): El => (e.type === 'card' ? { ...e, icon: 'group' } : e.type === 'stack' ? { ...e, children: e.children.map(withCardIcon) } : e)

const migrateV1 = (d: any): Design => {
	const preset = pick(d.preset, Object.keys(PRESETS) as PresetId[], 'youtube')
	const layout = layoutOf(str(d.layout)) ?? 'hero'
	const count = str(d.players).trim()
	const content: Content = {
		title: str(d.title, DEFAULT_CONTENT.title),
		accent: str(d.accent),
		eyebrow: layout === 'brand' ? str(d.eyebrow) : '',
		badge: layout === 'card' ? '' : str(d.badge),
		logo: bool(d.logo, true),
		font: str(d.font),
		treatment: pick(d.treatment, ['outline', 'shadow', 'box'], 'outline'),
		scale: num(d.textScale, 1, 0.4, 2),
		label: str(d.status, DEFAULT_CONTENT.label),
		cardTitle: str(d.server, DEFAULT_CONTENT.cardTitle),
		detail: count ? `${count} players` : DEFAULT_CONTENT.detail,
	}
	const made = layoutElements(layout, preset, content)
	return {
		id: str(d.id) || rid(),
		name: str(d.name, 'Untitled'),
		set: 'First pass',
		preset,
		recipe: layout,
		background: normBg({ src: d.bg, focusX: d.focusX, focusY: d.focusY, zoom: d.zoom, blur: d.blur, dim: d.dim, shade: made.shade, shadeAmount: made.shadeAmount }),
		// v1 cards always showed the people icon
		elements: made.elements.map(withCardIcon),
	}
}

// ---------- element tree helpers ----------
export const flatten = (els: El[]): El[] => els.flatMap(e => (e.type === 'stack' ? [e, ...e.children] : [e]))
export const findEl = (els: El[], id: string) => flatten(els).find(e => e.id === id) ?? null
export const parentOf = (els: El[], id: string) => els.find(e => e.type === 'stack' && e.children.some(c => c.id === id)) as StackEl | undefined
export const mapEl = (els: El[], id: string, fn: (e: El) => El): El[] =>
	els.map(e => (e.id === id ? fn(e) : e.type === 'stack' ? { ...e, children: e.children.map(c => (c.id === id ? fn(c) : c)) } : e))
export const removeEl = (els: El[], id: string): El[] => els.filter(e => e.id !== id).map(e => (e.type === 'stack' ? { ...e, children: e.children.filter(c => c.id !== id) } : e))
// One step among its siblings, or all the way with 'front' and 'back'
export const moveEl = (els: El[], id: string, dir: -1 | 1 | 'front' | 'back'): El[] => {
	const swap = (list: El[]) => {
		const i = list.findIndex(e => e.id === id)
		if (i < 0) return null
		const j = dir === 'front' ? list.length - 1 : dir === 'back' ? 0 : i + dir
		if (j < 0 || j >= list.length || j === i) return list
		const out = list.slice()
		const [item] = out.splice(i, 1)
		out.splice(j, 0, item)
		return out
	}
	const top = swap(els)
	if (top) return top
	return els.map(e => (e.type === 'stack' ? { ...e, children: swap(e.children) ?? e.children } : e))
}
/** A copy with new ids, for duplicating an element or a whole design. */
export const cloneEl = (e: El): El => (e.type === 'stack' ? { ...e, id: rid(), children: e.children.map(c => ({ ...c, id: rid() })) } : { ...e, id: rid() })
/** Insert a copy right after the original, nudged so it does not hide it. Returns the new list and the copy's id. */
export const duplicateEl = (els: El[], id: string): { elements: El[]; id: string | null } => {
	const top = els.findIndex(e => e.id === id)
	if (top >= 0) {
		const copy = { ...cloneEl(els[top]), x: Math.min(150, els[top].x + 2), y: Math.min(150, els[top].y + 2) } as El
		return { elements: [...els.slice(0, top + 1), copy, ...els.slice(top + 1)], id: copy.id }
	}
	let made: string | null = null
	const elements = els.map(e => {
		if (e.type !== 'stack') return e
		const i = e.children.findIndex(c => c.id === id)
		if (i < 0) return e
		const copy = cloneEl(e.children[i])
		made = copy.id
		return { ...e, children: [...e.children.slice(0, i + 1), copy, ...e.children.slice(i + 1)] }
	})
	return { elements, id: made }
}

// ---------- copy and paste style ----------
const TYPE_KEYS = ['font', 'weight', 'tracking', 'lineHeight', 'align', 'stroke', 'strokeColor', 'shadow', 'upper', 'color', 'size']
const STYLE_KEYS: Record<ElType, string[]> = {
	headline: [...TYPE_KEYS, 'treatment', 'accentColor', 'boxColor', 'glowColor'],
	text: TYPE_KEYS,
	badge: ['font', 'weight', 'tracking', 'upper', 'radius', 'fill', 'color', 'size'],
	logo: ['glow', 'glowColor'],
	card: ['labelColor', 'titleFont', 'dot'],
	rule: ['color', 'thickness', 'plain'],
	emblem: ['color', 'size'],
	image: ['fit', 'border', 'shadow', 'radius', 'borderColor', 'borderWidth'],
	shape: ['fill', 'radius', 'borderColor', 'borderWidth', 'shadow'],
	arrow: ['color', 'strokeColor'],
	stack: ['gap', 'align'],
}
export type ElStyle = { type: ElType; values: Record<string, unknown> }
export const styleOf = (e: El): ElStyle => ({ type: e.type, values: Object.fromEntries(STYLE_KEYS[e.type].map(key => [key, (e as any)[key]])) })
/** Apply a copied style: every style field the two element types share. Size only travels between the same type. */
export const pasteStyle = (e: El, style: ElStyle): El => {
	const keys = STYLE_KEYS[e.type].filter(key => key in style.values && (key !== 'size' || style.type === e.type))
	if (!keys.length) return e
	return normEl({ ...e, ...Object.fromEntries(keys.map(key => [key, style.values[key]])) }) ?? e
}

// ---------- what a design uses ----------
/** Library media ids a design needs: the background, its images and the logo. */
export const designMedia = (d: Design, brand: Brand): string[] => {
	const ids = new Set<string>()
	const add = (src: string | undefined) => {
		const id = src ? mediaOf(src, brand) : ''
		if (id) ids.add(id)
	}
	add(d.background.src)
	for (const e of flatten(d.elements)) {
		if (e.type === 'image') add(e.src)
		if (e.type === 'logo') add(e.src || brand.logo.media)
	}
	return [...ids]
}

// What the design says, for re-layouts and agent prompts
export const contentOf = (d: Design): Content => {
	const all = flatten(d.elements).filter(e => e.visible !== false)
	const headline = all.find(e => e.type === 'headline') as HeadlineEl | undefined
	const text = all.find(e => e.type === 'text') as TextEl | undefined
	const badge = all.find(e => e.type === 'badge') as BadgeEl | undefined
	const card = all.find(e => e.type === 'card') as CardEl | undefined
	const shape = PRESETS[d.preset].shape
	const layout = layoutOf(d.recipe) ?? 'hero'
	return {
		title: headline?.text ?? '',
		accent: headline?.accent ?? '',
		eyebrow: text?.text ?? '',
		badge: badge?.text ?? '',
		logo: all.some(e => e.type === 'logo'),
		font: headline?.font ?? '',
		treatment: headline?.treatment ?? 'outline',
		scale: headline ? Math.round((headline.size / BASE_SIZE[layout][shape]) * 100) / 100 : 1,
		label: card?.label ?? DEFAULT_CONTENT.label,
		cardTitle: card?.title ?? DEFAULT_CONTENT.cardTitle,
		detail: card?.detail ?? DEFAULT_CONTENT.detail,
	}
}

const SIZE_SUFFIX = new RegExp(` · (${Object.values(PRESETS).map(p => p.short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`)
/** A design name without the size suffix that "All sizes" adds. */
export const baseName = (name: string) => name.replace(SIZE_SUFFIX, '')

// Same design at another size: built-in layouts re-flow, free layouts keep relative positions inside the safe area
export const adaptDesign = (d: Design, preset: PresetId): Design => {
	const name = `${baseName(d.name)} · ${PRESETS[preset].short}`
	const layout = layoutOf(d.recipe)
	if (layout) {
		const c = contentOf(d)
		const made = layoutElements(layout, preset, { ...c, scale: Math.min(c.scale, 1.15) })
		return { ...d, id: rid(), name, preset, elements: made.elements, background: { ...d.background, shade: made.shade, shadeAmount: made.shadeAmount } }
	}
	const from = PRESETS[d.preset]
	const to = PRESETS[preset]
	const fs = { x: (from.safe.x / from.w) * 100, y: (from.safe.y / from.h) * 100, w: (from.safe.w / from.w) * 100, h: (from.safe.h / from.h) * 100 }
	const ts = { x: (to.safe.x / to.w) * 100, y: (to.safe.y / to.h) * 100, w: (to.safe.w / to.w) * 100, h: (to.safe.h / to.h) * 100 }
	const k = from.w / to.w
	const r = (n: number) => Math.round(n * 100) / 100
	const elements = d.elements.map(e => {
		const rx = (e.x - fs.x) / fs.w
		const ry = (e.y - fs.y) / fs.h
		const fix = (c: El): El => ({ ...c, id: rid(), w: r(Math.min(ts.w, c.w * k)) }) as El
		return { ...fix(e), x: r(ts.x + rx * ts.w), y: r(ts.y + ry * ts.h), ...(e.type === 'stack' ? { children: e.children.map(fix) } : {}) } as El
	})
	return { ...d, id: rid(), name, preset, elements }
}
