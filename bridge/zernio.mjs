// Zernio routes for the Kino bridge (Publish panel): accounts, TikTok/YouTube options, media upload,
// validation, posting and the post list. Docs: https://docs.zernio.com, spec: https://zernio.com/openapi.json
//
// Key handling
// - The Zernio API key lives only in secrets/zernio.env next to this file (dir 0700, file 0600).
// - It is read per request, sent only to Zernio's API, never returned to the panel and never logged.
// - The panel can replace or remove it (POST /zernio/key, /zernio/key/remove); the reply never echoes it.
// Every /zernio/* route is token-gated by server.mjs before it reaches this module.
//
// v7: local ffmpeg renders so each platform gets a file it accepts (9:16 for Reels/TikTok/Shorts,
// 1080p and 720p fits for feeds), and the YouTube custom thumbnail set after upload through
// update-metadata, because Zernio's YouTube upload does not apply mediaItems[].thumbnail.
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { kinoCall, readBody } from "./thumbs.mjs";
import { IS_WIN, THIS_MACHINE, HOME, DATA_DIR, DOCUMENTS, PROJECTS_DIR, childEnv, findBin, isInside, openUrl } from "./platform.mjs";

const SECRETS_DIR = path.join(DATA_DIR, "secrets");
const KEY_FILE = path.join(SECRETS_DIR, "zernio.env");
const API = (process.env.ZERNIO_API_BASE ?? "https://zernio.com/api").replace(/\/$/, "");
const THUMBS_ROOT = process.env.KINO_THUMBS_DIR ?? path.join(PROJECTS_DIR, "Thumbnails");
const KEY_RE = /^sk_[A-Za-z0-9_-]{16,200}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const PLATFORMS = new Set(["youtube", "tiktok", "instagram", "facebook", "linkedin", "twitter", "threads", "bluesky", "pinterest"]);
const MAX_UPLOAD = 5 * 1024 ** 3; // Zernio presign limit
const MIME = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".webm": "video/webm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

let log = () => {};
export const setLogger = fn => (log = fn);

// ---------- key ----------
const readKey = () => {
  try {
    const match = fs.readFileSync(KEY_FILE, "utf8").match(/^\s*ZERNIO_API_KEY\s*=\s*"?([^"\s]+)"?\s*$/m);
    return match && KEY_RE.test(match[1]) ? match[1] : null;
  } catch {
    return null;
  }
};
const writeKey = key => {
  fs.mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
  if (!IS_WIN) fs.chmodSync(SECRETS_DIR, 0o700); // Windows: the per-user profile folder already limits access
  const tmp = `${KEY_FILE}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `ZERNIO_API_KEY=${key}\n`, { mode: 0o600 });
  fs.renameSync(tmp, KEY_FILE);
  if (!IS_WIN) fs.chmodSync(KEY_FILE, 0o600);
};

// ---------- Zernio API ----------
const fail = (message, status, extra = {}) => Object.assign(new Error(message), { status, ...extra });
// Never hand the bridge's own 401 to the panel for a Zernio auth problem: the panel reads 401 as "re-pair"
const mapStatus = upstream => (upstream === 401 || upstream === 403 ? 424 : upstream >= 500 ? 502 : upstream);

const z = async (method, route, { query, body, key, headers, timeout = 60_000 } = {}) => {
  const secret = key ?? readKey();
  if (!secret) throw fail(`No Zernio API key on ${THIS_MACHINE} yet. Add one under Settings in the Publish panel.`, 412, { code: "no_key" });
  const url = new URL(API + route);
  for (const [name, value] of Object.entries(query ?? {})) if (value !== undefined && value !== null && value !== "") url.searchParams.set(name, String(value));
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${secret}`, accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    throw fail(`Could not reach Zernio (${error.name === "TimeoutError" ? "timed out" : error.message}).`, 502);
  }
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  const scrub = value => (typeof value === "string" ? value.split(secret).join("[key]") : value);
  if (!response.ok && response.status !== 207) {
    const message =
      response.status === 401
        ? "Zernio rejected the API key. Replace it under Settings."
        : scrub(typeof data.error === "string" ? data.error : typeof data.message === "string" ? data.message : `Zernio returned ${response.status}.`);
    throw fail(message, mapStatus(response.status), {
      upstream: response.status,
      code: data.code ?? (response.status === 401 ? "zernio_key" : undefined),
      param: data.param,
      platform: data.platform,
      details: data.details,
      retryAfter: response.headers.get("retry-after") ?? undefined,
    });
  }
  return { status: response.status, data };
};

