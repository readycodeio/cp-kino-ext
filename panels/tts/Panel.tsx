// Voiceover: ElevenLabs text to speech inside Kino, Studio style.
// Pick a voice from your account, write with ElevenLabs syntax, generate one or more takes, audition them,
// then put the one you like on the timeline at the playhead or into the library.
// Speech runs through the local Kino bridge, which hands it to a separate worker process: the
// ElevenLabs key never reaches this panel or the bridge itself. Nothing here works without the bridge.
// lib.ts holds types, the audio cache and the per-model syntax rules; ui.ts the small controls and the waveform.
// Built with createElement rather than JSX: generated panels currently hit React #31 with JSX.
import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '../theme'
import { IS_MAC, IS_WIN, MACHINE, SHOW_IN, MOD_ENTER, TERMINAL_APP } from '../platform'
import { api, BridgeCard, BridgeError, bridgeMessage, projectId, useBridge } from '../bridge'
import {
	PREFS_KEY, DRAFT_KEY, HIDDEN_KEY, DEFAULT_MODEL, MODEL_ORDER, PHONEME_MODELS, FORMATS, BATCH_PAGE, UI_FONT, MONO, BG, TEXT, DIM, FAINT, LINE, RED,
	AMBER, EMPTY_VS, DEFAULT_ADV, loadAudio, audioPath, readJson, writeJson, drop, plain, fmtInt, fmtSec, fmtTc, fmtAgo, whenOf, tildify, isTagModel, isV4,
	isV3Only, shortModel, labelOf, CATEGORY, SEG_STYLE, segmentsOf, lintOf, chipGroups, HELP_TAGS, HELP_SSML, HELP_ALL, type Status, type Voice,
	type Model, type Req, type Take, type Quota, type Dict, type Fx, type Effects, type VS, type Adv, type Prefs, type Pending, type Chip,
} from './lib'
import {
	input, infoLine, sectionTitle, clamp, Btn, IconBtn, Segmented, Select, Row, Slider, Boundary, PlayheadProbe, Wave, EDITOR_TEXT, ensureCss, keepFocus,
	CodeLine,
} from './ui'

