# cp-kino-ext

Our Kino panels plus the small local bridge they need. Works on macOS and Windows 11.

| Panel | What it does | Needs |
|---|---|---|
| Terminal | A real shell (zsh, PowerShell, cmd, Git Bash) inside Kino | bridge |
| YT Downloader | Downloads YouTube videos with yt-dlp, then opens Kino's import picker with the file path copied | bridge, yt-dlp, deno, ffmpeg |
| Voiceover | Text to speech in your own ElevenLabs voice, placed on the timeline | bridge, ElevenLabs key, ffprobe |
| Thumbnails | Designs YouTube thumbnails from the project's art and saves them into Kino | bridge for saving (download works without it) |
| Publish | Writes post copy, renders platform cuts, schedules posts through Zernio | bridge, Zernio key, ffmpeg |

All panels follow Kino's light and dark theme.

## How it works

Panels run inside Kino at `https://kino.ai`. They can't reach your machine on their own, so they talk to a bridge on `127.0.0.1:47680`.

- The bridge only listens on localhost, and only answers requests from `https://kino.ai` sent to `127.0.0.1` or `localhost`.
- A panel has to pair first. Press **Connect** and the bridge shows a dialog on your machine: **Allow** on macOS, **Yes** on Windows. It stores a hash of the token, never the token itself.
- Keys stay with the bridge. The ElevenLabs key lives in its own folder and only the voice worker reads it. The Zernio key goes to the bridge's `secrets/` folder. Panels never receive either key.
- Saving into Kino (thumbnails, voiceovers) goes through Kino desktop's local MCP server on `127.0.0.1:45680`.

## Requirements

- Node.js 20.6 or newer
- ffmpeg (includes ffprobe), yt-dlp, and deno. yt-dlp needs a JavaScript runtime for YouTube.
- Kino desktop, for installing panels into a project folder and for saving into Kino

macOS (Homebrew):

```sh
brew install node ffmpeg yt-dlp deno
```

Windows 11 (PowerShell):

```powershell
winget install OpenJS.NodeJS.LTS Gyan.FFmpeg yt-dlp.yt-dlp DenoLand.Deno
```

Open a new terminal afterwards so the new PATH applies. You don't need a compiler: node-pty ships prebuilt binaries for macOS (Apple silicon and Intel) and Windows (x64 and Arm).

## Setup

1. Clone and install:

   ```sh
   git clone https://github.com/readycodeio/cp-kino-ext.git
   cd cp-kino-ext
   npm ci
   ```

2. Check the machine. This reads no secrets; for keys it only checks that the files exist.

   ```sh
   npm run doctor
   ```

3. Start the bridge and leave the window open. Ctrl+C stops it.

   ```sh
   npm start
   ```

   You can also double-click `start.command` (macOS) or `start.cmd` (Windows). Both run `npm ci` the first time.

4. Install the panels into a Kino project. Open the project in Kino desktop once, so its folder exists under `Documents/KinoProjects/<projectId>`, then run:

   ```sh
   npm run install-panels -- <projectId>
   ```

   - Instead of an id you can pass the project folder.
   - `--dry-run` shows the changes without making them.
   - `--update` also refreshes the shared project files (skills, thumbnail model and art).
   - Your own data is never overwritten: `thumbs/designs.json`, `publish/plan.json`, `publish/copy.json` and `publish/knowledge/`.

   The installer writes `panels/project.ts` with the project id. Kino syncs the folder, and the panels show up in that project.

5. In Kino, open a panel, press **Connect**, then confirm the dialog on your machine.

## Voiceover (ElevenLabs)

The key comes from ElevenLabs' own onboarding, which opens a browser page to approve. It writes `.env.local` into the voice folder. Don't paste the key anywhere else.

macOS:

