---
name: post-copy
description: Write titles, descriptions and captions for a video on YouTube, TikTok, Instagram, Facebook, LinkedIn, X, Threads and Bluesky, from the transcript, in the brand voice set in /publish/knowledge, into /publish/copy.json.
---

# Post copy

Companion files: `rules.json` (the same rules, machine-readable, same ids), `references.md` (sources), `format.md` (the copy.json format; read it, never edit it). Sources compiled 2026-11-08, updated 2026-11-19.

## Skill and knowledge

This skill covers writing craft and platform mechanics for any brand. Everything about one brand lives in `/publish/knowledge/README.md`, which the user fills in: who "we" are, voice and tone, banned words, punctuation, names, product facts, links, handles, claims never to make, extra skills to load and any rewrite pass.

1. Read `/publish/knowledge/README.md` before anything else, plus any file it points to.
2. Load every agent skill it names under "Skills to load". If one is not installed, write from the README and the video, and say so in `notes`.
3. Ignore lines that start with `Example:`. They are template placeholders. An empty section means the brand has not said, so use this skill's defaults. If the README is missing or empty, write in the plain default voice below and say so in `notes` and in your reply.

Order of authority:

1. The honesty rules and hard platform limits in this skill and `format.md`. Nothing overrides them.
2. The knowledge README and the skills it names: voice, words, punctuation, names, facts, links, the "never claim" list.
3. The craft defaults in this skill.

Evidence labels: **measured** = a number from a study, with sample and source id. **Official** = a platform statement without numbers. **Observed** = a pattern in real posts. **Unverified** = no public source, so test it against your own analytics. Vendor studies show correlation, not cause.

## Core philosophy

1. **Title and thumbnail are one unit** (`title-thumb-unit`). People read the two together (`etra-2018-eyetracking`). The thumbnail carries the picture and a few words. The title carries the search words and the promise. Don't repeat the thumbnail text: only 6.3% of breakout videos do (**measured**, `eden-507k-2026`). If a thumbnail has been picked, look at it before you write a title.
2. **The honest promise** (`honest-promise`). YouTube A/B tests choose the winner on watch time share, not clicks (**official**, `yt-ab-test-help`). Titles that mislead to get clicks break YouTube's spam policy (**official**, `yt-spam-policy`). A title that gets the click and loses the viewer loses twice (`mrbeast-guide-willison`, leaked). Promise only what the video shows.
3. **Search words, then hook.** Platforms read the text to work out what a video is about:
   - YouTube: pick 1 to 2 main words and use them in the title and the first lines of the description (**official**, `yt-description-tips`).
   - TikTok: reads the caption, the voiceover and the on-screen text, and flags stuffing (**official**, `tiktok-ca-search`).
   - LinkedIn: its feed model reads what a post is about (**official**, `li-feed-eng-2026`).

   Tutorials get searched, so lead with the words people type (`search-words-first`), and use the name newcomers search for, not only your own product name (`full-name-plus-category`, **unverified**). Short-form and feed posts get browsed, so lead with the hook and put the keyword second. Across 18,080 channels, search content did best with the keyword in the first 40% of the title, while browse content did best leading with the hook (**measured**, vendor, `air-titles-2026`).
4. **Specific beats clever** (`specific-over-generic`).
   - In 4M+ uploads from 2026, titles ending in a question averaged 0.82x, plain how-to titles 1.07x, and specific story frames did best (**measured**, vendor, `vidiq-title-formulas-2026`).
   - 'How to' titles had a median of 1.60x channel baseline vs 0.99x for other titles (1,794 videos). The authors credit search intent, not the phrase (**measured**, vendor, `overseeros-howto-2026`).
   - Use how-to wording when people search for the task (`how-to-for-search`). Write statements, not questions (`statement-over-question`).

## Voice (`house-voice`)

The knowledge README sets the voice. Where it is silent, write plainly, the way the person who made the thing would explain it to a customer. The defaults:

