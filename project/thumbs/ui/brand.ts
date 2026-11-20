// The brand kit the thumbnail art is drawn with: colors, fonts, logo, named images, icons and a divider ornament.
// It is user data in /thumbs/brand.json, edited in the panel's Brand tab or by an agent (format in
// /thumbs/skill/format.md). A missing or broken file gives the neutral kit below, so the art always renders.

export type BrandColors = {
	page: string // canvas behind the background image, and the shade gradients
	text: string // headlines and card titles
	body: string // secondary light text
	muted: string // small text, icons, dividers and frames
	accent: string // accent words, badges, arrows, logo glow
	accentAlt: string // accent on a dark box
	onAccent: string // text on the accent color
	ink: string // outlines around text and arrows
	panel: string // fill of text boxes and the info card
	panelGlow: string // inner glow of the info card; empty for none
	success: string
	warning: string
	danger: string
}
export type BrandFont = { id: string; label: string; family: string; url: string; format: string; weights: number[]; fallback: string; upper: boolean; tracking: number; lineHeight: number }
export type BrandImage = { key: string; label: string; media: string }
export type BrandIcon = { d: string; box: number }
export type OrnamentPath = { d: string; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number; transform?: string }
export type Ornament = { w: number; h: number; paths: OrnamentPath[] }
export type Brand = {
	version: 1
	name: string
	colors: BrandColors
	swatches: { label: string; value: string }[]
	fonts: { headline: string; text: string; display: string; custom: BrandFont[] }
	logo: { media: string }
	images: BrandImage[]
	icons: Record<string, BrandIcon>
	divider: Ornament | null
}

export const COLOR_LABELS: Record<keyof BrandColors, string> = {
	page: 'Page',
	text: 'Headline',
	body: 'Body text',
	muted: 'Muted',
	accent: 'Accent',
	accentAlt: 'Accent on dark',
	onAccent: 'On accent',
	ink: 'Outline',
	panel: 'Panel',
	panelGlow: 'Panel glow',
	success: 'Success',
	warning: 'Warning',
	danger: 'Danger',
}

export const DEFAULT_BRAND: Brand = {
	version: 1,
	name: '',
	colors: {
		page: '#101114',
		text: '#ffffff',
		body: '#e5e7eb',
		muted: '#cbd5e1',
		accent: '#ffd60a',
		accentAlt: '#ffe45c',
		onAccent: '#111111',
		ink: '#0a0a0a',
		panel: '#111318',
		panelGlow: '',
		success: '#4ade80',
		warning: '#fbbf24',
		danger: '#ef4444',
	},
	swatches: [],
	fonts: { headline: 'anton', text: 'inter', display: 'anton', custom: [] },
	logo: { media: '' },
	images: [],
	icons: {},
	divider: null,
}

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d)
const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const list = (v: unknown): any[] => (Array.isArray(v) ? v : [])
const MEDIA_ID = /^[\w-]{6,}$/
/** Lowercase letters, digits and dashes: what image keys, font ids and icon names are made of. */
export const keyOf = (text: string) =>
	text
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40)

const normPath = (raw: any): OrnamentPath | null =>
	raw && typeof raw.d === 'string' && raw.d
		? {
				d: raw.d,
				fill: typeof raw.fill === 'string' ? raw.fill : undefined,
				stroke: typeof raw.stroke === 'string' ? raw.stroke : undefined,
				strokeWidth: typeof raw.strokeWidth === 'number' ? num(raw.strokeWidth, 2, 0, 100) : undefined,
				opacity: typeof raw.opacity === 'number' ? num(raw.opacity, 1, 0, 1) : undefined,
				transform: typeof raw.transform === 'string' ? raw.transform : undefined,
			}
		: null

