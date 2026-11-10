// OS differences for the Kino bridge: where state lives, the child process environment, shells,
// the pairing dialog and "show in Finder/Explorer". Everything else in the bridge is plain Node.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const IS_WIN = process.platform === "win32";
export const IS_MAC = process.platform === "darwin";
export const THIS_MACHINE = IS_MAC ? "this Mac" : IS_WIN ? "this PC" : "this computer";
export const HOME = os.homedir();

const env = name => (process.env[name] ?? "").trim();
const localAppData = () => env("LOCALAPPDATA") || path.join(HOME, "AppData", "Local");
const roamingAppData = () => env("APPDATA") || path.join(HOME, "AppData", "Roaming");

// Bridge state: tokens.json (hashed pairing tokens) and secrets/ (Zernio key). The macOS default is
// the folder the bridge used before it moved into this repo, so existing pairings keep working.
export const DATA_DIR =
  env("KINO_BRIDGE_HOME") || (IS_WIN ? path.join(localAppData(), "kino-terminal") : path.join(HOME, ".local", "share", "kino-terminal"));

// ElevenLabs key folder: holds .env.local written by `elevenlabs onboard`. Only the TTS worker reads it.
export const VOICE_DIR =
  env("KINO_TTS_DIR") || (IS_WIN ? path.join(localAppData(), "elevenlabs-voice") : path.join(HOME, ".local", "share", "elevenlabs-voice"));
export const VOICE_CONFIG =
  env("KINO_TTS_CONFIG") ||
  (IS_WIN ? path.join(roamingAppData(), "elevenlabs-voice", "config.json") : path.join(HOME, ".config", "elevenlabs-voice", "config.json"));

// The user's Documents folder. On Windows it is often redirected (OneDrive), so ask the registry.
const documentsDir = () => {
  if (env("KINO_DOCUMENTS_DIR")) return env("KINO_DOCUMENTS_DIR");
  if (IS_WIN) {
    try {
      const out = execFileSync(
        "reg.exe",
        ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders", "/v", "Personal"],
        { encoding: "utf8", timeout: 5000, windowsHide: true },
      );
      const match = /Personal\s+REG_\w+\s+(.+)/.exec(out);
      const dir = match?.[1]?.trim();
      if (dir && fs.existsSync(dir)) return dir;
    } catch {}
  }
  return path.join(HOME, "Documents");
};
export const DOCUMENTS = documentsDir();
export const PROJECTS_DIR = env("KINO_PROJECTS_DIR") || path.join(DOCUMENTS, "KinoProjects");

// ---------- child processes ----------
// macOS: Homebrew first, so its current yt-dlp, deno and ffmpeg win over older copies.
const POSIX_PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
// Windows needs these for networking, temp files and finding programs; none of them are secrets.
const WIN_KEEP = [
  "SystemRoot", "SystemDrive", "windir", "ComSpec", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "USERNAME", "USERDOMAIN",
  "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432", "CommonProgramFiles",
  "HOMEDRIVE", "HOMEPATH", "PUBLIC", "ALLUSERSPROFILE", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS",
];

/** Minimal environment for helper processes (yt-dlp, ffmpeg, the TTS worker). */
export const childEnv = (extra = {}) => {
  if (IS_WIN) {
    const out = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.toUpperCase() === "PATH" || WIN_KEEP.some(name => name.toUpperCase() === key.toUpperCase())) out[key] = value;
    }
    return { ...out, ...extra };
  }
  const extraPath = env("KINO_EXTRA_PATH");
  return {
    HOME,
    PATH: extraPath ? `${extraPath}:${POSIX_PATH}` : POSIX_PATH,
    LANG: process.env.LANG ?? "en_US.UTF-8",
    TMPDIR: os.tmpdir(),
    ...extra,
  };
};

/** Absolute path of a tool when we can find it, else the bare name for PATH lookup. */
export const findBin = name => {
  if (IS_WIN) return name; // execFile resolves name.exe through PATH (winget adds a shim)
  return [`/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`, `/usr/bin/${name}`].find(f => fs.existsSync(f)) ?? name;
};

/** True when `target` is `root` or inside it. Case-insensitive on Windows. */
export const isInside = (root, target, { allowRoot = false } = {}) => {
  const norm = p => (IS_WIN ? path.resolve(p).toLowerCase() : path.resolve(p));
  const r = norm(root);
  const t = norm(target);
  return (allowRoot && t === r) || t.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
};

// ---------- desktop integration ----------
/** Show a folder, or select a file in its folder (Finder or Explorer). */
export const reveal = (target, { select = false } = {}) => {
  if (IS_MAC) return void execFile("/usr/bin/open", select ? ["-R", target] : [target], () => {});
  if (IS_WIN) {
    // explorer.exe returns exit code 1 even on success; its /select switch needs the raw quoting.
    const args = select ? [`/select,"${target}"`] : [`"${target}"`];
    return void execFile("explorer.exe", args, { windowsVerbatimArguments: true, windowsHide: false }, () => {});
  }
  execFile("xdg-open", [select ? path.dirname(target) : target], () => {});
};

