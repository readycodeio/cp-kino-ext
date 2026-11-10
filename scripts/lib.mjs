// Helpers shared by the repo scripts: paths, the Kino project mount, file copying and a small HTTP client.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECTS_DIR } from "../bridge/platform.mjs";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PANELS_SRC = path.join(REPO, "panels");
export const PROJECT_SRC = path.join(REPO, "project");
export const GENERATED = "project.ts"; // panels/project.ts, written per Kino project
const SKIP = name => name === ".DS_Store" || name === "Thumbs.db" || /\.bak/.test(name);

// Project files that hold the user's own work. Never overwritten by install or pulled back into the repo.
export const isDataFile = rel => {
  const p = rel.split(path.sep).join("/");
  return p === "thumbs/designs.json" || p.startsWith("publish/knowledge/") || p === "publish/plan.json" || p === "publish/copy.json";
};

export const flag = name => process.argv.includes(`--${name}`);
export const positional = () => process.argv.slice(2).filter(arg => !arg.startsWith("--"));

/** Resolve a Kino project id or a mount folder to { id, mount }. */
export const resolveMount = arg => {
  if (!arg) throw new Error("Give a Kino project id (e.g. aBcD1234ef) or the project's folder path.");
  const looksLikePath = /[\\/]/.test(arg) || arg.startsWith(".") || arg.startsWith("~");
  const expanded = arg.startsWith("~") ? path.join(process.env.HOME ?? process.env.USERPROFILE ?? "", arg.slice(1)) : arg;
  const mount = looksLikePath ? path.resolve(expanded) : path.join(PROJECTS_DIR, arg);
  if (!looksLikePath && !/^[A-Za-z0-9_-]{1,64}$/.test(arg)) throw new Error(`Not a Kino project id: ${arg}`);
  if (!fs.existsSync(mount) || !fs.statSync(mount).isDirectory()) {
    throw new Error(
      `No project folder at ${mount}. Open the project in Kino desktop once so it mounts there, or pass the folder path.`,
    );
  }
  return { id: path.basename(mount), mount, mounted: fs.existsSync(path.join(mount, ".kino-mount")) };
};

/** Every file under dir, as paths relative to dir. */
export const walk = (dir, base = dir) => {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.isFile()) out.push(path.relative(base, full));
  }
  return out;
};

const same = (a, b) => fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b));

/**
 * Copy one file. Returns "same", "added", "updated" or "kept" (exists, differs, overwrite not allowed).
 * Never deletes anything.
 */
export const copyFile = (from, to, { overwrite, dryRun }) => {
  if (same(from, to)) return "same";
  const exists = fs.existsSync(to);
  if (exists && !overwrite) return "kept";
  if (!dryRun) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  return exists ? "updated" : "added";
};

export const writeIfChanged = (to, text, { dryRun }) => {
  const exists = fs.existsSync(to);
  if (exists && fs.readFileSync(to, "utf8") === text) return "same";
  if (!dryRun) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, text);
  }
  return exists ? "updated" : "added";
};

export const report = (title, results) => {
  const groups = {};
  for (const [rel, state] of results) (groups[state] ??= []).push(rel);
  console.log(`\n${title}`);
  for (const state of ["added", "updated", "kept", "same"]) {
    const files = groups[state] ?? [];
    if (!files.length) continue;
    if (state === "same") console.log(`  ${files.length} unchanged`);
    else for (const rel of files) console.log(`  ${state.padEnd(8)}${rel.split(path.sep).join("/")}`);
  }
};

/** Minimal HTTP JSON client for the bridge (fetch cannot always set Origin or Host). */
export const request = (port, pathname, { method = "GET", token, origin = "https://kino.ai", host, body, timeout = 10_000 } = {}) =>
  new Promise((resolve, reject) => {
    const headers = { host: host ?? `127.0.0.1:${port}` };
    if (origin) headers.origin = origin;
    if (token) headers.authorization = `Bearer ${token}`;
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    if (payload) Object.assign(headers, { "content-type": "application/json", "content-length": payload.length });
    const req = http.request({ host: "127.0.0.1", port, path: pathname, method, headers, timeout }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {}
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`timed out after ${timeout} ms`)));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
