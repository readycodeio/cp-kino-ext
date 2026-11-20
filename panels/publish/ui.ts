// Publish panel: small UI pieces. Inline styles with the shared theme variables, plus one style tag
// for what inline styles cannot do (hover, keyboard focus, scrollbars).
import { createElement as h, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import '../theme'
import { MONO_FONT, UI_FONT } from '../platform'
import type { Level } from './lib'

export const FONT = UI_FONT
export const MONO = MONO_FONT
export const BG = 'var(--kp-bg)'
export const TEXT = 'var(--kp-text)'
export const STRONG = 'var(--kp-strong)'
export const DIM = 'var(--kp-dim)'
export const LINE = 'var(--kp-line)'
export const RED = 'var(--kp-red)'
export const AMBER = 'var(--kp-amber)'
export const GREEN = 'var(--kp-green)'
export const EMBER = 'var(--kp-ember)'
export const ink = (alpha: number) => `rgba(var(--kp-ink),${alpha})`
// The accent at a given strength, for selected states
export const ember = (percent: number) => `color-mix(in srgb, var(--kp-ember) ${percent}%, transparent)`
export const LEVEL: Record<Level, string> = { ok: GREEN, warn: AMBER, fail: RED, info: 'rgba(var(--kp-ink),0.4)' }

const STYLE_ID = 'kino-publish-css'
export const ensureCss = () => {
	if (document.getElementById(STYLE_ID)) return
	const style = document.createElement('style')
	style.id = STYLE_ID
	style.textContent =
		'.kpub-btn:hover:not(:disabled){background:rgba(var(--kp-ink),0.1)!important;color:var(--kp-strong)!important}' +
		'.kpub-primary:hover:not(:disabled){opacity:.88}' +
		'.kpub-row:hover{background:rgba(var(--kp-ink),0.05)!important}' +
		'.kpub-card:hover{border-color:rgba(var(--kp-ink),0.3)!important}' +
		'.kpub-root button:focus-visible,.kpub-root a:focus-visible,.kpub-root input:focus-visible,.kpub-root textarea:focus-visible,.kpub-root select:focus-visible,.kpub-root [tabindex]:focus-visible{outline:2px solid var(--kp-ember);outline-offset:1px}' +
		'.kpub-root input:focus:not(:focus-visible),.kpub-root textarea:focus:not(:focus-visible){outline:none}' +
		'.kpub-scroll::-webkit-scrollbar{width:8px;height:8px}.kpub-scroll::-webkit-scrollbar-thumb{background:rgba(var(--kp-ink),0.12);border-radius:4px}' +
		'.kpub-range{accent-color:var(--kp-ember)}' +
		'.kpub-link{color:var(--kp-link);text-decoration:none;cursor:pointer;background:none;border:none;padding:0;font:inherit}.kpub-link:hover{text-decoration:underline}'
	document.head.appendChild(style)
}

const button = {
	height: 24,
	padding: '0 9px',
	border: `1px solid ${ink(0.12)}`,
	borderRadius: 5,
	background: ink(0.04),
	color: ink(0.8),
	fontSize: 11,
	fontFamily: FONT,
	cursor: 'pointer',
	flexShrink: 0,
	whiteSpace: 'nowrap' as const,
}
const primary = { ...button, height: 28, padding: '0 14px', background: TEXT, color: BG, border: 'none', fontWeight: 600, fontSize: 12 }
export const input = {
	height: 28,
	padding: '0 8px',
	borderRadius: 5,
	border: `1px solid ${ink(0.14)}`,
	background: 'var(--kp-well)',
	color: TEXT,
	fontFamily: FONT,
	fontSize: 12,
	minWidth: 0,
	boxSizing: 'border-box' as const,
	width: '100%',
}
export const label = { fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: DIM, fontWeight: 600 }
export const small = { fontSize: 11, color: DIM, lineHeight: 1.45 }

/** A button. `primary` marks the one next step on screen; `danger` is for removing things. */
export const Btn = (props: { label: string; title?: string; onClick: () => void; disabled?: boolean; primary?: boolean; danger?: boolean; autoFocus?: boolean; style?: object }) =>
	h(
		'button',
		{
			type: 'button',
			className: props.primary ? 'kpub-primary' : 'kpub-btn',
			title: props.title,
			disabled: props.disabled,
			autoFocus: props.autoFocus,
			onClick: (event: { stopPropagation: () => void }) => {
				event.stopPropagation()
				props.onClick()
			},
			style: { ...(props.primary ? primary : button), ...(props.danger ? { color: RED } : {}), ...(props.disabled ? { opacity: 0.4, cursor: 'default' } : {}), ...props.style },
		},
		props.label,
	)

/** Text that acts: jumps to a section, undoes an edit. */
export const LinkBtn = (props: { label: string; title?: string; onClick: () => void }) => h('button', { type: 'button', className: 'kpub-link', title: props.title, onClick: props.onClick, style: { fontSize: 11 } }, props.label)

// Options share the track evenly, so the control never shows an empty grey tail
export const Segmented = (props: { value: string; options: { value: string; label: string; title?: string }[]; onChange: (value: string) => void; label?: string }) =>
	h(
		'div',
		{ role: 'radiogroup', 'aria-label': props.label, style: { display: 'flex', padding: 2, gap: 2, borderRadius: 6, background: ink(0.06), width: '100%', boxSizing: 'border-box', minWidth: 0 } },
		...props.options.map(option =>
			h(
				'button',
				{
					key: option.value,
					type: 'button',
					role: 'radio',
					'aria-checked': props.value === option.value,
					title: option.title ?? option.label,
					onClick: () => props.onChange(option.value),
					style: {
						flex: '1 1 0',
						minWidth: 0,
						height: 24,
						padding: '0 6px',
						border: 'none',
						borderRadius: 4,
						fontSize: 11,
						fontFamily: FONT,
						cursor: 'pointer',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
						background: props.value === option.value ? ink(0.16) : 'transparent',
						color: props.value === option.value ? STRONG : DIM,
						fontWeight: props.value === option.value ? 600 : 400,
					},
				},
				option.label,
			),
		),
	)

export const Toggle = (props: { value: boolean; onChange: (value: boolean) => void; label: ReactNode; disabled?: boolean }) =>
	h(
		'label',
		{ style: { display: 'flex', alignItems: 'flex-start', gap: 7, minHeight: 24, padding: '3px 0', boxSizing: 'border-box', fontSize: 12, lineHeight: 1.4, color: TEXT, cursor: props.disabled ? 'default' : 'pointer', userSelect: 'none', opacity: props.disabled ? 0.5 : 1 } },
		h('input', { type: 'checkbox', checked: props.value, disabled: props.disabled, onChange: (e: any) => props.onChange(e.target.checked), style: { accentColor: EMBER, margin: '2px 0 0', flex: 'none' } }),
		h('span', null, props.label),
	)

type Keys = { onEnter?: () => void; onModEnter?: () => void }
const keys = (k: Keys, multiline: boolean) => (event: any) => {
	if (event.key !== 'Enter' || event.nativeEvent?.isComposing) return
	const mod = event.metaKey || event.ctrlKey
	if (mod && k.onModEnter) {
		event.preventDefault()
		k.onModEnter()
	} else if (!mod && !multiline && k.onEnter) {
		event.preventDefault()
		k.onEnter()
	}
}

export const TextIn = (props: { value: string; onChange: (value: string) => void; placeholder?: string; type?: string; autoFocus?: boolean; label?: string } & Keys) =>
	h('input', { type: props.type ?? 'text', value: props.value, placeholder: props.placeholder, autoFocus: props.autoFocus, 'aria-label': props.label, autoComplete: 'off', spellCheck: false, onChange: (e: any) => props.onChange(e.target.value), onKeyDown: keys(props, false), style: input })

export const TextArea = (props: { value: string; onChange: (value: string) => void; placeholder?: string; rows?: number; label?: string; invalid?: boolean } & Keys) =>
	h('textarea', {
		value: props.value,
		placeholder: props.placeholder,
		rows: props.rows ?? 4,
		'aria-label': props.label,
		spellCheck: true,
		onChange: (e: any) => props.onChange(e.target.value),
		onKeyDown: keys(props, true),
		style: { ...input, height: 'auto', padding: '6px 8px', lineHeight: 1.45, resize: 'vertical', display: 'block', ...(props.invalid ? { borderColor: RED } : {}) },
	})

export const Select = (props: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; label?: string }) =>
	h('select', { value: props.value, 'aria-label': props.label, onChange: (e: any) => props.onChange(e.target.value), style: { ...input, paddingRight: 4 } }, ...props.options.map(o => h('option', { key: o.value, value: o.value }, o.label)))

