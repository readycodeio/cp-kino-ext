// Thumbnail design model v2: a background plus a list of freely placed elements.
// Shared by the art (ThumbArt.tsx), the Thumbnails panel and the agents that write /thumbs/designs.json.
// The file format is documented for agents in /thumbs/skill/format.md: keep the two in step.

export type PresetId = 'youtube' | 'vertical' | 'instagram' | 'x'
export type Anchor = 'tl' | 'tc' | 'tr' | 'cl' | 'c' | 'cr' | 'bl' | 'bc' | 'br'
export type FontId = 'fira' | 'petrock'
export type ElType = 'headline' | 'text' | 'badge' | 'logo' | 'card' | 'rule' | 'emblem' | 'image' | 'arrow' | 'stack'

// x, y: where the anchor point sits, in % of frame width / height. w: % of frame width (size for boxes,
// max width for text). size: font px on a frame whose short side is 1080. Children of a stack ignore x, y, anchor.
type Base = { id: string; name?: string; x: number; y: number; anchor: Anchor; w: number; visible?: boolean; rotate?: number; opacity?: number }
export type HeadlineEl = Base & { type: 'headline'; text: string; accent: string; font: FontId; treatment: 'outline' | 'shadow' | 'box' | 'plain'; size: number; color?: string; accentColor?: string }
export type TextEl = Base & { type: 'text'; text: string; font: FontId; weight: number; size: number; color?: string; upper: boolean; tracking: number }
export type BadgeEl = Base & { type: 'badge'; text: string; size: number; fill?: string; color?: string }
export type LogoEl = Base & { type: 'logo'; glow: number }
export type CardEl = Base & { type: 'card'; status: string; statusColor: string; server: string; players: string; playersLabel: string; dot: boolean; icon: boolean }
export type RuleEl = Base & { type: 'rule' }
export type EmblemEl = Base & { type: 'emblem'; icon: string; size: number; color?: string }
export type ImageEl = Base & { type: 'image'; src: string; h?: number; fit: 'cover' | 'contain'; border: boolean; shadow: boolean }
export type ArrowEl = Base & { type: 'arrow'; color?: string }
export type StackEl = Base & { type: 'stack'; gap: number; align: 'start' | 'center' | 'end'; children: El[] }
export type El = HeadlineEl | TextEl | BadgeEl | LogoEl | CardEl | RuleEl | EmblemEl | ImageEl | ArrowEl | StackEl

export type Shade = 'none' | 'vignette' | 'top' | 'bottom' | 'left' | 'right' | 'topBottom'
export type Background = { src: string; focusX: number; focusY: number; zoom: number; blur: number; dim: number; shade: Shade; shadeAmount: number }
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
		// from the house skill: strictest of Shorts, TikTok and Reels playback plus the square grid crop, mirrored for symmetry
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

