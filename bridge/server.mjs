// Kino bridge: serves shell PTY sessions to the Kino "Terminal" panel, plus the routes behind the
// YT Downloader, Voiceover, Thumbnails and Publish panels. Runs on macOS and Windows 10/11.
//
// Security model
// - Listens on 127.0.0.1 only and rejects any Host header other than 127.0.0.1/localhost:<port>
//   (blocks DNS rebinding).
// - Only browser Origins in ALLOWED_ORIGINS (https://kino.ai) may pair or open sessions, so other
//   websites cannot reach it.
// - A session also needs a token. Tokens are issued only after you click Allow in a native dialog
//   (macOS dialog or Windows message box); only their SHA-256 hashes are stored (tokens.json in
//   DATA_DIR, mode 0600). Delete tokens.json to revoke every paired panel.
import http from "node:http";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pty from "node-pty";
import { WebSocketServer } from "ws";
import { handleYtdl, setLogger, closeYtdl } from "./ytdl.mjs";
import { handleTts, setLogger as setTtsLogger, closeTts } from "./tts.mjs";
import { handleThumbs, setLogger as setThumbsLogger, closeThumbs } from "./thumbs.mjs";
import { handleZernio, setLogger as setZernioLogger, closeZernio } from "./zernio.mjs";
import { startAutoInstall } from "./autoinstall.mjs";
import { IS_WIN, THIS_MACHINE, HOME, DATA_DIR, PROJECTS_DIR, MOUNTS_DIR, askToPair, pickShell, shellArgs, STOP_SIGNALS, ensurePtyHelper } from "./platform.mjs";

const PORT = Number(process.env.KINO_TERMINAL_PORT ?? 47680);
const HOST = "127.0.0.1";
const ALLOWED_ORIGINS = new Set(
  (process.env.KINO_TERMINAL_ORIGINS ?? "https://kino.ai").split(",").map(s => s.trim()).filter(Boolean),
);
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const USER = os.userInfo();
const VERSION = 11;
const FEATURES = ["auth", "pty", "ytdl", "ytdl-config", "ytdl-formats", "tts", "tts-config", "thumbs", "thumbs-prompt", "zernio", "publish-media", "publish-outbox"];
fs.mkdirSync(DATA_DIR, { recursive: true });
const TOKENS_FILE = path.join(DATA_DIR, "tokens.json");
const DETACHED_TTL_MS = 15 * 60 * 1000; // a closed panel can reattach to its shell for 15 minutes
const SCROLLBACK_BYTES = 512 * 1024; // output replayed on reattach
const MAX_SESSIONS = 24;
const MAX_TOKENS = 40;
const HELLO_TIMEOUT_MS = 5000;
const PROJECT_ID = /^[A-Za-z0-9_-]{1,64}$/;

