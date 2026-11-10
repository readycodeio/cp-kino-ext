# Design file format (/thumbs/designs.json, version 2)

The Thumbnails panel and `thumbs/ThumbArt.tsx` render this file. `thumbs/model.ts` is the source of truth: `normDesign` and `normEl` fill defaults and clamp ranges, so a missing field never breaks rendering. But write complete, deliberate values.

## Rules for agents

- **Append only.** Add new designs to the end of `designs`. Never delete, reorder or rewrite existing designs unless the user asked you to fix one specific design by id. In that case edit only that design, in place, and keep its id.
- **Unique ids.** Use 8 lowercase letters or digits for every design and every element, for example `k3x9q2mf`. Never reuse an id that is already in the file.
- **Set.** `set` groups designs in the panel strip. Use the set name from the request.
- **Prompt.** Put the user's brief in `prompt`. Put the recipe id from rules.json in `recipe` when you used one.
- **Keep the rest.** Do not touch `chatId` or `videoTitle` unless asked.
- **Valid JSON.** Keep the file valid JSON, indented with tabs.

## Document

```json
{ "version": 2, "videoTitle": "Host your own OB:MP server", "chatId": "...", "designs": [ Design, ... ] }
```

## Design

| field | type | notes |
|---|---|---|
| id | string | unique |
| name | string | short label, e.g. "B · Status card" |
| set | string | group name |
| preset | `youtube` \| `vertical` \| `instagram` \| `x` | sets the frame size, see Presets |
| prompt | string? | the brief it came from |
| recipe | string? | rules.json recipe id |
| background | Background | |
| elements | El[] | painted in order: later elements sit on top |

## Background

| field | range | notes |
|---|---|---|
| src | string | built-in key (`keyart`, `tower`, `bridge`, `rumare`, `wallpaper`) or a Kino library media id you checked with findMedia and lookAtFrames |
| focusX, focusY | 0 to 100 | crop focus in % of the image |
| zoom | 1 to 3 | |
| blur | 0 to 40 | px |
| dim | 0 to 0.95 | black overlay |
| shade | `none` `vignette` `top` `bottom` `left` `right` `topBottom` | gradient that darkens where the words sit |
| shadeAmount | 0 to 1 | |

What the built-in backgrounds show:

- `keyart`: Oblivion gate key art.
- `tower`: players at White-Gold Tower.
- `bridge`: players on a bridge.
- `rumare`: Lake Rumare.
- `wallpaper`: Windows desktop wallpaper.

## Units and placement

- **x, y:** where the element's anchor point sits, in % of frame width and height.
- **anchor:** which point of the element is placed there. One of `tl tc tr cl c cr bl bc br`. For example, `tc` at x 50, y 22 centres the element horizontally with its top edge at 22% of the height.
- **w:** % of frame width. For text it is the maximum width, so text wraps or shrinks inside it. For boxes (logo, card, image, rule, arrow, emblem box) it is the width.
- **size:** font or icon px on a frame whose short side is 1080. So the same number reads the same on every preset.
- **Common fields:**
  - `rotate`: degrees.
  - `opacity`: 0 to 1.
  - `visible`: false hides the element.
  - `name`: a label shown in the panel.

## Elements

All elements have `id, type, x, y, anchor, w`.

| type | fields |
|---|---|
| headline | `text` (use `\|` for line breaks), `accent` (the word or words drawn in the accent colour), `font` (`fira` or `petrock`), `treatment` (`outline` `shadow` `box` `plain`), `size` (8 to 600), `color?`, `accentColor?` |
| text | `text` (`\|` breaks), `font`, `weight` (100 to 900), `size` (6 to 400), `upper` (bool), `tracking` (em, -0.1 to 1), `color?` |
| badge | `text`, `size` (8 to 300), `fill?`, `color?` |
| logo | `glow` (0 to 1). This is the OB:MP logo. `w` sets its size. |
| card | the server status card: `status` (e.g. "SERVER ONLINE"), `statusColor` (`success` `online` `accent` `ember` `warning` `danger` `error` `offline` `muted` or a CSS colour), `server`, `players` (e.g. "5 / 8"), `playersLabel`, `dot` (bool), `icon` (bool) |
| rule | a thin divider; `w` only |
| emblem | `icon` (one of: anvil fellowship compass ruins orb helm quill runner swords spell scroll forest elder-scroll sword shield potion key tower hammer cyrodiil), `size`, `color?` |
| image | `src` (built-in key or library media id), `h?` (% of frame height; defaults to the image ratio), `fit` (`cover` or `contain`), `border`, `shadow` |
| arrow | `color?`; point it with `rotate` (0 points right) |
| stack | `gap` (px at 1080), `align` (`start` `center` `end`), `children` (El[], no nested stacks). Children ignore their own x, y and anchor and flow top to bottom. |

Use a stack when words and a badge or logo should stay together as one block. That way the block moves and scales as one, and the panel can still edit each child.

## Presets and safe areas

Keep every word, number, the status card and the logo inside the safe rect (frame px). rules.json `platforms` lists the zones and why.

| preset | frame | safe rect (x, y, w, h) | notes |
|---|---|---|---|
| youtube | 1920 x 1080 | 120, 60, 1680, 780 | duration badge sits bottom right, keep it empty |
| vertical | 1080 x 1920 | 192, 420, 696, 828 | Shorts, TikTok and Reels cover. Centre on x 50. Keep the lower right corner (x > 780, y > 840) free of words. |
| instagram | 1080 x 1350 | 80, 160, 920, 1030 | feed 4:5, grid shows a centred crop |
| x | 1600 x 900 | 100, 60, 1400, 690 | domain label sits bottom left on link cards |

In % of the frame, which is what x, y and w use:

- **youtube:** x 6.25 to 93.75, y 5.6 to 77.8.
- **vertical:** x 17.8 to 82.2, y 21.9 to 65.
- **instagram:** x 7.4 to 92.6, y 11.9 to 88.1.
- **x:** x 6.25 to 93.75, y 6.7 to 83.3.

## Recipe tokens

Recipes in rules.json can use these tokens in text fields. The panel's Apply recipe button fills them in from the current design:

- `{title}`, `{accent}`, `{badge}`, `{eyebrow}`
- `{status}`, `{server}`, `{players}`

When you write a design yourself, write the final words, not tokens.

## Example

```json
{
	"id": "q7m2c9xa",
	"name": "A · Promise",
	"set": "Server guide",
	"preset": "youtube",
	"prompt": "Host your own server, free, players at the tower",
	"recipe": "promise-anchor",
	"background": { "src": "tower", "focusX": 68, "focusY": 40, "zoom": 1.15, "blur": 4, "dim": 0.3, "shade": "left", "shadeAmount": 0.85 },
	"elements": [
		{ "id": "h4k8s1za", "type": "stack", "x": 7, "y": 40, "anchor": "cl", "w": 52, "gap": 24, "align": "start", "children": [
			{ "id": "p0d3n6wb", "type": "headline", "x": 0, "y": 0, "anchor": "tl", "w": 52, "text": "Your own|server", "accent": "server", "font": "fira", "treatment": "shadow", "size": 170 },
			{ "id": "f2r5t8yc", "type": "badge", "x": 0, "y": 0, "anchor": "tl", "w": 20, "text": "FREE", "size": 56 }
		] },
		{ "id": "l9v1j4ud", "type": "logo", "x": 7, "y": 74, "anchor": "bl", "w": 16, "glow": 0.3 }
	]
}
```