/** Open an http(s) URL in the default browser. */
export const openUrl = url => {
  if (!/^https:\/\//i.test(String(url))) return;
  if (IS_MAC) return void execFile("/usr/bin/open", [url], () => {});
  if (IS_WIN) return void execFile("rundll32.exe", ["url.dll,FileProtocolHandler", url], { windowsHide: true }, () => {});
  execFile("xdg-open", [url], () => {});
};

// ---------- pairing dialog ----------
const PAIR_TEXT = name =>
  `A Kino panel wants to use the Kino bridge on ${THIS_MACHINE} as ${name}: terminal sessions, YouTube downloads, voiceover, thumbnails and publishing.\n\n` +
  "Allow only if you just clicked Connect in a Kino panel.";

/** Native yes/no dialog that defaults to Deny and gives up after 60 seconds. Resolves true on Allow. */
export const askToPair = username =>
  new Promise(resolve => {
    const name = String(username).replace(/["\\\r\n]/g, "");
    if (IS_MAC) {
      const text = PAIR_TEXT(name).replace(/["\\]/g, "").split("\n").map(line => `"${line}"`).join(" & return & ");
      const script = [
        "activate",
        `display dialog ${text} with title "Kino bridge" buttons {"Deny", "Allow"} default button "Deny" cancel button "Deny" with icon caution giving up after 60`,
      ];
      execFile("osascript", script.flatMap(line => ["-e", line]), (error, stdout) => {
        resolve(!error && /button returned:Allow/.test(stdout) && !/gave up:true/.test(stdout));
      });
      return;
    }
    if (IS_WIN) {
      // The text travels in an env var, so nothing user-controlled is parsed as PowerShell.
      // 'Button2' makes No the default; DefaultDesktopOnly brings the box to the front.
      const script =
        "Add-Type -AssemblyName System.Windows.Forms; " +
        "[System.Windows.Forms.MessageBox]::Show($env:KINO_PAIR_TEXT, 'Kino bridge', 'YesNo', 'Warning', 'Button2', 'DefaultDesktopOnly')";
      execFile(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script],
        { env: childEnv({ KINO_PAIR_TEXT: `${PAIR_TEXT(name)}\n\nYes allows it, No denies it.` }), timeout: 60_000, windowsHide: false },
        (error, stdout) => resolve(!error && String(stdout).trim() === "Yes"),
      );
      return;
    }
    execFile(
      "zenity",
      ["--question", "--title=Kino bridge", `--text=${PAIR_TEXT(name)}`, "--ok-label=Allow", "--cancel-label=Deny", "--default-cancel", "--timeout=60"],
      error => resolve(!error),
    );
  });

// ---------- shells ----------
const onPath = exe => {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (dir && fs.existsSync(path.join(dir, exe))) return path.join(dir, exe);
  }
  return null;
};

const windowsShells = () => {
  const programFiles = env("ProgramFiles") || "C:\\Program Files";
  const systemRoot = env("SystemRoot") || "C:\\Windows";
  const candidates = [
    onPath("pwsh.exe"),
    path.join(programFiles, "PowerShell", "7", "pwsh.exe"),
    path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    path.join(systemRoot, "System32", "cmd.exe"),
    path.join(programFiles, "Git", "bin", "bash.exe"),
  ];
  return [...new Set(candidates.filter(file => file && fs.existsSync(file)))];
};

/** Shells the panel may ask for. Anything else falls back to the default shell. */
export const allowedShells = () => {
  if (IS_WIN) return new Set(windowsShells().map(file => file.toLowerCase()));
  try {
    return new Set(fs.readFileSync("/etc/shells", "utf8").split("\n").map(line => line.trim()).filter(line => line.startsWith("/")));
  } catch {
    return new Set();
  }
};

export const defaultShell = user => {
  if (env("KINO_TERMINAL_SHELL")) return env("KINO_TERMINAL_SHELL");
  if (IS_WIN) return windowsShells()[0] ?? env("ComSpec") ?? "cmd.exe";
  return user.shell || process.env.SHELL || "/bin/zsh";
};

export const pickShell = (requested, user) => {
  const shells = allowedShells();
  if (typeof requested === "string" && shells.has(IS_WIN ? requested.toLowerCase() : requested)) return requested;
  return defaultShell(user);
};

/** Arguments that start a login/interactive shell. */
export const shellArgs = shell => {
  const base = path.basename(shell).toLowerCase();
  if (IS_WIN) {
    if (base === "pwsh.exe" || base === "powershell.exe") return ["-NoLogo"];
    if (base === "bash.exe") return ["--login", "-i"];
    return [];
  }
  return ["-l"];
};

/** Signals that should stop the bridge cleanly on this OS. */
// node-pty 1.1.0's macOS and Linux prebuilds ship spawn-helper without its exec bit, so every shell
// fails with "posix_spawnp failed". Restore it (npm ci runs this as postinstall, the bridge again at start).
export const ensurePtyHelper = () => {
  if (IS_WIN) return [];
  const fixed = [];
  let root;
  try {
    root = path.dirname(fileURLToPath(import.meta.resolve("node-pty/package.json")));
  } catch {
    try {
      root = path.join(path.dirname(fileURLToPath(import.meta.resolve("node-pty"))), "..");
    } catch {
      return fixed;
    }
  }
  for (const dir of ["prebuilds", "build/Release"]) {
    const base = path.join(root, dir);
    if (!fs.existsSync(base)) continue;
    const candidates = dir === "prebuilds" ? fs.readdirSync(base).map(arch => path.join(base, arch, "spawn-helper")) : [path.join(base, "spawn-helper")];
    for (const helper of candidates) {
      try {
        const mode = fs.statSync(helper).mode;
        if ((mode & 0o111) !== 0o111) {
          fs.chmodSync(helper, mode | 0o755);
          fixed.push(helper);
        }
      } catch {}
    }
  }
  return fixed;
};

export const STOP_SIGNALS = IS_WIN ? ["SIGINT", "SIGTERM", "SIGBREAK"] : ["SIGINT", "SIGTERM", "SIGHUP"];
