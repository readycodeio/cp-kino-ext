// Copy panel edits made inside a Kino project back into this repo:
//   npm run pull-panels -- <projectId | project folder> [--dry-run]
// Pulls panels/ (except the generated project.ts) and the project files this repo tracks, never the
// user's own files (designs, plan, copy, knowledge). Nothing is deleted on either side.
import fs from "node:fs";
import path from "node:path";
import { GENERATED, PANELS_SRC, PROJECT_SRC, copyFile, flag, isDataFile, positional, report, resolveMount, walk } from "./lib.mjs";

const dryRun = flag("dry-run");
let target;
try {
  target = resolveMount(positional()[0]);
} catch (error) {
  console.error(error.message);
  console.error("Usage: npm run pull-panels -- <projectId | project folder> [--dry-run]");
  process.exit(1);
}
const { id, mount } = target;

const panelResults = [];
for (const rel of walk(path.join(mount, "panels"))) {
  if (rel === GENERATED) continue;
  panelResults.push([rel, copyFile(path.join(mount, "panels", rel), path.join(PANELS_SRC, rel), { overwrite: true, dryRun })]);
}
const projectResults = [];
for (const rel of walk(PROJECT_SRC)) {
  if (isDataFile(rel)) continue;
  const from = path.join(mount, rel);
  if (fs.existsSync(from)) projectResults.push([rel, copyFile(from, path.join(PROJECT_SRC, rel), { overwrite: true, dryRun })]);
}

console.log(`${dryRun ? "Dry run: would pull" : "Pulled"} from project ${id} (${mount})`);
report("panels/", panelResults);
report("project files", projectResults);
console.log("\nCheck the diff for personal paths or ids before committing: git diff");
