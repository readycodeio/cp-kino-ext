// Prompting the agent: the always-there prompt bar, the New set dialog, and the messages they send.
// The agent follows the skill in /thumbs/skill and writes /thumbs/designs.json; the panel picks the
// changes up through the project source and merges them with what is open.
import { createElement as h, useRef, useState } from 'react'
import { LAYOUTS, PRESETS, type Design, type LayoutId, type PresetId } from '../../thumbs/model'
import { BRAND_PATH, DESIGNS_PATH, fmtClock, type Check } from './lib'
import { BG, Btn, Chip, DIM, EMBER, LINE, Segmented, Select, TEXT, TextArea, TextIn, input, label } from './ui'
import { MOD_ENTER, modKey } from '../platform'

const SKILL_FILES = '/thumbs/skill/SKILL.md, /thumbs/skill/rules.json and /thumbs/skill/format.md'
const WHERE = 'They are project files: take the project folder (mountDir) from getCurrentKinoContext for this project.'
const BRAND = `Read the brand kit in ${BRAND_PATH} if it exists (format.md describes it). Its colors and fonts are the defaults, so leave color and font fields out unless a design needs something else, and use its named images by key.`
const ALL_PRESETS = Object.keys(PRESETS) as PresetId[]
// what a new set starts with: one per aspect ratio people post most
const SET_PRESETS: PresetId[] = ['youtube', 'vertical', 'instagram', 'x']
const presetList = (ids: PresetId[]) => ids.map(id => `${PRESETS[id].label} (${PRESETS[id].w}x${PRESETS[id].h}, preset "${id}")`).join('; ')
const titleLine = (videoTitle: string, seconds: number) => `Video title: ${videoTitle.trim() ? `"${videoTitle.trim()}"` : '(not set yet)'}${seconds > 0 ? `. Video length ${fmtClock(seconds)}.` : '.'}`
const designLine = (d: Design) => `- "${d.name}" (id ${d.id}, ${PRESETS[d.preset].label}${d.set ? `, set "${d.set}"` : ''})`

type NewAsk = { mode: 'set' | 'one'; brief: string; presets: PresetId[]; variations: number; set: string; videoTitle: string; seconds: number; projectId: string; current?: Design | null }

/** New designs: a whole set, or variations of one thumbnail. */
export const composeNew = (a: NewAsk) => {
	const n = a.variations * a.presets.length
	return [
		`Thumbnails panel request for project ${a.projectId}.`,
		'',
		a.mode === 'set'
			? `Make a new thumbnail set called "${a.set}": ${a.variations} variation${a.variations > 1 ? 's' : ''} for each of ${presetList(a.presets)}. ${n} design${n > 1 ? 's' : ''} in total.`
			: `Make ${a.variations} new thumbnail design${a.variations > 1 ? 's' : ''} for ${presetList(a.presets)}, in the set "${a.set}".`,
		`Brief: ${a.brief.trim()}`,
		titleLine(a.videoTitle, a.seconds),
		...(a.current ? [`The user had "${a.current.name}" (id ${a.current.id}) open when asking. Use it as context, do not change it.`] : []),
		'',
		'How:',
		`1. Read the thumbnail skill first: ${SKILL_FILES}. ${WHERE} The skill is the main guideline.`,
		`2. ${BRAND}`,
		`3. Append the new designs to ${DESIGNS_PATH} (version 2 format from format.md). Each needs a new unique id, "set" set to the set name above, and "prompt" set to the brief. Never delete, reorder or rewrite existing designs: the panel merges by id and the user may be editing them.`,
		'4. Backgrounds: a brand image key, or a library image id you checked with findMedia and lookAtFrames. Do not run paid generation unless the brief asks for it.',
		'5. Keep every word inside the platform safe area from format.md and rules.json. Vertical covers center on x 50.',
		'6. Variations must differ in idea (subject, promise or composition), not only in color or wording.',
		'7. Score each design against the rubric in rules.json and fix what fails. Then reply in 3 to 6 lines: what you made and why. Do not use em dashes.',
	].join('\n')
}

// one: the open design. picked: the designs ticked in the strip. set: every design of one set.
// all: the whole file. add: new designs for the open design's set.
export type Scope = 'one' | 'picked' | 'set' | 'all' | 'add'
type EditAsk = { scope: Scope; targets: Design[]; set: string; ask: string; videoTitle: string; seconds: number; projectId: string; flagged?: Check[]; context?: Design | null }