// Only the fields the panel shows; account objects carry metadata we have no use for
const slimAccount = a => ({
  id: a._id,
  platform: a.platform,
  username: a.username ?? null,
  displayName: a.displayName ?? null,
  picture: a.profilePicture ?? null,
  url: a.profileUrl ?? null,
  profileId: typeof a.profileId === "object" && a.profileId ? a.profileId._id ?? null : a.profileId ?? null,
  active: a.isActive !== false,
  needsReconnection: !!a.needsReconnection,
  tiktokAccountType: a.tiktokAccountType ?? null,
  rateLimitedUntil: a.rateLimitedUntil ?? null,
});

// ---------- payload checks ----------
const isHttpsUrl = value => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};
const checkMedia = (items, where) => {
  if (items === undefined) return;
  if (!Array.isArray(items) || items.length > 35) throw fail(`${where}: mediaItems must be a list.`, 400);
  for (const item of items) {
    if (!item || typeof item !== "object" || !isHttpsUrl(item.url)) throw fail(`${where}: every media item needs an https url.`, 400);
    for (const key of ["thumbnail", "instagramThumbnail"]) if (item[key] !== undefined && !isHttpsUrl(item[key])) throw fail(`${where}: ${key} must be an https url.`, 400);
  }
};
const checkPost = payload => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw fail("Missing post payload.", 400);
  if (JSON.stringify(payload).length > 256 * 1024) throw fail("Post payload too large.", 413);
  const platforms = payload.platforms ?? [];
  if (!Array.isArray(platforms) || platforms.length > 20) throw fail("platforms must be a list.", 400);
  if (!platforms.length && !payload.isDraft) throw fail("Pick at least one platform.", 400);
  for (const p of platforms) {
    if (!p || !PLATFORMS.has(p.platform)) throw fail(`Unsupported platform: ${p?.platform ?? "?"}.`, 400);
    if (!ID_RE.test(String(p.accountId ?? ""))) throw fail(`Pick an account for ${p.platform}.`, 400);
    checkMedia(p.customMedia, p.platform);
  }
  checkMedia(payload.mediaItems, "post");
  if (payload.scheduledFor !== undefined && Number.isNaN(Date.parse(payload.scheduledFor))) throw fail("scheduledFor is not a valid date.", 400);
  if (payload.timezone !== undefined && !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$|^UTC$/.test(payload.timezone)) throw fail("timezone must be an IANA name.", 400);
};

// ---------- media upload ----------
const jobs = new Map(); // jobId -> { state, name, bytes, total, publicUrl?, error? }
const sweepJobs = () => {
  const cutoff = Date.now() - 6 * 3600_000;
  for (const [id, job] of jobs) if (job.started < cutoff) jobs.delete(id);
};

const insideDir = (root, candidate) => {
  const resolved = path.resolve(String(candidate ?? ""));
  return isInside(root, resolved) ? resolved : null;
};

