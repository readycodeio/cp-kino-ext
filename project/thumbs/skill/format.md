# Thumbnail file formats

Two project files drive the Thumbnails panel and `thumbs/ThumbArt.tsx`:

- `/thumbs/designs.json` (version 2): the designs. Read it, then write it.
- `/thumbs/brand.json` (version 1): the brand kit the designs are drawn with. It may not exist. Then a neutral kit is used.

`thumbs/model.ts` and `thumbs/ui/brand.ts` are the source of truth. Their normalizers fill defaults and clamp ranges, so a missing field never breaks rendering. Unknown fields are dropped the next time the panel saves.

## Rules for agents

- **Do what the request lists.** A panel request names the design ids to change in place, or the set to add to. Change nothing else.
- **Changing a design in place.** Keep its `id`. Keep the `id` of every element you do not replace. Change only the fields the request needs. The panel merges your write with the user's unsaved edits by design id and element id, so a field you leave alone keeps the user's value.
- **Adding designs.** Append them to the end of `designs`. Never delete or reorder existing designs.
- **Unique ids.** Use 8 lowercase letters or digits for every new design and every new element, for example `k3x9q2mf`. Never reuse an id that is already in the file.
- **Set.** `set` groups designs in the panel strip. Use the set name from the request.
- **Prompt.** Put the user's brief in `prompt` of a design you create. Put the recipe id from rules.json in `recipe` when you used one.
- **Keep the rest.** Do not touch `chatId` or `videoTitle` unless asked.
- **Read before you write.** Read the current file right before writing it, and write it in one pass. Keep it valid JSON, indented with tabs.
- **Follow the brand kit.** Leave `font` and color fields out (or use the color tokens below) so a design follows the kit. Set them only when a design needs something else.

## designs.json

```json
{ "version": 2, "videoTitle": "The title viewers read next to the thumbnail", "chatId": "...", "designs": [ Design, ... ] }
```

### Design

| field | type | notes |
|---|---|---|
| id | string | unique |
| name | string | short label, e.g. "B · Before and after" |
| set | string | group name |
| preset | `youtube` \| `vertical` \| `instagram` \| `square` \| `x` | sets the frame size, see Presets |
| prompt | string? | the brief it came from |
| recipe | string? | rules.json recipe id, or a built-in layout: `hero`, `brand`, `card` |
| background | Background | |
| elements | El[] | painted in order: later elements sit on top |

### Background

| field | range | notes |
|---|---|---|
| src | string | an image key from the brand kit (`images[].key`), a Kino library media id you checked with findMedia and lookAtFrames, or `""` for no image |
| focusX, focusY | 0 to 100 | crop focus in % of the image |
| zoom | 1 to 3 | |
| blur | 0 to 40 | px |
| dim | 0 to 0.95 | darkens the image |
| shade | `none` `vignette` `top` `bottom` `left` `right` `topBottom` | gradient that darkens where the words sit |
| shadeAmount | 0 to 1 | |
| saturate | 0 to 2 | default 1.08 |
| contrast | 0.5 to 1.6 | default 1 |
| flip | bool? | mirror the image left to right |
| tint, tintAmount | color?, 0 to 1 | a color wash over the image |
| color, color2 | color? | the fill when `src` is empty: `color` alone is flat, with `color2` it is a diagonal gradient. Default: the kit's `page` color |
| shadeColor | color? | color of the shade gradient. Default: the kit's `page` color |

### Colors

Every color field takes a brand token or any CSS color (`#rrggbb`, `rgba(...)`, `transparent`).

Tokens: `page` `text` `body` `muted` `accent` `accentAlt` `onAccent` `ink` `panel` `success` `warning` `danger`. A token follows the brand kit when its colors change, so prefer tokens to hex values.

A color field you leave out uses the element's default, listed below.

### Fonts

`font` is a font id, or left out (or `""`) for the kit's font for that role.

