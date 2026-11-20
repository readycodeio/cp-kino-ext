// Voiceover panel: small controls, the waveform and the playhead readout.
import { Component, createElement as h, useEffect, useRef, useState } from 'react'
import { useFps, useRemotionPlayer, useTimelinePosition } from 'kino/panel'
import { cssVar, useKinoTheme } from '../theme'
import { STYLE_ID, UI_FONT, MONO, BG, TEXT, DIM, FAINT, loadAudio, fmtTc } from './lib'

// ---------- small UI pieces ----------
export const button = {
	height: 22,
	padding: '0 8px',
	border: '1px solid rgba(var(--kp-ink),0.1)',
	borderRadius: 5,
	background: 'rgba(var(--kp-ink),0.04)',
	color: 'rgba(var(--kp-ink),0.78)',
	fontSize: 11,
	fontFamily: UI_FONT,
	cursor: 'pointer',
	lineHeight: '20px',
	flexShrink: 0,
	whiteSpace: 'nowrap' as const,
}
export const primary = { ...button, height: 26, padding: '0 14px', background: TEXT, color: BG, border: 'none', fontWeight: 600, fontSize: 12, lineHeight: '26px' }
export const input = {
	height: 26,
	padding: '0 8px',
	borderRadius: 5,
	border: '1px solid rgba(var(--kp-ink),0.14)',
	background: 'var(--kp-well)',
	color: TEXT,
	fontFamily: UI_FONT,
	fontSize: 12,
	outline: 'none',
	minWidth: 0,
	boxSizing: 'border-box' as const,
}
export const infoLine = { marginTop: 4, color: DIM, fontSize: 11, lineHeight: 1.45 }
export const sectionTitle = (text: string, extra?: unknown) =>
	h(
		'div',
		{ style: { display: 'flex', alignItems: 'center', gap: 6, color: DIM, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' as const } },
		h('span', null, text),
		extra ?? null,
	)
export const clamp = (lines: number) => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' })
// A click must not move keyboard focus onto a button: Space would then press it again (and spend credits)
// instead of playing the timeline.
export const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault()

export const Btn = (props: { label: string; title?: string; onClick: () => void; disabled?: boolean; style?: object; primary?: boolean }) =>
	h(
		'button',
		{
			className: props.primary ? undefined : 'kino-vo-btn',
			title: props.title,
			disabled: props.disabled,
			onMouseDown: keepFocus,
			onClick: (event: { stopPropagation: () => void }) => {
				event.stopPropagation()
				props.onClick()
			},
			style: { ...(props.primary ? primary : button), ...(props.disabled ? { opacity: 0.4, cursor: 'default' } : {}), ...props.style },
		},
		props.label,
	)

export const IconBtn = (label: string, title: string, onClick: () => void, disabled?: boolean) =>
	h(
		'button',
		{
			className: 'kino-vo-btn',
			title,
			disabled,
			onMouseDown: keepFocus,
			onClick: (event: { stopPropagation: () => void }) => {
				event.stopPropagation()
				onClick()
			},
			style: {
				width: 22,
				height: 22,
				padding: 0,
				border: 'none',
				borderRadius: 5,
				background: 'transparent',
				color: DIM,
				cursor: disabled ? 'default' : 'pointer',
				fontSize: 13,
				lineHeight: '22px',
				flexShrink: 0,
				opacity: disabled ? 0.35 : 1,
			},
		},
		label,
	)

export const Segmented = (props: { value: string; options: { value: string; label: string; title?: string }[]; onChange: (value: string) => void }) =>
	h(
		'div',
		{ style: { display: 'flex', padding: 2, gap: 2, borderRadius: 6, background: 'rgba(var(--kp-ink),0.05)', flexShrink: 0, flexWrap: 'wrap' as const } },
		...props.options.map(option =>
			h(
				'button',
				{
					key: option.value,
					title: option.title,
					onMouseDown: keepFocus,
					onClick: () => props.onChange(option.value),
					style: {
						height: 20,
						padding: '0 8px',
						border: 'none',
						borderRadius: 4,
						fontSize: 11,
						fontFamily: UI_FONT,
						cursor: 'pointer',
						background: props.value === option.value ? 'rgba(var(--kp-ink),0.14)' : 'transparent',
						color: props.value === option.value ? 'var(--kp-strong)' : DIM,
						fontWeight: props.value === option.value ? 600 : 400,
					},
				},
				option.label,
			),
		),
	)

export const Select = (props: { value: string; onChange: (value: string) => void; options: unknown[]; title?: string; disabled?: boolean; style?: object }) =>
	h(
		'select',
		{
			value: props.value,
			title: props.title,
			disabled: props.disabled,
			onChange: (event: { target: { value: string } }) => props.onChange(event.target.value),
			style: { ...input, flex: 1, paddingRight: 4, cursor: 'pointer', ...props.style },
		},
		...props.options,
	)

export const Row = (label: string, control: unknown, title?: string) =>
	h(
		'div',
		{ style: { display: 'flex', alignItems: 'center', gap: 8, minHeight: 26 } },
		h('span', { title, style: { width: 96, flexShrink: 0, color: DIM, fontSize: 11, cursor: title ? 'help' : 'default' } }, label),
		h('div', { style: { flex: 1, minWidth: 0, display: 'flex', gap: 6, alignItems: 'center' } }, control),
	)

export const Slider = (props: {
	label: string
	title?: string
	value: number | null
	fallback?: number | null
	min: number
	max: number
	step: number
	format?: (n: number) => string
	onChange: (value: number | null) => void
	resetLabel?: string
}) => {
	const shown = props.value ?? props.fallback ?? (props.min + props.max) / 2
	const format = props.format ?? ((n: number) => n.toFixed(2))
	return h(
		'div',
		{ style: { display: 'flex', alignItems: 'center', gap: 8, height: 26 } },
		h('span', { title: props.title, style: { width: 96, flexShrink: 0, color: DIM, fontSize: 11, cursor: props.title ? 'help' : 'default' } }, props.label),
		h('input', {
			type: 'range',
			className: 'kino-vo-range',
			min: props.min,
			max: props.max,
			step: props.step,
			value: shown,
			onChange: (event: { target: { value: string } }) => props.onChange(Number(event.target.value)),
			style: { flex: 1, minWidth: 60, opacity: props.value === null ? 0.45 : 1 },
		}),
		h(
			'span',
			{ title: props.value === null ? props.resetLabel ?? 'Voice default' : undefined, style: { width: 42, textAlign: 'right' as const, fontFamily: MONO, fontSize: 11, color: props.value === null ? FAINT : TEXT } },
			format(shown),
		),
		h(
			'span',
			{ style: { width: 22, flexShrink: 0, visibility: props.value === null ? ('hidden' as const) : ('visible' as const) } },
			IconBtn('↺', props.resetLabel ? `Back to ${props.resetLabel.toLowerCase()}` : 'Back to the voice default', () => props.onChange(null)),
		),
	)
}

// ---------- error boundary + playhead probe ----------
export class Boundary extends Component<{ fallback?: unknown; children?: unknown }, { failed: boolean }> {
	state = { failed: false }
	static getDerivedStateFromError() {
		return { failed: true }
	}
	componentDidCatch() {}
	render() {
		return (this.state.failed ? this.props.fallback ?? null : this.props.children) as any
	}
}

export type PlayheadSink = { current: { frame: number | null; fps: number | null } }
export function PlayheadProbe(props: { sink: PlayheadSink }) {
	const { player, playerRef } = useRemotionPlayer() as { player: unknown; playerRef: unknown }
	const frame = useTimelinePosition({ playerRef } as any) as number
	const { fps } = useFps() as { fps: number }
	const attached = Boolean(player) && Number.isFinite(frame)
	props.sink.current = { frame: attached ? Math.max(0, Math.round(frame)) : null, fps: fps || null }
	return h(
		'span',
		{
			title: 'Playhead. "At playhead" drops takes here.',
			style: { padding: '0 6px', height: 18, lineHeight: '18px', borderRadius: 4, background: 'rgba(var(--kp-ink),0.06)', color: DIM, fontFamily: MONO, fontSize: 10.5 },
		},
		attached ? fmtTc(frame, fps) : '--:--',
	)
}

// ---------- waveform ----------
export function Wave(props: {
	audioKey: string
	path: string
	active: boolean
	audio: HTMLAudioElement
	onSeek: (fraction: number, duration: number) => void
	/** Called with the decoded length, for takes whose sidecar has none (ffprobe not installed). */
	onDuration?: (seconds: number) => void
}) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null)
	const durationRef = useRef(0)
	const [peaks, setPeaks] = useState<number[] | null>(null)
	const theme = useKinoTheme()

	useEffect(() => {
		let live = true
		loadAudio(props.audioKey, props.path)
			.then(data => {
				if (!live) return
				durationRef.current = data.duration
				setPeaks(data.peaks)
				if (data.duration > 0) props.onDuration?.(data.duration)
			})
			.catch(() => live && setPeaks([]))
		return () => {
			live = false
		}
	}, [props.audioKey, props.path])

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const audio = props.audio
		let raf = 0
		const paint = () => {
			const dpr = window.devicePixelRatio || 1
			const width = canvas.clientWidth
			const height = canvas.clientHeight
			if (!width || !height) return
			if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
				canvas.width = Math.round(width * dpr)
				canvas.height = Math.round(height * dpr)
			}
			const ctx = canvas.getContext('2d')
			if (!ctx) return
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
			ctx.clearRect(0, 0, width, height)
			// Canvas cannot read CSS variables, so resolve the theme's ink once per paint
			const ink = cssVar(canvas, 'ink') || '255,255,255'
			const played = cssVar(canvas, 'strong') || '#fafafa'
			const total = audio.duration || durationRef.current
			const progress = props.active && total ? audio.currentTime / total : 0
			const bars = Math.max(8, Math.floor(width / 3))
			for (let i = 0; i < bars; i++) {
				const value = peaks && peaks.length ? peaks[Math.min(peaks.length - 1, Math.floor((i / bars) * peaks.length))] : 0.14
				const bar = Math.max(2, value * (height - 2))
				ctx.fillStyle =
					(i + 0.5) / bars <= progress ? played : peaks === null || !peaks.length ? `rgba(${ink},0.09)` : props.active ? `rgba(${ink},0.36)` : `rgba(${ink},0.24)`
				ctx.fillRect(i * 3, (height - bar) / 2, 2, bar)
			}
		}
		const loop = () => {
			paint()
			if (props.active && !audio.paused) raf = requestAnimationFrame(loop)
		}
		const restart = () => {
			cancelAnimationFrame(raf)
			loop()
		}
		restart()
		const observer = new ResizeObserver(paint)
		observer.observe(canvas)
		const events = ['play', 'pause', 'seeked', 'ended', 'loadedmetadata']
		if (props.active) events.forEach(name => audio.addEventListener(name, restart))
		return () => {
			cancelAnimationFrame(raf)
			observer.disconnect()
			events.forEach(name => audio.removeEventListener(name, restart))
		}
	}, [peaks, props.active, props.audio, theme])

	return h('canvas', {
		ref: canvasRef,
		title: 'Click to play from here',
		onClick: (event: { clientX: number }) => {
			const canvas = canvasRef.current
			if (!canvas) return
			const rect = canvas.getBoundingClientRect()
			props.onSeek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), durationRef.current)
		},
		style: { flex: '1 1 120px', minWidth: 90, height: 26, cursor: 'pointer', display: 'block' },
	})
}