const resolveSource = async source => {
  let file = null;
  if (source?.mediaId) {
    if (!ID_RE.test(String(source.mediaId))) throw fail("Invalid media id.", 400);
    const info = await kinoCall("getMediaFile", { mediaId: source.mediaId }, 30_000);
    file = info.localPath ?? null;
    // Cloud-only original (e.g. imported on another machine): stream it from Kino's storage instead
    if (!file && isHttpsUrl(info.originalDownloadUrl)) {
      const name = path.basename(String(info.filename ?? "video.mp4"));
      const mime = MIME[path.extname(name).toLowerCase()];
      if (!mime) throw fail(`Zernio cannot take ${path.extname(name) || "this"} files here. Use MP4, MOV, WebM, PNG, JPEG or WebP.`, 400);
      return { remote: info.originalDownloadUrl, name, size: null, mime, mtime: null };
    }
    if (!file) throw fail(`Kino has no original for this media on ${THIS_MACHINE} or in the cloud. Relink the original in Kino, then try again.`, 409);
  } else if (source?.thumbFile) {
    file = insideDir(THUMBS_ROOT, source.thumbFile);
    if (!file) throw fail("That cover is not in the Thumbnails folder.", 400);
  } else if (source?.path) {
    // An exported render picked by path. Media files under the home (or Documents) folder only, never hidden folders.
    const resolved = path.resolve(String(source.path));
    const allowed = isInside(HOME, resolved) || isInside(DOCUMENTS, resolved);
    if (!allowed || resolved.split(path.sep).some(part => part.startsWith("."))) throw fail("Pick a media file inside your home folder.", 400);
    file = resolved;
  } else throw fail("Nothing to upload.", 400);
  const ext = path.extname(file).toLowerCase();
  const mime = MIME[ext];
  if (!mime) throw fail(`Zernio cannot take ${ext || "this"} files here. Use MP4, MOV, WebM, PNG, JPEG or WebP.`, 400);
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    throw fail(`File not found: ${path.basename(file)}`, 404);
  }
  if (!stat.isFile()) throw fail("Not a file.", 400);
  if (stat.size > MAX_UPLOAD) throw fail("Zernio uploads are limited to 5 GB.", 413);
  return { file, name: path.basename(file), size: stat.size, mime, mtime: stat.mtimeMs };
};

// Open a GET on Kino's signed storage URL; resolves with the response stream and its length
const openRemote = url =>
  new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 60_000 }, response => {
        const size = Number(response.headers["content-length"]);
        if (response.statusCode !== 200 || !size) {
          response.resume();
          reject(new Error(`Could not read the cloud original (${response.statusCode}).`));
        } else resolve({ stream: response, size });
      })
      .on("timeout", function () {
        this.destroy(new Error("Cloud original timed out."));
      })
      .on("error", reject);
  });

const putStream = (uploadUrl, stream, size, mime, job) =>
  new Promise((resolve, reject) => {
    const request = https.request(uploadUrl, { method: "PUT", headers: { "content-type": mime, "content-length": size }, timeout: 120_000 }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.length < 20 && chunks.push(chunk));
      response.on("end", () =>
        response.statusCode >= 200 && response.statusCode < 300
          ? resolve()
          : reject(new Error(`Storage upload failed (${response.statusCode}): ${Buffer.concat(chunks).toString("utf8").slice(0, 200)}`)),
      );
    });
    request.on("timeout", () => request.destroy(new Error("Storage upload stalled.")));
    request.on("error", reject);
    stream.on("data", chunk => (job.bytes += chunk.length));
    stream.on("error", error => request.destroy(error));
    stream.pipe(request);
  });

const startUpload = async source => {
  if (!readKey()) throw fail(`No Zernio API key on ${THIS_MACHINE} yet. Add one under Settings in the Publish panel.`, 412, { code: "no_key" });
  const target = await resolveSource(source);
  sweepJobs();
  const id = randomUUID();
  const job = { id, state: "presigning", name: target.name, bytes: 0, total: target.size ?? 0, mime: target.mime, started: Date.now() };
  jobs.set(id, job);
  let remote = null;
  (async () => {
    remote = target.remote ? await openRemote(target.remote) : null;
    const size = remote ? remote.size : target.size;
    if (size > MAX_UPLOAD) throw new Error("Zernio uploads are limited to 5 GB.");
    job.total = size;
    const { data } = await z("POST", "/v1/media/presign", { body: { filename: target.name, contentType: target.mime, size } });
    if (!isHttpsUrl(data.uploadUrl) || !isHttpsUrl(data.publicUrl)) throw new Error("Zernio returned no upload URL.");
    job.state = "uploading";
    await putStream(data.uploadUrl, remote ? remote.stream : fs.createReadStream(target.file), size, target.mime, job);
    job.state = "done";
    job.publicUrl = data.publicUrl;
    job.finished = Date.now();
    log("zernio-upload", { name: target.name, bytes: size, source: remote ? "cloud" : "local", ms: job.finished - job.started });
  })().catch(error => {
    remote?.stream.destroy(); // do not leave a half-read cloud download open
    job.state = "error";
    job.error = error.message;
    log("zernio-upload-error", { name: target.name, error: error.message.slice(0, 200) });
  });
  return { jobId: id, name: target.name, total: target.size, mime: target.mime, mtime: target.mtime, source: target.remote ? "cloud" : "local" };
};