// ---------- panel ----------
export default function VoiceoverPanel() {
	const rootRef = useRef<HTMLDivElement | null>(null)
	const taRef = useRef<HTMLTextAreaElement | null>(null)
	const versionsRef = useRef<HTMLDivElement | null>(null)
	const audioRef = useRef<HTMLAudioElement | null>(null)
	const playheadRef = useRef<{ frame: number | null; fps: number | null }>({ frame: null, fps: null })

	const [width, setWidth] = useState(0)
	const [status, setStatus] = useState<Status | null>(null)
	const { bridge, ready: connected, note: bridgeNote, check, pair, fail: bridgeFail } = useBridge({
		needs: ['tts'],
		probe: async () => setStatus(await api('/tts/status')),
	})
	// ElevenLabs turned the key down on a real request. The status route only knows that a key exists.
	const [keyRejected, setKeyRejected] = useState(false)
	// Everything below runs only with the bridge connected and a key the worker could load.
	const ready = connected && Boolean(status?.hasKey) && !keyRejected
	// Optional default voice: voice_id in the voice config file, or ELEVENLABS_VOICE_ID beside the key.
	const defaultVoice = status?.defaults?.voiceId || ''
	const [voices, setVoices] = useState<Voice[] | null>(null)
	const [models, setModels] = useState<Model[] | null>(null)
	const [quota, setQuota] = useState<Quota | null>(null)
	const [dicts, setDicts] = useState<Dict[] | null>(null)
	const [effects, setEffects] = useState<Effects | null>(null)
	// Each voice's saved settings from ElevenLabs. The voice list doesn't carry them, so they come from their own route.
	const [storedVs, setStoredVs] = useState<Record<string, Req>>({})
	const storedLoads = useRef<Record<string, Promise<Req | null>>>({})
	const storedFresh = useRef(false)
	// First run on this computer: start from the defaults in the voice config file, if it has any.
	const firstRun = useRef<boolean | null>(null)
	if (firstRun.current === null) firstRun.current = readJson(PREFS_KEY, null) === null
	const [prefs, setPrefs] = useState<Prefs>(() => {
		const saved = readJson(PREFS_KEY, {})
		return {
			voiceId: '',
			modelId: DEFAULT_MODEL,
			takes: 1,
			vsByVoice: {},
			chips: 'delivery',
			...saved,
			adv: { ...DEFAULT_ADV, ...(saved.adv ?? {}), name: '' },
		}
	})
	// One draft per project, so two projects open at once do not overwrite each other's script.
	const draftKey = useMemo(() => `${DRAFT_KEY}:${projectId() || 'none'}`, [])
	const [text, setText] = useState<string>(() => readJson(draftKey, null) ?? readJson(DRAFT_KEY, ''))
	const [showAdvanced, setShowAdvanced] = useState(false)
	const [showHelp, setShowHelp] = useState(false)
	const [history, setHistory] = useState<Take[]>([])
	const [historyDir, setHistoryDir] = useState('')
	const [hidden, setHidden] = useState<string[]>(() => readJson(HIDDEN_KEY, []))
	const [batchLimit, setBatchLimit] = useState(BATCH_PAGE)
	const [pending, setPending] = useState<Pending | null>(null)
	// Runs the bridge is doing for someone else: this panel before it was closed and reopened, or a second panel.
	const [remote, setRemote] = useState<Pending[]>([])
	const [voicesError, setVoicesError] = useState('')
	const [dirDraft, setDirDraft] = useState<string | null>(null)
	// Take lengths measured while decoding, for takes saved without one (ffprobe not installed).
	const [measured, setMeasured] = useState<Record<string, number>>({})
	const [confirm, setConfirm] = useState<{ estimate: number; remaining: number | null; body: Req } | null>(null)
	const [now, setNow] = useState<{ key: string; playing: boolean } | null>(null)
	const [busy, setBusy] = useState<Record<string, string>>({})
	const [flash, setFlash] = useState<{ text: string; tone?: 'error' } | null>(null)
	const [, setTick] = useState(0)

	const say = useCallback((message: string, tone?: 'error') => setFlash({ text: plain(message), tone }), [])
	useEffect(() => {
		if (!flash) return
		const timer = setTimeout(() => setFlash(null), flash.tone === 'error' ? 9000 : 5000)
		return () => clearTimeout(timer)
	}, [flash])

	useEffect(ensureCss, [])

	useEffect(() => {
		const root = rootRef.current
		if (!root) return
		const observer = new ResizeObserver(entries => setWidth(Math.round(entries[0]?.contentRect.width ?? 0)))
		observer.observe(root)
		return () => observer.disconnect()
	}, [])

	// ---------- persistence ----------
	useEffect(() => writeJson(PREFS_KEY, { ...prefs, adv: { ...prefs.adv, name: '' } }), [prefs])
	useEffect(() => {
		const timer = setTimeout(() => writeJson(draftKey, text), 400)
		return () => clearTimeout(timer)
	}, [text, draftKey])
	useEffect(() => writeJson(HIDDEN_KEY, hidden.slice(-500)), [hidden])

	// ---------- audio ----------
	const audioEl = () => {
		if (!audioRef.current) audioRef.current = new Audio()
		return audioRef.current
	}
	useEffect(() => {
		const audio = audioEl()
		const onPlay = () => setNow(current => (current ? { ...current, playing: true } : current))
		const onStop = () => setNow(current => (current ? { ...current, playing: false } : current))
		audio.addEventListener('play', onPlay)
		audio.addEventListener('pause', onStop)
		audio.addEventListener('ended', onStop)
		return () => {
			audio.removeEventListener('play', onPlay)
			audio.removeEventListener('pause', onStop)
			audio.removeEventListener('ended', onStop)
			audio.pause()
		}
	}, [])

	// ---------- bridge ----------
	// Connection errors move the bridge state. 424 is the bridge saying ElevenLabs refused the key.
	const fail = useCallback(
		(error: unknown) => {
			if (error instanceof BridgeError && error.status === 424) setKeyRejected(true)
			return bridgeFail(error)
		},
		[bridgeFail],
	)
	const recheck = () => {
		setKeyRejected(false)
		check()
	}
	useEffect(() => {
		if (!status || !firstRun.current) return
		firstRun.current = false
		const wanted = status.defaults ?? {}
		setPrefs(current => ({
			...current,
			modelId: wanted.modelId || current.modelId,
			adv: { ...current.adv, format: FORMATS.some(item => item.value === wanted.outputFormat) ? String(wanted.outputFormat) : current.adv.format },
		}))
	}, [status])

	// ---------- data ----------
	const loadHistory = useCallback(() => {
		api('/tts/history?n=240')
			.then(body => {
				setHistory(body.items ?? [])
				setHistoryDir(body.dir ?? '')
				setRemote(
					(Array.isArray(body.pending) ? body.pending : []).map((item: Req) => ({
						text: String(item.text ?? ''),
						takes: Number(item.takes) || 1,
						startedAt: Number(item.startedAt) || Date.now(),
						voiceName: String(item.voiceName ?? 'Voice'),
						modelId: String(item.modelId ?? ''),
					})),
				)
			})
			.catch(fail)
	}, [fail])
	const loadQuota = useCallback(() => {
		api('/tts/quota')
			.then(setQuota)
			.catch(() => {})
	}, [])
	const loadStored = useCallback((voiceId: string, fresh = false): Promise<Req | null> => {
		if (!voiceId) return Promise.resolve(null)
		const inFlight = storedLoads.current[voiceId]
		if (inFlight && !fresh) return inFlight
		const load = api(`/tts/voice-settings?voice=${encodeURIComponent(voiceId)}${fresh ? '&fresh=1' : ''}`)
			.then(body => {
				const settings: Req = body.settings ?? {}
				setStoredVs(current => ({ ...current, [voiceId]: settings }))
				return settings
			})
			.catch(() => {
				// Let the next attempt retry instead of caching the failure.
				delete storedLoads.current[voiceId]
				return null
			})
		storedLoads.current[voiceId] = load
		return load
	}, [])
	const loadAll = useCallback(
		(fresh = false) => {
			const q = fresh ? '?fresh=1' : ''
			api(`/tts/voices${q}`)
				.then(body => {
					setVoices(body.voices ?? [])
					setVoicesError('')
				})
				.catch(error => setVoicesError(fail(error)))
			api(`/tts/models${q}`)
				.then(body => setModels(body.models ?? []))
				.catch(error => say(`Models: ${fail(error)}`, 'error'))
			if (fresh) {
				setDicts(null)
				setEffects(null)
				storedLoads.current = {}
				storedFresh.current = true
				setStoredVs({})
			}
			loadQuota()
			loadHistory()
		},
		[fail, loadHistory, loadQuota, say],
	)
	useEffect(() => {
		if (ready) loadAll()
	}, [ready, loadAll])
	// No usable voice picked: start on the configured default, else the first of the account's own voices, else the first voice.
	useEffect(() => {
		if (!voices?.length || voices.some(item => item.id === prefs.voiceId)) return
		const pick = voices.find(item => item.id === defaultVoice) ?? voices.find(item => item.category !== 'premade') ?? voices[0]
		if (prefs.voiceId) say(`The voice picked before is not on this account, so ${pick.name} is selected.`)
		setPrefs(current => ({ ...current, voiceId: pick.id }))
	}, [voices, defaultVoice, prefs.voiceId, say])
	useEffect(() => {
		if (!ready || !prefs.voiceId || storedVs[prefs.voiceId]) return
		loadStored(prefs.voiceId, storedFresh.current)
		storedFresh.current = false
	}, [ready, prefs.voiceId, storedVs, loadStored])
	useEffect(() => {
		if (!ready || !showAdvanced) return
		if (!dicts)
			api('/tts/dictionaries')
				.then(body => setDicts(body.dictionaries ?? []))
				.catch(() => setDicts([]))
		if (!effects)
			api('/tts/effects')
				.then(body => setEffects({ filters: body.filters ?? [], environments: body.environments ?? [], noises: body.noises ?? [] }))
				.catch(() => setEffects({ filters: [], environments: [], noises: [] }))
	}, [ready, showAdvanced, dicts, effects])

	const waiting = Boolean(pending) || remote.length > 0
	useEffect(() => {
		if (!waiting) return
		const timer = setInterval(() => setTick(n => n + 1), 1000)
		return () => clearInterval(timer)
	}, [waiting])
	// A run this panel did not start itself has no request to wait on: look for its takes until it is done.
	useEffect(() => {
		if (!ready || pending || !remote.length) return
		const timer = setInterval(loadHistory, 3000)
		return () => clearInterval(timer)
	}, [ready, pending, remote.length, loadHistory])

	// ---------- derived ----------
	const patch = (next: Partial<Prefs>) => setPrefs(current => ({ ...current, ...next }))
	const setAdv = (next: Partial<Adv>) => setPrefs(current => ({ ...current, adv: { ...current.adv, ...next } }))
	const setVs = (next: Partial<VS>) =>
		setPrefs(current => ({ ...current, vsByVoice: { ...current.vsByVoice, [current.voiceId]: { ...EMPTY_VS, ...current.vsByVoice[current.voiceId], ...next } } }))

	const sortedModels = useMemo(() => {
		const rank = (id: string) => (MODEL_ORDER.includes(id) ? MODEL_ORDER.indexOf(id) : 100)
		return [...(models ?? [])].sort((a, b) => rank(a.id) - rank(b.id))
	}, [models])
	useEffect(() => {
		if (sortedModels.length && !sortedModels.some(model => model.id === prefs.modelId)) patch({ modelId: sortedModels[0].id })
	}, [sortedModels, prefs.modelId])

	const voice = voices?.find(item => item.id === prefs.voiceId)
	const model = sortedModels.find(item => item.id === prefs.modelId)
	const modelId = prefs.modelId
	const adv = prefs.adv
	const vs: VS = { ...EMPTY_VS, ...prefs.vsByVoice[prefs.voiceId] }
	const savedVs: Req | undefined = storedVs[prefs.voiceId]
	const isPvc = voice?.category === 'professional'
	const fineTunedHere = Boolean(voice?.fineTuned?.includes(modelId))
	const cloneAllowed = isPvc && isV4(modelId) && fineTunedHere
	const chars = text.trim().length
	const costFactor = model?.costFactor ?? 1
	const estimate = Math.ceil(chars * costFactor * prefs.takes)
	const remaining = quota ? Math.max(0, quota.limit - quota.used) : null
	const overLimit = Boolean(model?.maxChars && chars > model.maxChars)
	const lint = useMemo(() => lintOf(text, model, modelId), [text, model, modelId])
	const segments = useMemo(() => segmentsOf(text, modelId), [text, modelId])
	const groups = useMemo(() => chipGroups(modelId), [modelId])
	const group = groups.find(item => item.id === prefs.chips) ?? groups[0]
	const languageValue = model?.languages?.some(language => language.id === adv.language) ? adv.language : ''
	const modelName = (id: string | null | undefined) => {
		if (!id) return ''
		const found = sortedModels.find(item => item.id === id)
		return found ? shortModel(found.name) : id.replace(/^eleven_/, '').replace(/_/g, ' ')
	}

	const buildBody = (saved: Req | null | undefined = savedVs): Req => {
		const overrides = drop({
			stability: vs.stability,
			similarity_boost: vs.similarity,
			style: model?.canUseStyle ? vs.style : null,
			speed: vs.speed,
			use_speaker_boost: model?.canUseSpeakerBoost ? vs.boost : null,
			clone_strength: cloneAllowed ? vs.clone : null,
		})
		let voiceSettings: Req | undefined
		if (Object.keys(overrides).length) {
			// A partial voice_settings object resets the missing fields to API defaults, so start from the voice's own settings.
			const base: Req = { ...(saved ?? {}) }
			if (!model?.canUseStyle) delete base.style
			if (!model?.canUseSpeakerBoost) delete base.use_speaker_boost
			voiceSettings = { ...base, ...overrides }
		}
		const filterOn = Boolean(adv.filter || adv.environment || adv.noise || adv.pan || adv.distance !== null)
		return drop({
			text,
			voice_id: prefs.voiceId,
			model_id: modelId,
			output_format: adv.format,
			takes: prefs.takes,
			voice_settings: voiceSettings,
			seed: adv.seed.trim() === '' ? undefined : Number(adv.seed),
			language_code: languageValue || undefined,
			apply_text_normalization: adv.normalization,
			previous_text: adv.previous.trim() || undefined,
			next_text: adv.next.trim() || undefined,
			pronunciation_dictionary_locators: adv.dicts.length
				? adv.dicts
						.map(id => dicts?.find(item => item.id === id))
						.filter(Boolean)
						.map(item => ({ pronunciation_dictionary_id: (item as Dict).id, version_id: (item as Dict).versionId }))
				: undefined,
			audio_effects: filterOn
				? drop({
						filter_preset_id: adv.filter || undefined,
						environment_id: adv.environment || undefined,
						send_level: adv.environment ? adv.sendLevel : undefined,
						background_noise_id: adv.noise || undefined,
						distance: adv.distance ?? undefined,
						pan: adv.pan || undefined,
					})
				: undefined,
			use_pvc_as_ivc: isPvc && adv.pvcAsIvc ? true : undefined,
			name: adv.name.trim() || undefined,
		})
	}

	// ---------- playback ----------
	const play = useCallback(
		async (key: string, path: string, at?: number) => {
			const audio = audioEl()
			try {
				const loaded = await loadAudio(key, path)
				if (audio.src !== loaded.url) audio.src = loaded.url
				if (at !== undefined) audio.currentTime = Math.max(0, at)
				setNow({ key, playing: true })
				await audio.play()
			} catch (error) {
				if ((error as { name?: string })?.name === 'AbortError') return
				const message = fail(error)
				if (message) say(`Playback: ${message}`, 'error')
			}
		},
		[fail, say],
	)
	const toggle = (key: string, path: string) => {
		const audio = audioEl()
		if (now?.key === key) {
			if (audio.paused) audio.play().catch(() => {})
			else audio.pause()
			return
		}
		audio.pause()
		play(key, path, 0)
	}
	const seek = (key: string, path: string, fraction: number, duration: number) => {
		const audio = audioEl()
		if (now?.key === key && audio.duration) {
			audio.currentTime = fraction * audio.duration
			if (audio.paused) audio.play().catch(() => {})
			return
		}
		audio.pause()
		play(key, path, fraction * (duration || 0))
	}

	// ---------- generate ----------
	const estimateOf = (body: Req) =>
		Math.ceil(String(body.text ?? '').trim().length * (sortedModels.find(item => item.id === body.model_id)?.costFactor ?? 1) * (Number(body.takes) || 1))
	const generate = (body: Req, confirmed = false) => {
		if (pending) return
		if (!String(body.text ?? '').trim()) return
		setConfirm(null)
		const startedVoice = voices?.find(item => item.id === body.voice_id)?.name ?? 'Voice'
		setPending({ text: String(body.text), takes: Number(body.takes) || 1, startedAt: Date.now(), voiceName: startedVoice, modelId: String(body.model_id ?? '') })
		if (width < 760) setTimeout(() => versionsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50)
		// voice_name goes into the take's sidecar, so the list can name the voice later.
		api('/tts/generate', { method: 'POST', body: { ...body, voice_name: startedVoice, confirmed } })
			.then((result: { takes?: Take[]; needsConfirm?: boolean; estimate?: number; remaining?: number | null }) => {
				// The bridge asks before a large run instead of starting it.
				if (result.needsConfirm) {
					setConfirm({ estimate: Number(result.estimate) || estimateOf(body), remaining: result.remaining ?? null, body })
					return
				}
				const takes = result.takes ?? []
				const ok = takes.filter(take => !take.error)
				const bad = takes.filter(take => take.error)
				setHistory(current => [...ok, ...current.filter(item => !ok.some(fresh => fresh.file === item.file))])
				setBatchLimit(limit => Math.max(limit, BATCH_PAGE))
				if (bad.length) say(`${bad.length} of ${takes.length} takes failed: ${bad[0].error}`, 'error')
				if (body.name) setAdv({ name: '' })
				if (ok[0]) play(ok[0].file, audioPath(ok[0].file), 0)
				loadQuota()
			})
			.catch(error => {
				// A bridge from before this panel version asks the same question with a 409.
				if (error instanceof BridgeError && error.status === 409) {
					setConfirm({ estimate: estimateOf(body), remaining, body })
					return
				}
				const message = fail(error)
				say(error instanceof BridgeError && error.status === 0 ? 'The bridge stopped while generating. Takes that finished are in the folder: press ↻ once it is back.' : message, 'error')
				loadQuota()
			})
			.finally(() => setPending(null))
	}
	// Why Generate is off, in words, when the reason is not just an empty editor.
	const blocker = !voices
		? voicesError
			? 'Voices did not load'
			: 'Loading voices…'
		: !voices.length
			? 'No voices on this account'
			: !voice
				? 'Pick a voice'
				: !models
					? 'Loading models…'
					: !model
						? 'Pick a model'
						: ''
	const canGenerate = ready && chars > 0 && !pending && !blocker && !overLimit
	const generateNow = async () => {
		if (!canGenerate) return
		const touched = Object.values(vs).some(value => value !== null)
		if (!touched || savedVs) {
			generate(buildBody())
			return
		}
		// A slider was moved before the voice's saved settings arrived: fetch them first so the untouched ones keep their values.
		const saved = await loadStored(prefs.voiceId)
		if (!saved) say('Couldn’t read this voice’s saved settings, so untouched sliders use the ElevenLabs defaults.', 'error')
		generate(buildBody(saved))
	}

	// ---------- batch actions ----------
	const requestOf = (take: Take): Req | null => {
		const req = take.request
		if (!req || typeof req.text !== 'string' || !req.text.trim()) return null
		const clean: Req = {}
		for (const [key, value] of Object.entries(req)) if (!key.startsWith('_') && key !== 'seed') clean[key] = value
		return { ...clean, voice_id: take.voiceId ?? req._voice_id ?? prefs.voiceId, output_format: take.outputFormat ?? req._output_format ?? adv.format }
	}
	const reuse = (take: Take) => {
		const req = requestOf(take)
		if (!req) return
		const settings = req.voice_settings ?? {}
		const voiceId = String(req.voice_id)
		const fx = req.audio_effects ?? {}
		setText(req.text)
		setPrefs(current => ({
			...current,
			voiceId,
			modelId: req.model_id ?? current.modelId,
			vsByVoice: {
				...current.vsByVoice,
				[voiceId]: {
					stability: settings.stability ?? null,
					similarity: settings.similarity_boost ?? null,
					style: settings.style ?? null,
					speed: settings.speed ?? null,
					boost: typeof settings.use_speaker_boost === 'boolean' ? settings.use_speaker_boost : null,
					clone: settings.clone_strength ?? null,
				},
			},
			adv: {
				...current.adv,
				seed: '',
				language: req.language_code ?? '',
				normalization: req.apply_text_normalization ?? 'auto',
				format: req.output_format ?? current.adv.format,
				previous: req.previous_text ?? '',
				next: req.next_text ?? '',
				dicts: (req.pronunciation_dictionary_locators ?? []).map((item: Req) => item.pronunciation_dictionary_id),
				filter: fx.filter_preset_id ?? '',
				environment: fx.environment_id ?? '',
				sendLevel: fx.send_level ?? current.adv.sendLevel,
				noise: fx.background_noise_id ?? '',
				distance: fx.distance ?? null,
				pan: fx.pan ?? 0,
				pvcAsIvc: req.use_pvc_as_ivc === true,
			},
		}))
		say('Loaded into the editor.')
		taRef.current?.focus()
	}
	const again = (take: Take) => {
		const req = requestOf(take)
		if (req) generate({ ...req, takes: take.takes || prefs.takes })
	}
	const hide = (batchId: string) => setHidden(current => [...current.filter(id => id !== batchId), batchId])

	const importTake = (take: Take, place: boolean) => {
		setBusy(current => ({ ...current, [take.file]: place ? 'timeline' : 'library' }))
		const probe = playheadRef.current
		api('/tts/import', {
			method: 'POST',
			body: {
				file: take.file,
				place: place ? 'playhead' : undefined,
				projectId: place ? projectId() || undefined : undefined,
				frame: place && probe.frame !== null ? probe.frame : undefined,
				fps: place && probe.fps ? probe.fps : undefined,
				duration: take.duration ?? measured[take.file] ?? undefined,
			},
		})
			.then(result => {
				setHistory(current => current.map(item => (item.file === take.file ? { ...item, mediaId: result.mediaId } : item)))
				if (result.placed)
					say(
						`V${take.take} is on the timeline at ${fmtTc(result.frame, result.fps)}.${result.warning ? ` Kino reported: ${result.warning}` : ''}`,
						result.warning ? 'error' : undefined,
					)
				else say(result.reused ? 'Already in the Kino library.' : 'Added to the Kino library.')
			})
			.catch(error => {
				const message = fail(error)
				if (message) say(message, 'error')
			})
			.finally(() =>
				setBusy(current => {
					const next = { ...current }
					delete next[take.file]
					return next
				}),
			)
	}
	const reveal = (file?: string, target?: 'keys') =>
		api('/tts/reveal', { method: 'POST', body: file ? { file } : target ? { target } : {} }).catch(error => say(fail(error), 'error'))
	const noteDuration = useCallback((file: string, seconds: number) => setMeasured(current => (current[file] === seconds ? current : { ...current, [file]: seconds })), [])
	// The takes folder lives in the bridge's voice config, one per computer.
	const saveDir = (value: string) =>
		api('/tts/config', { method: 'POST', body: { outputDir: value } })
			.then(next => {
				setStatus(current => ({ ...(current ?? {}), outputDir: next.outputDir, defaultDir: next.defaultDir }))
				setDirDraft(null)
				loadHistory()
				say(value ? 'New takes go to the new folder. Earlier takes stay where they are.' : 'Back to the default folder.')
			})
			.catch(error => say(fail(error), 'error'))

	// ---------- editor ----------
	const insert = (chip: Chip) => {
		const ta = taRef.current
		if (!ta) return
		ta.focus()
		const start = ta.selectionStart
		const end = ta.selectionEnd
		const value = ta.value
		const selected = value.slice(start, end)
		const before = value.slice(0, start)
		const after = value.slice(end)
		const lead = start > 0 && !/\s$/.test(before) ? ' ' : ''
		let insertText = ''
		let select: [number, number] | null = null
		const run = chip.run
		if (run.kind === 'tag') {
			// The tag goes in front of the selection (it steers what follows), or at the caret with one trailing space.
			insertText = selected ? `${lead}[${run.a}] ${selected}` : `${lead}[${run.a}]${/^\s/.test(after) ? '' : ' '}`
		} else if (run.kind === 'raw') {
			insertText = `${run.a === '...' ? '' : lead}${run.a}${/^\s/.test(after) || !after ? '' : ' '}`
		} else if (run.kind === 'caps') {
			if (!selected) {
				say('Select a word first, then click CAPS.')
				return
			}
			insertText = selected === selected.toUpperCase() ? selected.toLowerCase() : selected.toUpperCase()
			select = [start, start + insertText.length]
		} else {
			const a = run.a ?? ''
			const b = run.b ?? ''
			insertText = `${a}${selected}${b}`
			if (run.select) select = [start + a.length, start + a.length + selected.length]
			else if (a.includes('ph=""')) {
				const caret = start + a.indexOf('ph=""') + 4
				select = [caret, caret]
			} else select = [start + a.length + selected.length, start + a.length + selected.length]
		}
		const ok = document.execCommand('insertText', false, insertText)
		if (!ok) setText(before + insertText + after)
		if (select) {
			const [from, to] = select
			requestAnimationFrame(() => taRef.current?.setSelectionRange(from, to))
		}
	}

	const isolate = (event: { target: unknown; metaKey?: boolean; key?: string; stopPropagation: () => void }) => {
		// Keep typing out of Kino's editor shortcuts (space, J/K/L, delete, ...). On macOS ⌘ combos other than editing ones still reach Kino.
		const target = event.target as HTMLElement | null
		if (!target || !/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
		if (IS_MAC && event.metaKey && typeof event.key === 'string' && !['a', 'c', 'v', 'x', 'z', 'enter'].includes(event.key.toLowerCase())) return
		event.stopPropagation()
	}

	// ---------- render: compose ----------
	const mine = (voices ?? []).filter(item => item.category !== 'premade')
	const library = (voices ?? []).filter(item => item.category === 'premade')
	const voiceOption = (item: Voice) =>
		h('option', { key: item.id, value: item.id }, `${plain(item.name)}${item.id === defaultVoice ? '  (default)' : ''}${item.fineTuned?.includes(modelId) ? '  ✓' : ''}`)
	const previewKey = voice ? `voice:${voice.id}` : ''
	const previewPlaying = Boolean(now?.key === previewKey && now?.playing)
	const voiceLabels = voice?.labels ? Object.values(voice.labels).filter(Boolean).map(value => labelOf(String(value))) : []
	// Only models the picker offers: an account can list more than the ones that do text to speech.
	const fineTunedNames = sortedModels.filter(item => voice?.fineTuned?.includes(item.id)).map(item => shortModel(item.name))

	const voiceBlock = h(
		'div',
		null,
		sectionTitle('Voice'),
		h(
			'div',
			{ style: { display: 'flex', gap: 6, marginTop: 6 } },
			Select({
				value: prefs.voiceId,
				disabled: !voices,
				title: voice?.description ? plain(voice.description) : undefined,
				onChange: id => patch({ voiceId: id }),
				options: voices
					? [
							...(voice ? [] : [h('option', { key: 'missing', value: prefs.voiceId }, voices.length ? 'Pick a voice' : 'No voices yet')]),
							mine.length ? h('optgroup', { key: 'mine', label: 'My voices' }, ...mine.map(voiceOption)) : null,
							library.length ? h('optgroup', { key: 'lib', label: 'Default voices' }, ...library.map(voiceOption)) : null,
						]
					: [h('option', { key: 'loading', value: prefs.voiceId }, voicesError ? 'Voices did not load' : 'Loading voices…')],
					}),
					Btn({
						label: previewPlaying ? '❚❚' : '▶',
				title: 'Play the ElevenLabs sample for this voice',
				disabled: !voice?.previewUrl,
				onClick: () => voice && toggle(previewKey, `/tts/voice-preview?voice=${encodeURIComponent(voice.id)}`),
				style: { height: 26, width: 30, padding: 0, fontSize: 10 },
			}),
		),
		voicesError && !voices
			? h(
					'div',
					{ style: { ...infoLine, color: RED, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const } },
					h('span', { style: { flex: '1 1 160px', wordBreak: 'break-word' as const } }, plain(voicesError)),
					Btn({ label: 'Try again', onClick: () => loadAll(true) }),
				)
			: null,
		voices && !voices.length
			? h('div', { style: { ...infoLine, color: AMBER } }, 'This ElevenLabs account has no voices yet. Add or clone one on elevenlabs.io, then press ↻ at the top.')
			: null,
		voice
			? h(
					'div',
					{ style: infoLine },
					[CATEGORY[voice.category] ?? labelOf(voice.category), ...voiceLabels].join('  ·  '),
					fineTunedNames.length ? h('span', { style: { color: FAINT } }, `  ·  fine-tuned: ${fineTunedNames.join(', ')}`) : null,
				)
			: null,
		voice && defaultVoice && prefs.voiceId !== defaultVoice && voices?.some(item => item.id === defaultVoice)
			? h(
					'div',
					{ style: { ...infoLine, marginTop: 2 } },
					h(
						'span',
						{ onClick: () => patch({ voiceId: defaultVoice }), style: { color: FAINT, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 } },
						`Back to ${plain(voices?.find(item => item.id === defaultVoice)?.name ?? 'the default voice')}`,
					),
				)
			: null,
	)

	const modelBlock = h(
		'div',
		null,
		sectionTitle('Model'),
		h(
			'div',
			{ style: { display: 'flex', gap: 6, marginTop: 6 } },
			Select({
				value: modelId,
				disabled: !models,
				title: model?.description ? plain(model.description) : undefined,
				onChange: id => patch({ modelId: id }),
				options: models
					? sortedModels.map(item =>
							h(
								'option',
								{ key: item.id, value: item.id },
								`${shortModel(item.name)}${voice?.fineTuned?.includes(item.id) ? '  ✓' : ''}${item.costFactor < 1 ? `  (${item.costFactor}× cost)` : ''}`,
							),
						)
					: [h('option', { key: 'loading', value: modelId }, 'Loading models…')],
			}),
		),
		model
			? h(
					'div',
					{ style: infoLine },
					[
						model.maxChars ? `${fmtInt(model.maxChars)} characters per take` : '',
						model.costFactor !== 1 ? `${model.costFactor}× credits` : 'full credits',
						model.languages?.length ? `${model.languages.length} languages` : '',
						isTagModel(model.id) ? (isV4(model.id) ? 'audio tags, /IPA/' : 'audio tags') : PHONEME_MODELS.includes(model.id) ? '<break>, <phoneme>' : '<break>',
					]
						.filter(Boolean)
						.join('  ·  '),
					voices ? h('span', { style: { color: FAINT } }, '  ·  ✓ = voice fine-tuned') : null,
				)
			: null,
		isPvc && voice && voice.fineTuned?.length && !fineTunedHere
			? h('div', { style: { ...infoLine, color: AMBER } }, `${plain(voice.name)} is not fine-tuned for this model, so it will sound less like the original.`)
			: null,
	)

	const editor = h(
		'div',
		{
			style: {
				position: 'relative',
				borderRadius: 8,
				border: '1px solid rgba(var(--kp-ink),0.14)',
				background: 'var(--kp-well)',
				cursor: 'text',
			},
			onClick: () => taRef.current?.focus(),
		},
		h(
			'div',
			{ 'aria-hidden': true, style: { ...EDITOR_TEXT, color: TEXT, pointerEvents: 'none', minHeight: 156 } },
			...segments.map((segment, index) => (segment.kind ? h('span', { key: index, style: SEG_STYLE[segment.kind] }, segment.text) : segment.text)),
			'​',
		),
		h('textarea', {
			ref: taRef,
			className: 'kino-vo-ta',
			value: text,
			spellCheck: false,
			placeholder: isTagModel(modelId)
				? 'What should it say? Steer delivery with [whispers], [excited] or [laughs], pause with [short pause] or ..., stress a word in CAPS.'
				: 'What should it say? Pause with <break time="1s" />. This model reads [tags] out loud.',
			onChange: (event: { target: { value: string } }) => setText(event.target.value),
			onKeyDown: (event: { key: string; metaKey: boolean; ctrlKey: boolean; preventDefault: () => void; stopPropagation: () => void }) => {
				if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
					event.preventDefault()
					event.stopPropagation()
					generateNow()
				}
			},
			style: {
				...EDITOR_TEXT,
				position: 'absolute',
				inset: 0,
				width: '100%',
				height: '100%',
				color: 'transparent',
				caretColor: 'var(--kp-strong)',
				background: 'transparent',
				border: 'none',
				outline: 'none',
				resize: 'none' as const,
				overflow: 'hidden',
			},
		}),
	)

	const chips = h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const } },
			Segmented({ value: group?.id ?? '', options: groups.map(item => ({ value: item.id, label: item.label })), onChange: id => patch({ chips: id }) }),
			h('span', { style: { flex: 1 } }),
			Btn({ label: showHelp ? 'Hide syntax' : 'Syntax', title: 'What this model understands', onClick: () => setShowHelp(open => !open) }),
		),
		group
			? h(
					'div',
					{ style: { display: 'flex', flexWrap: 'wrap' as const, gap: 4 } },
					...group.chips.map(chip =>
						h(
							'button',
							{
								key: chip.label,
								className: 'kino-vo-chip',
								title: chip.title ?? 'Insert at the cursor',
								onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault(),
								onClick: () => insert(chip),
								style: {
									height: 22,
									padding: '0 8px',
									borderRadius: 11,
									border: `1px solid ${chip.run.kind === 'tag' ? 'rgba(167,139,250,0.28)' : 'rgba(var(--kp-ink),0.12)'}`,
									background: chip.run.kind === 'tag' ? 'rgba(167,139,250,0.08)' : 'rgba(var(--kp-ink),0.04)',
									color: chip.run.kind === 'tag' ? 'var(--kp-violet)' : 'rgba(var(--kp-ink),0.78)',
									fontSize: 11,
									fontFamily: chip.run.kind === 'tag' ? UI_FONT : MONO,
									cursor: 'pointer',
									whiteSpace: 'nowrap' as const,
								},
							},
							chip.run.kind === 'tag' ? `[${chip.label}]` : chip.label,
						),
					),
				)
			: null,
	)

	const helpRows = [...(isTagModel(modelId) ? HELP_TAGS : HELP_SSML), ...HELP_ALL]
	const help = showHelp
		? h(
				'div',
				{ style: { padding: '8px 10px', borderRadius: 6, background: 'rgba(var(--kp-ink),0.035)', border: `1px solid ${LINE}`, display: 'grid', gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.4fr)', gap: '5px 10px' } },
				...helpRows.flatMap(([code, note]) => [
					h('span', { key: `${code}-c`, style: { fontFamily: MONO, fontSize: 10.5, color: 'var(--kp-violet)', wordBreak: 'break-word' as const } }, code),
					h('span', { key: `${code}-n`, style: { fontSize: 11, color: DIM, lineHeight: 1.4 } }, note),
				]),
			)
		: null

	const editorBlock = h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
		sectionTitle('Text'),
		chips,
		help,
		editor,
		lint.length
			? h(
					'div',
					{ style: { display: 'flex', flexDirection: 'column', gap: 2 } },
					...lint.map(message => h('div', { key: message, style: { color: AMBER, fontSize: 11, lineHeight: 1.4 } }, message)),
				)
			: null,
	)

	const pct = (n: number) => `${Math.round(n * 100)}%`
	const settingsBlock = h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 2 } },
		sectionTitle(
			'Voice settings',
			Object.values(vs).some(value => value !== null)
				? h(
						'span',
						{
							onClick: () => setPrefs(current => ({ ...current, vsByVoice: { ...current.vsByVoice, [current.voiceId]: { ...EMPTY_VS } } })),
							style: { marginLeft: 'auto', textTransform: 'none' as const, letterSpacing: 0, fontWeight: 400, color: FAINT, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 },
						},
						'Reset to voice defaults',
					)
				: null,
		),
		h('div', { style: { height: 4 } }),
		isV3Only(modelId)
			? Row(
					'Stability',
					Segmented({
						value: vs.stability === null ? 'default' : vs.stability <= 0.25 ? '0' : vs.stability >= 0.75 ? '1' : '0.5',
						options: [
							{ value: 'default', label: 'Default', title: 'The voice’s saved setting' },
							{ value: '0', label: 'Creative', title: 'Most expressive and responsive to tags, can drift' },
							{ value: '0.5', label: 'Natural', title: 'Closest to the original voice' },
							{ value: '1', label: 'Robust', title: 'Very steady, follows tags less' },
						],
						onChange: value => setVs({ stability: value === 'default' ? null : Number(value) }),
					}),
					'v3 stability works in three steps',
				)
			: Slider({
					label: 'Stability',
					title: 'Lower is more expressive and varied, higher is steadier and more monotone',
					value: vs.stability,
					fallback: savedVs?.stability as number | undefined,
					min: 0,
					max: 1,
					step: 0.01,
					format: pct,
					onChange: value => setVs({ stability: value }),
				}),
		Slider({
			label: 'Similarity',
			title: 'How closely it sticks to the original voice. Too high can copy artifacts from the samples.',
			value: vs.similarity,
			fallback: savedVs?.similarity_boost as number | undefined,
			min: 0,
			max: 1,
			step: 0.01,
			format: pct,
			onChange: value => setVs({ similarity: value }),
		}),
		model?.canUseStyle
			? Slider({
					label: 'Style',
					title: 'Exaggerates the speaker style. Adds latency, 0 is the most stable.',
					value: vs.style,
					fallback: (savedVs?.style as number | undefined) ?? 0,
					min: 0,
					max: 1,
					step: 0.01,
					format: pct,
					onChange: value => setVs({ style: value }),
				})
			: null,
		Slider({
			label: 'Speed',
			title: '0.7× to 1.2×. Extremes can affect quality.',
			value: vs.speed,
			fallback: (savedVs?.speed as number | undefined) ?? 1,
			min: 0.7,
			max: 1.2,
			step: 0.01,
			format: n => `${n.toFixed(2)}×`,
			onChange: value => setVs({ speed: value }),
		}),
		cloneAllowed
			? Slider({
					label: 'Clone strength',
					title: 'How tightly v4 matches your professional clone samples. ElevenLabs recommends 0 unless the voice drifts.',
					value: vs.clone,
					fallback: 0,
					min: 0,
					max: 1,
					step: 0.01,
					format: pct,
					onChange: value => setVs({ clone: value }),
					resetLabel: 'Model default (0)',
				})
			: null,
		model?.canUseSpeakerBoost
			? Row(
					'Speaker boost',
					Segmented({
						value: vs.boost === null ? 'default' : vs.boost ? 'on' : 'off',
						options: [
							{ value: 'default', label: 'Default' },
							{ value: 'on', label: 'On' },
							{ value: 'off', label: 'Off' },
						],
						onChange: value => setVs({ boost: value === 'default' ? null : value === 'on' }),
					}),
					'Boosts likeness to the original speaker, adds a little latency',
				)
			: null,
	)

	const advCount = [
		adv.seed.trim(),
		languageValue,
		adv.normalization !== 'auto',
		adv.format !== DEFAULT_ADV.format,
		adv.name.trim(),
		adv.previous.trim() || adv.next.trim(),
		adv.dicts.length,
		adv.filter || adv.environment || adv.noise || adv.pan || adv.distance !== null,
		adv.pvcAsIvc && isPvc,
	].filter(Boolean).length

	const smallArea = (value: string, placeholder: string, onChange: (value: string) => void) =>
		h('textarea', {
			value,
			placeholder,
			rows: 2,
			className: 'kino-vo-ta-plain',
			onChange: (event: { target: { value: string } }) => onChange(event.target.value),
			style: { ...input, height: 'auto', minHeight: 44, padding: '5px 8px', lineHeight: 1.4, resize: 'vertical' as const, flex: 1, fontSize: 11.5 },
		})

	const fxOptions = (list: Fx[] | undefined, none: string) => [
		h('option', { key: '', value: '' }, none),
		...(list ?? []).map(item => h('option', { key: item.id, value: item.id, title: plain(item.description) }, plain(item.name))),
	]

	const advancedBlock = h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 4 } },
		h(
			'div',
			{
				onClick: () => setShowAdvanced(open => !open),
				style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' as const, padding: '2px 0' },
			},
			h('span', { style: { color: DIM, fontSize: 10, width: 10 } }, showAdvanced ? '▾' : '▸'),
			sectionTitle('Advanced'),
			advCount ? h('span', { style: { color: TEXT, fontSize: 10.5, padding: '0 5px', borderRadius: 8, background: 'rgba(var(--kp-ink),0.1)' } }, String(advCount)) : null,
			h('span', { style: { color: FAINT, fontSize: 11, marginLeft: 6 } }, 'seed, language, format, context, dictionaries, effects'),
		),
		showAdvanced
			? h(
					'div',
					{ style: { display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 16 } },
					Row(
						'Seed',
						h(
							'div',
							{ style: { display: 'flex', gap: 6, alignItems: 'center', flex: 1 } },
							h('input', {
								value: adv.seed,
								inputMode: 'numeric',
								placeholder: 'random',
								onChange: (event: { target: { value: string } }) => setAdv({ seed: event.target.value.replace(/\D/g, '').slice(0, 10) }),
								style: { ...input, width: 120, fontFamily: MONO },
							}),
							h('span', { style: { color: FAINT, fontSize: 11 } }, prefs.takes > 1 ? 'takes use seed, seed+1, …' : ''),
						),
						'Same seed and settings give a near-identical take. Leave empty for variety.',
					),
					model?.languages && model.languages.length > 1
						? Row(
								'Language',
								Select({
									value: languageValue,
									onChange: value => setAdv({ language: value }),
									options: [
										h('option', { key: '', value: '' }, 'Auto-detect'),
										...model.languages.map(language => h('option', { key: language.id, value: language.id }, `${plain(language.name)} (${language.id})`)),
									],
								}),
								'Forces the language. Auto works for most text.',
							)
						: null,
					Row(
						'Normalization',
						Segmented({
							value: adv.normalization,
							options: [
								{ value: 'auto', label: 'Auto' },
								{ value: 'on', label: 'On' },
								{ value: 'off', label: 'Off' },
							],
							onChange: value => setAdv({ normalization: value }),
						}),
						'Spells out numbers, dates and units before speaking',
					),
					Row(
						'Format',
						Select({ value: adv.format, onChange: value => setAdv({ format: value }), options: FORMATS.map(item => h('option', { key: item.value, value: item.value }, item.label)) }),
						'Some formats need a higher ElevenLabs plan. The API will say so.',
					),
					Row(
						'File name',
						h('input', {
							value: adv.name,
							placeholder: 'from the first words',
							onChange: (event: { target: { value: string } }) => setAdv({ name: event.target.value.slice(0, 80) }),
							style: { ...input, flex: 1 },
						}),
						'Used for the next generation only',
					),
					Row('Previous text', smallArea(adv.previous, 'What comes right before this line', value => setAdv({ previous: value.slice(0, 5000) })), 'Context for continuity, not spoken'),
					Row('Next text', smallArea(adv.next, 'What comes right after this line', value => setAdv({ next: value.slice(0, 5000) })), 'Context for continuity, not spoken'),
					Row(
						'Dictionaries',
						dicts === null
							? h('span', { style: { color: FAINT, fontSize: 11 } }, 'Loading…')
							: dicts.length
								? h(
										'div',
										{ style: { display: 'flex', flexDirection: 'column', gap: 2 } },
										...dicts.map(dict =>
											h(
												'label',
												{ key: dict.id, style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, color: TEXT, cursor: 'pointer' } },
												h('input', {
													type: 'checkbox',
													checked: adv.dicts.includes(dict.id),
													disabled: !adv.dicts.includes(dict.id) && adv.dicts.length >= 3,
													onChange: (event: { target: { checked: boolean } }) =>
														setAdv({ dicts: event.target.checked ? [...adv.dicts, dict.id].slice(0, 3) : adv.dicts.filter(id => id !== dict.id) }),
												}),
												plain(dict.name),
												dict.rules ? h('span', { style: { color: FAINT } }, `${dict.rules} rules`) : null,
											),
										),
									)
								: h('span', { style: { color: FAINT, fontSize: 11 } }, 'None on this account. Create them in ElevenLabs, they show up here.'),
						'Up to 3, applied in order',
					),
					Row(
						'Filter',
						Select({ value: adv.filter, onChange: value => setAdv({ filter: value }), disabled: !effects, options: fxOptions(effects?.filters, 'None') }),
						'Voice character: radio, phone, robot…',
					),
					Row(
						'Space',
						Select({ value: adv.environment, onChange: value => setAdv({ environment: value }), disabled: !effects, options: fxOptions(effects?.environments, 'Dry') }),
						'Room reverb',
					),
					adv.environment
						? Slider({
								label: 'Reverb amount',
								value: adv.sendLevel,
								min: 0,
								max: 1,
								step: 0.01,
								format: pct,
								onChange: value => setAdv({ sendLevel: value ?? 0.3 }),
								resetLabel: 'Default (30%)',
							})
						: null,
					Row(
						'Background',
						Select({ value: adv.noise, onChange: value => setAdv({ noise: value }), disabled: !effects, options: fxOptions(effects?.noises, 'Silence') }),
						'Ambience under the voice',
					),
					Slider({
						label: 'Distance',
						title: 'How far the speaker sounds from the mic',
						value: adv.distance,
						fallback: 0,
						min: 0,
						max: 1,
						step: 0.01,
						format: pct,
						onChange: value => setAdv({ distance: value }),
						resetLabel: 'Off',
					}),
					Slider({
						label: 'Pan',
						value: adv.pan === 0 ? null : adv.pan,
						fallback: 0,
						min: -1,
						max: 1,
						step: 0.05,
						format: n => (Math.abs(n) < 0.01 ? 'C' : n < 0 ? `L${Math.round(-n * 100)}` : `R${Math.round(n * 100)}`),
						onChange: value => setAdv({ pan: value ?? 0 }),
						resetLabel: 'Center',
					}),
					isPvc
						? Row(
								'Instant clone',
								h(
									'label',
									{ style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, color: TEXT, cursor: 'pointer' } },
									h('input', { type: 'checkbox', checked: adv.pvcAsIvc, onChange: (event: { target: { checked: boolean } }) => setAdv({ pvcAsIvc: event.target.checked }) }),
									'Use the instant clone of this voice instead of the fine-tuned one',
								),
								'Lower latency, usually less like you',
							)
						: null,
				)
			: null,
	)

	const compose = h(
		'div',
		{ style: { display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 12px 14px' } },
		voiceBlock,
		modelBlock,
		editorBlock,
		settingsBlock,
		advancedBlock,
	)

	const costLine = blocker
		? blocker
		: chars
			? `${fmtInt(chars)} characters  ·  about ${fmtInt(estimate)} credits${prefs.takes > 1 ? ` for ${prefs.takes} takes` : ''}`
			: 'Nothing to say yet'
	const generateBar = h(
		'div',
		{ style: { borderTop: `1px solid ${LINE}`, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6, background: BG, flexShrink: 0 } },
		confirm
			? h(
					'div',
					{
						style: {
							display: 'flex',
							alignItems: 'center',
							gap: 6,
							padding: '6px 8px',
							borderRadius: 6,
							background: 'rgba(252,211,77,0.08)',
							border: '1px solid rgba(252,211,77,0.25)',
							color: AMBER,
							fontSize: 11.5,
							flexWrap: 'wrap' as const,
						},
					},
					h(
						'span',
						{ style: { flex: 1, minWidth: 160 } },
						`This run uses about ${fmtInt(confirm.estimate)} credits${confirm.remaining !== null ? ` of the ${fmtInt(confirm.remaining)} left` : ''}. Go ahead?`,
					),
					Btn({ primary: true, label: 'Generate', onClick: () => generate(confirm.body, true), style: { height: 22, lineHeight: '22px', fontSize: 11 } }),
					Btn({ label: 'Cancel', onClick: () => setConfirm(null) }),
				)
			: null,
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'center', gap: 8 } },
			h('span', { style: { color: DIM, fontSize: 11 } }, 'Takes'),
			Segmented({
				value: String(prefs.takes),
				options: ['1', '2', '3', '4'].map(value => ({ value, label: value })),
				onChange: value => patch({ takes: Number(value) }),
			}),
			h(
				'span',
				{
					title: remaining !== null ? `${fmtInt(remaining)} credits left until the plan resets` : undefined,
					style: { flex: 1, minWidth: 0, color: overLimit ? AMBER : DIM, fontSize: 11, textAlign: 'right' as const, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
				},
				costLine,
			),
			Btn({
				primary: true,
				label: pending ? 'Generating…' : 'Generate',
				title: `Generate (${MOD_ENTER})`,
				disabled: !canGenerate,
				onClick: generateNow,
			}),
		),
	)

	// ---------- render: versions ----------
	const batches = useMemo(() => {
		const map = new Map<string, Take[]>()
		for (const item of history) {
			const list = map.get(item.batch) ?? []
			list.push(item)
			map.set(item.batch, list)
		}
		const list = [...map.entries()].map(([id, takes]) => ({ id, takes: takes.sort((a, b) => a.take - b.take) }))
		list.sort((a, b) => whenOf(b.takes[0]) - whenOf(a.takes[0]))
		return list
	}, [history])
	const visible = batches.filter(batch => !hidden.includes(batch.id))
	const hiddenCount = batches.length - visible.length

	const playButton = (active: boolean, playing: boolean, onClick: () => void, title: string) =>
		h(
			'button',
			{
				title,
				onMouseDown: keepFocus,
				onClick: (event: { stopPropagation: () => void }) => {
					event.stopPropagation()
					onClick()
				},
				style: {
					width: 26,
					height: 26,
					borderRadius: 13,
					border: 'none',
					padding: 0,
					flexShrink: 0,
					cursor: 'pointer',
					background: active ? TEXT : 'rgba(var(--kp-ink),0.1)',
					color: active ? BG : TEXT,
					fontSize: playing ? 9 : 10,
					lineHeight: '26px',
					fontFamily: UI_FONT,
				},
			},
			playing ? '❚❚' : '▶',
		)

	const takeRow = (take: Take) => {
		if (take.error)
			return h('div', { key: `err-${take.take}`, style: { padding: '5px 0', color: RED, fontSize: 11, lineHeight: 1.4 } }, `V${take.take} failed: ${plain(take.error)}`)
		const key = take.file
		const path = audioPath(take.file)
		const active = now?.key === key
		const playing = Boolean(active && now?.playing)
		const state = busy[key]
		return h(
			'div',
			{ key, className: 'kino-vo-take', style: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px', margin: '0 -4px', borderRadius: 6, flexWrap: 'wrap' as const } },
			playButton(active, playing, () => toggle(key, path), playing ? 'Pause' : 'Play'),
			h('span', { title: take.seed !== null ? `Seed ${take.seed}` : undefined, style: { width: 20, color: active ? 'var(--kp-strong)' : DIM, fontSize: 11, fontWeight: 600 } }, `V${take.take}`),
			h(Wave, {
				key: `wave-${key}`,
				audioKey: key,
				path,
				active,
				audio: audioEl(),
				onSeek: (fraction: number, duration: number) => seek(key, path, fraction, duration),
				onDuration: take.duration == null ? (seconds: number) => noteDuration(key, seconds) : undefined,
			}),
			h('span', { style: { width: 38, textAlign: 'right' as const, color: DIM, fontFamily: MONO, fontSize: 11, flexShrink: 0 } }, fmtSec(take.duration ?? measured[key])),
			h(
				'div',
				{ style: { display: 'flex', gap: 4, alignItems: 'center', marginLeft: 'auto' } },
				Btn({
					label: state === 'timeline' ? 'Placing…' : 'At playhead',
					title: 'Import into Kino and put it on the timeline at the playhead. Uses 2 Kino MCP calls, 1 if the take is already in the library.',
					disabled: Boolean(state),
					onClick: () => importTake(take, true),
					style: { background: 'rgba(var(--kp-ink),0.1)', color: 'var(--kp-strong)' },
				}),
				take.mediaId
					? h('span', { title: `Kino media ${take.mediaId}`, style: { color: 'var(--kp-green)', fontSize: 10.5, padding: '0 2px' } }, 'In library')
					: Btn({ label: state === 'library' ? 'Importing…' : 'Library', title: 'Import into the Kino library only', disabled: Boolean(state), onClick: () => importTake(take, false) }),
				IconBtn('↗', SHOW_IN, () => reveal(take.file)),
			),
		)
	}

	const fxSummary = (req: Req | null) => {
		const fx = req?.audio_effects
		if (!fx) return ''
		const names = [fx.filter_preset_id, fx.environment_id, fx.background_noise_id].filter(Boolean).map(id => {
			const all = [...(effects?.filters ?? []), ...(effects?.environments ?? []), ...(effects?.noises ?? [])]
			return plain(all.find(item => item.id === id)?.name ?? labelOf(String(id)))
		})
		return names.length ? `fx: ${names.join(', ')}` : 'fx'
	}

	const card = { padding: '10px 12px', borderRadius: 8, background: 'rgba(var(--kp-ink),0.03)', border: `1px solid ${LINE}` }
	const batchCard = (batch: { id: string; takes: Take[] }) => {
		const first = batch.takes.find(take => !take.error) ?? batch.takes[0]
		const req = first.request
		const said = typeof req?.text === 'string' ? req.text : first.name
		const meta = [
			first.voiceName || voices?.find(item => item.id === first.voiceId)?.name,
			modelName(first.modelId),
			fmtAgo(whenOf(first)),
			first.characters ? `${fmtInt(first.characters)} chars` : '',
			req?.voice_settings?.speed && req.voice_settings.speed !== 1 ? `${Number(req.voice_settings.speed).toFixed(2)}×` : '',
			fxSummary(req),
		]
			.filter(Boolean)
			.join('  ·  ')
		const reusable = Boolean(requestOf(first))
		return h(
			'div',
			{ key: batch.id, style: card },
			h(
				'div',
				{ style: { display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 } },
				h(
					'div',
					{ style: { flex: 1, minWidth: 0 } },
					h('div', { title: said, style: { ...clamp(3), color: TEXT, fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const } }, said),
					h('div', { style: { marginTop: 3, color: DIM, fontSize: 11 } }, meta),
				),
				h(
					'div',
					{ style: { display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0 } },
					Btn({ label: 'Reuse', title: 'Load this text and its settings into the editor', disabled: !reusable, onClick: () => reuse(first) }),
					Btn({
						label: 'Again',
						title: `New takes of the same text and settings, about ${fmtInt(Math.ceil((req?.text?.trim().length ?? 0) * (sortedModels.find(m => m.id === first.modelId)?.costFactor ?? 1) * (first.takes || 1)))} credits`,
						disabled: !reusable || Boolean(pending) || !ready,
						onClick: () => again(first),
					}),
					IconBtn('×', 'Hide from this list. Files stay in the folder.', () => hide(batch.id)),
				),
			),
			...batch.takes.map(takeRow),
		)
	}

	const pendingCard = (run: Pending, key: string) =>
		h(
			'div',
			{ key, style: { ...card, borderColor: 'rgba(var(--kp-ink),0.14)' } },
			h('div', { style: { ...clamp(3), color: TEXT, fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-wrap' as const, marginBottom: 2 } }, run.text),
			h(
				'div',
				{ style: { color: DIM, fontSize: 11, marginBottom: 6 } },
				`${plain(run.voiceName)}  ·  ${modelName(run.modelId)}  ·  generating ${run.takes} take${run.takes > 1 ? 's' : ''}  ·  ${Math.max(0, Math.round((Date.now() - run.startedAt) / 1000))}s`,
			),
			...Array.from({ length: run.takes }, (_, index) =>
				h(
					'div',
					{ key: index, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' } },
					h('span', { style: { width: 26, height: 26, borderRadius: 13, background: 'rgba(var(--kp-ink),0.06)', flexShrink: 0 } }),
					h('span', { style: { width: 20, color: FAINT, fontSize: 11, fontWeight: 600 } }, `V${index + 1}`),
					h('div', {
						style: {
							flex: 1,
							height: 20,
							borderRadius: 4,
							background: 'linear-gradient(90deg, rgba(var(--kp-ink),0.03) 0%, rgba(var(--kp-ink),0.11) 50%, rgba(var(--kp-ink),0.03) 100%)',
							backgroundSize: '200% 100%',
							animation: `kino-vo-shimmer 1.6s linear ${index * 0.15}s infinite`,
						},
					}),
				),
			),
		)
	// This panel's own run, or the runs the bridge reports when this panel did not start them.
	const pendingCards = pending ? [pendingCard(pending, 'pending')] : remote.map((run, index) => pendingCard(run, `remote-${index}`))

	const outDir = historyDir || status?.outputDir || (IS_WIN ? 'Documents\\ElevenLabs Voiceover' : '~/Documents/ElevenLabs Voiceover')
	// The folder can be changed on a bridge that has the config route (it reports configFile).
	const canMove = Boolean(status?.configFile)
	const dirEditor =
		dirDraft !== null
			? h(
					'div',
					{ style: { ...card, display: 'flex', flexDirection: 'column', gap: 6, color: DIM, fontSize: 11, lineHeight: 1.45 } },
					'New takes are saved to this folder on this computer. Takes already made stay where they are and leave this list.',
					h(
						'div',
						{ style: { display: 'flex', gap: 6, flexWrap: 'wrap' as const } },
						h('input', {
							value: dirDraft,
							autoFocus: true,
							placeholder: status?.defaultDir ?? 'Full path of a folder',
							onChange: (event: { target: { value: string } }) => setDirDraft(event.target.value),
							onKeyDown: (event: { key: string }) => {
								if (event.key === 'Enter' && dirDraft.trim()) saveDir(dirDraft.trim())
								if (event.key === 'Escape') setDirDraft(null)
							},
							style: { ...input, flex: '1 1 200px', fontFamily: MONO, fontSize: 11 },
						}),
						Btn({ primary: true, label: 'Save', disabled: !dirDraft.trim(), onClick: () => saveDir(dirDraft.trim()) }),
						status?.defaultDir && outDir !== status.defaultDir ? Btn({ label: 'Use default', title: status.defaultDir, onClick: () => saveDir(''), style: { height: 26 } }) : null,
						Btn({ label: 'Cancel', onClick: () => setDirDraft(null), style: { height: 26 } }),
					),
				)
			: null
	const versions = h(
		'div',
		{ ref: versionsRef, style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 12px 16px' } },
		h(
			'div',
			{ style: { display: 'flex', alignItems: 'center', gap: 6 } },
			sectionTitle('Versions', visible.length ? h('span', { style: { color: FAINT, fontWeight: 400 } }, String(visible.length)) : null),
			h('span', { style: { flex: 1 } }),
			Btn({ label: 'Folder', title: `Open ${tildify(outDir)}`, onClick: () => reveal() }),
			canMove && dirDraft === null ? Btn({ label: 'Change', title: 'Save takes to another folder', onClick: () => setDirDraft(outDir) }) : null,
		),
		dirEditor,
		...pendingCards,
		...visible.slice(0, batchLimit).map(batchCard),
		visible.length > batchLimit
			? h('div', null, Btn({ label: `Show older (${visible.length - batchLimit})`, onClick: () => setBatchLimit(limit => limit + BATCH_PAGE) }))
			: null,
		!visible.length && !pendingCards.length
			? h(
					'div',
					{ style: { padding: '14px 2px', color: DIM, fontSize: 12, lineHeight: 1.6 } },
					h('div', { style: { color: TEXT, fontWeight: 600, marginBottom: 4 } }, 'No takes yet'),
					`Write something, pick how many takes, press Generate (${MOD_ENTER}). Each take is saved to `,
					h('span', { style: { fontFamily: MONO, color: TEXT, wordBreak: 'break-all' as const } }, tildify(outDir)),
					' with a JSON file of the exact settings beside it, so you can come back to it later.',
				)
			: null,
		hiddenCount
			? h(
					'div',
					{ style: { color: FAINT, fontSize: 11 } },
					`${hiddenCount} hidden. `,
					h('span', { onClick: () => setHidden([]), style: { cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 } }, 'Show all'),
				)
			: null,
	)

	// ---------- render: chrome ----------
	const dot = !connected
		? { ok: 'var(--kp-green-2)', checking: 'var(--kp-muted)', pairing: 'var(--kp-yellow)', unpaired: 'var(--kp-yellow)', outdated: 'var(--kp-yellow)', offline: 'var(--kp-red-2)' }[bridge]
		: ready
			? 'var(--kp-green-2)'
			: 'var(--kp-yellow)'
	const dotTitle = !connected
		? (bridgeMessage(bridge)?.title ?? 'Looking for the Kino bridge')
		: !ready
			? 'Bridge connected. ElevenLabs is not set up yet.'
			: `Bridge connected${status?.sdk ? `, ElevenLabs SDK ${status.sdk}` : ''}.${status?.ffprobe === false ? ` ffprobe was not found, so take lengths are measured here. For exact lengths: ${status.ffprobeInstall ?? 'install ffmpeg'}` : ''}`
	const resetDate = quota?.resetUnix ? new Date(quota.resetUnix * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''
	const header = h(
		'div',
		{
			style: { display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 8px 0 12px', borderBottom: `1px solid ${LINE}`, flexShrink: 0, userSelect: 'none' as const },
		},
		h('span', { title: dotTitle, style: { width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 } }),
		h('span', { style: { color: TEXT, fontSize: 12, fontWeight: 600 } }, 'Voiceover'),
		ready ? h(Boundary, { fallback: null }, h(PlayheadProbe, { sink: playheadRef })) : null,
		h('span', { style: { flex: 1 } }),
		ready && quota
			? h(
					'span',
					{
						title: `${quota.tier ? `${quota.tier[0].toUpperCase()}${quota.tier.slice(1)} plan: ` : ''}${fmtInt(quota.used)} of ${fmtInt(quota.limit)} credits used${resetDate ? `, resets ${resetDate}` : ''}`,
						style: { color: remaining === 0 ? AMBER : DIM, fontSize: 11, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 },
					},
					`${fmtInt(remaining ?? 0)} credits left`,
				)
			: null,
		IconBtn('↻', 'Reload voices, models, credits and versions', () => loadAll(true), !ready),
	)

	// ---------- render: not ready ----------
	// One card in place of the editor: the shared bridge card, or the ElevenLabs setup steps.
	const voiceDir = status?.voiceDir || (IS_WIN ? '%LOCALAPPDATA%\\elevenlabs-voice' : '~/.local/share/elevenlabs-voice')
	const setupCard = (title: string, ...children: unknown[]) =>
		h(
			'div',
			{ style: { display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 440, padding: 14, borderRadius: 8, border: `1px solid ${LINE}`, background: 'rgba(var(--kp-ink),0.03)', color: 'rgba(var(--kp-ink),0.7)', fontSize: 12, lineHeight: 1.5 } },
			h('div', { style: { color: 'var(--kp-strong)', fontSize: 14, fontWeight: 600 } }, title),
			...children,
		)
	const copied = () => say('Copied.')
	const away = !connected
		? bridge === 'checking'
			? h('div', { style: { color: DIM, fontSize: 12, padding: 6 } }, 'Looking for the Kino bridge…')
			: h(BridgeCard, { bridge, note: bridgeNote, uses: 'Voiceover', onPair: pair, onRetry: check })
		: !status
			? setupCard(
					'The speech worker did not answer',
					h('div', { style: { color: RED, wordBreak: 'break-word' as const } }, plain(bridgeNote) || 'No answer from the bridge’s ElevenLabs worker.'),
					h('div', null, 'Press Check again. If it keeps failing, run npm run doctor in the panels folder.'),
					h('div', null, Btn({ primary: true, label: 'Check again', onClick: recheck })),
				)
			: setupCard(
					keyRejected ? 'ElevenLabs did not accept the key' : 'Connect your ElevenLabs account',
					h(
						'div',
						null,
						keyRejected
							? `The key saved on ${MACHINE} was turned down: it may have been revoked or replaced. Connect the account again in ${TERMINAL_APP}:`
							: `Voiceover speaks with your own ElevenLabs account. The key stays in a file on ${MACHINE} that only the speech worker reads: it never reaches this panel. Run these two lines in ${TERMINAL_APP} and approve in the browser page that opens:`,
					),
					CodeLine(`cd "${voiceDir}"`, copied),
					CodeLine('npx -y @elevenlabs/cli@latest onboard connect --env-path .env.local', copied),
					h(
						'div',
						null,
						'Or put the key in by hand: a file named ',
						h('span', { style: { fontFamily: MONO, color: TEXT } }, '.env.local'),
						' in that folder with the line ',
						h('span', { style: { fontFamily: MONO, color: TEXT } }, 'ELEVENLABS_API_KEY=your key'),
						'.',
					),
					h(
						'div',
						{ style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const } },
						Btn({ primary: true, label: 'Check again', title: 'Looks for the key again. No bridge restart needed.', onClick: recheck }),
						canMove ? Btn({ label: 'Open the folder', onClick: () => reveal(undefined, 'keys'), style: { height: 26 } }) : null,
					),
				)
	const awayView = h(
		'div',
		{ className: 'kino-vo-scroll', style: { flex: 1, minHeight: 0, overflowY: 'auto' as const, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center' } },
		away,
	)

	const toast = flash
		? h(
				'div',
				{
					onClick: () => setFlash(null),
					style: {
						position: 'absolute',
						left: 12,
						right: 12,
						bottom: ready ? 58 : 12,
						padding: '8px 10px',
						borderRadius: 6,
						background: flash.tone === 'error' ? 'var(--kp-error-bg)' : 'var(--kp-toast)',
						border: `1px solid ${flash.tone === 'error' ? 'rgba(252,165,165,0.3)' : 'rgba(var(--kp-ink),0.1)'}`,
						color: flash.tone === 'error' ? RED : TEXT,
						fontSize: 12,
						lineHeight: 1.4,
						boxShadow: '0 6px 20px var(--kp-shadow)',
						cursor: 'pointer',
						wordBreak: 'break-word' as const,
						zIndex: 4,
					},
				},
				flash.text,
			)
		: null

	const wide = width >= 760
	const body = !ready
		? awayView
		: wide
			? h(
					'div',
					{ style: { display: 'flex', flex: 1, minHeight: 0 } },
					h(
						'div',
						{ style: { width: '52%', minWidth: 380, maxWidth: 720, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${LINE}` } },
						h('div', { className: 'kino-vo-scroll', style: { flex: 1, minHeight: 0, overflowY: 'auto' as const } }, compose),
						generateBar,
					),
					h('div', { className: 'kino-vo-scroll', style: { flex: 1, minWidth: 0, overflowY: 'auto' as const } }, versions),
				)
			: h(
					'div',
					{ style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } },
					h('div', { className: 'kino-vo-scroll', style: { flex: 1, minHeight: 0, overflowY: 'auto' as const } }, compose, h('div', { style: { borderTop: `1px solid ${LINE}` } }), versions),
					generateBar,
				)

	return h(
		'div',
		{
			ref: rootRef,
			onKeyDown: isolate,
			onKeyUp: isolate,
			onKeyPress: isolate,
			onCopy: isolate,
			onCut: isolate,
			onPaste: isolate,
			style: {
				position: 'relative',
				display: 'flex',
				flexDirection: 'column',
				width: '100%',
				height: '100%',
				minHeight: 0,
				background: BG,
				color: TEXT,
				fontFamily: UI_FONT,
				overflow: 'hidden',
				colorScheme: 'var(--kp-scheme)',
			},
		},
		header,
		body,
		toast,
	)
}
