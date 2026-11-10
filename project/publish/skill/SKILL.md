---
name: post-copy
description: Write titles, descriptions and captions for ReadyM videos on YouTube, TikTok, Instagram, Facebook, LinkedIn, X, Threads and Bluesky, from the transcript, in the house voice, into /publish/copy.json.
---

# Post copy

Companion files: `rules.json` (the same rules, machine-readable, same ids), `references.md` (sources), `format.md` (the copy.json format; read it, never edit it). Compiled 2026-11-08, updated 2026-11-09.

**Voice and platform choice:** load the global `readym-social-voice` skill (`~/.claude/skills/readym-social-voice/SKILL.md`, Codex copy in `~/.codex/skills/`). It was built on 2026-11-09 from measured top posts on our YouTube and TikTok and on KCD:MP, Open77 and Speclizer, and covers hooks, titles, what wins on each platform and the CTA ladder. On voice and hooks it wins over this file. On panel mechanics, hard limits and the copy.json format, this file and `format.md` win. Facts and links still come only from the content kit and the video.

Evidence labels: **measured** = a number from a study, with sample and source id. **Official** = a platform statement without numbers. **Observed** = a pattern in real posts. Vendor studies show correlation, not cause. Anything we could not check is marked unverified.

## Core philosophy

1. **Title and thumbnail are one unit** (`title-thumb-unit`). People read the two together (`etra-2018-eyetracking`). The thumbnail carries the picture and a few words. The title carries the search words and the promise. Don't repeat the thumbnail text: only 6.3% of breakout videos do (**measured**, `eden-507k-2026`). If a thumbnail has been picked, look at it before you write a title.
2. **The honest promise** (`honest-promise`). YouTube A/B tests choose the winner on watch time share, not clicks (**official**, `yt-ab-test-help`). Titles that mislead to get clicks break YouTube's spam policy (**official**, `yt-spam-policy`). A title that gets the click and loses the viewer loses twice (`mrbeast-guide-willison`, leaked). Promise only what the video shows.
3. **Search words, then hook.** Platforms read the text to work out what a video is about:
   - YouTube: pick 1 to 2 main words and use them in the title and the first lines of the description (**official**, `yt-description-tips`).
   - TikTok: reads the caption, the voiceover and the on-screen text, and flags stuffing (**official**, `tiktok-ca-search`).
   - LinkedIn: its feed model reads what a post is about (**official**, `li-feed-eng-2026`).

   Tutorials get searched, so lead with the words people type (`search-words-first`). Short-form and feed posts get browsed, so lead with the hook and put the keyword second. Across 18,080 channels, search content did best with the keyword in the first 40% of the title, while gaming browse content did best leading with the hook (**measured**, vendor, `air-titles-2026`).
4. **Specific beats clever** (`specific-over-generic`).
   - In 4M+ uploads from 2026, titles ending in a question averaged 0.82x, plain how-to titles 1.07x, and specific story frames did best (**measured**, vendor, `vidiq-title-formulas-2026`).
   - 'How to' titles had a median of 1.60x channel baseline vs 0.99x for other titles (1,794 videos). The authors credit search intent, not the phrase (**measured**, vendor, `overseeros-howto-2026`).
   - Use how-to wording when people search for the task (`how-to-for-search`). Write statements, not questions (`statement-over-question`).

## House voice (`house-voice`)

Write it the way one of us would explain it on Discord: a modder talking to another player. Make it specific and short. Use "we" for ReadyM and "you" for the viewer.

- **Dashes:** no em-dashes or en-dashes, ever. Use a comma, colon, period or a plain hyphen.
- **One real detail per option:** a step, a screen, a version or a number taken from the video.
- **Contractions are fine.** Write numbers as digits. Use one "!" per option at most.
- **No hype stacks:** one intensifier at most. ALL CAPS only for a single word in a hype-tone YouTube title.
- **No emoji walls.** Emoji never replace words.
- **Openers:** across the 3 options, at most one starts with a question. Never open with "Hey guys" or "In this video".
- **Claims:** no "easy", "fast" or "in X minutes" unless the runtime and the transcript prove it.
- **Candor** (`candid-dev-voice`): what works now, plus one true limit where it fits ("it's a beta, things break"). Never invent bugs or modesty. Speclizer's "very broken" first test got 1.6M views on X (**measured**, `comp-speclizer-2026`).
- **Concrete nouns:** at least one per option, such as a place (Cloud Ruler Temple), a player count, a system (spell sync, the admin panel) or a version.
- **Game plus "multiplayer"** (`game-plus-multiplayer`): the full game name and "multiplayer" in the title or first line. The project name alone is not what newcomers search (`comp-open77-2026`).
- **No date or build templates** (`no-date-template`): never reuse the same date, build or "Part x/y" line across posts. Open77's date-template captions had a median of 944 views (**measured**).