export const Range = (props: { value: number; min: number; max: number; step: number; onChange: (value: number) => void; label?: string }) =>
	h(
		'div',
		{ style: { display: 'flex', alignItems: 'center', gap: 8, height: 28 } },
		h('input', { type: 'range', className: 'kpub-range', 'aria-label': props.label, min: props.min, max: props.max, step: props.step, value: props.value, onChange: (e: any) => props.onChange(Number(e.target.value)), style: { flex: 1, minWidth: 0 } }),
		h('span', { style: { width: 20, textAlign: 'right', fontFamily: MONO, fontSize: 11, color: DIM } }, String(props.value)),
	)

/** A labelled control. The hint sits beside the label in plain case. */
export const Field = (props: { label: string; hint?: ReactNode; children?: ReactNode; wide?: boolean }) =>
	h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 4, gridColumn: props.wide ? '1 / -1' : undefined, minWidth: 0 } },
		h('span', { style: label }, props.label, props.hint ? h('span', { style: { textTransform: 'none', letterSpacing: 0, fontWeight: 400, marginLeft: 6 } }, props.hint) : null),
		props.children,
	)

/** Columns that fold into one when the panel is narrow. */
export const Grid = (props: { children?: ReactNode; min?: number; top?: boolean }) =>
	h('div', { style: { display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(${props.min ?? 190}px, 100%), 1fr))`, gap: '10px 12px', alignItems: props.top ? 'start' : 'end' } }, props.children)

export const Dot = (props: { color: string }) => h('span', { style: { width: 7, height: 7, borderRadius: '50%', background: props.color, flex: 'none', display: 'inline-block', boxShadow: `0 0 0 1px ${ink(0.12)}` } })

export const Card = (props: { children?: ReactNode; accent?: string; style?: object }) =>
	h('div', { style: { border: `1px solid ${LINE}`, borderLeft: props.accent ? `2px solid ${props.accent}` : `1px solid ${LINE}`, borderRadius: 8, padding: 10, background: ink(0.02), display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, ...props.style } }, props.children)

/** A numbered step of the path. `right` is a one-line summary of where the step stands. */
export const Step = (props: { n: number; title: string; right?: ReactNode; anchor?: (el: HTMLElement | null) => void; children?: ReactNode }) =>
	h(
		'section',
		{ ref: props.anchor, style: { display: 'flex', flexDirection: 'column', gap: 10, scrollMarginTop: 8 } },
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 24, borderBottom: `1px solid ${LINE}`, paddingBottom: 6 } },
			h('span', { style: { width: 18, height: 18, borderRadius: '50%', background: ink(0.1), color: STRONG, fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' } }, String(props.n)),
			h('span', { style: { fontSize: 13, fontWeight: 600, color: STRONG } }, props.title),
			h('div', { style: { flex: 1 } }),
			props.right ? h('span', { style: { fontSize: 11, color: DIM } }, props.right) : null,
		),
		props.children,
	)

/** A fold for the things most people leave alone. */
export const More = (props: { open: boolean; onToggle: () => void; label: string; children?: ReactNode }) =>
	h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
		h('div', null, h('button', { type: 'button', className: 'kpub-link', 'aria-expanded': props.open, onClick: props.onToggle, style: { fontSize: 11, color: DIM } }, `${props.open ? '▾' : '▸'} ${props.label}`)),
		props.open ? props.children : null,
	)

export const Counter = ({ n, max, warnAt }: { n: number; max?: number; warnAt?: number }) =>
	h('span', { 'aria-live': 'polite', style: { fontFamily: MONO, fontSize: 10, flex: 'none', color: max && n > max ? RED : warnAt && n > warnAt ? AMBER : DIM } }, max ? `${n}/${max}` : String(n))

export const Bar = ({ value, color }: { value: number; color?: string }) =>
	h('div', { style: { height: 3, borderRadius: 2, background: ink(0.1), overflow: 'hidden' } }, h('div', { style: { height: '100%', width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, background: color ?? EMBER } }))

const FOCUSABLE = 'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])'

/**
 * A dialog over the panel. Escape and a click outside close it unless `locked` (work in progress).
 * Focus moves in when it opens, stays inside while it is open and returns to where it was after.
 */
export const Modal = (props: { title: string; onClose: () => void; locked?: boolean; width?: number; children?: ReactNode; footer?: ReactNode }) => {
	const box = useRef<HTMLDivElement | null>(null)
	useEffect(() => {
		const before = document.activeElement as HTMLElement | null
		const el = box.current
		if (el && !el.contains(document.activeElement)) el.focus()
		return () => before?.focus?.()
	}, [])
	const onKeyDown = (event: any) => {
		if (event.key === 'Escape' && !props.locked) {
			event.stopPropagation()
			props.onClose()
		}
		if (event.key !== 'Tab' || !box.current) return
		const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
		if (!items.length) return event.preventDefault()
		const first = items[0]
		const last = items[items.length - 1]
		const at = document.activeElement
		if (event.shiftKey && (at === first || at === box.current)) {
			event.preventDefault()
			last.focus()
		} else if (!event.shiftKey && at === last) {
			event.preventDefault()
			first.focus()
		}
	}
	return h(
		'div',
		{ className: 'kpub-root kpub-scroll', onMouseDown: (e: any) => e.target === e.currentTarget && !props.locked && props.onClose(), style: { position: 'fixed', inset: 0, zIndex: 60, background: 'var(--kp-scrim)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 12px', overflow: 'auto', fontFamily: FONT, fontSize: 12, color: TEXT } },
		h(
			'div',
			{ ref: box, role: 'dialog', 'aria-modal': true, 'aria-label': props.title, tabIndex: -1, onKeyDown, style: { width: '100%', maxWidth: props.width ?? 520, background: 'var(--kp-modal)', border: `1px solid ${ink(0.12)}`, borderRadius: 10, boxShadow: '0 20px 60px var(--kp-shadow-lg)', display: 'flex', flexDirection: 'column', outline: 'none' } },
			h(
				'div',
				{ style: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: `1px solid ${LINE}` } },
				h('span', { style: { fontWeight: 600, fontSize: 14, color: STRONG, flex: 1 } }, props.title),
				h(Btn, { label: 'Close', onClick: props.onClose, disabled: props.locked }),
			),
			h('div', { style: { padding: 14, display: 'flex', flexDirection: 'column', gap: 12 } }, props.children),
			props.footer ? h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', padding: '10px 14px', borderTop: `1px solid ${LINE}` } }, props.footer) : null,
		),
	)
}

export const copyText = async (text: string) => {
	try {
		await navigator.clipboard.writeText(text)
		return true
	} catch {
		return false
	}
}