export const BG_LABELS: Record<string, string> = {
	keyart: 'Key art (Oblivion gate)',
	tower: 'Players at White-Gold Tower',
	bridge: 'Players on a bridge',
	rumare: 'Lake Rumare',
	wallpaper: 'Windows wallpaper',
}
export const EMBLEMS = 'anvil fellowship compass ruins orb helm quill runner swords spell scroll forest elder-scroll sword shield potion key tower hammer cyrodiil'.split(' ')
export const EL_LABELS: Record<ElType, string> = {
	headline: 'Headline',
	text: 'Text',
	badge: 'Badge',
	logo: 'Logo',
	card: 'Status card',
	rule: 'Divider',
	emblem: 'Emblem',
	image: 'Image',
	arrow: 'Arrow',
	stack: 'Stack',
}
export const SHADES: Record<Shade, string> = { none: 'None', vignette: 'Vignette', top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right', topBottom: 'Top and bottom' }
export const LAYOUTS = { hero: 'Players hero', brand: 'Brand', status: 'Server online' } as const
export type LayoutId = keyof typeof LAYOUTS

// ---------- helpers ----------
export const rid = () => Math.random().toString(36).slice(2, 10)
export const unit = (p: Preset) => Math.min(p.w, p.h) / 1080
export const anchorXY = (a: Anchor) => ({ ax: a[1] === 'l' ? 0 : a[1] === 'r' ? 100 : a === 'tl' || a === 'bl' || a === 'cl' ? 0 : a === 'tr' || a === 'br' || a === 'cr' ? 100 : 50, ay: a[0] === 't' ? 0 : a[0] === 'b' ? 100 : 50 })
export const hAlign = (a: Anchor) => (anchorXY(a).ax === 0 ? 'start' : anchorXY(a).ax === 100 ? 'end' : 'center')
const ANCHORS: Anchor[] = ['tl', 'tc', 'tr', 'cl', 'c', 'cr', 'bl', 'bc', 'br']
const num = (v: any, d: number, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const str = (v: any, d = '') => (typeof v === 'string' ? v : d)
const bool = (v: any, d: boolean) => (typeof v === 'boolean' ? v : d)
const pick = <T extends string>(v: any, list: readonly T[], d: T): T => (list.includes(v) ? v : d)

// Defaults per element type; also what "Add element" inserts
export const makeEl = (type: ElType, over: Record<string, any> = {}): El => {
	const base = { id: rid(), x: 50, y: 50, anchor: 'c' as Anchor, w: 60, visible: true }
	const by: Record<ElType, any> = {
		headline: { w: 80, text: 'Your own|Server', accent: 'Server', font: 'fira', treatment: 'outline', size: 180 },
		text: { w: 70, text: 'Windows server guide', font: 'fira', weight: 600, size: 36, upper: true, tracking: 0.2 },
		badge: { w: 60, text: '2 MIN', size: 56 },
		logo: { w: 30, glow: 0.35 },
		card: { w: 44, status: 'SERVER ONLINE', statusColor: 'success', server: 'My Cyrodiil', players: '5 / 8', playersLabel: 'players', dot: true, icon: true },
		rule: { w: 50 },
		emblem: { w: 10, icon: 'fellowship', size: 120 },
		image: { w: 40, src: 'tower', fit: 'cover', border: true, shadow: true },
		arrow: { w: 14, rotate: 0 },
		stack: { w: 80, gap: 20, align: 'center', children: [] },
	}
	return normEl({ ...base, ...by[type], ...over, type })!
}

// Fill defaults and clamp ranges, so hand-written or agent-written JSON always renders
export const normEl = (raw: any): El | null => {
	if (!raw || typeof raw !== 'object') return null
	const type = raw.type as ElType
	if (!EL_LABELS[type]) return null
	const base = {
		id: str(raw.id) || rid(),
		name: typeof raw.name === 'string' ? raw.name : undefined,
		x: num(raw.x, 50, -50, 150),
		y: num(raw.y, 50, -50, 150),
		anchor: pick(raw.anchor, ANCHORS, 'c'),
		w: num(raw.w, 50, 1, 200),
		visible: bool(raw.visible, true),
		rotate: num(raw.rotate, 0, -360, 360),
		opacity: num(raw.opacity, 1, 0, 1),
	}
	const color = (v: any) => (typeof v === 'string' && v ? v : undefined)
	switch (type) {
		case 'headline':
			return { ...base, type, text: str(raw.text, 'Headline'), accent: str(raw.accent), font: pick(raw.font, ['fira', 'petrock'], 'fira'), treatment: pick(raw.treatment, ['outline', 'shadow', 'box', 'plain'], 'outline'), size: num(raw.size, 180, 8, 600), color: color(raw.color), accentColor: color(raw.accentColor) }
		case 'text':
			return { ...base, type, text: str(raw.text, 'Text'), font: pick(raw.font, ['fira', 'petrock'], 'fira'), weight: num(raw.weight, 600, 100, 900), size: num(raw.size, 36, 6, 400), color: color(raw.color), upper: bool(raw.upper, true), tracking: num(raw.tracking, 0.2, -0.1, 1) }
		case 'badge':
			return { ...base, type, text: str(raw.text, 'BADGE'), size: num(raw.size, 56, 8, 300), fill: color(raw.fill), color: color(raw.color) }
		case 'logo':
			return { ...base, type, glow: num(raw.glow, 0.35, 0, 1) }
		case 'card':
			return { ...base, type, status: str(raw.status, 'SERVER ONLINE'), statusColor: str(raw.statusColor, 'success'), server: str(raw.server), players: str(raw.players), playersLabel: str(raw.playersLabel, 'players'), dot: bool(raw.dot, true), icon: bool(raw.icon, true) }
		case 'rule':
			return { ...base, type }
		case 'emblem':
			return { ...base, type, icon: pick(raw.icon, EMBLEMS, 'fellowship'), size: num(raw.size, 120, 8, 1200), color: color(raw.color) }
		case 'image':
			return { ...base, type, src: str(raw.src, 'tower'), h: typeof raw.h === 'number' ? num(raw.h, 30, 1, 200) : undefined, fit: pick(raw.fit, ['cover', 'contain'], 'cover'), border: bool(raw.border, false), shadow: bool(raw.shadow, true) }
		case 'arrow':
			return { ...base, type, color: color(raw.color) }
		case 'stack':
			return { ...base, type, gap: num(raw.gap, 20, 0, 400), align: pick(raw.align, ['start', 'center', 'end'], 'center'), children: (Array.isArray(raw.children) ? raw.children : []).map(normEl).filter((e: El | null): e is El => !!e && e.type !== 'stack') }
	}
	return null
}

export const normBg = (raw: any): Background => ({
	src: str(raw?.src, 'tower'),
	focusX: num(raw?.focusX, 50, 0, 100),
	focusY: num(raw?.focusY, 50, 0, 100),
	zoom: num(raw?.zoom, 1, 1, 3),
	blur: num(raw?.blur, 0, 0, 40),
	dim: num(raw?.dim, 0.15, 0, 0.95),
	shade: pick(raw?.shade, Object.keys(SHADES) as Shade[], 'vignette'),
	shadeAmount: num(raw?.shadeAmount, 0.8, 0, 1),
})

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
		prompt: typeof raw.prompt === 'string' ? raw.prompt : undefined,
		recipe: typeof raw.recipe === 'string' ? raw.recipe : undefined,
		background: normBg(raw.background),
		elements: (Array.isArray(raw.elements) ? raw.elements : []).map(normEl).filter(Boolean) as El[],
	}
}

