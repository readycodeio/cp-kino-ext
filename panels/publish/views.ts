// Publish panel views: Copy, Schedule, Post and Settings tabs, plus the confirmation dialog.
import { createElement as h, useState } from 'react'
import type { ReactNode } from 'react'
import { MediaPicker, useGetMediaState } from 'kino/panel'
import { AMBER, BG, Btn, DIM, Dot, EMBER, Field, GREEN, Grid, LINE, MONO, RED, Range, Section, Segmented, Select, TEXT, TextArea, TextIn, Toggle, input, label } from '../thumbs/ui'
import {
	DASHES,
	LANGUAGES,
	PLATFORM_KEYS,
	SPEC,
	chars,
	finalText,
	fmtWhen,
	hashtagList,
	limitsFor,
	tagList,
	zonedToUtc,
	type Account,
	type Check,
	type CopyDoc,
	type Level,
	type Option,
	type Plan,
	type PlatformKey,
	type PlatPlan,
	type Rules,
	type When,
} from './lib'
import { SHAPE_LABEL, VERTICAL_ONLY, newestCover, probeText, ratioText, shapeOf, type Cover, type Delivery, type ProbeState, type Shape, type Source } from './media'
import { EXAMPLE_VIDEO_PATH, MACHINE } from '../platform'

const LEVEL: Record<Level, string> = { ok: GREEN, warn: AMBER, fail: RED, info: 'rgba(var(--kp-ink),0.45)' }
const opts = (o: Record<string, string>) => Object.entries(o).map(([value, text]) => ({ value, label: text }))

export const accountFor = (key: PlatformKey, p: PlatPlan, accounts: Account[]) => {
	const list = accounts.filter(a => a.platform === key)
	return list.find(a => a.id === p.accountId) ?? list[0] ?? null
}

// Everything the panel can check before anything leaves the machine
export const platformChecks = (key: PlatformKey, plan: Plan, accounts: Account[], rules: Rules | null, tiktokConsent: boolean, d?: Delivery): Check[] => {
	const p = plan.platforms[key]
	const s = SPEC[key]
	const lim = limitsFor(key, rules, !!p.opts.premium)
	const out: Check[] = []
	const account = accountFor(key, p, accounts)
	if (!account) out.push({ level: 'fail', text: `No ${s.label} account connected (Settings)` })
	else if (account.needsReconnection || account.active === false) out.push({ level: 'fail', text: `@${account.username ?? account.displayName} needs reconnecting in Zernio` })
	const text = finalText(p)
	if (!p.text.trim()) out.push({ level: 'fail', text: 'No copy yet' })
	if (chars(text) > lim.text) out.push({ level: 'fail', text: `Text is ${chars(text)} of ${lim.text} chars` })
	if (key === 'youtube' && !p.title.trim()) out.push({ level: 'fail', text: 'YouTube needs a title' })
	if (lim.title && chars(p.title) > lim.title) out.push({ level: 'fail', text: `Title is ${chars(p.title)} of ${lim.title} chars` })
	if (key === 'youtube' && tagList(p.tags).join(',').length > (lim.tagsTotal ?? 500)) out.push({ level: 'fail', text: `Tags are over ${lim.tagsTotal ?? 500} chars together` })
	const nTags = hashtagList(p.hashtags).length
	if (lim.hashtagsMax !== undefined && nTags > lim.hashtagsMax) out.push({ level: 'fail', text: `${nTags} hashtags, ${s.label} allows ${lim.hashtagsMax}` })
	if (s.firstComment && chars(p.firstComment) > s.firstComment) out.push({ level: 'fail', text: `First comment over ${s.firstComment} chars` })
	if (s.thread) p.thread.forEach((t, i) => chars(t) > lim.text && out.push({ level: 'fail', text: `Thread post ${i + 2} is over ${lim.text} chars` }))
	if (DASHES.test(p.title + p.text + p.firstComment + p.thread.join(''))) out.push({ level: 'warn', text: 'Has an em or en dash (house rule: none)' })
	if (d) out.push(...d.checks)
	if (p.when === 'schedule') {
		const t = zonedToUtc(p.at, plan.timezone)
		if (!p.at || Number.isNaN(t)) out.push({ level: 'fail', text: 'Pick a date and time' })
		else if (t < Date.now() + 5 * 60_000) out.push({ level: 'fail', text: 'Scheduled time is in the past or too close' })
	}
	if (key === 'tiktok' && p.when !== 'draft') {
		if (!p.opts.privacyLevel) out.push({ level: 'fail', text: 'Pick who can view it on TikTok' })
		if (!tiktokConsent) out.push({ level: 'fail', text: 'Tick the TikTok consent box' })
	}
	if (key === 'youtube' && p.opts.visibility === 'public' && p.when === 'now') out.push({ level: 'info', text: 'Goes public as soon as YouTube finishes processing' })
	if (!out.some(c => c.level === 'fail')) out.unshift({ level: 'ok', text: 'Ready' })
	return out
}

// ---------- small pieces ----------
export const Chip = ({ on, text, onClick, color, title }: { on: boolean; text: string; onClick: () => void; color?: string; title?: string }) =>
	h(
		'button',
		{
			className: 'kino-thumbs-btn',
			onClick,
			title,
			style: {
				height: 24,
				padding: '0 10px',
				borderRadius: 12,
				fontSize: 11,
				cursor: 'pointer',
				display: 'inline-flex',
				alignItems: 'center',
				gap: 6,
				border: `1px solid ${on ? 'rgba(255,138,31,.6)' : 'rgba(var(--kp-ink),.12)'}`,
				background: on ? 'rgba(255,138,31,.14)' : 'rgba(var(--kp-ink),.03)',
				color: on ? TEXT : DIM,
			},
		},
		color ? h(Dot, { color: on ? color : 'rgba(var(--kp-ink),.25)' }) : null,
		text,
	)

const Counter = ({ n, max, warnAt }: { n: number; max?: number; warnAt?: number }) =>
	max ? h('span', { style: { fontFamily: MONO, fontSize: 10, color: n > max ? RED : warnAt && n > warnAt ? AMBER : DIM } }, `${n}/${max}`) : h('span', { style: { fontFamily: MONO, fontSize: 10, color: DIM } }, String(n))

const CheckList = ({ checks }: { checks: Check[] }) =>
	h(
		'div',
		{ style: { display: 'flex', flexWrap: 'wrap', gap: '4px 12px' } },
		...checks.map((c, i) => h('span', { key: i, style: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: c.level === 'ok' ? GREEN : c.level === 'info' ? DIM : TEXT } }, h(Dot, { color: LEVEL[c.level] }), c.text)),
	)

const Card = (props: { children: ReactNode; accent?: string; style?: object }) =>
	h('div', { style: { border: `1px solid ${LINE}`, borderLeft: props.accent ? `2px solid ${props.accent}` : `1px solid ${LINE}`, borderRadius: 8, padding: 10, background: 'rgba(var(--kp-ink),.015)', display: 'flex', flexDirection: 'column', gap: 8, ...props.style } }, props.children)

