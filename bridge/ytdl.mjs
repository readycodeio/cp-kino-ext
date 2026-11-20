// YouTube downloader routes for the Kino bridge, backed by the @kevinwatt/yt-dlp-mcp MCP server.
//
// The bridge is an MCP client: it spawns the pinned yt-dlp-mcp package over stdio and calls its
// tools. Every /ytdl/* route is token-gated by server.mjs before it reaches this module.
// Downloads go to the downloads folder, never into a Kino project mount.
//
// Settings:
// - <bridge data>/ytdl.json holds { downloadsDir } (and { container } for older panels). The panel writes it (POST /ytdl/config).
// - Each job names the file format it wants (video: mp4, mkv, mov; audio: mp3, m4a, wav). yt-dlp downloads
//   what the site has, then ffmpeg here remuxes or converts when the file is not in that format yet.
// - KINO_YTDL_DIR is the downloads folder when ytdl.json has none. Default: ~/Downloads/Kino YouTube.
// - Your own yt-dlp config file is honored as well (cookies for signed-in videos, a proxy).
// File names come from yt-dlp-mcp: "<title> [<id>] <UTC timestamp>.<ext>".
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile, execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { HOME, DATA_DIR, MOUNTS_DIR, PROJECTS_DIR, IS_WIN, IS_MAC, childEnv as baseEnv, findBin, isInside, reveal } from "./platform.mjs";

// Resolve the pinned yt-dlp-mcp entry from wherever npm put node_modules (repo root). The package only
// exports "." for import, so ask the ESM resolver (synchronous since Node 20.6).
const MCP_ENTRY = fileURLToPath(import.meta.resolve("@kevinwatt/yt-dlp-mcp"));
const MCP_NAME = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(MCP_ENTRY), "..", "package.json"), "utf8"));
    return `${pkg.name}@${pkg.version}`;
  } catch {
    return "@kevinwatt/yt-dlp-mcp";
  }
})();
const CONFIG_FILE = path.join(DATA_DIR, "ytdl.json");
const DEFAULT_DIR = (process.env.KINO_YTDL_DIR ?? "").trim() || path.join(HOME, "Downloads", "Kino YouTube");
// yt-dlp-mcp starts yt-dlp in its own working directory, and yt-dlp reads yt-dlp.conf from there.
// That is how options the MCP tools do not expose (no playlists, the codec preference) reach yt-dlp.
const WORK_DIR = path.join(DATA_DIR, "ytdl");
// Where yt-dlp looks for the user's own config, for the sign-in hint.
const USER_CONFIG = IS_WIN ? "%APPDATA%\\yt-dlp\\config" : "~/.config/yt-dlp/config";
const MAX_RUNNING = 2;
const MAX_JOBS = 60;
const DOWNLOAD_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const QUICK_TIMEOUT_MS = 90 * 1000;
const TOOL_CACHE_MS = 5 * 60 * 1000;
const RESOLUTIONS = new Set(["480p", "720p", "1080p", "best"]);
const KINDS = new Set(["video", "audio", "transcript"]);
// File formats a job can ask for. The first of each list is what the panel starts with.
const FORMATS = { video: ["mp4", "mkv", "mov"], audio: ["mp3", "m4a", "wav"] };
const FFMPEG = process.env.KINO_FFMPEG ?? findBin("ffmpeg");
// Panels from before per-download formats keep one switch in ytdl.json: any container, or MP4.
const CONTAINERS = new Set(["auto", "mp4"]);
const TIME = /^\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/;
const LANG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
const MEDIA_EXT = /\.(mp4|webm|mkv|mov|m4a|mp3|opus|ogg|wav|aac|flac|txt|vtt|srt)$/i;
const PARTIAL = /\.(part|ytdl|temp)$|\.part-Frag\d+|\.temp\.|\.converting\./i;

let log = () => {};
export const setLogger = fn => (log = fn);

const fault = (message, status = 400) => Object.assign(new Error(message), { status });