export const normDoc = (text?: string): Doc => {
	try {
		const json = JSON.parse(text ?? '')
		const designs = (Array.isArray(json.designs) ? json.designs : []).map(normDesign).filter(Boolean) as Design[]
		if (designs.length) {
			const seen = new Set<string>()
			for (const d of designs) {
				if (seen.has(d.id)) d.id = rid()
				seen.add(d.id)
			}
			return { version: 2, videoTitle: str(json.videoTitle), chatId: typeof json.chatId === 'string' ? json.chatId : undefined, designs }
		}
	} catch {}
	return { version: 2, videoTitle: '', designs: [newDesign('youtube', 'hero', { name: 'A · Players' })] }
}

// ---------- built-in layouts (also used to migrate v1 designs and for All sizes) ----------
export type Content = {
	title: string
	accent: string
	eyebrow: string
	badge: string
	logo: boolean
	font: FontId
	treatment: HeadlineEl['treatment']
	scale: number
	status: string
	server: string
	players: string
}
export const DEFAULT_CONTENT: Content = { title: 'Your own|Server', accent: 'Server', eyebrow: '', badge: '2 MIN', logo: true, font: 'fira', treatment: 'outline', scale: 1, status: 'SERVER ONLINE', server: 'My Cyrodiil', players: '5 / 8' }

const BASE_SIZE: Record<LayoutId, Record<Preset['shape'], number>> = {
	hero: { land: 230, feed: 180, tall: 170 },
	brand: { land: 178, feed: 150, tall: 150 },
	status: { land: 200, feed: 150, tall: 160 },
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
	const card = (w: number) => makeEl('card', { w: fit(w), status: c.status, server: c.server, players: c.players })
	const stack = (over: Record<string, any>, children: El[]) => makeEl('stack', { align: 'center', gap: 22, ...over, children })

	if (layout === 'brand') {
		if (shape === 'tall') return { shade: 'vignette', shadeAmount: 0.9, elements: [stack({ x: 50, y: T + 1, anchor: 'tc' }, [...logo(60), ...eyebrow(34), head(safeW), makeEl('rule', { w: 48 }), ...badge(52)])] }
		if (shape === 'feed') return { shade: 'vignette', shadeAmount: 0.9, elements: [stack({ x: 50, y: M, anchor: 'c' }, [...logo(60), ...eyebrow(34), head(safeW), makeEl('rule', { w: 64 }), ...badge(50)])] }
		return { shade: 'vignette', shadeAmount: 0.9, elements: [stack({ x: 50, y: M, anchor: 'c', gap: 20 }, [...logo(30), ...eyebrow(36), head(85), makeEl('rule', { w: 56 }), ...badge(50)])] }
	}
	if (layout === 'status') {
		if (shape === 'tall') return { shade: 'topBottom', shadeAmount: 0.85, elements: [stack({ x: 50, y: T + 1, anchor: 'tc', gap: 30 }, [...logo(36), head(safeW), card(safeW)])] }
		if (shape === 'feed') return { shade: 'vignette', shadeAmount: 0.9, elements: [stack({ x: 50, y: M, anchor: 'c', gap: 30 }, [...logo(40), head(safeW), card(76)])] }
		return {
			shade: 'vignette',
			shadeAmount: 0.9,
			elements: [makeEl('card', { x: L, y: M, anchor: 'cl', w: 44, status: c.status, server: c.server, players: c.players }), stack({ x: 73, y: M, anchor: 'c', gap: 24 }, [...logo(26), head(40)])],
		}
	}
	// hero: headline over the sky, subject below, logo out of the way
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
		background: normBg({ src: 'tower', focusX: 50, focusY: 55, dim: 0.15, shade: made.shade, shadeAmount: made.shadeAmount }),
		elements: made.elements,
		...over,
	}
}