const log = (event, fields = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
setLogger(log);
setTtsLogger(log);
setThumbsLogger(log);
setZernioLogger(log);
for (const helper of ensurePtyHelper()) log("pty-helper-fixed", { helper });

// ---------- tokens ----------
const sha256 = value => crypto.createHash("sha256").update(value).digest();
const loadTokens = () => {
  try {
    return JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8")).tokens ?? [];
  } catch {
    return [];
  }
};
const saveToken = () => {
  const token = crypto.randomBytes(32).toString("base64url");
  // Keep the newest pairings only: every Connect adds one, and old browsers and reinstalls never come back.
  const tokens = [...loadTokens(), { sha256: sha256(token).toString("hex"), created: new Date().toISOString() }].slice(-MAX_TOKENS);
  fs.writeFileSync(TOKENS_FILE, JSON.stringify({ tokens }, null, 2), { mode: 0o600 });
  if (!IS_WIN) fs.chmodSync(TOKENS_FILE, 0o600); // Windows: the per-user profile folder already limits access
  return token;
};
const isValidToken = token => {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return false;
  const digest = sha256(token);
  return loadTokens().some(entry => {
    const stored = Buffer.from(String(entry.sha256), "hex");
    return stored.length === digest.length && crypto.timingSafeEqual(stored, digest);
  });
};

// ---------- pairing dialog ----------
let pairingInFlight = false;
let pairingCooldownUntil = 0;

// ---------- sessions ----------
/** @type {Map<string, {id: string, term: import("node-pty").IPty, socket: import("ws").WebSocket | null, chunks: Buffer[], size: number, cwd: string, detachTimer: NodeJS.Timeout | null, paused: boolean}>} */
const sessions = new Map();

const isDirectory = dir => {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
};

const resolveCwd = ({ cwd, projectId }) => {
  if (typeof cwd === "string" && cwd) {
    const expanded = /^~[\\/]/.test(cwd) ? path.join(HOME, cwd.slice(2)) : cwd;
    if (path.isAbsolute(expanded) && isDirectory(expanded)) return expanded;
  }
  if (typeof projectId === "string" && PROJECT_ID.test(projectId)) {
    const projectDir = path.join(MOUNTS_DIR, projectId);
    if (isDirectory(projectDir)) return projectDir;
  }
  return HOME;
};

const clampSize = (value, fallback) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, 2), 1000) : fallback;
};

const sendJson = (socket, message) => {
  if (socket?.readyState === 1) socket.send(JSON.stringify(message));
};

const endSession = (session, reason) => {
  if (!sessions.has(session.id)) return;
  sessions.delete(session.id);
  if (session.detachTimer) clearTimeout(session.detachTimer);
  try {
    session.term.kill();
  } catch {}
  log("session-end", { session: session.id, reason });
};

const createSession = hello => {
  const cwd = resolveCwd(hello);
  const shell = pickShell(hello.shell, USER);
  const projectDir =
    typeof hello.projectId === "string" && PROJECT_ID.test(hello.projectId)
      ? path.join(MOUNTS_DIR, hello.projectId)
      : "";
  const env = {
    ...process.env,
    ...(IS_WIN ? {} : { HOME, USER: USER.username, LOGNAME: USER.username, SHELL: shell, LANG: process.env.LANG ?? "en_US.UTF-8" }),
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    TERM_PROGRAM: "KinoTerminal",
    KINO_PROJECT_ID: projectDir ? hello.projectId : "",
    KINO_PROJECT_DIR: projectDir && isDirectory(projectDir) ? projectDir : "",
  };
  for (const key of Object.keys(env)) if (key.startsWith("KINO_TERMINAL_") || key.startsWith("KINO_BRIDGE_")) delete env[key];

  const term = pty.spawn(shell, shellArgs(shell), {
    name: "xterm-256color",
    cols: clampSize(hello.cols, 80),
    rows: clampSize(hello.rows, 24),
    cwd,
    env,
    encoding: null, // raw bytes on macOS; Windows (ConPTY) ignores this and sends strings
  });
  const session = {
    id: crypto.randomUUID(),
    term,
    socket: null,
    chunks: [],
    size: 0,
    cwd,
    detachTimer: null,
    paused: false,
  };
  sessions.set(session.id, session);

  term.onData(data => {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
    session.chunks.push(chunk);
    session.size += chunk.length;
    while (session.size > SCROLLBACK_BYTES && session.chunks.length > 1) session.size -= session.chunks.shift().length;
    const socket = session.socket;
    if (socket?.readyState === 1) {
      socket.send(chunk, { binary: true });
      // Back-pressure: stop reading the PTY while the panel is behind (e.g. `yes`).
      if (!session.paused && socket.bufferedAmount > 4 * 1024 * 1024) {
        session.paused = true;
        term.pause();
        const resume = setInterval(() => {
          if (!sessions.has(session.id) || session.socket !== socket || socket.bufferedAmount < 512 * 1024) {
            clearInterval(resume);
            session.paused = false;
            if (sessions.has(session.id)) term.resume();
          }
        }, 50);
      }
    }
  });
  term.onExit(({ exitCode, signal }) => {
    sendJson(session.socket, { t: "exit", exitCode, signal: signal ?? null });
    session.socket?.close(1000, "exited");
    endSession(session, `exit ${exitCode}`);
  });
  log("session-start", { session: session.id, shell, cwd, active: sessions.size });
  return session;
};

