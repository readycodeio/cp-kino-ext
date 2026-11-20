// Thumbnails panel: shared UI pieces, styled like the Terminal, YT Downloader and Voiceover panels.
// The Publish panel imports from this file too: keep the exported names and props stable.
import { createElement as h } from 'react'
import type { ReactNode } from 'react'
import type { Level } from './lib'
import '../theme'
import { MONO_FONT, UI_FONT as PLATFORM_UI_FONT } from '../platform'

export const UI_FONT = PLATFORM_UI_FONT
export const MONO = MONO_FONT
export const BG = 'var(--kp-bg)'
export const TEXT = 'var(--kp-text)'
export const DIM = 'var(--kp-dim)'
export const LINE = 'var(--kp-line)'
export const RED = 'var(--kp-red)'
export const AMBER = 'var(--kp-amber)'
export const GREEN = 'var(--kp-green)'
export const EMBER = 'var(--kp-ember)'
export const LEVEL_COLOR: Record<Level, string> = { ok: GREEN, warn: AMBER, fail: RED, info: 'rgba(var(--kp-ink),0.45)' }

const STYLE_ID = 'kino-thumbs-css'
export const ensureCss = () => {
	if (document.getElementById(STYLE_ID)) return
	const style = document.createElement('style')
	style.id = STYLE_ID
	style.textContent =
		'.kino-thumbs-btn:hover{background:rgba(var(--kp-ink),0.09)!important;color:var(--kp-strong)!important}' +
		'.kino-thumbs-card:hover{border-color:rgba(var(--kp-ink),0.3)!important}' +
		'.kino-thumbs-scroll::-webkit-scrollbar{width:8px;height:8px}.kino-thumbs-scroll::-webkit-scrollbar-thumb{background:rgba(var(--kp-ink),0.1);border-radius:4px}' +
		'.kino-thumbs-range{accent-color:var(--kp-ember)}' +
		'.kino-thumbs-link{color:var(--kp-link);text-decoration:none}.kino-thumbs-link:hover{text-decoration:underline}' +
		'@keyframes kino-thumbs-pulse{0%,100%{opacity:1}50%{opacity:.35}}.kino-thumbs-pulse{animation:kino-thumbs-pulse 1.4s ease-in-out infinite}'
	document.head.appendChild(style)
}

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
const primary = { ...button, height: 26, padding: '0 12px', background: TEXT, color: BG, border: 'none', fontWeight: 600, fontSize: 12, lineHeight: '26px' }
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
	width: '100%',
}
export const label = { fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: DIM, fontWeight: 600 }

export const Btn = (props: { label: string; title?: string; onClick: () => void; disabled?: boolean; style?: object; primary?: boolean }) =>
	h(
		'button',
		{
			className: props.primary ? undefined : 'kino-thumbs-btn',
			title: props.title,
			disabled: props.disabled,
			onClick: (event: { stopPropagation: () => void }) => {
				event.stopPropagation()
				props.onClick()
			},
			style: { ...(props.primary ? primary : button), ...(props.disabled ? { opacity: 0.4, cursor: 'default' } : {}), ...props.style },
		},
		props.label,
	)

// Options share the track evenly, so the control never shows an empty gray tail
export const Segmented = (props: { value: string; options: { value: string; label: string; title?: string }[]; onChange: (value: string) => void; compact?: boolean }) =>
	h(
		'div',
		{ style: { display: 'flex', padding: 2, gap: 2, borderRadius: 6, background: 'rgba(var(--kp-ink),0.05)', width: props.compact ? undefined : '100%', boxSizing: 'border-box', minWidth: 0 } },
		...props.options.map(option =>
			h(
				'button',
				{
					key: option.value,
					title: option.title ?? option.label,
					onClick: (event: any) => {
						event.preventDefault()
						props.onChange(option.value)
					},
					style: {
						flex: props.compact ? 'none' : '1 1 0',
						minWidth: 0,
						height: 22,
						padding: '0 8px',
						border: 'none',
						borderRadius: 4,
						fontSize: 11,
						fontFamily: UI_FONT,
						cursor: 'pointer',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
						background: props.value === option.value ? 'rgba(var(--kp-ink),0.14)' : 'transparent',
						color: props.value === option.value ? 'var(--kp-strong)' : DIM,
						fontWeight: props.value === option.value ? 600 : 400,
					},
				},
				option.label,
			),
		),
	)

