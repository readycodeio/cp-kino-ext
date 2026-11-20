// npm run service -- <install | uninstall | start | stop | restart | status | logs | unpair>
//
// Runs the bridge as a per-user background service, so no terminal window has to stay open:
// - macOS: a launchd agent (~/Library/LaunchAgents). Starts at login, restarts if it crashes.
// - Windows: a hidden start at sign-in (HKCU Run key plus a small launcher script). No admin rights needed.
// - Linux: a systemd user unit. Starts at login, restarts if it crashes.
// Nothing here needs sudo, and uninstall removes everything install wrote.
//
// KINO_* variables set when you run install are saved into the service, so
//   KINO_TERMINAL_PORT=47700 npm run service -- install
// keeps that port across restarts. Run install again to change them.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DATA_DIR, HOME, IS_MAC, IS_WIN } from "../bridge/platform.mjs";
import { REPO, request } from "./lib.mjs";

const LABEL = "com.kino-panels.bridge";
const UNIT = "kino-panels-bridge.service";
const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const RUN_NAME = "KinoPanelsBridge";
const SERVER = path.join(REPO, "bridge", "server.mjs");
const LOG_DIR = path.join(DATA_DIR, "logs");
export const LOG_FILE = path.join(LOG_DIR, "bridge.log");
const MAX_LOG_BYTES = 5 * 1024 * 1024;
const PORT = Number(process.env.KINO_TERMINAL_PORT ?? 47680);

const PLIST = path.join(HOME, "Library", "LaunchAgents", `${LABEL}.plist`);
const UNIT_FILE = path.join(process.env.XDG_CONFIG_HOME || path.join(HOME, ".config"), "systemd", "user", UNIT);
const LAUNCHER = path.join(DATA_DIR, "start-bridge.vbs");

const run = (cmd, args, options = {}) => spawnSync(cmd, args, { encoding: "utf8", windowsHide: true, ...options });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
/** Blocking wait, for the short pauses between launchctl calls. */
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** KINO_* settings in effect now. They are written into the service definition. */
const savedEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key, value]) => /^KINO_[A-Z0-9_]+$/.test(key) && value));

/**
 * The node binary to put in the service. A version manager or Homebrew path that contains the version
 * number breaks at the next upgrade, so prefer a stable PATH entry that points at this same binary.
 */
const nodeBinary = () => {
  const real = fs.realpathSync(process.execPath);
  const candidates = IS_WIN ? [] : ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) if (dir) candidates.push(path.join(dir, IS_WIN ? "node.exe" : "node"));
  for (const candidate of candidates) {
    try {
      if (!/[\\/](v?\d+\.\d+\.\d+|Cellar)[\\/]/.test(candidate) && fs.realpathSync(candidate) === real) return candidate;
    } catch {}
  }
  return process.execPath;
};

