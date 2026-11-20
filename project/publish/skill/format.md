# /publish/copy.json format (v1)

The Publish panel reads `/publish/copy.json` and shows each platform's options. The agent writes the file. The user picks one option per platform and edits it in the panel. The panel keeps its own choices, edits and schedule in `/publish/plan.json` (agent: do not touch that file).

```json
{
  "version": 1,
  "updated": "2026-11-08T20:00:00Z",
  "requestId": "2f6c1d1e-8a54-4a0b-9d0e-3b1f6f0c7a11",
  "platforms": {
    "youtube": {
      "options": [
        {
          "id": "youtube-1",
          "angle": "Outcome",
          "title": "Replace Disc Brake Pads at Home, Start to Finish",
          "text": "Description or caption, WITHOUT the hashtag block.",
          "hashtags": ["#bikerepair", "#discbrakes"],
          "tags": ["replace disc brake pads", "bike brake pads"],
          "firstComment": "Optional first comment.",
          "thread": ["Optional follow-up posts for X, Threads or Bluesky."],
          "why": "One line: the rule ids used and why this should work.",
          "rules": ["search-words-first", "honest-promise"]
        }
      ],
      "notes": "Optional advice for the user about this platform."
    }
  }
}
```

## What the panel reads

| Field | Where | Notes |
|---|---|---|
| `requestId` | top level | Copy it from the request, character for character. The panel uses it to see that the answer arrived. |
| `platforms.<key>.options` | per platform | A list. The panel shows the first 6 and skips an option with neither `text` nor `title`. |
| `platforms.<key>.notes` | per platform | Shown under the options as plain text. |
| `id` | option | Unique within the platform, for example `youtube-1`. |
| `angle` | option | Short name of the angle, shown as the option's heading. |
| `title` | option | YouTube (max 100 chars) and Facebook Reels. Leave it out elsewhere. |
| `text` | option | The description, caption or post body, as plain text with line breaks. |
| `hashtags` | option | List of strings. The panel adds a missing `#`, drops repeats and appends the block to `text` after a blank line. |
| `tags` | option | YouTube only. List of strings. |
| `firstComment` | option | YouTube, Instagram, Facebook, LinkedIn, Threads. Ignored elsewhere. |
| `thread` | option | X, Threads and Bluesky only: the follow-up posts, in order. `text` is the first post. |
| `why` | option | One line shown under the option. |
| `rules` | option | Rule ids from `SKILL.md`. Kept for the record; the panel does not show them. |

Anything else in the file is ignored. `version` and `updated` are for people reading the file.

## Rules for the agent

- Platform keys: `youtube`, `tiktok`, `instagram`, `facebook`, `linkedin`, `twitter` (X), `threads`, `bluesky`. Write only the platforms the request names.
- Exactly 3 options per platform, each a different angle. Not three rewordings of one line.
- Merge, do not replace: read the existing file first and keep the platforms the request did not name.
- Hashtags go in `hashtags`, never at the end of `text`. A block of hashtags left at the end of `text` is moved into `hashtags` by the panel.
- The panel posts exactly what is in the file. Never write a placeholder such as `[link]` into `text`, `firstComment` or `thread`.
- Hard limits the panel checks, counted on `text` plus the appended hashtag block:
  - YouTube: title 100 characters, description 5000 bytes, no `<` or `>` in either. Tags: 500 characters together (commas count, a tag with a space counts 2 more), 100 per tag.
  - TikTok 2200, Instagram 2200, Facebook 63206, LinkedIn 3000, Threads 500: UTF-16 units, so most emoji count 2.
  - X: 280 (25000 on Premium), counted the way X counts: every link is 23, every emoji 2, CJK characters 2.
  - Bluesky: 300 characters as the reader sees them.
  - Every `thread` post has the same limit as `text`.
  - Hashtag caps per platform are in `rules.json` (`platforms.<key>.limits.hashtagsMax`). Hashtags inside `text` count too.
- Copy must match the video. Use the transcript (`getEffectiveTranscript` on the project, or `readVideo` on the media id) before writing.
- Voice, punctuation, names, facts and links come from `/publish/knowledge/README.md` and the skills it names. `SKILL.md` says how the two fit together.
- Write valid JSON with 2-space indent and a trailing newline.