// 3x3 grid for which point of the element sits on its x, y
export const AnchorPicker = (props: { value: string; onChange: (value: string) => void }) =>
	h(
		'div',
		{ style: { display: 'grid', gridTemplateColumns: 'repeat(3, 14px)', gridTemplateRows: 'repeat(3, 14px)', gap: 3, padding: 4, borderRadius: 6, background: 'rgba(var(--kp-ink),0.05)', width: 'max-content' } },
		...['tl', 'tc', 'tr', 'cl', 'c', 'cr', 'bl', 'bc', 'br'].map(a =>
			h('button', {
				key: a,
				title: `Anchor ${a}`,
				onClick: (event: any) => {
					event.preventDefault()
					props.onChange(a)
				},
				style: { width: 14, height: 14, padding: 0, border: 'none', borderRadius: 3, cursor: 'pointer', background: props.value === a ? EMBER : 'rgba(var(--kp-ink),0.16)' },
			}),
		),
	)

export const Toggle = (props: { value: boolean; onChange: (value: boolean) => void; label: string }) =>
	h(
		'label',
		{ style: { display: 'flex', alignItems: 'center', gap: 6, height: 26, fontSize: 12, color: TEXT, cursor: 'pointer', userSelect: 'none' } },
		h('input', { type: 'checkbox', checked: props.value, onChange: (e: any) => props.onChange(e.target.checked), style: { accentColor: EMBER, margin: 0 } }),
		props.label,
	)

// Swatches for the brand colors plus a free picker; empty means the element's default.
// A swatch's value is what gets stored (a brand token such as "accent"), css is how to paint it.
export type Swatch = { value: string; label: string; css?: string }
export const ColorIn = (props: { value?: string; onChange: (value: string | undefined) => void; swatches: Swatch[]; none?: boolean }) => {
	const current = props.swatches.find(s => s.value.toLowerCase() === (props.value ?? '').toLowerCase())
	const shown = current?.css ?? props.value ?? ''
	const mini = (text: string, title: string, on: boolean, value: string | undefined) =>
		h(
			'button',
			{
				key: text,
				title,
				onClick: (event: any) => {
					event.preventDefault()
					props.onChange(value)
				},
				style: { ...button, height: 20, lineHeight: '18px', padding: '0 6px', fontSize: 10, background: on ? 'rgba(var(--kp-ink),0.14)' : button.background },
			},
			text,
		)
	return h(
		'div',
		{ style: { display: 'flex', alignItems: 'center', gap: 4, minHeight: 26, flexWrap: 'wrap' } },
		mini('Auto', 'The default for this element', !props.value, undefined),
		props.none ? mini('None', 'No fill', props.value === 'transparent', 'transparent') : null,
		...props.swatches.map(s =>
			h('button', {
				key: s.value,
				title: s.label,
				onClick: (event: any) => {
					event.preventDefault()
					props.onChange(s.value)
				},
				style: { width: 18, height: 18, padding: 0, borderRadius: 4, cursor: 'pointer', background: s.css ?? s.value, border: current === s ? '2px solid var(--kp-strong)' : '1px solid rgba(var(--kp-ink),0.25)' },
			}),
		),
		h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(shown) ? shown : '#ffffff', onChange: (e: any) => props.onChange(e.target.value), title: 'Custom color', style: { width: 22, height: 20, padding: 0, border: 'none', background: 'none', cursor: 'pointer' } }),
	)
}

