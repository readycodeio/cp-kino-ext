// What each platform actually receives: which video (original or a bridge render), which cover, and why.
// Zernio already re-encodes for Instagram, Threads and Bluesky before publishing, but it never changes the
// shape: a 16:9 file posted as a Reel stays 16:9, and a 16:9 cover gets cut to the middle. So the panel picks
// the shape here and only renders what Zernio cannot fix: a 9:16 version when there is no vertical cut, and a
// 720p version for X (max 1280x1024) and Bluesky (under 50 MB) when the original is too big.
import { SPEC, baseName, fmtBytes, type Check, type Plan, type PlatformKey } from './lib'

export type Cover = { file: string; name: string; title?: string; w: number; h: number; mtime: number; bytes?: number; url?: string }
// render: bridge preset for the cut; fallback: preset an older bridge knows
export type Source = { key: string; label: string; source: Record<string, string>; render?: string; fallback?: string }
export type Probe = { name?: string; width: number; height: number; duration: number; fps?: number; vcodec?: string; vprofile?: string; acodec?: string; size: number }
export type ProbeState = Probe | { error: string }
export type Shape = '916' | '169'
// what: the outgoing video in a few words; coverLine: the cover in a few words ('' where the platform takes none)
export type Delivery = { shape: Shape | null; video: Source | null; cover: Source | null; coverName: string; what: string; coverLine: string; checks: Check[] }

export const SHAPE_LABEL: Record<Shape, string> = { '916': '9:16', '169': '16:9' }
const MB = 1024 * 1024

// Platforms where Zernio passes a cover on (YouTube gets it through update-metadata after the upload)
const COVERS: PlatformKey[] = ['youtube', 'instagram', 'tiktok', 'facebook', 'linkedin']
// Reels and TikTok are full-screen vertical feeds: a 16:9 file shows letterboxed and its grid tile is cut to the middle
export const VERTICAL_ONLY: PlatformKey[] = ['instagram', 'tiktok']
// [min, max] seconds; X Premium has no practical cap here
const DURATION: Partial<Record<PlatformKey, [number, number]>> = { instagram: [3, 900], tiktok: [3, 600], twitter: [0.5, 140], threads: [0, 300], bluesky: [0, 180] }

