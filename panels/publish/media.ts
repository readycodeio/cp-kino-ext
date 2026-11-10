// What each platform actually receives: which video (original or a bridge render), which cover, and why.
// Zernio already re-encodes for Instagram, Threads and Bluesky before publishing, but it never changes the
// shape: a 16:9 file posted as a Reel stays 16:9, and a 16:9 cover gets cut to the middle. So the panel picks
// the shape here and only renders what Zernio cannot fix: a 9:16 version when there is no vertical cut, and a
// 720p version for X (max 1280x1024) and Bluesky (under 50 MB) when the original is too big.
import { SPEC, fmtBytes, type Check, type Plan, type PlatformKey } from './lib'

export type Cover = { file: string; name: string; title?: string; w: number; h: number; mtime: number; bytes?: number; url?: string }
export type Source = { key: string; label: string; source: Record<string, string>; render?: string }
export type Probe = { name?: string; width: number; height: number; duration: number; fps?: number; vcodec?: string; vprofile?: string; acodec?: string; size: number }
export type ProbeState = Probe | { error: string }
export type Shape = '916' | '169'
export type Delivery = { shape: Shape | null; video: Source | null; cover: Source | null; coverName: string; line: string; checks: Check[] }

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
export const probeText = (p?: ProbeState) => (!p ? '' : 'error' in p ? p.error : `${p.width}x${p.height}, ${Math.round(p.duration)} s, ${fmtBytes(p.size)}`)

export const newestCover = (covers: Cover[], shape: Shape) => covers.filter(c => shapeOf(c.w, c.h) === shape).sort((a, b) => b.mtime - a.mtime)[0]
const coverTitle = (c?: Cover, file?: string) => (c ? c.title || c.name : (file ?? '').split('/').pop() || 'cover')

export const mediaSources = (plan: Plan) => {
	const m = plan.media
	const main: Source | null = m.main ? { key: `m:${m.main}`, label: 'main video', source: { mediaId: m.main } } : m.mainPath ? { key: `p:${m.mainPath}`, label: 'main video', source: { path: m.mainPath } } : null
	const vertical: Source | null = m.vertical ? { key: `m:${m.vertical}`, label: 'vertical video', source: { mediaId: m.vertical } } : m.verticalPath ? { key: `p:${m.verticalPath}`, label: 'vertical video', source: { path: m.verticalPath } } : null
	return { main, vertical }
}
const RENDER_LABEL: Record<string, string> = { vertical: '9:16 version of the main video', x720: '720p version of the main video' }
const rendered = (preset: string, from: Source): Source => ({ key: `r:${preset}:${from.key}`, label: RENDER_LABEL[preset] ?? preset, source: from.source, render: preset })

// Path sources can change on disk under the same path, so their uploads are never reused
export const cacheable = (key: string) => !/^(r:[\w-]+:)?p:/.test(key)