// Small rounded toggle, for quick prompts and platform choices
export const Chip = (props: { on?: boolean; label: string; title?: string; onClick: () => void }) =>
	h(
		'button',
		{
			className: 'kino-thumbs-btn',
			title: props.title,
			onClick: (event: any) => {
				event.preventDefault()
				props.onClick()
			},
			style: {
				height: 22,
				padding: '0 9px',
				borderRadius: 11,
				fontSize: 11,
				fontFamily: UI_FONT,
				cursor: 'pointer',
				flex: 'none',
				maxWidth: '100%',
				overflow: 'hidden',
				textOverflow: 'ellipsis',
				whiteSpace: 'nowrap',
				border: `1px solid ${props.on ? 'rgba(255,138,31,.6)' : 'rgba(var(--kp-ink),.12)'}`,
				background: props.on ? 'rgba(255,138,31,.14)' : 'rgba(var(--kp-ink),.03)',
				color: props.on ? TEXT : DIM,
			},
		},
		props.label,
	)

export const TextArea = (props: { value: string; onChange: (value: string) => void; placeholder?: string; rows?: number; autoFocus?: boolean }) =>
	h('textarea', {
		value: props.value,
		placeholder: props.placeholder,
		rows: props.rows ?? 4,
		autoFocus: props.autoFocus,
		onChange: (e: any) => props.onChange(e.target.value),
		spellCheck: true,
		style: { ...input, height: 'auto', padding: '6px 8px', lineHeight: 1.45, resize: 'vertical', fontFamily: UI_FONT },
	})

export const Section = (props: { title: string; right?: ReactNode; children: ReactNode }) =>
	h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
		h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, minHeight: 22 } }, h('span', { style: { ...label, color: 'rgba(var(--kp-ink),0.72)' } }, props.title), h('div', { style: { flex: 1 } }), props.right ?? null),
		props.children,
	)

export const Grid = (props: { children: ReactNode; cols?: number }) =>
	h('div', { style: { display: 'grid', gridTemplateColumns: `repeat(${props.cols ?? 2}, minmax(0, 1fr))`, gap: '8px 10px', alignItems: 'end' } }, props.children)

export const Field = (props: { label: string; hint?: string; children: ReactNode; wide?: boolean }) =>
	h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 4, gridColumn: props.wide ? '1 / -1' : undefined, minWidth: 0 } },
		h('span', { style: label }, props.label, props.hint ? h('span', { style: { textTransform: 'none', letterSpacing: 0, fontWeight: 400, marginLeft: 6 } }, props.hint) : null),
		props.children,
	)

export const TextIn = (props: { value: string; onChange: (value: string) => void; placeholder?: string }) =>
	h('input', { value: props.value, placeholder: props.placeholder, onChange: (e: any) => props.onChange(e.target.value), style: input, spellCheck: false })

export const Select = (props: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) =>
	h(
		'select',
		{ value: props.value, onChange: (e: any) => props.onChange(e.target.value), style: { ...input, paddingRight: 4 } },
		...props.options.map(o => h('option', { key: o.value, value: o.value }, o.label)),
	)

export const Range = (props: { value: number; min: number; max: number; step: number; onChange: (value: number) => void; fmt?: (value: number) => string }) =>
	h(
		'div',
		{ style: { display: 'flex', alignItems: 'center', gap: 8, height: 26 } },
		h('input', {
			type: 'range',
			className: 'kino-thumbs-range',
			min: props.min,
			max: props.max,
			step: props.step,
			value: props.value,
			onChange: (e: any) => props.onChange(Number(e.target.value)),
			style: { flex: 1, minWidth: 0 },
		}),
		h('span', { style: { width: 40, textAlign: 'right', fontFamily: MONO, fontSize: 11, color: DIM } }, props.fmt ? props.fmt(props.value) : String(props.value)),
	)

export const Dot = (props: { color: string }) => h('span', { style: { width: 7, height: 7, borderRadius: '50%', background: props.color, flex: 'none', display: 'inline-block' } })

