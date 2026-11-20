// Auto-install: while the bridge runs, every Kino project that gets mounted on this machine receives
// the panels, so a new project (blank, fork or template) has them without running install-panels.
//
// - A project is installed once. Its id is then remembered in DATA_DIR/auto-install.json, so panels
//   you delete from a project are not put back.
// - A project that already has panels is left alone, except panels/project.ts: a fork carries its
//   parent's id there, so that one file is rewritten.
// - Nothing is ever overwritten or deleted beyond that. To refresh existing copies after the repo
//   changes, run: npm run install-panels -- --all
// - Turn it off with KINO_AUTO_INSTALL=0. Skip single projects with KINO_AUTO_INSTALL_SKIP=id1,id2.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, MOUNTS_DIR } from "./platform.mjs";
import { GENERATED, installPanels, mountedProjects, projectTs } from "../scripts/lib.mjs";

const STATE_FILE = path.join(DATA_DIR, "auto-install.json");
const SETTLE_MS = 8000; // let Kino finish writing a fresh mount before adding files to it
const POLL_MS = 60_000; // fallback for file systems where fs.watch misses new folders

const env = name => (process.env[name] ?? "").trim();
const loadState = () => {
  try {
    return new Set(JSON.parse(fs.readFileSync(STATE_FILE, "utf8")).installed ?? []);
  } catch {
    return new Set();
  }
};
const saveState = installed => fs.writeFileSync(STATE_FILE, JSON.stringify({ installed: [...installed].sort() }, null, 2));

/** True once Kino has stopped writing the mount's baseline for SETTLE_MS. */
const settled = mount => {
  try {
    return Date.now() - fs.statSync(path.join(mount, ".kino-mount", "baseline.json")).mtimeMs > SETTLE_MS;
  } catch {
    return false; // no baseline yet: the mount is still being set up
  }
};

/** One pass over the mounted projects. Returns true when some project was not settled yet. */
export const sweep = (log, installed = loadState(), skip = new Set()) => {
  let waiting = false;
  let changed = false;
  for (const project of mountedProjects()) {
    const { id, mount } = project;
    if (skip.has(id)) continue;
    const marker = path.join(mount, "panels", GENERATED);
    try {
      if (fs.existsSync(marker)) {
        // Has panels already. Only make sure project.ts names this project and this folder.
        if (fs.readFileSync(marker, "utf8") !== projectTs(id)) {
          if (!settled(mount)) {
            waiting = true;
            continue;
          }
          fs.writeFileSync(marker, projectTs(id));
          log("panels-relinked", { project: id });
        }
        if (!installed.has(id)) {
          installed.add(id);
          changed = true;
        }
      } else if (!installed.has(id)) {
        if (!settled(mount)) {
          waiting = true;
          continue;
        }
        const { panelResults, projectResults } = installPanels(project);
        const added = [...panelResults, ...projectResults].filter(([, state]) => state === "added").length;
        installed.add(id);
        changed = true;
        log("panels-installed", { project: id, files: added });
      }
    } catch (error) {
      log("panels-install-failed", { project: id, error: String(error?.message ?? error) });
    }
  }
  if (changed) saveState(installed);
  return waiting;
};

/** Start watching MOUNTS_DIR. Returns a function that stops it. */
export const startAutoInstall = log => {
  if (/^(0|false|off|no)$/i.test(env("KINO_AUTO_INSTALL"))) {
    log("auto-install", { enabled: false, reason: "KINO_AUTO_INSTALL" });
    return () => {};
  }
  if (!fs.existsSync(MOUNTS_DIR)) {
    log("auto-install", { enabled: false, reason: `${MOUNTS_DIR} not found` });
    return () => {};
  }
  const installed = loadState();
  const skip = new Set(env("KINO_AUTO_INSTALL_SKIP").split(",").map(s => s.trim()).filter(Boolean));
  let timer = null;
  const run = () => {
    timer = null;
    if (sweep(log, installed, skip)) schedule(SETTLE_MS / 2);
  };
  const schedule = (delay = 2000) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, delay);
    timer.unref?.();
  };
  let watcher = null;
  try {
    watcher = fs.watch(MOUNTS_DIR, () => schedule());
    watcher.on("error", () => {});
  } catch {}
  const poll = setInterval(() => schedule(0), POLL_MS);
  poll.unref?.();
  log("auto-install", { enabled: true, mountsDir: MOUNTS_DIR, skip: [...skip] });
  schedule(0);
  return () => {
    if (timer) clearTimeout(timer);
    clearInterval(poll);
    watcher?.close();
  };
};
