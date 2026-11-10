// YouTube downloader routes for the Kino bridge, backed by the @kevinwatt/yt-dlp-mcp MCP server.
//
// The bridge is an MCP client: it spawns the pinned yt-dlp-mcp package over stdio and calls its
// tools. Every /ytdl/* route is token-gated by server.mjs before it reaches this module.
// Downloads go to DOWNLOADS_DIR, never into a Kino project mount.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { HOME, childEnv as baseEnv, isInside, reveal } from "./platform.mjs";

// Resolve the pinned yt-dlp-mcp entry from wherever npm put node_modules (repo root). The package only
// exports "." for import, so ask the ESM resolver (synchronous since Node 20.6).
const MCP_ENTRY = fileURLToPath(import.meta.resolve("@kevinwatt/yt-dlp-mcp"));
export const DOWNLOADS_DIR = process.env.KINO_YTDL_DIR ?? path.join(HOME, "Downloads", "Kino YouTube");
// macOS: Homebrew first (see platform.mjs), so its current yt-dlp and deno win. Windows: the user's
// PATH, where winget puts yt-dlp, deno and ffmpeg.
const MAX_RUNNING = 2;
const MAX_JOBS = 60;
const DOWNLOAD_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const QUICK_TIMEOUT_MS = 90 * 1000;
const RESOLUTIONS = new Set(["480p", "720p", "1080p", "best"]);
const KINDS = new Set(["video", "audio", "transcript"]);
const TIME = /^\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/;
const LANG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
const MEDIA_EXT = /\.(mp4|webm|mkv|mov|m4a|mp3|opus|ogg|wav|aac|flac|txt|vtt|srt)$/i;
const PARTIAL = /\.(part|ytdl|temp)$|\.part-Frag\d+|\.temp\./i;

let log = () => {};
export const setLogger = fn => (log = fn);

fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

// ---------- MCP client ----------
const childEnv = () => baseEnv({ YTDLP_DOWNLOADS_DIR: DOWNLOADS_DIR });

let clientPromise = null;
const getClient = () => {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [MCP_ENTRY],
      env: childEnv(),
      cwd: DOWNLOADS_DIR,
      stderr: "pipe",
    });
    transport.stderr?.on("data", data => {
      const line = String(data).trim();
      if (line) log("ytdl-mcp-stderr", { line: line.slice(0, 400) });
    });
    const client = new Client({ name: "kino-ytdl-panel", version: "1.0.0" });
    client.onclose = () => {
      clientPromise = null;
      log("ytdl-mcp-closed");
    };
    await client.connect(transport);
    log("ytdl-mcp-ready");
    return client;
  })().catch(error => {
    clientPromise = null;
    throw error;
  });
  return clientPromise;
};

const callTool = async (name, args, timeout = QUICK_TIMEOUT_MS) => {
  const client = await getClient();
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout });
  const text = (result.content ?? []).filter(part => part.type === "text").map(part => part.text).join("\n");
  if (result.isError) throw new Error(cleanError(text) || `${name} failed`);
  return text;
};

const cleanError = text =>
  String(text ?? "")
    .split("\n")
    .filter(line => !/^Deprecated Feature|^WARNING:/.test(line.trim()))
    .join("\n")
    .trim()
    .slice(0, 600);

export const closeYtdl = async () => {
  const pending = clientPromise;
  clientPromise = null;
  try {
    await (await pending)?.close();
  } catch {}
};

// ---------- helpers ----------
const isHttpUrl = value => {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

const youtubeId = value => {
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") return url.pathname.slice(1, 12) || null;
    if (/(^|\.)youtube\.com$/.test(url.hostname)) {
      const v = url.searchParams.get("v");
      if (v) return v.slice(0, 11);
      const match = url.pathname.match(/^\/(shorts|live|embed)\/([\w-]{11})/);
      if (match) return match[2];
    }
  } catch {}
  return null;
};

const ytThumb = id => (id && /^[\w-]{11}$/.test(id) ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null);