// Guide tab: what each platform needs, with the source for every claim
export const GUIDE: { title: string; items: { text: string; url?: string; source?: string }[] }[] = [
	{
		title: 'YouTube (16:9)',
		items: [
			{ text: '1280x720 or larger, at least 640 wide. JPG, PNG or GIF; 2 MB from mobile, 50 MB from desktop. Exports here are 1920x1080, or 3840x2160 at 2x.', url: 'https://support.google.com/youtube/answer/72431', source: 'YouTube Help' },
			{ text: 'Test & Compare runs up to 3 thumbnails on desktop Studio and picks the one with the most watch time.', url: 'https://support.google.com/youtube/answer/13861714', source: 'YouTube Help' },
			{ text: 'Thumbnail text should add to the title, not repeat it.', url: 'https://www.overseeros.com/blog/youtube-thumbnail-text-vs-title-study', source: 'Overseeros study' },
			{ text: 'The duration badge covers the bottom right, and hover icons the top right. Keep both clear.' },
		],
	},
	{
		title: 'Shorts, TikTok, Reels (9:16)',
		items: [
			{ text: 'Shorts thumbnails can be picked in desktop Studio by YPP channels since July 2026. There is no A/B test for them.', url: 'https://ppc.land/youtube-ends-2-year-wait-for-shorts-thumbnails-but-blocks-a-b-testing/', source: 'PPC Land' },
			{ text: 'The Shorts safe area leaves the top bar, the caption and nav at the bottom, and the action column on the right clear.', url: 'https://support.google.com/google-ads/answer/13547298', source: 'Google Ads Help' },
			{ text: 'TikTok covers come from a frame of the video (the API takes a timestamp), so the hook belongs in frame 0.', url: 'https://developers.tiktok.com/doc/content-posting-api-reference-direct-post', source: 'TikTok for Developers' },
			{ text: 'TikTok safe zone: keep text out of the right action rail and the bottom caption area.', url: 'https://ads.tiktok.com/help/article/tiktok-auction-in-feed-ads', source: 'TikTok Ads Help' },
			{ text: 'Reels: 1080x1920, with the profile grid showing a centered 3:4 crop.', url: 'https://www.facebook.com/business/ads-guide/update/video/instagram-reels', source: 'Meta Ads Guide' },
		],
	},
	{
		title: 'Instagram and Reddit (4:5)',
		items: [
			{ text: 'Feed images up to 1080x1350 (4:5), JPEG, 8 MB.', url: 'https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media', source: 'Instagram Graph API' },
			{ text: 'The profile grid now crops to 3:4, so keep the edges free of text.' },
			{ text: 'Reddit: post the 4:5 or the 16:9 export as an image. Its 20 MB image limit is not verified here.' },
		],
	},
	{
		title: 'X (16:9)',
		items: [
			{ text: 'Images up to 5 MB. 1600x900 shows uncropped in the timeline.', url: 'https://docs.x.com/x-api/media/quickstart/best-practices', source: 'X API docs' },
			{ text: 'Post the image natively and put the link in a reply: link cards get a small preview and a label over the bottom.' },
		],
	},
	{
		title: 'What gets clicks',
		items: [
			{ text: 'Most top-performing thumbnails use 0 to 4 words.', url: 'https://vidiq.com/research/youtube-thumbnail-study/', source: 'vidIQ research' },
			{ text: 'Shocked faces appear on only about 1 in 10 covers across 100k channels: a clear subject beats a pulled face.', url: 'https://www.netinfluencer.com/youtube-thumbnail-study-of-100k-channels-finds-shocked-faces-on-just-1-in-10-covers/', source: 'NetInfluencer' },
			{ text: 'One hero element with at most two supporting ones, high contrast, and an outline, shadow or box behind text.' },
			{ text: 'Promise only what the video delivers early: every number, time and price on the image must be true.' },
			{ text: 'Avoid raw screenshots, decorative arrows and red circles. YouTube UI is red, white and black, so an accent outside those colors stands out.' },
		],
	},
]
