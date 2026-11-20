// Fonts for the thumbnail art: a built-in set from Google Fonts plus the custom fonts of the brand kit.
// A font loads the first time a design uses it. Until then text is measured and drawn in the fallback,
// so the art subscribes with onFontsChange and draws again when a font arrives or gives up.
import { getInfo as antonInfo, loadFont as loadAnton } from '@remotion/google-fonts/Anton'
import { getInfo as archivoInfo, loadFont as loadArchivo } from '@remotion/google-fonts/ArchivoBlack'
import { getInfo as bangersInfo, loadFont as loadBangers } from '@remotion/google-fonts/Bangers'
import { getInfo as bebasInfo, loadFont as loadBebas } from '@remotion/google-fonts/BebasNeue'
import { getInfo as firaInfo, loadFont as loadFira } from '@remotion/google-fonts/FiraSans'
import { getInfo as interInfo, loadFont as loadInter } from '@remotion/google-fonts/Inter'
import { getInfo as montserratInfo, loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat'
import { getInfo as oswaldInfo, loadFont as loadOswald } from '@remotion/google-fonts/Oswald'
import { getInfo as markerInfo, loadFont as loadMarker } from '@remotion/google-fonts/PermanentMarker'
import { getInfo as playfairInfo, loadFont as loadPlayfair } from '@remotion/google-fonts/PlayfairDisplay'
import { getInfo as poppinsInfo, loadFont as loadPoppins } from '@remotion/google-fonts/Poppins'
import { getInfo as condensedInfo, loadFont as loadCondensed } from '@remotion/google-fonts/RobotoCondensed'
import type { Brand } from './brand'

type Google = { info: () => any; load: (style?: any, options?: any) => any }
// weight, upper, tracking and lh are the headline defaults of a font; an element can override each
export type FontDef = { id: string; label: string; family: string; fallback: string; weights: number[]; weight: number; upper: boolean; tracking: number; lh: number; google?: Google; url?: string; format?: string }

const SANS = '"Segoe UI", system-ui, sans-serif'
const SERIF = 'Georgia, "Times New Roman", serif'
const WANTED = [400, 500, 600, 700, 800, 900]
const g = (id: string, label: string, google: Google, weight: number, upper: boolean, tracking: number, lh: number, fallback = SANS): FontDef => {
	const info = google.info()
	const weights = Object.keys(info?.fonts?.normal ?? { '400': 1 })
		.map(Number)
		.filter(w => WANTED.includes(w))
	return { id, label, family: String(info?.fontFamily ?? label), fallback, weights: weights.length ? weights : [400], weight, upper, tracking, lh, google }
}

export const FONTS: FontDef[] = [
	g('anton', 'Anton', { info: antonInfo, load: loadAnton }, 400, true, 0.005, 1.04),
	g('bebas', 'Bebas Neue', { info: bebasInfo, load: loadBebas }, 400, true, 0.01, 0.94),
	g('archivo', 'Archivo Black', { info: archivoInfo, load: loadArchivo }, 400, true, -0.01, 0.98),
	g('fira', 'Fira Sans', { info: firaInfo, load: loadFira }, 900, true, -0.01, 0.92),
	g('montserrat', 'Montserrat', { info: montserratInfo, load: loadMontserrat }, 900, true, -0.02, 0.96),
	g('poppins', 'Poppins', { info: poppinsInfo, load: loadPoppins }, 800, false, -0.01, 1.02),
	g('inter', 'Inter', { info: interInfo, load: loadInter }, 900, false, -0.03, 0.98),
	g('oswald', 'Oswald', { info: oswaldInfo, load: loadOswald }, 700, true, 0, 1.06),
	g('condensed', 'Roboto Condensed', { info: condensedInfo, load: loadCondensed }, 900, true, -0.01, 0.96),
	g('bangers', 'Bangers', { info: bangersInfo, load: loadBangers }, 400, true, 0.02, 1),
	g('playfair', 'Playfair Display', { info: playfairInfo, load: loadPlayfair }, 900, false, -0.01, 1, SERIF),
	g('marker', 'Permanent Marker', { info: markerInfo, load: loadMarker }, 400, false, 0, 1.08),
]
const BUILT_IN = new Map(FONTS.map(f => [f.id, f]))

export type FontRole = 'headline' | 'text' | 'display'

/** Fonts offered in the panel: the kit's custom fonts first, then the built-in set. */
export const fontList = (brand: Brand): FontDef[] => [
	...brand.fonts.custom.map(f => ({ id: f.id, label: f.label, family: f.family, fallback: f.fallback, weights: f.weights, weight: f.weights[f.weights.length - 1], upper: f.upper, tracking: f.tracking, lh: f.lineHeight, url: f.url, format: f.format })),
	...FONTS.filter(f => !brand.fonts.custom.some(c => c.id === f.id)),
]

/** The font behind an element's font id. Empty or unknown ids use the kit's font for that role. */
export const fontOf = (id: string | undefined, brand: Brand, role: FontRole): FontDef => {
	const all = fontList(brand)
	return all.find(f => f.id === id) ?? all.find(f => f.id === brand.fonts[role]) ?? BUILT_IN.get('anton')!
}
export const stackOf = (f: FontDef) => `"${f.family}", ${f.fallback}`
/** The weight a font really has that is closest to the one asked for. */
export const weightOf = (f: FontDef, wanted: number) => f.weights.reduce((best, w) => (Math.abs(w - wanted) < Math.abs(best - wanted) ? w : best), f.weights[0])

// ---------- loading ----------
export type FontState = 'loading' | 'ready' | 'failed'
const states = new Map<string, FontState>()
const listeners = new Set<() => void>()
const GIVE_UP_MS = 12000
const keyFor = (f: FontDef) => `${f.family}|${f.url ?? 'google'}`
const settle = (key: string, state: FontState) => {
	if (states.get(key) === state) return
	states.set(key, state)
	caps.clear()
	// never in the middle of a render: listeners set React state
	Promise.resolve().then(() => {
		for (const fn of listeners) fn()
	})
}
// A loader may register its faces only once the files are in, so ask until every weight answers
const arrived = async (f: FontDef) => {
	for (let i = 0; i < GIVE_UP_MS / 150; i++) {
		const faces = await Promise.all(f.weights.map(w => document.fonts.load(`${w} 48px "${f.family}"`))).catch(() => [] as FontFace[][])
		if (faces.length && faces.every(list => list.length > 0)) return true
		await new Promise(resolve => setTimeout(resolve, 150))
	}
	return false
}

/** Called when a font finishes loading or fails. Returns the unsubscribe function. */
export const onFontsChange = (fn: () => void) => {
	listeners.add(fn)
	return () => {
		listeners.delete(fn)
	}
}
export const fontState = (f: FontDef): FontState | undefined => states.get(keyFor(f))

/** Start loading a font unless that already happened. Safe to call on every render. */
export const ensureFont = (f: FontDef) => {
	const key = keyFor(f)
	if (states.has(key) || typeof document === 'undefined') return
	states.set(key, 'loading')
	// a font that never answers must not hold the preview or an export forever
	const timer = setTimeout(() => states.get(key) === 'loading' && settle(key, 'failed'), GIVE_UP_MS)
	const done = (ok: boolean) => {
		clearTimeout(timer)
		settle(key, ok ? 'ready' : 'failed')
	}
	try {
		if (f.google) {
			const loaded = f.google.load('normal', { weights: f.weights.map(String), subsets: ['latin'] })
			Promise.resolve(loaded?.waitUntilDone?.())
				.catch(() => {})
				.then(() => arrived(f))
				.then(done, () => done(false))
		} else if (f.url && typeof FontFace !== 'undefined') {
			const face = new FontFace(f.family, `url(${JSON.stringify(f.url)})`, { weight: f.weights.length > 1 ? `${f.weights[0]} ${f.weights[f.weights.length - 1]}` : String(f.weights[0]), style: 'normal', display: 'block' })
			face.load().then(
				() => {
					;(document.fonts as any).add(face)
					done(true)
				},
				() => done(false),
			)
		} else done(false)
	} catch {
		done(false)
	}
}

/** Files to embed when the art is rasterized: a snapshot cannot see the page's fonts. */
export const fontFiles = (f: FontDef): { family: string; weight: string; url: string; format: string }[] => {
	if (f.url) return [{ family: f.family, weight: f.weights.length > 1 ? `${f.weights[0]} ${f.weights[f.weights.length - 1]}` : String(f.weights[0]), url: f.url, format: f.format ?? 'woff2' }]
	const normal = f.google?.info()?.fonts?.normal ?? {}
	return f.weights.map(w => ({ family: f.family, weight: String(w), url: normal[String(w)]?.latin as string, format: 'woff2' })).filter(file => typeof file.url === 'string')
}

// ---------- measuring (canvas, same font props as the render) ----------
let ctx: CanvasRenderingContext2D | null = null
const canvas = () => (ctx ??= typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d'))
export const measure = (text: string, stack: string, weight: number, size: number, tracking = 0) => {
	const c = canvas()
	if (!c) return text.length * size * 0.5
	c.font = `${weight} ${size}px ${stack}`
	;(c as any).letterSpacing = `${tracking * size}px`
	return c.measureText(text).width
}
/** Largest size up to `base` at which every line fits in maxW. */
export const fitSize = (lines: string[], stack: string, weight: number, tracking: number, base: number, maxW: number) =>
	Math.max(4, Math.floor(Math.min(base, ...lines.map(line => (base * Math.max(1, maxW)) / Math.max(1, measure(line, stack, weight, base, tracking))))))

// Cap height as a share of the font size, for the legibility check. Measured, so custom fonts work too.
const caps = new Map<string, number>()
export const capOf = (f: FontDef, weight: number) => {
	const key = `${keyFor(f)}|${weight}`
	const known = caps.get(key)
	if (known) return known
	const c = canvas()
	let cap = 0.7
	if (c) {
		c.font = `${weight} 100px ${stackOf(f)}`
		;(c as any).letterSpacing = '0px'
		const ascent = c.measureText('H').actualBoundingBoxAscent
		if (ascent > 30 && ascent < 100) cap = Math.round(ascent) / 100
	}
	caps.set(key, cap)
	return cap
}