// ---------- settings ----------
const readConfig = () => {
  try {
    const value = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
};
let config = readConfig();
const container = () => (CONTAINERS.has(config.container) ? config.container : "auto");
const downloadsDir = () => (typeof config.downloadsDir === "string" && path.isAbsolute(config.downloadsDir) ? config.downloadsDir : DEFAULT_DIR);

/** Make sure the downloads folder exists and takes files. Returns "" or what is wrong with it. */
const folderProblem = (dir = downloadsDir()) => {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return "";
  } catch (error) {
    return `Cannot write to ${dir} (${error.code ?? error.message}). Pick another downloads folder.`;
  }
};

const writeYtdlpConf = () => {
  const lines = [
    "# Written by the Kino bridge for the YT Downloader panel. Changes here are overwritten.",
    "--no-playlist",
    // At the same resolution and frame rate, take H.264 video and M4A audio when the site has them. They go
    // into MP4, MOV and MKV without re-encoding and open in every editor. Above 1080p, sites mostly have VP9 or AV1.
    "-S res,fps,vcodec:h264,aext",
  ];
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(path.join(WORK_DIR, "yt-dlp.conf"), `${lines.join("\n")}\n`);
};

// ---------- tools ----------
const TOOLS = [
  { name: "yt-dlp", args: ["--version"], required: true, why: "It does the downloading." },
  { name: "ffmpeg", args: ["-version"], required: false, why: "Needed to join video and audio (most YouTube video) and to trim clips." },
  { name: "deno", args: ["--version"], required: false, why: "Current yt-dlp versions need it to read YouTube." },
];
const WINGET = { "yt-dlp": "yt-dlp.yt-dlp", ffmpeg: "Gyan.FFmpeg", deno: "DenoLand.Deno" };
const LINUX = { "yt-dlp": "pipx install yt-dlp", ffmpeg: "sudo apt install ffmpeg", deno: "curl -fsSL https://deno.land/install.sh | sh" };
const installCommand = name => (IS_MAC ? `brew install ${name}` : IS_WIN ? `winget install ${WINGET[name]}` : LINUX[name]);

const toolCache = new Map();
/** First line of the tool's version output, or null when it is not on the bridge's PATH. */
const toolVersion = tool => {
  const hit = toolCache.get(tool.name);
  if (hit && Date.now() - hit.at < TOOL_CACHE_MS) return Promise.resolve(hit.version);
  return new Promise(resolve =>
    // The bare name on purpose: yt-dlp-mcp starts yt-dlp the same way, through this PATH.
    execFile(tool.name, tool.args, { env: baseEnv(), timeout: 15000, windowsHide: true }, (error, stdout) => {
      const line = String(stdout ?? "").split(/\r?\n/)[0].trim();
      const version = error ? null : line.replace(/^(ffmpeg version|deno)\s+/i, "").replace(/\s+(Copyright|\().*$/, "") || "installed";
      // Misses are not remembered, so a tool shows up right after it is installed.
      if (version) toolCache.set(tool.name, { at: Date.now(), version });
      resolve(version);
    }),
  );
};
const toolReport = () =>
  Promise.all(TOOLS.map(async tool => ({ name: tool.name, version: await toolVersion(tool), required: tool.required, why: tool.why, install: installCommand(tool.name) })));
const missingToolText = name => `${name} is not installed, or the bridge cannot find it. Install it with: ${installCommand(name)}`;

// ---------- MCP client ----------
let clientPromise = null;
let mcpPid = null;
const getClient = () => {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    // yt-dlp-mcp exits at startup without yt-dlp, which would surface as a bare "Connection closed".
    if (!(await toolVersion(TOOLS[0]))) throw fault(missingToolText("yt-dlp"), 424);
    const problem = folderProblem();
    if (problem) throw fault(problem, 507);
    writeYtdlpConf();
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [MCP_ENTRY],
      env: baseEnv({ YTDLP_DOWNLOADS_DIR: downloadsDir() }),
      cwd: WORK_DIR,
      stderr: "pipe",
    });
    transport.stderr?.on("data", data => {
      const line = String(data).trim();
      if (line) log("ytdl-mcp-stderr", { line: line.slice(0, 400) });
    });
    const client = new Client({ name: "kino-ytdl-panel", version: "1.0.0" });
    client.onclose = () => {
      clientPromise = null;
      mcpPid = null;
      log("ytdl-mcp-closed");
    };
    await client.connect(transport);
    mcpPid = transport.pid ?? null;
    log("ytdl-mcp-ready", { pid: mcpPid });
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
  if (result.isError) throw new Error(text.slice(0, 20000) || `${name} failed`);
  return text;
};