- **One real detail per option:** a step, a screen, a part, a version or a number taken from the video.
- **Plain verbs.** Contractions are fine. Write numbers as digits. Use one "!" per option at most.
- **No hype stacks:** one intensifier at most. ALL CAPS only for a single word in a hype-tone YouTube title.
- **No emoji walls.** Emoji never replace words.
- **Openers:** across the 3 options, at most one starts with a question. Never open with "Hey guys" or "In this video".
- **Claims:** no "easy", "fast", "free" or "in X minutes" unless the runtime and the transcript prove it.
- **State it, don't stage it.** Write the fact or the moment. Cut "it's not X, it's Y", a question you answer in the next line, three fragments in a row for rhythm, and a last line that repeats the post as a moral. A hook stays when it states the moment ("20 hard stops down Mill Hill"). Rewrite it when it withholds the moment ("Wait until you see what happens on Mill Hill").
- **Marketing filler:** `rules.json` > `voice.banned` holds a short default list (revolutionary, game-changer, thrilled to announce, next level and similar). The README's own list adds to it.

| Before | After |
|---|---|
| Take your braking to the next level with our groundbreaking pad swap guide! | Swap the disc brake pads on a Trail 2 in 5 steps. You need a 5 mm hex key and pliers. |
| We're thrilled to announce our revolutionary new tutorial. | New guide: replacing disc brake pads, from pulling the pin to bedding the pads in. |

**Rewrite pass** (`rewrite-pass`). If the README names a rewrite or style pass, run it on every `title`, `text`, `firstComment` and `thread` post, and on the prose in `why` and `notes`, before you write copy.json. Save the final text only, with no change list. The pass never adds a fact: fix a vague line with a fact from the fact list, or cut the line. Leave `hashtags`, `tags`, links, handles, product names, chapter lines and words quoted from the video as they are.

## Read the video first

1. Pull the transcript: `getEffectiveTranscript` on the project, or `readVideo` on the media id. Write copy only after reading it.
2. Make a fact list:
   - what the viewer has at the end
   - the steps, in order
   - the names of screens, parts and tools
   - every version, number and requirement shown
   - the runtime

   Only facts on this list or in knowledge can appear in copy (`honest-promise`).
3. Note the exact words the speaker uses. They are the words TikTok and YouTube hear, so reuse them in the caption (`say-it-on-screen`).
4. Chapters come from transcript timestamps (`yt-chapters`). Rules: 00:00 first, at least 3, ascending, each at least 10 seconds (**official**, `yt-chapters-help`). If the timings are unreliable, leave a placeholder and say so in `notes`.
5. Read the existing `/publish/copy.json`. Merge into it, copy the `requestId`, and keep the platforms the request didn't name.

## Facts and links (`known-links-only`)

The video tells you what this one post is about. Everything around it (what the product is, what it needs, where the docs live, the handles) comes from knowledge, never from memory or a plausible guess.

1. Links, invites, @handles, versions, prices and requirements come only from the knowledge README, the skills it names, the request or the video. Copy them character for character, and prefer the deepest page that fits (the page for this task, not a site root).
2. Write names the way the README writes them.
3. If a link the request asks for is not in those sources, leave it out. Do not write a placeholder like `[docs link]` into `text` or `firstComment`, because the panel posts exactly what is in copy.json. Say which link is missing in `why` and in `notes`.
4. Nothing from the README's "never claim" list, in any field.
5. Facts from knowledge are background. Copy about this video still only promises what this video shows (`honest-promise`).
6. When sources disagree, the newest dated line in the README wins. Say so in `notes`.
7. One CTA per post, with a link that works today (`valid-cta`). List in `notes` every link the user should check before posting.

## Panel parameters

Defaults when a parameter is missing: tone plain, length medium, cta watch, emoji none, humanize 2. A parameter never overrides a hard rule (honesty, platform limits) or the README's "never claim" list.

