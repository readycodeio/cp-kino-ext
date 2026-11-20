// Voiceover (ElevenLabs) routes for the Kino bridge.
//
// The ElevenLabs key never enters this process: speech runs in a child worker (voice/tts-worker.mjs)
// started with `node --env-file=<VOICE_DIR>/.env.local`, so only that child sees ELEVENLABS_API_KEY.
// Terminal shells spawned by the bridge never get it either.
// Imports into Kino go through Kino's local MCP server (addMediaToKino + timelineEdit).
// Every /tts/* route is token-gated by server.mjs before it reaches this module.
//
// Settings:
// - <VOICE_DIR>/.env.local: ELEVENLABS_API_KEY, and optionally ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL_ID,
//   ELEVENLABS_OUTPUT_FORMAT as first-run defaults.
// - VOICE_CONFIG (config.json): output_dir (the panel writes it, POST /tts/config), plus optional
//   voice_id, model_id and output_format defaults. Takes go to Documents/ElevenLabs Voiceover by default.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { HOME, DOCUMENTS, VOICE_DIR, VOICE_CONFIG, IS_MAC, IS_WIN, childEnv, findBin, isInside, reveal } from "./platform.mjs";

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), "voice", "tts-worker.mjs");
const ENV_FILE = path.join(VOICE_DIR, ".env.local");
const CONFIG_PATH = VOICE_CONFIG;
const DEFAULT_OUT = path.join(DOCUMENTS, "ElevenLabs Voiceover");
const KINO_MCP_URL = process.env.KINO_MCP_URL ?? "http://127.0.0.1:45680/mcp";
const FFPROBE = process.env.KINO_FFPROBE ?? findBin("ffprobe");
const AUDIO_EXT = /\.(mp3|wav|opus|ogg)$/i;
const AUDIO_TYPES = { mp3: "audio/mpeg", wav: "audio/wav", opus: "audio/ogg", ogg: "audio/ogg" };
const PROJECT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const CACHE_MS = 10 * 60 * 1000;
const PREVIEW_HOSTS = /(^|\.)(googleapis\.com|elevenlabs\.io|cloudfront\.net)$/;
// One take can run up to 240 s in the worker and is retried once, so wait longer than that.
const GENERATE_TIMEOUT_MS = 11 * 60 * 1000;
const FFMPEG_INSTALL = IS_MAC ? "brew install ffmpeg" : IS_WIN ? "winget install Gyan.FFmpeg" : "sudo apt install ffmpeg";

let log = () => {};
export const setLogger = fn => (log = fn);
const redact = text => String(text ?? "").replace(/sk_[A-Za-z0-9]{8,}/g, "sk_…").replace(/xi-api-key[^\n]*/gi, "xi-api-key …");

const fault = (message, status = 400) => Object.assign(new Error(message), { status });

