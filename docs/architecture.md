# How it works, and why there is a bridge

## The short version

Kino custom panels are React components that run inside Kino's own page. They can read and edit the project, but they cannot start a process, write a file outside the project, keep a secret or call Kino's agent tools. Four of the five panels here need at least one of those, so they talk to a small local server, the bridge.

The bridge is the only part that runs outside Kino. `npm run setup` installs it as a background service, so there is no terminal window to keep open.

```
 Kino (https://kino.ai page)                     Your computer
┌──────────────────────────────┐        ┌────────────────────────────────────┐
│ panel (React)                │  HTTP  │ bridge (Node, 127.0.0.1:47680)     │
│  - kino/panel API            │◄──────►│  - shell sessions (node-pty)       │
│  - project files, undo       │   WS   │  - yt-dlp, ffmpeg, ffprobe         │
│  - UI actions                │        │  - files in Documents / Downloads  │
└──────────────────────────────┘        │  - API keys (never sent to panels) │
                                        │  - Kino local MCP (import, prompts)│
                                        └────────────────────────────────────┘
```

## What a panel can do on its own

From Kino's panel API (`kino/panel`) and the browser:

- Read the timeline, selection, playhead, transcript and library.
- Edit project files with undo (`useProjectSource`). This is how the Thumbnails and Publish panels store their state, and how the chat agent and a panel exchange work: both read and write the same JSON files in the project.
- Run the actions in Kino's command menu (`runAction`), for example open a chat tab or start the built-in YouTube import.
- Call any HTTPS API that allows cross-origin requests.
- Keep per-view settings (`usePanelSettings`) and device-local values (`localStorage`).

## What a panel cannot do

Each of these was checked against Kino desktop 1.5.144:

| Need | Why a panel cannot | Used by |
|---|---|---|
| Run a shell or a program (zsh, yt-dlp, ffmpeg) | A web page has no process API. | Terminal, YT Downloader, Publish |
| Write files outside the project (renders, downloads, audio) | Project source is the only file store a panel has. | all but Terminal |
| Keep an API key away from page code | `localStorage` is readable by every script on the page. | Voiceover, Publish |
| Call Kino's agent tools (import a file, send a prompt to a chat) | Kino's local MCP server on `127.0.0.1:45680` does not answer browser preflight requests, so a page cannot call it. | Voiceover, Thumbnails, Publish |
| Send a message to the chat agent | No panel API or UI action takes message text. A panel can only open a chat tab. | Thumbnails, Publish |

## What works without the bridge

| Panel | Without the bridge | With the bridge |
|---|---|---|
| Terminal | Nothing. A shell needs a process. | Full shell in the project folder. |
| YT Downloader | Opens Kino's own YouTube import with the link copied. | Resolution and file format choice, audio only, transcripts, trimmed clips, search, other sites. |
| Voiceover | Nothing. The key and the audio files live on your machine. | Everything. |
| Thumbnails | Design, check against the rules, download PNG or JPEG, copy a prompt for the agent and open a chat. | One-click prompts, save to disk, import into the Kino library. |
| Publish | Edit and copy post copy, copy a request for the agent and open a chat. | One-click requests, platform cuts, posting and scheduling. |

Panels show a setup card only on the part that needs the bridge. The rest stays usable.

## Other designs we looked at

- **Call cloud APIs straight from the panel.** Works for APIs that allow cross-origin requests, but the key then sits in page storage where any panel code can read it, and it does nothing for shells, downloads or renders.
- **Use the chat agent as the relay.** The agent in Kino desktop has a shell and Kino's tools. A panel can leave a request in a project file, but it cannot wake the agent, so every action would need the user to paste and send a prompt, wait for a model turn and spend tool calls. The panels use this path only as the fallback for prompts.
- **Kino's Browser panel pointing at a local web app.** Still needs a local server, and loses the panel API.
- **Kino's built-in actions.** Used where they exist (YouTube import, chat tabs, file reveal).

So the bridge stays, and the work went into making it something you set up once and forget.

## Security model

The bridge gives a web page a shell on your machine, so it is strict about who may talk to it.

- It listens on `127.0.0.1` only and rejects any `Host` header other than `127.0.0.1:<port>` or `localhost:<port>`. That blocks DNS rebinding.
- It answers only requests whose `Origin` is in the allow list (`https://kino.ai` by default). Other websites get `403`.
- Every route except `/health` and `/pair` needs a token. A token is issued only after you choose **Allow** in a native dialog on your machine. The bridge stores SHA-256 hashes of tokens, never the tokens.
- API keys stay with the bridge. The ElevenLabs key is read only by a separate worker process. The Zernio key is saved in the bridge's `secrets/` folder. No route returns either key.
- File routes resolve every path and refuse anything outside the folder that feature owns.
- Helper programs get a minimal environment and argument arrays, never a shell string.

