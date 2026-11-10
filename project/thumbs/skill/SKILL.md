---
name: thumbnail-taste
description: Taste rules for ReadyM thumbnails and vertical covers (OB:MP, WukongMP): what to show, what to write, how to lay it out, and how to score variants before Test & Compare.
---

# Thumbnail taste

Applies to ReadyM videos: server hosting tutorials, feature showcases and community moments for OB:MP (Oblivion Remastered) and WukongMP (Black Myth: Wukong). Platform specs are handled elsewhere. This file covers taste: what wins clicks and holds up in the video.

Machine-readable twin: `rules.json` in this folder (same ids). Sources and example teardowns: `references.md`.

Evidence labels used below:
- **measured**: a study or official doc with numbers. Source id given.
- **observed**: our read of real thumbnails (views and outlier ratio from 2026-11-08). One data point each, so treat it as a pattern, not proof.

Outlier ratio = views / median views of the channel's last ~30 uploads. It is a rough proxy: it flatters tiny channels and old videos.

## Core philosophy

1. **A thumbnail is one promise, read at 168 px in about a second.** One subject, one idea, a few words. If it needs explaining, it is two ideas.
2. **Our idea is almost always the same: "this single-player game, with your friends" or "your own server, working".** Show that. Do not describe the steps to get there.
3. **Surface tricks don't separate winners. The idea does.** Across 2,960 thumbnails, faces, brightness, contrast and saturation looked the same for breakouts and underperformers (measured, `eden-507k-2026`). Most of what separates them is the concept and the packaging.
4. **Title and thumbnail are one unit.** The title carries the search words. The thumbnail carries the hook. People read them together (`etra-2018-eyetracking`).
5. **Never promise what the video doesn't show early.** YouTube's Test & Compare picks winners on watch time share, not CTR (measured, `yt-ab-test-help`). Bait loses the test.

## Principles

Weight 3 = always check, 2 = usually, 1 = nice to have.