Built-in ids: `anton` `bebas` `archivo` `fira` `montserrat` `poppins` `inter` `oswald` `condensed` `bangers` `playfair` `marker`. The kit can add its own under `fonts.custom`; use their `id`.

Roles: headlines use the kit's `fonts.headline`, text and badges `fonts.text`, card titles and the wordmark `fonts.display`. An id that is neither built in nor in the kit falls back to the role's font.

### Units and placement

- **x, y:** where the element's anchor point sits, in % of frame width and height.
- **anchor:** which point of the element is placed there. One of `tl tc tr cl c cr bl bc br`. For example, `tc` at x 50, y 22 centers the element horizontally with its top edge at 22% of the height.
- **w:** % of frame width. For text it is the maximum width: text shrinks to fit inside it, it does not wrap. For boxes (logo, card, image, shape, rule, arrow) it is the width.
- **size:** font or icon px on a frame whose short side is 1080. So the same number reads the same on every preset.
- **Common fields:**
  - `rotate`: degrees, -360 to 360.
  - `opacity`: 0 to 1.
  - `visible`: false hides the element.
  - `locked`: true keeps it from being picked or moved in the panel preview.
  - `name`: a label shown in the panel's layer list.

### Elements

All elements have `id, type, x, y, anchor, w`.

| type | fields |
|---|---|
| headline | `text` (use `\|` for line breaks), `accent` (the word or words drawn in the accent color), `font?`, `treatment` (`outline` `shadow` `box` `plain` `neon`), `size` (8 to 600), `color?` (default `text`), `accentColor?` (default `accent`). Fine control, all optional: `weight` (100 to 900, the nearest weight the font has is used), `upper` (bool, default is the font's own), `tracking` (em, -0.1 to 1), `lineHeight` (0.6 to 2.5), `align` (`start` `center` `end`, default follows the anchor), `stroke` (outline width as a share of the font size, 0 to 0.3), `strokeColor` (default `ink`), `shadow` (0 to 2, 1 is the treatment's own), `boxColor` (the `box` treatment's fill), `glowColor` (the `neon` treatment's glow) |
| text | `text` (`\|` breaks), `font?`, `weight` (100 to 900), `size` (6 to 400), `upper` (bool), `tracking` (em, -0.1 to 1), `color?` (default `muted`). Optional: `lineHeight`, `align`, `stroke`, `strokeColor`, `shadow` as for headline |
| badge | `text`, `size` (8 to 300), `fill?` (default `accent`), `color?` (default `onAccent`). Optional: `font`, `weight` (default 800), `tracking` (default 0.06), `upper` (default true), `radius` (0 to 1, 1 is a pill) |
| logo | `glow` (0 to 1). Draws the kit's logo, or the brand name as a wordmark when the kit has no logo image. `w` sets its size. Optional: `glowColor` (default `accent`), `src` (an image key or media id to draw instead of the kit's logo) |
| card | an info card: `label` (a short line in color, e.g. "LIVE NOW"), `labelColor` (a color, default `success`), `title` (the large line), `detail` (a line under it), `dot` (bool, a glowing dot before the label), `icon` (an icon name before the detail, or `""`). Empty lines are left out. Optional: `titleFont` |
| rule | a divider; `w` is its length. Optional: `color` (default `muted`), `thickness` (px at 1080, 1 to 60, default 3), `plain` (true draws a plain line even when the kit has a divider ornament) |
| emblem | an icon: `icon` (a name from the list below), `size`, `color?` (default `muted`) |
| image | `src` (image key or library media id), `h?` (% of frame height; left out keeps the image ratio), `fit` (`cover` or `contain`), `border` (bool), `shadow` (bool). Optional: `radius` (0 to 50, % of the width; 50 is a circle on a square image), `borderColor`, `borderWidth` (px at 1080, default 4), `focusX`, `focusY` (0 to 100, crop focus when `h` is set), `flip` |
| shape | `shape` (`rect` or `ellipse`), `h` (% of frame height), `fill?` (default `accent`; `transparent` for an outline only), `radius` (corner px at 1080, rect only), `borderWidth` (px at 1080, 0 for none), `borderColor?` (default `text`), `shadow` (bool) |
| arrow | `color?` (default `accent`), `strokeColor?` (default `ink`); point it with `rotate` (0 points right, 90 down) |
| stack | `gap` (px at 1080), `align` (`start` `center` `end`), `children` (El[], no nested stacks). Children ignore their own x, y and anchor and flow top to bottom. |