/** A request about designs that exist: change them in place, or add to their set. */
export const composeEdit = (a: EditAsk) => {
	const n = a.targets.length
	// long lists drop the names so the message stays well under the bridge's size limit
	const list = n > 40 ? [`Design ids: ${a.targets.map(d => d.id).join(', ')}`] : a.targets.map(designLine)
	const what =
		a.scope === 'add'
			? [
					`Add new designs to the set "${a.set}" in ${DESIGNS_PATH}: as many as the request asks for, otherwise one. Append them at the end, each with a new unique id, "set": "${a.set}" and "prompt" set to the request.`,
					...(a.context ? [`Start from "${a.context.name}" (id ${a.context.id}, ${PRESETS[a.context.preset].label}), which the user has open. Do not change it.`] : []),
					'Do not change, delete or reorder any existing design.',
				]
			: [
					`Change ${n === 1 ? 'this design' : `these ${n} designs`} in ${DESIGNS_PATH}, in place, keeping ${n === 1 ? 'its id' : 'every id'}:`,
					...list,
					a.scope === 'set' ? `That is every design in the set "${a.set}".` : a.scope === 'all' ? 'That is every design in the file.' : '',
					'Do not add, delete or reorder designs, and do not touch a design that is not listed.',
				].filter(Boolean)
	return [
		`Thumbnails panel request for project ${a.projectId}.`,
		'',
		...what,
		'',
		`What the user asked: ${a.ask.trim()}`,
		...(a.flagged?.length ? ['The panel checks flagged:', ...a.flagged.map(c => `- ${c.level.toUpperCase()} ${c.label}: ${c.detail}`)] : []),
		titleLine(a.videoTitle, a.seconds),
		'',
		'How:',
		`1. Read ${SKILL_FILES} first. ${WHERE}`,
		`2. ${BRAND}`,
		a.scope === 'add'
			? `3. Read the current ${DESIGNS_PATH} right before you write and keep everything in it as it is.`
			: `3. Read the current ${DESIGNS_PATH} right before you write. Inside the listed designs change only what the request needs, and keep the ids of elements you do not replace: the user may be editing the same file in the panel, which merges by design id and element id.`,
		'4. Keep the file valid JSON, indented with tabs, and write it in one pass. Keep every word inside the platform safe area from format.md.',
		`5. Reply in 2 to 5 lines: what you changed${a.scope === 'add' ? ' or added' : n > 1 ? ' in each design' : ''} and why. Do not use em dashes.`,
	].join('\n')
}

// Pull a chat id out of whatever chat::NewChat returned
export const findChatId = (value: unknown): string | null => {
	if (!value) return null
	if (typeof value === 'string') return /^[\w-]{6,}$/.test(value) ? value : null
	if (typeof value !== 'object') return null
	const o = value as Record<string, unknown>
	// Kino returns the id as a bare string under `result`: { actionId, ran, result: '<chatId>' }
	for (const key of ['chatId', 'conversationId', 'id', 'result']) if (typeof o[key] === 'string' && /^[\w-]{6,}$/.test(o[key] as string)) return o[key] as string
	for (const v of Object.values(o)) {
		const found = typeof v === 'object' ? findChatId(v) : null
		if (found) return found
	}
	return null
}

// ---------- prompt bar ----------
const QUICK: Record<'edit' | 'many' | 'add', string[]> = {
	edit: ['Shorter headline, four words at most', 'Make it read at sidebar size', 'Try a different background image', 'Bigger subject, smaller text', 'One accent word, nothing else in color'],
	many: ['Make these consistent: same font, treatment and accent', 'Fix every safe area and legibility problem', 'Tighten every headline to four words or fewer', 'Give each one a different background image'],
	add: ['Three variations that differ in idea, not color', 'A version with no words', 'A version led by a number', 'The same idea at every platform size'],
}

export type ScopeOption = { value: Scope; label: string; count: number; hint: string }
type BarProps = {
	scope: Scope
	setScope: (scope: Scope) => void
	options: ScopeOption[]
	canPrompt: boolean
	busy: boolean
	history: string[]
	onForget: (text: string | null) => void
	/** Resolves true when the request went out (or was copied), so the box can be cleared. */
	onSend: (ask: string) => Promise<boolean>
	onCopy: (ask: string) => void
	onNewSet: () => void
}

