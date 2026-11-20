---
name: thumbnail-taste
description: Taste rules for video thumbnails and vertical covers: what to show, what to write, how to lay it out, and how to score variants before Test & Compare.
---

# Thumbnail taste

For any video that needs a thumbnail or a vertical cover: tutorials, showcases, launches, moments. Platform specs are handled elsewhere. This file covers taste: what wins clicks and holds up in the video.

Machine-readable twin: `rules.json` in this folder (same ids). Sources and example teardowns: `references.md`. Design file format: `format.md`.

**Brand.** Colors, fonts, the logo and named images come from the project's brand kit in `/thumbs/brand.json` (see `format.md`). Where this file says accent, logo or brand image, it means the kit's.

Evidence labels used below:
- **measured**: a study or official doc with numbers. Source id given.
- **observed**: a read of real thumbnails (views and outlier ratio from 2026-11-08). The examples are gaming and game-server tutorial videos, one data point each, so treat each as a pattern from one niche, not proof.
- **unverified**: no public source. Test it on your own channel.

Outlier ratio = views / median views of the channel's last ~30 uploads. It is a rough proxy: it flatters tiny channels and old videos.

## Core philosophy

1. **A thumbnail is one promise, read at 168 px in about a second.** One subject, one idea, a few words. If it needs explaining, it is two ideas.
2. **Show what the viewer gets, not the steps to get there.** The finished thing, the moment, the result in use.
3. **Surface tricks don't separate winners. The idea does.** Across 2,960 thumbnails, faces, brightness, contrast and saturation looked the same for breakouts and underperformers (measured, `eden-507k-2026`). What is left to separate them is the concept and how it is packaged (creator view, `galloway-colin-samir`).
4. **Title and thumbnail are one unit.** The title carries the search words. The thumbnail carries the hook. People read them together (`etra-2018-eyetracking`).
5. **Never promise what the video doesn't show early.** YouTube's Test & Compare picks winners on watch time share, not CTR (measured, `yt-ab-test-help`). Bait loses the test.

## Principles

Weight 3 = always check, 2 = usually, 1 = nice to have.