1. **One idea that reads at sidebar size** (3). One subject, one promise. Check at 168 px (YouTube sidebar) and 130 px (grids). Why: winners and losers look alike on surface features, so clarity of idea is the lever (measured, `eden-507k-2026`). The weakest tutorials we saw pack three messages into one frame and sit at 0.5x (observed, `ex-viralkingdom-avoid`, `ex-sebatron-alwayson`). 1of10 judges at about 120 px (`oneof10-trends-2026`, vendor).
2. **Four words is the target, six the ceiling** (3). Why: 4 to 6 words had the largest breakout lead in Eden's sample (30.6% vs 26.5%), 7+ words trailed (29.6% vs 31.1%) (measured, `eden-507k-2026`). vidIQ: breakouts with text had a median of 5 words, and 52% used 0 to 3 (measured, `vidiq-2026-study`).
3. **Thumbnail adds, title explains** (3). Keep game, OB:MP, Windows and "dedicated server" in the title. Put the outcome or hook on the image. Why: only 6.3% of breakouts repeat the title word for word (measured, `eden-507k-2026`). Title and thumbnail are read together (`etra-2018-eyetracking`). The leaked MrBeast guide treats them as one expectation (`mrbeast-guide-willison`).
4. **Show the multiplayer, not the menu** (3). Two or more players in one frame, marked as different people: P1/P2 tags, name tags, outline colours, 4 VS 1. Why: every multiplayer outlier we found does this (observed: `ex-dunderheads-howto` 6.4x, `ex-goldie-skyrim`, `ex-spiffing-hunted` 7.6M views). Multiple faces beat a single face in 1of10's data (measured, second hand, `sej-1of10-faces-2025`).
5. **A face is optional, a clear subject is not** (2). Use a real face only with a real reaction. Otherwise the subject is a character, a helmet or the server card. Why: faces 84.2% vs 82.2%, within noise (`eden-507k-2026`). It depends on the niche (`sej-1of10-faces-2025`). Only 5% of breakouts use exaggerated expressions (`vidiq-2026-study`). Server guides at 20x+ use game art, not faces (observed, `ex-troublechute-palworld`).
6. **Tutorials promise an outcome, a time or a price** (3). YOUR OWN SERVER, FREE, IN 5 MIN, FULL SERVER. Not INSTALLING, CONFIGURING, PART 1. Why: FREE VALHEIM SERVER did 25.6x on a 1.1K sub channel, IN 5 MINUTES did 6.5x, FULL SERVER BY AI did 32.7x (observed: `ex-allthingshosting-valheim`, `ex-xielent-palworld`, `ex-highwaytrooper-claude`). Pick the most interesting framing of the same video (`mrbeast-guide-willison`).
7. **Name the game at a glance** (2). Logo, iconic character or signature place. Oblivion: the gate, the Imperial City, the armour. Wukong: the Destined One. Keep the OB:MP wordmark small and secondary. Why: almost every server tutorial outlier shows the game logo large, and Wukong winners lead with the hero (observed: `ex-troublechute-valheim`, `ex-highwaytrooper-fivem`, `ex-zanny-wukong`, `ex-juicehead-15features`).
8. **Separate the subject, keep the palette small** (2). A light subject and words on a calm dark ground, plus one accent (ember). Why: average brightness and saturation don't predict breakouts (`eden-507k-2026`), but 89% of breakouts have a face or high contrast (`vidiq-2026-study`). Separation matters, raw brightness doesn't. Use about 3 colours (`oneof10-trends-2026`, vendor claim).
9. **Only promise what the video shows early** (3). Every number, time, price and feature must be true and on screen in the first minute. Server cards use real names and player counts. Why: Test & Compare scores watch time share (`yt-ab-test-help`, `yt-test-compare-help`). The MrBeast guide ties a mismatch to lower retention (`mrbeast-guide-willison`, `mrbeast-guide-tubefilter`, leaked).
10. **Test three ideas, not three tints** (2). Why: YouTube says very similar variants take longer or end as "Performed same" (`yt-test-compare-help`). One gaming case went from 4.2% to 7.8% CTR with a full concept change (single vendor case, unverified, `outlierkit-gaming-case`).
11. **One recognisable tutorial frame** (1). Keep one ReadyM guide look (frame, type, accent) and change the subject per video. Why: TroubleChute's Palworld and Valheim guides share one framed card and run 23x and 27x the channel median. gameranx's "Before You Buy" label works the same way (observed: `ex-troublechute-palworld`, `ex-troublechute-valheim`, `ex-gameranx-beforeyoubuy`).
12. **One arrow, only if it explains** (1). An arrow links cause to effect (prompt to server, solo to crowd). Never use one as decoration, and never use two. Why: drawn graphics are only slightly more common in breakouts (41.8% vs 38.1%, `eden-507k-2026`). FiveM guides use one arrow as a diagram (observed: `ex-guiderealm-fivem`, `ex-kingfancy-gtarp`).
13. **Keep words out of UI and crop zones** (2). Words and faces go inside the safe rect, clear of hard zones. Why: official safe-zone files (`google-vertical-safe-zone`, `tiktok-infeed-safe-zone`, `meta-reels-ads-guide`), the grid change (`buffer-ig-grid-2025`) and X link cards (`techcrunch-x-link-cards-2023`).
14. **A vertical cover is a poster, not a frame** (2). Centre on x 50. Keep words between about 22% and 65% of the height. Why: Shorts thumbnails show on the homepage and channel tab, not in the Shorts feed, and can't be A/B tested (`ppcland-shorts-thumbs-2026`). Grids crop and add view counts (`buffer-ig-grid-2025`, `designsensory-safe-zones`).

## Per-platform playbook

All px are on the panel's design frame. Smallest display sizes are where `capPx` (minimum cap height) is measured.

### YouTube 16:9 (1920x1080, judge at 168 px sidebar)

- Safe rect: x 120, y 60, w 1680, h 780. The rect is symmetric, so it also keeps the bottom left clear. A small logo or tag can sit lower on the left if needed.
- Hard zone: duration badge, bottom right, about 1530,855 to 1920,1080 (approx, sized for the sidebar). Soft: hover icons at the top right, progress bar along the bottom.
- Test & Compare: up to 3 thumbnails, desktop Studio, upload 1280x720 or larger, judged on watch time share. Results: Winner, Performed same, Inconclusive. Not available for Shorts (`yt-test-compare-help`, `yt-ab-test-help`).
- Limits: 4 words OK, 6 warn. 3 elements OK, 4 warn. Cap height 8 px OK, 5 px warn at 168 px. Detail finer than 4 px disappears.