// ---------- editor ----------
export const EDITOR_TEXT = {
	margin: 0,
	padding: '10px 12px',
	boxSizing: 'border-box' as const,
	fontFamily: UI_FONT,
	fontSize: 13.5,
	lineHeight: '21px',
	letterSpacing: 'normal',
	whiteSpace: 'pre-wrap' as const,
	overflowWrap: 'break-word' as const,
	wordBreak: 'normal' as const,
	tabSize: 4,
	textAlign: 'left' as const,
}

export const ensureCss = () => {
	if (document.getElementById(STYLE_ID)) return
	const style = document.createElement('style')
	style.id = STYLE_ID
	style.textContent =
		'@keyframes kino-vo-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}' +
		'.kino-vo-btn:hover{background:rgba(var(--kp-ink),0.09)!important;color:var(--kp-strong)!important}' +
		'.kino-vo-chip:hover{background:rgba(var(--kp-ink),0.1)!important;color:var(--kp-strong)!important}' +
		'.kino-vo-take:hover{background:rgba(var(--kp-ink),0.025)}' +
		'.kino-vo-ta::placeholder{color:rgba(var(--kp-ink),0.3)}' +
		'.kino-vo-ta::selection{background:rgba(147,197,253,0.32);color:transparent}' +
		'.kino-vo-range{accent-color:var(--kp-text);height:14px;margin:0;cursor:pointer}' +
		'.kino-vo-scroll::-webkit-scrollbar{width:8px}.kino-vo-scroll::-webkit-scrollbar-thumb{background:rgba(var(--kp-ink),0.1);border-radius:4px}'
	document.head.appendChild(style)
}

// A command the user is meant to copy into a terminal, with a Copy button beside it.
export const CodeLine = (text: string, onCopied?: () => void) =>
	h(
		'div',
		{ style: { display: 'flex', alignItems: 'stretch', gap: 6 } },
		h(
			'code',
			{ style: { flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 5, background: 'rgba(var(--kp-ink),0.06)', fontFamily: MONO, fontSize: 11, color: TEXT, userSelect: 'text' as const, wordBreak: 'break-all' as const } },
			text,
		),
		Btn({
			label: 'Copy',
			onClick: () => {
				navigator.clipboard?.writeText(text).catch(() => {})
				onCopied?.()
			},
			style: { height: 'auto' },
		}),
	)