const cleanError = text =>
  String(text ?? "")
    .split("\n")
    .filter(line => !/^Deprecated Feature|^WARNING:|^\[debug\]/.test(line.trim()))
    .join("\n")
    .trim()
    .slice(0, 600);

/**
 * yt-dlp and yt-dlp-mcp errors as one plain sentence the panel can show. `raw` is whatever came back:
 * yt-dlp's stderr, one of yt-dlp-mcp's canned messages, or a Node error.
 */
const explain = (raw, kind = "video") => {
  const text = String(raw ?? "");
  const rules = [
    [/Sign in to confirm|age[- ]restricted|not a bot|members[- ]only|Join this channel|login required/i, `This video needs a signed-in account. yt-dlp can use your browser's sign-in: add a line like "--cookies-from-browser chrome" to ${USER_CONFIG}, then retry.`],
    [/No space left|ENOSPC|Errno 28/i, `The disk is full. Free some space for ${downloadsDir()} and retry.`],
    [/Permission denied|EACCES|EPERM|Errno 13/i, `Cannot write to ${downloadsDir()}. Pick another downloads folder.`],
    [/ffmpeg is not installed|ffmpeg not found|ffprobe and ffmpeg not found|requested merging of multiple formats/i, `${missingToolText("ffmpeg")}. It joins video and audio and cuts trims.`],
    [/spawn yt-dlp|Failed to spawn yt-dlp|Required tool 'yt-dlp'/i, missingToolText("yt-dlp")],
    [/No subtitle files found|no subtitles|There are no subtitles/i, "This video has no subtitles in that language. Try another language code, like en."],
    [/Premieres in|live event will begin|This live event|has not started/i, "This video has not started yet."],
    [/Requested format is not available/i, "That quality is not available for this video. Try another resolution."],
    [/HTTP Error 429|Too Many Requests/i, "The site is rate limiting this connection. Wait a few minutes and retry."],
    [/after JSON|Unexpected non-whitespace/i, "That link is a playlist or a page with several videos. Paste the link of one video."],
    [/resolves to a private or local network address/i, "Links to this computer or the local network are blocked."],
    [/Request timed out|-32001/i, "That took too long and was stopped. Retry, or pick a lower resolution."],
    [/Connection closed|-32000/i, "The download helper stopped. Retry. If it keeps happening, restart the bridge."],
    [/Cannot resolve URL host|getaddrinfo|Network error|Unable to download webpage|timed out|Temporary failure in name resolution/i, "Could not reach the site. Check the internet connection and retry."],
    [/Private video|Video unavailable|unavailable or private|has been removed|This video is private/i, "This video is private or no longer available."],
    // yt-dlp-mcp reports every failed audio download as an unsupported site, so stay vague for audio.
    [/Unsupported URL|Unsupported platform/i, kind === "audio" ? "The audio download failed. The site may not be supported, the video may need sign-in, or yt-dlp needs an update." : "yt-dlp does not support that site or link."],
    [/HTTP Error 403/i, "The site refused the download (HTTP 403). Updating yt-dlp usually fixes this."],
  ];
  const hit = rules.find(([pattern]) => pattern.test(text));
  if (hit) return hit[1];
  const errors = text.split("\n").filter(line => /^ERROR:/.test(line.trim()));
  const last = errors.length ? errors[errors.length - 1].replace(/^\s*ERROR:\s*(\[[^\]]+\]\s*[\w-]+:\s*)?/, "") : cleanError(text);
  return last.slice(0, 400) || "The download failed.";
};

