# Kino panels

Five custom panels for [Kino](https://kino.ai), and the small local bridge that lets them reach your machine. Built and used on macOS. Windows 11 and Linux code paths are in place and covered by CI, not yet run on a desktop next to Kino.

| Panel | What it does | Needs |
|---|---|---|
| **Terminal** | A real shell inside Kino, starting in the project folder | bridge |
| **YT Downloader** | Downloads YouTube videos with yt-dlp and hands them to Kino's import | bridge, yt-dlp, deno, ffmpeg. Falls back to Kino's own importer without the bridge |
| **Voiceover** | Text to speech in your ElevenLabs voice, placed on the timeline | bridge, ElevenLabs key |
| **Thumbnails** | Design thumbnails by hand or by prompting the agent, check them against tested rules, export | bridge only for one-click prompts and saving into Kino |
| **Publish** | Post copy for each platform written by the agent, platform cuts, posting and scheduling | bridge for cuts and posting, Zernio key for posting |

All panels follow Kino's light and dark theme.

## Quick start

**1. Install the tools.** Node.js 20.6 or newer, plus the programs the panels run.

```sh
# macOS
brew install node ffmpeg yt-dlp deno
```

```powershell
# Windows 11 (PowerShell). Open a new window afterwards so PATH applies.
winget install OpenJS.NodeJS.LTS Gyan.FFmpeg yt-dlp.yt-dlp DenoLand.Deno
```

**2. Clone and set up.**

```sh
git clone https://github.com/readycodeio/cp-kino-ext.git
cd cp-kino-ext
npm run setup
```

Or double-click `setup.command` (macOS) or `setup.cmd` (Windows) in the folder. Setup installs the packages, checks your machine, installs the bridge as a background service that starts when you log in, and adds the panels to every project you have open in Kino desktop. You can close the window when it finishes.

**3. Open a panel in Kino.**

1. Settings → Experimental → turn on **Dynamic panels**.
2. Open a project, hover its view in the rail, click the layout button → **Panels**, and pick one.
3. Press **Connect** in the panel and choose **Allow** in the dialog on your computer. You do this once per computer, for all panels.

New projects get the panels on their own about 10 seconds after you open them, as long as the bridge is running.

Already use an agent in Kino chat? Ask it: *"Clone https://github.com/readycodeio/cp-kino-ext and run npm run setup."* It can do steps 1 and 2 for you.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run setup` | First install, and again after every `git pull` |
| `npm run service -- status` | Is the bridge installed and running |
| `npm run service -- restart` | Restart the bridge |
| `npm run service -- stop` / `start` | Stop it until the next login, or start it again |
| `npm run service -- logs` | Last 40 lines of the bridge log |
| `npm run service -- uninstall` | Remove the background service. Your pairings and keys stay |
| `npm run service -- unpair` | Revoke every paired panel |
| `npm run service -- print` | Show what install would write, without installing |
| `npm run doctor` | Check tools, folders and keys. Reads no secrets |
| `npm run install-panels -- <projectId>` | Put the panels into one project. `--all` for every open project, `--update` to refresh the agent skills too |
| `npm start` | Run the bridge in this window instead of the service, with the log on screen |

## Make it yours

Nothing in the repo is tied to a brand. Your own material lives in your Kino project, where the panels and the agent both read it, and an update never overwrites it:

- **Thumbnails:** `thumbs/brand.json` is your brand kit: logo, colors, fonts and art from your Kino library. Edit it in the panel's Brand tab. Designs are in `thumbs/designs.json`.
- **Publish:** `publish/knowledge/README.md` is where you describe your voice, facts, links and words to avoid. The agent reads it before writing copy. Your picks and schedule are in `publish/plan.json`.
- **Voiceover:** pick the voice, model and format in the panel, and change the takes folder there too.
- **YT Downloader:** pick the downloads folder and the file format (MP4, MKV, MOV; MP3, M4A, WAV) in the panel. Your own yt-dlp config (cookies, proxy) is honored.
- **Rules the agent follows:** `thumbs/skill/` and `publish/skill/` in the project. They are plain files, tune them per project.

See [docs/panels.md](docs/panels.md) for a walk through each panel.

## How it works

Panels run inside Kino's page. They can edit the project but cannot start a program, write files elsewhere, hold a secret or call Kino's agent tools, so those go through the bridge on `127.0.0.1:47680`. The bridge only answers Kino, only after you approve the pairing dialog, and keeps API keys to itself.

[docs/architecture.md](docs/architecture.md) has the details: what works without the bridge, the security model, every folder and setting.

## Voiceover key

The ElevenLabs key comes from ElevenLabs' own onboarding, which opens a browser page to approve and writes `.env.local` into the voice folder. Don't paste the key anywhere else.

```sh
# macOS and Linux
mkdir -p ~/.local/share/elevenlabs-voice && cd ~/.local/share/elevenlabs-voice
npx -y @elevenlabs/cli@latest onboard connect --env-path .env.local
```

```powershell
# Windows
New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\elevenlabs-voice" | Out-Null
cd "$env:LOCALAPPDATA\elevenlabs-voice"
npx -y @elevenlabs/cli@latest onboard connect --env-path .env.local
```

Then press **Check again** in the Voiceover panel. Every take uses characters from your ElevenLabs plan; the panel shows the count before you generate.

## Publishing key

Posting goes through Zernio, a social posting API. Paste your Zernio API key in the Publish panel's Posting setup (the status pill at the top right). The bridge saves it in its own `secrets/` folder and never sends it back to the panel. Nothing is posted, scheduled or uploaded until you confirm it in the panel. Writing copy and rendering cuts work without a key.

## Troubleshooting

| You see | Do this |
|---|---|
| "The Kino bridge is not running" | `npm run service -- status`. If it is not installed, `npm run setup`. If it is installed but down, `npm run service -- logs` |
| The pairing dialog never shows | It can open behind the Kino window. On Linux it needs `zenity` or `kdialog` |
| "Update the Kino bridge" | `git pull && npm run setup` |
| `port-in-use` in the log | Another bridge holds the port, usually `npm start` in a terminal. Stop it with Ctrl+C |
| macOS says a background item was added, or asks to let "node" access Documents or Downloads | Expected the first time. The bridge saves renders, voiceovers and downloads there |
| A tool is "missing" in a panel | `npm run doctor` names it and the install command. After installing, `npm run service -- restart` |
| Panels are not in a project's panel list | Open the project in Kino desktop once, then `npm run install-panels -- --all` |
| Panels broke after you changed Node versions | `npm run setup` again. The service remembers the path to `node` |

## Known limits

- **Early release.** The bridge and panels are tested offline and on macOS next to Kino. Posting through Zernio and generating with ElevenLabs are tested against stand-ins in this version, not the live services. Open an issue when something breaks.
- **Windows** is covered by CI (checks, bridge tests with a real PowerShell session, test install). The background start at sign-in and saving into Kino from Windows paths have not been run on a Windows desktop next to Kino.
- **Linux** has the same status. The bridge needs a compiler for node-pty there, and `zenity` or `kdialog` for the pairing dialog.
- **Custom panels are an experimental Kino feature.** What a panel can read and control can change between Kino releases.
- **Pairing trusts every panel you run in Kino**, because all panels share one web origin. Add only team panels you trust. See the security section in [docs/architecture.md](docs/architecture.md).

## Develop

[docs/build-a-panel.md](docs/build-a-panel.md) covers the conventions, the shared bridge client, adding a bridge route and the test loop. `AGENTS.md` is the short version for coding agents.

```sh
npm run check     # syntax, JSON and an esbuild bundle of every panel
npm run smoke     # bridge tests on a throwaway port, never touches your bridge or keys
npm run pull-panels -- <projectId>   # bring edits made inside Kino back into the repo
```

## License

MIT. See [LICENSE](LICENSE). Icons in the Thumbnails panel are from Material Design Icons (Apache 2.0).
