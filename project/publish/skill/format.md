# /publish/copy.json format (v1)

The Publish panel reads `/publish/copy.json` and shows each platform's options as cards. The agent writes it; the user picks one option per platform and edits it in the panel. The panel keeps its own choices, edits and schedule in `/publish/plan.json` (agent: do not touch that file).

```json
{
  "version": 1,
  "updated": "2026-11-08T20:00:00Z",
  "requestId": "pub-3k9x2a",
  "video": { "mediaId": "9f1c...", "title": "Working title", "summary": "One or two lines on what the video shows." },
  "platforms": {
    "youtube": {
      "options": [
        {
          "id": "youtube-1",
          "angle": "Outcome + time",
          "title": "Host Your Own Oblivion Remastered Server in 10 Minutes",
          "text": "Description or caption, WITHOUT the hashtag block.",
          "hashtags": ["#OblivionRemastered", "#OBMP"],
          "tags": ["oblivion remastered multiplayer", "oblivion server"],
          "firstComment": "Optional pinned or first comment.",
          "thread": ["Optional follow-up posts for X, Threads or Bluesky."],
          "why": "One line: the rule ids used and why this should convert.",
          "rules": ["yt-front-load", "honest-promise"]
        }
      ],
      "notes": "Optional platform-level advice for the user."
    }
  }
}
```

## Rules for the agent

- Platform keys: `youtube`, `tiktok`, `instagram`, `facebook`, `linkedin`, `twitter` (X), `threads`, `bluesky`. Write only the platforms the request names.
- Exactly 3 options per platform, each a different angle (for example outcome, curiosity, proof or community). Not three rewordings of one line.
- `requestId`: copy it from the request so the panel knows the answer arrived.
- Merge, do not replace: read the existing file first and keep the platforms the request did not name.
- Field use per platform:
  - `title`: YouTube (max 100 chars) and Facebook Reels. Leave it out elsewhere.
  - `text`: the description, caption or post body. Hashtags go in `hashtags`, never inline at the end of `text`. The panel appends them.
  - `tags`: YouTube only. Each tag max 100 chars, all tags together max 500 chars.
  - `firstComment`: YouTube, Instagram, Facebook, LinkedIn, Threads.
  - `thread`: X, Threads and Bluesky only, and only when the length rule needs a thread.
- Hard limits the panel checks (chars): YouTube title 100, YouTube description 5000, TikTok 2200, Instagram 2200, Facebook 63206 (keep it short anyway), LinkedIn 3000, X 280 (25000 on Premium), Threads 500, Bluesky 300. These count `text` plus the appended hashtags.
- Copy must match the video. Every number, time, price and feature named must be true and on screen. Use the transcript (`getEffectiveTranscript` on the project, or `readVideo` on the media id) before writing.
- House voice rules from SKILL.md apply: no em-dashes or en-dashes, founder-voiced, no marketing filler.
- Write valid JSON with 2-space indent and a trailing newline.