/** Every process under `parent` whose command line contains `needle` (all of them without one), children first. */
const posixTree = (parent, needle) => {
  // One -o per column: after "=", POSIX ps reads the rest of the argument as that column's header.
  const stdout = execFileSync("ps", ["-A", "-ww", "-o", "pid=", "-o", "ppid=", "-o", "args="], { env: baseEnv(), timeout: 10000, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" });
  const rows = stdout
    .split("\n")
    .map(line => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter(Boolean)
    .map(match => ({ pid: Number(match[1]), ppid: Number(match[2]), args: match[3] }));
  const roots = rows.filter(row => row.ppid === parent && (!needle || row.args.includes(needle)));
  const doomed = [];
  const collect = pid => {
    for (const row of rows) if (row.ppid === pid) collect(row.pid);
    doomed.push(pid);
  };
  for (const root of roots) collect(root.pid);
  return { count: roots.length, doomed };
};

/**
 * Stop yt-dlp processes started by the MCP server, with everything they started (ffmpeg). `needle`
 * narrows it to command lines containing that text (a job's URL); without it every download stops.
 * yt-dlp-mcp has no cancel of its own, and stopping only the MCP server would leave yt-dlp running.
 * Returns how many downloads were stopped. `wait` blocks until done, for shutdown.
 */
const killDownloads = (needle, { wait = false } = {}) => {
  const parent = mcpPid;
  if (!parent) return Promise.resolve(0);
  if (IS_WIN) {
    // Values travel in env vars, so nothing from a URL is parsed as PowerShell. No double quotes in the
    // script either: they would have to survive Windows argument quoting.
    const script =
      "$n = $env:KINO_KILL_NEEDLE; Get-CimInstance Win32_Process -Filter ('ParentProcessId=' + $env:KINO_KILL_PARENT) | " +
      "Where-Object { -not $n -or ($_.CommandLine -and $_.CommandLine.Contains($n)) } | ForEach-Object { taskkill.exe /PID $_.ProcessId /T /F | Out-Null; 1 } | Measure-Object | ForEach-Object { $_.Count }";
    const args = ["-NoProfile", "-NonInteractive", "-Command", script];
    const options = { env: baseEnv({ KINO_KILL_PARENT: String(parent), KINO_KILL_NEEDLE: needle ?? "" }), timeout: 15000, windowsHide: true, encoding: "utf8" };
    if (wait) {
      try {
        return Promise.resolve(Number(String(execFileSync("powershell.exe", args, options)).trim()) || 0);
      } catch {
        return Promise.resolve(0);
      }
    }
    return new Promise(resolve => execFile("powershell.exe", args, options, (error, stdout) => resolve(error ? 0 : Number(String(stdout).trim()) || 0)));
  }
  // ps answers in a few milliseconds, so this runs in line: at shutdown nothing later would get the chance.
  try {
    const { count, doomed } = posixTree(parent, needle);
    for (const pid of doomed) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {}
    }
    return Promise.resolve(count);
  } catch {
    return Promise.resolve(0);
  }
};

export const closeYtdl = async () => {
  const pending = clientPromise;
  clientPromise = null;
  // Before the first await: the bridge may exit right after calling this.
  if ([...jobs.values()].some(job => job.status === "running")) killDownloads(undefined, { wait: true });
  for (const job of jobs.values()) job.proc?.kill();
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

/**
 * One video per job. A YouTube watch link copied from a playlist carries list= and would pull the
 * whole playlist; strip that. Whole playlists and channels are turned away with a hint.
 * The result is always an http(s) URL, so it can never be read as a yt-dlp option.
 */
const cleanUrl = value => {
  const text = String(value ?? "").trim();
  if (!isHttpUrl(text)) throw fault("Paste a full video link (https://...).");
  const url = new URL(text);
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
    const first = url.pathname.split("/")[1] ?? "";
    if (first === "playlist") throw fault("That link is a whole playlist. Open one video in it and paste that link.");
    if (first.startsWith("@") || ["channel", "c", "user", "feed", "results"].includes(first)) throw fault("That link is a channel or a page, not a video. Paste the link of one video.");
    for (const name of ["list", "index", "start_radio", "pp", "si"]) url.searchParams.delete(name);
  }
  return url.toString();
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
  if (start < 0) throw new Error("yt-dlp returned nothing to read.");
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
    const root = fs.realpathSync(downloadsDir());
    return isInside(root, real, { allowRoot: true }) ? real : null;
  } catch {
    return null;
  }
};

// ---------- jobs ----------
/** @type {Map<string, any>} */
const jobs = new Map();
const queue = [];
let running = 0;
const isOver = job => job.status === "done" || job.status === "error" || job.status === "canceled";

/** This job's files in the downloads folder, written since it started. */
const jobFiles = job => {
  if (!job.videoId || !job.startedAt) return [];
  const out = [];
  try {
    for (const name of fs.readdirSync(downloadsDir())) {
      if (!name.includes(`[${job.videoId}]`)) continue;
      try {
        const file = path.join(downloadsDir(), name);
        const stat = fs.statSync(file);
        if (stat.isFile() && stat.mtimeMs >= job.startedAt - 2000) out.push({ file, name, size: stat.size });
      } catch {}
    }
  } catch {}
  return out;
};
const partialBytes = job => (job.status === "running" ? jobFiles(job).reduce((total, item) => total + item.size, 0) : 0);

const publicJob = job => ({
  id: job.id,
  url: job.url,
  kind: job.kind,
  resolution: job.resolution,
  startTime: job.startTime,
  endTime: job.endTime,
  language: job.language,
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
  format: job.format,
  phase: job.phase ?? null,
  note: job.note ?? null,
});

// ---------- file format ----------
const AUDIO_ARGS = { mp3: ["-c:a", "libmp3lame", "-q:a", "2"], m4a: ["-c:a", "aac", "-b:a", "192k"], wav: ["-c:a", "pcm_s16le"] };
// Cheapest first: copy both streams, then re-encode only the audio, then re-encode the picture too
// (needed when the codec cannot live in the container, like VP9 in MOV).
const videoAttempts = target => {
  const streams = ["-map", "0:v:0", "-map", "0:a:0?"];
  const tail = target === "mkv" ? [] : ["-movflags", "+faststart"];
  const aac = ["-c:a", "aac", "-b:a", "192k"];
  return [
    [...streams, "-c", "copy", ...tail],
    [...streams, "-c:v", "copy", ...aac, ...tail],
    [...streams, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", ...aac, ...tail],
  ];
};

/** One ffmpeg run. Resolves "ok", "missing" (ffmpeg is not installed), "stopped" or "failed". */
const runFfmpeg = (job, source, args, target) =>
  new Promise(resolve => {
    let child;
    try {
      child = spawn(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-i", source, ...args, target], { env: baseEnv(), stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    } catch {
      return resolve("missing");
    }
    job.proc = child;
    let stderr = "";
    child.stderr.on("data", chunk => (stderr = (stderr + chunk).slice(-2000)));
    const timer = setTimeout(() => child.kill(), DOWNLOAD_TIMEOUT_MS);
    const done = result => {
      clearTimeout(timer);
      if (job.proc === child) job.proc = null;
      if (result === "failed") log("ytdl-convert-failed", { job: job.id, error: stderr.trim().split("\n").pop()?.slice(0, 300) ?? "" });
      resolve(result);
    };
    child.on("error", error => done(error.code === "ENOENT" ? "missing" : "failed"));
    child.on("close", code => done(job.stop ? "stopped" : code === 0 ? "ok" : "failed"));
  });

/**
 * Put the downloaded file into the format the job asked for. Returns the file to keep. When ffmpeg is
 * missing or cannot do it, the download is kept as it is and job.note says so: a finished download is
 * worth more than an error.
 */
export const toFormat = async job => {
  const source = job.file;
  const have = path.extname(source).slice(1).toLowerCase();
  if (!job.format || have === job.format) return source;
  const base = source.slice(0, -path.extname(source).length);
  const temp = `${base}.converting.${job.format}`;
  const target = `${base}.${job.format}`;
  job.phase = "converting";
  const attempts = job.kind === "audio" ? [["-vn", ...AUDIO_ARGS[job.format]]] : videoAttempts(job.format);
  let result = "failed";
  for (const args of attempts) {
    result = await runFfmpeg(job, source, args, temp);
    if (result !== "failed") break;
  }
  job.phase = null;
  if (result === "ok") {
    try {
      fs.renameSync(temp, target);
      fs.unlinkSync(source);
      log("ytdl-converted", { job: job.id, from: have, to: job.format });
      return target;
    } catch {
      result = "failed";
    }
  }
  try {
    fs.unlinkSync(temp);
  } catch {}
  if (result === "stopped") throw new Error("stopped");
  job.note =
    result === "missing"
      ? `Kept as ${have.toUpperCase()}. Making ${job.format.toUpperCase()} needs ffmpeg: ${installCommand("ffmpeg")}`
      : `Kept as ${have.toUpperCase()}: ffmpeg could not turn it into ${job.format.toUpperCase()}.`;
  return source;
};

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
    if (job.stop) throw new Error("stopped");
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
      const file = path.join(downloadsDir(), `${safeName(job.title)} [${safeName(job.videoId || job.id)}] transcript.txt`);
      fs.writeFileSync(file, text.endsWith("\n") ? text : `${text}\n`);
      job.file = file;
    }
    if (!job.file || !fs.existsSync(job.file)) throw new Error("Finished, but the saved file could not be found.");
    if (job.stop) throw new Error("stopped");
    if (job.kind !== "transcript") job.file = await toFormat(job);
    job.bytes = fs.statSync(job.file).size;
    job.status = "done";
    log("ytdl-job-done", { job: job.id, file: job.file, bytes: job.bytes });
  } catch (error) {
    const raw = error?.message ?? String(error);
    // The MCP request gave up, but yt-dlp is still running: stop it, or it downloads for nothing.
    if (!job.stop && /timed out|-32001/i.test(raw)) await killDownloads(job.url).catch(() => 0);
    if (job.stop) {
      job.status = "canceled";
      job.error = null;
    } else {
      job.status = "error";
      job.error = explain(raw, job.kind);
    }
    // Half-written pieces are useless: a retry starts a new file. Leave them while another job for
    // the same video is still writing, because the two cannot be told apart by name.
    const shared = [...jobs.values()].some(other => other !== job && other.status === "running" && other.videoId === job.videoId);
    if (job.kind !== "transcript" && !shared) {
      for (const item of jobFiles(job)) {
        if (!PARTIAL.test(item.name)) continue;
        try {
          fs.unlinkSync(item.file);
        } catch {}
      }
    }
    log(job.stop ? "ytdl-job-stopped" : "ytdl-job-error", { job: job.id, error: cleanError(raw).slice(0, 300) });
  } finally {
    job.finishedAt = Date.now();
    running -= 1;
    pump();
  }
};