const readConfig = () => {
  try {
    const value = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};
const outputDir = () => {
  const dir = readConfig().output_dir;
  return typeof dir === "string" && dir ? dir.replace(/^~(?=[\\/])/, HOME) : DEFAULT_OUT;
};

/** Point new takes at another folder ("" goes back to the default). The worker reads it on its next run. */
const setOutputDir = value => {
  const raw = String(value ?? "").trim();
  if (raw.length > 1000) throw fault("That path is too long.");
  const next = readConfig();
  if (!raw) delete next.output_dir;
  else {
    const expanded = raw.replace(/^~(?=$|[\\/])/, HOME);
    if (!path.isAbsolute(expanded)) throw fault(`Use a full path, like ${DEFAULT_OUT}.`);
    const dir = path.resolve(expanded);
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
    } catch (error) {
      throw fault(`Cannot write to ${dir} (${error.code ?? error.message}).`);
    }
    next.output_dir = dir;
  }
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  const temp = `${CONFIG_PATH}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(temp, CONFIG_PATH);
};

// ---------- worker (holds the ElevenLabs key) ----------
let worker = null;
let seq = 0;

const envStamp = () => {
  try {
    return fs.statSync(ENV_FILE).mtimeMs;
  } catch {
    return 0;
  }
};

const startWorker = () => {
  if (!fs.existsSync(WORKER)) throw new Error(`Missing ${WORKER}.`);
  // Existence check only. The bridge never reads this file.
  const args = fs.existsSync(ENV_FILE) ? [`--env-file=${ENV_FILE}`, WORKER] : [WORKER];
  fs.mkdirSync(VOICE_DIR, { recursive: true });
  const child = spawn(process.execPath, args, {
    cwd: VOICE_DIR,
    env: childEnv({ KINO_TTS_ENV_FILE: ENV_FILE, KINO_TTS_CONFIG: CONFIG_PATH, KINO_TTS_OUT: DEFAULT_OUT, KINO_FFPROBE: FFPROBE }),
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const state = { child, pending: new Map(), envStamp: envStamp() };
  const failAll = reason => {
    if (worker === state) worker = null;
    for (const entry of state.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
    }
    state.pending.clear();
  };
  readline.createInterface({ input: child.stdout }).on("line", line => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return log("tts-worker-noise", { line: redact(line).slice(0, 200) });
    }
    const entry = state.pending.get(message.id);
    if (!entry) return;
    state.pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.ok) entry.resolve(message.result);
    else entry.reject(Object.assign(new Error(message.error || "ElevenLabs request failed."), { upstream: message.status ?? null }));
  });
  // A worker that died between two requests must not take the bridge down with an unhandled EPIPE.
  child.stdin.on("error", () => {});
  child.stderr.on("data", data => {
    const line = redact(data).trim();
    if (line) log("tts-worker-stderr", { line: line.slice(0, 400) });
  });
  child.on("exit", (code, signal) => {
    failAll(`The ElevenLabs worker stopped (${signal ?? code}).`);
    log("tts-worker-exit", { code, signal });
  });
  // No "exit" follows a failed spawn, so answer the waiting requests here.
  child.on("error", error => {
    failAll("The ElevenLabs worker could not start.");
    log("tts-worker-error", { error: redact(error.message) });
  });
  log("tts-worker-start", { pid: child.pid, envFile: args.length === 2 });
  return state;
};

const cache = new Map();

const ask = (cmd, args = {}, timeout = 60_000) =>
  new Promise((resolve, reject) => {
    // The worker reads the key file once, at start. When the file appears or changes, start a new worker,
    // so connecting or replacing the key needs no bridge restart.
    if (worker && worker.pending.size === 0 && worker.envStamp !== envStamp()) {
      log("tts-worker-reload");
      const old = worker;
      worker = null;
      cache.clear();
      try {
        old.child.kill();
      } catch {}
    }
    if (!worker) worker = startWorker();
    const state = worker;
    const id = ++seq;
    const timer = setTimeout(() => {
      state.pending.delete(id);
      reject(new Error(`ElevenLabs did not answer in ${Math.round(timeout / 1000)}s.`));
    }, timeout);
    state.pending.set(id, { resolve, reject, timer });
    state.child.stdin.write(`${JSON.stringify({ id, cmd, args })}\n`);
  });

const cached = async (key, fresh, load) => {
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
};

// ---------- Kino MCP (local, metered) ----------
let kinoPromise = null;
const kino = () => {
  if (kinoPromise) return kinoPromise;
  kinoPromise = (async () => {
    const client = new Client({ name: "kino-voiceover-panel", version: "1.0.0" });
    client.onclose = () => (kinoPromise = null);
    await client.connect(new StreamableHTTPClientTransport(new URL(KINO_MCP_URL)));
    return client;
  })().catch(error => {
    kinoPromise = null;
    throw new Error(`Could not reach Kino desktop at ${KINO_MCP_URL} (${error.message}). Importing needs the Kino desktop app open on this computer. The take is still saved in the folder.`);
  });
  return kinoPromise;
};

const kinoCall = async (name, args, timeout = 120_000) => {
  let result;
  try {
    result = await (await kino()).callTool({ name, arguments: args }, undefined, { timeout });
  } catch (error) {
    kinoPromise = null;
    throw error;
  }
  const text = (result.content ?? []).filter(part => part.type === "text").map(part => part.text).join("\n");
  if (result.isError) throw new Error(text.slice(0, 600) || `${name} failed`);
  if (result.structuredContent) return result.structuredContent;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
};

// ---------- files ----------
const insideOutput = candidate => {
  try {
    const real = fs.realpathSync(candidate);
    const root = fs.realpathSync(outputDir());
    return isInside(root, real) ? real : null;
  } catch {
    return null;
  }
};
const sidecarOf = file => file.replace(/\.\w+$/, ".json");
const readSidecar = file => {
  try {
    return JSON.parse(fs.readFileSync(sidecarOf(file), "utf8"));
  } catch {
    return null;
  }
};
const writeSidecar = (file, meta) => {
  const target = sidecarOf(file);
  const temp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(meta, null, 2)}\n`);
  fs.renameSync(temp, target);
};
const probeDuration = file =>
  new Promise(resolve =>
    execFile(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { timeout: 30000, env: childEnv(), windowsHide: true }, (error, stdout) => {
      const value = Number(String(stdout).trim());
      resolve(error || !Number.isFinite(value) ? null : value);
    }),
  );

