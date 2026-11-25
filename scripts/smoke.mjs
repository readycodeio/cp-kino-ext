// npm run smoke: start a throwaway bridge on another port with its own temp data folder, check the
// HTTP guards and every feature's status route, open a real shell over the WebSocket, then stop.
// It never touches a bridge already running on 47680, nor your tokens, keys or voice settings.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { REPO, request } from "./lib.mjs";

const PORT = Number(process.env.SMOKE_PORT ?? 47681);
if (PORT === 47680) {
  console.error("The smoke test must not use 47680, the port of your real bridge.");
  process.exit(1);
}
const EXPECTED_FEATURES = ["auth", "pty", "ytdl", "ytdl-config", "ytdl-formats", "tts-config", "tts", "thumbs", "thumbs-prompt", "zernio", "publish-media"];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kino-smoke-"));
const dirs = Object.fromEntries(["data", "voice", "docs", "projects", "ytdl"].map(name => [name, path.join(tmp, name)]));
for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
const token = crypto.randomBytes(32).toString("base64url");
fs.writeFileSync(
  path.join(dirs.data, "tokens.json"),
  JSON.stringify({ tokens: [{ sha256: crypto.createHash("sha256").update(token).digest("hex"), created: new Date().toISOString() }] }),
);

// Fake mounts for the auto-install check: a fresh project, a fork that still names its parent, and a
// plain folder Kino did not mount. Their baselines are a minute old, so the bridge treats them as settled.
const aMinuteAgo = new Date(Date.now() - 60_000);
for (const id of ["fresh01", "forked01"]) {
  const baseline = path.join(dirs.projects, id, ".kino-mount", "baseline.json");
  fs.mkdirSync(path.dirname(baseline), { recursive: true });
  fs.writeFileSync(baseline, "{}");
  fs.utimesSync(baseline, aMinuteAgo, aMinuteAgo);
}
fs.mkdirSync(path.join(dirs.projects, "forked01", "panels"), { recursive: true });
fs.writeFileSync(path.join(dirs.projects, "forked01", "panels", "project.ts"), 'export const PROJECT_ID = "parent01"\n');
fs.mkdirSync(path.join(dirs.projects, "Thumbnails"), { recursive: true });

const env = { ...process.env };
for (const key of Object.keys(env)) if (/^(ELEVENLABS_|ZERNIO_|KINO_)/i.test(key)) delete env[key];
Object.assign(env, {
  KINO_TERMINAL_PORT: String(PORT),
  KINO_BRIDGE_HOME: dirs.data,
  KINO_TTS_DIR: dirs.voice,
  KINO_TTS_CONFIG: path.join(dirs.voice, "config.json"),
  KINO_DOCUMENTS_DIR: dirs.docs,
  KINO_PROJECTS_DIR: dirs.projects,
  KINO_YTDL_DIR: dirs.ytdl,
  KINO_MCP_URL: "http://127.0.0.1:9/mcp", // nothing listens there: no Kino calls during the test
});

const output = [];
const bridge = spawn(process.execPath, [path.join(REPO, "bridge", "server.mjs")], { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
bridge.stdout.on("data", d => output.push(String(d)));
bridge.stderr.on("data", d => output.push(String(d)));

let passed = 0;
const failures = [];
const check = (name, ok, detail = "") => {
  if (ok) {
    passed++;
    console.log(`ok   ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    failures.push(name);
    console.log(`FAIL ${name}${detail ? `  (${detail})` : ""}`);
  }
};

const cleanup = async () => {
  if (bridge.exitCode === null) {
    const exited = new Promise(resolve => bridge.once("exit", resolve));
    try {
      bridge.kill();
    } catch {}
    await Promise.race([exited, new Promise(r => setTimeout(r, 5000))]);
  }
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); // our own mkdtemp folder
  } catch {}
};

const waitForHealth = async () => {
  const until = Date.now() + 20_000;
  while (Date.now() < until) {
    if (bridge.exitCode !== null) throw new Error(`bridge exited with ${bridge.exitCode}`);
    try {
      const res = await request(PORT, "/health", { timeout: 1000 });
      if (res.status === 200) return res;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error("bridge did not answer /health within 20 s");
};

const ptyCheck = () =>
  new Promise(resolve => {
    // Marker printed by node, built from pieces so the typed command itself never contains it.
    const node = /\s/.test(process.execPath) ? "node" : process.execPath;
    const command = `${node} -e "console.log('kino'+'-smoke-'+'ok')"\r`;
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}/pty`, { origin: "https://kino.ai" });
    let text = "";
    let typed = false;
    const timer = setTimeout(() => finish(false, `no marker within 45 s; output tail: ${JSON.stringify(text.slice(-400))}`), 45_000);
    const finish = (ok, detail) => {
      clearTimeout(timer);
      try {
        socket.send(JSON.stringify({ t: "kill" }));
      } catch {}
      socket.close();
      resolve({ ok, detail });
    };
    socket.on("open", () => socket.send(JSON.stringify({ t: "hello", token, cols: 100, rows: 30, projectId: "smoke" })));
    socket.on("message", (data, isBinary) => {
      if (!isBinary) {
        const message = JSON.parse(String(data));
        if (message.t === "ready" && !typed) {
          typed = true;
          setTimeout(() => socket.send(Buffer.from(command, "utf8")), 1500); // let the shell print its prompt
        } else if (message.t === "error" || message.t === "exit") finish(false, JSON.stringify(message));
        return;
      }
      text += Buffer.from(data).toString("utf8");
      if (text.includes("kino-smoke-ok")) finish(true, "shell ran a command");
    });
    socket.on("error", error => finish(false, String(error)));
  });

const badTokenCheck = () =>
  new Promise(resolve => {
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}/pty`, { origin: "https://kino.ai" });
    socket.on("open", () => socket.send(JSON.stringify({ t: "hello", token: "x".repeat(40) })));
    socket.on("close", code => resolve(code));
    socket.on("error", () => resolve(-1));
  });

const badOriginUpgrade = () =>
  new Promise(resolve => {
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}/pty`, { origin: "https://evil.example" });
    socket.on("open", () => resolve("opened"));
    socket.on("unexpected-response", (req, res) => resolve(res.statusCode));
    socket.on("error", () => resolve("error"));
  });