1. **One idea that reads at sidebar size** (`one-idea`, 3). One subject, one promise. Check at 168 px (YouTube sidebar) and 130 px (grids). Why: winners and losers look alike on surface features, so clarity of idea is the lever (measured, `eden-507k-2026`). The weakest tutorials in the examples pack three messages into one frame and sit at 0.5x (observed, `ex-viralkingdom-avoid`, `ex-sebatron-alwayson`). 1of10 judges at about 120 px (`oneof10-trends-2026`, vendor).
2. **Four words is the target, six the ceiling** (`few-words`, 3). Why: 4 to 6 words had the largest breakout lead in Eden's sample (30.6% vs 26.5%), 7+ words trailed (29.6% vs 31.1%) (measured, `eden-507k-2026`). vidIQ: breakouts with text had a median of 5 words, and 52% used 0 to 3 (measured, `vidiq-2026-study`).
3. **Thumbnail adds, title explains** (`complement-title`, 3). Keep the product, the task, the platform and the version in the title. Put the outcome or hook on the image. Why: only 6.3% of breakouts repeat the title word for word (measured, `eden-507k-2026`). Title and thumbnail are read together (`etra-2018-eyetracking`). The leaked MrBeast guide treats them as one expectation (`mrbeast-guide-willison`).
4. **Show it in use, not the menu** (`show-in-use`, 3). Show the result happening: the finished thing, people using it, the moment itself. When the video is about doing something together or against each other, put two or more people in one frame and mark them apart: tags, name labels, outline colors, a 4 VS 1. Why: the multiplayer outliers in the examples all do this (observed: `ex-dunderheads-howto` 6.4x, `ex-goldie-skyrim`, `ex-spiffing-hunted` 7.6M views). Multiple faces beat a single face in 1of10's data (measured, second hand, `sej-1of10-faces-2025`).
5. **A face is optional, a clear subject is not** (`subject-not-face`, 2). Use a real face only with a real reaction. Otherwise the subject is the product, a character or the finished result. Why: faces 84.2% vs 82.2%, within noise (`eden-507k-2026`). It depends on the niche (`sej-1of10-faces-2025`). Only 5% of breakouts use exaggerated expressions (`vidiq-2026-study`). The server guides at 20x+ use game art, not faces (observed, `ex-troublechute-palworld`).
6. **Tutorials promise an outcome, a time or a price** (`promise-outcome`, 3). FREE, IN 5 MIN, YOUR OWN [THING], DONE. Not INSTALLING, CONFIGURING, PART 1. Why: FREE VALHEIM SERVER did 25.6x on a 1.1K sub channel, IN 5 MINUTES did 6.5x, FULL SERVER BY AI did 32.7x (observed: `ex-allthingshosting-valheim`, `ex-xielent-palworld`, `ex-highwaytrooper-claude`). Pick the most interesting framing of the same video (`mrbeast-guide-willison`).
7. **Name the subject at a glance** (`subject-anchor`, 2). A logo, the product, a recognizable character or a signature place. Keep your own wordmark small and secondary. Why: almost every tutorial outlier in the examples shows the logo of the thing it covers, large (observed: `ex-troublechute-palworld`, `ex-troublechute-valheim`, `ex-highwaytrooper-fivem`).
8. **Separate the subject, keep the palette small** (`separation`, 2). The subject and the words stand clear of a calm ground, plus one accent from the brand kit. Why: average brightness and saturation don't predict breakouts (`eden-507k-2026`), but 89% of breakouts have a face or high contrast (`vidiq-2026-study`). Separation matters, raw brightness doesn't. Use about 3 colors (`oneof10-trends-2026`, vendor claim).
9. **Only promise what the video shows early** (`truthful`, 3). Every number, time, price and feature must be true and on screen in the first minute. An info card uses real names and counts. Why: Test & Compare scores watch time share (`yt-ab-test-help`, `yt-test-compare-help`). The MrBeast guide ties a mismatch to lower retention (`mrbeast-guide-willison`, `mrbeast-guide-tubefilter`, leaked).
10. **Test three ideas, not three tints** (`big-ideas`, 2). Why: YouTube says very similar variants take longer or end as "Performed same" (`yt-test-compare-help`). One gaming channel went from 4.2% to 7.8% CTR with a full concept change (single vendor case, unverified, `outlierkit-gaming-case`).
11. **One recognizable series frame** (`series-frame`, 1). Keep one look for a series (frame, type, accent, logo placement) and change the subject per video. Why: one channel's two server guides share a framed card and run 23x and 27x the channel median (observed: `ex-troublechute-palworld`, `ex-troublechute-valheim`).
12. **One arrow, only if it explains** (`arrows-earn-it`, 1). An arrow links before to after, or cause to effect. Never use one as decoration, and never use two. Why: drawn graphics are only slightly more common in breakouts (41.8% vs 38.1%, `eden-507k-2026`). The guides in the examples that use an arrow use one, as a diagram (observed: `ex-guiderealm-fivem`, `ex-kingfancy-gtarp`).
13. **Keep words out of UI and crop zones** (`respect-ui`, 2). Words and faces go inside the safe rect, clear of hard zones. Why: official safe-zone files (`google-vertical-safe-zone`, `tiktok-infeed-safe-zone`, `meta-reels-ads-guide`), the grid change (`buffer-ig-grid-2025`) and X link cards (`techcrunch-x-link-cards-2023`).
14. **A vertical cover is a poster, not a frame** (`vertical-poster`, 2). Center on x 50. Keep words between about 22% and 65% of the height. Why: Shorts thumbnails show on the homepage and channel tab, not in the Shorts feed, and can't be A/B tested (`ppcland-shorts-thumbs-2026`). Grids crop and add view counts (`buffer-ig-grid-2025`, `designsensory-safe-zones`).

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

Shorts covers can't be A/B tested. Put the YouTube winner's idea on the cover, as a centered poster and not a squeezed copy of the 16:9 layout.

### Instagram and Reddit 4:5 (1080x1350, judge at 130 px)

- Safe rect: x 80, y 160, w 920, h 1030. It keeps words inside the legacy square crop (135 px top and bottom) with a margin.
- Hard: carousel or Reel icon at the top right of grid tiles (approx). Soft: possible 34 px side trims if the grid shows 3:4 tiles (uncertain).
- Reddit shows 4:5 images whole in most feeds (observed), so one design serves both.

### Square 1:1 (1080x1080, judge at 130 px)

- Safe rect: x 150, y 80, w 780, h 920.
- Soft: Instagram's grid tiles are 3:4, so a square image can lose up to 135 px on each side there (derived from the tile ratio, unverified; `buffer-ig-grid-2025`). The feed shows the square whole.
- No recipe is tuned for this size yet. Rebuild the `feed-card` idea inside the narrower rect.

### X and Reddit 16:9 (1600x900, judge at 350 px)

- Safe rect: x 100, y 60, w 1400, h 690.
- Shared as a link card, X crops toward 1.91:1 (soft, 31 px top and bottom) and puts the domain label at the bottom left. Since Oct 2023 there is no headline, so the image must say everything (`techcrunch-x-link-cards-2023`). The label is a hard zone (approx px).
- Native image posts show the whole 16:9 in the timeline (observed). Prefer posting the image natively over a bare link on both X and Reddit.

