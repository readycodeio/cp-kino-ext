// Publish panel views, in the order of the path: platforms, Video, Copy, Go, then the dialogs
// (review, setup, confirm, prompt). State and bridge calls live in Panel.tsx.
import { createElement as h, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { MediaPicker, useGetMediaState } from 'kino/panel'
import { BridgeCard, type BridgeState } from '../bridge'
import { EXAMPLE_VIDEO_PATH, MACHINE, MOD_ENTER, SHOW_IN } from '../platform'
import type { KeyState, Paths } from './hooks'
import {
	LANGUAGES,
	PLATFORM_KEYS,
	SPEC,
	accountFor,
	baseName,
	blockers,
	chars,
	choicesFor,
	copyChecks,
	defaultAt,
	draftOf,
	finalText,
	fmtBytes,
	fmtTime,
	fmtWhen,
	fromOption,
	handle,
	hasWords,
	hashtagCount,
	isEdited,
	labels,
	limitsFor,
	localZone,
	measure,
	plural,
	scheduleText,
	sourceOption,
	tagList,
	tagsLength,
	threadPosts,
	whenText,
	withWhen,
	zonedToUtc,
	type Account,
	type Area,
	type Check,
	type CopyDoc,
	type Level,
	type Option,
	type Pending,
	type Plan,
	type PlatformKey,
	type PlatPlan,
	type Profile,
	type Rules,
	type Sent,
	type ThumbJob,
	type When,
} from './lib'
import { SHAPE_LABEL, VERTICAL_ONLY, coverByName, newestCover, probeText, ratioText, shapeOf, type Cover, type Delivery, type ProbeState, type Shape, type Source } from './media'
import { AMBER, Bar, Btn, Card, Counter, DIM, Dot, EMBER, Field, GREEN, Grid, LEVEL, LINE, LinkBtn, MONO, Modal, More, RED, Range, STRONG, Segmented, Select, TEXT, TextArea, TextIn, Toggle, copyText, ember, ink, input, label, small } from './ui'

export type Status = { level: Level | 'idle'; text: string; area?: Area }
export type Progress = { label: string; value: number; state: 'waiting' | 'rendering' | 'uploading' | 'done' | 'error' }
export type Cut = { key: string; label: string; for: PlatformKey[]; state: 'idle' | 'rendering' | 'done' | 'error'; progress: number; file?: string; size?: number; error?: string }
type SetPlat = (k: PlatformKey, fn: (p: PlatPlan) => PlatPlan) => void

const opts = (o: Record<string, string>) => Object.entries(o).map(([value, text]) => ({ value, label: text }))
const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, minWidth: 0 }
const dotOf = (level: Level | 'idle') => (level === 'idle' ? ink(0.25) : LEVEL[level])