### Vertical 9:16 (1080x1920, judge at 130 px grid)

Cover vs first frame are different jobs:
- **Cover** (custom thumbnail): seen in grids, shelves and the Shorts tab. It is cropped and gets view counts, but has no playback UI on top. These zones are **hard**.
- **First frame**: seen under playback UI (top bar, caption, action rail). These zones are **soft**. They matter only if the cover is also the opening frame.

Safe rect chosen: **x 192 to 888, y 420 to 1248** (x 192, y 420, w 696, h 828). It is derived as the strictest of:

| Surface | Top | Bottom | Left | Right | Source |
|---|---|---|---|---|---|
| Shorts playback | 288 | 672 | 48 | 192 | `google-vertical-safe-zone` |
| TikTok playback | 240 | 660 | 120 | 120, rail x 780 to 960 from y 840 | `tiktok-infeed-safe-zone`, `socialync-safe-zones` |
| Reels playback | 269 (14%) | 672 (35%) | 65 (6%) | 65 | `meta-reels-ads-guide` |
| Instagram grid 3:4 | 240 | 240 | 0 | 0 | `buffer-ig-grid-2025` |
| Square grid (legacy IG, maybe TikTok) | 420 | 420 | 0 | 0 | `buffer-ig-grid-2025`, `designsensory-safe-zones` |

The right margin is 192, from Shorts, and the left mirrors it for symmetry. The top is 420, from the square crop. The bottom is 672, from Shorts and Reels. TikTok's rail clips the lower right of the rect (x 780 to 888, y 840 to 1248), so keep that corner free of words.

Hard zones (approx, unverified px): 3:4 grid crops, Shorts shelf title overlay (y 1500 and down), TikTok grid view count (bottom left), Reels grid play count (bottom left). The TikTok grid crop is disputed (square vs 3:4). The rect assumes the stricter square.

Shorts covers can't be A/B tested. Put the YouTube winner's idea on the cover, as a centred poster rather than a squeezed copy of the 16:9 layout.

### Instagram and Reddit 4:5 (1080x1350, judge at 130 px)

- Safe rect: x 80, y 160, w 920, h 1030. It keeps words inside the legacy square crop (135 px top and bottom) with a margin.
- Hard: carousel or Reel icon at the top right of grid tiles (approx). Soft: possible 34 px side trims if the grid shows 3:4 tiles (uncertain).
- Reddit shows 4:5 images whole in most feeds (observed), so one design serves both.

### X and Reddit 16:9 (1600x900, judge at 350 px)

- Safe rect: x 100, y 60, w 1400, h 690.
- Shared as a link card, X crops toward 1.91:1 (soft, 31 px top and bottom) and puts the domain label at the bottom left. Since Oct 2023 there is no headline, so the image must say everything (`techcrunch-x-link-cards-2023`). The label is a hard zone (approx px).
- Native image posts show the whole 16:9 in the timeline (observed). Prefer posting the image natively over a bare link on both X and Reddit.

## Copy

**Headline words that fit our videos:** YOUR OWN, FREE, TOGETHER, WITH FRIENDS, NOT ALONE, ONLINE, LIVE, INVITE, IN 5 MIN, P1 / P2, 4 VS 1, [N] PLAYERS.

**Patterns** (use only when true):
- `YOUR OWN [THING]`: hosting tutorials (YOUR OWN SERVER).
- `[THING] IN [N] MIN`: only if you timed it in the video.
- `FREE [GAME] SERVER`: self-hosting with no paid host (`ex-allthingshosting-valheim`).
- `[N] PLAYERS` or `[N] VS [N]`: events and PvP, using the real count (`ex-spiffing-hunted`).
- P1 / P2 tags with no headline: first-look multiplayer (`ex-dunderheads-howto`).
- `[GAME], NOT ALONE` or `WITH FRIENDS`: showcases for single-player fans (`ex-goldie-skyrim`).
- `INVITE YOUR FRIENDS` plus a live server card: end-state proof (`ex-highwaytrooper-claude`).
- `I WISH I KNEW...`: tips and mistakes, next to one strong action shot (`ex-arktix-wukong`).