- **tone**:
  - `plain`: what it is and what you get.
  - `hype`: the energy comes from facts and verbs, not adjectives. Allows one caps word in a YouTube title (positive in the gaming split of `air-titles-2026`, correlational) and one "!".
  - `dry-funny`: one understated line per option about the subject or the work behind it, never at the viewer's expense. Search words still lead on YouTube.
  - `technical`: name the parts exactly as the video shows them (versions, part numbers, settings, file names).
- **length**:
  - `short`: YouTube gets 2 lines plus chapters and links. TikTok under 30 words. Reels about 30 words. X one sentence. LinkedIn under 600 chars.
  - `medium`: YouTube gets 3 short paragraphs plus chapters and links. TikTok 30 to 60 words. Reels and Facebook 30 to 90 words. LinkedIn 600 to 1,300 chars.
  - `long`: YouTube gets a full write-up (requirements, steps, troubleshooting) up to about 2,000 chars. TikTok 90 words at most. LinkedIn up to 3,000. X, Threads and Bluesky become a 3 to 5 post `thread`.
- **cta**:
  - `none`: end on the last fact.
  - `watch`: point to the full video, or on YouTube to the next video.
  - `comment`: one real question a viewer can answer from experience. Never "comment YES" or "agree?" (`no-engagement-bait`).
  - `follow`: give a true reason ("we post every repair guide here").
  - `link`: the link from the request or from knowledge, placed where links work for that platform (see the playbook) (`links-out-of-body`).
  - `community`: the brand's community (a Discord server, forum or newsletter), with a true reason and the invite or link from knowledge. Never invent invites or channel names.
- **keywords**: must-include search words.
  - Put the first one inside the first ~50 chars of the YouTube title, in the first line of every description and caption, and in the advice for on-screen text.
  - Use each keyword once in a title and once or twice in a body. Variants and misspellings go in YouTube `tags`.
- **emoji**:
  - `none`: zero.
  - `light`: at most 1 per option, at a line end, never in a YouTube title.
  - `some`: up to 3 on TikTok, Instagram and Threads; still at most 1 on YouTube, LinkedIn and X. X counts each emoji as 2 chars (**official**, `x-counting-chars`).
- **hashtags** (count): a target, capped by each platform's max in `rules.json`. 0 is valid.
  - Order: most specific first (the product, the task), then at most one broad tag.
  - Never #fyp, #viral, #reels or #explore.
  - Never inline in `text` (`hashtags-few-relevant`).
- **language** (BCP-47): write natively, don't translate English idioms. Keep the proper names from knowledge as they are. Use the local search words for the subject. For non-English Bluesky posts, add a `notes` line telling the user to set the post language.
- **humanize**:
  - `0`: clean neutral copy.
  - `1`: plain voice: contractions, plain verbs.
  - `2`: plus the first person from knowledge ("we" or "I") and one detail only the people who made it would know, taken from the transcript.
  - `3`: plus one honest aside (what was hard, what changed), uneven sentence lengths, fragments are fine. Never fake typos or invent stories.
- **audience**: free text. It sets the reader's vocabulary and what goes up front. Beginners get the outcome and the steps. Experts get exact names and how it works inside. Buyers get the price and what they need. Industry peers get what was built and why, on LinkedIn first.
- **notes**: the user's free text. Follow it. If it conflicts with a hard rule, follow the rule and explain why in that platform's `notes`.

## The three-angle method (`three-real-angles`)

Write exactly 3 options per platform. Each option takes its angle from a different family, so the user gets a real choice and A/B variants that differ in a meaningful way (`yt-ab-test-help`):

- **Search** family: `outcome`, `obstacle` or `speed`. Built from the keywords. Usually option 1 on YouTube, LinkedIn and Bluesky.
- **Browse** family: `moment`, `access`, `proof` or `curiosity`. Hook first. Usually option 1 on TikTok, Reels and X. Prefer `moment` when the clip has one striking moment (`moment-first`), and `access` for a launch, an opening or a deadline (`access-moments`, **unverified**).
- **Voice** family: `builder` or `candid-build`. "We made this, here's how to use it", or "we got this working, here's what's still rough". As specific as the other two, and `candid-build` only when the README's voice allows candor.

