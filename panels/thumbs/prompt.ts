// Prompting designs into existence: the New set / New thumbnail dialog, and the messages sent to the agent.
// The agent follows the house skill in /thumbs/skill and appends designs to /thumbs/designs.json;
// the panel picks them up through the project source.
import { createElement as h, useState } from 'react'
import { LAYOUTS, PRESETS, type Design, type LayoutId, type PresetId } from '../../thumbs/model'
import { fmtClock, type Check } from './lib'
import { BG, Btn, DIM, EMBER, LINE, Segmented, Select, TEXT, TextArea, TextIn, label } from './ui'
import { MOUNT_HINT } from '../project'

const MOUNT = MOUNT_HINT ? `mountDir from getCurrentKinoContext, normally ${MOUNT_HINT}` : 'mountDir from getCurrentKinoContext'
const SKILL_FILES = '/thumbs/skill/SKILL.md, /thumbs/skill/rules.json and /thumbs/skill/format.md'
const ALL_PRESETS = Object.keys(PRESETS) as PresetId[]
const presetList = (ids: PresetId[]) => ids.map(id => `${PRESETS[id].label} (${PRESETS[id].w}x${PRESETS[id].h}, preset "${id}")`).join('; ')

type Ask = { mode: 'set' | 'one'; brief: string; presets: PresetId[]; variations: number; set: string; videoTitle: string; seconds: number; projectId: string; current?: Design | null }

export const composeMessage = (a: Ask) => {
	const n = a.variations * a.presets.length
	const lines = [
		`Thumbnails panel request for project ${a.projectId}.`,
		'',
		a.mode === 'set'
			? `Make a new thumbnail set called "${a.set}": ${a.variations} variation${a.variations > 1 ? 's' : ''} for each of ${presetList(a.presets)}. ${n} design${n > 1 ? 's' : ''} in total.`
			: `Make ${a.variations} new thumbnail design${a.variations > 1 ? 's' : ''} for ${presetList(a.presets)}, in the set "${a.set}".`,
		`Brief: ${a.brief.trim()}`,
		`Video title: ${a.videoTitle.trim() ? `"${a.videoTitle.trim()}"` : '(not set yet)'}${a.seconds > 0 ? `. Video length ${fmtClock(a.seconds)}.` : '.'}`,
		...(a.current ? [`The user had "${a.current.name}" (id ${a.current.id}) open when asking; use it as context, do not change it.`] : []),
		'',
		'How:',
		`1. Read the house thumbnail skill first: ${SKILL_FILES} (project files; ${MOUNT}). The skill is the main guideline.`,
		'2. Append the new designs to /thumbs/designs.json (version 2 format from format.md). Each needs a new unique id, set to the set name above, and prompt set to the brief. Never delete, reorder or rewrite existing designs: the panel merges new ones by id.',
		'3. Backgrounds: a built-in key (keyart, tower, bridge, rumare, wallpaper) or a library image id you checked with findMedia and lookAtFrames. Do not run paid generation (fal) unless the brief asks for it.',
		'4. Keep every word inside the platform safe area from format.md and rules.json. Vertical covers centre on x 50.',
		'5. Variations must differ in idea (subject, promise or composition), not only in colour or wording.',
		'6. Score each design against the rubric in rules.json and fix what fails. Then reply in 3 to 6 lines: what you made and why. No em-dashes.',
	]
	return lines.join('\n')
}

export const composeFix = (d: Design, checks: Check[], projectId: string) => {
	const flagged = checks.filter(c => c.level === 'fail' || c.level === 'warn')
	return [
		`Thumbnails panel fix request for project ${projectId}.`,
		'',
		`Fix the design "${d.name}" (id ${d.id}, ${PRESETS[d.preset].label}) in /thumbs/designs.json. Edit only that design, in place, keeping its id. Do not touch other designs.`,
		...(d.prompt ? [`Its brief: ${d.prompt}`] : []),
		'The panel checks flagged:',
		...flagged.map(c => `- ${c.level.toUpperCase()} ${c.label}: ${c.detail}`),
		'',
		`Read ${SKILL_FILES} first (${MOUNT}). Fix the flagged issues the way the skill recommends and keep the idea. Then reply in 2 to 4 lines with what changed. No em-dashes.`,
	].join('\n')
}

// Pull a chat id out of whatever chat::NewChat returned
export const findChatId = (value: unknown): string | null => {
	if (!value) return null
	if (typeof value === 'string') return /^[\w-]{6,}$/.test(value) ? value : null
	if (typeof value !== 'object') return null
	const o = value as Record<string, unknown>
	for (const key of ['chatId', 'conversationId', 'id']) if (typeof o[key] === 'string' && o[key]) return o[key] as string
	for (const v of Object.values(o)) {
		const found = typeof v === 'object' ? findChatId(v) : null
		if (found) return found
	}
	return null
}

// ---------- dialog ----------
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

const Chip = ({ on, label: text, onClick }: { on: boolean; label: string; onClick: () => void }) =>
	h(
		'button',
		{
			className: 'kino-thumbs-btn',
			onClick,
			style: {
				height: 24,
				padding: '0 10px',
				borderRadius: 12,
				fontSize: 11,
				cursor: 'pointer',
				border: `1px solid ${on ? 'rgba(255,138,31,.6)' : 'rgba(var(--kp-ink),.12)'}`,
				background: on ? 'rgba(255,138,31,.14)' : 'rgba(var(--kp-ink),.03)',
				color: on ? TEXT : DIM,
			},
		},
		text,
	)

export const PromptDialog = (props: DialogProps) => {
	const { mode, canPrompt, busy } = props
	const [brief, setBrief] = useState('')
	const [presets, setPresets] = useState<PresetId[]>(mode === 'set' ? ALL_PRESETS : [props.preset])
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
					placeholder: 'What should it promise, show and say? e.g. "Host your own Oblivion server in 2 minutes. Status card with players online, an Oblivion gate behind, short punchy words."',
				}),
				h('div', { style: { fontSize: 11, color: DIM, lineHeight: 1.45 } }, 'The agent designs it with the house thumbnail skill (Guide tab), then the panel checks it. Edit anything afterwards.'),
			),
			h(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
				h('span', { style: label }, mode === 'set' ? 'Platforms' : 'Platform'),
				h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } }, ...ALL_PRESETS.map(id => h(Chip, { key: id, on: presets.includes(id), label: PRESETS[id].short, onClick: () => toggle(id) }))),
			),
			h(
				'div',
				{ style: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' } },
				h(
					'div',
					{ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
					h('span', { style: label }, mode === 'set' ? 'Variations per platform' : 'Variations'),
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
				h('span', { style: { fontSize: 11, color: DIM, flex: 1, minWidth: 180, lineHeight: 1.4 } }, canPrompt ? 'Sends to the thumbnails chat. New designs show up here as the agent writes them.' : 'One-click sending needs the updated bridge. Until then this copies the prompt and opens a chat tab to paste it into.'),
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