**What pairing means.** The token is stored for the `https://kino.ai` origin on your device. Every custom panel in your Kino runs on that origin, including panels a teammate built and you added from the team library. A paired device therefore trusts all panel code you run in Kino. Add only panels you trust, and remove every pairing with:

```sh
npm run service -- unpair
```

## Bridge routes

All routes are served on `http://127.0.0.1:47680`. `Authorization: Bearer <token>` is required unless noted.

| Route | Purpose |
|---|---|
| `GET /health` (no token) | Version, feature list, platform. Panels use it to tell "offline" from "outdated". |
| `POST /pair` (no token) | Shows the native dialog and returns a token on Allow. |
| `GET /auth` | Token check. |
| `WS /pty` | Terminal sessions. The first message is `{ t: "hello", token, ... }`. |
| `/ytdl/*` | yt-dlp jobs. |
| `/tts/*` | Voices, takes, audio files, placing on the timeline. |
| `/thumbs/*` | Save and import renders, send prompts to a chat. |
| `/zernio/*` | Key status, accounts, platform cuts, posting and scheduling. |

Each group lives in one module under `bridge/`. `scripts/smoke.mjs` exercises the guards and one status route per group against a throwaway bridge.

## Where things live

| What | macOS and Linux | Windows |
|---|---|---|
| Bridge data: pairings, `secrets/`, `logs/` | `~/.local/share/kino-terminal` | `%LOCALAPPDATA%\kino-terminal` |
| ElevenLabs key folder (`.env.local`) | `~/.local/share/elevenlabs-voice` | `%LOCALAPPDATA%\elevenlabs-voice` |
| Voice config (`config.json`) | `~/.config/elevenlabs-voice` | `%APPDATA%\elevenlabs-voice` |
| Voiceover audio | `~/Documents/ElevenLabs Voiceover` | `Documents\ElevenLabs Voiceover` |
| YouTube downloads | `~/Downloads/Kino YouTube` | `Downloads\Kino YouTube` |
| Thumbnail and Publish renders | `~/Documents/KinoProjects/Thumbnails`, `.../Publish` | same, under `Documents\KinoProjects` |
| Kino project folders | `~/.kino/Projects.nosync` | `%USERPROFILE%\.kino\Projects.nosync` |

On Windows, "Documents" is wherever Windows has it, including a OneDrive folder. The bridge asks the registry.

Settings you change in a panel that belong to the machine, not the project, are saved by the bridge:

| File | Holds | Changed from |
|---|---|---|
| `<bridge data>/ytdl.json` | downloads folder | YT Downloader panel |
| `<bridge data>/ytdl/yt-dlp.conf` | generated for each run, do not edit | |
| voice `config.json` | `output_dir`, first-run `voice_id`, `model_id`, `output_format` | Voiceover panel (takes folder), or by hand |
| your own yt-dlp config (`~/.config/yt-dlp/config`, `%APPDATA%\yt-dlp\config`) | cookies for signed-in videos, proxy | by hand |

## Settings

All optional. Set them in the shell before `npm run setup` (or `npm run service -- install`); the service keeps them. For a foreground run, set them before `npm start`.

| Variable | Default |
|---|---|
| `KINO_TERMINAL_PORT` | `47680`. If you change it, set the same port in a panel's bridge card. |
| `KINO_TERMINAL_ORIGINS` | `https://kino.ai` (comma separated) |
| `KINO_TERMINAL_SHELL` | macOS and Linux: your login shell. Windows: pwsh, then Windows PowerShell, then cmd |
| `KINO_BRIDGE_HOME` | bridge data folder above |
| `KINO_TTS_DIR`, `KINO_TTS_CONFIG` | ElevenLabs key folder and voice config above |
| `KINO_DOCUMENTS_DIR` | your Documents folder |
| `KINO_PROJECTS_DIR` | `Documents/KinoProjects`, where renders go |
| `KINO_MOUNTS_DIR` | where Kino desktop keeps project folders |
| `KINO_YTDL_DIR`, `KINO_THUMBS_DIR`, `KINO_PUBLISH_DIR` | download and render folders above |
| `KINO_FFMPEG`, `KINO_FFPROBE` | found on PATH |
| `KINO_EXTRA_PATH` | extra folders to search for ffmpeg, yt-dlp and deno |
| `KINO_MCP_URL` | `http://127.0.0.1:45680/mcp` (Kino desktop) |
| `KINO_AUTO_INSTALL` | on. `0` stops the bridge from adding panels to newly opened projects |
| `KINO_AUTO_INSTALL_SKIP` | empty. Comma-separated project ids to leave alone |
