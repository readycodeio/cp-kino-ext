// npm run check: syntax-check the bridge and scripts, parse every JSON file, and bundle each panel with
// esbuild (Kino and npm imports left external) so a broken import or typo fails before it reaches Kino.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REPO, walk } from "./lib.mjs";

let failed = 0;
const fail = (what, detail) => {
  failed++;
  console.error(`FAIL ${what}\n${detail}`);
};

for (const dir of ["bridge", "scripts"]) {
  for (const rel of walk(path.join(REPO, dir)).filter(f => f.endsWith(".mjs"))) {
    const file = path.join(REPO, dir, rel);
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (result.status !== 0) fail(`node --check ${dir}/${rel}`, result.stderr);
  }
}

for (const dir of ["panels", "project"]) {
  for (const rel of walk(path.join(REPO, dir)).filter(f => f.endsWith(".json"))) {
    try {
      JSON.parse(fs.readFileSync(path.join(REPO, dir, rel), "utf8"));
    } catch (error) {
      fail(`JSON ${dir}/${rel}`, error.message);
    }
  }
}

// esbuild does not flag a name that is used but never imported (it becomes a global), so check the
// shared platform and project constants by hand.
{
  const shared = [...fs.readFileSync(path.join(REPO, "panels", "platform.ts"), "utf8").matchAll(/export const (\w+)/g)].map(m => m[1]);
  shared.push("PROJECT_ID", "MOUNT_HINT");
  for (const rel of walk(path.join(REPO, "panels")).filter(f => /\.tsx?$/.test(f) && !/^(platform|project)\.ts$/.test(f))) {
    const source = fs.readFileSync(path.join(REPO, "panels", rel), "utf8");
    const imported = [...source.matchAll(/import\s*\{([^}]*)\}\s*from/g)].map(m => m[1]).join(",");
    const code = source
      .replace(/import\s*\{[^}]*\}\s*from[^\n]*/g, "")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
    for (const name of shared) {
      const used = new RegExp(`(?<![\\w.])${name}(?!\\w)`).test(code);
      const known = new RegExp(`\\b${name}\\b`).test(imported) || new RegExp(`(const|let|function)\\s+${name}\\b`).test(source);
      if (used && !known) fail(`panels/${rel.split(path.sep).join("/")}`, `uses ${name} without importing it`);
    }
  }
}

let esbuild;
try {
  esbuild = await import("esbuild");
} catch {
  console.warn("esbuild not installed (npm ci installs it), skipping the panel bundle check.");
}
if (esbuild) {
  const panels = fs.readdirSync(path.join(REPO, "panels"), { withFileTypes: true }).filter(d => d.isDirectory());
  for (const dir of panels) {
    const entry = path.join(REPO, "panels", dir.name, "Panel.tsx");
    if (!fs.existsSync(entry)) continue;
    try {
      await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: "esm",
        platform: "browser",
        target: "es2022",
        jsx: "automatic",
        packages: "external", // react, kino/panel, @remotion/*, @xterm/* and friends come from Kino at runtime
        logLevel: "silent",
        // Panels import project files (thumbs/model.ts, ThumbArt.tsx) from the project root, which is project/ here
        plugins: [
          {
            name: "project-root",
            setup(build) {
              build.onResolve({ filter: /^\.\.\/\.\.\// }, args => {
                if (!args.importer.startsWith(path.join(REPO, "panels"))) return;
                const candidate = path.resolve(args.resolveDir, args.path);
                const rel = path.relative(REPO, candidate);
                const inProject = path.join(REPO, "project", rel);
                for (const ext of ["", ".ts", ".tsx"]) if (fs.existsSync(inProject + ext)) return { path: inProject + ext };
              });
            },
          },
        ],
      });
      console.log(`ok   panels/${dir.name}`);
    } catch (error) {
      fail(`bundle panels/${dir.name}`, (error.errors ?? []).map(e => `${e.location?.file}:${e.location?.line}: ${e.text}`).join("\n") || error.message);
    }
  }
}

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