const pump = () => {
  while (running < MAX_RUNNING && queue.length) {
    const job = queue.shift();
    if (!jobs.has(job.id) || job.status !== "queued") continue;
    running += 1;
    runJob(job);
  }
};

const trimJobs = () => {
  const finished = [...jobs.values()].filter(isOver);
  for (const job of finished.slice(0, Math.max(0, jobs.size - MAX_JOBS))) jobs.delete(job.id);
};

const createJob = body => {
  const url = cleanUrl(body?.url);
  const kind = KINDS.has(body.kind) ? body.kind : "video";
  const resolution = RESOLUTIONS.has(body.resolution) ? body.resolution : "1080p";
  const startTime = typeof body.startTime === "string" && TIME.test(body.startTime) ? body.startTime : undefined;
  const endTime = typeof body.endTime === "string" && TIME.test(body.endTime) ? body.endTime : undefined;
  if (startTime && endTime && startTime >= endTime) throw fault("The trim end has to be after its start.");
  const wantsLanguage = kind === "transcript" && typeof body.language === "string" && body.language.trim() !== "";
  if (wantsLanguage && !LANG.test(body.language.trim())) throw fault("Language codes look like en, es or pt-BR.");
  const language = wantsLanguage ? body.language.trim() : undefined;
  const videoId = typeof body.videoId === "string" && /^[\w-]{1,64}$/.test(body.videoId) ? body.videoId : youtubeId(url);
  // No format means a panel from before formats: follow its MP4 switch, else keep what yt-dlp saved.
  const format = FORMATS[kind]?.includes(body.format) ? body.format : kind === "video" && container() === "mp4" ? "mp4" : null;
  const job = {
    id: crypto.randomUUID(),
    url,
    kind,
    resolution,
    format,
    startTime,
    endTime,
    language,
    status: "queued",
    stop: false,
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

const cancelJob = async job => {
  if (job.status === "queued") {
    job.status = "canceled";
    job.finishedAt = Date.now();
    return;
  }
  if (job.status !== "running") return;
  job.stop = true;
  job.proc?.kill(); // the ffmpeg format step, when the job is in it
  // Two running jobs for the same link both match and both stop. The other one shows an error with Retry.
  const stopped = await killDownloads(job.url);
  log("ytdl-job-stop", { job: job.id, processes: stopped });
};

const listFiles = () => {
  const files = [];
  let names = [];
  try {
    names = fs.readdirSync(downloadsDir());
  } catch {}
  for (const name of names) {
    if (name.startsWith(".") || PARTIAL.test(name) || !MEDIA_EXT.test(name)) continue;
    try {
      const file = path.join(downloadsDir(), name);
      const stat = fs.statSync(file);
      if (stat.isFile()) files.push({ name, path: file, size: stat.size, mtime: stat.mtimeMs });
    } catch {}
  }
  return files.sort((a, b) => b.mtime - a.mtime).slice(0, 100);
};

const statusBody = async () => {
  const tools = await toolReport();
  return {
    ok: true,
    downloadsDir: downloadsDir(),
    defaultDir: DEFAULT_DIR,
    folderError: folderProblem(),
    formats: FORMATS,
    container: container(),
    ytdlp: tools[0].version,
    tools,
    configFile: CONFIG_FILE,
    ytdlpConfig: USER_CONFIG,
    mcp: MCP_NAME,
  };
};

const saveConfig = async body => {
  const next = { ...config };
  let moved = false;
  if (body.downloadsDir !== undefined) {
    const raw = String(body.downloadsDir ?? "").trim();
    if (raw.length > 1000) throw fault("That path is too long.");
    const before = downloadsDir();
    if (!raw) delete next.downloadsDir;
    else {
      const expanded = raw.replace(/^~(?=$|[\\/])/, HOME);
      if (!path.isAbsolute(expanded)) throw fault(`Use a full path, like ${DEFAULT_DIR}.`);
      const dir = path.resolve(expanded);
      // Kino syncs what sits inside a project folder: large downloads do not belong there.
      if ([MOUNTS_DIR, PROJECTS_DIR].some(root => isInside(root, dir, { allowRoot: true }))) throw fault("Pick a folder outside your Kino projects. Import the files you want from the panel instead.");
      const problem = folderProblem(dir);
      if (problem) throw fault(problem);
      next.downloadsDir = dir;
    }
    moved = (next.downloadsDir ?? DEFAULT_DIR) !== before;
    if (moved && [...jobs.values()].some(job => !isOver(job))) throw fault("Wait for the downloads to finish, then change the folder.", 409);
  }
  if (body.container !== undefined && CONTAINERS.has(body.container)) next.container = body.container;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temp = `${CONFIG_FILE}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(temp, CONFIG_FILE);
  config = next;
  writeYtdlpConf();
  // The MCP server learns its downloads folder at start, so the next request starts a new one.
  if (moved) await closeYtdl();
  log("ytdl-config", { downloadsDir: downloadsDir() });
};

// ---------- HTTP ----------
const readBody = req =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", chunk => {
      size += chunk.length;
      if (size > 64 * 1024) {
        reject(fault("Request too large.", 413));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
        resolve(body && typeof body === "object" ? body : {});
      } catch {
        reject(fault("Invalid JSON."));
      }
    });
    req.on("error", reject);
  });

/** Routes already passed Host, Origin and token checks in server.mjs. */
export const handleYtdl = async (req, url, json) => {
  const route = `${req.method} ${url.pathname}`;
  try {
    if (route === "GET /ytdl/status") return json(200, await statusBody());
    if (route === "POST /ytdl/config") {
      await saveConfig(await readBody(req));
      return json(200, await statusBody());
    }
    if (route === "GET /ytdl/search") {
      const query = String(url.searchParams.get("q") ?? "").trim().slice(0, 200);
      if (!query) return json(400, { error: "Type something to search for." });
      const maxResults = Math.min(Math.max(Number(url.searchParams.get("n")) || 12, 1), 30);
      const offset = Math.min(Math.max(Number(url.searchParams.get("offset")) || 0, 0), 500);
      const text = await callTool("ytdlp_search_videos", { query, maxResults, offset, response_format: "json" });
      if (/^\s*No videos found/i.test(text)) return json(200, { videos: [], hasMore: false, offset });
      const result = parseJson(text);
      const videos = (result.videos ?? []).map(video => ({
        id: video.id,
        title: video.title,
        url: video.url,
        channel: video.uploader && video.uploader !== "Unknown" && video.uploader !== "NA" ? video.uploader : null,
        duration: Number.isFinite(Number(video.duration)) && video.duration !== "" && video.duration !== null ? Number(video.duration) : null,
        thumbnail: ytThumb(video.id),
      }));
      return json(200, { videos, hasMore: Boolean(result.has_more), offset });
    }
    if (route === "GET /ytdl/info") {
      const target = cleanUrl(url.searchParams.get("url"));
      const meta = parseJson(
        await callTool("ytdlp_get_video_metadata", {
          url: target,
          fields: ["id", "title", "channel", "uploader", "duration", "upload_date", "view_count", "thumbnail", "width", "height", "webpage_url", "extractor_key", "is_live", "live_status", "description"],
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
        // The cleaned link, not webpage_url: a job made from this must stay one video.
        url: target,
        site: meta.extractor_key ?? null,
        isLive: Boolean(meta.is_live),
        isUpcoming: meta.live_status === "is_upcoming",
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
    if (route === "POST /ytdl/jobs/cancel") {
      const body = await readBody(req);
      const job = jobs.get(String(body.id ?? ""));
      if (job) await cancelJob(job);
      return json(200, { ok: true });
    }
    if (route === "POST /ytdl/jobs/dismiss") {
      const body = await readBody(req);
      const job = jobs.get(String(body.id ?? ""));
      if (job && isOver(job)) jobs.delete(job.id);
      if (body.finished === true) for (const each of [...jobs.values()]) if (isOver(each)) jobs.delete(each.id);
      return json(200, { ok: true });
    }
    if (route === "GET /ytdl/files") {
      return json(200, { dir: downloadsDir(), files: listFiles() });
    }
    if (route === "POST /ytdl/reveal") {
      const body = await readBody(req);
      const problem = folderProblem();
      if (problem && !body.path) return json(400, { error: problem });
      const target = body.path ? insideDownloads(String(body.path)) : fs.realpathSync(downloadsDir());
      if (!target) return json(400, { error: "That file is not in the downloads folder." });
      reveal(target, { select: Boolean(body.path) });
      return json(200, { ok: true });
    }
    return json(404, { error: "not found" });
  } catch (error) {
    const raw = error?.message ?? String(error);
    // Errors made here carry a status and are already plain. Everything else came from yt-dlp.
    const message = error?.status ? raw : explain(raw);
    log("ytdl-error", { route, error: cleanError(raw).slice(0, 300) });
    return json(error?.status ?? 502, { error: message });
  }
};