**Avoid:**
- Repeating the title. The panel warns when 75% or more of the headline words are already in the title.
- Leading with process words (INSTALLING, CONFIGURING, PART 1). A small GUIDE label is fine, as in a series frame.
- Sentences, bullet lists, more than 6 words (`ex-viralkingdom-avoid`, `ex-upisnotjump-nightmare`).
- Version numbers, .NET, ports, file names, menus. They belong in the video.
- A year as the main idea (`ex-cupppajoe-wukong` at 0.3x). A small 2026 tag is fine (`ex-allthingshosting-valheim`).
- Filler (ultimate, insane, revolutionary) and fake urgency.

**Complement, don't repeat.** For "How to host an OB:MP server for Oblivion Remastered on Windows":
- Good: YOUR OWN SERVER (plus FREE, if true). INVITE YOUR FRIENDS with a live card. No words, just two players tagged P1/P2 on the Imperial bridge.
- Bad: HOST OB:MP ON WINDOWS, or OBLIVION SERVER TUTORIAL 2026.

**Type:** Fira Sans caps for punch, with one accent word in ember #ff8a1f. Kingthings Petrock in title case only for short, atmospheric lines. Heading colour #f6f1e7, gold rule #cbb68c. Use success green #6cc070 only for real status. Use error red #d7223f only for real errors, never as a background field.

## Composition recipes

Full element specs are in `rules.json` under `recipes`. Swap placeholder backgrounds for real footage frames (media ids) whenever the recipe says so.

| id | Name | Platforms | When | Why (refs) |
|---|---|---|---|---|
| `promise-anchor` | Promise + game anchor | YouTube | Hosting and setup tutorials | Game art plus one outcome phrase is the 20x+ server guide pattern (`ex-allthingshosting-valheim`, `ex-troublechute-palworld`, `ex-xielent-palworld`, `eden-507k-2026`) |
| `coop-duo` | P1 / P2 together | YouTube | First looks, feature showcases | Proves co-op without words (`ex-dunderheads-howto`, `ex-goldie-skyrim`, `sej-1of10-faces-2025`) |
| `big-number` | The number is the hook | YouTube | Events, PvP, big community nights | Scale in one read (`ex-spiffing-hunted`, `ex-spiffing-vs11`, `ex-vress-20things`) |
| `live-server` | Server is live | YouTube | Hosting tutorials, server launches | Shows the end state, not the steps. Real numbers only (`ex-highwaytrooper-claude`, `ex-guiderealm-fivem`, `yt-ab-test-help`) |
| `the-moment` | The moment, no words | YouTube | Funny or epic community clips | The frame is the hook. Zero-text gaming outliers exist (`ex-penguinz0-real`, `ex-dunderheads-fantastic`, `oneof10-trends-2026`, `vidiq-2026-study`) |
| `solo-to-crowd` | Solo to together | YouTube | "What multiplayer adds" showcases | Before/after with one arrow (`ex-kingfancy-gtarp`, `ex-highwaytrooper-claude`, `eden-507k-2026`) |
| `vertical-poster` | Centred poster stack | Vertical | Every Shorts, TikTok or Reels cover | Survives grid crops, counts and playback UI (`google-vertical-safe-zone`, `tiktok-infeed-safe-zone`, `meta-reels-ads-guide`, `buffer-ig-grid-2025`, `designsensory-safe-zones`) |
| `feed-card` | 4:5 feed card | Instagram | Server, event or tutorial posts on IG and Reddit | Most feed height, square-grid fallback (`buffer-ig-grid-2025`, `ex-highwaytrooper-claude`) |
| `wide-link` | Wide link card | X | X and Reddit posts, link cards | No headline on X cards, so the image carries the message (`techcrunch-x-link-cards-2023`, `ex-gameranx-beforeyoubuy`) |

Picking a recipe:
- Tutorial: `promise-anchor`, `live-server` or `coop-duo`.
- Showcase: `coop-duo`, `solo-to-crowd` or `the-moment`.
- Community moment or event: `the-moment` or `big-number`.

## Scoring rubric

Score each question 0 (no), 1 (partly) or 2 (yes), then multiply by its weight. The maximum is 36.