Banned (full list in `rules.json` > `voice.banned`): revolutionary, industry-leading, thrilled to announce, valued community, game-changer, unlock, unleash, elevate, dive in, delve, seamless, next level, ultimate, cutting-edge, groundbreaking, journey, embark, supercharge, look no further, you won't believe, epic, insane, crazy.

| Before | After |
|---|---|
| Unlock the ultimate Oblivion multiplayer experience with our seamless server tools! | Host your own Oblivion Remastered server. We go from the .NET runtime to the first join. |
| Ready to take your Oblivion adventures to the next level? Dive in! | Oblivion Remastered, with your friends in Cyrodiil too. Here's how to host it. |
| We're thrilled to announce our revolutionary admin panel. | As a host you'll live in the admin panel. Here's a walk through it. |

## Read the video first

1. Pull the transcript: `getEffectiveTranscript` on the project, or `readVideo` on the media id. Write copy only after reading it.
2. Make a fact list:
   - what the viewer has at the end
   - the steps, in order
   - the screen names (admin panel, launcher)
   - every version, number and requirement shown
   - the runtime

   Only facts on this list can appear in copy (`honest-promise`).
3. Note the exact words the speaker uses. They are the words TikTok and YouTube hear, so reuse them in the caption (`say-it-on-screen`).
4. Chapters come from transcript timestamps (`yt-chapters`). Rules: 00:00 first, at least 3, ascending, each at least 10 seconds (**official**, `yt-chapters-help`). If the timings are unreliable, leave a placeholder and say so in `notes`.
5. Read the existing `/publish/copy.json`. Merge into it, copy the `requestId`, and keep the platforms the request didn't name.

## OB:MP facts and links (`known-links-only`)

The video tells you what this one post is about. Everything around it (what OB:MP is, what it needs, where the docs live, the Discord invite, our handles) comes from the team's content kit, never from memory or a plausible guess.

