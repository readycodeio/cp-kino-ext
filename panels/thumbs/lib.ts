// Thumbnails panel helpers: project file paths, font embedding, rasterizing, measuring and the guideline checks.
import { domToCanvas } from 'modern-screenshot'
import { headlineLines } from '../../thumbs/ThumbArt'
import { colorOf, rgbOf, type Brand } from '../../thumbs/ui/brand'
import { fontFiles, fontState, type FontDef } from '../../thumbs/ui/fonts'
import { PRESETS, flatten, type BadgeEl, type Design, type HeadlineEl, type PresetId, type Rect, type Zone } from '../../thumbs/model'

export const DESIGNS_PATH = '/thumbs/designs.json'
export const BRAND_PATH = '/thumbs/brand.json'
export const SKILL_DIR = '/thumbs/skill'
export const RULES_PATH = '/thumbs/skill/rules.json'

// ---------- small utils ----------
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const raf = () => new Promise(resolve => requestAnimationFrame(() => resolve(null)))
export const toDataUrl = (blob: Blob) =>
	new Promise<string>((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(String(reader.result))
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(blob)
	})
export const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
	new Promise<Blob>((resolve, reject) => {
		try {
			canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))), type, quality)
		} catch {
			// a canvas that drew a cross-origin image cannot be read back
			reject(new Error('The browser blocked the export because an image came from another site. Import that image into the Kino library and pick it from there.'))
		}
	})
