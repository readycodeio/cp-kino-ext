// Install the panels into Kino projects:
//   npm run install-panels -- <projectId | project folder> [--update] [--dry-run]
//   npm run install-panels -- --all [--update] [--dry-run]     every project Kino desktop has mounted
//
// - panels/ is copied to <project>/panels/ and replaces older copies (Kino keeps project history).
// - panels/project.ts is written for that project (its id and folder), since panels cannot ask Kino for them.
// - Code under project/ that the panels import (the thumbnail model and art) is replaced with the panels.
// - Skill files (thumbs/skill, publish/skill) are added where missing. --update refreshes them.
// - Your own files are added where missing and never overwritten: thumbs/designs.json, thumbs/brand.json,
//   publish/plan.json, publish/copy.json and publish/knowledge/.
//
// The running bridge also installs into newly mounted projects on its own (bridge/autoinstall.mjs).
import { MOUNTS_DIR } from "../bridge/platform.mjs";
import { flag, installPanels, mountedProjects, positional, report, resolveMount } from "./lib.mjs";

const dryRun = flag("dry-run");
const update = flag("update");
const USAGE = "Usage: npm run install-panels -- <projectId | project folder> [--update] [--dry-run]\n       npm run install-panels -- --all [--update] [--dry-run]";

let targets;
if (flag("all")) {
  targets = mountedProjects();
  if (!targets.length) {
    console.error(`No mounted Kino projects under ${MOUNTS_DIR}. Open a project in Kino desktop first, or set KINO_MOUNTS_DIR.`);
    process.exit(1);
  }
} else {
  try {
    targets = [resolveMount(positional()[0])];
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    process.exit(1);
  }
}

let keptTotal = 0;
for (const target of targets) {
  const { id, mount, mounted } = target;
  if (!mounted) console.warn(`Note: ${mount} has no .kino-mount folder. Make sure it is the folder Kino desktop mounts for the project.`);
  const { panelResults, projectResults } = installPanels(target, { update, dryRun });
  console.log(`${dryRun ? "Dry run: would install" : "Installed"} into project ${id} (${mount})`);
  report("panels/", panelResults);
  report("project files", projectResults);
  keptTotal += projectResults.filter(([, state]) => state === "kept").length;
  if (targets.length > 1) console.log("");
}
if (keptTotal) {
  console.log(
    `\n${keptTotal} project file(s) differ from the repo and were left alone.` +
      (update ? " They hold your own work." : " Your own files always stay. To refresh the agent skills too, run again with --update."),
  );
}
console.log("\nIn Kino: turn on Settings > Experimental > Dynamic panels, then open a panel from the view's layout button > Panels.");
