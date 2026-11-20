// npm run setup: everything a new machine needs, in one go. Safe to run again after `git pull`.
//   1. installs npm packages when they are missing or older than package-lock.json
//   2. checks the machine (npm run doctor)
//   3. installs the bridge as a background service and starts it (skip with --no-service)
//   4. installs the panels into every project Kino desktop has open on this machine (skip with --no-panels)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REPO, flag } from "./lib.mjs";

const step = title => console.log(`\n== ${title}`);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const node = (script, ...args) => spawnSync(process.execPath, [path.join(REPO, "scripts", script), ...args], { cwd: REPO, stdio: "inherit" }).status === 0;

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 6)) {
  console.error(`Node.js ${process.versions.node} is too old. Install 20.6 or newer, then run setup again.`);
  process.exit(1);
}

step("Packages");
const lock = path.join(REPO, "package-lock.json");
const installed = path.join(REPO, "node_modules", ".package-lock.json");
const stale = !fs.existsSync(installed) || fs.statSync(installed).mtimeMs < fs.statSync(lock).mtimeMs;
if (stale) {
  // shell: true lets Windows run npm.cmd
  if (spawnSync(npm, ["ci"], { cwd: REPO, stdio: "inherit", shell: process.platform === "win32" }).status !== 0) {
    console.error("npm ci failed. Fix the error above and run setup again.");
    process.exit(1);
  }
} else console.log("up to date");

step("This machine");
node("doctor.mjs");

let serviceOk = true;
if (!flag("no-service")) {
  step("Background service");
  serviceOk = node("service.mjs", "install");
}

if (!flag("no-panels")) {
  step("Panels");
  const { mountedProjects } = await import("./lib.mjs");
  if (mountedProjects().length) node("install-panels.mjs", "--all");
  else console.log("No Kino projects on this machine yet. Open one in Kino desktop: the bridge installs the panels into it by itself.");
}

step("Next");
console.log("1. In Kino: Settings > Experimental > turn on Dynamic panels.");
console.log("2. Open a project, hover its view in the rail, click the layout button > Panels, and pick Terminal, YT Downloader, Voiceover, Thumbnails or Publish.");
console.log("3. Press Connect in the panel and choose Allow in the dialog. Once per computer.");
if (!serviceOk) console.log("\nThe background service did not install. You can still run the bridge in a window: npm start");