/** Fill defaults and drop what cannot be used, so a hand-written or agent-written brand.json always works. */
export const normBrand = (raw: any): Brand => {
	const d = DEFAULT_BRAND
	if (!raw || typeof raw !== 'object') return d
	const colors = { ...d.colors }
	for (const key of Object.keys(colors) as (keyof BrandColors)[]) if (typeof raw.colors?.[key] === 'string' && (raw.colors[key] || key === 'panelGlow')) colors[key] = raw.colors[key]
	const custom = list(raw.fonts?.custom)
		.map((f): BrandFont | null => {
			const id = keyOf(str(f?.id) || str(f?.family))
			const family = str(f?.family).replace(/["'<>{};]/g, '').trim()
			const url = str(f?.url)
			if (!id || !family || !/^https:\/\//.test(url)) return null
			const weights = list(f.weights).filter(w => typeof w === 'number' && w >= 100 && w <= 900)
			return {
				id,
				label: str(f.label) || family,
				family,
				url,
				format: str(f.format) || (/\.woff2(\?|$)/.test(url) ? 'woff2' : /\.woff(\?|$)/.test(url) ? 'woff' : /\.otf(\?|$)/.test(url) ? 'opentype' : 'truetype'),
				weights: weights.length ? weights : [400],
				fallback: str(f.fallback).replace(/[<>{};]/g, '') || 'system-ui, sans-serif',
				upper: f.upper === true,
				tracking: num(f.tracking, 0, -0.1, 1),
				lineHeight: num(f.lineHeight, 1, 0.6, 2),
			}
		})
		.filter(Boolean) as BrandFont[]
	const seen = new Set<string>()
	const images = list(raw.images)
		.map((i): BrandImage | null => {
			const media = str(i?.media)
			const key = keyOf(str(i?.key) || str(i?.label))
			if (!key || !MEDIA_ID.test(media) || seen.has(key)) return null
			seen.add(key)
			return { key, label: str(i.label) || key, media }
		})
		.filter(Boolean) as BrandImage[]
	const icons: Record<string, BrandIcon> = {}
	if (raw.icons && typeof raw.icons === 'object')
		for (const [name, v] of Object.entries(raw.icons as Record<string, any>)) {
			const path = typeof v === 'string' ? v : str(v?.d)
			if (keyOf(name) === name && path) icons[name] = { d: path, box: num(typeof v === 'object' ? v?.box : undefined, 24, 1, 4096) }
		}
	const paths = list(raw.divider?.paths).map(normPath).filter(Boolean) as OrnamentPath[]
	return {
		version: 1,
		name: str(raw.name).slice(0, 80),
		colors,
		swatches: list(raw.swatches)
			.filter(s => typeof s?.value === 'string' && s.value)
			.map(s => ({ label: str(s.label) || s.value, value: s.value }))
			.slice(0, 16),
		fonts: { headline: str(raw.fonts?.headline) || d.fonts.headline, text: str(raw.fonts?.text) || d.fonts.text, display: str(raw.fonts?.display) || str(raw.fonts?.headline) || d.fonts.display, custom },
		logo: { media: MEDIA_ID.test(str(raw.logo?.media)) ? raw.logo.media : '' },
		images,
		icons,
		divider: paths.length ? { w: num(raw.divider.w, 300, 1, 4000), h: num(raw.divider.h, 40, 1, 4000), paths } : null,
	}
}

export const parseBrand = (text?: string): Brand => {
	try {
		return normBrand(JSON.parse(text ?? ''))
	} catch {
		return DEFAULT_BRAND
	}
}

// ---------- colors ----------
// Design colors are either a brand token (so a design follows the kit when it changes) or any CSS color.
const ALIASES: Record<string, keyof BrandColors> = { online: 'success', ok: 'success', error: 'danger', offline: 'danger', rule: 'muted', line: 'muted', fg: 'body', heading: 'text', highlight: 'accent' }
export const COLOR_TOKENS = Object.keys(DEFAULT_BRAND.colors).filter(k => k !== 'panelGlow') as (keyof BrandColors)[]

/** A design color as CSS: brand tokens resolve to the kit's value, anything else passes through. */
export const colorOf = (value: string | undefined, brand: Brand, fallback: keyof BrandColors): string => {
	if (!value) return brand.colors[fallback]
	const key = (value in brand.colors ? value : ALIASES[value]) as keyof BrandColors | undefined
	return key ? brand.colors[key] || brand.colors[fallback] : value
}

/** "#rrggbb" or "#rgb" as [r, g, b]; null for anything else (named colors, rgba, gradients). */
export const rgbOf = (hex: string): [number, number, number] | null => {
	const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
	if (!m) return null
	const full = m[1].length === 3 ? m[1].replace(/./g, ch => ch + ch) : m[1]
	const n = parseInt(full, 16)
	return [n >> 16, (n >> 8) & 255, n & 255]
}
/** A hex color at an alpha. Colors that are not hex are returned unchanged at full strength. */
export const alpha = (color: string, a: number) => {
	const rgb = rgbOf(color)
	return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})` : color
}

// Library ids carry digits; a plain word is an image name from a kit this project does not have
const LIBRARY_ID = /^(?=.*\d)[\w-]{6,}$/
/** Library media id behind an image source: a named brand image, or the id itself. Empty when it is neither. */
export const mediaOf = (src: string, brand: Brand) => brand.images.find(i => i.key === src)?.media ?? (LIBRARY_ID.test(src) ? src : '')
