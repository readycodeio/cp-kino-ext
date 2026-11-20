# Notes for coding agents

This repo holds custom panels for the Kino video editor (`panels/`), files they need inside a Kino project (`project/`), the local bridge they talk to (`bridge/`) and maintenance scripts (`scripts/`). Read `docs/architecture.md` first, then `docs/build-a-panel.md`.

## If the user asks you to set this up

```sh
npm run setup
```

That installs packages, checks the machine, installs the bridge as a background service and copies the panels into every project Kino desktop has open. It is safe to run again. Then tell the user to turn on Settings > Experimental > Dynamic panels in Kino, open a panel from the view's layout button > Panels, and press Connect. The pairing dialog needs a human: do not try to approve it.

Useful follow-ups: `npm run service -- status`, `npm run service -- logs`, `npm run doctor`.

## If the user asks you to change a panel

- Edit here, not in the Kino project folder, unless they asked for a one-off in that project. Install with `npm run install-panels -- <projectId>`.
- Panels use `createElement` (`h`), inline styles with `var(--kp-*)` theme variables, wording from `panels/platform.ts` and the bridge client in `panels/bridge.ts`. Do not add JSX, CSS files or a second copy of the bridge code.
- Run `npm run check` after every change and `npm run smoke` after touching `bridge/`.
- Never start a second bridge on port 47680, never print or move API keys, and never post, schedule or download on the user's behalf to test something.
- Project files sync to the user's whole team. Keep secrets, local paths and personal ids out of `panels/` and `project/`.

## If the user asks you to write post copy or thumbnails from a panel request

The request names the files to read. The rules are in the project, not here: `/publish/skill/` and `/publish/knowledge/` for copy, `/thumbs/skill/` and `/thumbs/brand.json` for thumbnails. Write only the files the request names.