// ---------- small pieces ----------
const Chip = ({ on, text, onClick, color, title, level }: { on: boolean; text: string; onClick: () => void; color?: string; title?: string; level?: Level | 'idle' }) =>
	h(
		'button',
		{
			type: 'button',
			className: 'kpub-btn',
			'aria-pressed': on,
			onClick,
			title,
			style: { height: 26, padding: '0 10px', borderRadius: 13, fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${on ? ember(60) : ink(0.14)}`, background: on ? ember(14) : ink(0.03), color: on ? STRONG : DIM },
		},
		color ? h(Dot, { color: on ? color : ink(0.25) }) : null,
		text,
		level && level !== 'ok' ? h(Dot, { color: dotOf(level) }) : null,
	)

const CheckList = ({ checks }: { checks: Check[] }) =>
	checks.length
		? h(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: 3 } },
				...checks.map((c, i) => h('div', { key: i, style: { display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 11, lineHeight: 1.4, color: c.level === 'info' ? DIM : TEXT } }, h(Dot, { color: LEVEL[c.level] }), h('span', null, c.text))),
			)
		: null

/** One line that needs the reader's eye: a problem with what to do about it. */
export const Notice = ({ level, children, actions }: { level: Level; children?: ReactNode; actions?: ReactNode }) =>
	h(
		'div',
		{ role: level === 'fail' ? 'alert' : 'status', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '7px 10px', borderRadius: 6, border: `1px solid ${LINE}`, borderLeft: `2px solid ${LEVEL[level]}`, background: ink(0.03), fontSize: 11, lineHeight: 1.45 } },
		h('span', { style: { flex: '1 1 180px', minWidth: 0, overflowWrap: 'anywhere' } }, children),
		actions ?? null,
	)

const Quote = ({ text, max }: { text: string; max?: number }) => h('div', { className: 'kpub-scroll', style: { fontSize: 12, lineHeight: 1.5, color: TEXT, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: max ?? 200, overflow: 'auto', padding: '6px 8px', borderRadius: 5, background: 'var(--kp-well)', border: `1px solid ${ink(0.08)}`, userSelect: 'text' } }, text)

const MediaName = ({ id }: { id: string }) => {
	const { mediaItem } = useGetMediaState(id) as any
	const name = mediaItem?.title || mediaItem?.filename || mediaItem?.name || `${id.slice(0, 8)}...`
	return h('span', { title: String(name), style: ellipsis }, String(name))
}

// ---------- platforms and their status ----------
/**
 * Which platforms the video goes to, and one line per platform saying what is still missing.
 * A click on a line jumps to where that is fixed.
 */
export const PlatformsBar = (props: { plan: Plan; accounts: Account[]; canPost: boolean; status: Record<PlatformKey, Status>; onToggle: (k: PlatformKey) => void; onJump: (k: PlatformKey, area?: Area) => void }) => {
	const on = PLATFORM_KEYS.filter(k => props.plan.platforms[k].on)
	return h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
		h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } }, ...PLATFORM_KEYS.map(k => h(Chip, { key: k, on: props.plan.platforms[k].on, text: SPEC[k].label, color: SPEC[k].color, title: props.plan.platforms[k].on ? `Leave ${SPEC[k].label} out` : `Add ${SPEC[k].label}`, onClick: () => props.onToggle(k) }))),
		on.length
			? h(
					'div',
					{ style: { display: 'flex', flexDirection: 'column' } },
					...on.map(k => {
						const s = props.status[k]
						const account = props.canPost ? accountFor(k, props.plan.platforms[k], props.accounts).account : null
						return h(
							'button',
							{ key: k, type: 'button', className: 'kpub-row', title: `${SPEC[k].label}: ${s.text}`, onClick: () => props.onJump(k, s.area), style: { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', border: 'none', borderRadius: 5, background: 'transparent', color: TEXT, fontFamily: 'inherit', fontSize: 12, textAlign: 'left', width: '100%', cursor: 'pointer', minWidth: 0 } },
							h(Dot, { color: SPEC[k].color }),
							h('span', { style: { fontWeight: 600, flex: 'none', width: 68 } }, SPEC[k].label),
							account ? h('span', { style: { ...ellipsis, fontSize: 11, color: DIM, flex: '0 1 auto' } }, handle(account)) : null,
							h('span', { style: { ...ellipsis, flex: '1 1 0', textAlign: 'right', fontSize: 11, color: s.level === 'ok' ? GREEN : s.level === 'fail' ? TEXT : DIM } }, s.text),
							h(Dot, { color: dotOf(s.level) }),
						)
					}),
				)
			: h('div', { style: small }, 'Choose the platforms this video goes to.'),
	)
}

// ---------- 1 Video ----------
// Library video picker in a dialog; mounted only while open
const PickerSheet = ({ title, value, onPick, onClose }: { title: string; value: string; onPick: (id: string) => void; onClose: () => void }) =>
	h(Modal, { title, onClose, width: 640 }, h('div', { className: 'kpub-scroll', style: { height: 'min(520px, 66vh)', overflow: 'auto', margin: -14 } }, h(MediaPicker as any, { kind: 'video', value: value ? `kino:${value}` : null, onAudition: () => {}, onPick: (id: string) => onPick(String(id).replace(/^kino:/, '')), onConfirm: (id: string) => onPick(String(id).replace(/^kino:/, '')) })))

const VideoSlot = (props: { title: string; empty: string; id: string; path: string; probe?: ProbeState; primary?: boolean; onId: (id: string) => void; onPath: (path: string) => void }) => {
	const [open, setOpen] = useState(false)
	const [typing, setTyping] = useState(false)
	const [draft, setDraft] = useState(props.path)
	useEffect(() => setDraft(props.path), [props.path])
	// Windows "Copy as path" wraps the path in quotes
	const clean = (text: string) => text.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
	const apply = () => {
		const path = clean(draft)
		if (path) props.onPath(path)
		setTyping(false)
	}
	const has = !!(props.id || props.path)
	const bad = !!props.probe && 'error' in props.probe
	return h(
		Field,
		{ label: props.title },
		h(
			'div',
			{ style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' } },
			h('div', { style: { ...input, display: 'flex', alignItems: 'center', color: has ? TEXT : DIM, flex: '1 1 140px', width: 'auto' } }, props.id ? h(MediaName, { id: props.id }) : props.path ? h('span', { title: props.path, style: ellipsis }, baseName(props.path)) : 'None'),
			h(Btn, { label: has ? 'Change' : 'Choose from library', primary: props.primary && !has, onClick: () => setOpen(true) }),
			h(Btn, { label: 'File path', title: `Use an exported file on ${MACHINE}`, onClick: () => setTyping(!typing) }),
			has ? h(Btn, { label: 'Clear', onClick: () => props.onId('') }) : null,
		),
		typing
			? h('div', { style: { display: 'flex', gap: 6 } }, h(TextIn, { value: draft, onChange: setDraft, placeholder: EXAMPLE_VIDEO_PATH, autoFocus: true, label: `${props.title} file path`, onEnter: apply }), h(Btn, { label: 'Use this file', onClick: apply, disabled: !clean(draft) }))
			: null,
		h('div', { style: { ...small, color: bad ? RED : DIM, overflowWrap: 'anywhere' } }, has ? probeText(props.probe) || (props.id ? 'From the Kino library' : props.path) : props.empty),
		open
			? h(PickerSheet, {
					title: `Choose the ${props.title.toLowerCase()}`,
					value: props.id,
					onPick: id => {
						props.onId(id)
						setOpen(false)
					},
					onClose: () => setOpen(false),
				})
			: null,
	)
}

// Only covers of the right shape are offered; a wrong pick stays visible (dimmed, red) until it is replaced
const CoverRow = (props: { title: string; shape: Shape; value: string; covers: Cover[]; onPick: (name: string) => void }) => {
	const vertical = props.shape === '916'
	const name = SHAPE_LABEL[props.shape]
	const list = props.covers.filter(c => shapeOf(c.w, c.h) === props.shape).sort((a, b) => b.mtime - a.mtime)
	const picked = props.value && props.value !== 'none' ? coverByName(props.covers, props.value) : undefined
	const wrong = picked && shapeOf(picked.w, picked.h) !== props.shape ? picked : undefined
	const auto = newestCover(props.covers, props.shape)
	const hint = wrong
		? `the chosen one is ${wrong.w}x${wrong.h} (${ratioText(wrong.w, wrong.h)}), not ${name}`
		: !list.length
			? `no ${name} export yet`
			: !props.value
				? `newest: ${auto?.title || auto?.name}`
				: props.value === 'none'
					? 'platforms pick a frame'
					: picked
						? picked.title || picked.name
						: undefined
	const height = vertical ? 82 : 54
	const tile = (text: string, value: string, title: string) =>
		h('button', { key: value || 'auto', type: 'button', title, 'aria-pressed': props.value === value, onClick: () => props.onPick(value), style: { flex: 'none', width: vertical ? 46 : 64, height, borderRadius: 5, border: `1px solid ${props.value === value ? ember(80) : ink(0.14)}`, background: props.value === value ? ember(14) : 'var(--kp-well)', color: props.value === value ? STRONG : DIM, fontSize: 10, fontFamily: 'inherit', cursor: 'pointer' } }, text)
	return h(
		Field,
		{ label: props.title, wide: true, hint },
		h(
			'div',
			{ style: { display: 'flex', gap: 6, overflowX: 'auto', padding: 2 }, className: 'kpub-scroll' },
			tile('Newest', '', `Use the newest ${name} export from the Thumbnails panel`),
			tile('None', 'none', 'No cover: each platform picks a frame'),
			...[...(wrong ? [wrong] : []), ...list].map(c =>
				h(
					'button',
					{ key: c.file, type: 'button', title: `${c.title ?? c.name} (${c.w}x${c.h})`, 'aria-pressed': picked === c, onClick: () => props.onPick(c.name), style: { flex: 'none', height, padding: 0, border: 'none', borderRadius: 5, cursor: 'pointer', background: 'var(--kp-well)', opacity: c === wrong ? 0.45 : 1, outline: picked === c ? `2px solid ${c === wrong ? RED : EMBER}` : `1px solid ${ink(0.14)}`, outlineOffset: -1, overflow: 'hidden' } },
					h('img', { src: c.url, alt: c.title ?? c.name, style: { height: '100%', aspectRatio: `${c.w} / ${c.h}`, objectFit: 'cover', display: 'block' } }),
				),
			),
		),
	)
}

type VideoProps = {
	plan: Plan
	on: PlatformKey[]
	paths: Paths
	probes: Record<string, ProbeState>
	covers: Cover[]
	coversLoading: boolean
	deliveries: Record<PlatformKey, Delivery>
	cuts: Cut[]
	bridge: BridgeState
	busy: boolean
	primary: boolean
	setMedia: (patch: Partial<Plan['media']>) => void
	setPaths: (patch: Partial<Paths>) => void
	setPlat: SetPlat
	onRefreshCovers: () => void
	onRenderCuts: () => void
	onReveal: (file: string) => void
	onCopied: (what: string) => void
	onSetup: () => void
}

export const VideoSection = (props: VideoProps) => {
	const { plan, paths, on } = props
	const m = plan.media
	const bridgeOk = props.bridge === 'ok'
	const todo = props.cuts.filter(c => c.state !== 'done')
	const rendering = props.cuts.some(c => c.state === 'rendering')
	return h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 12 } },
		h(
			Grid,
			{ min: 240, top: true },
			h(VideoSlot, {
				title: 'Main video',
				empty: 'The video to publish, usually 16:9. Take it from the Kino library or use an exported file.',
				id: m.main,
				path: m.main ? '' : paths.main,
				probe: props.probes[m.main ? `m:${m.main}` : `p:${paths.main}`],
				primary: props.primary,
				onId: id => {
					props.setMedia({ main: id })
					props.setPaths({ main: '' })
				},
				onPath: path => {
					props.setMedia({ main: '' })
					props.setPaths({ main: path })
				},
			}),
			h(VideoSlot, {
				title: 'Vertical video',
				empty: 'Optional 9:16 cut for Reels, TikTok and Shorts. Without it the panel renders one from the main video.',
				id: m.vertical,
				path: m.vertical ? '' : paths.vertical,
				probe: props.probes[m.vertical ? `m:${m.vertical}` : `p:${paths.vertical}`],
				onId: id => {
					props.setMedia({ vertical: id })
					props.setPaths({ vertical: '' })
				},
				onPath: path => {
					props.setMedia({ vertical: '' })
					props.setPaths({ vertical: path })
				},
			}),
		),
		bridgeOk
			? props.covers.length
				? h(
						'div',
						{ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
						h(CoverRow, { title: 'Cover 16:9', shape: '169', value: m.cover169, covers: props.covers, onPick: f => props.setMedia({ cover169: f }) }),
						h(CoverRow, { title: 'Cover 9:16', shape: '916', value: m.cover916, covers: props.covers, onPick: f => props.setMedia({ cover916: f }) }),
						h('div', null, h(LinkBtn, { label: props.coversLoading ? 'Loading covers...' : 'Refresh covers', onClick: props.onRefreshCovers })),
					)
				: h('div', { style: small }, 'No covers yet, so each platform picks a frame. Export one in the Thumbnails panel and it shows up here. ', h(LinkBtn, { label: props.coversLoading ? 'Loading...' : 'Refresh', onClick: props.onRefreshCovers }))
			: h('div', { style: small }, 'Covers, video checks and platform cuts need the bridge. Writing copy does not. ', h(LinkBtn, { label: 'Set up the bridge', onClick: props.onSetup })),
		on.length && (m.main || m.vertical || paths.main || paths.vertical)
			? h(
					'div',
					{ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
					h('span', { style: label }, 'What each platform gets'),
					...on.map(k => {
						const d = props.deliveries[k]
						const p = plan.platforms[k]
						const fixed = VERTICAL_ONLY.includes(k) || (k === 'facebook' && p.opts.contentType === 'reel')
						const problems = d.checks.filter(c => c.level === 'fail' || c.level === 'warn')
						return h(
							'div',
							{ key: k, style: { display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap', fontSize: 11, lineHeight: 1.45 } },
							h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, width: 86, flex: 'none', minHeight: 24, fontSize: 12 } }, h(Dot, { color: SPEC[k].color }), SPEC[k].label),
							h('div', { style: { width: 104, flex: 'none' } }, fixed ? h('span', { title: `${SPEC[k].label} shows vertical video only`, style: { display: 'inline-flex', alignItems: 'center', height: 28, color: DIM } }, '9:16 only') : h(Segmented, { label: `${SPEC[k].label} shape`, value: p.video, options: [{ value: 'main', label: '16:9', title: 'Send the main video' }, { value: 'vertical', label: '9:16', title: 'Send the vertical cut' }], onChange: v => props.setPlat(k, x => ({ ...x, video: v as 'main' | 'vertical' })) })),
							h(
								'div',
								{ style: { flex: '1 1 180px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 5 } },
								h('span', { style: { color: d.video ? TEXT : DIM } }, `${d.what.charAt(0).toUpperCase()}${d.what.slice(1)}${d.coverLine ? `, ${d.coverLine}` : ''}`),
								h(CheckList, { checks: problems }),
							),
						)
					}),
				)
			: null,
		props.cuts.length
			? h(
					Card,
					null,
					h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, h('span', { style: { ...label, flex: 1 } }, 'Platform cuts'), h(Btn, { label: rendering ? 'Rendering...' : todo.length ? `Render ${plural(todo.length, 'cut')}` : 'All rendered', onClick: props.onRenderCuts, disabled: !bridgeOk || props.busy || !todo.length })),
					...props.cuts.map(c =>
						h(
							'div',
							{ key: c.key, style: { display: 'flex', flexDirection: 'column', gap: 3 } },
							h(
								'div',
								{ style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11 } },
								h('span', { style: { flex: '1 1 160px', minWidth: 0 } }, `${c.label.charAt(0).toUpperCase()}${c.label.slice(1)}, for ${labels(c.for)}`),
								c.state === 'done' && c.file
									? h(
											'span',
											{ style: { display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' } },
											h('span', { style: { color: GREEN } }, `Rendered${c.size ? `, ${fmtBytes(c.size)}` : ''}`),
											h(Btn, { label: SHOW_IN, onClick: () => props.onReveal(c.file!) }),
											h(Btn, { label: 'Copy path', onClick: () => copyText(c.file!).then(ok => props.onCopied(ok ? 'Path copied.' : 'Could not copy the path.')) }),
										)
									: h('span', { style: { color: c.state === 'error' ? RED : DIM, overflowWrap: 'anywhere' } }, c.state === 'rendering' ? `${Math.round(c.progress * 100)}%` : c.state === 'error' ? c.error : 'Not rendered yet'),
							),
							c.state === 'rendering' ? h(Bar, { value: c.progress }) : null,
						),
					),
					h('div', { style: small }, `Cuts are rendered on ${MACHINE} with ffmpeg and reused. Posting renders any that are missing.`),
				)
			: null,
	)
}

// ---------- 2 Copy ----------
const OptionRow = ({ o, k, limit, urlChars, onPick }: { o: Option; k: PlatformKey; limit: number; urlChars: number; onPick: () => void }) =>
	h(
		'button',
		{ type: 'button', className: 'kpub-card', onClick: onPick, title: 'Use this option and edit it', style: { textAlign: 'left', cursor: 'pointer', padding: '8px 10px', borderRadius: 7, border: `1px solid ${ink(0.12)}`, background: ink(0.02), color: TEXT, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, width: '100%', fontFamily: 'inherit' } },
		h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } }, h('span', { style: { ...label, flex: 1 } }, o.angle), h(Counter, { n: measure(k, finalText({ ...fromOption(o), thread: [] }), urlChars), max: limit })),
		o.title ? h('div', { style: { fontWeight: 600, fontSize: 12, lineHeight: 1.35, overflowWrap: 'anywhere' } }, o.title) : null,
		h('div', { style: { fontSize: 12, lineHeight: 1.45, color: ink(0.8), whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, o.text),
		o.hashtags.length ? h('div', { style: { fontSize: 11, color: 'var(--kp-link)', overflowWrap: 'anywhere' } }, o.hashtags.join(' ')) : null,
		o.why ? h('div', { style: { fontSize: 11, color: DIM, lineHeight: 1.4 } }, o.why) : null,
	)

/** The words of one platform's post, editable in place, with the counts each platform uses. */
const Editor = (props: { k: PlatformKey; p: PlatPlan; rules: Rules | null; heading: string; source?: Option; set: (patch: Partial<PlatPlan>) => void; onReset?: () => void; onUndo?: () => void; onCopied: (what: string) => void }) => {
	const { k, p, set } = props
	const s = SPEC[k]
	const lim = limitsFor(k, props.rules, !!p.opts.premium)
	const n = measure(k, finalText(p), lim.urlChars)
	const usesTitle = k === 'youtube' || (k === 'facebook' && p.opts.contentType === 'reel')
	const [more, setMore] = useState(false)
	const extras = !!(p.firstComment.trim() || p.thread.length || p.tags.trim())
	const edited = props.source ? isEdited(p, props.source) : false
	const copyAll = () => copyText([usesTitle ? p.title.trim() : '', finalText(p), ...threadPosts(k, p)].filter(Boolean).join('\n\n')).then(ok => props.onCopied(ok ? `${s.label} copy is on the clipboard.` : 'Could not reach the clipboard.'))
	return h(
		Card,
		{ accent: EMBER, style: { gap: 10 } },
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
			h('span', { style: { ...label, color: STRONG, flex: '1 1 auto' } }, props.heading, edited ? h('span', { style: { textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: DIM, marginLeft: 6 } }, 'edited') : null),
			edited && props.onReset ? h(LinkBtn, { label: 'Reset to the option', title: 'Drop your edits and go back to the text the agent wrote', onClick: props.onReset }) : null,
			props.onUndo ? h(LinkBtn, { label: 'Bring back previous text', title: 'Swap in the text this editor held before the last switch', onClick: props.onUndo }) : null,
			h(Btn, { label: 'Copy text', title: 'Copy the post as it will appear, to paste it somewhere yourself', onClick: copyAll, disabled: !hasWords(p) }),
		),
		usesTitle ? h(Field, { label: k === 'facebook' ? 'Reel title' : 'Title', hint: h(Counter, { n: chars(p.title.trim()), max: lim.title, warnAt: k === 'youtube' ? 70 : undefined }) }, h(TextIn, { value: p.title, onChange: v => set({ title: v }), label: 'Title' })) : null,
		h(
			Field,
			{ label: k === 'youtube' ? 'Description' : s.thread && p.thread.length ? 'First post' : 'Caption', hint: h('span', null, h(Counter, { n, max: lim.text, warnAt: lim.text * 0.9 }), lim.foldChars ? `  first ${lim.foldChars} show before "more"` : '') },
			h(TextArea, { value: p.text, onChange: v => set({ text: v }), rows: k === 'youtube' ? 9 : 5, label: 'Post text', invalid: n > lim.text, placeholder: 'Write the post here, or choose an option above.' }),
		),
		h(
			Field,
			{ label: 'Hashtags', hint: h('span', null, h(Counter, { n: hashtagCount(p), max: lim.hashtagsMax }), lim.recommended ? `  ${lim.recommended[0]} to ${lim.recommended[1]} works best,` : '', '  added after the text and counted with it') },
			h(TextIn, { value: p.hashtags, onChange: v => set({ hashtags: v }), placeholder: '#firsttag #secondtag', label: 'Hashtags' }),
		),
		k === 'twitter' ? h(Toggle, { value: !!p.opts.premium, onChange: v => set({ opts: { ...p.opts, premium: v } }), label: 'This is an X Premium account (posts up to 25,000 characters)' }) : null,
		s.firstComment || s.thread || k === 'youtube'
			? h(
					More,
					{ open: more || extras, onToggle: () => setMore(!more), label: [k === 'youtube' ? 'tags' : '', s.firstComment ? 'first comment' : '', s.thread ? 'thread' : ''].filter(Boolean).join(', ').replace(/^./, c => c.toUpperCase()) },
					k === 'youtube' ? h(Field, { label: 'Tags', hint: h('span', null, h(Counter, { n: tagsLength(tagList(p.tags)), max: lim.tagsTotal }), '  comma separated') }, h(TextIn, { value: p.tags, onChange: v => set({ tags: v }), label: 'YouTube tags' })) : null,
					s.firstComment ? h(Field, { label: 'First comment', hint: h('span', null, h(Counter, { n: p.firstComment.trim().length, max: s.firstComment }), '  posted right after publishing') }, h(TextArea, { value: p.firstComment, onChange: v => set({ firstComment: v }), rows: 2, label: 'First comment' })) : null,
					s.thread
						? h(
								Field,
								{ label: 'Thread', hint: 'follow-up posts, in order' },
								...p.thread.map((t, i) =>
									h(
										'div',
										{ key: i, style: { display: 'flex', gap: 6, alignItems: 'flex-start' } },
										h('div', { style: { flex: 1, minWidth: 0 } }, h(TextArea, { value: t, onChange: v => set({ thread: p.thread.map((x, j) => (j === i ? v : x)) }), rows: 2, label: `Thread post ${i + 2}`, invalid: measure(k, t.trim(), lim.urlChars) > lim.text })),
										h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' } }, h(Counter, { n: measure(k, t.trim(), lim.urlChars), max: lim.text }), h(Btn, { label: 'Remove', onClick: () => set({ thread: p.thread.filter((_, j) => j !== i) }) })),
									),
								),
								h('div', null, h(Btn, { label: 'Add a post', onClick: () => set({ thread: [...p.thread, ''] }) })),
							)
						: null,
				)
			: null,
		h(CheckList, { checks: hasWords(p) ? copyChecks(k, p, props.rules) : [] }),
	)
}

type CopyProps = {
	plan: Plan
	rules: Rules | null
	copy: CopyDoc | null
	copyError: string
	on: PlatformKey[]
	active: PlatformKey | null
	setActive: (k: PlatformKey) => void
	busy: boolean
	canPrompt: boolean
	primary: boolean
	waiting: { platforms: PlatformKey[]; minutes: number } | null
	setPlat: SetPlat
	setParams: (fn: (p: Plan['params']) => Plan['params']) => void
	onGenerate: (platforms: PlatformKey[], fresh?: boolean) => void
	onOpenChat: () => void
	onDismissPending: () => void
	onCopied: (what: string) => void
}

const PlatformCopy = (props: { k: PlatformKey } & CopyProps) => {
	const { k, plan, rules } = props
	const p = plan.platforms[k]
	const lim = limitsFor(k, rules, !!p.opts.premium)
	const options = props.copy?.platforms[k]?.options ?? []
	const source = sourceOption(p, options)
	const drafted = hasWords(p)
	const set = (patch: Partial<PlatPlan>) => props.setPlat(k, x => ({ ...x, ...patch }))
	// Words that exist nowhere else are kept for "Bring back previous text" before anything replaces them
	const pick = (o: Option) =>
		props.setPlat(k, x => {
			const from = sourceOption(x, options)
			const mine = hasWords(x) && (!from || isEdited(x, from))
			return { ...x, ...fromOption(o, x.title), undo: mine ? draftOf(x) : x.undo }
		})
	const reset = source ? () => props.setPlat(k, x => ({ ...x, ...fromOption(source, x.title), undo: draftOf(x) })) : undefined
	const undo = p.undo ? () => props.setPlat(k, x => (x.undo ? { ...x, ...x.undo, undo: hasWords(x) ? draftOf(x) : undefined } : x)) : undefined
	const editor = (heading: string) => h(Editor, { key: 'editor', k, p, rules, heading, source, set, onReset: reset, onUndo: undo, onCopied: props.onCopied })
	const ask = () => props.onGenerate([k], options.length > 0)
	return h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
		h(
			'div',
			{ style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' } },
			h('div', { style: { flex: '1 1 200px', minWidth: 0 } }, h(TextIn, { value: p.note, onChange: v => set({ note: v }), placeholder: `Only for ${SPEC[k].label}, optional: "shorter", "lead with the result"`, label: `Note for ${SPEC[k].label}`, onEnter: ask })),
			h(Btn, { label: options.length ? `New options for ${SPEC[k].label}` : `Write ${SPEC[k].label} only`, title: 'Ask the agent for 3 options for this platform, using the brief above and this note', onClick: ask, disabled: props.busy }),
		),
		!options.length && !drafted ? h('div', { style: small }, `No copy for ${SPEC[k].label} yet. Press Write copy above, or type your own here.`) : null,
		// the draft sits where its option was; a draft without one (typed by hand, or its option is gone) leads the list
		!source ? editor(drafted && options.length ? 'Your text' : 'Text') : null,
		...options.map(o => (o === source ? editor(o.angle) : h(OptionRow, { key: o.id, o, k, limit: lim.text, urlChars: lim.urlChars, onPick: () => pick(o) }))),
		props.copy?.platforms[k]?.notes ? h('div', { style: { ...small, overflowWrap: 'anywhere' } }, `Note from the agent: ${props.copy.platforms[k]!.notes}`) : null,
	)
}

export const CopySection = (props: CopyProps) => {
	const { plan, on, rules } = props
	const P = plan.params
	const setP = (patch: Partial<Plan['params']>) => props.setParams(x => ({ ...x, ...patch }))
	const [advanced, setAdvanced] = useState(false)
	const active = props.active && on.includes(props.active) ? props.active : (on[0] ?? null)
	const written = on.filter(k => hasWords(plan.platforms[k]))
	const missing = on.filter(k => !hasWords(plan.platforms[k]) && !props.copy?.platforms[k]?.options.length)
	const targets = missing.length && missing.length < on.length ? missing : on
	const generate = () => on.length && !props.busy && props.onGenerate(targets, targets.every(k => !!props.copy?.platforms[k]?.options.length))
	const wantsLink = P.cta === 'link' || P.cta === 'community' || !!P.link.trim()
	const levelOf = (k: PlatformKey): Level | 'idle' => {
		const p = plan.platforms[k]
		if (!hasWords(p)) return props.copy?.platforms[k]?.options.length ? 'info' : 'idle'
		const checks = copyChecks(k, p, rules)
		return blockers(checks).length ? 'fail' : checks.some(c => c.level === 'warn') ? 'warn' : 'ok'
	}
	return h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 12 } },
		h(
			Field,
			{ label: 'Brief', hint: 'for every platform. The agent also reads the video and your knowledge folder.' },
			h(TextArea, { value: P.notes, onChange: v => setP({ notes: v }), rows: 2, label: 'Brief', placeholder: 'What should these posts say? Anything to stress or leave out. Optional.', onModEnter: generate }),
		),
		h(
			Grid,
			null,
			h(Field, { label: 'Tone' }, h(Segmented, { label: 'Tone', value: P.tone, options: choicesFor('tone', rules, P.tone), onChange: v => setP({ tone: v }) })),
			h(Field, { label: 'Length' }, h(Segmented, { label: 'Length', value: P.length, options: choicesFor('length', rules, P.length), onChange: v => setP({ length: v }) })),
			h(Field, { label: 'Call to action' }, h(Select, { label: 'Call to action', value: P.cta, options: choicesFor('cta', rules, P.cta), onChange: v => setP({ cta: v }) })),
			wantsLink ? h(Field, { label: 'Link', hint: 'for the call to action' }, h(TextIn, { value: P.link, onChange: v => setP({ link: v }), placeholder: 'https://', label: 'Link' })) : null,
		),
		h(
			More,
			{ open: advanced, onToggle: () => setAdvanced(!advanced), label: 'Advanced: language, emoji, hashtags, keywords, audience' },
			h(
				Grid,
				null,
				h(Field, { label: 'Language' }, h(Select, { label: 'Language', value: P.language, options: LANGUAGES.some(l => l.value === P.language) ? LANGUAGES : [...LANGUAGES, { value: P.language, label: P.language }], onChange: v => setP({ language: v }) })),
				h(Field, { label: 'Emoji' }, h(Segmented, { label: 'Emoji', value: P.emoji, options: choicesFor('emoji', rules, P.emoji), onChange: v => setP({ emoji: v }) })),
				h(Field, { label: 'Hashtags per post' }, h(Range, { label: 'Hashtags per post', value: P.hashtags, min: 0, max: 10, step: 1, onChange: v => setP({ hashtags: v }) })),
				h(Field, { label: 'Humanize', hint: '0 neutral, 3 very personal' }, h(Range, { label: 'Humanize', value: P.humanize, min: 0, max: 3, step: 1, onChange: v => setP({ humanize: v }) })),
				h(Field, { label: 'Search keywords', hint: 'comma separated', wide: true }, h(TextIn, { value: P.keywords, onChange: v => setP({ keywords: v }), placeholder: 'the words people type to find this video', label: 'Search keywords' })),
				h(Field, { label: 'Audience', wide: true }, h(TextIn, { value: P.audience, onChange: v => setP({ audience: v }), placeholder: 'who this is for, e.g. beginners, people comparing options', label: 'Audience' })),
			),
			h('div', { style: small }, 'These choices are remembered for your next project. Voice, facts and links come from /publish/knowledge/README.md in this project.'),
		),
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
			h(Btn, {
				label: props.busy ? 'Working...' : !on.length ? 'Write copy' : `${written.length === on.length ? 'Write new copy' : 'Write copy'} for ${targets.length === on.length ? plural(on.length, 'platform') : labels(targets)}`,
				title: `${props.canPrompt ? 'Sends the request to the agent in this project.' : 'Copies the request and opens a chat to paste it into.'} ${MOD_ENTER} in the brief does the same.`,
				primary: props.primary,
				disabled: props.busy || !on.length,
				onClick: generate,
			}),
			plan.chatId ? h(Btn, { label: 'Open the chat', title: 'The chat this panel sends copy requests to', onClick: props.onOpenChat }) : null,
			h('span', { style: { ...small, flex: '1 1 160px' } }, props.canPrompt ? 'The agent writes 3 options per platform. Nothing is posted.' : 'Without the bridge the request is copied for you to paste into a chat.'),
		),
		props.waiting
			? h(
					Notice,
					{ level: props.waiting.minutes >= 5 ? 'warn' : 'info', actions: h('span', { style: { display: 'inline-flex', gap: 6 } }, plan.chatId ? h(Btn, { label: 'Open the chat', onClick: props.onOpenChat }) : null, h(Btn, { label: 'Stop waiting', onClick: props.onDismissPending })) },
					props.waiting.minutes >= 5 ? `No copy for ${labels(props.waiting.platforms)} after ${props.waiting.minutes} minutes. Open the chat to see what the agent is doing.` : `Waiting for the agent to write ${labels(props.waiting.platforms)}. Options show up here by themselves.`,
				)
			: null,
		props.copyError ? h(Notice, { level: 'fail' }, props.copyError) : null,
		on.length > 1 ? h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } }, ...on.map(k => h(Chip, { key: k, on: k === active, text: SPEC[k].label, color: SPEC[k].color, level: levelOf(k), onClick: () => props.setActive(k) }))) : null,
		active ? h(PlatformCopy, { key: active, ...props, k: active }) : h('div', { style: small }, 'Turn on a platform at the top to write copy for it.'),
	)
}

// ---------- 3 Go ----------
const ZONES = (() => {
	try {
		return (Intl as any).supportedValuesOf('timeZone') as string[]
	} catch {
		return ['UTC', 'America/Los_Angeles', 'America/Chicago', 'America/New_York', 'America/Sao_Paulo', 'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney']
	}
})()
// Categories from the YouTube Data API that an upload can use
const YT_CATEGORIES = { '22': 'People & Blogs', '1': 'Film & Animation', '2': 'Autos & Vehicles', '10': 'Music', '15': 'Pets & Animals', '17': 'Sports', '19': 'Travel & Events', '20': 'Gaming', '23': 'Comedy', '24': 'Entertainment', '25': 'News & Politics', '26': 'Howto & Style', '27': 'Education', '28': 'Science & Technology', '29': 'Nonprofits & Activism' }

const TimeInput = ({ value, onChange, name }: { value: string; onChange: (value: string) => void; name: string }) => h('input', { type: 'datetime-local', 'aria-label': name, value, onChange: (e: any) => onChange(e.target.value), style: { ...input, colorScheme: 'var(--kp-scheme)' } })

type GoProps = {
	plan: Plan
	on: PlatformKey[]
	accounts: Account[]
	canPost: boolean
	whyNot: string // what posting is waiting for, '' when it is set up
	status: Record<PlatformKey, Status>
	checks: Record<PlatformKey, Check[]>
	playlists: { id: string; title: string }[]
	tiktokInfo: any
	busy: boolean
	primary: boolean
	sendable: PlatformKey[]
	open: PlatformKey | null
	setOpen: (k: PlatformKey | null) => void
	thumb?: ThumbJob
	setPlat: SetPlat
	update: (fn: (p: Plan) => Plan) => void
	onReview: () => void
	onSetup: () => void
	onJump: (k: PlatformKey, area?: Area) => void
	onRetry: (k: PlatformKey) => void
	onClear: (keys: PlatformKey[]) => void
	onRefreshSent: () => void
	onOutbox: (item: Pending, what: 'check' | 'resend' | 'discard') => void
	activity: { open: boolean; posts: any[]; loading: boolean }
	onActivity: (what: 'toggle' | 'refresh') => void
	onPostRetry: (id: string) => void
	onPostDelete: (id: string) => void
	onSetThumb: (postId: string, accountId?: string) => void
}

const sentText = (s: Sent, tz: string) =>
	s.status === 'published'
		? `Published ${fmtWhen(s.at)}`
		: s.status === 'publishing'
			? 'Publishing...'
			: s.status === 'scheduled'
				? `Scheduled for ${scheduleText(s.when ?? '', tz)}`
				: s.status === 'draft'
					? 'Saved as a draft in Zernio'
					: s.status === 'failed'
						? `Failed: ${s.error ?? 'no reason given'}`
						: `Not sent: ${s.error ?? 'refused'}`
const sentLevel = (s: Sent): Level => (s.status === 'failed' || s.status === 'rejected' ? 'fail' : s.status === 'publishing' ? 'warn' : s.status === 'draft' ? 'info' : 'ok')
export const sentStatus = (s: Sent, tz: string): Status => ({ level: sentLevel(s), text: sentText(s, tz), area: 'time' })

const PlatformOptions = ({ k, p, set, props }: { k: PlatformKey; p: PlatPlan; set: (o: Record<string, any>) => void; props: GoProps }) => {
	const o = p.opts
	switch (k) {
		case 'youtube':
			return h(
				Grid,
				null,
				h(Field, { label: 'Visibility' }, h(Segmented, { label: 'Visibility', value: o.visibility, options: opts({ public: 'Public', unlisted: 'Unlisted', private: 'Private' }), onChange: v => set({ visibility: v }) })),
				h(Field, { label: 'Playlist' }, h(Select, { label: 'Playlist', value: o.playlistId || '', options: [{ value: '', label: 'None' }, ...props.playlists.map(x => ({ value: x.id, label: x.title })), ...(o.playlistId && !props.playlists.some(x => x.id === o.playlistId) ? [{ value: o.playlistId, label: 'Saved playlist' }] : [])], onChange: v => set({ playlistId: v }) })),
				h(Field, { label: 'Category' }, h(Select, { label: 'Category', value: String(o.categoryId), options: opts(YT_CATEGORIES), onChange: v => set({ categoryId: v }) })),
				h('div', { style: { display: 'flex', flexDirection: 'column' } }, h(Toggle, { value: !!o.notifySubscribers, onChange: v => set({ notifySubscribers: v }), label: 'Notify subscribers' }), h(Toggle, { value: !!o.madeForKids, onChange: v => set({ madeForKids: v }), label: 'Made for kids' }), h(Toggle, { value: !!o.containsSyntheticMedia, onChange: v => set({ containsSyntheticMedia: v }), label: 'Has realistic AI-made content' })),
			)
		case 'tiktok': {
			const info = props.tiktokInfo
			const levels: { value: string; label: string }[] = Array.isArray(info?.privacyLevels) ? info.privacyLevels : []
			const inter = info?.postingLimits?.interactionSettings ?? {}
			const off = (name: string) => inter[name] && inter[name].enabled === false
			const types: any[] = Array.isArray(info?.commercialContentTypes) ? info.commercialContentTypes : [{ value: 'brand_organic', label: 'Your own brand' }, { value: 'brand_content', label: 'Branded content' }]
			return h(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
				h(
					Grid,
					null,
					h(Field, { label: 'Who can view', hint: levels.length ? undefined : 'loads once a TikTok account is connected' }, h(Select, { label: 'Who can view', value: o.privacyLevel || '', options: [{ value: '', label: 'Choose...' }, ...levels.map(l => ({ value: l.value, label: l.label })), ...(o.privacyLevel && !levels.some(l => l.value === o.privacyLevel) ? [{ value: o.privacyLevel, label: o.privacyLevel }] : [])], onChange: v => set({ privacyLevel: v }) })),
					h(Field, { label: 'Disclosure' }, h(Select, { label: 'Disclosure', value: o.commercialContentType || 'none', options: [{ value: 'none', label: 'Not promotional' }, ...types.filter(c => c?.value && c.value !== 'none').map(c => ({ value: String(c.value), label: String(c.label ?? c.value) }))], onChange: v => set({ commercialContentType: v }) })),
				),
				h(
					'div',
					{ style: { display: 'flex', flexWrap: 'wrap', gap: '0 16px' } },
					h(Toggle, { value: !!o.allowComment && !off('allow_comment'), disabled: !!off('allow_comment'), onChange: v => set({ allowComment: v }), label: off('allow_comment') ? 'Comments (off in TikTok)' : 'Allow comments' }),
					h(Toggle, { value: !!o.allowDuet && !off('allow_duet'), disabled: !!off('allow_duet'), onChange: v => set({ allowDuet: v }), label: off('allow_duet') ? 'Duet (off in TikTok)' : 'Allow Duet' }),
					h(Toggle, { value: !!o.allowStitch && !off('allow_stitch'), disabled: !!off('allow_stitch'), onChange: v => set({ allowStitch: v }), label: off('allow_stitch') ? 'Stitch (off in TikTok)' : 'Allow Stitch' }),
					h(Toggle, { value: !!o.videoMadeWithAi, onChange: v => set({ videoMadeWithAi: v }), label: 'AI-generated' }),
					h(Toggle, { value: !!o.inboxDraft, onChange: v => set({ inboxDraft: v }), label: 'Send to the TikTok inbox to finish in the app' }),
				),
				info?.creator?.canPostMore === false ? h('div', { style: { fontSize: 11, color: AMBER } }, 'TikTok says this account cannot post more right now.') : null,
			)
		}
		case 'instagram':
			return h(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
				h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '0 16px' } }, h(Toggle, { value: !!o.shareToFeed, onChange: v => set({ shareToFeed: v }), label: 'Show the Reel on the main grid too' }), h(Toggle, { value: !!o.isAiGenerated, onChange: v => set({ isAiGenerated: v }), label: 'AI-generated media' })),
				h(Field, { label: 'Collaborators', hint: 'up to 3 usernames' }, h(TextIn, { value: o.collaborators || '', onChange: v => set({ collaborators: v }), placeholder: '@username', label: 'Collaborators' })),
			)
		case 'facebook':
			return h(Grid, null, h(Field, { label: 'Post as' }, h(Segmented, { label: 'Post as', value: o.contentType, options: opts({ feed: 'Feed video', reel: 'Reel' }), onChange: v => set({ contentType: v }) })), h(Toggle, { value: !!o.isAiGenerated, onChange: v => set({ isAiGenerated: v }), label: 'AI-generated media' }))
		case 'twitter':
			return h(Grid, null, h(Field, { label: 'Who can reply' }, h(Select, { label: 'Who can reply', value: o.replySettings || '', options: opts({ '': 'Everyone', following: 'People you follow', mentionedUsers: 'Only people you mention', verified: 'Verified accounts' }), onChange: v => set({ replySettings: v }) })), h(Toggle, { value: !!o.madeWithAi, onChange: v => set({ madeWithAi: v }), label: 'AI-generated media' }))
		case 'threads':
			return h(Field, { label: 'Topic tag', hint: 'one topic, no dots or ampersands' }, h(TextIn, { value: o.topic_tag || '', onChange: v => set({ topic_tag: v }), placeholder: 'optional', label: 'Topic tag' }))
		default:
			return null
	}
}

const WhenControl = ({ when, at, tz, onChange, name, hint }: { when: When; at: string; tz: string; onChange: (when: When, at: string) => void; name: string; hint?: string }) =>
	h(
		Grid,
		{ min: 210, top: true },
		h(Field, { label: name, hint }, h(Segmented, { label: name, value: when, options: [{ value: 'now', label: 'Now', title: 'Publishes as soon as you confirm the review' }, { value: 'schedule', label: 'Schedule' }, { value: 'draft', label: 'Draft', title: 'Saved in Zernio. Nothing reaches the platform.' }], onChange: v => onChange(v as When, v === 'schedule' && !at ? defaultAt(tz) : at) })),
		when === 'schedule' ? h(Field, { label: 'Date and time', hint: at ? scheduleText(at, tz) : undefined }, h(TimeInput, { name: 'Date and time', value: at, onChange: v => onChange('schedule', v) })) : null,
	)

const SentRow = ({ k, s, props }: { k: PlatformKey; s: Sent; props: GoProps }) =>
	h(
		Notice,
		{
			level: sentLevel(s),
			actions: h(
				'span',
				{ style: { display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } },
				s.url ? h('a', { href: s.url, target: '_blank', rel: 'noreferrer', className: 'kpub-link', style: { fontSize: 11 } }, 'Open') : null,
				s.status === 'failed' && s.postId ? h(Btn, { label: 'Retry', title: 'Ask Zernio to try the failed platforms of this post again, with the same text', onClick: () => props.onRetry(k), disabled: props.busy || !props.canPost }) : null,
				s.status !== 'rejected' ? h(Btn, { label: 'Send again', title: 'Forget this result so the platform goes out with your next send. The post that exists stays.', onClick: () => props.onClear([k]), disabled: props.busy }) : null,
			),
		},
		sentText(s, props.plan.timezone),
		s.status === 'failed' ? ' Retry sends the same text again. If you changed the text, use Send again.' : s.status === 'rejected' ? ' Nothing was created, so it goes out with your next send.' : '',
	)

export const GoSection = (props: GoProps) => {
	const { plan, on } = props
	const tz = plan.timezone
	const here = localZone()
	const anyOwn = on.some(k => plan.platforms[k].ownWhen)
	const scheduled = on.some(k => plan.platforms[k].when === 'schedule')
	const done = on.filter(k => plan.sent[k] && plan.sent[k]!.status !== 'rejected' && !props.sendable.includes(k))
	const stuck = props.canPost ? on.filter(k => !props.sendable.includes(k) && !done.includes(k) && !plan.outbox.some(o => o.keys.includes(k))) : []
	const modes = new Set(props.sendable.map(k => plan.platforms[k].when))
	const verb = modes.size > 1 ? 'Review' : modes.has('now') ? 'Review and post' : modes.has('schedule') ? 'Review and schedule' : 'Review drafts'
	return h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 12 } },
		h(WhenControl, { name: 'When', hint: anyOwn ? 'for platforms without their own time' : undefined, when: plan.when, at: plan.at, tz, onChange: (when, at) => props.update(x => withWhen(x, when, at)) }),
		scheduled
			? h(
					'div',
					{ style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
					h('span', { style: label }, 'Time zone'),
					h('div', { style: { flex: '0 1 240px', minWidth: 150 } }, h(Select, { label: 'Time zone', value: tz, options: (ZONES.includes(tz) ? ZONES : [tz, ...ZONES]).map(z => ({ value: z, label: z.replace(/_/g, ' ') })), onChange: v => props.update(x => ({ ...x, timezone: v })) })),
					tz !== here ? h(LinkBtn, { label: `Use my zone (${here.replace(/_/g, ' ')})`, onClick: () => props.update(x => ({ ...x, timezone: here })) }) : h('span', { style: small }, 'Times are on your clock.'),
				)
			: null,
		plan.when === 'draft' && !anyOwn ? h('div', { style: small }, 'Drafts are saved in your Zernio account. Nothing reaches a platform until you publish them there.') : null,
		on.length
			? h(
					'div',
					{ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
					...on.map(k => {
						const p = plan.platforms[k]
						const s = props.status[k]
						const open = props.open === k
						const { account, list } = accountFor(k, p, props.accounts)
						const set = (patch: Partial<PlatPlan>) => props.setPlat(k, x => ({ ...x, ...patch }))
						const sent = plan.sent[k]
						return h(
							Card,
							{ key: k, accent: SPEC[k].color, style: { gap: open ? 10 : 0, padding: 0 } },
							h(
								'button',
								{ type: 'button', className: 'kpub-row', 'aria-expanded': open, onClick: () => props.setOpen(open ? null : k), title: open ? 'Hide the options' : `Account, time and ${SPEC[k].label} options`, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: 'none', borderRadius: 7, background: 'transparent', color: TEXT, fontFamily: 'inherit', fontSize: 12, textAlign: 'left', width: '100%', cursor: 'pointer', minWidth: 0 } },
								h('span', { style: { color: DIM, width: 10, flex: 'none' } }, open ? '▾' : '▸'),
								h('span', { style: { fontWeight: 600, flex: 'none' } }, SPEC[k].label),
								h('span', { style: { ...ellipsis, fontSize: 11, color: DIM, flex: '0 1 auto' } }, [account ? handle(account) : '', p.when === 'schedule' && p.at ? fmtTime(zonedToUtc(p.at, tz), tz) || 'no time set' : whenText(p.when, p.at, tz)].filter(Boolean).join(', ')),
								h('span', { style: { ...ellipsis, flex: '1 1 0', textAlign: 'right', fontSize: 11, color: s.level === 'ok' ? GREEN : s.level === 'fail' ? TEXT : DIM } }, s.text),
								h(Dot, { color: dotOf(s.level) }),
							),
							open
								? h(
										'div',
										{ style: { display: 'flex', flexDirection: 'column', gap: 10, padding: '0 10px 10px' } },
										sent ? h(SentRow, { k, s: sent, props }) : null,
										k === 'youtube' && props.thumb && props.thumb.state !== 'done' ? h('div', { style: { ...small, color: props.thumb.state === 'error' ? RED : DIM } }, props.thumb.state === 'pending' ? 'Thumbnail: waiting for YouTube to have the video. Keep this panel open.' : `Thumbnail not set: ${props.thumb.note ?? 'unknown error'}`) : null,
										// once a post exists the pre-flight checks have nothing left to say
										sent && sent.status !== 'rejected' ? null : h(CheckList, { checks: props.checks[k].filter(c => c.level !== 'ok') }),
										props.canPost && list.length > 1
											? h(Field, { label: 'Account' }, h(Select, { label: `${SPEC[k].label} account`, value: account?.id ?? '', options: [...(account ? [] : [{ value: '', label: 'Choose an account...' }]), ...list.map(a => ({ value: a.id, label: `${handle(a)}${a.needsReconnection ? ' (needs reconnecting)' : ''}` }))], onChange: v => set({ accountId: v }) }))
											: null,
										h(Toggle, { value: p.ownWhen, onChange: v => set(v ? { ownWhen: true } : { ownWhen: false, when: plan.when, at: plan.at }), label: `Give ${SPEC[k].label} its own time` }),
										p.ownWhen ? h(WhenControl, { name: `${SPEC[k].label} goes out`, when: p.when, at: p.at, tz, onChange: (when, at) => set({ when, at }) }) : null,
										h(PlatformOptions, { k, p, set: o => set({ opts: { ...p.opts, ...o } }), props }),
									)
								: null,
						)
					}),
				)
			: h('div', { style: small }, 'Turn on a platform at the top first.'),
		...plan.outbox.map(item =>
			h(
				Notice,
				{
					key: item.key,
					level: 'warn',
					actions: h(
						'span',
						{ style: { display: 'inline-flex', gap: 6, flexWrap: 'wrap' } },
						h(Btn, { label: 'Check again', title: 'Ask the bridge and Zernio whether this post exists', onClick: () => props.onOutbox(item, 'check'), disabled: props.busy || !props.canPost }),
						h(Btn, { label: 'Send again', title: 'Sends the same post with the same id. If Zernio already has it, it answers with that post instead of making a second one.', onClick: () => props.onOutbox(item, 'resend'), disabled: props.busy || !props.canPost }),
						h(Btn, { label: 'Forget it', title: 'Stop tracking this send. Do this once you know whether it went out.', onClick: () => props.onOutbox(item, 'discard'), disabled: props.busy }),
					),
				},
				`Outcome unknown for ${labels(item.keys)} (${item.mode === 'now' ? 'post now' : item.mode === 'draft' ? 'draft' : scheduleText(item.at, tz)}, sent ${fmtWhen(new Date(item.sentAt).toISOString())}). ${item.error ?? 'No answer came back.'} These platforms are held back until this is cleared up, so nothing goes out twice.`,
			),
		),
		h(
			'div',
			{ style: { display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${LINE}`, paddingTop: 12 } },
			stuck.length
				? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'baseline', fontSize: 11 } }, h('span', { style: { color: DIM } }, 'Not ready:'), ...stuck.map(k => h(LinkBtn, { key: k, label: `${SPEC[k].label}: ${props.status[k].text}`, onClick: () => props.onJump(k, props.status[k].area) })))
				: null,
			h(
				'div',
				{ style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
				!props.canPost
					? h(Btn, { label: 'Set up posting', primary: props.primary, onClick: props.onSetup })
					: h(Btn, { label: props.busy ? 'Working...' : props.sendable.length ? `${verb}: ${props.sendable.length > 3 ? plural(props.sendable.length, 'platform') : labels(props.sendable)}` : 'Review and post', primary: props.primary, disabled: props.busy || !props.sendable.length, onClick: props.onReview }),
				done.length ? h(Btn, { label: 'Refresh results', title: 'Ask Zernio how the posts are doing', onClick: props.onRefreshSent, disabled: props.busy || !props.canPost }) : null,
				done.length > 1 ? h(Btn, { label: 'Clear results', title: 'Forget what was sent so these platforms can go out again, for example with the next video. Posts that exist stay.', onClick: () => props.onClear(done), disabled: props.busy }) : null,
				h(
					'span',
					{ style: { ...small, flex: '1 1 180px' } },
					!props.canPost
						? props.whyNot
						: props.sendable.length
							? 'You see every word, file and time once more before anything goes out.'
							: done.length && done.length === on.length
								? 'Everything here has gone out.'
								: on.length
									? 'Nothing is ready to send yet.'
									: '',
				),
			),
		),
		props.canPost
			? h(
					More,
					{ open: props.activity.open, onToggle: () => props.onActivity('toggle'), label: 'Posts in Zernio' },
					h(ActivityList, { posts: props.activity.posts, loading: props.activity.loading, busy: props.busy, onRefresh: () => props.onActivity('refresh'), onRetry: props.onPostRetry, onDelete: props.onPostDelete, onSetThumb: props.onSetThumb }),
				)
			: null,
	)
}