Put the angle name in `angle`. Write `why` as one line citing rule ids, and put those ids in `rules`. `speed` and `obstacle` need proof in the transcript. Angle definitions and examples are in `rules.json` > `angles`.

## Per-platform playbook

Panel hard limits count `text` plus the appended hashtags. `rules.json` > `platforms` holds the numbers.

Short-form and feed posts open on the one concrete moment the clip shows, not a feature list (`moment-first`). Don't reuse the same date, version or "Part x/y" line across posts (`no-date-template`).

**YouTube long-form**
- **Limits:** title 100, description 5,000 (**official**, `yt-edit-settings-help`). There is no official truncation length. Keep the subject, the keyword and the payoff in the first ~50 chars (`yt-front-load`).
- **Before truncation:** the title, the first 1 to 2 description lines, and up to 3 hashtags shown above the title (**official**, `yt-description-tips`, `yt-hashtags-help`).
- **Structure:**
  - line 1: what you get, with the keywords
  - line 2: who made it, in one line (`original-voice`)
  - what you need
  - chapters
  - links
- **Hashtags and tags:** 2 to 3 hashtags. `tags` holds 5 to 10 name variants and misspellings. Tags play a minimal role (**official**, `yt-tags-light`, `yt-tags-help`).
- **Freshness:** a version or year tag is common in ranked tutorials (**observed**, one niche, `ex-yt-rockuzza-howto`, `ex-yt-migrate-save`). Use one only when it is true and on screen (`freshness-tag`).
- **CTA and first comment:** CTA after line 2. `firstComment` is the pinned comment: the main link plus a real support prompt (`reply-and-pin`).
- **Avoid:** question-ending titles, stacked brackets (least effective in the gaming split of `air-titles-2026`), keyword lists in the description, emoji in titles.

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
- **Angle:** builder or industry. Name the thing plainly, with its category, for example "the Trail 2, our steel trail bike", because the feed model reads topic (`li-feed-eng-2026`).
- **Length:** video posts engaged at 4.2 to 4.5% at any length (**measured**, vendor, `socialinsider-captions-2026`).
- **Hashtags:** 0 to 3. There is no official number.
- **Links:** in `firstComment` by default. The studies conflict (`ordinal-li-links`).
- **Avoid:** "Agree?", "Comment X below", one-word-per-line posts (`smt-li-feed-2026`, `sel-li-engagement-bait-2022`).

**X**
- **Limits:** 280, or 25,000 on Premium. Every URL counts as 23 and every emoji as 2 (**official**, `x-counting-chars`).
- **Structure:** the fact first, in one or two sentences, with the video uploaded natively. On long length, write 3 to 5 posts in `thread`, each one making sense alone.
- **Links:** non-Premium link posts had 0% median engagement (**measured**, vendor, 18.8M posts, `buffer-x-links-2025`). X says links aren't deboosted (`x-bier-links-2025`). Keep links out of the post. X has no `firstComment` field, so put "reply to your post with the link" in `notes`.
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