export const shapeOf = (w: number, h: number): Shape | null => {
	const r = w / h
	return Math.abs(r - 9 / 16) < 0.02 ? '916' : Math.abs(r - 16 / 9) < 0.03 ? '169' : null
}
export const ratioText = (w: number, h: number) => {
	const s = shapeOf(w, h)
	if (s) return SHAPE_LABEL[s]
	const known: [number, string][] = [[4 / 5, '4:5'], [1, '1:1'], [3 / 4, '3:4'], [4 / 3, '4:3'], [1.91, '1.91:1']]
	const hit = known.find(([r]) => Math.abs(w / h - r) < 0.02)
	return hit ? hit[1] : (w / h).toFixed(2)
}
export const isProbe = (p?: ProbeState): p is Probe => !!p && !('error' in p)
const clock = (seconds: number) => (seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')} min` : `${Math.round(seconds)} s`)
export const probeText = (p?: ProbeState) => (!p ? '' : 'error' in p ? p.error : `${p.width}x${p.height}, ${clock(p.duration)}, ${fmtBytes(p.size)}`)

export const newestCover = (covers: Cover[], shape: Shape) => covers.filter(c => shapeOf(c.w, c.h) === shape).sort((a, b) => b.mtime - a.mtime)[0]
// Picks are stored by file name: the folder differs per computer and must not travel in plan.json
export const coverByName = (covers: Cover[], pick: string) => covers.find(c => c.name === baseName(pick))

// A video is a Kino media id (in the plan, shared) or a file path (kept on this device)
export type LocalPaths = { main: string; vertical: string }
export const mediaSources = (plan: Plan, paths: LocalPaths) => {
	const m = plan.media
	const main: Source | null = m.main ? { key: `m:${m.main}`, label: 'main video', source: { mediaId: m.main } } : paths.main ? { key: `p:${paths.main}`, label: 'main video', source: { path: paths.main } } : null
	const vertical: Source | null = m.vertical ? { key: `m:${m.vertical}`, label: 'vertical video', source: { mediaId: m.vertical } } : paths.vertical ? { key: `p:${paths.vertical}`, label: 'vertical video', source: { path: paths.vertical } } : null
	return { main, vertical }
}
const RENDER_LABEL: Record<string, string> = { vertical: '9:16 cut of the main video', fit720: '720p cut of the main video', x720: '720p cut of the main video, under 50 MB' }
const rendered = (preset: string, from: Source, fallback?: string): Source => ({ key: `r:${preset}:${from.key}`, label: RENDER_LABEL[preset] ?? preset, source: from.source, render: preset, fallback })

// Path sources can change on disk under the same path, so their uploads are never reused
export const cacheable = (key: string) => !/^(r:[\w-]+:)?p:/.test(key)

export const deliveryFor = (k: PlatformKey, plan: Plan, paths: LocalPaths, covers: Cover[], probes: Record<string, ProbeState>): Delivery => {
	const p = plan.platforms[k]
	const checks: Check[] = []
	const add = (level: Check['level'], text: string) => checks.push({ level, text, area: 'video' })
	const { main, vertical } = mediaSources(plan, paths)
	const wantVertical = VERTICAL_ONLY.includes(k) || p.video === 'vertical' || (k === 'facebook' && p.opts.contentType === 'reel')
	let video: Source | null = null
	let probe: ProbeState | undefined
	if (wantVertical) {
		if (vertical) {
			video = vertical
			probe = probes[vertical.key]
			if (isProbe(probe) && shapeOf(probe.width, probe.height) !== '916') add('warn', `The vertical video is ${probe.width}x${probe.height} (${ratioText(probe.width, probe.height)}), not 9:16`)
		} else if (main) {
			probe = probes[main.key]
			video = isProbe(probe) && shapeOf(probe.width, probe.height) === '916' ? main : rendered('vertical', main)
			if (video.render) add('info', 'No vertical cut: gets a 9:16 render of the main video with a blurred fill')
		} else add('fail', 'No video chosen')
	} else if (main) {
		probe = probes[main.key]
		const pr = isProbe(probe) ? probe : null
		// Without a probe the size is unknown, so play safe and render
		if (k === 'twitter' && (!pr || pr.width > 1280 || pr.height > 1024 || pr.size > 512 * MB)) video = rendered('fit720', main, 'x720')
		else if (k === 'bluesky' && (!pr || pr.size > 50 * MB || pr.width > 1920)) video = rendered('x720', main)
		else video = main
	} else add('fail', vertical ? 'No main video. Choose one, or switch this platform to the vertical cut' : 'No video chosen')

	if (probe && 'error' in probe && video?.render) add('fail', `Cannot render the ${video.render === 'vertical' ? '9:16' : '720p'} cut: ${probe.error}`)
	const dur = isProbe(probe) ? probe.duration : 0
	const range = k === 'facebook' && p.opts.contentType === 'reel' ? ([3, 90] as [number, number]) : k === 'twitter' && p.opts.premium ? undefined : DURATION[k]
	const where = `${SPEC[k].label}${k === 'facebook' ? ' Reels' : ''}`
	if (dur && range && dur > range[1]) add('fail', `The video is ${clock(dur)}, ${where} takes up to ${clock(range[1])}`)
	else if (dur && range && dur < range[0]) add('fail', `The video is ${clock(dur)}, ${where} needs at least ${clock(range[0])}`)
	if (k === 'youtube' && wantVertical && dur && dur <= 180) add('info', 'Vertical and 3 minutes or less: YouTube makes it a Short')

	// cover: same shape as the video that goes out
	const shape: Shape | null = video ? (wantVertical ? '916' : '169') : null
	let cover: Source | null = null
	let coverName = ''
	if (shape && COVERS.includes(k)) {
		const pick = shape === '916' ? plan.media.cover916 : plan.media.cover169
		const label = SHAPE_LABEL[shape]
		if (pick !== 'none') {
			const c = pick ? coverByName(covers, pick) : newestCover(covers, shape)
			if (pick && c && shapeOf(c.w, c.h) !== shape) add('warn', `The ${label} cover is ${c.w}x${c.h} (${ratioText(c.w, c.h)}), so it is not sent. Choose a ${label} one`)
			else if (pick && !c && covers.length) add('warn', `The chosen ${label} cover is no longer among the Thumbnails exports`)
			else if (c) {
				// the key holds the file name, not the path: it ends up in plan.json as the upload cache key
				cover = { key: `t:${c.name}:${c.mtime}`, label: `${label} cover`, source: { thumbFile: c.file } }
				coverName = c.title || c.name
				if (k === 'instagram' && !/\.jpe?g$/i.test(c.name)) add('warn', 'Instagram covers should be JPEG')
				if (k === 'youtube' && c.bytes && c.bytes > 2 * MB) add('warn', `The cover is ${fmtBytes(c.bytes)}, YouTube takes up to 2 MB`)
			}
		}
	}
	if (k === 'instagram' && cover) add('info', 'The profile grid shows the middle 3:4 of the cover')

	const what = !video ? 'no video' : video.render ? video.label : `${video.label}${isProbe(probe) ? ` (${probe.width}x${probe.height})` : ''}`
	const coverLine = !COVERS.includes(k) || !video ? '' : cover ? `cover "${coverName}"${k === 'youtube' ? ', set once YouTube has the video' : ''}` : `no cover, ${SPEC[k].label} picks a frame`
	return { shape, video, cover, coverName, what, coverLine, checks }
}

/** The cuts the bridge has to render for these platforms, each one once. */
export const rendersFor = (deliveries: Record<PlatformKey, Delivery>, keys: PlatformKey[]) => {
	const map = new Map<string, Source & { for: PlatformKey[] }>()
	for (const k of keys) {
		const v = deliveries[k]?.video
		if (v?.render) map.set(v.key, { ...v, for: [...(map.get(v.key)?.for ?? []), k] })
	}
	return [...map.values()]
}