## Copy

**Headline words that fit most videos:** FREE, DONE, YOUR OWN, IN 5 MIN, [N] STEPS, BEFORE / AFTER, A VS B, [N] PEOPLE. Use the words of the video's own subject for the rest.

**Patterns** (use only when true):
- `YOUR OWN [THING]`: tutorials where the viewer ends up owning or running the thing.
- `[THING] IN [N] MIN`: only if you timed it in the video (`ex-xielent-palworld`).
- `FREE [THING]`: guides where the whole path costs nothing (`ex-allthingshosting-valheim`).
- `[N] PEOPLE` or `[N] VS [N]`: events and contests, using the real count (`ex-spiffing-hunted`).
- A / B tags with no headline: two people or two options in one frame (`ex-dunderheads-howto`).
- `[RESULT]` plus an info card: end-state proof with real names and numbers (`ex-highwaytrooper-claude`).

**Avoid:**
- Repeating the title. The panel warns when 75% or more of the headline words are already in the title.
- Leading with process words (INSTALLING, CONFIGURING, PART 1). A small GUIDE label is fine, as in a series frame.
- Sentences, bullet lists, more than 6 words (`ex-viralkingdom-avoid`).
- Version numbers, part numbers, file names, menus. They belong in the video.
- A year as the main idea (unverified). A small year tag is fine (`ex-allthingshosting-valheim`, `ex-highwaytrooper-fivem`).
- Filler (ultimate, insane, revolutionary) and fake urgency.

**Complement, don't repeat.** For a video titled "How to Replace Disc Brake Pads on a Fernhollow Trail 2" (a made-up bike):
- Good: NEW PADS, 10 MIN (if the video proves the time). SQUEAL GONE over the wheel. No words, just the worn pad and the new pad side by side with one arrow.
- Bad: REPLACE BRAKE PADS TRAIL 2, or BRAKE PAD TUTORIAL 2026.

**Type and color:** from the brand kit. One accent word per headline. Keep success green and error red for real status, never as a background field.

## Composition recipes

Full element specs are in `rules.json` under `recipes`. Text fields there hold tokens such as `{title}`; write your own final words. Recipe backgrounds give framing only (focus, zoom, blur, shade): pick the image yourself, a footage frame first, then a brand image.

| id | Name | Platforms | When | Why (refs) |
|---|---|---|---|---|
| `promise-anchor` | Promise + subject anchor | YouTube | Tutorials and how-to videos | The subject's art plus one outcome phrase is the pattern of the 20x+ guides (`ex-allthingshosting-valheim`, `ex-troublechute-palworld`, `ex-xielent-palworld`, `eden-507k-2026`) |
| `tagged-pair` | Two together, tagged | YouTube | Doing something together, or two options side by side | Shows "together" without words (`ex-dunderheads-howto`, `ex-goldie-skyrim`, `sej-1of10-faces-2025`) |
| `big-number` | The number is the hook | YouTube | Events, contests, group moments | Scale in one read (`ex-spiffing-hunted`, `ex-spiffing-vs11`) |
| `end-state` | The end state | YouTube | Tutorials and launches | Shows the result, not the steps. Real numbers only (`ex-highwaytrooper-claude`, `ex-guiderealm-fivem`, `yt-ab-test-help`) |
| `the-moment` | The moment, no words | YouTube | Funny or striking clips | The frame is the hook (`ex-dunderheads-fantastic`, `oneof10-trends-2026`, `vidiq-2026-study`) |
| `before-after` | Before to after | YouTube | Videos about a change | Two frames and one arrow (`ex-kingfancy-gtarp`, `ex-highwaytrooper-claude`, `eden-507k-2026`) |
| `vertical-poster` | Centered poster stack | Vertical | Every Shorts, TikTok or Reels cover | Survives grid crops, counts and playback UI (`google-vertical-safe-zone`, `tiktok-infeed-safe-zone`, `meta-reels-ads-guide`, `buffer-ig-grid-2025`, `designsensory-safe-zones`) |
| `feed-card` | 4:5 feed card | Instagram | Launch, event or tutorial posts on IG and Reddit | Most feed height, square-grid fallback (`buffer-ig-grid-2025`, `ex-highwaytrooper-claude`) |
| `wide-link` | Wide link card | X | X and Reddit posts, link cards | No headline on X cards, so the image carries the message (`techcrunch-x-link-cards-2023`) |

Picking a recipe:
- Tutorial: `promise-anchor`, `end-state` or `before-after`.
- Showcase: `tagged-pair`, `before-after` or `the-moment`.
- Moment or event: `the-moment` or `big-number`.