const parseJson = text => {
  const start = text.search(/[{[]/);
  if (start < 0) throw new Error("yt-dlp MCP returned no JSON");
  return JSON.parse(text.slice(start));
};

const safeName = value =>
  String(value || "download")
    .replace(/[\/\\:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150) || "download";

const insideDownloads = candidate => {
  try {
    const real = fs.realpathSync(candidate);
    const root = fs.realpathSync(DOWNLOADS_DIR);
    return isInside(root, real, { allowRoot: true }) ? real : null;
  } catch {
    return null;
  }
};

let ytdlpVersion = null;
const getYtdlpVersion = () =>
  ytdlpVersion
    ? Promise.resolve(ytdlpVersion)
    : new Promise(resolve =>
        execFile("yt-dlp", ["--version"], { env: childEnv(), timeout: 15000 }, (error, stdout) => {
          ytdlpVersion = error ? null : String(stdout).trim();
          resolve(ytdlpVersion);
        }),
      );

// ---------- jobs ----------
/** @type {Map<string, any>} */
const jobs = new Map();
const queue = [];
let running = 0;

const partialBytes = job => {
  if (!job.videoId || job.status !== "running") return 0;
  let total = 0;
  try {
    for (const name of fs.readdirSync(DOWNLOADS_DIR)) {
      if (!name.includes(`[${job.videoId}]`)) continue;
      try {
        const stat = fs.statSync(path.join(DOWNLOADS_DIR, name));
        if (stat.isFile() && stat.mtimeMs >= job.startedAt - 2000) total += stat.size;
      } catch {}
    }
  } catch {}
  return total;
};

const publicJob = job => ({
  id: job.id,
  url: job.url,
  kind: job.kind,
  resolution: job.resolution,
  startTime: job.startTime,
  endTime: job.endTime,
  status: job.status,
  title: job.title,
  channel: job.channel,
  duration: job.duration,
  thumbnail: job.thumbnail,
  videoId: job.videoId,
  createdAt: job.createdAt,
  startedAt: job.startedAt,
  finishedAt: job.finishedAt,
  bytes: job.status === "running" ? partialBytes(job) : job.bytes,
  file: job.file,
  error: job.error,
});

const parseSavedPath = text => {
  const match = String(text).match(/downloaded as "(.+)" to (.+)$/m);
  return match ? path.join(match[2].trim(), match[1]) : null;
};

const runJob = async job => {
  job.status = "running";
  job.startedAt = Date.now();
  log("ytdl-job-start", { job: job.id, kind: job.kind, url: job.url });
  try {
    if (!job.title || !job.videoId) {
      try {
        const meta = parseJson(
          await callTool("ytdlp_get_video_metadata", { url: job.url, fields: ["id", "title", "channel", "uploader", "duration", "thumbnail"] }),
        );
        job.videoId = job.videoId || meta.id || null;
        job.title = job.title || meta.title || null;
        job.channel = job.channel || meta.channel || meta.uploader || null;
        job.duration = job.duration ?? meta.duration ?? null;
        job.thumbnail = job.thumbnail || ytThumb(meta.id) || meta.thumbnail || null;
      } catch (error) {
        log("ytdl-meta-failed", { job: job.id, error: String(error).slice(0, 200) });
      }
    }
    if (job.kind === "video") {
      const args = { url: job.url, resolution: job.resolution };
      if (job.startTime) args.startTime = job.startTime;
      if (job.endTime) args.endTime = job.endTime;
      job.file = parseSavedPath(await callTool("ytdlp_download_video", args, DOWNLOAD_TIMEOUT_MS));
    } else if (job.kind === "audio") {
      job.file = parseSavedPath(await callTool("ytdlp_download_audio", { url: job.url }, DOWNLOAD_TIMEOUT_MS));
    } else {
      const args = { url: job.url };
      if (job.language) args.language = job.language;
      const text = await callTool("ytdlp_download_transcript", args, QUICK_TIMEOUT_MS * 2);
      const file = path.join(DOWNLOADS_DIR, `${safeName(job.title)} [${safeName(job.videoId || job.id)}] transcript.txt`);
      fs.writeFileSync(file, text.endsWith("\n") ? text : `${text}\n`);
      job.file = file;
    }
    if (!job.file || !fs.existsSync(job.file)) throw new Error("Finished, but the saved file could not be found.");
    job.bytes = fs.statSync(job.file).size;
    job.status = "done";
    log("ytdl-job-done", { job: job.id, file: job.file, bytes: job.bytes });
  } catch (error) {
    job.status = "error";
    job.error = cleanError(error?.message ?? String(error)) || "Download failed.";
    log("ytdl-job-error", { job: job.id, error: job.error.slice(0, 300) });
  } finally {
    job.finishedAt = Date.now();
    running -= 1;
    pump();
  }
};

const pump = () => {
  while (running < MAX_RUNNING && queue.length) {
    const job = queue.shift();
    if (!jobs.has(job.id)) continue;
    running += 1;
    runJob(job);
  }
};

const trimJobs = () => {
  const finished = [...jobs.values()].filter(job => job.status === "done" || job.status === "error");
  for (const job of finished.slice(0, Math.max(0, jobs.size - MAX_JOBS))) jobs.delete(job.id);
};

const createJob = body => {
  const url = String(body?.url ?? "").trim();
  if (!isHttpUrl(url)) throw new Error("Paste a full video URL (https://…).");
  const kind = KINDS.has(body.kind) ? body.kind : "video";
  const resolution = RESOLUTIONS.has(body.resolution) ? body.resolution : "1080p";
  const startTime = typeof body.startTime === "string" && TIME.test(body.startTime) ? body.startTime : undefined;
  const endTime = typeof body.endTime === "string" && TIME.test(body.endTime) ? body.endTime : undefined;
  const language = typeof body.language === "string" && LANG.test(body.language) ? body.language : undefined;
  const videoId = typeof body.videoId === "string" && /^[\w-]{1,64}$/.test(body.videoId) ? body.videoId : youtubeId(url);
  const job = {
    id: crypto.randomUUID(),
    url,
    kind,
    resolution,
    startTime,
    endTime,
    language,
    status: "queued",
    title: typeof body.title === "string" ? body.title.slice(0, 300) : null,
    channel: typeof body.channel === "string" ? body.channel.slice(0, 200) : null,
    duration: Number.isFinite(body.duration) ? body.duration : null,
    thumbnail: ytThumb(videoId),
    videoId,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    bytes: 0,
    file: null,
    error: null,
  };
  jobs.set(job.id, job);
  queue.push(job);
  trimJobs();
  pump();
  return job;
};

const listFiles = () => {
  const files = [];
  for (const name of fs.readdirSync(DOWNLOADS_DIR)) {
    if (name.startsWith(".") || PARTIAL.test(name) || !MEDIA_EXT.test(name)) continue;
    try {
      const file = path.join(DOWNLOADS_DIR, name);
      const stat = fs.statSync(file);
      if (stat.isFile()) files.push({ name, path: file, size: stat.size, mtime: stat.mtimeMs });
    } catch {}
  }
  return files.sort((a, b) => b.mtime - a.mtime).slice(0, 100);
};

// ---------- HTTP ----------
const readBody = req =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", chunk => {
      size += chunk.length;
      if (size > 64 * 1024) {
        reject(new Error("Request too large."));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
    req.on("error", reject);
  });

/** Routes already passed Host, Origin and token checks in server.mjs. */
export const handleYtdl = async (req, url, json) => {
  const route = `${req.method} ${url.pathname}`;
  try {
    if (route === "GET /ytdl/status") {
      return json(200, { ok: true, downloadsDir: DOWNLOADS_DIR, ytdlp: await getYtdlpVersion(), mcp: "@kevinwatt/yt-dlp-mcp@0.10.2" });
    }
    if (route === "GET /ytdl/search") {
      const query = String(url.searchParams.get("q") ?? "").trim().slice(0, 200);
      if (!query) return json(400, { error: "Type something to search for." });
      const maxResults = Math.min(Math.max(Number(url.searchParams.get("n")) || 12, 1), 30);
      const offset = Math.min(Math.max(Number(url.searchParams.get("offset")) || 0, 0), 500);
      const result = parseJson(await callTool("ytdlp_search_videos", { query, maxResults, offset, response_format: "json" }));
      const videos = (result.videos ?? []).map(video => ({
        id: video.id,
        title: video.title,
        url: video.url,
        channel: video.uploader ?? null,
        duration: video.duration != null && video.duration !== "" ? Number(video.duration) : null,
        thumbnail: ytThumb(video.id),
      }));
      return json(200, { videos, hasMore: Boolean(result.has_more), offset });
    }
    if (route === "GET /ytdl/info") {
      const target = String(url.searchParams.get("url") ?? "").trim();
      if (!isHttpUrl(target)) return json(400, { error: "Paste a full video URL (https://…)." });
      const meta = parseJson(
        await callTool("ytdlp_get_video_metadata", {
          url: target,
          fields: ["id", "title", "channel", "uploader", "duration", "upload_date", "view_count", "thumbnail", "width", "height", "webpage_url", "extractor_key", "is_live", "description"],
        }),
      );
      return json(200, {
        id: meta.id ?? null,
        title: meta.title ?? null,
        channel: meta.channel ?? meta.uploader ?? null,
        duration: meta.duration ?? null,
        uploadDate: meta.upload_date ?? null,
        views: meta.view_count ?? null,
        width: meta.width ?? null,
        height: meta.height ?? null,
        url: meta.webpage_url ?? target,
        site: meta.extractor_key ?? null,
        isLive: Boolean(meta.is_live),
        description: typeof meta.description === "string" ? meta.description.slice(0, 600) : null,
        thumbnail: ytThumb(youtubeId(target) ?? (meta.extractor_key === "Youtube" ? meta.id : null)) ?? meta.thumbnail ?? null,
      });
    }
    if (route === "GET /ytdl/jobs") {
      return json(200, { jobs: [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt).map(publicJob) });
    }
    if (route === "POST /ytdl/jobs") {
      const job = createJob(await readBody(req));
      return json(200, { job: publicJob(job) });
    }
    if (route === "POST /ytdl/jobs/dismiss") {
      const body = await readBody(req);
      const job = jobs.get(String(body.id ?? ""));
      if (job && (job.status === "done" || job.status === "error")) jobs.delete(job.id);
      if (body.finished === true)
        for (const each of [...jobs.values()]) if (each.status === "done" || each.status === "error") jobs.delete(each.id);
      return json(200, { ok: true });
    }
    if (route === "GET /ytdl/files") {
      return json(200, { dir: DOWNLOADS_DIR, files: listFiles() });
    }
    if (route === "POST /ytdl/reveal") {
      const body = await readBody(req);
      const target = body.path ? insideDownloads(String(body.path)) : fs.realpathSync(DOWNLOADS_DIR);
      if (!target) return json(400, { error: "That file is not in the downloads folder." });
      reveal(target, { select: Boolean(body.path) });
      return json(200, { ok: true });
    }
    return json(404, { error: "not found" });
  } catch (error) {
    const message = cleanError(error?.message ?? String(error)) || "Request failed.";
    log("ytdl-error", { route, error: message.slice(0, 300) });
    return json(502, { error: message });
  }
};