const attach = (session, socket, resumed) => {
  if (session.detachTimer) clearTimeout(session.detachTimer);
  session.detachTimer = null;
  session.socket = socket;
  sendJson(socket, { t: "ready", sessionId: session.id, cwd: session.cwd, home: HOME, resumed });
  if (resumed && session.size > 0) socket.send(Buffer.concat(session.chunks), { binary: true });

  socket.on("message", (data, isBinary) => {
    if (session.socket !== socket) return;
    if (isBinary) {
      session.term.write(Buffer.from(data).toString("utf8"));
      return;
    }
    let message;
    try {
      message = JSON.parse(String(data));
    } catch {
      return;
    }
    if (message.t === "resize") session.term.resize(clampSize(message.cols, 80), clampSize(message.rows, 24));
    else if (message.t === "kill") endSession(session, "killed by panel");
  });
  socket.on("close", () => {
    if (session.socket !== socket) return;
    session.socket = null;
    if (!sessions.has(session.id)) return;
    session.detachTimer = setTimeout(() => endSession(session, "detached timeout"), DETACHED_TTL_MS);
    log("session-detach", { session: session.id });
  });
};

// ---------- HTTP ----------
// Token-gated route groups, one per panel module.
const ROUTES = [
  ["/ytdl/", (req, res, url, json) => handleYtdl(req, url, json)],
  ["/tts/", (req, res, url, json, headers) => handleTts(req, res, url, json, headers)],
  ["/thumbs/", (req, res, url, json, headers) => handleThumbs(req, res, url, json, headers)],
  ["/zernio/", (req, res, url, json) => handleZernio(req, res, url, json)],
];
const hostAllowed = req => ALLOWED_HOSTS.has(String(req.headers.host ?? "").toLowerCase());
const originAllowed = req => ALLOWED_ORIGINS.has(String(req.headers.origin ?? ""));
const corsHeaders = req => ({
  "access-control-allow-origin": String(req.headers.origin),
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-private-network": "true",
  "access-control-max-age": "600",
  vary: "Origin",
});