const STATUS_COLOR: Record<string, string> = { published: GREEN, scheduled: 'var(--kp-blue)', draft: DIM, publishing: AMBER, partial: AMBER, failed: RED, cancelled: DIM, pending_approval: AMBER }

// The latest posts in the Zernio account: where a scheduled post is cancelled or a thumbnail set by hand
const ActivityList = (props: { posts: any[]; loading: boolean; busy: boolean; onRefresh: () => void; onRetry: (id: string) => void; onDelete: (id: string) => void; onSetThumb: (postId: string, accountId?: string) => void }) =>
	h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
		h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } }, h('span', { style: { ...small, flex: 1 } }, 'The 10 newest posts of this profile, from any tool.'), h(Btn, { label: props.loading ? 'Loading...' : 'Refresh', onClick: props.onRefresh, disabled: props.loading })),
		props.posts.length || props.loading ? null : h('div', { style: small }, 'No posts in Zernio yet.'),
		...props.posts.map((post, n) =>
			h(
				Card,
				{ key: String(post?._id ?? n), style: { gap: 5 } },
				h(
					'div',
					{ style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
					h(Dot, { color: STATUS_COLOR[post?.status] ?? DIM }),
					h('span', { style: { fontSize: 11, fontWeight: 600 } }, String(post?.status ?? 'unknown')),
					h('span', { style: { ...ellipsis, fontSize: 11, color: DIM, flex: '1 1 120px' } }, String(post?.title || post?.content || '').slice(0, 90)),
					h('span', { style: { fontSize: 10, color: DIM } }, fmtWhen(post?.scheduledFor ?? post?.createdAt, typeof post?.timezone === 'string' ? post.timezone : undefined)),
					post?.status === 'failed' || post?.status === 'partial' ? h(Btn, { label: 'Retry', onClick: () => props.onRetry(post._id), disabled: props.busy }) : null,
					post?._id && post.status !== 'published' && post.status !== 'publishing' && post.status !== 'partial' ? h(Btn, { label: post.status === 'scheduled' ? 'Cancel and delete' : 'Delete', danger: true, onClick: () => props.onDelete(post._id), disabled: props.busy }) : null,
				),
				...(Array.isArray(post?.platforms) ? post.platforms : []).map((pl: any, i: number) =>
					h(
						'div',
						{ key: i, style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 11, paddingLeft: 15 } },
						h(Dot, { color: SPEC[pl?.platform as PlatformKey]?.color ?? DIM }),
						h('span', { style: { width: 70 } }, SPEC[pl?.platform as PlatformKey]?.label ?? String(pl?.platform ?? '')),
						h('span', { style: { color: STATUS_COLOR[pl?.status] ?? DIM } }, String(pl?.status ?? '')),
						typeof pl?.platformPostUrl === 'string' && /^https?:\/\//.test(pl.platformPostUrl) ? h('a', { href: pl.platformPostUrl, target: '_blank', rel: 'noreferrer', className: 'kpub-link' }, 'Open') : null,
						pl?.platform === 'youtube' && pl.platformPostId ? h(Btn, { label: 'Set thumbnail', title: 'Upload the 16:9 cover chosen under Video and set it on this YouTube video', onClick: () => props.onSetThumb(post._id, typeof pl.accountId === 'string' ? pl.accountId : pl.accountId?._id), disabled: props.busy }) : null,
						pl?.errorMessage ? h('span', { style: { color: RED, flex: '1 1 160px', minWidth: 0, overflowWrap: 'anywhere' } }, String(pl.errorMessage)) : null,
					),
				),
			),
		),
	)

