// OB:MP ornaments as inline SVG: fern bands, gold rule, bronze cap, emblems (game-icons.net, CC BY 3.0).
import React from "react";
import { CAP, EMBLEMS, FERN_H, MEDALLION, RULE } from "./orn";
import { DIAMOND, DISCORD } from "./social";
import { GAME_ICONS } from "./emblems";

// Fern frond band (orn-fern-h, 96x36 tile) repeated along a strip. Vertical strips rotate the tile like orn-fern-v.
export const FernBand = ({ id, width, height, vertical = false }: { id: string; width: number; height: number; vertical?: boolean;
}) => {
  const t = vertical ? width : height; // band thickness
  const tile = (96 * t) / 36;
  return (<svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0, display: "block" }}>
      <defs>
        <pattern
          id={id}
          patternUnits="userSpaceOnUse"
          width={vertical ? t : tile}
          height={vertical ? tile : t}
          patternTransform={vertical ? `translate(${t} 0) rotate(90)` : undefined}
        >
          <g transform={`scale(${t / 36})`} dangerouslySetInnerHTML={{ __html: FERN_H }} />
        </pattern>
      </defs>
      <rect width={width} height={height} fill={`url(#${id})`} />
    </svg>);
};

// Gold rule with two curls and a diamond (orn-rule, 300x40)
export const RuleMark = ({ width = 225, height = 30 }: { width?: number; height?: number;
}) => (<svg width={width} height={height} viewBox="0 0 300 40" fill="none" stroke="#c9b68e" strokeWidth={2} strokeLinecap="round" style={{ display: "block" }} dangerouslySetInnerHTML={{ __html: RULE }} />);

// Bronze cap that sits on top of a slab (orn-cap, 800x44). Gradient ids are scoped per instance.
export const CapMark = ({ id, width }: { id: string; width: number;
}) => (<svg
    width={width}
    height={(width * 44) / 800}
    viewBox="0 0 800 44"
    style={{ display: "block", filter: "drop-shadow(0 6px 6px rgba(0,0,0,.6))" }}
    dangerouslySetInnerHTML={{ __html: CAP.replace(/id='(b|v|m)'/g, `id='${id}-$1'`).replace(/url\(#(b|v|m)\)/g, `url(#${id}-$1)`) }}
  />);

// Default OB:MP emblems: game-icons.net silhouettes shared with the CyroEngine design system (see ./emblems).
// Color comes from currentColor, so set it on the parent like the rest of the ornaments.
export type EmblemName = keyof typeof GAME_ICONS;

export const Emblem = ({ name, size = 48, color = "currentColor", shadow = true }: { name: EmblemName; size?: number; color?: string; shadow?: boolean;
}) => (<svg
    width={size}
    height={size}
    viewBox="0 0 512 512"
    style={{ display: "block", overflow: "visible", filter: shadow ? "drop-shadow(0 3px 4px rgba(0,0,0,.7))" : undefined }}
  >
    <path d={GAME_ICONS[name]} fill={color} />
  </svg>);

// Earlier hand-drawn line emblems, kept for reference
export type LineEmblemName = keyof typeof EMBLEMS;

export const LineEmblem = ({ name, size = 48, color = "currentColor" }: { name: LineEmblemName; size?: number; color?: string;
}) => (<svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    stroke={color}
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: "block" }}
    dangerouslySetInnerHTML={{ __html: EMBLEMS[name] }}
  />);

// Centered flourish: the gold rule flanked by fading hairlines (.obmp-flourish__rule)
export const CenterRule = ({ width = 560 }: { width?: number;
}) => (<div style={{ position: "relative", width, height: 30 }}>
    <div style={{ position: "absolute", left: 0, top: 15, width: (width - 225) / 2 + 13, height: 1.2, background: "linear-gradient(270deg, #cbb68c, transparent)" }} />
    <div style={{ position: "absolute", left: (width - 225) / 2, top: 0 }}>
      <RuleMark />
    </div>
    <div style={{ position: "absolute", right: 0, top: 15, width: (width - 225) / 2 + 13, height: 1.2, background: "linear-gradient(90deg, #cbb68c, transparent)" }} />
  </div>);

// Social medallion (.obmp-social__icon): gold ring with the platform glyph inside
export const DiscordMedallion = ({ size = 46, ring = "#cbb68c", glyph = "#ece6da" }: { size?: number; ring?: string; glyph?: string;
}) => (<div style={{ position: "relative", width: size, height: size, flex: "none" }}>
    <svg width={size} height={size} viewBox="0 0 48 48" stroke={ring} fill={ring} style={{ position: "absolute", inset: 0 }} dangerouslySetInnerHTML={{ __html: MEDALLION }} />
    <svg width={size} height={size} viewBox="0 0 48 48" fill={glyph} style={{ position: "absolute", inset: 0 }} dangerouslySetInnerHTML={{ __html: DISCORD }} />
  </div>);

// Gold diamond bullet (orn-diamond)
export const Diamond = ({ size = 14 }: { size?: number;
}) => (<svg width={size} height={size} viewBox="0 0 16 16" style={{ display: "block", flex: "none" }} dangerouslySetInnerHTML={{ __html: DIAMOND }} />);
export const RuleMarkKinoEdit = ({
  width = 225,
  height = 30
}: {
  width?: number;
  height?: number;
}) => <></>;
export const RuleMarkKinoEdit2 = ({
  width = 225,
  height = 30
}: {
  width?: number;
  height?: number;
}) => <></>;
export const RuleMarkKinoEdit3 = ({
  width = 225,
  height = 30
}: {
  width?: number;
  height?: number;
}) => <></>;
export const RuleMarkKinoEdit4 = ({
  width = 225,
  height = 30
}: {
  width?: number;
  height?: number;
}) => <></>;
export const RuleMarkKinoEdit5 = ({
  width = 225,
  height = 30
}: {
  width?: number;
  height?: number;
}) => <></>;