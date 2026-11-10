# Thumbnail taste: references and teardowns

Companion to `SKILL.md` and `rules.json` (same ids). Compiled 2026-11-08.

## Method

- Studies and official docs were opened and read. Items marked 'seen in results' were only seen in search results, so their claims are second hand.
- Examples: 37 YouTube thumbnails across Oblivion Remastered, Skyrim multiplayer, game server tutorials, FiveM / GTA RP and Black Myth: Wukong. Each was viewed at hqdefault size.
- Views were fetched on 2026-11-08. Outlier ratio = views / median views of the channel's latest ~30 uploads, also fetched that day. This is a proxy: it flatters tiny channels (Goldie, Corukai, All Things Hosting) and drifts for old videos. Where a channel's recent median is unusually small the ratio is flagged as unreliable.
- 'Measured' means numbers from a study or official doc. 'Observed' means our read of the examples.

## Sources

### Studies

- **`vidiq-2026-study`**: [YouTube Thumbnail Study: What 500 Breakout Thumbnails Reveal (vidIQ Research)](https://vidiq.com/research/youtube-thumbnail-study/) (2026). Measured. 500 breakout videos, 30 niches, 10K+ sub channels, month to 30 Jun 2026. Faces in 69% (80% of top 50), high contrast 56%, face or high contrast 89%. 72% had overlay text, median 5 words; 28% no text, 52% used 0 to 3 words. Exaggerated expressions only 5%. Descriptive, no control group.
- **`eden-507k-2026`**: [What makes a good YouTube thumbnail? We analyzed 507,478 videos (Eden)](https://eden.so/blog/what-makes-a-good-youtube-thumbnail/) (2026). Measured. 2,960 thumbnails, breakout (2x+ channel baseline) vs underperformer, Aug 2025 to Aug 2026. Faces 84.2% vs 82.2% (noise). 4 to 6 words 30.6% vs 26.5% (largest gap); 7+ words 29.6% vs 31.1%. Text repeating the title verbatim 6.3% vs 6.8%. Brightness, contrast, saturation, warm share: no difference. Drawn arrows/circles 41.8% vs 38.1%. Observational, no gaming split. Author in page metadata not verified.
- **`etra-2018-eyetracking`**: [YouTube thumbnail and title attention, eye tracking (ETRA 2018, Yangandul, Paryani, Le, Jain)](https://zenodo.org/records/3754785/files/2018_ETRA_youtube_attention-5pages-websitepreprint.pdf) (2018). Academic eye-tracking study coding fixations on thumbnail vs title while people browse for videos: both are read together. Older than 2023, small lab sample.

### Official docs

- **`yt-ab-test-help`**: [Test titles and thumbnails (YouTube Help)](https://support.google.com/youtube/answer/16391400) (2025). Official. Up to 3 titles, thumbnails or combinations. Winner picked on watch time share, not CTR. Results: Winner, Performed same, Inconclusive. Page undated, read Nov 2026.
- **`yt-test-compare-help`**: [Test & compare thumbnails (YouTube Help)](https://support.google.com/youtube/answer/13861714) (2025). Official. Up to 3 thumbnails, judged on watch time share. Very similar variants take longer or end without a winner. Desktop Studio, not for Shorts. Page undated, read Nov 2026.
- **`google-vertical-safe-zone`**: [About video ad specs: vertical video safe zone (Google Ads Help)](https://support.google.com/google-ads/answer/9128498) (2025). Official SVG for 1080x1920 Shorts placements: keep clear 288 px top, 672 px bottom, 48 px left, 192 px right. Playback UI, so it matters for the first frame more than for a cover.
- **`tiktok-infeed-safe-zone`**: [In-Feed Ads specifications and safe zone files (TikTok Ads Help)](https://ads.tiktok.com/help/article/tiktok-auction-in-feed-ads?lang=en) (2026). Official 720x1280 safe zone template, scaled to 1080x1920: about 240 top, 660 bottom, 120 each side; action rail inside the right margin from y 840. Playback UI.
- **`meta-reels-ads-guide`**: [Instagram Reels ads guide (Meta)](https://www.facebook.com/business/ads-guide/update/video/instagram-reels) (2026). Official: leave 14% top (about 269 px), 35% bottom (672 px) and 6% each side (65 px) free of text and logos. Playback UI.

### Articles and tools

- **`sej-1of10-faces-2025`**: [Do Faces Help YouTube Thumbnails? Here's What The Data Says (Search Engine Journal, on 1of10 data)](https://www.searchenginejournal.com/do-faces-help-youtube-thumbnails-heres-what-the-data-says/563944/) (2025). Measured (second hand). 1of10 analysis of 300K+ viral 2025 videos using outlier score (views / channel median). Faces and no faces perform similarly overall, vary by niche; multiple faces beat a single face; a face helped only above an unstated channel size. No gaming numbers reported.
- **`mrbeast-guide-tubefilter`**: [MrBeast internal production guide leaked: key points (Tubefilter)](https://www.tubefilter.com/2024/09/17/mrbeast-internal-production-guide-leaked-key-points/amp/) (2024). Coverage of the same guide: CTR, average view duration and average view percentage as the core metrics. Seen in search results; leaked source.
- **`outlierkit-gaming-case`**: [How a Gaming Channel Grew from 5K to 50K Subscribers in 6 Months (OutlierKit)](https://outlierkit.com/resources/gaming-channel-growth-case-study) (2025). Single vendor case study: thumbnail redesign (game art, reaction face, 2 to 3 words) took CTR from 4.2% to 7.8% in 6 weeks. Unverified, one channel, year not confirmed. Seen in search results.
- **`ppcland-shorts-thumbs-2026`**: [YouTube ends 2-year wait for Shorts thumbnails but blocks A/B testing (PPC Land)](https://ppc.land/youtube-ends-2-year-wait-for-shorts-thumbnails-but-blocks-a-b-testing/) (2026). Custom Shorts thumbnails from 25 Jul 2026 (desktop upload). Shown on the homepage and channel Shorts tab, not in the Shorts feed. No A/B testing for Shorts. Says the usable area is 'closer to 3:2' (unclear, unverified).
- **`socialync-safe-zones`**: [Safe zones tool (Socialync)](https://www.socialync.io/tools/safe-zones) (2026). Tabulates Shorts 288/672/48/192 and TikTok 240/660/120/120 for 1080x1920; measured the TikTok rail as 180 px wide from y 840 off TikTok's file (their measurement, not TikTok's). Read 11 Oct 2026.
- **`buffer-ig-grid-2025`**: [Instagram's grid change (Buffer)](https://buffer.com/resources/instagram-grid/) (2025). Feb 2025: posts preview at 1080x1350 (4:5), Reels at 1080x1440 (3:4) in the grid; some users still see the square grid, so keep key elements in the centre 1080x1080.
- **`designsensory-safe-zones`**: [Social media safe zones (Design Sensory)](https://designsensory.com/insights/social-media-safe-zone/) (2025). Seen in results while checking the TikTok profile grid crop. Sources disagree (centred 1:1 vs about 3:4) and one suggests keeping key elements between about 22% and 75% of the height. Which page said what was not verified; treat the TikTok grid crop as uncertain.
- **`techcrunch-x-link-cards-2023`**: [X cuts headlines from link previews (TechCrunch, 5 Oct 2023)](https://techcrunch.com/2023/10/05/x-cuts-headlines-from-link-previews-as-musk-wants-users-posting-directly-on-the-platform) (2023). Link cards on X show only the image with a small domain label bottom left; no headline. Position of the label in px is observed, not documented.

### Creator and vendor notes

- **`oneof10-trends-2026`**: [YouTube Thumbnail Trends 2026 (1of10 blog)](https://1of10.com/blog/youtube-thumbnail-trends-2026/) (2026). Vendor opinion with few numbers. Judges thumbnails at about 120 px wide, says winning palettes use about 3 colours and that gaming outliers often carry no text. No sample sizes: treat as observed, not measured.
- **`mrbeast-guide-willison`**: [How to succeed in MrBeast production (Simon Willison's notes on the leaked guide)](https://simonwillison.net/2024/Sep/15/how-to-succeed-in-mrbeast-production/) (2024). Quotes the guide: CTR 'dictates what we do for videos'; 'I Spent 50 Hours In Ketchup' beats 'In My Front Yard'. Title and thumbnail set the expectation; a mismatch hurts retention. Leaked document, authenticity not officially confirmed.
- **`galloway-colin-samir`**: [The new rules of YouTube from Paddy Galloway (Colin and Samir)](https://www.colinandsamir.com/resources/the-new-rules-of-youtube-from-paddy-galloway) (2024). Packaging first: the idea and its title/thumbnail decide the video. Seen in search results only; no gaming CTR numbers found from Galloway. Year uncertain.

## Example teardowns

Format: views, outlier ratio vs channel median, what the thumbnail does, and what we take from it.

### Oblivion Remastered

- **`ex-vress-20things`**: [20 Essential Things You Should Do First in Oblivion Remastered](https://www.youtube.com/watch?v=dn1LIKycook), Vress Games. 604,072 views, about 4.8x. Thumbnail: https://i.ytimg.com/vi/dn1LIKycook/hqdefault.jpg
  - Imperative headline (DO THESE 20 THINGS FIRST) on one side, character on the other.
  - A number makes the payoff concrete.
- **`ex-spiffing-newgod`**: [Oblivion Remastered is A PERFECTLY BALANCED GAME WITH NO EXPLOITS - Making A New God](https://www.youtube.com/watch?v=Pa-SVe0nrMk), The Spiffing Brit. 6,030,210 views, about 3.5x. Thumbnail: https://i.ytimg.com/vi/Pa-SVe0nrMk/hqdefault.jpg
  - Flat colour field, one character, a recurring series wordmark.
  - Two-word label (NEW GOD) carries the twist.
- **`ex-spiffing-infinite`**: [OBLIVION REMASTERED IS A PERFECTLY BALANCED GAME - Infinite Stats Is 100% Developer Approved](https://www.youtube.com/watch?v=EgUStQLgIYs), The Spiffing Brit. 1,831,333 views, about 1.1x. Thumbnail: https://i.ytimg.com/vi/EgUStQLgIYs/hqdefault.jpg
  - Three faces plus fire: busier, and it lands at the channel's usual level.
- **`ex-penguinz0-real`**: [Can't Believe Oblivion Remastered is Real](https://www.youtube.com/watch?v=h7IMqWXgbJg), penguinz0. 2,180,952 views, about 1.0x. Thumbnail: https://i.ytimg.com/vi/h7IMqWXgbJg/hqdefault.jpg
  - No text, one funny NPC face filling the frame: the moment is the hook.
- **`ex-nerbit-fists`**: [Can You Beat Oblivion: Remastered With Only Your Fists?](https://www.youtube.com/watch?v=tNzykKNeEsQ), Nerbit. 916,929 views, about 2.5x. Thumbnail: https://i.ytimg.com/vi/tNzykKNeEsQ/hqdefault.jpg
  - Illustrated, game logo as anchor, one short question in gold serif.
- **`ex-tizzy-100days`**: [I Spent 100 Days In Oblivion Remastered Becoming A Stealth Archer (Oblivion Movie)](https://www.youtube.com/watch?v=vB5yexIlf38), Tizzy. 306,190 views, about 1.1x. Thumbnail: https://i.ytimg.com/vi/vB5yexIlf38/hqdefault.jpg
  - DAY 1 vs DAY 100 split: a familiar format, average result.
- **`ex-antikleaper-drugs`**: [I Ruined Oblivion Remastered with Drugs](https://www.youtube.com/watch?v=jdQQbgzsKTE), Anti-Kleaper. 1,716,810 views, about 2.3x. Thumbnail: https://i.ytimg.com/vi/jdQQbgzsKTE/hqdefault.jpg
  - Uses the game's own UI line (You are now addicted) as the text: in-world copy reads as authentic.
- **`ex-generalsam-thief`**: [THIEF GUY 2 (Oblivion Remastered)](https://www.youtube.com/watch?v=XQ7RGFwzNhU), General Sam. 1,336,656 views, about 1.7x. Thumbnail: https://i.ytimg.com/vi/XQ7RGFwzNhU/hqdefault.jpg
  - In-game scene plus a cream serif title: story framing, no shouting.
- **`ex-toasty-faithful`**: [The Oblivion Remaster Isn't Faithful. You Just Can't Tell.](https://www.youtube.com/watch?v=EQwpxOdd7Ts), Toasty Gaming. 17,885 views, about 0.4x. Thumbnail: https://i.ytimg.com/vi/EQwpxOdd7Ts/hqdefault.jpg
  - Quote text that needs context to make sense; weak at small size.
- **`ex-upisnotjump-nightmare`**: [Oblivion Remastered Is An Absolute Nightmare - This Is Why](https://www.youtube.com/watch?v=6hhQk_Ri7Co), UpIsNotJump. 869,735 views, about 1.1x. Thumbnail: https://i.ytimg.com/vi/6hhQk_Ri7Co/hqdefault.jpg
  - Long sentence repeating the title: works only on the creator's brand.
- **`ex-juicehead-15features`**: [15 Secret Features Oblivion Remastered Never Tells You About](https://www.youtube.com/watch?v=DeHtNIKQC-Y), JuiceHead. 888,650 views, about 4.1x. Thumbnail: https://i.ytimg.com/vi/DeHtNIKQC-Y/hqdefault.jpg
  - Logo, character and Oblivion gate anchor the game; one black bar with a number promise.
- **`ex-gameranx-beforeyoubuy`**: [Elder Scrolls Oblivion Remastered - Before You Buy](https://www.youtube.com/watch?v=r3nG5qSRw64), gameranx. 2,790,125 views, about 3.9x. Thumbnail: https://i.ytimg.com/vi/r3nG5qSRw64/hqdefault.jpg
  - Clean character render on white with a grey series label: a recognisable series frame.

### Skyrim multiplayer

- **`ex-dunderheads-howto`**: [How To Play Skyrim Multiplayer! (Skyrim Together)](https://www.youtube.com/watch?v=dTFSeF2XnGQ), DunderHeads. 251,534 views, about 6.4x. Thumbnail: https://i.ytimg.com/vi/dTFSeF2XnGQ/hqdefault.jpg
  - Two Dragonborn from behind tagged P1 (red) and P2 (blue), dragon above, no headline.
  - The picture alone says 'Skyrim, with a friend'.
- **`ex-dunderheads-fantastic`**: [Skyrim Multiplayer is...FANTASTIC! (Skyrim Together)](https://www.youtube.com/watch?v=tKailfV62OA), DunderHeads. 106,645 views, about 2.7x. Thumbnail: https://i.ytimg.com/vi/tKailfV62OA/hqdefault.jpg
  - Three characters fleeing together, no text: a shared moment sells co-op.
- **`ex-spiffing-vs11`**: [The Spiffing Brit VS 11 Skyrim Pro Youtubers - Skyrim Multiplayer Is Perfectly Balanced](https://www.youtube.com/watch?v=1qqhU1HcS4g), The Spiffing Brit. 3,309,008 views, about 1.9x. Thumbnail: https://i.ytimg.com/vi/1qqhU1HcS4g/hqdefault.jpg
  - A crowd of player avatars plus SKYRIM HUNGER GAMES: scale of the lobby is the hook.
- **`ex-goldie-skyrim`**: [*Skyrim* Wasn't Meant To Be Played Alone](https://www.youtube.com/watch?v=FnV0LIObVyk), Goldie. 282,965 views, about 380x. Thumbnail: https://i.ytimg.com/vi/FnV0LIObVyk/hqdefault.jpg
  - Three pets as players with name tags plus the Skyrim logo.
  - Outlier figure is extreme because the channel is tiny (about 2.7K subs).
- **`ex-nickypoo-busted`**: [Skyrim Together is BUSTED and I love it](https://www.youtube.com/watch?v=FeOf9GYEmhg), Nickypoo. 821 views, about 0.6x. Thumbnail: https://i.ytimg.com/vi/FeOf9GYEmhg/hqdefault.jpg
  - Logo over a dim, low contrast snow scene: nothing to look at.
- **`ex-spiffing-hunted`**: [Skyrim Speedrunner VS 4 Hunters - Skyrim Hunted 1](https://www.youtube.com/watch?v=hDJFsBbtqmY), The Spiffing Brit. 7,629,717 views, about 4.5x. Thumbnail: https://i.ytimg.com/vi/hDJFsBbtqmY/hqdefault.jpg
  - Huge 4 VS 1 behind one runner and four hunters with glow outlines: the setup in one glance.
- **`ex-corukai-skyrimtogether`**: [How to play Skyrim Together Reborn in 1 Minute (2026)](https://www.youtube.com/watch?v=Lpdt474o7Sg), Corukai. 118,067 views, about 2.4x. Thumbnail: https://i.ytimg.com/vi/Lpdt474o7Sg/hqdefault.jpg
  - Plain white 'Setup in 1 Minute' over scenery: the time promise does the work.
  - Channel had about 480 subs: treat as an anomaly.

### Game server tutorials

- **`ex-troublechute-palworld`**: [Palworld Steam Dedicated Server Setup | Host a FREE Private Server | Full Guide](https://www.youtube.com/watch?v=7Erzg2HcBHI), TroubleChute. 468,427 views, about 23.4x. Thumbnail: https://i.ytimg.com/vi/7Erzg2HcBHI/hqdefault.jpg
  - Framed card with Steam and Palworld logos, DEDICATED SERVER in an accent colour, STEAM GUIDE label.
  - Same frame as the channel's other server guides.
- **`ex-xielent-palworld`**: [How to Setup a Palworld Dedicated Server in 5 Minutes (Easy Tutorial)](https://www.youtube.com/watch?v=FxUURNZ_hp0), Xielent. 54,354 views, about 6.5x. Thumbnail: https://i.ytimg.com/vi/FxUURNZ_hp0/hqdefault.jpg
  - Game logo plus SETUP DEDICATED SERVER IN 5 MINUTES with the time in yellow.
- **`ex-doopa-palworld`**: [How To Make a Palworld Dedicated Server (2026 Setup Guide)](https://www.youtube.com/watch?v=7rnrq30TwO4), Doopa. 4,692 views, about 0.6x. Thumbnail: https://i.ytimg.com/vi/7rnrq30TwO4/hqdefault.jpg
  - Mascot with question marks and host logos: no promise, unclear subject.
- **`ex-troublechute-valheim`**: [Valheim Dedicated Server Setup | Host a FREE private server](https://www.youtube.com/watch?v=upEhacdqMLw), TroubleChute. 533,606 views, about 26.7x. Thumbnail: https://i.ytimg.com/vi/upEhacdqMLw/hqdefault.jpg
  - Same framed series look, orange border, Valheim logo, SERVER SETUP GUIDE +PORT FORWARDING with one word in red.
- **`ex-allthingshosting-valheim`**: [How to Host a FREE Valheim Dedicated Server (2026) | Step-by-Step Steam + Crossplay](https://www.youtube.com/watch?v=5kmN5kj0zrk), All Things Hosting. 61,524 views, about 25.6x. Thumbnail: https://i.ytimg.com/vi/5kmN5kj0zrk/hqdefault.jpg
  - Viking on the left, huge FREE VALHEIM SERVER on the right, small green 2026 tag.
  - About 1.1K subs: the price promise outperformed the channel 25x.
- **`ex-sebatron-alwayson`**: [Finally, a Dedicated Valheim Server for You and Your Friends](https://www.youtube.com/watch?v=wRI8o0cVn-0), Sebatron. 3,527 views, about 0.6x. Thumbnail: https://i.ytimg.com/vi/wRI8o0cVn-0/hqdefault.jpg
  - Hosting-brand UI mockup with four separate text blocks: too much to read at 168 px.
- **`ex-mratomicduck-zomboid`**: [How To Host Multiplayer Servers For Project Zomboid - A Guide To Dedicated Servers & More!](https://www.youtube.com/watch?v=-12EW8vxwLA), MrAtomicDuck. 207,611 views, about 2.2x. Thumbnail: https://i.ytimg.com/vi/-12EW8vxwLA/hqdefault.jpg
  - Mascot at a laptop plus SERVER SETUP GUIDE: channel character as the face.
- **`ex-hardwarehaven-anygame`**: [Hosting Your Game Servers is EASY with This](https://www.youtube.com/watch?v=Zda-nIrvyGQ), Hardware Haven. 666,871 views, about 2.0x. Thumbnail: https://i.ytimg.com/vi/Zda-nIrvyGQ/hqdefault.jpg
  - 'run any game server' with ANY accented, a wall of game logos and the hardware: breadth as the hook.
- **`ex-viralkingdom-avoid`**: [Why You SHOULDN'T Host Your Own Dedicated Server in Palworld](https://www.youtube.com/watch?v=v-Z_k5Xv-PU), Viral Kingdom. 2,342 views, about 0.5x. Thumbnail: https://i.ytimg.com/vi/v-Z_k5Xv-PU/hqdefault.jpg
  - AVOID THIS bar, a prohibition sign and a three-item bullet list: a slide, not a thumbnail.

### FiveM and GTA RP

- **`ex-highwaytrooper-fivem`**: [How to Make a FiveM Server in 2026! (UPDATED) | FREE](https://www.youtube.com/watch?v=NjVwsBinE10), HighwayTrooper. 84,364 views, about 3.4x. Thumbnail: https://i.ytimg.com/vi/NjVwsBinE10/hqdefault.jpg
  - MAKE A FIVEM SERVER stacked huge with the FiveM logo; year as a tiny tag.
- **`ex-highwaytrooper-claude`**: [I Asked Claude AI To Make Me A FiveM Server... CRAZY!](https://www.youtube.com/watch?v=siAXZDt-lIs), HighwayTrooper. 818,296 views, about 32.7x. Thumbnail: https://i.ytimg.com/vi/siAXZDt-lIs/hqdefault.jpg
  - Prompt box, one arrow, the finished server dashboard: before and after of the outcome.
  - Text FULL SERVER BY AI adds the result the title only teases.
- **`ex-kingfancy-gtarp`**: [How to Start GTA RP in 2026 (FiveM Beginner Guide + Best Server!)](https://www.youtube.com/watch?v=t5NulYIlCXE), King Fancy. 64,165 views, about 4.4x. Thumbnail: https://i.ytimg.com/vi/t5NulYIlCXE/hqdefault.jpg
  - Before/after split: broke character, arrow, rich character. BEGINNERS GUIDE on top.
- **`ex-guiderealm-fivem`**: [How To Make A FiveM Server - Quick Guide](https://www.youtube.com/watch?v=OslaiuwtVSI), GuideRealm. 95,559 views, about 86.9x. Thumbnail: https://i.ytimg.com/vi/OslaiuwtVSI/hqdefault.jpg
  - FiveM logo, arrow, players icon: 'make a server, get players' as a diagram.
  - Big channel with a tiny recent median: ratio is unreliable.

### Black Myth: Wukong

- **`ex-asmongold-wukong`**: [Black Myth Wukong's Ending Changed My Life](https://www.youtube.com/watch?v=d1hUDjMxLZg), Asmongold TV. 1,618,768 views, about 1.3x. Thumbnail: https://i.ytimg.com/vi/d1hUDjMxLZg/hqdefault.jpg
  - Creator reaction face next to the Destined One's glowing eyes: works on creator brand.
- **`ex-zanny-wukong`**: [Babe wake up, Black Myth: Wukong is peak](https://www.youtube.com/watch?v=H31RI_qlL3w), zanny. 2,565,026 views, about 2.2x. Thumbnail: https://i.ytimg.com/vi/H31RI_qlL3w/hqdefault.jpg
  - Hero render plus the game logo, no other text: the game is the hook.
- **`ex-cupppajoe-wukong`**: [I Finally Tried Black Myth Wukong BLIND.. It Took YEARS off my life](https://www.youtube.com/watch?v=3FTLVAHma5o), CupppaJoe+. 61,746 views, about 0.3x. Thumbnail: https://i.ytimg.com/vi/3FTLVAHma5o/hqdefault.jpg
  - Scenic back shot with a big 2026: the year says nothing about the video.
- **`ex-arktix-wukong`**: [ESSENTIAL Tips I Wish I Knew Sooner - Black Myth Wukong](https://www.youtube.com/watch?v=YKjYAsWsNvw), Arktix. 1,320,174 views, about 19.6x. Thumbnail: https://i.ytimg.com/vi/YKjYAsWsNvw/hqdefault.jpg
  - Handwritten I WISH I KNEW... beside a fiery action pose; strong subject, two colour text.
- **`ex-optimistichuman-wukong`**: [Black Myth Wukong Platinum is harder than every Dark Souls game](https://www.youtube.com/watch?v=HtzHN9fB-Bo), Optimistic Human. 1,162,067 views, about 5.7x. Thumbnail: https://i.ytimg.com/vi/HtzHN9fB-Bo/hqdefault.jpg
  - Destined One holding the platinum trophy next to the creator's deadpan face, no text.

## Patterns across the examples (observed)

- Server tutorials that beat their channel by 6x to 33x all pair a game anchor (logo or art) with one outcome phrase: FREE, IN 5 MINUTES, FULL SERVER, MAKE A FIVEM SERVER. The three under 1x either crowd in text (`ex-viralkingdom-avoid`, `ex-sebatron-alwayson`) or give no promise (`ex-doopa-palworld`).
- Multiplayer winners show the players together and mark them apart: P1/P2 (`ex-dunderheads-howto`), name tags (`ex-goldie-skyrim`), glow outlines and 4 VS 1 (`ex-spiffing-hunted`). The weak Skyrim Together example shows no players at all (`ex-nickypoo-busted`).
- No-text thumbnails win when the picture is the joke or the game is the hook (`ex-penguinz0-real`, `ex-zanny-wukong`, `ex-optimistichuman-wukong`, `ex-dunderheads-fantastic`).
- Big creators' results (Spiffing, penguinz0, Asmongold, UpIsNotJump) lean on channel brand, so their thumbnails are weaker evidence for a small channel than the small-channel outliers.

## Not verified

- TikTok profile grid crop (square vs about 3:4) and the exact px of grid view counts on TikTok and Instagram.
- Position and size of the Shorts shelf title overlay, and PPC Land's claim that the usable Shorts thumbnail area is 'closer to 3:2'.
- X link card domain label size in px, and whether the 1.91:1 crop applies to every client.
- Instagram 3:4 grid tiles for regular posts (Buffer says posts preview at 4:5).
- OutlierKit case study year and data. Eden study author (page metadata names one, not confirmed). The authenticity of the leaked MrBeast guide.
- No published gaming-specific CTR numbers from Paddy Galloway were found.
- The ship threshold (27 of 36) and the colour check values in `rules.json` are house choices, not research results.
