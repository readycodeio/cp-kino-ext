# Build or change a panel

Each panel is a folder under `panels/` with a `panel.json` (its title) and a `Panel.tsx` that default-exports a React component. Kino bundles it and docks it next to the canvas and timeline. Kino's own guide to the panel API is the `generated-panels` skill in Kino desktop; this page covers what is specific to this repo.

## The loop

1. Edit files under `panels/` (and `bridge/` if the panel needs something from the machine).
2. `npm run check` syntax-checks the bridge and bundles every panel with esbuild.
3. `npm run install-panels -- <projectId>` copies the panels into a project that is open in Kino desktop. An open panel reloads when its files change.
4. `npm run smoke` runs the bridge tests on a throwaway port.

You can also ask the agent in Kino chat to change a panel in place. Bring those edits back with `npm run pull-panels -- <projectId>` and read `git diff` before you commit.

To find a project id: it is the folder name under `~/.kino/Projects.nosync`, and the last part of the project's URL.

## Rules the panels follow

- **`createElement`, not JSX.** Write `h('div', { style }, children)`. When these panels were built, JSX in panel source rendered as plain objects in Kino (React error #31). Keep one style per file either way.
- **Inline styles with theme variables.** `panels/theme.ts` defines `--kp-*` variables for Kino's dark and light themes. Use `var(--kp-text)`, `rgba(var(--kp-ink),0.07)` and so on, never literal colors. Canvas and xterm code reads the live theme with `useKinoTheme()`.
- **OS wording from one place.** `panels/platform.ts` has "this Mac / this PC", Finder or Explorer, the shortcut modifier and the font stacks.
- **One bridge client.** `panels/bridge.ts` has the address, the token, `api()`, `apiBlob()`, `useBridge()` and `BridgeCard`. Do not copy them into a panel.
- **Stay useful offline.** Gate only the part that needs the bridge. Say in one sentence what the bridge adds.
- **State in project files.** If the chat agent should read or write it, store it as JSON in the project with `useProjectSource` (undo and sync come for free). View preferences go in `usePanelSettings`. The pairing token and other device values go in `localStorage`. Never put a secret or a local path in project files or panel settings: both sync to the whole team.
- **Catch errors from handlers.** Kino shows render errors, but an error thrown in a click handler or a promise is yours to catch and show.
- **Pin npm imports.** `import { Terminal } from '@xterm/xterm@6.0.0'`.

## Use the bridge from a panel

```ts
import { createElement as h } from 'react'
import { BridgeCard, api, useBridge } from '../bridge'

export default function MyPanel() {
	const { bridge, ready, note, pair, check, fail } = useBridge({ needs: ['my-feature'] })
	const run = () => api('/my/run', { method: 'POST', body: { text: 'hello' } }).catch(error => console.warn(fail(error)))
	return h(
		'div',
		{ style: { padding: 12, color: 'var(--kp-text)' } },
		ready ? h('button', { onClick: run }, 'Run') : h(BridgeCard, { bridge, note, uses: 'Running this', onPair: pair, onRetry: check }),
	)
}
```

`useBridge` reports `checking`, `ok`, `offline`, `outdated` (the bridge lacks a feature in `needs`), `unpaired` or `pairing`, and keeps retrying while the bridge is away. `fail(error)` turns a failed request into text and moves the state when the cause is the connection.

## Add a bridge route

1. Create `bridge/my.mjs` that exports `handleMy(req, res, url, json, headers)`. Validate every input, keep file paths inside one folder (`isInside` in `bridge/platform.mjs`), run programs with `execFile` and `childEnv()`, and return errors as `json(status, { error })` with a message a user can act on.
2. Register it in the `ROUTES` table in `bridge/server.mjs` and add a feature name to `FEATURES`. Token checks happen before your handler runs.
3. Add a status check to `scripts/smoke.mjs`.

## Files that travel with a project

`project/` holds what the panels need inside a Kino project. The installer copies it next to the panels:

| Kind | Files | On install |
|---|---|---|
| Code the panels import | `thumbs/model.ts`, `thumbs/ThumbArt.tsx`, `thumbs/ui/**` | replaced with the panels |
| Agent skills | `thumbs/skill/**`, `publish/skill/**` | added if missing, refreshed with `--update` |
| Your data | `thumbs/designs.json`, `thumbs/brand.json`, `publish/plan.json`, `publish/copy.json`, `publish/knowledge/**` | added if missing, never overwritten |

## Before you publish a change

- `npm run check` and `npm run smoke` pass.
- `git diff` has no personal paths, project ids, media ids or keys.
- The panel works in light and dark theme, at a narrow width, and with the bridge stopped.