// ---------- renders (local ffmpeg) ----------
// Platform-safe copies of a video, cached by source identity + preset in <Documents>/KinoProjects/Publish/<projectId>/.
// Specs: Instagram Reels max 1920 columns, 23-60 fps, AAC 48 kHz, moov first, no edit lists
// (developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media);
// X posts max 1280x1024 (docs.x.com/x-api/media/quickstart/best-practices); Bluesky per Zernio's
// prepare target: 1080 wide, 180 s, under 50 MB; Threads per Zernio: H.264 Baseline.
const FFMPEG = process.env.KINO_FFMPEG ?? findBin("ffmpeg");
const FFPROBE = process.env.KINO_FFPROBE ?? findBin("ffprobe");
const RENDER_ROOT = process.env.KINO_PUBLISH_DIR ?? path.join(PROJECTS_DIR, "Publish");
const RENDER_VERSION = 1; // bump to invalidate cached renders when presets change
export const PRESETS = {
  vertical: { w: 1080, h: 1920, fill: "blur", profile: "main", crf: 20, maxrate: 8e6, label: "9:16 1080x1920" },
  "vertical-baseline": { w: 1080, h: 1920, fill: "blur", profile: "baseline", crf: 20, maxrate: 8e6, label: "9:16 1080x1920 Baseline" },
  hd: { w: 1920, h: 1080, fill: "fit", profile: "high", crf: 20, maxrate: 10e6, label: "fit 1920x1080" },
  x720: { w: 1280, h: 720, fill: "fit", profile: "high", crf: 22, maxrate: 5e6, maxBytes: 48 * 1024 ** 2, label: "fit 1280x720, under 50 MB" },
};

const run = (bin, args, timeout = 30_000) =>
  new Promise((resolve, reject) =>
    execFile(bin, args, { timeout, maxBuffer: 4 * 1024 * 1024, env: childEnv(), windowsHide: true }, (error, stdout, stderr) => (error ? reject(new Error(String(stderr || error.message).trim().split("\n").slice(-2).join(" ").slice(0, 300))) : resolve(stdout))),
  );

const probeFile = async file => {
  const out = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration,size:stream=codec_type,codec_name,profile,width,height,avg_frame_rate,r_frame_rate:stream_side_data=rotation", "-of", "json", file]);
  const info = JSON.parse(out);
  const video = (info.streams ?? []).find(s => s.codec_type === "video");
  const audio = (info.streams ?? []).find(s => s.codec_type === "audio");
  if (!video) throw fail("No video stream in that file.", 400);
  const rotation = Math.abs(Number(video.side_data_list?.find(d => d.rotation !== undefined)?.rotation ?? 0)) % 180 === 90;
  const rate = String(video.avg_frame_rate && video.avg_frame_rate !== "0/0" ? video.avg_frame_rate : video.r_frame_rate ?? "30/1").split("/");
  const fps = Number(rate[0]) / (Number(rate[1]) || 1) || 30;
  return {
    width: rotation ? video.height : video.width,
    height: rotation ? video.width : video.height,
    duration: Number(info.format?.duration) || 0,
    fps: Math.round(fps * 100) / 100,
    vcodec: video.codec_name,
    vprofile: video.profile ?? null,
    acodec: audio?.codec_name ?? null,
    size: Number(info.format?.size) || fs.statSync(file).size,
  };
};