export const fmtBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${Math.round(n / 1024)} KB`)
export const fmtClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
export const slug = (text: string) =>
	text
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.trim()
		.replace(/[\s_]+/g, '-')
		.toLowerCase()
		.slice(0, 60) || 'thumbnail'

// ---------- fonts: SVG snapshots cannot see document fonts, so embed them as data URLs ----------
const faces = new Map<string, Promise<string>>()
const face = (file: { family: string; weight: string; url: string; format: string }) => {
	const key = `${file.family}|${file.weight}|${file.url}`
	let made = faces.get(key)
	if (!made) {
		made = fetch(file.url, { mode: 'cors' })
			.then(response => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
			.then(toDataUrl)
			.then(data => `@font-face{font-family:"${file.family}";src:url(${data}) format("${file.format}");font-weight:${file.weight};font-style:normal;font-display:block}`)
			.catch(() => {
				// a failed download is tried again on the next export instead of being remembered
				faces.delete(key)
				return ''
			})
		faces.set(key, made)
	}
	return made
}
/** @font-face rules, with the files inlined, for the fonts a design draws with. */
export const buildFontCss = async (fonts: FontDef[]) => (await Promise.all(fonts.flatMap(fontFiles).map(face))).filter(Boolean).join('\n')
/** True once every font has loaded or given up, so text is measured in its final font. */
export const fontsSettled = (fonts: FontDef[]) => fonts.every(f => fontState(f) === 'ready' || fontState(f) === 'failed')

// ---------- render, measure, rasterize ----------
export type Box = { el: string; role: string; count: boolean; fs: number; cap: number; x: number; y: number; w: number; h: number; text: string }

// Wait until the offscreen Thumbnail shows the requested render, images are decoded and fonts settled
export const settle = async (host: HTMLElement, key: string, fonts: FontDef[] = [], timeout = 8000) => {
	const t0 = performance.now()
	let root: HTMLElement | null = null
	while (performance.now() - t0 < timeout) {
		root = host.querySelector('[data-thumb-root]') as HTMLElement | null
		if (root && root.dataset.key === key) break
		await sleep(30)
	}
	if (!root || root.dataset.key !== key) throw new Error('The thumbnail did not render in time.')
	await Promise.all(Array.from(root.querySelectorAll('img')).map(img => (img.complete && img.naturalWidth ? null : img.decode().catch(() => {}))))
	await document.fonts.ready
	// a font still on its way would change the text's size after the snapshot: wait, but not forever (fonts give up on their own)
	for (let i = 0; i < 100 && !fontsSettled(fonts); i++) await sleep(150)
	await raf()
	await raf()
	return root
}

export const measureBoxes = (root: HTMLElement, W: number): Box[] => {
	const r0 = root.getBoundingClientRect()
	const k = W / (r0.width || W)
	return (Array.from(root.querySelectorAll('[data-thumb]')) as HTMLElement[])
		.filter(el => el.dataset.thumb !== 'background')
		.map(el => {
			const r = el.getBoundingClientRect()
			return {
				// the placed element or stack item this box belongs to, so parts of one element are never compared with each other
				el: el.closest('[data-el]')?.getAttribute('data-el') ?? '',
				role: el.dataset.thumb ?? '',
				count: el.dataset.count === '1',
				fs: Number(el.dataset.fs) || 0,
				cap: Number(el.dataset.cap) || 0,
				x: (r.left - r0.left) * k,
				y: (r.top - r0.top) * k,
				w: r.width * k,
				h: r.height * k,
				text: (el.textContent ?? '').trim().slice(0, 48),
			}
		})
}

export const rasterize = async (player: HTMLElement, scale: number, fonts: FontDef[], page: string) =>
	domToCanvas(player, { scale, font: { cssText: await buildFontCss(fonts) }, backgroundColor: page } as any)

export const shrink = (canvas: HTMLCanvasElement, width: number) => {
	const out = document.createElement('canvas')
	out.width = Math.min(width, canvas.width)
	out.height = Math.round((out.width * canvas.height) / canvas.width)
	const ctx = out.getContext('2d')!
	ctx.imageSmoothingQuality = 'high'
	ctx.drawImage(canvas, 0, 0, out.width, out.height)
	return out
}

// Encode for a platform: auto steps JPEG quality down until the file fits the limit
export const encode = async (canvas: HTMLCanvasElement, format: 'auto' | 'png', limitMB: number) => {
	const limit = limitMB * 1024 * 1024
	if (format === 'png') {
		const blob = await toBlob(canvas, 'image/png')
		return { blob, format: 'png' as const, quality: null as number | null, over: blob.size > limit }
	}
	let quality = 0.92
	let blob = await toBlob(canvas, 'image/jpeg', quality)
	while (blob.size > limit && quality > 0.55) {
		quality = Math.round((quality - 0.07) * 100) / 100
		blob = await toBlob(canvas, 'image/jpeg', quality)
	}
	return { blob, format: 'jpeg' as const, quality, over: blob.size > limit }
}

// ---------- pixel stats ----------
export type Stats = { accent: number | null; red: number; black: number; white: number }
const hueSat = (r: number, g: number, b: number) => {
	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const l = (max + min) / 2
	const d = max - min
	const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
	let hue = 0
	if (d) hue = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4)
	if (hue < 0) hue += 360
	return { hue, s, l }
}
/** Hue of the brand accent in degrees. Null for grays and colors that are not hex: those cannot be counted. */
export const accentHue = (brand: Brand) => {
	const rgb = rgbOf(colorOf('accent', brand, 'accent'))
	if (!rgb) return null
	const { hue, s } = hueSat(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
	return s < 0.3 ? null : hue
}
export const colorStats = (canvas: HTMLCanvasElement, accent: number | null): Stats => {
	const small = shrink(canvas, 96)
	const data = small.getContext('2d')!.getImageData(0, 0, small.width, small.height).data
	let near = 0
	let red = 0
	let black = 0
	let white = 0
	let n = 0
	for (let i = 0; i < data.length; i += 4) {
		const { hue, s, l } = hueSat(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255)
		n++
		if (l < 0.09) black++
		else if (l > 0.9 && s < 0.2) white++
		if (s > 0.45 && l > 0.22 && l < 0.85) {
			if (accent != null && Math.min(Math.abs(hue - accent), 360 - Math.abs(hue - accent)) <= 20) near++
			if (hue < 12 || hue > 345) red++
		}
	}
	n = Math.max(1, n)
	return { accent: accent == null ? null : near / n, red: red / n, black: black / n, white: white / n }
}

// ---------- taste rules (/thumbs/skill/rules.json, written by the thumbnail skill) ----------
export type Limits = { wordsOk: number; wordsWarn: number; elementsOk: number; elementsWarn: number; capPxOk: number; capPxWarn: number; texturePx: number }
export type Ref = { id: string; title: string; url?: string; kind?: string; year?: string | number; note?: string }
export type Recipe = { id: string; name: string; platforms?: PresetId[]; when?: string; why?: string; refs?: string[]; background?: any; elements?: any[] }
export type Rules = {
	name?: string
	updated?: string
	summary?: string
	principles?: { id: string; title: string; rule: string; why?: string; refs?: string[]; weight?: number }[]
	rubric?: { id: string; question: string; weight?: number; refs?: string[] }[]
	platforms?: Partial<Record<PresetId, { notes?: string[]; limits?: Partial<Limits>; safe?: Rect; zones?: Zone[]; refs?: string[] }>>
	checks?: { accentMin?: number; warmMin?: number; blackMax?: number; whiteMax?: number; redMax?: number; titleOverlap?: number }
	copy?: { do?: string[]; dont?: string[]; patterns?: (string | { pattern?: string; use?: string })[] }
	recipes?: Recipe[]
	examples?: { title?: string; channel?: string; url?: string; platform?: string; why?: string; takeaways?: string[] | string; refs?: string[] }[]
	references?: Ref[]
}
export const DEFAULT_LIMITS: Limits = { wordsOk: 4, wordsWarn: 6, elementsOk: 3, elementsWarn: 4, capPxOk: 8, capPxWarn: 5, texturePx: 4 }

export const parseRules = (text?: string): Rules | null => {
	if (!text) return null
	try {
		const json = JSON.parse(text)
		return json && typeof json === 'object' ? (json as Rules) : null
	} catch {
		return null
	}
}

// Platform numbers with the skill's overrides applied
export const platformOf = (preset: PresetId, rules: Rules | null) => {
	const p = PRESETS[preset]
	const r = rules?.platforms?.[preset]
	const okRect = (v: any): v is Rect => v && [v.x, v.y, v.w, v.h].every((n: any) => typeof n === 'number')
	return {
		...p,
		safe: okRect(r?.safe) ? r!.safe! : p.safe,
		zones: Array.isArray(r?.zones) && r!.zones!.every(okRect) ? r!.zones!.map((z, i) => ({ id: z.id ?? `z${i}`, label: z.label ?? 'UI', hard: z.hard !== false, group: z.group ?? p.short, x: z.x, y: z.y, w: z.w, h: z.h })) : p.zones,
		limits: { ...DEFAULT_LIMITS, ...(r?.limits ?? {}) } as Limits,
		notes: r?.notes ?? [],
	}
}

// ---------- checks ----------
export type Level = 'ok' | 'warn' | 'fail' | 'info'
export type Check = { id: string; level: Level; label: string; detail: string }

const STOP = new Set('a an the and or of to in on for your you my our with how what why is it this that at by from on vs'.split(' '))
const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9:\s]/g, ' ').split(/\s+/).filter(Boolean)

const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
const intersect = (a: Rect, z: Rect) => {
	const w = Math.min(a.x + a.w, z.x + z.w) - Math.max(a.x, z.x)
	const h = Math.min(a.y + a.h, z.y + z.h) - Math.max(a.y, z.y)
	return w > 2 && h > 2
}

export const zoneHits = (boxes: Box[], zones: Zone[]) =>
	boxes
		.filter(b => b.count || b.role === 'text')
		.flatMap(b => zones.filter(z => intersect(b, z)).map(z => ({ box: b, zone: z })))

// Parse "2 min", "90 sec", "10 minutes" into seconds
const claimedSeconds = (badge: string) => {
	const m = badge.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|s|sec|secs|second|seconds)\b/)
	if (!m) return null
	return Number(m[1]) * (m[2].startsWith('m') ? 60 : 1)
}

const ROLE_LABEL: Record<string, string> = { title: 'headline', text: 'text', badge: 'badge', logo: 'logo', card: 'info card', image: 'image', emblem: 'icon', arrow: 'arrow', shape: 'shape' }

export const runChecks = (opts: {
	design: Design
	boxes: Box[]
	stats: Stats | null
	bytes: number | null
	videoTitle: string
	videoSeconds: number
	ytCount: number
	rules: Rules | null
	brand: Brand
}): Check[] => {
	const { design: d, boxes, stats, bytes, videoTitle, videoSeconds, ytCount, rules, brand } = opts
	const p = platformOf(d.preset, rules)
	const L = p.limits
	const ck = { accentMin: rules?.checks?.warmMin ?? 0.04, blackMax: 0.55, whiteMax: 0.45, redMax: 0.3, titleOverlap: 0.04, ...(rules?.checks ?? {}) }
	const out: Check[] = []
	const els = flatten(d.elements).filter(e => e.visible !== false)
	const headline = els.find(e => e.type === 'headline') as HeadlineEl | undefined
	const titleWords = headline ? words(headlineLines(headline, brand).join(' ')) : []

	// Word count
	const n = titleWords.length
	out.push({
		id: 'words',
		level: n <= L.wordsOk ? 'ok' : n <= L.wordsWarn ? 'warn' : 'fail',
		label: headline ? `${n} word${n === 1 ? '' : 's'} in the headline` : 'No headline',
		detail: n <= L.wordsOk ? `Within the 0 to ${L.wordsOk} words most top thumbnails use.` : `Cut to ${L.wordsOk} words or fewer; the title carries the rest.`,
	})

	// Complement, not repeat, the title
	if (videoTitle.trim() && n) {
		const sig = titleWords.filter(w => !STOP.has(w))
		const vt = new Set(words(videoTitle))
		const shared = sig.filter(w => vt.has(w))
		const ratio = sig.length ? shared.length / sig.length : 0
		out.push({
			id: 'complement',
			level: ratio >= 0.75 && sig.length > 1 ? 'warn' : 'ok',
			label: ratio >= 0.75 && sig.length > 1 ? 'Headline repeats the video title' : 'Headline complements the title',
			detail: shared.length ? `Shared words: ${shared.join(', ')}. Thumbnail text works best when it adds to the title instead of repeating it.` : 'No shared keywords with the title.',
		})
	}

	// Legibility at the smallest place it shows
	const k = p.smallest.w / p.w
	const title = boxes.find(b => b.role === 'title')
	if (title) {
		const capPx = title.fs * title.cap * k
		const pct = (title.fs * title.cap) / p.h
		out.push({
			id: 'size',
			level: capPx >= L.capPxOk ? 'ok' : capPx >= L.capPxWarn ? 'warn' : 'fail',
			label: `Headline cap height ${capPx.toFixed(1)} px at ${p.smallest.label}`,
			detail: `${(pct * 100).toFixed(1)}% of the image height. Aim for ${L.capPxOk} px or more at the smallest size.`,
		})
	}
	const texture = boxes.filter(b => b.fs && b.role !== 'title' && b.fs * b.cap * k < L.texturePx)
	out.push({
		id: 'texture',
		level: texture.length ? 'warn' : 'ok',
		label: texture.length ? `${texture.length} small text item${texture.length > 1 ? 's' : ''} read as texture` : 'No unreadable small text',
		detail: texture.length
			? `${texture.map(b => `"${b.text}"`).join(', ')}: under ${L.texturePx} px tall at ${p.smallest.label}. Fine as decoration, never as information.`
			: 'Every text item stays legible at the smallest size.',
	})

	// Platform UI overlays
	const hits = zoneHits(boxes, p.zones)
	const hard = hits.filter(h => h.zone.hard)
	const soft = hits.filter(h => !h.zone.hard)
	const describe = (list: typeof hits) => Array.from(new Set(list.map(h => `${ROLE_LABEL[h.box.role] ?? h.box.role} under ${h.zone.group} ${h.zone.label.toLowerCase()}`))).join('; ')
	out.push({
		id: 'zones',
		level: hard.length ? 'fail' : soft.length ? 'warn' : 'ok',
		label: hard.length ? 'Covered by platform UI' : soft.length ? 'Touches a crop or overlay' : 'Clear of platform UI',
		detail: hard.length ? describe(hard) : soft.length ? describe(soft) : p.zones.length ? `Nothing important under the ${Array.from(new Set(p.zones.map(z => z.group))).join(', ')} overlays.` : 'No overlays are listed for this size.',
	})

	// Safe area: everything that carries meaning sits inside it
	const s = p.safe
	const outside = boxes.filter(b => (b.count || b.role === 'text') && (b.x < s.x - 2 || b.y < s.y - 2 || b.x + b.w > s.x + s.w + 2 || b.y + b.h > s.y + s.h + 2))
	out.push({
		id: 'safe',
		level: outside.length ? 'warn' : 'ok',
		label: outside.length ? `${outside.length} element${outside.length > 1 ? 's' : ''} outside the safe area` : 'Inside the safe area',
		detail: outside.length ? `${Array.from(new Set(outside.map(b => ROLE_LABEL[b.role] ?? b.role))).join(', ')} cross the dashed safe rectangle.` : `Safe rectangle ${s.w}x${s.h} at ${s.x}, ${s.y}.`,
	})

	// Collisions between separate elements
	const solid = boxes.filter(b => b.count || b.role === 'text').filter(b => b.role !== 'arrow')
	const clashes: string[] = []
	for (let i = 0; i < solid.length; i++)
		for (let j = i + 1; j < solid.length; j++) {
			const a = solid[i]
			const b = solid[j]
			if (!a.el || a.el === b.el) continue
			if (!['title', 'text', 'badge'].includes(a.role) && !['title', 'text', 'badge'].includes(b.role)) continue
			const area = overlap(a, b)
			if (area > ck.titleOverlap * Math.min(a.w * a.h, b.w * b.h)) clashes.push(`${ROLE_LABEL[a.role] ?? a.role} and ${ROLE_LABEL[b.role] ?? b.role}`)
		}
	out.push({
		id: 'overlap',
		level: clashes.length ? 'warn' : 'ok',
		label: clashes.length ? 'Text collides with another element' : 'No text collisions',
		detail: clashes.length ? `${Array.from(new Set(clashes)).join('; ')} overlap.` : 'Text has its own space.',
	})

	// Clutter
	const count = boxes.filter(b => b.count).length
	out.push({
		id: 'count',
		level: count <= L.elementsOk ? 'ok' : count <= L.elementsWarn ? 'warn' : 'fail',
		label: `${count} elements over the background`,
		detail: count <= L.elementsOk ? 'One hero and at most two supporting elements.' : `Hide elements until ${L.elementsOk} remain.`,
	})

	if (stats) {
		if (stats.accent != null)
			out.push({
				id: 'accent',
				level: stats.accent >= ck.accentMin ? 'ok' : 'warn',
				label: `Accent color ${(stats.accent * 100).toFixed(1)}% of pixels`,
				detail: stats.accent >= ck.accentMin ? 'The accent color sets it apart from the feed.' : 'Add an accent word or a badge in the brand accent so it stands out.',
			})
		const dom = stats.black > ck.blackMax ? 'black' : stats.white > ck.whiteMax ? 'white' : stats.red > ck.redMax ? 'red' : null
		out.push({
			id: 'dominance',
			level: dom ? 'warn' : 'ok',
			label: dom ? `Mostly ${dom}` : 'Not dominated by feed UI colors',
			detail: dom
				? `${Math.round((dom === 'black' ? stats.black : dom === 'white' ? stats.white : stats.red) * 100)}% ${dom}: blends into the feed's red, white and black UI. Lift the background or lower Dim.`
				: `Black ${Math.round(stats.black * 100)}%, white ${Math.round(stats.white * 100)}%, red ${Math.round(stats.red * 100)}%.`,
		})
	}

	if (bytes != null)
		out.push({
			id: 'bytes',
			level: bytes <= p.limitMB * 1024 * 1024 ? 'ok' : 'fail',
			label: `JPEG ${fmtBytes(bytes)} of ${p.limitMB} MB`,
			detail: `At ${p.w}x${p.h}, quality 0.92. Auto export steps quality down if needed.`,
		})

	for (const b of els.filter(e => e.type === 'badge') as BadgeEl[]) {
		const claimed = claimedSeconds(b.text)
		if (claimed == null || videoSeconds <= 0) continue
		const honest = Math.abs(claimed - videoSeconds) <= Math.max(30, videoSeconds * 0.25)
		out.push({
			id: `promise-${b.id}`,
			level: honest ? 'ok' : 'warn',
			label: `Badge says ${b.text}, the video runs ${fmtClock(videoSeconds)}`,
			detail: honest ? 'The time promise matches the cut.' : 'Match the badge to the real length so viewers stay.',
		})
	}

	if (d.preset === 'youtube')
		out.push({
			id: 'test',
			level: ytCount > 3 ? 'info' : 'ok',
			label: ytCount > 3 ? `${ytCount} YouTube designs, Test & Compare takes 3` : `Ready for Test & Compare (${ytCount} of 3)`,
			detail: 'Up to 3 thumbnails at 1280x720 or larger, from YouTube Studio on desktop.',
		})
	if (d.preset === 'vertical')
		out.push({
			id: 'frame0',
			level: 'info',
			label: 'TikTok picks a cover from the video',
			detail: 'Put this design in the first frame of the vertical cut, or choose the frame when posting. Shorts covers need YouTube Studio on desktop.',
		})
	return out
}
