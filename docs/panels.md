# The panels

Open any of them from a view's layout button → **Panels**. Each one shows a setup card on the part that needs the bridge and keeps the rest usable.

## Terminal

Your login shell (zsh, bash, PowerShell) in a panel, starting in the project's folder.

- Click the folder path in the header to set another start folder. Enter starts a new shell there.
- **A−** / **A+** change the text size. **New** closes the shell and starts a fresh one.
- Close or re-dock the panel and the shell keeps running for 15 minutes, so you get it back with its scrollback.
- Copy and paste follow the platform: Cmd+C / Cmd+V on macOS, Ctrl+Shift+C or Ctrl+C with a selection on Windows and Linux.
- The shell is chosen by the bridge: your login shell, or `KINO_TERMINAL_SHELL`.

## YT Downloader

Paste a link or type keywords to search YouTube. Most video sites yt-dlp knows work with a pasted link.

- **Video / Audio / Transcript** and resolution (480p to Best) sit under the search field, with the file format next to them: MP4, MKV or MOV for video, MP3, M4A or WAV for audio. The bridge converts with ffmpeg when the download is not in that format yet. MOV above 1080p usually means re-encoding the picture, which takes a while.
- Click a result for details and **Trim** to download only part of a video.
- **Downloads** lists running and finished jobs with **Stop**, **Retry**, **Preview**, **Import…** (opens Kino's file picker with the path copied) and the folder in Finder or Explorer. **Change** picks another downloads folder.
- A watch link that carries a playlist downloads that one video. Whole playlists and channels are refused.
- Missing yt-dlp, deno or ffmpeg is named with the install command for your system.
- **Without the bridge:** *Import with Kino* opens Kino desktop's own YouTube import with your link copied.

## Voiceover

Text to speech with your ElevenLabs account. Needs the bridge and a key (see the README).

- Pick a voice and model, write or paste the script, choose how many takes, and generate. The character cost is shown first.
- Takes are saved as files in the takes folder (**Versions → Change**), listed with waveforms, and can be placed on the timeline at the playhead or imported into the library.
- Voice settings and the output format are under Advanced and remembered on this device. The draft is kept per project.
- The key is read only by a worker process inside the bridge. Add or replace it and press **Check again**.

## Thumbnails

Design thumbnails as layered elements, or let the agent design them and adjust by hand.

- **Sizes:** YouTube 16:9, vertical cover 9:16 and square.
- **Elements:** headline, text, badge, logo, image, shape, arrow, card, icon, divider, and stacks that group elements. Drag, resize and rotate on the canvas. Arrow keys nudge, Alt for fine steps, Cmd/Ctrl+D duplicates.
- **Edit tab:** the common controls first. **More settings** opens typography (font, weight, tracking, line height, case, alignment), stroke and shadow, layer order, lock, and copy style between elements.
- **Background:** any image from your Kino library or a color, with focus, zoom, blur, dim, shade, tint, saturation, contrast and flip.
- **Brand tab:** your kit, saved in `thumbs/brand.json`: colors, fonts (12 built in, or your own by URL), logo and named images from the library. Designs refer to brand colors by name, so changing the kit restyles every design.
- **Prompt bar:** always at hand. Choose the scope (this design, the selected designs, a whole set, or all), type what you want, or tap a quick prompt. The agent edits `thumbs/designs.json` in place and the panel shows what changed. **New set** asks for several variations at once.
- **Checks and Guide:** each design is scored against the rules in `thumbs/skill/rules.json` (safe zones, text size, contrast, word count), with a feed preview at real sizes.
- **Export:** download PNG or JPEG. With the bridge, save to disk and import into the Kino library in one step.
- **Without the bridge:** everything except one-click prompts (the prompt is copied and a chat tab opens) and saving into Kino (download instead).

The agent's instructions for thumbnails are in the project: `thumbs/skill/SKILL.md` and `format.md`.

## Publish

One path from a finished video to posts on each platform.

1. **Platforms.** Turn on the ones you post to. Each shows one status line with the first thing still missing. Click it to jump there.
2. **Video.** Pick the main video and an optional vertical one from the library or by file path, and covers. **Render cuts** makes the files each platform accepts. Needs the bridge and ffmpeg, no posting key.
3. **Copy.** Write a short brief, pick tone, length and call to action (more under Advanced), and press **Write copy**. The agent writes three options per platform into `publish/copy.json`. Pick one and it opens as an editor with live character counts. Your edits survive new copy arriving, and **Reset** and **Bring back previous text** undo.
4. **Go.** Now, Schedule or Draft for all platforms, or a time of its own for one. **Review** shows exactly what will be posted per platform: text with hashtags, first comment, files, account and time. Nothing is sent until you confirm there.
5. **After sending.** Each platform shows Published, Scheduled, Failed (with Retry) or Outcome unknown (Check again). A retry never posts twice.

- **Posting setup** is behind the status pill at the top right: Zernio key, profile and accounts. Writing copy and rendering cuts work without it.
- **Your voice** comes from `publish/knowledge/README.md` in the project. Fill it in once: who you are, tone, words to avoid, facts, links. The agent reads it before every request.
- File paths you pick are remembered on this device only, since `publish/plan.json` syncs to your team.
- **Without the bridge:** edit and copy the text, and copy the request for the agent.

The agent's instructions for copy are in the project: `publish/skill/SKILL.md`, `rules.json` and `format.md`.