const localVideo = async source => {
  const target = await resolveSource(source);
  if (target.remote) throw fail(`The original of this video is not on ${THIS_MACHINE}, so it cannot be re-encoded here. Relink it in Kino or pick an exported file by path.`, 409);
  if (!target.mime.startsWith("video/")) throw fail("That is not a video file.", 400);
  return target;
};

const even = n => Math.max(2, Math.round(n / 2) * 2);
const renderArgs = (input, output, probe, preset) => {
  const p = PRESETS[preset];
  const fps = probe.fps < 23 || probe.fps > 60 ? 30 : null;
  const tail = `${fps ? `,fps=${fps}` : ""},setsar=1,format=yuv420p[v]`;
  let graph;
  if (p.fill === "blur") {
    // Foreground fits inside 1080x1920; a dimmed, blurred cover-crop of the same frame fills the rest
    graph =
      `[0:v]scale=w='min(iw,1920)':h='min(ih,1920)':force_original_aspect_ratio=decrease,split=2[s1][s2];` +
      `[s1]scale=${p.w}:${p.h}:force_original_aspect_ratio=increase,crop=${p.w}:${p.h},scale=${p.w / 4}:${p.h / 4},gblur=sigma=10,scale=${p.w}:${p.h},eq=brightness=-0.07:saturation=0.85[bg];` +
      `[s2]scale=${p.w}:${p.h}:force_original_aspect_ratio=decrease:force_divisible_by=2[fg];` +
      `[bg][fg]overlay=(W-w)/2:(H-h)/2${tail}`;
  } else {
    // Fit inside the box (portrait sources use the box turned sideways), never upscale
    const [bw, bh] = probe.height > probe.width ? [p.h, p.w] : [p.w, p.h];
    const scale = Math.min(1, bw / probe.width, bh / probe.height);
    graph = `[0:v]scale=${even(probe.width * scale)}:${even(probe.height * scale)}${tail}`;
  }
  let maxrate = p.maxrate;
  if (p.maxBytes && probe.duration > 0) maxrate = Math.min(maxrate, Math.floor(((p.maxBytes * 8) / probe.duration) * 0.92 - 128_000));
  if (maxrate < 300_000) throw fail("This video is too long to fit that platform's size limit.", 422);
  return [
    "-hide_banner", "-nostdin", "-y", "-i", input,
    "-filter_complex", graph, "-map", "[v]", "-map", "0:a:0?",
    "-c:v", "libx264", "-preset", "fast", "-crf", String(p.crf), "-maxrate", String(maxrate), "-bufsize", String(maxrate * 2),
    "-profile:v", p.profile, "-pix_fmt", "yuv420p", "-g", String(Math.round((fps ?? probe.fps) * 2)),
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart", "-use_editlist", "0", "-map_metadata", "-1",
    "-progress", "pipe:1", "-nostats", "-f", "mp4", output,
  ];
};

const renders = new Map(); // jobId -> { id, state, preset, progress, file?, size?, error?, started }
let renderQueue = Promise.resolve(); // one ffmpeg at a time
const running = new Set();

