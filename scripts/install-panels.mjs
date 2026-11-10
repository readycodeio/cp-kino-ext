// Install the panels into a Kino project: npm run install-panels -- <projectId | project folder> [--update] [--dry-run]
//
// - panels/ is copied to <project>/panels/ and replaces older copies (Kino keeps project history).
// - panels/project.ts is written for that project (its id and folder), since panels cannot ask Kino for them.
// - project/ (house skills, thumbnail model and art, brand) is added where missing. With --update it is
//   refreshed too, except the user's own files: thumbs/designs.json, publish/plan.json, publish/copy.json
//   and publish/knowledge/.
import path from "node:path";
import { GENERATED, PANELS_SRC, PROJECT_SRC, copyFile, flag, isDataFile, positional, report, resolveMount, walk, writeIfChanged } from "./lib.mjs";

const dryRun = flag("dry-run");
const update = flag("update");

let target;
try {
  target = resolveMount(positional()[0]);
} catch (error) {
  console.error(error.message);
  console.error("Usage: npm run install-panels -- <projectId | project folder> [--update] [--dry-run]");
  process.exit(1);
}
const { id, mount, mounted } = target;
if (!mounted) console.warn(`Note: ${mount} has no .kino-mount folder. Make sure it is the folder Kino desktop mounts for the project.`);

const panelResults = [];
for (const rel of walk(PANELS_SRC)) {
  if (rel === GENERATED) continue;
  panelResults.push([rel, copyFile(path.join(PANELS_SRC, rel), path.join(mount, "panels", rel), { overwrite: true, dryRun })]);
}
const projectTs =
  "// Written by `npm run install-panels` for the Kino project the panels are installed into.\n" +
  "// Panels have no project-id hook, so they fall back to these values.\n" +
  `export const PROJECT_ID = ${JSON.stringify(id)}\n` +
  `export const MOUNT_HINT = ${JSON.stringify(mount)}\n`;
panelResults.push([GENERATED, writeIfChanged(path.join(mount, "panels", GENERATED), projectTs, { dryRun })]);

const projectResults = [];
for (const rel of walk(PROJECT_SRC)) {
  const overwrite = update && !isDataFile(rel);
  projectResults.push([rel, copyFile(path.join(PROJECT_SRC, rel), path.join(mount, rel), { overwrite, dryRun })]);
}

console.log(`${dryRun ? "Dry run: would install" : "Installed"} into project ${id} (${mount})`);
report("panels/", panelResults);
report("project files", projectResults);
const kept = projectResults.filter(([, state]) => state === "kept").length;
if (kept) {
  console.log(
    `\n${kept} project file(s) differ from the repo and were left alone.` +
      (update ? " They hold your own work." : " Run again with --update to refresh skills and thumbnail code (your designs, plan, copy and knowledge stay)."),
  );
}
console.log("\nIn Kino, open the panels from the project's panel list. Start the bridge first: npm start");