1. Before writing, load the `obmp-readym-content-kit` skill (installed globally at `~/.claude/skills/obmp-readym-content-kit/SKILL.md`, and for Codex at `~/.codex/skills/obmp-readym-content-kit/SKILL.md`; read the file if the skill isn't listed). Then read `/publish/knowledge/README.md` for anything specific to this project. Order of authority: newest Msk instruction, then live pages, then this project's knowledge folder, then the kit. Say in `notes` when sources disagree.
2. The kit's section 0 rules apply to every post. The ones that change post copy:
   - Game version: don't write "Steam only" or "Steam copy required". Xbox and Game Pass are only "support in progress, no date", never "coming soon".
   - Calling OB:MP a "mod" or "multiplayer mod" is fine. ReadyM is the platform.
   - No non-affiliation line on any platform, YouTube included, until Msk explicitly asks for it (Msk, Nov 9).
   - US English, literal claims, metrics with their date and never summed, signups are not players.
   - Nothing from the kit's "Never claim" list (section 9) or "Internal only" list (section 10). Unreleased versions, dates and partner terms stay out.
3. Use names the way the kit writes them: OB:MP, ReadyM, ReadyM Launcher, The Elder Scrolls IV: Oblivion Remastered.
4. Links, invites, @handles, versions, prices and requirements come only from the kit, the knowledge folder or the video. Copy them character for character, and prefer the deepest page that fits (the Installation page for a hosting video, not a docs root). The kit's section 15 says to refresh versions from the releases page before publishing; if you can't, say so in `notes`.
5. If a link the request asks for is not in those sources, leave it out. Do not write a placeholder like `[docs link]` into `text` or `firstComment`, because the panel posts exactly what is in copy.json. Say which link is missing in `why` and in `notes`.
6. Facts from the kit are background. Copy about this video still only promises what this video shows (`honest-promise`).

## Panel parameters

Defaults when a parameter is missing: tone plain, length medium, cta watch, emoji none, humanize 2. A parameter never overrides a hard rule: honesty, limits, dashes, banned words.

- **tone**:
  - `plain`: what it is and what you get.
  - `hype`: the energy comes from facts and verbs, not adjectives. Allows one caps word in a YouTube title (gaming caps were positive, correlational, `air-titles-2026`) and one "!".
  - `dry-funny`: one understated line per option about the game or modding life, never at the viewer's expense. Search words still lead on YouTube.
  - `technical`: name the parts exactly as the video shows them (runtime version, ports, config files, admin pages).
- **length**:
  - `short`: YouTube gets 2 lines plus chapters and links. TikTok under 30 words. Reels about 30 words. X one sentence. LinkedIn under 600 chars.
  - `medium`: YouTube gets 3 short paragraphs plus chapters and links. TikTok 30 to 60 words. Reels and Facebook 30 to 90 words. LinkedIn 600 to 1,300 chars.
  - `long`: YouTube gets a full write-up (requirements, steps, troubleshooting) up to about 2,000 chars. TikTok 90 words at most. LinkedIn up to 3,000. X, Threads and Bluesky become a 3 to 5 post `thread`.
- **cta**:
  - `none`: end on the last fact.
  - `watch`: point to the full video, or on YouTube to the next video.
  - `comment`: one real question a viewer can answer from experience. Never "comment YES" or "agree?" (`no-engagement-bait`).
  - `follow`: give a true reason ("we post every OB:MP update here").
  - `link`: put the link where links work for that platform (see the playbook) (`links-out-of-body`).
  - `discord`: our Discord, with a true reason. Use the invite from the content kit (https://discord.gg/obmp for OB:MP; help goes to #support). Never invent invites or channel names.
- **keywords**: must-include search words.
  - Put the first one inside the first ~50 chars of the YouTube title, in the first line of every description and caption, and in the advice for on-screen text.
  - Use each keyword once in a title and once or twice in a body. Variants and misspellings go in YouTube `tags`.
- **emoji**:
  - `none`: zero.
  - `light`: at most 1 per option, at a line end, never in a YouTube title.
  - `some`: up to 3 on TikTok, Instagram and Threads; still at most 1 on YouTube, LinkedIn and X. X counts each emoji as 2 chars (**official**, `x-counting-chars`).
- **hashtags** (count): a target, capped by each platform's max in `rules.json`. 0 is valid.
  - Order: most specific first (#OBMP, #OblivionRemastered), then at most one broad tag (#PCGaming).
  - Never #fyp, #viral, #reels or #explore.
  - Never inline in `text` (`hashtags-few-relevant`).
- **language** (BCP-47): write natively, don't translate English idioms. Keep proper names as they are: Oblivion Remastered, OB:MP, ReadyM, WukongMP. Use the local search words for multiplayer and server. For non-English Bluesky posts, add a `notes` line telling the user to set the post language.
- **humanize**:
  - `0`: clean neutral copy.
  - `1`: house voice: contractions, plain verbs.
  - `2`: plus "we" and one detail only the people who made it would know, taken from the transcript.
  - `3`: plus one honest founder aside (what was hard, what we changed), uneven sentence lengths, fragments are fine. Never fake typos or invent stories.
- **audience**:
  - `server-hosts`: requirements and steps up front.
  - `players`: the outcome, playing with friends, light on setup.
  - `modders`: what's under the hood and the tooling.
  - `industry`: what ReadyM does for single-player games, for LinkedIn.
- **notes**: the user's free text. Follow it. If it conflicts with a hard rule, follow the rule and explain why in that platform's `notes`.

## The three-angle method (`three-real-angles`)

Write exactly 3 options per platform. Each option takes its angle from a different family, so the user gets a real choice and A/B variants that differ in a meaningful way (`yt-ab-test-help`):

- **Search** family: `outcome`, `obstacle` or `speed`. Built from the keywords. Usually option 1 on YouTube, LinkedIn and Bluesky.
- **Browse** family: `impossible-moment`, `access`, `proof`, `play-together` or `curiosity`. Hook first. Usually option 1 on TikTok, Reels and X. Prefer `impossible-moment` when the clip shows players doing something the single-player game never allowed (`impossible-moment`), and `access` for open beta, batch, server or release posts (`access-moments`).
- **Voice** family: `builder` or `candid-build`. "We made this, here's how to use it", or "we got this working, here's what's still rough". In the house voice, as specific as the other two.

Put the angle name in `angle`. Write `why` as one line citing rule ids, and put those ids in `rules`. `speed` and `obstacle` need proof in the transcript. Angle definitions and examples are in `rules.json` > `angles`.

## Per-platform playbook

Panel hard limits count `text` plus the appended hashtags. `rules.json` > `platforms` holds the numbers, plus `wins` and `evidence` from `readym-social-voice`.

**What wins, by platform** (**measured** 2026-11-09 on ours and the three comparables unless marked; see `references.md` > Social performance):
- **YouTube long-form** (`yt-proof-asset`): a milestone or launch-day "one evening on a server", 3 to 5 minutes, chaptered. KCD:MP's got 161,210 views and press embedded it. Dated explainers are what press embeds, never TikTok.
- **Shorts:** one social moment in 15 to 40 seconds, titled with the moment, the game and "multiplayer". Our organic winners got 7 to 9% like rates; SDK explainers and POV clips got 223 to 1,874 views.
- **TikTok:** impossible moment, "it works now", lore lines and access posts with real numbers. Our access posts got 1.0 to 1.7% share rates against about 0.01% on teasers (`access-moments`). Keep cuts under about 45 seconds (`short-cut-length`).
- **X:** a native clip with 1 to 3 candid first-person sentences, a before and after number, and a tease of the next video. Reach comes from reposts by aggregators and creators, so draft the pitch in `notes`; Msk sends it.
- **Instagram, Facebook, LinkedIn, Threads, Bluesky:** no data of ours (login walls). Follow the vendor-backed rules below; on LinkedIn, post from Msk's profile with a dated milestone (unverified).

**YouTube long-form**
- **Limits:** title 100, description 5,000 (**official**, `yt-edit-settings-help`). There is no official truncation length. Keep the game, the keyword and the payoff in the first ~50 chars (`yt-front-load`).
- **Before truncation:** the title, the first 1 to 2 description lines, and up to 3 hashtags shown above the title (**official**, `yt-description-tips`, `yt-hashtags-help`).
- **Structure:**
  - line 1: what you get, with the keywords
  - line 2: who we are, in one line
  - what you need
  - chapters
  - links
- **Hashtags and tags:** 2 to 3 hashtags. `tags` holds 5 to 10 variants and misspellings ("oblivion remaster", "obmp"). Tags play a minimal role (**official**, `yt-tags-light`, `yt-tags-help`).
- **Freshness:** a version or year tag is common in ranked server tutorials (**observed**, `ex-yt-kazzanski-version`, `ex-yt-rockuzza-howto`). Use one only when it is true and on screen (`freshness-tag`).
- **CTA and first comment:** CTA after line 2. `firstComment` is the pinned comment: the docs link plus a real support prompt (`reply-and-pin`).
- **Avoid:** question-ending titles, stacked brackets (least effective in gaming, `air-titles-2026`), keyword lists in the description, emoji in titles.

**YouTube Shorts**
- **Title:** same 100 limit, but it sits over the video. Keep it short and hook first.
- **No A/B tests:** Shorts can't be tested (**official**, `yt-ab-test-help`).
- **Description:** 1 line plus 2 hashtags. Whether #shorts still does anything is unverified, so leave it out.

**TikTok**
- **Limits:** 2,200 (panel). A cap of 5 hashtags is reported but not confirmed by TikTok (`planoly-tiktok-5-2025`).
- **Length and structure:** keyword line, then one concrete detail, then an optional CTA. Under 30 words engaged best: 4.90% vs 3.90% at 90+ words (**measured**, vendor, 9.66M posts, `socialinsider-captions-2026`) (`caption-length-fit`).
- **Say it out loud:** the keyword should be in the voiceover and the on-screen text. Over 30% of viewers watch muted (**official**, `tiktok-ca-search`, `tiktok-ca-elements`).
- **Hashtags:** 2 to 4, specific. Loosely related tags can work against you (**official**, `tiktok-ca-search`).
- **CTA:** "Full guide on our YouTube" or follow. Caption links aren't clickable.
- **Avoid:** #fyp, keyword lists, and claims that aren't in the clip.

**Instagram Reels**
- **Limits:** 2,200 chars.
- **Hashtags:** at most 5 (announced Dec 2025, `businesstoday-ig-5-hashtags`; the API doc still says 30, `ig-graph-media-api`). Use 1 to 3. Mosseri says hashtags don't raise reach, and in one 24M-post sample, posts with hashtags got 32% fewer views (**measured**, vendor, correlational, `metricool-hashtags-2026`).
- **Before truncation:** about 125 chars (unverified). The hook and the keyword go there. Instagram search reads captions (`hootsuite-ig-seo`).
- **Length:** 30 to 90 words did best, 0.25% vs 0.20% (**measured**, vendor, `socialinsider-captions-2026`).
- **CTA:** "link in bio". `firstComment` adds detail such as requirements, never the hashtag block.
- **Avoid:** #reels, #explore, reposted clips (`original-voice`, `ig-originality-2022`).

**Facebook Reels and feed**
- **Reels:** fill `title`. A 255-char limit is unverified (`ayrshare-char-limits`). 30 to 60 words did best (0.28% vs 0.15% under 30), and posts with links did 0.05% or less (**measured**, vendor, `socialinsider-captions-2026`).
- **Spam rules:** long distracting captions, piles of hashtags, or text unrelated to the video get the post shown to followers only (**official**, `meta-spam-2025`). Use 0 to 2 hashtags.
- **Links:** go in `firstComment` (`fb-links-comments-gamble`, `fb-link-limit-test-2025`).
- **Feed posts:** 2 to 4 plain lines with the video uploaded natively. "We filmed this" signals original content (**official**, `meta-original-2026`).

**LinkedIn**
- **Limits:** 3,000 chars (**official**, `li-post-help`). The fold is about 140 chars on mobile (unverified), so line 1 must stand alone.
- **Angle:** builder or industry. Name the thing plainly, for example "OB:MP, our multiplayer mod for Oblivion Remastered", because the feed model reads topic (`li-feed-eng-2026`).
- **Length:** video posts engaged at 4.2 to 4.5% at any length (**measured**, vendor, `socialinsider-captions-2026`).
- **Hashtags:** 0 to 3. There is no official number.
- **Links:** in `firstComment` by default. The studies conflict (`ordinal-li-links`).
- **Avoid:** "Agree?", "Comment X below", one-word-per-line posts (`smt-li-feed-2026`, `sel-li-engagement-bait-2022`).

**X**
- **Limits:** 280, or 25,000 on Premium. Every URL counts as 23 and every emoji as 2 (**official**, `x-counting-chars`).
- **Structure:** the fact first, in one or two sentences, with the video uploaded natively. On long length, write 3 to 5 posts in `thread`, each one making sense alone.
- **Links:** non-Premium link posts had 0% median engagement (**measured**, vendor, 18.8M posts, `buffer-x-links-2025`). X says links aren't deboosted (`x-bier-links-2025`). Keep links out of the post. X has no `firstComment` field, so put "reply to your post with the docs link" in `notes`.
- **Hashtags:** 0 to 1 (`musk-hashtags-2024`).
- **Avoid:** link-only posts (link cards show no headline, `techcrunch-x-link-cards-2023`), hashtag strings.

**Threads**
- **Limits:** 500 chars and one topic tag per post (**official**, `threads-api-posts`). So `hashtags` holds at most 1.
- **Tone:** conversational. End on something people can honestly answer: replying to comments lifted Threads engagement by 42% (**measured**, vendor, `buffer-engagement-2026`).
- **Links:** go in `firstComment`. Links aren't downranked, but they get little lift (`threads-links-mosseri`).

**Bluesky**
- **Limits:** 300 graphemes, and the appended hashtags count (**official**, `bsky-post-lexicon`).
- **Links:** fine in the body, because Bluesky doesn't de-promote links (`bsky-referrals-2025`). Keep URLs short.
- **Hashtags and keywords:** 0 to 2 hashtags. Write the keyword in plain text too, because custom feeds and search match words (`bsky-custom-feeds-2023`, `bsky-search-tips-2024`).
- **Tone:** plain or technical.

## Pre-flight checklist

- [ ] The transcript was read, and every fact, number, version and time in the copy is in the video.
- [ ] 3 options per platform, from 3 angle families, with `angle`, `why` and `rules` filled.
- [ ] YouTube titles are at most 100 chars, with game plus keyword plus payoff in the first ~50, and no question at the end.
- [ ] `text` plus hashtags is under the panel limit. On X, URLs count 23 and emoji count 2.
- [ ] No hashtags inside `text`. Hashtag count is within both the platform max and the panel parameter.
- [ ] `tags` only on YouTube, each at most 100 chars, 500 in total. `firstComment` only on YouTube, Instagram, Facebook, LinkedIn and Threads. `thread` only on X, Threads and Bluesky, and only when length needs it.
- [ ] The `obmp-readym-content-kit` skill and `/publish/knowledge` were read. Every link, invite, handle, version and product fact is copied from there or from the video. Missing links are left out and named in `notes`, never guessed or left as placeholders.
- [ ] Kit section 0 holds: no "Steam only" gating, no Xbox "coming soon", no Never claim or Internal only items. No non-affiliation line on any platform.
- [ ] Links follow the playbook for each platform.
- [ ] Zero U+2014 and U+2013 characters. Zero banned words. At most one question opener per platform.
- [ ] Short-form and feed options open on the moment, not a feature list. The full game name and "multiplayer" are in the title or first line. One true candor line where it fits. No date, build or "Part x/y" template.
- [ ] One CTA per post, and every link is one Msk can check resolves today.
- [ ] Merged into copy.json, `requestId` copied, valid JSON, 2-space indent, trailing newline.
- [ ] Read each option aloud. Would one of us post it from our own account?

## Worked examples: OB:MP server tutorial

The facts used here (the .NET runtime, the admin panel, joining from the launcher) come from the brief. Check each one against the transcript before reusing anything. Links come from the content kit (`known-links-only`).

**YouTube, angle `outcome`** (rules: `yt-front-load`, `search-words-first`, `honest-promise`, `yt-chapters`, `known-links-only`)

Title (66 chars): `Host Your Own Oblivion Remastered Multiplayer Server | OB:MP Guide`

```
How to host your own OB:MP server for Oblivion Remastered: install the .NET 10 runtime, start the server, set it up in the admin panel, then join from the ReadyM Launcher.

We build OB:MP at ReadyM. This is the setup we run ourselves, start to finish.

Chapters
00:00 What you need
[mm:ss from transcript] Install the .NET runtime
[mm:ss from transcript] Start the server
[mm:ss from transcript] Admin panel walkthrough
[mm:ss from transcript] Join from the launcher

Server guide: https://docs.ready.mp/oblivion-mp/docs/Server/installation
ReadyM Launcher: https://portal.ready.mp
Discord: https://discord.gg/obmp
```

- hashtags: `#OblivionRemastered`, `#OBMP`, `#OblivionMultiplayer`
- tags: oblivion remastered multiplayer, oblivion remastered server, obmp, oblivionmp, oblivion multiplayer mod, oblivion remaster dedicated server
- firstComment: `Stuck on a step? Post the step and the error you see, and we'll help. Server guide: https://docs.ready.mp/oblivion-mp/docs/Server/installation`
- The other two options: `builder` ("We Built Oblivion Multiplayer. Here's How to Host It", 52 chars) and `proof` (an admin panel tour title).

**TikTok, angle `play-together`** (rules: `caption-length-fit`, `say-it-on-screen`, `hashtags-few-relevant`)

```
Your own Oblivion Remastered multiplayer server. Install .NET 10, start the server, set it up in the admin panel, join from the ReadyM Launcher. Full walkthrough on our YouTube.
```

That is 27 words. hashtags: `#OblivionRemastered`, `#OBMP`, `#PCGaming`. In `notes`, tell the user to keep "Oblivion Remastered multiplayer" in the on-screen text and the voiceover.

**X, angle `builder`** (rules: `links-out-of-body`, `specific-over-generic`, `house-voice`)

```
We made a full walkthrough for hosting your own OB:MP server for Oblivion Remastered: .NET runtime, admin panel, then the launcher to join. Video below. Docs are in the reply.
```

That is 175 chars, with no hashtags and the video uploaded natively. `notes`: "Reply to your own post with the docs link; X has no first comment field."