export const deliveryFor = (k: PlatformKey, plan: Plan, covers: Cover[], probes: Record<string, ProbeState>): Delivery => {
	const p = plan.platforms[k]
	const checks: Check[] = []
	const { main, vertical } = mediaSources(plan)
	const wantVertical = VERTICAL_ONLY.includes(k) || p.video === 'vertical' || (k === 'facebook' && p.opts.contentType === 'reel')
	let video: Source | null = null
	let probe: ProbeState | undefined
	if (wantVertical) {
		if (vertical) {
			video = vertical
			probe = probes[vertical.key]
			if (isProbe(probe) && shapeOf(probe.width, probe.height) !== '916') checks.push({ level: 'warn', text: `Vertical video is ${probe.width}x${probe.height} (${ratioText(probe.width, probe.height)}), not 9:16` })
		} else if (main) {
			probe = probes[main.key]
			video = isProbe(probe) && shapeOf(probe.width, probe.height) === '916' ? main : rendered('vertical', main)
			if (video.render) checks.push({ level: 'info', text: 'No vertical cut: sends a 9:16 render of the main video with a blurred fill' })
		} else checks.push({ level: 'fail', text: 'No video picked (Schedule tab)' })
	} else if (main) {
		probe = probes[main.key]
		const pr = isProbe(probe) ? probe : null
		const shrink = k === 'twitter' ? !pr || pr.width > 1280 || pr.height > 1024 || pr.size > 512 * MB : k === 'bluesky' ? !pr || pr.size > 50 * MB || pr.width > 1920 : false
		video = shrink ? rendered('x720', main) : main
	} else checks.push({ level: 'fail', text: vertical ? 'No main 16:9 video. Pick one, or switch this platform to Vertical.' : 'No video picked (Schedule tab)' })

	if (probe && 'error' in probe && video?.render) checks.push({ level: 'fail', text: `Cannot render the ${video.render === 'vertical' ? '9:16' : '720p'} version: ${probe.error}` })
	const dur = isProbe(probe) ? probe.duration : 0
	const range = k === 'facebook' && p.opts.contentType === 'reel' ? ([3, 90] as [number, number]) : k === 'twitter' && p.opts.premium ? undefined : DURATION[k]
	if (dur && range && (dur < range[0] || dur > range[1])) checks.push({ level: 'fail', text: `Video is ${Math.round(dur)} s, ${SPEC[k].label}${k === 'facebook' ? ' Reels' : ''} takes ${range[0]} to ${range[1]} s` })
	if (k === 'youtube' && wantVertical && dur && dur <= 180) checks.push({ level: 'info', text: 'Vertical and 3 min or less: YouTube makes it a Short' })

	// cover: same shape as the video that goes out
	const shape: Shape | null = video ? (wantVertical ? '916' : '169') : null
	let cover: Source | null = null
	let coverName = ''
	if (shape && COVERS.includes(k)) {
		const pick = shape === '916' ? plan.media.cover916 : plan.media.cover169
		const label = SHAPE_LABEL[shape]
		if (pick === 'none') checks.push({ level: 'info', text: `No cover: ${SPEC[k].label} picks a frame` })
		else {
			const c = pick ? covers.find(x => x.file === pick) : newestCover(covers, shape)
			if (pick && c && shapeOf(c.w, c.h) !== shape) checks.push({ level: 'warn', text: `Picked ${label} cover is ${c.w}x${c.h} (${ratioText(c.w, c.h)}), so it is not sent. Pick a ${label} one.` })
			else if (pick && !c && covers.length) checks.push({ level: 'warn', text: `The picked ${label} cover is no longer in the Thumbnails exports` })
			else if (!pick && !c) checks.push({ level: 'warn', text: `No ${label} cover exported yet, so ${SPEC[k].label} picks a frame` })
			else {
				const file = c?.file ?? pick
				cover = { key: `t:${file}:${c?.mtime ?? 0}`, label: `${label} cover`, source: { thumbFile: file } }
				coverName = coverTitle(c, file)
				if (k === 'instagram' && !/\.jpe?g$/i.test(file)) checks.push({ level: 'warn', text: 'Instagram covers should be JPEG' })
				if (k === 'youtube' && c?.bytes && c.bytes > 2 * MB) checks.push({ level: 'warn', text: `Cover is ${fmtBytes(c.bytes)}, YouTube takes up to 2 MB` })
			}
		}
	}
	if (k === 'youtube' && cover) checks.push({ level: 'info', text: 'Thumbnail is set through Zernio right after YouTube has the video' })
	if (k === 'instagram' && cover) checks.push({ level: 'info', text: 'The profile grid shows the middle 3:4 of the cover' })

	const what = !video ? 'no video' : video.render ? video.label : `${video.label}${isProbe(probe) ? ` (${probe.width}x${probe.height})` : ''}`
	const line = `Sends ${what}${COVERS.includes(k) ? (cover ? `, cover "${coverName}"` : ', no cover') : ''}.`
	return { shape, video, cover, coverName, line, checks }
}