// ---------- review ----------
const settingsLine = (k: PlatformKey, p: PlatPlan, playlists: { id: string; title: string }[], tiktokInfo: any) => {
	const o = p.opts
	const bits: string[] = []
	if (k === 'youtube') bits.push(`Visibility: ${o.visibility}`, o.playlistId ? `playlist: ${playlists.find(x => x.id === o.playlistId)?.title ?? 'saved playlist'}` : '', o.madeForKids ? 'made for kids' : '', o.notifySubscribers ? '' : 'subscribers are not notified')
	if (k === 'tiktok') bits.push(`Who can view: ${(Array.isArray(tiktokInfo?.privacyLevels) ? tiktokInfo.privacyLevels : []).find((l: any) => l.value === o.privacyLevel)?.label ?? (o.privacyLevel || 'not chosen')}`, o.inboxDraft ? 'goes to the TikTok inbox, not public' : '', o.commercialContentType && o.commercialContentType !== 'none' ? `disclosure: ${o.commercialContentType}` : '')
	if (k === 'instagram') bits.push('Reel', o.shareToFeed ? 'also on the grid' : 'not on the grid', o.collaborators ? `collaborators: ${o.collaborators}` : '')
	if (k === 'facebook') bits.push(o.contentType === 'reel' ? 'Reel' : 'Feed video')
	if (k === 'twitter' && o.replySettings) bits.push(`Replies: ${o.replySettings}`)
	if (k === 'threads' && o.topic_tag) bits.push(`Topic: ${o.topic_tag}`)
	return bits.filter(Boolean).join(', ')
}