## Scoring rubric

Score each question 0 (no), 1 (partly) or 2 (yes), then multiply by its weight. The maximum is 36.

| id | Question | Weight |
|---|---|---|
| `r-one-idea` | At 168 px wide, can a stranger say what this video gives them within 3 seconds? | 3 |
| `r-in-use` | Does it show the result in use (the finished thing, people doing it) instead of a menu, a settings screen or a lone logo? | 3 |
| `r-promise` | Do the words name an outcome, time, price or stakes in 6 words or fewer, without repeating the title? | 3 |
| `r-truth` | Will the first minute confirm every claim on it? | 2 |
| `r-subject` | Is the subject recognizable at a glance (logo, product, character, place)? | 2 |
| `r-separation` | Does the subject stand clear of a calm ground with one accent, and no red, white or black field? | 2 |
| `r-safe` | Are all words and faces inside the safe rect and clear of hard zones? | 2 |
| `r-distinct` | Is it a different idea from the other variants in the test? | 1 |

These thresholds are choices made for this skill, not evidence:
- Ship at 27 or more.
- A 0 on any weight-3 question blocks the variant.
- `r-truth` at 0 always blocks.

The panel's color checks are warnings, not rules. It warns when:
- the warm share is under 4%
- near-black is over 55% of the frame
- near-white is over 45%
- saturated red is over 30% (it fights YouTube's own red UI)

## Anti-patterns

- **The slide**: bars, bullet lists, three text blocks (`ex-viralkingdom-avoid` 0.5x, `ex-sebatron-alwayson` 0.6x).
- **The title again**: a long sentence that repeats the title (6.3% of breakouts, `eden-507k-2026`).
- **The year as hook**: a giant year with nothing else to read (unverified).
- **Mood without subject**: a dim, low contrast scene with a logo on top (`ex-nickypoo-busted` 0.6x).
- **Mystery mascot**: question marks and third-party logos with no promise (`ex-doopa-palworld` 0.6x).
- **The menu**: a settings screen or a lone logo where the result should be.
- **Stock shocked face**: only 5% of breakouts use exaggerated expressions (`vidiq-2026-study`).
- **Decoration arrows and circles**: one arrow that explains is fine, two is clutter (`eden-507k-2026`).
- **Cosmetic A/B variants**: same idea, different color. The likely result is "Performed same" (`yt-test-compare-help`).
- **Fake numbers**: counts, times or prices that the video doesn't show early (`yt-ab-test-help`).
- **Shrunk 16:9 on a vertical cover**: words end up in crop zones and the subject at 130 px is a speck.
- **Red, pure black or pure white fields**: they blend into YouTube's UI and trip the color checks.

## How to apply in the Kino Thumbnails panel

1. **Read the video and the brand kit first.**
   - Get the title, the first 60 seconds and the best frames: `readVideo`, `getEffectiveTranscript`, `lookAtFrames`.
   - Write down the one true outcome, any real numbers (counts, minutes, price) and the best shot of the result in use.
   - Read `/thumbs/brand.json` for the colors, fonts, logo and images you can use.
2. **Make 3 distinct YouTube variants for Test & Compare.** Each is a different big idea, not a cosmetic change. A default trio for a tutorial:
   - A: promise (`promise-anchor`)
   - B: the result in use (`tagged-pair` or `the-moment`)
   - C: proof (`end-state` or `before-after`)
   Say in one line what each variant bets on.
3. **Prefer real imagery.** Use, in this order:
   - footage frames and library images (media ids)
   - the brand kit's images
   Use icons only as small accents. Never use paid AI generation (fal or similar) unless the user asks for it.
4. **Score each variant with the rubric.** Fix anything under the bar.
   - Check it at 168 px.
   - Check the panel's word, element and cap-height limits: 4 words OK, 6 warn. 3 elements OK, 4 warn. Cap height 8 px OK, 5 px warn.
   - Check the safe rect and hard zones.
5. **Upload all three to Test & Compare** (desktop Studio). Let it run to a result. If it says "Performed same", the ideas were too close, so try a bolder concept next time and don't retest tints.
6. **Adapt the winner to the other sizes.** Keep the idea and rebuild the layout:
   - vertical: `vertical-poster`, centered on x 50, words between y 420 and 1248
   - Instagram and Reddit: `feed-card`
   - X: `wide-link`, with the bottom left kept free
   Before the test has a result, adapt variant A.
7. **Keep a series frame.** Reuse the same type, accent and logo placement across a series so returning viewers spot it.
8. **Record what won** (which idea, which video) in the design notes, so the next set starts from evidence.