const migrateV1 = (d: any): Design => {
	const preset = pick(d.preset, Object.keys(PRESETS) as PresetId[], 'youtube')
	const layout = pick(d.layout, Object.keys(LAYOUTS) as LayoutId[], 'hero')
	const content: Content = {
		title: str(d.title, DEFAULT_CONTENT.title),
		accent: str(d.accent),
		eyebrow: layout === 'brand' ? str(d.eyebrow) : '',
		badge: layout === 'status' ? '' : str(d.badge),
		logo: bool(d.logo, true),
		font: pick(d.font, ['fira', 'petrock'], 'fira'),
		treatment: pick(d.treatment, ['outline', 'shadow', 'box'], 'outline'),
		scale: num(d.textScale, 1, 0.4, 2),
		status: 'SERVER ONLINE',
		server: str(d.server, 'My Cyrodiil'),
		players: str(d.players, '5 / 8'),
	}
	const made = layoutElements(layout, preset, content)
	return {
		id: str(d.id) || rid(),
		name: str(d.name, 'Untitled'),
		set: 'First pass',
		preset,
		recipe: layout,
		background: normBg({ src: d.bg, focusX: d.focusX, focusY: d.focusY, zoom: d.zoom, blur: d.blur, dim: d.dim, shade: made.shade, shadeAmount: made.shadeAmount }),
		elements: made.elements,
	}
}

// ---------- element tree helpers ----------
export const flatten = (els: El[]): El[] => els.flatMap(e => (e.type === 'stack' ? [e, ...e.children] : [e]))
export const findEl = (els: El[], id: string) => flatten(els).find(e => e.id === id) ?? null
export const parentOf = (els: El[], id: string) => els.find(e => e.type === 'stack' && e.children.some(c => c.id === id)) as StackEl | undefined
export const mapEl = (els: El[], id: string, fn: (e: El) => El): El[] =>
	els.map(e => (e.id === id ? fn(e) : e.type === 'stack' ? { ...e, children: e.children.map(c => (c.id === id ? fn(c) : c)) } : e))
export const removeEl = (els: El[], id: string): El[] => els.filter(e => e.id !== id).map(e => (e.type === 'stack' ? { ...e, children: e.children.filter(c => c.id !== id) } : e))
export const moveEl = (els: El[], id: string, dir: -1 | 1): El[] => {
	const swap = (list: El[]) => {
		const i = list.findIndex(e => e.id === id)
		if (i < 0) return null
		const j = i + dir
		if (j < 0 || j >= list.length) return list
		const out = list.slice()
		;[out[i], out[j]] = [out[j], out[i]]
		return out
	}
	const top = swap(els)
	if (top) return top
	return els.map(e => (e.type === 'stack' ? { ...e, children: swap(e.children) ?? e.children } : e))
}

// What the design says, for re-layouts and agent prompts
export const contentOf = (d: Design): Content => {
	const all = flatten(d.elements).filter(e => e.visible !== false)
	const headline = all.find(e => e.type === 'headline') as HeadlineEl | undefined
	const text = all.find(e => e.type === 'text') as TextEl | undefined
	const badge = all.find(e => e.type === 'badge') as BadgeEl | undefined
	const card = all.find(e => e.type === 'card') as CardEl | undefined
	const shape = PRESETS[d.preset].shape
	const layout = (d.recipe && d.recipe in LAYOUTS ? d.recipe : 'hero') as LayoutId
	return {
		title: headline?.text ?? '',
		accent: headline?.accent ?? '',
		eyebrow: text?.text ?? '',
		badge: badge?.text ?? '',
		logo: all.some(e => e.type === 'logo'),
		font: headline?.font ?? 'fira',
		treatment: headline?.treatment ?? 'outline',
		scale: headline ? Math.round((headline.size / BASE_SIZE[layout][shape]) * 100) / 100 : 1,
		status: card?.status ?? 'SERVER ONLINE',
		server: card?.server ?? 'My Cyrodiil',
		players: card?.players ?? '5 / 8',
	}
}

// Same design at another size: built-in layouts re-flow, free layouts keep relative positions inside the safe area
export const adaptDesign = (d: Design, preset: PresetId): Design => {
	const name = `${d.name.replace(/ · (YouTube|Vertical|Instagram|X · Reddit)$/, '')} · ${PRESETS[preset].short}`
	const layout = d.recipe && d.recipe in LAYOUTS ? (d.recipe as LayoutId) : null
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
	const elements = d.elements.map(e => {
		const rx = (e.x - fs.x) / fs.w
		const ry = (e.y - fs.y) / fs.h
		const scaleW = (n: number) => Math.min(ts.w, n * k)
		const fix = (c: El): El => ({ ...c, w: scaleW(c.w) })
		return { ...fix(e), x: ts.x + rx * ts.w, y: ts.y + ry * ts.h, ...(e.type === 'stack' ? { children: e.children.map(fix) } : {}) } as El
	})
	return { ...d, id: rid(), name, preset, elements }
}