export type ReviewProps = {
	keys: PlatformKey[]
	plan: Plan
	rules: Rules | null
	accounts: Account[]
	deliveries: Record<PlatformKey, Delivery>
	playlists: { id: string; title: string }[]
	tiktokInfo: any
	uploads: Source[] // what still has to be rendered or uploaded
	phase: 'review' | 'working' | 'done'
	step: string
	progress: Progress[]
	error: string
	validation: Check[] | null
	validating: boolean
	consent: boolean
	setConsent: (v: boolean) => void
	onConfirm: () => void
	onValidate: () => void
	onClose: () => void
}

/**
 * The last look: per platform exactly what goes out, where and when. Nothing is sent before the
 * button here is pressed, and the dialog stays up to show what became of each platform.
 */
export const ReviewDialog = (props: ReviewProps) => {
	const { plan, keys } = props
	const [checked, setChecked] = useState(false)
	const tz = plan.timezone
	const live = keys.filter(k => plan.platforms[k].when !== 'draft')
	const modes = new Set(keys.map(k => plan.platforms[k].when))
	const needConsent = keys.includes('tiktok') && plan.platforms.tiktok.when !== 'draft'
	const action = modes.size > 1 ? 'Send' : modes.has('now') ? 'Post now' : modes.has('schedule') ? 'Schedule' : 'Save drafts'
	const renders = props.uploads.filter(s => s.render)
	const review = props.phase === 'review'
	return h(
		Modal,
		{
			title: props.phase === 'done' ? 'What happened' : props.phase === 'working' ? 'Sending...' : live.length ? 'Review before it goes out' : 'Review the drafts',
			onClose: props.onClose,
			locked: props.phase === 'working',
			width: 600,
			footer:
				props.phase === 'done'
					? h(Btn, { label: 'Done', primary: true, autoFocus: true, onClick: props.onClose })
					: h(
							'div',
							{ style: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%' } },
							review && live.length ? h(Toggle, { value: checked, onChange: setChecked, label: `I checked the text, files, accounts and times above for ${labels(live)}` }) : null,
							h(
								'div',
								{ style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' } },
								h('span', { style: { ...small, flex: '1 1 160px' } }, review ? (!props.uploads.length ? 'Files are already uploaded.' : `${renders.length ? `Renders ${plural(renders.length, 'cut')}, then uploads` : 'Uploads'} ${plural(props.uploads.length, 'file')} to Zernio first.`) : 'Keep this panel open until it is done.'),
								h(Btn, { label: props.validating ? 'Checking...' : 'Check with Zernio', title: 'Sends the text to Zernio for a dry run. Nothing is posted.', onClick: props.onValidate, disabled: !review || props.validating }),
								h(Btn, { label: 'Cancel', onClick: props.onClose, disabled: !review }),
								h(Btn, { label: review ? action : 'Working...', primary: true, disabled: !review || (live.length > 0 && !checked) || (needConsent && !props.consent), onClick: props.onConfirm }),
							),
						),
		},
		props.error ? h(Notice, { level: 'fail' }, props.error) : null,
		props.phase !== 'review' && (props.step || props.progress.length)
			? h(
					Card,
					null,
					props.step ? h('span', { style: { fontSize: 12 } }, props.step) : null,
					...props.progress.map((u, i) =>
						h(
							'div',
							{ key: i, style: { display: 'flex', flexDirection: 'column', gap: 3 } },
							h('div', { style: { display: 'flex', fontSize: 11, gap: 8 } }, h('span', { style: { flex: 1, minWidth: 0, overflowWrap: 'anywhere' } }, u.label), h('span', { style: { fontFamily: MONO, color: u.state === 'error' ? RED : u.state === 'done' ? GREEN : DIM } }, u.state === 'rendering' || u.state === 'uploading' ? `${u.state} ${Math.round(u.value * 100)}%` : u.state)),
							h(Bar, { value: u.state === 'done' ? 1 : u.value, color: u.state === 'error' ? RED : undefined }),
						),
					),
				)
			: null,
		props.validation ? h(Card, null, h('span', { style: label }, 'Zernio dry run'), props.validation.length ? h(CheckList, { checks: props.validation }) : h('span', { style: { fontSize: 11, color: GREEN } }, 'Zernio found no problems.')) : null,
		...keys.map(k => {
			const p = plan.platforms[k]
			const d = props.deliveries[k]
			const { account } = accountFor(k, p, props.accounts)
			const lim = limitsFor(k, props.rules, !!p.opts.premium)
			const body = finalText(p)
			const thread = threadPosts(k, p)
			const usesTitle = k === 'youtube' || (k === 'facebook' && p.opts.contentType === 'reel')
			const sent = props.phase === 'done' ? plan.sent[k] : undefined
			const pending = props.phase === 'done' && plan.outbox.some(o => o.keys.includes(k))
			const settings = settingsLine(k, p, props.playlists, props.tiktokInfo)
			return h(
				Card,
				{ key: k, accent: SPEC[k].color },
				h(
					'div',
					{ style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } },
					h('span', { style: { fontWeight: 600, fontSize: 13 } }, SPEC[k].label),
					h('span', { style: { fontSize: 12, color: DIM } }, account ? handle(account) : ''),
					h('span', { style: { flex: '1 1 auto', textAlign: 'right', fontSize: 12, fontWeight: 600, color: p.when === 'now' ? AMBER : TEXT } }, p.when === 'now' ? 'Publishes now' : p.when === 'draft' ? 'Draft in Zernio, not published' : scheduleText(p.at, tz)),
				),
				sent ? h(Notice, { level: sentLevel(sent), actions: sent.url ? h('a', { href: sent.url, target: '_blank', rel: 'noreferrer', className: 'kpub-link', style: { fontSize: 11 } }, 'Open') : null }, sentText(sent, tz)) : pending ? h(Notice, { level: 'warn' }, 'No clear answer came back. See the Go section before sending this again.') : props.phase === 'done' ? h(Notice, { level: 'info' }, 'Not sent.') : null,
				h('div', { style: small }, `Video: ${d.what}${d.coverLine ? `. Cover: ${d.coverLine.replace(/^cover /, '')}` : ''}${settings ? `. ${settings}` : ''}.`),
				usesTitle && p.title.trim() ? h('div', { style: { fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere', userSelect: 'text' } }, p.title.trim()) : null,
				h(Quote, { text: body }),
				h('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, h(Counter, { n: measure(k, body, lim.urlChars), max: lim.text })),
				...thread.map((t, i) => h('div', { key: i, style: { display: 'flex', flexDirection: 'column', gap: 3 } }, h('span', { style: label }, `Thread post ${i + 2}`), h(Quote, { text: t, max: 120 }))),
				SPEC[k].firstComment && p.firstComment.trim() ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } }, h('span', { style: label }, 'First comment'), h(Quote, { text: p.firstComment.trim(), max: 120 })) : null,
				k === 'tiktok' && needConsent && review
					? h(Toggle, { value: props.consent, onChange: props.setConsent, label: `I previewed this video and caption and agree to publish it to TikTok under TikTok's Music Usage Confirmation${p.opts.commercialContentType === 'brand_content' ? ' and Branded Content Policy' : ''}. Asked for every post.` })
					: null,
			)
		}),
	)
}

// ---------- setup ----------
export type SetupProps = {
	bridge: BridgeState
	bridgeNote: string
	note: { level: Level; text: string } | null // shown here too: the dialog covers the panel's own note line
	working: string
	keyState: KeyState
	keyNote: string
	profiles: Profile[]
	accounts: Account[] // of the chosen profile
	profileId: string
	plan: Plan
	on: PlatformKey[]
	busy: boolean
	loadingAccounts: boolean
	usage: any
	setPlat: SetPlat
	onPair: () => void
	onRetryBridge: () => void
	onProfile: (id: string) => void
	onSaveKey: (key: string) => Promise<boolean>
	onRemoveKey: () => void
	onConnect: (k: PlatformKey) => void
	onRefresh: () => void
	onUsage: () => void
	onClose: () => void
}

// Plain "name: value" lines from whatever /usage returns, two levels deep
const usageLines = (usage: any) => {
	const out: string[] = []
	const walk = (value: any, path: string, depth: number) => {
		if (value === null || value === undefined) return
		if (typeof value !== 'object') return void out.push(`${path}: ${value}`)
		if (depth < 2 && !Array.isArray(value)) for (const [k, v] of Object.entries(value)) walk(v, path ? `${path} ${k}` : k, depth + 1)
	}
	walk(usage, '', 0)
	return out.slice(0, 24)
}

/** Posting setup, out of the main path: the bridge, the Zernio key and the accounts. */
export const SetupDialog = (props: SetupProps) => {
	const [key, setKey] = useState('')
	const { keyState } = props
	const bridgeOk = props.bridge === 'ok'
	const keyText =
		keyState === 'ok'
			? `A key is saved on ${MACHINE} and Zernio accepts it.`
			: keyState === 'invalid'
				? `Zernio rejected the saved key${props.keyNote ? `: ${props.keyNote}` : '.'}`
				: keyState === 'unreachable'
					? `A key is saved, but Zernio did not answer${props.keyNote ? `: ${props.keyNote}` : '.'}`
					: keyState === 'none'
						? `No key on ${MACHINE} yet.`
						: 'Checking...'
	const save = () => key.trim() && !props.busy && props.onSaveKey(key.trim()).then(saved => saved && setKey(''))
	const section = (title: string, ...children: ReactNode[]) => h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } }, h('span', { style: { ...label, color: ink(0.75) } }, title), ...children)
	return h(
		Modal,
		{ title: 'Posting setup', onClose: props.onClose, width: 560 },
		h('div', { style: small }, 'Posting is optional. Without it you can still write copy, copy it out and render cuts.'),
		props.working ? h(Notice, { level: 'info' }, `${props.working}...`) : props.note ? h(Notice, { level: props.note.level }, props.note.text) : null,
		section(
			'1. Bridge',
			bridgeOk
				? h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 } }, h(Dot, { color: GREEN }), `Connected to the bridge on ${MACHINE}.`)
				: props.bridge === 'checking'
					? h('div', { style: small }, 'Looking for the bridge...')
					: h(BridgeCard, { bridge: props.bridge, note: props.bridgeNote, uses: 'Posting, covers and platform cuts', onPair: props.onPair, onRetry: props.onRetryBridge, compact: true }),
		),
		section(
			'2. Zernio API key',
			h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, overflowWrap: 'anywhere' } }, h(Dot, { color: keyState === 'ok' ? GREEN : keyState === 'unknown' ? ink(0.25) : keyState === 'unreachable' ? AMBER : RED }), bridgeOk ? keyText : 'Connect the bridge first.'),
			h(
				'div',
				{ style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
				h('div', { style: { flex: '1 1 200px', minWidth: 0 } }, h(TextIn, { type: 'password', value: key, onChange: setKey, placeholder: keyState === 'ok' ? 'Paste a new key to replace it' : 'sk_...', label: 'Zernio API key', onEnter: save })),
				h(Btn, { label: 'Save key', primary: keyState !== 'ok' && !!key.trim(), disabled: props.busy || !bridgeOk || !key.trim(), onClick: save }),
				keyState !== 'none' && keyState !== 'unknown' ? h(Btn, { label: 'Remove', danger: true, onClick: props.onRemoveKey, disabled: props.busy || !bridgeOk }) : null,
				keyState === 'unreachable' ? h(Btn, { label: 'Try again', onClick: props.onRetryBridge, disabled: props.busy }) : null,
			),
			h('div', { style: small }, `Zernio is the service that posts for you. Create a key in its dashboard at zernio.com. The key goes straight to the bridge, which checks it and keeps it in its own folder on ${MACHINE}, readable only by your user account. It never enters the project and this panel cannot read it back.`),
		),
		keyState === 'ok' && bridgeOk
			? section(
					'3. Accounts',
					props.profiles.length > 1
						? h(Field, { label: 'Profile', hint: 'a profile is one brand in Zernio. Only its accounts are used.' }, h(Select, { label: 'Profile', value: props.profileId, options: props.profiles.map(p => ({ value: p.id, label: p.name })), onChange: props.onProfile }))
						: null,
					...PLATFORM_KEYS.map(k => {
						const p = props.plan.platforms[k]
						const { account, list, problem } = accountFor(k, p, props.accounts)
						const wanted = props.on.includes(k)
						return h(
							'div',
							{ key: k, style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 30, borderBottom: `1px solid ${LINE}`, paddingBottom: 4 } },
							h(Dot, { color: list.length ? SPEC[k].color : ink(0.2) }),
							h('span', { style: { width: 74, fontSize: 12, fontWeight: wanted ? 600 : 400 } }, SPEC[k].label),
							list.length > 1
								? h('div', { style: { flex: '1 1 150px', minWidth: 0 } }, h(Select, { label: `${SPEC[k].label} account`, value: account?.id ?? '', options: [...(account ? [] : [{ value: '', label: problem === 'gone' ? 'The saved account is gone. Choose...' : 'Choose an account...' }]), ...list.map(a => ({ value: a.id, label: `${handle(a)}${a.needsReconnection ? ' (needs reconnecting)' : ''}` }))], onChange: v => props.setPlat(k, x => ({ ...x, accountId: v })) }))
								: h('span', { style: { ...ellipsis, flex: '1 1 150px', fontSize: 11, color: list.length ? TEXT : wanted ? RED : DIM } }, list.length ? `${handle(list[0])}${list[0].needsReconnection || list[0].active === false ? ' (needs reconnecting)' : ''}` : wanted ? 'Not connected, and this plan posts there' : 'Not connected'),
							h(Btn, { label: list.length ? 'Add or reconnect' : 'Connect', primary: wanted && !list.length, onClick: () => props.onConnect(k), disabled: props.busy }),
						)
					}),
					h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, h('span', { style: { ...small, flex: '1 1 200px' } }, 'Connect opens the platform sign-in in your browser. Approve it there and come back: the list updates when this window is in front again.'), h(Btn, { label: props.loadingAccounts ? 'Loading...' : 'Refresh', onClick: props.onRefresh, disabled: props.loadingAccounts })),
					!props.accounts.length && !props.loadingAccounts ? h(Notice, { level: 'info' }, 'No accounts connected in this profile yet. Connect the platforms you post to.') : null,
				)
			: null,
		keyState === 'ok' && bridgeOk
			? section(
					'Zernio plan',
					props.usage
						? h('div', { className: 'kpub-scroll', style: { fontFamily: MONO, fontSize: 10, color: DIM, lineHeight: 1.6, maxHeight: 160, overflow: 'auto' } }, ...(usageLines(props.usage).length ? usageLines(props.usage) : ['Zernio sent no usage numbers.']).map((line, i) => h('div', { key: i }, line)))
						: h('div', null, h(Btn, { label: 'Show plan and post counts', onClick: props.onUsage, disabled: props.busy })),
				)
			: null,
	)
}