- [ ] The knowledge README was read, with every file and skill it names. `Example:` lines were ignored.
- [ ] The transcript was read, and every fact, number, version and time in the copy is in the video or in knowledge.
- [ ] 3 options per platform, from 3 angle families, with `angle`, `why` and `rules` filled.
- [ ] YouTube titles are at most 100 chars, with subject plus keyword plus payoff in the first ~50, and no question at the end.
- [ ] `text` plus hashtags is under the panel limit. On X, URLs count 23 and emoji count 2.
- [ ] No hashtags inside `text`. Hashtag count is within both the platform max and the panel parameter.
- [ ] `tags` only on YouTube, each at most 100 chars, 500 in total. `firstComment` only on YouTube, Instagram, Facebook, LinkedIn and Threads. `thread` only on X, Threads and Bluesky, and only when length needs it.
- [ ] Every link, invite, handle, version and product fact is copied from knowledge, the request or the video. Missing links are left out and named in `notes`, never guessed or left as placeholders.
- [ ] Nothing from the README's "never claim" list. Its words, punctuation and naming rules hold in every field.
- [ ] Links follow the playbook for each platform. One CTA per post.
- [ ] No word from `voice.banned` or the README's list. At most one question opener per platform.
- [ ] Short-form and feed options open on the moment, not a feature list. The searched name is in the title or first line. No reused date, version or "Part x/y" line.
- [ ] The README's rewrite pass, if it names one, ran on every `title`, `text`, `firstComment` and `thread` post, and on `why` and `notes`. No fact was added that isn't on the fact list (`rewrite-pass`).
- [ ] Merged into copy.json, `requestId` copied, valid JSON, 2-space indent, trailing newline.
- [ ] Read each option aloud. Would the brand post it from its own account?

## Worked example: a repair tutorial

Fernhollow Bikes and its Trail 2 are made up. The facts used here (a 5 mm hex key, the retaining pin, FP-22 pads, 20 stops to bed the pads in) stand in for a fact list built from a transcript, and the links stand in for the README's "Links and handles" section (`known-links-only`).

**YouTube, angle `outcome`** (rules: `yt-front-load`, `search-words-first`, `how-to-for-search`, `honest-promise`, `yt-chapters`, `known-links-only`)

Title (54 chars): `How to Replace Disc Brake Pads on a Fernhollow Trail 2`

```
How to replace the disc brake pads on a Fernhollow Trail 2: take the wheel off, pull the retaining pin, slide the old pads out, push the pistons back, fit the new pads, then bed them in with 20 stops.

We build the Trail 2 at Fernhollow. This is how our workshop does the job, start to finish.

You need a 5 mm hex key, needle-nose pliers and a set of FP-22 pads.

Chapters
00:00 What you need
[mm:ss from transcript] Wheel off
[mm:ss from transcript] Pull the pin, old pads out
[mm:ss from transcript] Push the pistons back
[mm:ss from transcript] New pads in
[mm:ss from transcript] Bed them in

Parts list: https://fernhollow.example/trail-2/brake-pads
Manual: https://fernhollow.example/trail-2/manual
```

- hashtags: `#FernhollowTrail2`, `#DiscBrakePads`, `#BikeRepair`
- tags: replace disc brake pads, disc brake pad replacement, fernhollow trail 2, fern hollow trail 2, bike brake pads, fp-22 brake pads
- firstComment: `Stuck on a step? Tell us which one and what you see, and we'll help. Parts list: https://fernhollow.example/trail-2/brake-pads`
- The other two options: `builder` ("We Build the Trail 2. Here's How We Change Its Brake Pads", 57 chars) and `proof` ("Worn Brake Pads vs New, on the Same Hill").

**TikTok, angle `moment`** (rules: `moment-first`, `caption-length-fit`, `say-it-on-screen`, `hashtags-few-relevant`)

```
20 hard stops down Mill Hill to bed in new disc brake pads. Before that: wheel off, pin out, pistons back, pads in. Full walkthrough on our YouTube.
```

That is 28 words. hashtags: `#DiscBrakePads`, `#FernhollowTrail2`, `#BikeRepair`. In `notes`, tell the user to keep "disc brake pads" in the on-screen text and the voiceover.

**X, angle `builder`** (rules: `links-out-of-body`, `specific-over-generic`, `house-voice`)

```
We filmed how our workshop replaces the disc brake pads on a Trail 2: wheel off, pin out, pistons back, new pads in, then 20 stops to bed them in. Video below. Parts list is in the reply.
```

That is 187 chars, with no hashtags and the video uploaded natively. `notes`: "Reply to your own post with the parts list link; X has no first comment field."
