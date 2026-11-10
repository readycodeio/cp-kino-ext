// Shared light and dark colours for the project panels (Terminal, YT Downloader, Voiceover, Thumbnails, Publish).
// Panels render inside Kino's own page, and Kino puts class="light" on <html> in its light theme.
// Dark values are the defaults, so a missing class keeps the original look. Inline styles use var(--kp-*),
// overlays use rgba(var(--kp-ink),alpha), and canvas or xterm code reads the live theme with useKinoTheme().
import { useEffect, useState } from 'react'

const STYLE_ID = 'kino-panel-theme'

const DARK = {
	scheme: 'dark',
	bg: '#0f0f11',
	'bg-rgb': '15,15,17',
	ink: '255,255,255',
	text: '#e4e4e7',
	strong: '#fafafa',
	muted: '#a1a1aa',
	dim: 'rgba(255,255,255,0.5)',
	line: 'rgba(255,255,255,0.07)',
	well: 'rgba(0,0,0,0.35)',
	sink: '0,0,0',
	modal: '#141416',
	toast: '#27272a',
	scrim: 'rgba(0,0,0,0.55)',
	shadow: 'rgba(0,0,0,0.4)',
	'shadow-lg': 'rgba(0,0,0,0.6)',
	'error-bg': '#3b1d1d',
	red: '#fca5a5',
	'red-2': '#f87171',
	amber: '#fcd34d',
	yellow: '#facc15',
	green: '#86efac',
	'green-2': '#4ade80',
	violet: '#c4b5fd',
	cyan: '#67e8f9',
	blue: '#93c5fd',
	link: '#fdba74',
	ember: '#ff8a1f',
	'st-ok': '#3fb950',
	'st-wait': '#d29922',
	'st-bad': '#f85149',
	'st-off': '#8b949e',
	'brand-x': '#e7e9ea',
	'brand-threads': '#c9c9c9',
}

// Neutrals follow Kino's light workbench variables, with fallbacks for older builds.
// Accents are the -700 shades of the dark theme's pastels, so they stay readable on a light background.
const LIGHT: typeof DARK = {
	scheme: 'light',
	bg: 'var(--workbench-bg, #f5f3ee)',
	'bg-rgb': '245,243,238',
	ink: '42,40,38',
	text: 'var(--workbench-text, rgba(42,40,38,0.9))',
	strong: '#1c1b1a',
	muted: 'rgba(42,40,38,0.64)',
	dim: 'rgba(42,40,38,0.62)',
	line: 'rgba(42,40,38,0.12)',
	well: '#ffffff',
	sink: '255,255,255',
	modal: 'var(--workbench-menu-bg, #fcfbf9)',
	toast: 'var(--workbench-menu-bg, #fcfbf9)',
	scrim: 'rgba(42,40,38,0.28)',
	shadow: 'rgba(42,40,38,0.16)',
	'shadow-lg': 'rgba(42,40,38,0.22)',
	'error-bg': '#fdecec',
	red: '#b91c1c',
	'red-2': '#dc2626',
	amber: '#b45309',
	yellow: '#a16207',
	green: '#15803d',
	'green-2': '#16a34a',
	violet: '#6d28d9',
	cyan: '#0e7490',
	blue: '#1d4ed8',
	link: '#c2410c',
	ember: '#e06a00',
	'st-ok': '#1a7f37',
	'st-wait': '#9a6700',
	'st-bad': '#cf222e',
	'st-off': '#6e7781',
	'brand-x': '#0f1419',
	'brand-threads': '#101010',
}

const block = (tokens: Record<string, string>) =>
	Object.entries(tokens)
		.map(([name, value]) => `--kp-${name}:${value};`)
		.join('')

const CSS = `:root{${block(DARK)}}:root.light{${block(LIGHT)}}`

export const ensurePanelTheme = () => {
	if (typeof document === 'undefined') return
	let style = document.getElementById(STYLE_ID)
	if (!style) {
		style = document.createElement('style')
		style.id = STYLE_ID
		document.head.appendChild(style)
	}
	if (style.textContent !== CSS) style.textContent = CSS
}

// Runs on import, so the variables exist before a panel's first paint.
ensurePanelTheme()

export type KinoTheme = 'light' | 'dark'
export const currentTheme = (): KinoTheme =>
	typeof document !== 'undefined' && document.documentElement.classList.contains('light') ? 'light' : 'dark'

// Follows Kino's theme switch live, for code that cannot use CSS variables (canvas, xterm).
export const useKinoTheme = (): KinoTheme => {
	const [theme, setTheme] = useState<KinoTheme>(currentTheme)
	useEffect(() => {
		const update = () => setTheme(currentTheme())
		const observer = new MutationObserver(update)
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
		update()
		return () => observer.disconnect()
	}, [])
	return theme
}

// A token's resolved value, for canvas drawing: cssVar(el, 'ink') gives "255,255,255" or "42,40,38".
export const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(`--kp-${name}`).trim()