// ---------- small dialogs ----------
export type Ask = { title: string; text: string; yes: string; danger?: boolean; run: () => void }
export const AskDialog = ({ ask, onClose }: { ask: Ask; onClose: () => void }) =>
	h(
		Modal,
		{
			title: ask.title,
			onClose,
			width: 400,
			footer: [
				// Enter lands on the safe button when the action deletes something
				h(Btn, { key: 'no', label: 'Cancel', autoFocus: !!ask.danger, onClick: onClose }),
				h(Btn, {
					key: 'yes',
					label: ask.yes,
					primary: true,
					autoFocus: !ask.danger,
					onClick: () => {
						onClose()
						ask.run()
					},
				}),
			],
		},
		h('div', { style: { fontSize: 12, lineHeight: 1.5 } }, ask.text),
	)

/** The request for the agent, to copy by hand when the panel could neither send nor copy it. */
export const PromptDialog = ({ text, note, onOpenChat, onClose }: { text: string; note: string; onOpenChat: () => void; onClose: () => void }) => {
	const [copied, setCopied] = useState(false)
	return h(
		Modal,
		{
			title: 'Send this to the agent',
			onClose,
			width: 600,
			footer: [
				h(Btn, { key: 'chat', label: 'Open a chat', onClick: onOpenChat }),
				h(Btn, { key: 'copy', label: copied ? 'Copied' : 'Copy the request', primary: true, autoFocus: true, onClick: () => copyText(text).then(setCopied) }),
			],
		},
		h('div', { style: { fontSize: 12, lineHeight: 1.5 } }, note),
		h('textarea', { readOnly: true, value: text, rows: 12, 'aria-label': 'Request for the agent', onFocus: (e: any) => e.target.select(), style: { ...input, height: 'auto', padding: 8, fontFamily: MONO, fontSize: 11, lineHeight: 1.45, resize: 'vertical' } }),
	)
}