const PlatformHead = ({ k, right, account }: { k: PlatformKey; right?: ReactNode; account?: Account | null }) =>
	h(
		'div',
		{ style: { display: 'flex', alignItems: 'center', gap: 8, minHeight: 22 } },
		h(Dot, { color: SPEC[k].color }),
		h('span', { style: { fontWeight: 600, fontSize: 12 } }, SPEC[k].label),
		account ? h('span', { style: { fontSize: 11, color: DIM } }, `@${account.username ?? account.displayName ?? account.id}`) : null,
		h('div', { style: { flex: 1 } }),
		right ?? null,
	)

export const MediaName = ({ id }: { id: string }) => {
	const { mediaItem } = useGetMediaState(id) as any
	const name = mediaItem?.title || mediaItem?.filename || mediaItem?.name || `${id.slice(0, 8)}...`
	return h('span', { title: id, style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, String(name))
}

// Library video picker in a floating sheet; mounted only while open
export const PickerSheet = ({ title, value, onPick, onClose }: { title: string; value: string; onPick: (id: string) => void; onClose: () => void }) =>
	h(
		'div',
		{ style: { position: 'fixed', inset: 0, zIndex: 50, background: 'var(--kp-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }, onClick: onClose },
		h(
			'div',
			{
				onClick: (e: any) => e.stopPropagation(),
				style: { width: 'min(620px, 94vw)', height: 'min(560px, 88vh)', background: 'var(--kp-modal)', border: '1px solid rgba(var(--kp-ink),.12)', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px var(--kp-shadow-lg)' },
			},
			h('div', { style: { display: 'flex', alignItems: 'center', padding: '8px 10px', borderBottom: `1px solid ${LINE}`, gap: 8 } }, h('span', { style: { ...label, color: TEXT } }, title), h('div', { style: { flex: 1 } }), h(Btn, { label: 'Close', onClick: onClose })),
			h('div', { style: { flex: 1, minHeight: 0, overflow: 'auto' } }, h(MediaPicker as any, { kind: 'video', value: value ? `kino:${value}` : null, onAudition: () => {}, onPick: (id: string) => onPick(String(id).replace(/^kino:/, '')), onConfirm: (id: string) => onPick(String(id).replace(/^kino:/, '')) })),
		),
	)

// ---------- Copy tab ----------
type CopyProps = {
	plan: Plan
	setPlat: (k: PlatformKey, fn: (p: PlatPlan) => PlatPlan) => void
	setParams: (fn: (p: Plan['params']) => Plan['params']) => void
	copy: CopyDoc | null
	rules: Rules | null
	accounts: Account[]
	canPrompt: boolean
	busy: boolean
	onGenerate: (platforms: PlatformKey[], feedback?: string) => void
	onOpenChat: () => void
	onDismissPending: () => void
}

const OptionCard = ({ o, k, picked, onPick }: { o: Option; k: PlatformKey; picked: boolean; onPick: () => void }) => {
	const text = [o.text, o.hashtags.join(' ')].filter(Boolean).join('\n\n')
	return h(
		'button',
		{
			className: 'kino-thumbs-card',
			onClick: onPick,
			title: o.why ?? '',
			style: {
				textAlign: 'left',
				cursor: 'pointer',
				padding: 8,
				borderRadius: 7,
				border: `1px solid ${picked ? 'rgba(255,138,31,.7)' : 'rgba(var(--kp-ink),.1)'}`,
				background: picked ? 'rgba(255,138,31,.08)' : 'rgba(var(--kp-sink),.2)',
				color: TEXT,
				display: 'flex',
				flexDirection: 'column',
				gap: 5,
				minWidth: 0,
				fontFamily: 'inherit',
			},
		},
		h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } }, h('span', { style: { ...label, color: picked ? EMBER : DIM } }, o.angle), h('div', { style: { flex: 1 } }), h(Counter, { n: chars(text), max: SPEC[k].text })),
		o.title ? h('div', { style: { fontWeight: 600, fontSize: 12, lineHeight: 1.35 } }, o.title) : null,
		h('div', { style: { fontSize: 11, lineHeight: 1.45, color: 'rgba(var(--kp-ink),.78)', whiteSpace: 'pre-wrap', maxHeight: 118, overflow: 'hidden', maskImage: 'linear-gradient(#000 75%, transparent)' } }, o.text),
		o.hashtags.length ? h('div', { style: { fontSize: 10, color: 'var(--kp-link)' } }, o.hashtags.join(' ')) : null,
		o.why ? h('div', { style: { fontSize: 10, color: DIM, lineHeight: 1.4 } }, o.why) : null,
	)
}

const PlatformCopy = (props: { k: PlatformKey } & CopyProps) => {
	const { k, plan, setPlat, copy, rules, accounts } = props
	const p = plan.platforms[k]
	const s = SPEC[k]
	const lim = limitsFor(k, rules, !!p.opts.premium)
	const options = copy?.platforms[k]?.options ?? []
	const [feedback, setFeedback] = useState('')
	const [askMore, setAskMore] = useState(false)
	const r = rules?.platforms?.[k]
	const nTags = hashtagList(p.hashtags).length
	const set = (patch: Partial<PlatPlan>) => setPlat(k, x => ({ ...x, ...patch }))
	const checks = platformChecks(k, plan, accounts, rules, true).filter(c => !/video|account|TikTok|time|date/i.test(c.text))
	return h(
		Card,
		{ accent: s.color },
		h(PlatformHead, {
			k,
			account: accountFor(k, p, accounts),
			right: h('div', { style: { display: 'flex', gap: 6 } }, h(Btn, { label: askMore ? 'Cancel' : 'New options', title: 'Ask the agent for 3 new options for this platform', onClick: () => setAskMore(!askMore), disabled: props.busy })),
		}),
		askMore
			? h(
					'div',
					{ style: { display: 'flex', gap: 6 } },
					h('div', { style: { flex: 1 } }, h(TextIn, { value: feedback, onChange: setFeedback, placeholder: 'What should change? e.g. "less salesy, lead with the admin panel"' })),
					h(Btn, {
						label: 'Send',
						primary: true,
						disabled: props.busy,
						onClick: () => {
							props.onGenerate([k], feedback || 'Different angles from the ones shown.')
							setAskMore(false)
							setFeedback('')
						},
					}),
				)
			: null,
		options.length
			? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 } }, ...options.map(o => h(OptionCard, { key: o.id, o, k, picked: p.pick === o.id, onPick: () => setPlat(k, x => ({ ...x, pick: o.id, title: o.title ?? x.title, text: o.text, hashtags: o.hashtags.join(' '), tags: (o.tags ?? []).join(', '), firstComment: o.firstComment ?? '', thread: o.thread ?? [] })) })))
			: h('div', { style: { fontSize: 11, color: DIM } }, 'No options yet. Generate them above, or write your own below.'),
		copy?.platforms[k]?.notes ? h('div', { style: { fontSize: 11, color: DIM, lineHeight: 1.45 } }, copy.platforms[k]!.notes) : null,
		h(
			'div',
			{ style: { display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${LINE}`, paddingTop: 8 } },
			s.title
				? h(Field, { label: k === 'facebook' ? 'Reel title' : 'Title', hint: k === 'facebook' ? 'used for Reels only' : undefined }, h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } }, h('div', { style: { flex: 1 } }, h(TextIn, { value: p.title, onChange: v => set({ title: v }) })), h(Counter, { n: chars(p.title), max: lim.title, warnAt: k === 'youtube' ? 70 : undefined })))
				: null,
			h(
				Field,
				{ label: k === 'youtube' ? 'Description' : 'Caption', hint: lim.foldChars ? `first ${lim.foldChars} chars show before "more"` : undefined },
				h(TextArea, { value: p.text, onChange: v => set({ text: v }), rows: k === 'youtube' ? 8 : 5 }),
				h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, h('span', { style: { fontSize: 10, color: DIM } }, 'Counts the hashtags too'), h(Counter, { n: chars(finalText(p)), max: lim.text, warnAt: lim.text * 0.9 })),
			),
			h(
				Grid,
				{ cols: k === 'youtube' ? 2 : 1 },
				h(
					Field,
					{ label: 'Hashtags', hint: r?.hashtags?.recommended ? `${r.hashtags.recommended[0]} to ${r.hashtags.recommended[1]} works best` : undefined },
					h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } }, h('div', { style: { flex: 1 } }, h(TextIn, { value: p.hashtags, onChange: v => set({ hashtags: v }), placeholder: '#OblivionRemastered #OBMP' })), h(Counter, { n: nTags, max: lim.hashtagsMax })),
				),
				k === 'youtube'
					? h(Field, { label: 'Tags', hint: 'comma separated' }, h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } }, h('div', { style: { flex: 1 } }, h(TextIn, { value: p.tags, onChange: v => set({ tags: v }) })), h(Counter, { n: tagList(p.tags).join(',').length, max: 500 })))
					: null,
			),
			s.firstComment ? h(Field, { label: 'First comment', hint: 'posted right after publishing' }, h(TextArea, { value: p.firstComment, onChange: v => set({ firstComment: v }), rows: 2 })) : null,
			s.thread
				? h(
						Field,
						{ label: 'Thread', hint: 'follow-up posts, one per box' },
						...p.thread.map((t, i) =>
							h(
								'div',
								{ key: i, style: { display: 'flex', gap: 6, alignItems: 'flex-start' } },
								h('div', { style: { flex: 1 } }, h(TextArea, { value: t, onChange: v => set({ thread: p.thread.map((x, j) => (j === i ? v : x)) }), rows: 2 })),
								h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' } }, h(Counter, { n: chars(t), max: lim.text }), h(Btn, { label: 'Remove', onClick: () => set({ thread: p.thread.filter((_, j) => j !== i) }) })),
							),
						),
						h('div', null, h(Btn, { label: 'Add post', onClick: () => set({ thread: [...p.thread, ''] }) })),
					)
				: null,
			k === 'twitter' ? h(Toggle, { value: !!p.opts.premium, onChange: v => set({ opts: { ...p.opts, premium: v } }), label: 'X Premium account (25,000 char posts)' }) : null,
			h(CheckList, { checks }),
		),
	)
}

export const CopyTab = (props: CopyProps) => {
	const { plan, setPlat, setParams } = props
	const [showParams, setShowParams] = useState(true)
	const P = plan.params
	const setP = (patch: Partial<Plan['params']>) => setParams(x => ({ ...x, ...patch }))
	const on = PLATFORM_KEYS.filter(k => plan.platforms[k].on)
	const pending = plan.pendingRequest
	const arrived = pending && props.copy?.requestId === pending.requestId
	return h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 14 } },
		h(
			Section,
			{ title: 'Platforms' },
			h(
				'div',
				{ style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
				...PLATFORM_KEYS.map(k => {
					const connected = props.accounts.some(a => a.platform === k)
					return h(Chip, { key: k, on: plan.platforms[k].on, text: SPEC[k].label, color: SPEC[k].color, title: connected ? 'Connected in Zernio' : 'Not connected in Zernio yet (Settings)', onClick: () => setPlat(k, p => ({ ...p, on: !p.on })) })
				}),
			),
		),
		h(
			Section,
			{ title: 'Parameters', right: h(Btn, { label: showParams ? 'Hide' : 'Show', onClick: () => setShowParams(!showParams) }) },
			showParams
				? h(
						Grid,
						{ cols: 2 },
						h(Field, { label: 'Tone' }, h(Segmented, { value: P.tone, options: opts({ plain: 'Plain', hype: 'Hype', 'dry-funny': 'Dry', technical: 'Tech' }), onChange: v => setP({ tone: v as any }) })),
						h(Field, { label: 'Length' }, h(Segmented, { value: P.length, options: opts({ short: 'Short', medium: 'Medium', long: 'Long' }), onChange: v => setP({ length: v as any }) })),
						h(Field, { label: 'Call to action' }, h(Select, { value: P.cta, options: opts({ none: 'None', watch: 'Watch the video', comment: 'Ask for comments', follow: 'Follow', link: 'Visit a link', discord: 'Join the Discord' }), onChange: v => setP({ cta: v as any }) })),
						h(Field, { label: 'Link', hint: 'for the CTA' }, h(TextIn, { value: P.link, onChange: v => setP({ link: v }), placeholder: 'https://discord.gg/...' })),
						h(Field, { label: 'Emoji' }, h(Segmented, { value: P.emoji, options: opts({ none: 'None', light: 'Light', some: 'Some' }), onChange: v => setP({ emoji: v as any }) })),
						h(Field, { label: 'Language' }, h(Select, { value: P.language, options: LANGUAGES, onChange: v => setP({ language: v }) })),
						h(Field, { label: 'Hashtags per post' }, h(Range, { value: P.hashtags, min: 0, max: 10, step: 1, onChange: v => setP({ hashtags: v }) })),
						h(Field, { label: 'Humanize', hint: '0 tidy, 3 very casual' }, h(Range, { value: P.humanize, min: 0, max: 3, step: 1, onChange: v => setP({ humanize: v }) })),
						h(Field, { label: 'Search keywords', hint: 'comma separated', wide: true }, h(TextIn, { value: P.keywords, onChange: v => setP({ keywords: v }), placeholder: 'oblivion remastered multiplayer, dedicated server, host server' })),
						h(Field, { label: 'Audience', wide: true }, h(TextIn, { value: P.audience, onChange: v => setP({ audience: v }) })),
						h(Field, { label: 'Notes for the writer', wide: true }, h(TextArea, { value: P.notes, onChange: v => setP({ notes: v }), rows: 2, placeholder: 'Anything to stress or avoid, e.g. "mention the free beta keys", "no price talk"' })),
					)
				: null,
		),
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
			h(Btn, {
				label: props.busy ? 'Sending...' : props.canPrompt ? `Generate 3 options for ${on.length} platform${on.length === 1 ? '' : 's'}` : 'Copy prompt and open a chat',
				primary: true,
				disabled: props.busy || !on.length,
				onClick: () => props.onGenerate(on),
			}),
			plan.chatId ? h(Btn, { label: 'Open chat', title: 'The chat the panel sends copy requests to', onClick: props.onOpenChat }) : null,
			pending
				? h('span', { style: { fontSize: 11, color: arrived ? GREEN : AMBER, display: 'inline-flex', alignItems: 'center', gap: 6 } }, h(Dot, { color: arrived ? GREEN : AMBER }), arrived ? 'New options arrived.' : `Waiting for the agent (${pending.platforms.map(k => SPEC[k].label).join(', ')})...`, h(Btn, { label: 'Dismiss', onClick: props.onDismissPending }))
				: h('span', { style: { fontSize: 11, color: DIM } }, 'The agent writes with the house post-copy skill and your transcript.'),
		),
		...on.map(k => h(PlatformCopy, { key: k, k, ...props })),
	)
}

// ---------- Schedule tab ----------
type ScheduleProps = {
	plan: Plan
	setPlat: (k: PlatformKey, fn: (p: PlatPlan) => PlatPlan) => void
	setPlan: (fn: (p: Plan) => Plan) => void
	accounts: Account[]
	covers: Cover[]
	probes: Record<string, ProbeState>
	deliveries: Record<PlatformKey, Delivery>
	playlists: { id: string; title: string; privacy?: string }[]
	tiktokInfo: any
	tiktokConsent: boolean
	setTiktokConsent: (v: boolean) => void
	rules: Rules | null
	onRefreshCovers: () => void
	onConnect: (k: PlatformKey) => void
}

const ZONES = (() => {
	try {
		return (Intl as any).supportedValuesOf('timeZone') as string[]
	} catch {
		return ['UTC', 'Europe/London', 'Europe/Warsaw', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo']
	}
})()

const VideoSlot = (props: { title: string; hint: string; id: string; path: string; onId: (id: string) => void; onPath: (path: string) => void }) => {
	const [open, setOpen] = useState(false)
	const [typing, setTyping] = useState(false)
	return h(
		Field,
		{ label: props.title, hint: props.hint, wide: true },
		h(
			'div',
			{ style: { display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 } },
			h(
				'div',
				{ style: { ...input, display: 'flex', alignItems: 'center', color: props.id || props.path ? TEXT : DIM, flex: 1, minWidth: 0, overflow: 'hidden' } },
				props.id ? h(MediaName, { id: props.id }) : props.path ? h('span', { title: props.path, style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl' } }, props.path) : 'None',
			),
			h(Btn, { label: 'Library', onClick: () => setOpen(true) }),
			h(Btn, { label: 'File path', onClick: () => setTyping(!typing) }),
			props.id || props.path
				? h(Btn, {
						label: 'Clear',
						onClick: () => {
							props.onId('')
							props.onPath('')
						},
					})
				: null,
		),
		typing
			? h(TextIn, {
					value: props.path,
					onChange: v => {
						props.onId('')
						props.onPath(v.trim())
					},
					placeholder: EXAMPLE_VIDEO_PATH,
				})
			: null,
		open
			? h(PickerSheet, {
					title: props.title,
					value: props.id,
					onPick: id => {
						props.onPath('')
						props.onId(id)
						setOpen(false)
					},
					onClose: () => setOpen(false),
				})
			: null,
	)
}

// Only covers of the right shape are offered; a wrong pick stays visible (dimmed, red) until it is replaced
const CoverRow = (props: { title: string; shape: Shape; value: string; covers: Cover[]; onPick: (file: string) => void }) => {
	const vertical = props.shape === '916'
	const name = SHAPE_LABEL[props.shape]
	const list = props.covers.filter(c => shapeOf(c.w, c.h) === props.shape).sort((a, b) => b.mtime - a.mtime)
	const picked = props.value && props.value !== 'none' ? props.covers.find(c => c.file === props.value) : undefined
	const wrong = picked && shapeOf(picked.w, picked.h) !== props.shape ? picked : undefined
	const auto = newestCover(props.covers, props.shape)
	const hint = wrong
		? `picked one is ${wrong.w}x${wrong.h} (${ratioText(wrong.w, wrong.h)}), not ${name}: pick another`
		: !list.length
			? `no ${name} export yet: save one in Thumbnails`
			: !props.value
				? `Auto: newest, ${auto?.title || auto?.name}`
				: props.value === 'none'
					? 'none: platforms pick a frame'
					: undefined
	const tile = (text: string, value: string, title: string) =>
		h('button', { key: value || 'auto', title, onClick: () => props.onPick(value), style: { flex: 'none', width: vertical ? 46 : 96, height: vertical ? 82 : 54, borderRadius: 5, border: `1px solid ${props.value === value ? 'rgba(255,138,31,.8)' : 'rgba(var(--kp-ink),.12)'}`, background: 'rgba(0,0,0,.3)', color: DIM, fontSize: 10, cursor: 'pointer' } }, text)
	return h(
		Field,
		{ label: props.title, wide: true, hint },
		h(
			'div',
			{ style: { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }, className: 'kino-thumbs-scroll' },
			tile('Auto', '', `Newest ${name} export from the Thumbnails panel`),
			tile('None', 'none', 'No cover: each platform picks a frame'),
			...[...(wrong ? [wrong] : []), ...list].map(c =>
				h('img', {
					key: c.file,
					src: c.url,
					title: `${c.title ?? c.name} (${c.w}x${c.h})`,
					onClick: () => props.onPick(c.file),
					style: { flex: 'none', height: vertical ? 82 : 54, aspectRatio: `${c.w} / ${c.h}`, objectFit: 'cover', borderRadius: 5, cursor: 'pointer', background: '#000', opacity: c === wrong ? 0.45 : 1, outline: props.value === c.file ? `2px solid ${c === wrong ? RED : '#ff8a1f'}` : '1px solid rgba(var(--kp-ink),.12)', outlineOffset: -1 },
				}),
			),
		),
	)
}

const PlatformOptions = ({ k, p, set, props }: { k: PlatformKey; p: PlatPlan; set: (o: Record<string, any>) => void; props: ScheduleProps }) => {
	const o = p.opts
	switch (k) {
		case 'youtube':
			return h(
				Grid,
				{ cols: 2 },
				h(Field, { label: 'Visibility' }, h(Segmented, { value: o.visibility, options: opts({ public: 'Public', unlisted: 'Unlisted', private: 'Private' }), onChange: v => set({ visibility: v }) })),
				h(Field, { label: 'Playlist' }, h(Select, { value: o.playlistId || '', options: [{ value: '', label: 'None' }, ...props.playlists.map(x => ({ value: x.id, label: x.title }))], onChange: v => set({ playlistId: v }) })),
				h(Field, { label: 'Category' }, h(Select, { value: String(o.categoryId), options: opts({ '20': 'Gaming', '28': 'Science & Technology', '27': 'Education', '24': 'Entertainment', '22': 'People & Blogs' }), onChange: v => set({ categoryId: v }) })),
				h('div', { style: { display: 'flex', flexDirection: 'column' } }, h(Toggle, { value: !!o.notifySubscribers, onChange: v => set({ notifySubscribers: v }), label: 'Notify subscribers' }), h(Toggle, { value: !!o.madeForKids, onChange: v => set({ madeForKids: v }), label: 'Made for kids' }), h(Toggle, { value: !!o.containsSyntheticMedia, onChange: v => set({ containsSyntheticMedia: v }), label: 'Realistic AI-made content' })),
			)
		case 'tiktok': {
			const info = props.tiktokInfo
			const levels: { value: string; label: string }[] = info?.privacyLevels ?? []
			const inter = info?.postingLimits?.interactionSettings ?? {}
			const off = (name: string) => inter[name] && inter[name].enabled === false
			return h(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
				h(
					Grid,
					{ cols: 2 },
					h(Field, { label: 'Who can view', hint: info ? undefined : 'loads from TikTok once connected' }, h(Select, { value: o.privacyLevel || '', options: [{ value: '', label: 'Choose...' }, ...levels.map(l => ({ value: l.value, label: l.label }))], onChange: v => set({ privacyLevel: v }) })),
					h(Field, { label: 'Disclosure' }, h(Select, { value: o.commercialContentType || 'none', options: [{ value: 'none', label: 'Not promotional' }, ...((info?.commercialContentTypes ?? [{ value: 'brand_organic', label: 'Your brand' }, { value: 'brand_content', label: 'Branded content' }]) as any[]).filter(c => c.value !== 'none').map(c => ({ value: c.value, label: c.label }))], onChange: v => set({ commercialContentType: v }) })),
				),
				h(
					'div',
					{ style: { display: 'flex', flexWrap: 'wrap', gap: '0 14px' } },
					h(Toggle, { value: !!o.allowComment && !off('allow_comment'), onChange: v => set({ allowComment: v }), label: off('allow_comment') ? 'Comments (off in TikTok)' : 'Allow comments' }),
					h(Toggle, { value: !!o.allowDuet && !off('allow_duet'), onChange: v => set({ allowDuet: v }), label: off('allow_duet') ? 'Duet (off in TikTok)' : 'Allow Duet' }),
					h(Toggle, { value: !!o.allowStitch && !off('allow_stitch'), onChange: v => set({ allowStitch: v }), label: off('allow_stitch') ? 'Stitch (off in TikTok)' : 'Allow Stitch' }),
					h(Toggle, { value: !!o.videoMadeWithAi, onChange: v => set({ videoMadeWithAi: v }), label: 'AI-generated' }),
					h(Toggle, { value: !!o.inboxDraft, onChange: v => set({ inboxDraft: v }), label: 'Send to TikTok inbox to finish in the app' }),
				),
				info?.creator?.canPostMore === false ? h('div', { style: { fontSize: 11, color: AMBER } }, 'TikTok says this account cannot post more right now.') : null,
				h(
					'label',
					{ style: { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 11, lineHeight: 1.45, color: TEXT, padding: 8, borderRadius: 6, background: 'rgba(37,244,238,.06)', border: '1px solid rgba(37,244,238,.25)', cursor: 'pointer' } },
					h('input', { type: 'checkbox', checked: props.tiktokConsent, onChange: (e: any) => props.setTiktokConsent(e.target.checked), style: { accentColor: EMBER, marginTop: 2 } }),
					h('span', null, "I previewed this video and caption and agree to publish it to TikTok under TikTok's Music Usage Confirmation", o.commercialContentType === 'brand_content' ? ' and Branded Content Policy' : '', '. Asked again for every post.'),
				),
			)
		}
		case 'instagram':
			return h(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
				h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '0 14px' } }, h(Toggle, { value: !!o.shareToFeed, onChange: v => set({ shareToFeed: v }), label: 'Reel also on the main grid' }), h(Toggle, { value: !!o.isAiGenerated, onChange: v => set({ isAiGenerated: v }), label: 'AI-generated media' })),
				h(Field, { label: 'Collaborators', hint: 'up to 3 usernames' }, h(TextIn, { value: o.collaborators || '', onChange: v => set({ collaborators: v }), placeholder: '@partner' })),
			)
		case 'facebook':
			return h('div', { style: { display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' } }, h(Field, { label: 'Post as' }, h(Segmented, { value: o.contentType, options: opts({ feed: 'Feed video', reel: 'Reel' }), onChange: v => set({ contentType: v }) })), h(Toggle, { value: !!o.isAiGenerated, onChange: v => set({ isAiGenerated: v }), label: 'AI-generated media' }))
		case 'twitter':
			return h('div', { style: { display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' } }, h(Field, { label: 'Who can reply' }, h(Select, { value: o.replySettings || '', options: opts({ '': 'Everyone', following: 'People you follow', mentionedUsers: 'Only mentioned', verified: 'Verified accounts' }), onChange: v => set({ replySettings: v }) })), h(Toggle, { value: !!o.madeWithAi, onChange: v => set({ madeWithAi: v }), label: 'AI-generated media' }))
		case 'threads':
			return h(Field, { label: 'Topic tag', hint: 'one topic, no dots or ampersands' }, h(TextIn, { value: o.topic_tag || '', onChange: v => set({ topic_tag: v }), placeholder: 'Gaming' }))
		default:
			return null
	}
}

export const ScheduleTab = (props: ScheduleProps) => {
	const { plan, setPlat, setPlan, accounts } = props
	const on = PLATFORM_KEYS.filter(k => plan.platforms[k].on)
	const setMedia = (patch: Partial<Plan['media']>) => setPlan(x => ({ ...x, media: { ...x.media, ...patch } }))
	return h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 14 } },
		h(
			Section,
			{ title: 'Media', right: h(Btn, { label: 'Refresh covers', onClick: props.onRefreshCovers }) },
			h(
				Grid,
				{ cols: 2 },
				h(VideoSlot, { title: 'Main video', hint: probeOf(props, plan.media.main, plan.media.mainPath) || '16:9 master, sent as is to YouTube, Facebook, LinkedIn', id: plan.media.main, path: plan.media.mainPath, onId: id => setMedia({ main: id }), onPath: v => setMedia({ mainPath: v }) }),
				h(VideoSlot, { title: 'Vertical video', hint: probeOf(props, plan.media.vertical, plan.media.verticalPath) || 'optional 9:16 cut; without it the panel renders one', id: plan.media.vertical, path: plan.media.verticalPath, onId: id => setMedia({ vertical: id }), onPath: v => setMedia({ verticalPath: v }) }),
				h(CoverRow, { title: 'Cover 16:9 (YouTube, Facebook, LinkedIn)', shape: '169', value: plan.media.cover169, covers: props.covers, onPick: f => setMedia({ cover169: f }) }),
				h(CoverRow, { title: 'Cover 9:16 (Reels, TikTok, Shorts)', shape: '916', value: plan.media.cover916, covers: props.covers, onPick: f => setMedia({ cover916: f }) }),
			),
			h('div', { style: { fontSize: 11, color: DIM, lineHeight: 1.45 } }, 'Each platform gets the shape it shows best: vertical platforms get the 9:16 cut (or a 9:16 render of the main video with a blurred fill), X and Bluesky get a 720p copy when the original is too big. Renders and uploads happen only when you post. Covers come from the Thumbnails panel exports and must match the video shape.'),
		),
		h(
			Section,
			{ title: 'Timezone' },
			h(
				'div',
				{ style: { display: 'flex', gap: 8, alignItems: 'center' } },
				h('div', { style: { width: 240 } }, h(Select, { value: plan.timezone, options: (ZONES.includes(plan.timezone) ? ZONES : [plan.timezone, ...ZONES]).map(z => ({ value: z, label: z.replace(/_/g, ' ') })), onChange: v => setPlan(x => ({ ...x, timezone: v })) })),
				h('span', { style: { fontSize: 11, color: DIM } }, 'Scheduled times below are wall-clock times in this zone.'),
			),
		),
		on.length ? null : h('div', { style: { fontSize: 12, color: DIM } }, 'Turn on platforms in the Copy tab first.'),
		...on.map(k => {
			const p = plan.platforms[k]
			const list = accounts.filter(a => a.platform === k)
			const account = accountFor(k, p, accounts)
			const set = (patch: Partial<PlatPlan>) => setPlat(k, x => ({ ...x, ...patch }))
			const t = p.when === 'schedule' && p.at ? zonedToUtc(p.at, plan.timezone) : NaN
			return h(
				Card,
				{ key: k, accent: SPEC[k].color },
				h(PlatformHead, { k, right: list.length ? null : h(Btn, { label: `Connect ${SPEC[k].label}`, onClick: () => props.onConnect(k) }) }),
				h(
					Grid,
					{ cols: 2 },
					h(Field, { label: 'Account' }, list.length ? h(Select, { value: account?.id ?? '', options: list.map(a => ({ value: a.id, label: `@${a.username ?? a.displayName ?? a.id}${a.needsReconnection ? ' (reconnect)' : ''}` })), onChange: v => set({ accountId: v }) }) : h('div', { style: { ...input, display: 'flex', alignItems: 'center', color: DIM } }, 'Not connected')),
					h(Field, { label: 'Video' }, VERTICAL_ONLY.includes(k) ? h('div', { style: { ...input, display: 'flex', alignItems: 'center', color: DIM }, title: `${SPEC[k].label} is a vertical feed, so it always gets 9:16` }, 'Vertical 9:16') : h(Segmented, { value: p.video, options: opts({ main: 'Main 16:9', vertical: 'Vertical 9:16' }), onChange: v => set({ video: v as any }) })),
					h(Field, { label: 'When' }, h(Segmented, { value: p.when, options: [{ value: 'draft', label: 'Draft', title: 'Saved in Zernio, nothing goes to the platform' }, { value: 'schedule', label: 'Schedule' }, { value: 'now', label: 'Now' }], onChange: v => set({ when: v as When, at: v === 'schedule' && !p.at ? defaultAt() : p.at }) })),
					p.when === 'schedule'
						? h(
								Field,
								{ label: 'Date and time', hint: Number.isNaN(t) ? undefined : fmtWhen(new Date(t).toISOString()) + ' your time' },
								h('input', { type: 'datetime-local', value: p.at, onChange: (e: any) => set({ at: e.target.value }), style: { ...input, colorScheme: 'var(--kp-scheme)' } }),
							)
						: h('div', { style: { fontSize: 11, color: DIM, paddingBottom: 6 } }, p.when === 'draft' ? 'Saved as a Zernio draft. Nothing is sent to the platform.' : 'Publishes when you confirm on the Post tab.'),
				),
				h('div', { style: { fontSize: 11, color: DIM } }, props.deliveries[k]?.line),
				h(PlatformOptions, { k, p, set: o => set({ opts: { ...p.opts, ...o } }), props }),
			)
		}),
	)
}
const probeOf = (props: ScheduleProps, id: string, path: string) => probeText(props.probes[id ? `m:${id}` : `p:${path}`])
const defaultAt = () => {
	const d = new Date(Date.now() + 26 * 3600_000)
	d.setHours(17, 0, 0, 0)
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`
}

// ---------- Post tab ----------
export type Progress = { label: string; bytes: number; total: number; state: string }
type PostProps = {
	plan: Plan
	accounts: Account[]
	rules: Rules | null
	tiktokConsent: boolean
	busy: boolean
	progress: Progress[]
	deliveries: Record<PlatformKey, Delivery>
	validation: { level: Level; text: string }[] | null
	posts: any[]
	loadingPosts: boolean
	onValidate: () => void
	onPost: () => void
	onRefreshPosts: () => void
	onRetry: (id: string) => void
	onDelete: (id: string) => void
	onSetThumb: (postId: string, accountId?: string) => void
}

const STATUS_COLOR: Record<string, string> = { published: GREEN, scheduled: 'var(--kp-blue)', draft: DIM, publishing: AMBER, partial: AMBER, failed: RED, cancelled: DIM, pending_approval: AMBER }

export const PostTab = (props: PostProps) => {
	const { plan, accounts, rules } = props
	const on = PLATFORM_KEYS.filter(k => plan.platforms[k].on)
	const all = on.map(k => ({ k, checks: platformChecks(k, plan, accounts, rules, props.tiktokConsent, props.deliveries[k]) }))
	const blocked = all.filter(x => x.checks.some(c => c.level === 'fail'))
	const modes = new Set(on.map(k => plan.platforms[k].when))
	const verb = modes.has('now') ? 'Publish' : modes.has('schedule') ? 'Schedule' : 'Save drafts'
	return h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 14 } },
		h(
			Section,
			{ title: 'Ready to go?' },
			on.length ? null : h('div', { style: { fontSize: 12, color: DIM } }, 'No platforms on. Turn them on in the Copy tab.'),
			...all.map(({ k, checks }) => {
				const p = plan.platforms[k]
				const account = accountFor(k, p, accounts)
				return h(
					Card,
					{ key: k, accent: SPEC[k].color, style: { gap: 6 } },
					h(PlatformHead, {
						k,
						account,
						right: h('span', { style: { fontSize: 11, color: DIM } }, p.when === 'now' ? 'Now' : p.when === 'draft' ? 'Zernio draft' : p.at ? `${p.at.replace('T', ' ')} ${plan.timezone}` : 'Schedule: no time'),
					}),
					p.title ? h('div', { style: { fontSize: 12, fontWeight: 600 } }, p.title) : null,
					p.text ? h('div', { style: { fontSize: 11, color: 'rgba(var(--kp-ink),.7)', whiteSpace: 'pre-wrap', maxHeight: 48, overflow: 'hidden' } }, finalText(p)) : null,
					h('div', { style: { fontSize: 11, color: DIM } }, props.deliveries[k]?.line),
					h(CheckList, { checks }),
				)
			}),
		),
		h(
			'div',
			{ style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
			h(Btn, { label: 'Check with Zernio', title: 'Dry run of the full validation. Nothing is posted.', onClick: props.onValidate, disabled: props.busy || !on.length }),
			h(Btn, { label: props.busy ? 'Working...' : `${verb} ${on.length} platform${on.length === 1 ? '' : 's'}...`, primary: true, onClick: props.onPost, disabled: props.busy || !on.length || blocked.length > 0 }),
			blocked.length ? h('span', { style: { fontSize: 11, color: RED } }, `Fix ${blocked.map(x => SPEC[x.k].label).join(', ')} first.`) : h('span', { style: { fontSize: 11, color: DIM } }, 'You confirm everything in a summary before anything goes out.'),
		),
		props.validation
			? h(
					Card,
					null,
					h('span', { style: label }, 'Zernio check'),
					props.validation.length ? h(CheckList, { checks: props.validation }) : h('span', { style: { fontSize: 11, color: GREEN } }, 'No problems found.'),
				)
			: null,
		props.progress.length
			? h(
					Card,
					null,
					h('span', { style: label }, 'Renders and uploads'),
					...props.progress.map((u, i) =>
						h(
							'div',
							{ key: i, style: { display: 'flex', flexDirection: 'column', gap: 3 } },
							h('div', { style: { display: 'flex', fontSize: 11, gap: 8 } }, h('span', { style: { flex: 1 } }, u.label), h('span', { style: { fontFamily: MONO, color: u.state === 'error' ? RED : u.state === 'done' ? GREEN : DIM } }, (u.state === 'uploading' || u.state === 'rendering') && u.total ? `${u.state === 'rendering' ? 'rendering ' : ''}${Math.round((u.bytes / u.total) * 100)}%` : u.state)),
							h('div', { style: { height: 3, borderRadius: 2, background: 'rgba(var(--kp-ink),.08)', overflow: 'hidden' } }, h('div', { style: { height: '100%', width: `${u.total ? Math.min(100, (u.bytes / u.total) * 100) : u.state === 'done' ? 100 : 0}%`, background: u.state === 'error' ? RED : EMBER } })),
						),
					),
				)
			: null,
		h(
			Section,
			{ title: 'Recent Zernio posts', right: h(Btn, { label: props.loadingPosts ? 'Loading...' : 'Refresh', onClick: props.onRefreshPosts, disabled: props.loadingPosts }) },
			props.posts.length ? null : h('div', { style: { fontSize: 11, color: DIM } }, 'Nothing posted through Zernio yet.'),
			...props.posts.map(post =>
				h(
					Card,
					{ key: post._id, style: { gap: 5 } },
					h(
						'div',
						{ style: { display: 'flex', alignItems: 'center', gap: 8 } },
						h(Dot, { color: STATUS_COLOR[post.status] ?? DIM }),
						h('span', { style: { fontSize: 11, fontWeight: 600 } }, post.status),
						h('span', { style: { fontSize: 11, color: DIM, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, post.title || (post.content ?? '').slice(0, 80)),
						h('span', { style: { fontSize: 10, color: DIM } }, fmtWhen(post.scheduledFor ?? post.createdAt, post.timezone)),
						post.status === 'failed' || post.status === 'partial' ? h(Btn, { label: 'Retry', onClick: () => props.onRetry(post._id), disabled: props.busy }) : null,
						post.status !== 'published' && post.status !== 'publishing' && post.status !== 'partial' ? h(Btn, { label: 'Delete', onClick: () => props.onDelete(post._id), disabled: props.busy }) : null,
					),
					...(post.platforms ?? []).map((pl: any, i: number) =>
						h(
							'div',
							{ key: i, style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, paddingLeft: 15 } },
							h(Dot, { color: SPEC[pl.platform as PlatformKey]?.color ?? DIM }),
							h('span', { style: { width: 70 } }, SPEC[pl.platform as PlatformKey]?.label ?? pl.platform),
							h('span', { style: { color: STATUS_COLOR[pl.status] ?? DIM, width: 70 } }, pl.status ?? ''),
							pl.platformPostUrl ? h('a', { href: pl.platformPostUrl, target: '_blank', rel: 'noreferrer', className: 'kino-thumbs-link' }, 'Open') : null,
							pl.platform === 'youtube' && pl.platformPostId ? h(Btn, { label: 'Set thumbnail', title: 'Upload the YouTube cover picked in the Schedule tab and set it on this video', onClick: () => props.onSetThumb(post._id, typeof pl.accountId === 'string' ? pl.accountId : pl.accountId?._id), disabled: props.busy }) : null,
							pl.errorMessage ? h('span', { style: { color: RED, flex: 1, minWidth: 0 } }, pl.errorMessage) : null,
						),
					),
				),
			),
		),
	)
}

// ---------- confirmation ----------
export type Outgoing = { mode: When; keys: PlatformKey[]; payload: Record<string, any> }
export const ConfirmDialog = (props: { posts: Outgoing[]; plan: Plan; accounts: Account[]; sources: Source[]; deliveries: Record<PlatformKey, Delivery>; busy: boolean; onConfirm: () => void; onClose: () => void }) => {
	const { posts, plan, accounts } = props
	const [ok, setOk] = useState(false)
	const live = posts.some(p => p.mode !== 'draft')
	return h(
		'div',
		{ onClick: props.onClose, style: { position: 'fixed', inset: 0, zIndex: 60, background: 'var(--kp-scrim)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 14px', overflow: 'auto' } },
		h(
			'div',
			{ onClick: (e: any) => e.stopPropagation(), style: { width: '100%', maxWidth: 560, background: BG, border: `1px solid ${LINE}`, borderRadius: 10, boxShadow: '0 20px 60px var(--kp-shadow-lg)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 } },
			h('div', { style: { display: 'flex', alignItems: 'center' } }, h('span', { style: { fontWeight: 600, fontSize: 14 } }, live ? 'Confirm what goes out' : 'Confirm the drafts'), h('div', { style: { flex: 1 } }), h(Btn, { label: 'Cancel', onClick: props.onClose })),
			h('div', { style: { fontSize: 11, color: DIM, lineHeight: 1.45 } }, `${props.sources.some(s => s.render) ? `Renders on ${MACHINE}: ${props.sources.filter(s => s.render).map(s => s.label).join(', ')}. ` : ''}Uploads: ${props.sources.map(s => s.label).join(', ') || 'nothing new'}. Then ${posts.length} Zernio post${posts.length > 1 ? 's' : ''}.`),
			...posts.flatMap(post =>
				post.keys.map(k => {
					const p = plan.platforms[k]
					const a = accountFor(k, p, accounts)
					const o = p.opts
					const vis = k === 'youtube' ? o.visibility : k === 'tiktok' ? o.privacyLevel || '?' : ''
					return h(
						Card,
						{ key: k, accent: SPEC[k].color, style: { gap: 5 } },
						h(PlatformHead, { k, account: a, right: h('span', { style: { fontSize: 11, color: post.mode === 'now' ? AMBER : DIM } }, post.mode === 'now' ? 'Publishes now' : post.mode === 'draft' ? 'Zernio draft only' : `${p.at.replace('T', ' ')} ${plan.timezone}`) }),
						vis ? h('div', { style: { fontSize: 11, color: DIM } }, `Visibility: ${vis}`) : null,
						h('div', { style: { fontSize: 11, color: DIM } }, props.deliveries[k]?.line),
						k === 'youtube' && post.mode !== 'draft' && props.deliveries[k]?.cover ? h('div', { style: { fontSize: 11, color: DIM } }, 'Then sets that cover as the YouTube thumbnail through Zernio, once YouTube has the video.') : null,
						p.title ? h('div', { style: { fontSize: 12, fontWeight: 600 } }, p.title) : null,
						h('div', { style: { fontSize: 11, color: 'rgba(var(--kp-ink),.8)', whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' } }, finalText(p)),
						p.firstComment && SPEC[k].firstComment ? h('div', { style: { fontSize: 11, color: DIM } }, `First comment: ${p.firstComment.slice(0, 140)}`) : null,
						p.thread.length && SPEC[k].thread ? h('div', { style: { fontSize: 11, color: DIM } }, `+ ${p.thread.length} thread post${p.thread.length > 1 ? 's' : ''}`) : null,
					)
				}),
			),
			live ? h(Toggle, { value: ok, onChange: setOk, label: 'I checked the copy, accounts and times above' }) : null,
			h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } }, h(Btn, { label: 'Cancel', onClick: props.onClose }), h(Btn, { label: props.busy ? 'Working...' : live ? 'Upload and post' : 'Upload and save drafts', primary: true, disabled: props.busy || (live && !ok), onClick: props.onConfirm })),
		),
	)
}

// ---------- Settings tab ----------
type SettingsProps = {
	keyState: string
	keyNote: string
	profiles: { id: string; name: string; timezone: string | null; isDefault: boolean }[]
	accounts: Account[]
	plan: Plan
	setPlan: (fn: (p: Plan) => Plan) => void
	busy: boolean
	usage: any
	onSaveKey: (key: string) => Promise<boolean>
	onRemoveKey: () => void
	onConnect: (k: PlatformKey) => void
	onRefresh: () => void
	onUsage: () => void
}

export const SettingsTab = (props: SettingsProps) => {
	const [key, setKey] = useState('')
	const { keyState } = props
	const keyText = keyState === 'ok' ? `Saved on ${MACHINE} and accepted by Zernio.` : keyState === 'invalid' ? `Zernio rejected the saved key${props.keyNote ? `: ${props.keyNote}` : ''}.` : keyState === 'none' ? `No key on ${MACHINE} yet.` : 'Checking...'
	return h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 16 } },
		h(
			Section,
			{ title: 'Zernio API key' },
			h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 } }, h(Dot, { color: keyState === 'ok' ? GREEN : keyState === 'unknown' ? DIM : RED }), keyText),
			h(
				'div',
				{ style: { display: 'flex', gap: 6 } },
				h('input', { type: 'password', value: key, autoComplete: 'off', placeholder: keyState === 'ok' ? 'Paste a new key to replace it' : 'sk_...', onChange: (e: any) => setKey(e.target.value), style: { ...input, flex: 1 } }),
				h(Btn, {
					label: 'Save key',
					primary: true,
					disabled: props.busy || !key.trim(),
					onClick: () =>
						props.onSaveKey(key.trim()).then(saved => {
							if (saved) setKey('')
						}),
				}),
				keyState !== 'none' ? h(Btn, { label: 'Remove', onClick: props.onRemoveKey, disabled: props.busy }) : null,
			),
			h('div', { style: { fontSize: 11, color: DIM, lineHeight: 1.45 } }, 'The key goes straight to the local bridge, which checks it with Zernio and keeps it in its own data folder (secrets/zernio.env, readable only by your user account). It never enters the project or this panel again. Create or rotate keys in the Zernio dashboard.'),
		),
		h(
			Section,
			{ title: 'Profile' },
			h(
				'div',
				{ style: { display: 'flex', gap: 8, alignItems: 'center' } },
				h('div', { style: { width: 240 } }, h(Select, { value: props.plan.profileId || props.profiles.find(p => p.isDefault)?.id || props.profiles[0]?.id || '', options: props.profiles.map(p => ({ value: p.id, label: p.name })), onChange: v => props.setPlan(x => ({ ...x, profileId: v })) })),
				h('span', { style: { fontSize: 11, color: DIM } }, 'New connections are added to this profile.'),
			),
		),
		h(
			Section,
			{ title: 'Connected accounts', right: h(Btn, { label: 'Refresh', onClick: props.onRefresh }) },
			...PLATFORM_KEYS.map(k => {
				const list = props.accounts.filter(a => a.platform === k)
				return h(
					'div',
					{ key: k, style: { display: 'flex', alignItems: 'center', gap: 8, minHeight: 26, borderBottom: `1px solid ${LINE}` } },
					h(Dot, { color: list.length ? SPEC[k].color : 'rgba(var(--kp-ink),.2)' }),
					h('span', { style: { width: 80, fontSize: 12 } }, SPEC[k].label),
					h('span', { style: { flex: 1, fontSize: 11, color: list.length ? TEXT : DIM } }, list.length ? list.map(a => `@${a.username ?? a.displayName}${a.needsReconnection ? ' (reconnect)' : ''}`).join(', ') : 'Not connected'),
					h(Btn, { label: list.length ? 'Add or reconnect' : 'Connect', onClick: () => props.onConnect(k), disabled: props.busy }),
				)
			}),
			h('div', { style: { fontSize: 11, color: DIM, lineHeight: 1.45 } }, 'Connect opens the platform sign-in in your browser. Approve it there, then press Refresh.'),
		),
		h(
			Section,
			{ title: 'Usage', right: h(Btn, { label: 'Load', onClick: props.onUsage }) },
			props.usage ? h('pre', { style: { margin: 0, fontFamily: MONO, fontSize: 10, color: DIM, whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' } }, JSON.stringify(props.usage, null, 2)) : h('div', { style: { fontSize: 11, color: DIM } }, 'Plan and post counts from Zernio.'),
		),
	)
}