Use a stack when words and a badge or logo should stay together as one block. That way the block moves and scales as one, and the panel can still edit each child.

Built-in icon names: `star` `heart` `check` `cross` `plus` `play` `bolt` `flame` `trophy` `like` `person` `group` `clock` `eye` `lock` `warning` `question` `money` `pin` `gamepad`. The kit can add its own under `icons`. An unknown name draws `star`.

Files written by earlier versions still load: a card's `status`, `statusColor`, `server`, `players` and `playersLabel` are read as `label`, `labelColor`, `title` and `detail`, and a yes/no card `icon` becomes `group`. Write the current names.

### Presets and safe areas

Keep every word, number, the info card and the logo inside the safe rect (frame px). rules.json `platforms` lists the zones and why.

| preset | frame | safe rect (x, y, w, h) | notes |
|---|---|---|---|
| youtube | 1920 x 1080 | 120, 60, 1680, 780 | duration badge sits bottom right, keep it empty |
| vertical | 1080 x 1920 | 192, 420, 696, 828 | Shorts, TikTok and Reels cover. Center on x 50. Keep the lower right corner (x > 780, y > 840) free of words. |
| instagram | 1080 x 1350 | 80, 160, 920, 1030 | feed 4:5, grid shows a centered crop |
| square | 1080 x 1080 | 150, 80, 780, 920 | 1:1 posts and covers; a 3:4 grid tile trims the sides |
| x | 1600 x 900 | 100, 60, 1400, 690 | domain label sits bottom left on link cards |

In % of the frame, which is what x, y and w use:

- **youtube:** x 6.25 to 93.75, y 5.6 to 77.8.
- **vertical:** x 17.8 to 82.2, y 21.9 to 65.
- **instagram:** x 7.4 to 92.6, y 11.9 to 88.1.
- **square:** x 13.9 to 86.1, y 7.4 to 92.6.
- **x:** x 6.25 to 93.75, y 6.7 to 83.3.

### Recipe tokens

Recipes in rules.json can use these tokens in text fields. The panel's Apply layout button fills them in from the current design:

- `{title}`, `{accent}`, `{badge}`, `{eyebrow}`: the headline, its accent words, the first badge and the first text line. An empty one gets placeholder words, so the element stays visible.
- A card in a recipe always gets the current design's own `label`, `title` and `detail`, whatever the recipe wrote there. `{label}`, `{cardTitle}` and `{detail}` name them (`{status}`, `{server}` and `{players}` are older names for the same three).
- Words written out in a recipe (a tag such as "A") are kept as they are.

A recipe's `background` gives framing only: the panel keeps the design's own `src`. When you write a design yourself, write the final words, not tokens.

### Example

```json
{
	"id": "q7m2c9xa",
	"name": "A · Promise",
	"set": "Studio guide",
	"preset": "youtube",
	"prompt": "A home studio for under $100, the finished desk on the right",
	"recipe": "promise-anchor",
	"background": { "src": "desk", "focusX": 68, "focusY": 40, "zoom": 1.15, "blur": 4, "dim": 0.3, "shade": "left", "shadeAmount": 0.85 },
	"elements": [
		{ "id": "h4k8s1za", "type": "stack", "x": 7, "y": 40, "anchor": "cl", "w": 52, "gap": 24, "align": "start", "children": [
			{ "id": "p0d3n6wb", "type": "headline", "x": 0, "y": 0, "anchor": "tl", "w": 52, "text": "Studio for|under $100", "accent": "$100", "treatment": "shadow", "size": 170 },
			{ "id": "f2r5t8yc", "type": "badge", "x": 0, "y": 0, "anchor": "tl", "w": 20, "text": "5 MIN", "size": 56 }
		] },
		{ "id": "l9v1j4ud", "type": "logo", "x": 7, "y": 74, "anchor": "bl", "w": 16, "glow": 0.3 }
	]
}
```