const historyItem = (meta, file, mtime) => ({
  file,
  name: path.basename(file),
  mtime,
  duration: meta.duration_s ?? null,
  voiceId: meta.voice_id ?? null,
  voiceName: meta.voice_name ?? null,
  modelId: meta.model_id ?? meta.request?.model_id ?? null,
  outputFormat: meta.output_format ?? null,
  characters: meta.characters ?? null,
  characterCost: meta.character_cost ?? null,
  seed: meta.request?.seed ?? null,
  created: meta.created ?? null,
  batch: meta.batch ?? `single:${file}`,
  take: meta.take ?? 1,
  takes: meta.takes ?? 1,
  source: meta.source ?? null,
  mediaId: meta.kino_media_id ?? null,
  request: meta.request ?? null,
});

const listHistory = (limit = 120) => {
  const dir = outputDir();
  let names = [];
  try {
    names = fs.readdirSync(dir).filter(name => name.endsWith(".json") && !name.startsWith("."));
  } catch {
    return [];
  }
  const entries = [];
  for (const name of names) {
    try {
      entries.push({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs });
    } catch {}
  }
  entries.sort((a, b) => b.mtime - a.mtime);
  const items = [];
  for (const entry of entries) {
    if (items.length >= limit) break;
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, entry.name), "utf8"));
      const file = typeof meta.file === "string" ? meta.file : null;
      if (!file || !AUDIO_EXT.test(file) || !insideOutput(file)) continue;
      items.push(historyItem(meta, file, entry.mtime));
    } catch {}
  }
  return items;
};

// ---------- import into Kino ----------
const importToLibrary = async (file, meta, force) => {
  if (meta?.kino_media_id && !force) return { mediaId: meta.kino_media_id, reused: true };
  const result = await kinoCall("addMediaToKino", { sources: [{ type: "localFile", absolutePath: file }] }, 180_000);
  const failed = result.failed?.[0];
  if (failed) throw new Error(`Kino could not import the file: ${failed.error ?? failed.message ?? JSON.stringify(failed).slice(0, 200)}`);
  const mediaId = result.media?.[0]?.mediaId ?? result.pending?.[0]?.mediaId;
  if (!mediaId) throw new Error("Kino did not return a media id for the import.");
  if (meta) {
    meta.kino_media_id = mediaId;
    meta.kino_imported = new Date().toISOString().slice(0, 19);
    try {
      writeSidecar(file, meta);
    } catch (error) {
      log("tts-sidecar-write-failed", { error: error.message });
    }
  }
  return { mediaId, reused: false };
};

const handleImport = async body => {
  const file = insideOutput(String(body.file ?? ""));
  if (!file || !AUDIO_EXT.test(file)) throw Object.assign(new Error("That take is not in the voiceover folder."), { status: 400 });
  const meta = readSidecar(file);
  let { mediaId, reused } = await importToLibrary(file, meta, false);
  if (body.place !== "playhead") return { mediaId, reused, placed: false, calls: reused ? 0 : 1 };

  let calls = reused ? 0 : 1;
  let projectId = typeof body.projectId === "string" && PROJECT_ID.test(body.projectId) ? body.projectId : null;
  if (!projectId) {
    calls += 1;
    const screen = await kinoCall("listUiActions", { query: "timeline", includeScreen: true });
    projectId = screen?.screen?.projectId ?? null;
    if (!projectId) throw new Error("Open a project first, then try again.");
  }
  let frame = Number.isInteger(body.frame) && body.frame >= 0 ? body.frame : null;
  let fps = Number(body.fps) > 0 && Number(body.fps) <= 240 ? Number(body.fps) : null;
  if (frame === null || !fps) {
    calls += 1;
    const playhead = await kinoCall("getCurrentPlayheadPosition", { projectId });
    frame = frame ?? Math.max(0, Math.round(Number(playhead.frame) || 0));
    fps = fps ?? (Number(playhead.fps) || 30);
  }
  // Sidecar first, then what the panel measured while decoding the take, then ffprobe.
  const measured = Number(body.duration) > 0 && Number(body.duration) < 6 * 3600 ? Number(body.duration) : null;
  const seconds = meta?.duration_s ?? measured ?? (await probeDuration(file));
  const insert = id =>
    kinoCall("timelineEdit", {
      projectId,
      ops: [
        {
          op: "insert",
          mediaIds: [id],
          position: `${frame}f`,
          ...(seconds ? { duration: `${Math.max(1, Math.floor(seconds * fps))}f` } : {}),
        },
      ],
    });
  let result;
  try {
    calls += 1;
    result = await insert(mediaId);
  } catch (error) {
    if (!reused) throw error;
    // The remembered media may have been deleted from the library: import it again once.
    log("tts-reimport", { mediaId, error: String(error.message).slice(0, 200) });
    ({ mediaId } = await importToLibrary(file, meta, true));
    calls += 2;
    result = await insert(mediaId);
  }
  const problem = result.validationError ?? result.bundleError ?? result.runtimeError ?? null;
  return { mediaId, reused, placed: true, projectId, frame, fps, inserted: result.inserted ?? null, warning: problem ? String(problem).slice(0, 300) : null, calls };
};