const server = http.createServer((req, res) => {
  if (!hostAllowed(req) || !originAllowed(req)) {
    res.writeHead(403, { "content-type": "text/plain" }).end("forbidden");
    return;
  }
  const headers = corsHeaders(req);
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const json = (status, body) =>
    res.writeHead(status, { ...headers, "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));

  if (req.method === "OPTIONS") {
    res.writeHead(204, headers).end();
  } else if (req.method === "GET" && url.pathname === "/health") {
    json(200, { ok: true, app: "kino-terminal", version: VERSION, features: FEATURES, platform: process.platform });
  } else if (req.method === "POST" && url.pathname === "/pair") {
    if (pairingInFlight) return json(409, { error: `A pairing dialog is already open on ${THIS_MACHINE}.` });
    if (Date.now() < pairingCooldownUntil) return json(429, { error: "Pairing was just denied. Try again shortly." });
    pairingInFlight = true;
    log("pair-request");
    askToPair(USER.username).then(approved => {
      pairingInFlight = false;
      if (approved === "no-dialog") {
        log("pair-no-dialog");
        return json(501, { error: "This desktop has no dialog tool to confirm pairing. Install zenity or kdialog, then press Connect again." });
      }
      if (!approved) {
        pairingCooldownUntil = Date.now() + 10_000;
        log("pair-denied");
        return json(403, { error: `Pairing was denied on ${THIS_MACHINE}.` });
      }
      log("pair-approved");
      json(200, { token: saveToken() });
    });
  } else if (url.pathname === "/auth" || ROUTES.some(([prefix]) => url.pathname.startsWith(prefix))) {
    // Everything past pairing needs the token. /auth is the bare token check panels use to tell
    // "not paired" from "bridge offline".
    const auth = String(req.headers.authorization ?? "");
    if (!isValidToken(auth.startsWith("Bearer ") ? auth.slice(7) : "")) return json(401, { error: "unauthorized" });
    if (url.pathname === "/auth") return json(200, { ok: true, version: VERSION, features: FEATURES });
    ROUTES.find(([prefix]) => url.pathname.startsWith(prefix))[1](req, res, url, json, headers);
  } else {
    json(404, { error: "not found" });
  }
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (!hostAllowed(req) || !originAllowed(req) || url.pathname !== "/pty") {
    log("upgrade-rejected", { origin: req.headers.origin ?? null, host: req.headers.host ?? null });
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws));
});

wss.on("connection", socket => {
  socket.isAlive = true;
  socket.on("pong", () => (socket.isAlive = true));
  const helloTimer = setTimeout(() => socket.close(4408, "hello timeout"), HELLO_TIMEOUT_MS);

  socket.once("message", (data, isBinary) => {
    clearTimeout(helloTimer);
    let hello;
    try {
      hello = isBinary ? null : JSON.parse(String(data));
    } catch {}
    if (!hello || hello.t !== "hello") return socket.close(4400, "expected hello");
    if (!isValidToken(hello.token)) {
      log("auth-failed");
      return socket.close(4401, "unauthorized");
    }

    const existing = typeof hello.sessionId === "string" ? sessions.get(hello.sessionId) : undefined;
    if (existing && !existing.socket) {
      existing.term.resize(clampSize(hello.cols, 80), clampSize(hello.rows, 24));
      attach(existing, socket, true);
      log("session-resume", { session: existing.id });
      return;
    }
    if (sessions.size >= MAX_SESSIONS) return socket.close(4429, "too many sessions");
    try {
      attach(createSession(hello), socket, false);
    } catch (error) {
      log("spawn-failed", { error: String(error) });
      sendJson(socket, { t: "error", message: `Could not start shell: ${String(error)}` });
      socket.close(4500, "spawn failed");
    }
  });
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) socket.terminate();
    else {
      socket.isAlive = false;
      socket.ping();
    }
  }
}, 30_000);

let stopAutoInstall = () => {};
const shutdown = signal => {
  log("shutdown", { signal, sessions: sessions.size });
  clearInterval(heartbeat);
  for (const session of [...sessions.values()]) endSession(session, signal);
  closeYtdl();
  closeTts();
  closeThumbs();
  closeZernio();
  stopAutoInstall();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
};
for (const signal of STOP_SIGNALS) process.on(signal, () => shutdown(signal));

// A bug in one route must not take every panel's session down with it: log and keep serving.
process.on("unhandledRejection", reason => log("unhandled-rejection", { error: String(reason?.stack ?? reason).slice(0, 2000) }));
process.on("uncaughtException", error => {
  log("uncaught-exception", { error: String(error?.stack ?? error).slice(0, 2000) });
  if (!server.listening) process.exit(1);
});

server.on("error", error => {
  if (error.code === "EADDRINUSE") log("port-in-use", { port: PORT, hint: "Another bridge is already running on this port. Stop it first (Ctrl+C in its window, or npm run service -- stop), or set KINO_TERMINAL_PORT." });
  else log("server-error", { error: String(error) });
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  log("listening", { host: HOST, port: PORT, version: VERSION, platform: process.platform, origins: [...ALLOWED_ORIGINS], projectsDir: PROJECTS_DIR, mountsDir: MOUNTS_DIR, dataDir: DATA_DIR });
  stopAutoInstall = startAutoInstall(log);
});