Here `"src": "desk"` is an image key from this project's brand kit. Use a library media id when the kit has no fitting image.

## brand.json

The kit every design in the project is drawn with. The panel's Brand tab edits the name, logo, images, colors and the three font roles. Custom fonts, icons, the divider ornament and swatches are edited in the file. Every field is optional: what is left out uses the neutral default.

```json
{
	"version": 1,
	"name": "Channel or product name",
	"colors": {
		"page": "#101114",
		"text": "#ffffff",
		"body": "#e5e7eb",
		"muted": "#cbd5e1",
		"accent": "#ffd60a",
		"accentAlt": "#ffe45c",
		"onAccent": "#111111",
		"ink": "#0a0a0a",
		"panel": "#111318",
		"panelGlow": "",
		"success": "#4ade80",
		"warning": "#fbbf24",
		"danger": "#ef4444"
	},
	"swatches": [ { "label": "Sky", "value": "#38bdf8" } ],
	"fonts": {
		"headline": "anton",
		"text": "inter",
		"display": "anton",
		"custom": [
			{ "id": "house", "label": "House Serif", "family": "House Serif", "url": "https://example.com/fonts/house-serif.woff2", "format": "woff2", "weights": [400, 700], "fallback": "Georgia, serif", "upper": false, "tracking": 0, "lineHeight": 1 }
		]
	},
	"logo": { "media": "<library media id>" },
	"images": [ { "key": "desk", "label": "Finished desk", "media": "<library media id>" } ],
	"icons": { "leaf": { "d": "<svg path data>", "box": 24 } },
	"divider": { "w": 300, "h": 40, "paths": [ { "d": "<svg path data>", "stroke": "#cbd5e1", "strokeWidth": 2 } ] }
}
```

| field | notes |
|---|---|
| name | shown in the feed previews, and drawn as a wordmark by the logo element when there is no logo image |
| colors | what the tokens resolve to. `page`: the canvas and the shade gradients. `text`: headlines and card titles. `body`: secondary light text. `muted`: small text, icons, dividers, frames. `accent`: accent words, badges, arrows, logo glow. `accentAlt`: the accent inside a `box` headline. `onAccent`: text on the accent. `ink`: outlines. `panel`: fill of text boxes and the info card. `panelGlow`: inner glow of the info card, `""` for none. `success` `warning` `danger`: label colors. Use hex colors: glows and veils are made by adding transparency to them |
| swatches | extra colors offered in the panel's color pickers, up to 16 |
| fonts.headline, fonts.text, fonts.display | a built-in font id or the id of a custom font |
| fonts.custom | your own font files. `url` must be https and allow cross-origin use. `family` is the CSS family name. `weights` lists the weights the file covers (two or more for a variable font). `upper`, `tracking` and `lineHeight` are its headline defaults. `id` is what designs put in `font` |
| logo.media | library media id of the logo, best as a PNG with a transparent background |
| images | named images for backgrounds and image elements. `key` is what designs put in `src` (lowercase letters, digits, dashes); `media` is a library media id. Keep a key stable once designs use it |
| icons | extra icons by name: `d` is SVG path data, `box` the size of its square viewBox (default 24). A name that matches a built-in icon replaces it |
| divider | an ornament for the rule element, drawn 30 px tall between two fading hairlines. `w` and `h` are its viewBox; each path takes `d` and optional `fill`, `stroke`, `strokeWidth`, `opacity`, `transform`. Left out, the rule is a plain fading line |

When you write brand.json: keep what is there, change only what was asked, and use media ids you checked with findMedia and lookAtFrames.