```sh
mkdir -p ~/.local/share/elevenlabs-voice && cd ~/.local/share/elevenlabs-voice
npx -y @elevenlabs/cli@latest onboard connect --env-path .env.local
```

Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\elevenlabs-voice" | Out-Null
cd "$env:LOCALAPPDATA\elevenlabs-voice"
npx -y @elevenlabs/cli@latest onboard connect --env-path .env.local
```

Restart the bridge afterwards.

- **Default voice:** set `voice_id` in the voice config (see the folders table below), or add `ELEVENLABS_VOICE_ID=...` to `.env.local`. With neither, you pick a voice in the panel.
- **Model and format:** `model_id` and `output_format` in the same config, or `ELEVENLABS_MODEL_ID` and `ELEVENLABS_OUTPUT_FORMAT`.
- **Cost:** every take uses characters from your ElevenLabs plan. The panel shows the count before you generate.

## Publish (Zernio)

Paste your Zernio API key in the Publish panel's **Settings** tab. The bridge saves it to `secrets/zernio.env` in its data folder. On macOS that file is readable only by your user; on Windows it relies on your user profile's permissions.

Nothing is posted, scheduled or uploaded until you confirm it in the panel.

The copy writer follows `project/publish/skill/` and the project's `publish/knowledge/README.md`. That README points to our content kit, the `obmp-readym-content-kit` agent skill. **The kit is not in this repo on purpose**, because it has internal-only notes and project files sync to Kino's cloud. Install it separately as a global skill on each machine.

## Thumbnails

Designs are saved in the project's `thumbs/designs.json`, and renders go to `KinoProjects/Thumbnails`.

The logo, key art and backgrounds are Kino media ids from the ReadyM workspace, set in `panels/thumbs/lib.ts` (`ASSET_IDS`). They only resolve in that workspace. In any other workspace, import your own art and swap the ids.

Everything the thumbnail art needs lives under the project's `thumbs/` folder (model, art, palette, ornaments), so it never touches a project's own `brand.ts` or `ui/` files.

## YT Downloader

Downloads go to `~/Downloads/Kino YouTube` (`%USERPROFILE%\Downloads\Kino YouTube` on Windows).

## Where things live

| What | macOS | Windows |
|---|---|---|
| Bridge data (pairings, `secrets/`) | `~/.local/share/kino-terminal` | `%LOCALAPPDATA%\kino-terminal` |
| ElevenLabs key folder (`.env.local`) | `~/.local/share/elevenlabs-voice` | `%LOCALAPPDATA%\elevenlabs-voice` |
| Voice config (`config.json`) | `~/.config/elevenlabs-voice` | `%APPDATA%\elevenlabs-voice` |
| Voiceover audio | `~/Documents/ElevenLabs Voiceover` | `Documents\ElevenLabs Voiceover` |
| Kino projects | `~/Documents/KinoProjects` | `Documents\KinoProjects` |
| Thumbnail and Publish renders | `KinoProjects/Thumbnails`, `KinoProjects/Publish` | same, under `Documents\KinoProjects` |

On Windows, "Documents" is wherever Windows has it, including a OneDrive folder. The bridge looks it up in the registry.

## Environment overrides

All optional. Set them before `npm start`.

| Variable | Default |
|---|---|
| `KINO_TERMINAL_PORT` | `47680` |
| `KINO_TERMINAL_ORIGINS` | `https://kino.ai` (comma separated) |
| `KINO_TERMINAL_SHELL` | macOS: your login shell. Windows: pwsh, then Windows PowerShell, then cmd |
| `KINO_BRIDGE_HOME` | bridge data folder above |
| `KINO_TTS_DIR`, `KINO_TTS_CONFIG` | ElevenLabs key folder and voice config above |
| `KINO_DOCUMENTS_DIR`, `KINO_PROJECTS_DIR` | Documents, `Documents/KinoProjects` |
| `KINO_YTDL_DIR`, `KINO_THUMBS_DIR`, `KINO_PUBLISH_DIR` | download and render folders above |
| `KINO_FFMPEG`, `KINO_FFPROBE` | found on PATH |
| `KINO_EXTRA_PATH` | extra folders to search for ffmpeg, yt-dlp and deno |
| `KINO_MCP_URL` | `http://127.0.0.1:45680/mcp` (Kino desktop) |

## Moving from the old bridge (macOS)

This bridge uses the same data folder as the one in `~/.local/share/kino-terminal`, so your pairings and Zernio key carry over.

1. Stop the old bridge. Only one bridge can hold port 47680.
2. Run `npm start` here.

Panels from the old setup keep working. To get the latest versions, run `npm run install-panels -- <projectId>`.

## Developing

- `npm run pull-panels -- <projectId>` copies panel edits made inside Kino back into this repo. It never deletes anything, and it never pulls `project.ts` or your data files. Check `git diff` for personal paths or ids before you commit.
- `npm run check` syntax-checks the bridge, parses every JSON file, and bundles each panel with esbuild.
- `npm run smoke` starts a throwaway bridge on port 47681 with its own temp folders. It then checks the security guards, every feature's status, and a real shell session. It never touches your running bridge, tokens or keys.
- CI runs check, smoke, doctor and a test install on macOS and Windows, with Node 22 and 24.

## Known limits

- **Windows** is covered by CI on `windows-latest` (check, smoke with a real PowerShell session, test install). It hasn't yet been run on a Windows 11 desktop alongside Kino. Saving into Kino from Windows (thumbnails, voiceover import) sends Windows paths to Kino's local MCP server, and that is untested.
- **No autostart.** Start the bridge yourself, or set up a login item or scheduled task if you want one.
- **Thumbnail art ids** are tied to the ReadyM workspace (see Thumbnails).