const startRender = async (projectId, source, preset) => {
  if (!PRESETS[preset]) throw fail("Unknown render preset.", 400);
  const target = await localVideo(source);
  const key = createHash("sha1").update(JSON.stringify([target.file, target.size, target.mtime, preset, PRESETS[preset], RENDER_VERSION])).digest("hex").slice(0, 10);
  const base = path.basename(target.name, path.extname(target.name)).replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "video";
  const dir = path.join(RENDER_ROOT, projectId);
  const output = path.join(dir, `${base}-${preset}-${key}.mp4`);
  for (const job of renders.values()) if (job.file === output && job.state !== "error") return job;
  const id = randomUUID();
  const job = { id, state: "queued", preset, label: PRESETS[preset].label, progress: 0, file: output, started: Date.now() };
  renders.set(id, job);
  if (fs.existsSync(output)) {
    Object.assign(job, { state: "done", progress: 1, size: fs.statSync(output).size, cached: true, probe: await probeFile(output) });
    return job;
  }
  renderQueue = renderQueue.then(async () => {
    try {
      job.state = "rendering";
      const probe = await probeFile(target.file);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${output}.part-${process.pid}`;
      await new Promise((resolve, reject) => {
        const child = spawn(FFMPEG, renderArgs(target.file, tmp, probe, preset), { stdio: ["ignore", "pipe", "pipe"], env: childEnv(), windowsHide: true });
        running.add(child);
        let err = "";
        child.stdout.on("data", chunk => {
          const m = String(chunk).match(/out_time_us=(\d+)/g);
          if (m && probe.duration) job.progress = Math.min(0.99, Number(m[m.length - 1].split("=")[1]) / 1e6 / probe.duration);
        });
        child.stderr.on("data", chunk => (err = (err + chunk).slice(-2000)));
        child.on("error", reject);
        child.on("close", code => {
          running.delete(child);
          code === 0 ? resolve() : reject(new Error(err.trim().split("\n").slice(-2).join(" ").slice(0, 300) || `ffmpeg exited ${code}`));
        });
      });
      const size = fs.statSync(tmp).size;
      const max = PRESETS[preset].maxBytes;
      if (max && size > max * 1.04) throw new Error(`The render came out at ${(size / 1024 ** 2).toFixed(1)} MB, over the ${Math.round(max / 1024 ** 2)} MB budget.`);
      fs.renameSync(tmp, output);
      Object.assign(job, { state: "done", progress: 1, size, probe: await probeFile(output), finished: Date.now() });
      log("zernio-render", { preset, name: path.basename(output), bytes: size, ms: job.finished - job.started });
    } catch (error) {
      for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) if (f.startsWith(path.basename(output) + ".part-")) fs.rmSync(path.join(dir, f), { force: true });
      Object.assign(job, { state: "error", error: error.message });
      log("zernio-render-error", { preset, error: String(error.message).slice(0, 200) });
    }
  });
  return job;
};
const publicJob = ({ id, state, preset, label, progress, file, size, error, cached, probe }) => ({ id, state, preset, label, progress, file, size, error, cached: !!cached, probe });

// ---------- HTTP ----------
const need = (value, re, what) => {
  if (!re.test(String(value ?? ""))) throw fail(`Invalid ${what}.`, 400);
  return String(value);
};

export const handleZernio = async (req, res, url, json) => {
  const q = url.searchParams;
  try {
    // Key status without revealing it. verify=1 also checks it against Zernio.
    if (req.method === "GET" && url.pathname === "/zernio/status") {
      const key = readKey();
      if (!key) return json(200, { configured: false });
      if (q.get("verify") !== "1") return json(200, { configured: true });
      try {
        const { data } = await z("GET", "/v1/profiles", { key, timeout: 15_000 });
        return json(200, { configured: true, verified: true, profiles: (data.profiles ?? []).length });
      } catch (error) {
        return json(200, { configured: true, verified: false, error: error.message });
      }
    }
    if (req.method === "POST" && url.pathname === "/zernio/key") {
      const body = await readBody(req, 4 * 1024);
      const key = String(body.key ?? "").trim();
      if (!KEY_RE.test(key)) return json(400, { error: "That does not look like a Zernio API key (sk_...)." });
      const { data } = await z("GET", "/v1/profiles", { key, timeout: 15_000 }); // throws 424 if Zernio rejects it
      writeKey(key);
      log("zernio-key-set", { profiles: (data.profiles ?? []).length });
      return json(200, { ok: true, profiles: (data.profiles ?? []).length });
    }
    if (req.method === "POST" && url.pathname === "/zernio/key/remove") {
      fs.rmSync(KEY_FILE, { force: true });
      log("zernio-key-removed");
      return json(200, { ok: true });
    }
    if (req.method === "GET" && url.pathname === "/zernio/profiles") {
      const { data } = await z("GET", "/v1/profiles");
      return json(200, { profiles: (data.profiles ?? []).map(p => ({ id: p._id, name: p.name, timezone: p.timezone ?? null, isDefault: !!p.isDefault, accountCount: p.accountCount ?? null })) });
    }
    if (req.method === "GET" && url.pathname === "/zernio/accounts") {
      const profileId = q.get("profileId");
      const { data } = await z("GET", "/v1/accounts", { query: { profileId: profileId ? need(profileId, ID_RE, "profile") : undefined, category: "social" } });
      return json(200, { accounts: (data.accounts ?? []).map(slimAccount) });
    }
    if (req.method === "POST" && url.pathname === "/zernio/connect") {
      // Opens the platform's OAuth page in the default browser; the user approves the connection there
      const body = await readBody(req, 4 * 1024);
      const platform = String(body.platform ?? "");
      if (!PLATFORMS.has(platform)) return json(400, { error: "Unsupported platform." });
      const { data } = await z("GET", `/v1/connect/${platform}`, { query: { profileId: need(body.profileId, ID_RE, "profile") } });
      if (!isHttpsUrl(data.authUrl)) return json(502, { error: "Zernio returned no connect link." });
      openUrl(data.authUrl);
      log("zernio-connect", { platform });
      return json(200, { opened: true });
    }
    if (req.method === "GET" && url.pathname === "/zernio/tiktok/creator-info") {
      const id = need(q.get("accountId"), ID_RE, "account");
      const { data } = await z("GET", `/v1/accounts/${id}/tiktok/creator-info`, { query: { mediaType: q.get("mediaType") === "photo" ? "photo" : "video" } });
      return json(200, data);
    }
    if (req.method === "GET" && url.pathname === "/zernio/youtube/playlists") {
      const id = need(q.get("accountId"), ID_RE, "account");
      const { data } = await z("GET", `/v1/accounts/${id}/youtube-playlists`);
      return json(200, { playlists: (data.playlists ?? []).map(p => ({ id: p.id, title: p.title, privacy: p.privacy })), defaultPlaylistId: data.defaultPlaylistId ?? null });
    }
    if (req.method === "GET" && url.pathname === "/zernio/usage") {
      return json(200, (await z("GET", "/v1/usage")).data);
    }
    if (req.method === "GET" && url.pathname === "/zernio/posts") {
      const profileId = q.get("profileId");
      const { data } = await z("GET", "/v1/posts", {
        query: { limit: Math.min(50, Number(q.get("limit")) || 20), page: Math.max(1, Number(q.get("page")) || 1), profileId: profileId ? need(profileId, ID_RE, "profile") : undefined, sortBy: "created-desc" },
      });
      return json(200, { posts: data.posts ?? [], pagination: data.pagination ?? null });
    }
    if (req.method === "GET" && url.pathname === "/zernio/post") {
      return json(200, (await z("GET", `/v1/posts/${need(q.get("id"), ID_RE, "post id")}`)).data);
    }
    if (req.method === "POST" && url.pathname === "/zernio/posts/delete") {
      const body = await readBody(req, 4 * 1024);
      const id = need(body.id, ID_RE, "post id");
      const { data } = await z("DELETE", `/v1/posts/${id}`);
      log("zernio-post-deleted", { id });
      return json(200, data);
    }
    if (req.method === "POST" && url.pathname === "/zernio/posts/retry") {
      const body = await readBody(req, 4 * 1024);
      const id = need(body.id, ID_RE, "post id");
      const { data } = await z("POST", `/v1/posts/${id}/retry`, { timeout: 15 * 60_000 });
      log("zernio-post-retry", { id });
      return json(200, data);
    }
    if (req.method === "POST" && url.pathname === "/zernio/validate") {
      const body = await readBody(req, 300 * 1024);
      checkPost({ ...body.payload, isDraft: true });
      const { content, platforms, mediaItems } = body.payload;
      return json(200, (await z("POST", "/v1/tools/validate/post", { body: { content, platforms, mediaItems } })).data);
    }
    if (req.method === "POST" && url.pathname === "/zernio/media/upload") {
      const body = await readBody(req, 8 * 1024);
      return json(200, await startUpload(body.source));
    }
    if (req.method === "GET" && url.pathname === "/zernio/media/upload/status") {
      const job = jobs.get(need(q.get("id"), /^[0-9a-f-]{36}$/i, "upload id"));
      if (!job) return json(404, { error: "Unknown upload. The bridge may have restarted." });
      const { state, name, bytes, total, publicUrl, error } = job;
      return json(200, { state, name, bytes, total, publicUrl, error });
    }
    if (req.method === "POST" && url.pathname === "/zernio/posts/create") {
      const body = await readBody(req, 300 * 1024);
      // The panel sends confirm only after its confirmation dialog
      if (body.confirm !== true) return json(400, { error: "Posting needs confirmation in the panel." });
      checkPost(body.payload);
      const key = /^[\w-]{8,255}$/.test(String(body.idempotencyKey ?? "")) ? String(body.idempotencyKey) : randomUUID();
      const now = body.payload.publishNow === true;
      const { status, data } = await z("POST", "/v1/posts", { body: body.payload, headers: { "idempotency-key": key }, timeout: now ? 20 * 60_000 : 120_000 });
      log("zernio-post", {
        id: data.post?._id,
        status: data.post?.status,
        http: status,
        platforms: (body.payload.platforms ?? []).map(p => p.platform),
        mode: now ? "now" : body.payload.isDraft ? "draft" : "scheduled",
      });
      return json(200, { ...data, http: status, idempotencyKey: key });
    }
    if (req.method === "POST" && url.pathname === "/zernio/media/probe") {
      const body = await readBody(req, 8 * 1024);
      const target = await localVideo(body.source);
      return json(200, { name: target.name, ...(await probeFile(target.file)) });
    }
    if (req.method === "POST" && url.pathname === "/zernio/media/render") {
      const body = await readBody(req, 8 * 1024);
      return json(200, publicJob(await startRender(need(body.projectId, ID_RE, "project id"), body.source, String(body.preset ?? ""))));
    }
    if (req.method === "GET" && url.pathname === "/zernio/media/render/status") {
      const job = renders.get(need(q.get("id"), /^[0-9a-f-]{36}$/i, "render id"));
      if (!job) return json(404, { error: "Unknown render. The bridge may have restarted." });
      return json(200, publicJob(job));
    }
    if (req.method === "POST" && url.pathname === "/zernio/youtube/thumbnail") {
      // Sets the custom thumbnail on the YouTube copy of a Zernio post. Needs a phone-verified channel.
      const body = await readBody(req, 8 * 1024);
      if (body.confirm !== true) return json(400, { error: "Setting a thumbnail needs confirmation in the panel." });
      const id = need(body.postId, ID_RE, "post id");
      if (!isHttpsUrl(body.thumbnailUrl)) return json(400, { error: "The thumbnail needs a public https URL. Upload the cover first." });
      const accountId = body.accountId ? need(body.accountId, ID_RE, "account") : undefined;
      const { data } = await z("POST", `/v1/posts/${id}/update-metadata`, { body: { platform: "youtube", thumbnailUrl: body.thumbnailUrl, accountId }, timeout: 180_000 });
      log("zernio-yt-thumbnail", { id, fields: data.updatedFields });
      return json(200, data);
    }
    return json(404, { error: "not found" });
  } catch (error) {
    log("zernio-error", { path: url.pathname, status: error.status, upstream: error.upstream, error: String(error.message).slice(0, 300) });
    return json(error.status ?? 500, { error: error.message, code: error.code, param: error.param, platform: error.platform, details: error.details, retryAfter: error.retryAfter });
  }
};

export const closeZernio = () => {
  jobs.clear();
  for (const child of running) child.kill("SIGTERM");
};
