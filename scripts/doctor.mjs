// npm run doctor: checks what the bridge needs on this machine. Reads no secrets: for the ElevenLabs
// and Zernio keys it only checks that the files exist.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { IS_WIN, IS_MAC, DATA_DIR, VOICE_DIR, VOICE_CONFIG, DOCUMENTS, MOUNTS_DIR, childEnv, findBin, defaultShell } from "../bridge/platform.mjs";
import { request } from "./lib.mjs";
import os from "node:os";

const PORT = Number(process.env.KINO_TERMINAL_PORT ?? 47680);
const rows = [];
const add = (state, name, detail) => rows.push({ state, name, detail });
const INSTALL = IS_WIN
  ? { ffmpeg: "winget install Gyan.FFmpeg", ffprobe: "winget install Gyan.FFmpeg", "yt-dlp": "winget install yt-dlp.yt-dlp", deno: "winget install DenoLand.Deno" }
  : IS_MAC
    ? { ffmpeg: "brew install ffmpeg", ffprobe: "brew install ffmpeg", "yt-dlp": "brew install yt-dlp", deno: "brew install deno" }
    : { ffmpeg: "sudo apt install ffmpeg", ffprobe: "sudo apt install ffmpeg", "yt-dlp": "pipx install yt-dlp", deno: "curl -fsSL https://deno.land/install.sh | sh" };

const version = (bin, args) =>
  new Promise(resolve => {
    execFile(findBin(bin), args, { env: childEnv(), timeout: 15_000, windowsHide: true }, (error, stdout) => {
      resolve(error ? null : String(stdout).split(/\r?\n/)[0].trim());
    });
  });

// Node
const [major, minor] = process.versions.node.split(".").map(Number);
add(major > 20 || (major === 20 && minor >= 6) ? "ok" : "fail", "Node.js", `${process.versions.node} (needs 20.6+)`);

// Dependencies
try {
  await import("node-pty");
  await import("ws");
  await import("@elevenlabs/elevenlabs-js");
  await import("@modelcontextprotocol/sdk/client/index.js");
  add("ok", "npm packages", "installed");
} catch (error) {
  add("fail", "npm packages", `run npm ci (${String(error.message).split("\n")[0]})`);
}

// Tools the bridge runs. It uses the same PATH as here.
for (const [bin, args, why] of [
  ["ffmpeg", ["-version"], "Publish renders"],
  ["ffprobe", ["-version"], "Publish media checks (optional for Voiceover)"],
  ["yt-dlp", ["--version"], "YT Downloader"],
  ["deno", ["--version"], "YT Downloader (yt-dlp needs a JS runtime for YouTube)"],
]) {
  const v = await version(bin, args);
  add(v ? "ok" : "warn", bin, v ? v.replace(/ Copyright.*/, "") : `missing, needed for ${why}: ${INSTALL[bin]}`);
}

// Shell for the Terminal panel
add("ok", "Terminal shell", defaultShell(os.userInfo()));

// Folders
add("ok", "Bridge data", DATA_DIR);
const tokens = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "tokens.json"), "utf8")).tokens?.length ?? 0;
  } catch {
    return 0;
  }
})();
add(tokens ? "ok" : "info", "Paired panels", tokens ? `${tokens} pairing(s)` : "none yet, press Connect in a panel");
add(fs.existsSync(path.join(DATA_DIR, "secrets", "zernio.env")) ? "ok" : "info", "Zernio key", fs.existsSync(path.join(DATA_DIR, "secrets", "zernio.env")) ? "saved" : "not set, add it in the Publish panel's settings (only needed for posting)");
const envFile = path.join(VOICE_DIR, ".env.local");
add(fs.existsSync(envFile) ? "ok" : "info", "ElevenLabs key", fs.existsSync(envFile) ? `found in ${VOICE_DIR}` : `not set: see docs/voiceover.md (folder ${VOICE_DIR})`);
let voice = "";
try {
  voice = JSON.parse(fs.readFileSync(VOICE_CONFIG, "utf8")).voice_id ?? "";
} catch {}
add(voice ? "ok" : "info", "Default voice", voice ? `${voice} (${VOICE_CONFIG})` : "none, the Voiceover panel picks one from your account");
add(fs.existsSync(DOCUMENTS) ? "ok" : "warn", "Documents", DOCUMENTS);
add(fs.existsSync(MOUNTS_DIR) ? "ok" : "warn", "Kino projects", fs.existsSync(MOUNTS_DIR) ? MOUNTS_DIR : `${MOUNTS_DIR} not found. Open a project in Kino desktop first, or set KINO_MOUNTS_DIR.`);

// Running services (read-only checks)
try {
  const health = await request(PORT, "/health", { timeout: 3000 });
  add(health.json?.ok ? "ok" : "warn", "Bridge", health.json?.ok ? `running on 127.0.0.1:${PORT}, v${health.json.version} (${health.json.platform ?? "platform not reported"})` : `port ${PORT} answered ${health.status}`);
} catch {
  add("info", "Bridge", `not running on 127.0.0.1:${PORT}. Run npm run setup to install it as a background service, or npm start to run it in this window.`);
}
try {
  const mcp = await request(45680, "/mcp", { origin: null, host: "127.0.0.1:45680", timeout: 3000 });
  add("ok", "Kino MCP", `reachable (HTTP ${mcp.status}), used to import into Kino`);
} catch {
  add("info", "Kino MCP", "not reachable on 127.0.0.1:45680. Open Kino desktop to save thumbnails and voiceovers into Kino.");
}

const mark = { ok: "ok  ", warn: "WARN", fail: "FAIL", info: "--  " };
const width = Math.max(...rows.map(r => r.name.length));
console.log(`Kino panels doctor (${IS_MAC ? "macOS" : IS_WIN ? "Windows" : process.platform})\n`);
for (const r of rows) console.log(`${mark[r.state]}  ${r.name.padEnd(width)}  ${r.detail}`);
process.exitCode = rows.some(r => r.state === "fail") ? 1 : 0;