// ---------- HTTP ----------
const readBody = (req, limit) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("Request too large."), { status: 413 }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(Object.assign(new Error("Invalid JSON."), { status: 400 }));
      }
    });
    req.on("error", reject);
  });

let ffprobeFound = null;
/** Whether ffprobe runs. Without it takes have no stored length and the panel measures them itself. */
const hasFfprobe = () =>
  ffprobeFound
    ? Promise.resolve(true)
    : new Promise(resolve =>
        execFile(FFPROBE, ["-version"], { timeout: 15000, env: childEnv(), windowsHide: true }, error => {
          ffprobeFound = !error;
          resolve(ffprobeFound);
        }),
      );

// Generations in flight, so a panel that was closed and reopened (or a second panel) can show them.
const generating = new Map();

const costFactorFor = async modelId => {
  try {
    const models = await cached("models", false, () => ask("models"));
    return models.find(model => model.id === modelId)?.costFactor ?? 1;
  } catch {
    return 1;
  }
};

/** Routes already passed Host, Origin and token checks in server.mjs. */
export const handleTts = async (req, res, url, json, headers) => {
  const route = `${req.method} ${url.pathname}`;
  const fresh = url.searchParams.get("fresh") === "1";
  try {
    if (route === "GET /tts/status") {
      const status = await ask("status");
      return json(200, {
        ...status,
        envFile: fs.existsSync(ENV_FILE),
        voiceDir: VOICE_DIR,
        configFile: CONFIG_PATH,
        defaultDir: DEFAULT_OUT,
        ffprobe: await hasFfprobe(),
        ffprobeInstall: FFMPEG_INSTALL,
        mcp: KINO_MCP_URL,
      });
    }
    if (route === "POST /tts/config") {
      const body = await readBody(req, 16 * 1024);
      if (body.outputDir !== undefined) setOutputDir(body.outputDir);
      log("tts-config", { outputDir: outputDir() });
      return json(200, { outputDir: outputDir(), defaultDir: DEFAULT_OUT });
    }
    if (route === "GET /tts/voices") return json(200, { voices: await cached("voices", fresh, () => ask("voices")) });
    if (route === "GET /tts/models") return json(200, { models: await cached("models", fresh, () => ask("models")) });
    if (route === "GET /tts/quota") return json(200, await ask("quota"));
    if (route === "GET /tts/voice-settings") {
      const voice = String(url.searchParams.get("voice") ?? "");
      if (!/^[A-Za-z0-9_-]{6,64}$/.test(voice)) return json(400, { error: "Pick a voice." });
      return json(200, { voice, settings: await cached(`voice-settings:${voice}`, fresh, () => ask("voiceSettings", { voice })) });
    }
    if (route === "GET /tts/dictionaries") return json(200, { dictionaries: await cached("dictionaries", fresh, () => ask("dictionaries")) });
    if (route === "GET /tts/effects") return json(200, await cached("effects", fresh, () => ask("effects")));
    if (route === "GET /tts/history") {
      const limit = Math.min(Math.max(Number(url.searchParams.get("n")) || 120, 1), 400);
      return json(200, { dir: outputDir(), items: listHistory(limit), pending: [...generating.values()] });
    }
    if (route === "GET /tts/audio") {
      const file = insideOutput(String(url.searchParams.get("file") ?? ""));
      if (!file || !AUDIO_EXT.test(file)) return json(404, { error: "not found" });
      const stat = fs.statSync(file);
      res.writeHead(200, {
        ...headers,
        "content-type": AUDIO_TYPES[path.extname(file).slice(1).toLowerCase()] ?? "application/octet-stream",
        "content-length": stat.size,
        "cache-control": "private, max-age=3600",
      });
      // A file that vanishes mid-read must end this response, not the bridge.
      fs.createReadStream(file)
        .on("error", () => res.destroy())
        .pipe(res);
      return;
    }
    if (route === "GET /tts/voice-preview") {
      const voices = await cached("voices", false, () => ask("voices"));
      const voice = voices.find(item => item.id === url.searchParams.get("voice"));
      if (!voice?.previewUrl) return json(404, { error: "This voice has no preview." });
      const target = new URL(voice.previewUrl);
      if (target.protocol !== "https:" || !PREVIEW_HOSTS.test(target.hostname)) return json(400, { error: "Unexpected preview host." });
      const upstream = await fetch(target, { signal: AbortSignal.timeout(30_000) });
      if (!upstream.ok) return json(502, { error: `Preview download failed (${upstream.status}).` });
      const audio = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(200, { ...headers, "content-type": /^audio\//.test(upstream.headers.get("content-type") ?? "") ? upstream.headers.get("content-type") : "audio/mpeg", "content-length": audio.length, "cache-control": "private, max-age=86400" });
      return res.end(audio);
    }
    if (route === "POST /tts/generate") {
      const body = await readBody(req, 256 * 1024);
      const takes = Math.min(Math.max(Math.floor(Number(body.takes) || 1), 1), 4);
      const chars = typeof body.text === "string" ? body.text.trim().length : 0;
      if (!chars) return json(400, { error: "Write something to say first." });
      const estimate = Math.ceil(chars * (await costFactorFor(body.model_id)) * takes);
      const quota = await ask("quota").catch(() => null);
      const remaining = quota ? Math.max(0, quota.limit - quota.used) : null;
      // Ask first for runs over 5,000 credits or 10% of what is left: one stray click should not cost that much.
      const needsConfirm = estimate > 5000 || (remaining !== null && estimate > remaining * 0.1);
      if (remaining !== null && estimate > remaining) return json(402, { error: `This needs about ${estimate} credits and ${remaining} are left until the plan resets. Shorten the text or use fewer takes.`, estimate, remaining });
      // A plain answer, not an error status: the panel has to read the numbers.
      if (needsConfirm && body.confirmed !== true) return json(200, { needsConfirm: true, estimate, remaining });
      log("tts-generate", { chars, takes, estimate, model: body.model_id, voice: body.voice_id });
      const ticket = `g${++seq}`;
      generating.set(ticket, {
        id: ticket,
        startedAt: Date.now(),
        takes,
        text: body.text.trim().slice(0, 400),
        voiceName: typeof body.voice_name === "string" ? body.voice_name.slice(0, 120) : null,
        modelId: typeof body.model_id === "string" ? body.model_id.slice(0, 64) : null,
      });
      let result;
      try {
        result = await ask("generate", { ...body, takes }, GENERATE_TIMEOUT_MS);
      } finally {
        generating.delete(ticket);
      }
      const items = result.takes.map(take => (take.error ? take : historyItem(take, take.file, Date.now())));
      return json(200, { batch: result.batch, estimate, takes: items });
    }
    if (route === "POST /tts/import") {
      const body = await readBody(req, 16 * 1024);
      const result = await handleImport(body);
      log("tts-import", { mediaId: result.mediaId, placed: result.placed, calls: result.calls });
      return json(200, result);
    }
    if (route === "POST /tts/reveal") {
      const body = await readBody(req, 16 * 1024);
      // "keys" opens the folder the key file goes into, for the setup steps.
      const dir = body.target === "keys" ? VOICE_DIR : outputDir();
      fs.mkdirSync(dir, { recursive: true });
      const target = body.file ? insideOutput(String(body.file)) : fs.realpathSync(dir);
      if (!target) return json(400, { error: "That file is not in the voiceover folder." });
      reveal(target, { select: Boolean(body.file) });
      return json(200, { ok: true });
    }
    return json(404, { error: "not found" });
  } catch (error) {
    const message = redact(error?.message ?? String(error)).slice(0, 600) || "Request failed.";
    log("tts-error", { route, error: message.slice(0, 300) });
    if (res.headersSent) return res.destroy();
    // ElevenLabs turned the key down. 424, never 401: to a panel 401 means "this device is not paired".
    if (error?.upstream === 401) return json(424, { error: "ElevenLabs did not accept the API key. Connect your account again, then press Check again.", keyRejected: true });
    return json(error?.status ?? 502, { error: message });
  }
};

export const closeTts = async () => {
  try {
    worker?.child.kill();
  } catch {}
  worker = null;
  const pending = kinoPromise;
  kinoPromise = null;
  try {
    await (await pending)?.close();
  } catch {}
};