// The service gets a plain PATH. Keep the folders the tools live in today, so ffmpeg, yt-dlp and deno resolve.
const servicePath = () => [...new Set([...(process.env.PATH ?? "").split(path.delimiter), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"].filter(Boolean))].join(":");

const rotateLog = () => {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  try {
    if (fs.statSync(LOG_FILE).size > MAX_LOG_BYTES) fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch {}
};

const health = async (timeout = 1500) => {
  try {
    const res = await request(PORT, "/health", { timeout });
    return res.json?.ok ? res.json : null;
  } catch {
    return null;
  }
};
const waitFor = async (up, ms = 15_000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (Boolean(await health(800)) === up) return true;
    await sleep(300);
  }
  return false;
};

const xml = text => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- macOS: launchd ----------
const domain = () => `gui/${os.userInfo().uid}`;
const mac = {
  installed: () => fs.existsSync(PLIST),
  write() {
    const env = { ...savedEnv(), PATH: servicePath() };
    const dict = Object.entries(env).map(([key, value]) => `      <key>${xml(key)}</key>\n      <string>${xml(value)}</string>`).join("\n");
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${xml(nodeBinary())}</string>
      <string>${xml(SERVER)}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${xml(REPO)}</string>
    <key>EnvironmentVariables</key>
    <dict>
${dict}
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
      <key>SuccessfulExit</key>
      <false/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>15</integer>
    <key>ProcessType</key>
    <string>Interactive</string>
    <key>StandardOutPath</key>
    <string>${xml(LOG_FILE)}</string>
    <key>StandardErrorPath</key>
    <string>${xml(LOG_FILE)}</string>
  </dict>
</plist>
`;
    fs.mkdirSync(path.dirname(PLIST), { recursive: true });
    fs.writeFileSync(PLIST, plist);
  },
  loaded: () => run("launchctl", ["print", `${domain()}/${LABEL}`]).status === 0,
  start() {
    // launchd tears a service down in the background: right after a stop it can still be listed, or
    // refuse a new bootstrap for a moment. Try a few times before giving up.
    let last = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      if (mac.loaded()) {
        if (run("launchctl", ["kickstart", `${domain()}/${LABEL}`]).status === 0) return;
      } else {
        const res = run("launchctl", ["bootstrap", domain(), PLIST]);
        if (res.status === 0) return;
        last = (res.stderr || res.stdout).trim();
      }
      pause(700);
    }
    if (!mac.loaded()) throw new Error(`launchctl bootstrap failed: ${last}`);
  },
  stop() {
    if (!mac.loaded()) return;
    run("launchctl", ["bootout", `${domain()}/${LABEL}`]);
    // bootout returns before the service is gone
    for (let i = 0; i < 20 && mac.loaded(); i++) pause(250);
  },
  remove() {
    fs.rmSync(PLIST, { force: true });
  },
  where: PLIST,
};

// ---------- Linux: systemd user unit ----------
const systemctl = (...args) => run("systemctl", ["--user", ...args]);
const linux = {
  installed: () => fs.existsSync(UNIT_FILE),
  write() {
    if (run("systemctl", ["--user", "--version"]).status !== 0) throw new Error("systemd user services are not available here. Run the bridge with npm start, or add your own autostart entry.");
    const env = Object.entries({ ...savedEnv(), PATH: servicePath() }).map(([key, value]) => `Environment="${key}=${String(value).replace(/["\\]/g, "\\$&")}"`).join("\n");
    const unit = `[Unit]
Description=Kino panels bridge
After=graphical-session.target

[Service]
ExecStart="${nodeBinary()}" "${SERVER}"
WorkingDirectory=${REPO}
${env}
Restart=on-failure
RestartSec=15
StandardOutput=append:${LOG_FILE}
StandardError=append:${LOG_FILE}

[Install]
WantedBy=default.target
`;
    fs.mkdirSync(path.dirname(UNIT_FILE), { recursive: true });
    fs.writeFileSync(UNIT_FILE, unit);
    systemctl("daemon-reload");
    systemctl("enable", UNIT);
  },
  start() {
    const res = systemctl("restart", UNIT);
    if (res.status !== 0) throw new Error(`systemctl start failed: ${(res.stderr || res.stdout).trim()}`);
  },
  stop() {
    systemctl("stop", UNIT);
  },
  remove() {
    systemctl("disable", UNIT);
    fs.rmSync(UNIT_FILE, { force: true });
    systemctl("daemon-reload");
  },
  where: UNIT_FILE,
};