| id | Question | Weight |
|---|---|---|
| `r-one-idea` | At 168 px wide, can a stranger say what this video gives them within 3 seconds? | 3 |
| `r-players` | Multiplayer video: does it show two or more players or a live server, not a lone hero or a menu? | 3 |
| `r-promise` | Do the words name an outcome, time, price or stakes in 6 words or fewer, without repeating the title? | 3 |
| `r-truth` | Will the first minute confirm every claim on it? | 2 |
| `r-game` | Is the game recognisable at a glance (logo, character, place)? | 2 |
| `r-separation` | Does the subject pop off a calm ground with one accent, and no red, white or black field? | 2 |
| `r-safe` | Are all words and faces inside the safe rect and clear of hard zones? | 2 |
| `r-distinct` | Is it a different idea from the other variants in the test? | 1 |

These thresholds are our call, not evidence:
- Ship at 27 or more.
- A 0 on any weight-3 question blocks the variant.
- `r-truth` at 0 always blocks.
- For non-multiplayer videos (rare for us), score `r-players` 2 if the subject is clear.

The panel's colour checks are warnings, not rules. It warns when:
- the warm share is under 4%
- near-black is over 55% of the frame
- near-white is over 45%
- saturated red is over 30% (it fights YouTube's own red UI)

## Anti-patterns

- **The slide**: bars, bullet lists, three text blocks (`ex-viralkingdom-avoid` 0.5x, `ex-sebatron-alwayson` 0.6x).
- **The title again**: a long sentence that repeats the title (`ex-upisnotjump-nightmare` relies on the creator's brand, `ex-toasty-faithful` 0.4x).
- **The year as hook**: a giant 2026 with nothing else to read (`ex-cupppajoe-wukong` 0.3x).
- **Mood without subject**: a dim, low contrast scene with a logo on top (`ex-nickypoo-busted` 0.6x).
- **Mystery mascot**: question marks and host logos with no promise (`ex-doopa-palworld` 0.6x).
- **The lone hero for a multiplayer video**: hides the one thing we sell.
- **Stock shocked face**: only 5% of breakouts use exaggerated expressions (`vidiq-2026-study`).
- **Decoration arrows and circles**: one arrow that explains is fine, two is clutter (`eden-507k-2026`).
- **Cosmetic A/B variants**: same idea, different colour. The likely result is "Performed same" (`yt-test-compare-help`).
- **Fake numbers**: player counts, times or prices that the video doesn't show early (`yt-ab-test-help`).
- **Shrunk 16:9 on a vertical cover**: words end up in crop zones and the subject at 130 px is a speck.
- **Brand red or pure black and white fields**: they blend into YouTube's UI and fail the colour checks.

## How to apply in the Kino Thumbnails panel

1. **Read the video first.**
   - Get the title, the first 60 seconds and the best frames: `readVideo`, `getEffectiveTranscript`, `lookAtFrames`.
   - Write down the one true outcome, any real numbers (players, minutes, price) and the best shot of two or more players together.
2. **Make 3 distinct YouTube variants for Test & Compare.** Each is a different big idea, not a cosmetic change. A default trio for a hosting tutorial:
   - A: promise (`promise-anchor`)
   - B: players together (`coop-duo`)
   - C: proof (`live-server`)
   For showcases, swap in `the-moment` or `solo-to-crowd`. Say in one line what each variant bets on.
3. **Prefer real imagery.** Use, in this order:
   - footage frames and library images (media ids)
   - the brand backgrounds (`keyart`, `tower`, `bridge`, `rumare`, `wallpaper`)
   Use emblems only as small accents. Never use paid AI generation (fal or similar) unless the user asks for it.
4. **Score each variant with the rubric.** Fix anything under the bar.
   - Check it at 168 px.
   - Check the panel's word, element and cap-height limits: 4 words OK, 6 warn. 3 elements OK, 4 warn. Cap height 8 px OK, 5 px warn.
   - Check the safe rect and hard zones.
5. **Upload all three to Test & Compare** (desktop Studio). Let it run to a result. If it says "Performed same", the ideas were too close, so try a bolder concept next time rather than retesting tints.
6. **Adapt the winner to the other sizes.** Keep the idea and rebuild the layout:
   - vertical: `vertical-poster`, centred on x 50, words between y 420 and 1248
   - Instagram and Reddit: `feed-card`
   - X: `wide-link`, with the bottom left kept free
   Before the test has a result, adapt variant A.
7. **Keep a series frame.** Reuse the same type, accent and logo placement across tutorials so returning viewers spot a ReadyM guide.
8. **Record what won** (which idea, which video) in the design notes, so the next set starts from evidence.

Design file format: see format.md in this folder.