// Always on screen: who the request is about, what to ask, and one button to send it
export const PromptBar = (props: BarProps) => {
	const { scope, options, canPrompt, busy, history } = props
	const [text, setText] = useState('')
	const [open, setOpen] = useState(false)
	const [recent, setRecent] = useState(false)
	const box = useRef<HTMLTextAreaElement | null>(null)
	const current = options.find(o => o.value === scope) ?? options[0]
	const ready = text.trim().length > 2 && !busy && !!current && current.count > 0
	const chips = QUICK[scope === 'add' ? 'add' : scope === 'one' ? 'edit' : 'many']
	const send = () => {
		if (!ready) return
		props.onSend(text.trim()).then(ok => {
			if (ok) setText('')
		})
	}
	const use = (value: string, replace = false) => {
		setText(t => (replace || !t.trim() ? value : `${t.trim()}. ${value}`))
		setOpen(true)
		box.current?.focus()
	}
	return h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 12px', borderBottom: `1px solid ${LINE}`, flex: 'none' } },
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap' } },
			h('div', { style: { flex: '0 1 200px', minWidth: 130 }, title: current?.hint }, h(Select, { value: current?.value ?? scope, options: options.map(o => ({ value: o.value, label: o.label })), onChange: v => props.setScope(v as Scope) })),
			h('textarea', {
				ref: box,
				value: text,
				rows: open ? 3 : 1,
				placeholder: scope === 'add' ? 'Ask the agent for new designs in this set...' : 'Ask the agent to change this...',
				onFocus: () => setOpen(true),
				onChange: (e: any) => setText(e.target.value),
				onKeyDown: (e: any) => {
					if (e.key === 'Enter' && modKey(e)) {
						e.preventDefault()
						send()
					} else if (e.key === 'Escape') {
						setOpen(false)
						e.target.blur()
					}
				},
				spellCheck: true,
				style: { ...input, flex: '1 1 220px', width: 'auto', height: 'auto', minHeight: 26, padding: '5px 8px', lineHeight: 1.4, resize: 'none' },
			}),
			h(Btn, { label: busy ? 'Sending...' : canPrompt ? 'Send' : 'Copy and open chat', title: canPrompt ? `Send to the Thumbnails chat (${MOD_ENTER})` : `Copy the prompt and open a chat tab to paste it into (${MOD_ENTER})`, primary: true, disabled: !ready, onClick: send }),
			h(Btn, { label: 'New set...', title: 'Describe a new set of thumbnails, or start one from a layout', onClick: props.onNewSet, style: { height: 26, lineHeight: '24px' } }),
		),
		open
			? h(
					'div',
					{ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
					h(
						'div',
						{ style: { display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' } },
						...chips.map(c => h(Chip, { key: c, label: c, title: 'Put this in the box', onClick: () => use(c) })),
						history.length ? h(Chip, { label: recent ? 'Hide recent' : `Recent (${history.length})`, on: recent, onClick: () => setRecent(v => !v) }) : null,
					),
					recent && history.length
						? h(
								'div',
								{ className: 'kino-thumbs-scroll', style: { display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 132, overflowY: 'auto', border: `1px solid ${LINE}`, borderRadius: 6, padding: 4 } },
								...history.map(item =>
									h(
										'div',
										{ key: item, style: { display: 'flex', alignItems: 'center', gap: 6 } },
										h('button', { className: 'kino-thumbs-btn', title: 'Put this in the box to edit and send again', onClick: () => use(item, true), style: { flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'transparent', color: TEXT, fontSize: 11, padding: '3px 6px', borderRadius: 4, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, item),
										h(Btn, { label: '×', title: 'Remove from recent prompts', onClick: () => props.onForget(item), style: { padding: '0 6px' } }),
									),
								),
								h('div', { style: { display: 'flex', justifyContent: 'flex-end', paddingTop: 2 } }, h(Btn, { label: 'Clear all', onClick: () => props.onForget(null) })),
							)
						: null,
					h(
						'div',
						{ style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, color: DIM, lineHeight: 1.4 } },
						h(
							'span',
							{ style: { flex: 1, minWidth: 200 } },
							current ? `${current.hint} ` : '',
							canPrompt ? 'The agent edits the designs file and the changes show up here on their own.' : 'Without the bridge this copies the full prompt and opens a chat tab: paste it there and send.',
						),
						h(Btn, { label: 'Copy prompt', title: 'Copy the full message without sending it', disabled: text.trim().length < 3, onClick: () => props.onCopy(text.trim()) }),
						h(Btn, { label: 'Hide', onClick: () => setOpen(false) }),
					),
				)
			: null,
	)
}

// ---------- new set dialog ----------
type DialogProps = {
	mode: 'set' | 'one'
	preset: PresetId
	set: string
	canPrompt: boolean
	busy: boolean
	onSend: (ask: { brief: string; presets: PresetId[]; variations: number; set: string }) => void
	onLayout: (presets: PresetId[], layout: LayoutId, set: string) => void
	onClose: () => void
}

export const PromptDialog = (props: DialogProps) => {
	const { mode, canPrompt, busy } = props
	const [brief, setBrief] = useState('')
	const [presets, setPresets] = useState<PresetId[]>(mode === 'set' ? SET_PRESETS : [props.preset])
	const [variations, setVariations] = useState(mode === 'set' ? 1 : 2)
	const [set, setSet] = useState(props.set)
	const [layout, setLayout] = useState<LayoutId>('hero')
	const toggle = (id: PresetId) => (mode === 'one' ? setPresets([id]) : setPresets(ps => (ps.includes(id) ? (ps.length > 1 ? ps.filter(x => x !== id) : ps) : ALL_PRESETS.filter(x => x === id || ps.includes(x)))))
	const n = presets.length * variations
	const ready = brief.trim().length > 3 && set.trim().length > 0 && !busy

	return h(
		'div',
		{
			onClick: props.onClose,
			onKeyDown: (ev: any) => ev.key === 'Escape' && props.onClose(),
			style: { position: 'fixed', inset: 0, zIndex: 50, background: 'var(--kp-scrim)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 16px', overflow: 'auto' },
		},
		h(
			'div',
			{
				onClick: (ev: any) => ev.stopPropagation(),
				style: { width: '100%', maxWidth: 520, background: BG, border: `1px solid ${LINE}`, borderRadius: 10, boxShadow: '0 20px 60px var(--kp-shadow-lg)', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 },
			},
			h(
				'div',
				{ style: { display: 'flex', alignItems: 'center', gap: 8 } },
				h('div', { style: { fontWeight: 600, fontSize: 14 } }, mode === 'set' ? 'New thumbnail set' : 'New thumbnail'),
				h('div', { style: { flex: 1 } }),
				h(Btn, { label: 'Close', onClick: props.onClose }),
			),
			h(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
				h('span', { style: label }, 'Describe it'),
				h(TextArea, {
					value: brief,
					onChange: setBrief,
					rows: 4,
					autoFocus: true,
					placeholder: 'What should it promise, show and say? For example: "A home studio for under $100. The finished desk on the right, the price as the hook, three or four words."',
				}),
				h('div', { style: { fontSize: 11, color: DIM, lineHeight: 1.45 } }, 'The agent designs it with the thumbnail skill (Guide tab) and your brand kit, then the panel checks it. Edit anything afterwards.'),
			),
			h(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
				h('span', { style: label }, mode === 'set' ? 'Sizes' : 'Size'),
				h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } }, ...ALL_PRESETS.map(id => h(Chip, { key: id, on: presets.includes(id), label: PRESETS[id].short, title: PRESETS[id].label, onClick: () => toggle(id) }))),
			),
			h(
				'div',
				{ style: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' } },
				h(
					'div',
					{ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
					h('span', { style: label }, mode === 'set' ? 'Variations per size' : 'Variations'),
					h('div', { style: { width: 120 } }, h(Segmented, { value: String(variations), options: ['1', '2', '3'].map(v => ({ value: v, label: v })), onChange: v => setVariations(Number(v)) })),
				),
				h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 160 } }, h('span', { style: label }, 'Set'), h(TextIn, { value: set, onChange: setSet, placeholder: 'Set name' })),
			),
			h(
				'div',
				{ style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
				h(Btn, {
					label: busy ? 'Sending...' : canPrompt ? `Generate ${n} with the agent` : 'Copy prompt and open a chat',
					primary: true,
					disabled: !ready,
					onClick: () => props.onSend({ brief, presets, variations, set: set.trim() }),
				}),
				h('span', { style: { fontSize: 11, color: DIM, flex: 1, minWidth: 180, lineHeight: 1.4 } }, canPrompt ? 'Sends to the Thumbnails chat. New designs show up here as the agent writes them.' : 'One-click sending needs the bridge. Without it this copies the prompt and opens a chat tab to paste it into.'),
			),
			h(
				'div',
				{ style: { borderTop: `1px solid ${LINE}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 } },
				h('span', { style: label }, 'Or start from a layout (no agent)'),
				h(
					'div',
					{ style: { display: 'flex', gap: 6, alignItems: 'center' } },
					h('div', { style: { flex: 1 } }, h(Select, { value: layout, options: Object.entries(LAYOUTS).map(([value, text]) => ({ value, label: text })), onChange: v => setLayout(v as LayoutId) })),
					h(Btn, { label: `Create ${presets.length > 1 ? presets.length : ''}`.trim(), onClick: () => props.onLayout(presets, layout, set.trim() || 'Untitled set'), disabled: busy, style: { borderColor: 'rgba(255,138,31,.4)', color: EMBER } }),
				),
			),
		),
	)
}