// ---------- Windows: hidden start at sign-in ----------
const vbs = text => String(text).replace(/"/g, '""');
const win = {
  installed: () => run("reg.exe", ["query", RUN_KEY, "/v", RUN_NAME]).status === 0,
  write() {
    // wscript runs the launcher with no console window. cmd applies the saved settings and appends to the log.
    const sets = Object.entries(savedEnv()).map(([key, value]) => `set "${key}=${value}" && `).join("");
    // The extra pair of quotes around the whole line is what cmd /c strips; without it cmd eats the first and last quote.
    const command = `cmd /c "${sets}"${nodeBinary()}" "${SERVER}" >> "${LOG_FILE}" 2>&1"`;
    const script = `' Starts the Kino panels bridge without a window. Written by npm run service -- install.\r\nSet shell = CreateObject("WScript.Shell")\r\nshell.CurrentDirectory = "${vbs(REPO)}"\r\nshell.Run "${vbs(command)}", 0, False\r\n`;
    fs.mkdirSync(path.dirname(LAUNCHER), { recursive: true });
    fs.writeFileSync(LAUNCHER, script);
    const res = run("reg.exe", ["add", RUN_KEY, "/v", RUN_NAME, "/t", "REG_SZ", "/d", `wscript.exe "${LAUNCHER}"`, "/f"]);
    if (res.status !== 0) throw new Error(`Could not add the sign-in entry: ${(res.stderr || res.stdout).trim()}`);
  },
  start() {
    spawn("wscript.exe", [LAUNCHER], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  },
  stop() {
    // No service manager owns the process, so find whoever listens on the bridge port.
    const script = `Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`;
    const res = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
    for (const pid of String(res.stdout).split(/\s+/).filter(value => /^\d+$/.test(value))) run("taskkill.exe", ["/PID", pid, "/T", "/F"]);
  },
  remove() {
    run("reg.exe", ["delete", RUN_KEY, "/v", RUN_NAME, "/f"]);
    fs.rmSync(LAUNCHER, { force: true });
  },
  where: `${RUN_KEY}\\${RUN_NAME}`,
};

const service = IS_MAC ? mac : IS_WIN ? win : linux;

// ---------- commands ----------
const describe = info => `v${info.version} on 127.0.0.1:${PORT} (${info.platform})`;

export const install = async () => {
  rotateLog();
  if (service.installed()) {
    service.stop();
    await waitFor(false, 8000);
  }
  // Whatever still answers now is not ours: most likely npm start in a terminal window.
  const foreign = await health();
  service.write();
  service.start();
  console.log(`Service entry: ${service.where}`);
  console.log(`Log:           ${LOG_FILE}`);
  if (foreign) {
    console.log(`\nAnother bridge already holds port ${PORT} (${describe(foreign)}), probably npm start in a terminal window.`);
    console.log("Stop it there with Ctrl+C. The background service takes over within a few seconds and starts at every login.");
    return true;
  }
  const info = (await waitFor(true)) ? await health() : null;
  if (info) console.log(`\nThe bridge is running in the background (${describe(info)}) and starts at every login.`);
  else console.log(`\nThe service is installed, but the bridge did not answer on port ${PORT}. Check: npm run service -- logs`);
  return Boolean(info);
};

const commands = {
  install,
  async uninstall() {
    service.stop();
    service.remove();
    await waitFor(false, 8000);
    console.log("Background service removed. Pairings, keys and logs stay in " + DATA_DIR);
  },
  async start() {
    if (!service.installed()) return console.log("The service is not installed. Run: npm run service -- install");
    if (await health()) return console.log(`Already running: ${describe(await health())}`);
    rotateLog();
    service.start();
    console.log((await waitFor(true)) ? `Started: ${describe(await health())}` : "Did not start. Check: npm run service -- logs");
  },
  async stop() {
    service.stop();
    console.log((await waitFor(false, 8000)) ? "Stopped. It starts again at the next login; uninstall removes it for good." : `Something still answers on port ${PORT}. If you started the bridge with npm start, stop it with Ctrl+C in that window.`);
  },
  async restart() {
    if (!service.installed()) return console.log("The service is not installed. Run: npm run service -- install");
    service.stop();
    await waitFor(false, 8000);
    rotateLog();
    service.start();
    console.log((await waitFor(true)) ? `Restarted: ${describe(await health())}` : "Did not come back. Check: npm run service -- logs");
  },
  async status() {
    const info = await health();
    console.log(`Service:  ${service.installed() ? `installed (${service.where})` : "not installed (npm run service -- install)"}`);
    console.log(`Bridge:   ${info ? `running, ${describe(info)}` : `not running on port ${PORT}`}`);
    console.log(`Log:      ${LOG_FILE}`);
    process.exitCode = info ? 0 : 1;
  },
  print() {
    // Dry run: show what install would write, without touching the system.
    const real = fs.writeFileSync;
    const realMkdir = fs.mkdirSync;
    fs.mkdirSync = () => {};
    fs.writeFileSync = (file, text) => console.log(`# ${file}\n${text}`);
    try {
      if (IS_MAC) mac.write();
      else if (IS_WIN) console.log(`# ${win.where}\nwscript.exe "${LAUNCHER}"\n(the launcher runs: "${nodeBinary()}" "${SERVER}" >> "${LOG_FILE}")`);
      else console.log(`# ${UNIT_FILE}\n(run install to write the unit; it needs systemctl --user)`);
    } finally {
      fs.writeFileSync = real;
      fs.mkdirSync = realMkdir;
    }
  },
  async unpair() {
    // Every paired panel loses access at once. The bridge reads the file on each request, so no restart is needed.
    fs.rmSync(path.join(DATA_DIR, "tokens.json"), { force: true });
    console.log("All pairings removed. Panels show Connect again and need a new approval.");
  },
  logs() {
    if (!fs.existsSync(LOG_FILE)) return console.log(`No log yet at ${LOG_FILE}. The log is written when the bridge runs as a service.`);
    const lines = fs.readFileSync(LOG_FILE, "utf8").trimEnd().split("\n");
    console.log(lines.slice(-Number(process.argv[4] ?? 40)).join("\n"));
    console.log(`\n${LOG_FILE}`);
  },
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const command = commands[process.argv[2]];
  if (!command) {
    console.error("Usage: npm run service -- <install | uninstall | start | stop | restart | status | logs [lines] | unpair | print>");
    process.exit(1);
  }
  try {
    await command();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