try {
  console.log(`Smoke test: temporary bridge on 127.0.0.1:${PORT}, data in ${tmp}\n`);
  const health = await waitForHealth();
  check("health", health.json?.ok === true && health.json.version >= 10, `v${health.json?.version}`);
  check("health reports this platform", health.json?.platform === process.platform, health.json?.platform);
  check("all features", EXPECTED_FEATURES.every(f => health.json?.features?.includes(f)), (health.json?.features ?? []).join(", "));

  check("rejects other origins", (await request(PORT, "/health", { origin: "https://evil.example" })).status === 403);
  check("rejects missing origin", (await request(PORT, "/health", { origin: null })).status === 403);
  check("rejects other Host headers", (await request(PORT, "/health", { host: "evil.example" })).status === 403);
  check("routes need a token", (await request(PORT, "/zernio/status")).status === 401);
  check("rejects a wrong token", (await request(PORT, "/zernio/status", { token: "y".repeat(43) })).status === 401);
  check("token check needs a token", (await request(PORT, "/auth")).status === 401);
  check("token check accepts a paired token", (await request(PORT, "/auth", { token })).json?.ok === true);
  check("unknown routes are not found", (await request(PORT, "/ytdl", { token })).status === 404 && (await request(PORT, "/nope")).status === 404);

  const zernio = await request(PORT, "/zernio/status", { token });
  check("zernio status (no key yet)", zernio.status === 200 && zernio.json?.configured === false);

  check("publish: unknown sent post is not found", (await request(PORT, "/zernio/posts/sent?key=xxxxxxxx", { token })).status === 404);
  check("publish: posting needs an explicit confirm", (await request(PORT, "/zernio/posts/create", { method: "POST", token, body: {} })).status === 400);

  const tts = await request(PORT, "/tts/status", { token, timeout: 30_000 });
  check("voiceover worker starts", tts.status === 200 && tts.json?.hasKey === false && tts.json?.envFile === false && tts.json?.arch === process.arch, `sdk ${tts.json?.sdk ?? "?"}, voiceDir ${tts.json?.voiceDir}`);

  const ytdl = await request(PORT, "/ytdl/status", { token, timeout: 30_000 });
  check("yt downloader status", ytdl.status === 200 && ytdl.json?.ok === true, `yt-dlp ${ytdl.json?.ytdlp ?? "not installed"}`);

  const thumbs = await request(PORT, "/thumbs/list?projectId=smoke", { token });
  check("thumbnails list", thumbs.status === 200, thumbs.text.slice(0, 80));

  const read = (...parts) => {
    try {
      return fs.readFileSync(path.join(dirs.projects, ...parts), "utf8");
    } catch {
      return "";
    }
  };
  const fresh = read("fresh01", "panels", "project.ts");
  check("auto-install: new project gets the panels", fresh.includes('PROJECT_ID = "fresh01"') && read("fresh01", "panels", "publish", "Panel.tsx").length > 0 && read("fresh01", "thumbs", "designs.json").length > 0);
  check("auto-install: a fork is relinked to its own id", read("forked01", "panels", "project.ts").includes('PROJECT_ID = "forked01"') && !fs.existsSync(path.join(dirs.projects, "forked01", "panels", "publish")));
  check("auto-install: unmounted folders are left alone", !fs.existsSync(path.join(dirs.projects, "Thumbnails", "panels")));
  check("auto-install: remembers what it installed", read("..", "data", "auto-install.json").includes("fresh01"));

  check("terminal rejects other origins", (await badOriginUpgrade()) === 403);
  check("terminal rejects a wrong token", (await badTokenCheck()) === 4401);
  const pty = await ptyCheck();
  check("terminal runs a shell", pty.ok, pty.detail);
} catch (error) {
  failures.push(String(error.message ?? error));
  console.log(`FAIL ${error.message ?? error}`);
} finally {
  await cleanup();
}

if (failures.length) {
  console.log(`\n${failures.length} failed, ${passed} passed. Bridge log:\n${output.join("").slice(-4000)}`);
  process.exit(1);
}
console.log(`\nAll ${passed} smoke checks passed.`);
process.exit(0);
