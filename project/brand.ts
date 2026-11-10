// OB:MP design system v3, taken 1:1 from https://obmp.readym.io (tokens.css, obmp.css), 2026-10-26.
// Dark world behind veiled UI, Kingthings Petrock headings, Fira Sans text, square corners, ember accent.
import type { CSSProperties } from "react";
import { loadFont } from "@remotion/fonts";
import { loadFont as loadFira } from "@remotion/google-fonts/FiraSans";
import { loadFont as loadJetBrains } from "@remotion/google-fonts/JetBrainsMono";

loadFont({ family: "Kingthings Petrock", url: "https://fonts.cdnfonts.com/s/241/Kingthings_Petrock.woff", weight: "400" });
loadFont({ family: "Kingthings Petrock", url: "https://fonts.cdnfonts.com/s/241/Kingthings_Petrock_light.woff", weight: "300" });
const fira = loadFira("normal", { weights: ["400", "600", "700"], subsets: ["latin"] });
const mono = loadJetBrains("normal", { weights: ["400", "700"], subsets: ["latin"] });

export const fonts = {
  display: `"Kingthings Petrock", "Palatino Linotype", Georgia, serif`,
  text: `${fira.fontFamily}, "Segoe UI", system-ui, sans-serif`,
  mono: `${mono.fontFamily}, ui-monospace, monospace`,
};

// tokens.css :root, verbatim
export const c = {
  page: "#0d0b09",
  surface: "#17130f",
  surfaceRaised: "#241e18",
  veil: "#0f0c09c4",
  fg: "#ece6da",
  fgHeading: "#f6f1e7",
  fgMuted: "#a99f91",
  fgFaint: "#8c8478",
  rule: "#cbb68c",
  frame: "#6a3f1d",
  metal: "#d4b55e",
  accent: "#ff8a1f",
  accentHover: "#e06a00",
  accentLift: "#ffa045",
  onAccent: "#2b241e",
  paper: "#e9dcbc",
  paperInk: "#2e2219",
  paperHeading: "#6e2d14",
  paperLabel: "#2d4396",
  paperMuted: "#665443",
  marker: "#a8191c",
  success: "#6cc070",
  warning: "#e3b341",
  error: "#d7223f",
};

export const shadow = {
  panel: "0 24px 48px -12px rgba(0,0,0,.7), 0 2px 0 rgba(0,0,0,.5)",
  burn: "inset 0 0 64px rgba(112,72,24,.42), inset 0 0 6px rgba(80,50,15,.5)",
  text: "0 1px 2px rgba(0,0,0,.8)",
};

// Type scale (.obmp-display, .obmp-title, ...)
export const type: Record<string, CSSProperties> = {
  display: { fontFamily: fonts.display, fontSize: 84, lineHeight: 1, fontWeight: 400 },
  title: { fontFamily: fonts.display, fontSize: 52, lineHeight: 1.05, fontWeight: 400 },
  heading: { fontFamily: fonts.display, fontSize: 34, lineHeight: 1.15, fontWeight: 400 },
  entry: { fontFamily: fonts.display, fontSize: 27, lineHeight: 1.2, fontWeight: 300 },
  menu: { fontFamily: fonts.display, fontSize: 24, lineHeight: 1, fontWeight: 400 },
  lead: { fontFamily: fonts.text, fontSize: 22, lineHeight: 1.5, fontWeight: 600 },
  label: { fontFamily: fonts.text, fontSize: 19, lineHeight: 1.3, fontWeight: 600 },
  value: { fontFamily: fonts.text, fontSize: 19, lineHeight: 1.3, fontWeight: 700 },
  body: { fontFamily: fonts.text, fontSize: 18, lineHeight: 1.6, fontWeight: 400 },
  small: { fontFamily: fonts.text, fontSize: 15, lineHeight: 1.5, fontWeight: 400 },
};

export const media = {
  logo: "kino:d33465ca-dbfd-4edc-8219-efed993c8c14", // OB:MP forged logo, transparent
  readym: "kino:fbb3c3a4-2553-4050-8a69-5e8f9493513d", // {readyM} lockup
  keyart: "kino:157e250d-0e50-4718-a50c-e7490c5ee11c", // hero key art, Oblivion gate
  bridge: "kino:0ebec19d-58a8-452d-bde1-ed6e12976f00", // five players on a bridge
  tower: "kino:066d753d-4ba9-49d6-a531-1ece9640627e", // White-Gold Tower
  rumare: "kino:f470154f-4891-4c84-94d9-ef08704b57ad", // Lake Rumare
  parchment: "kino:baf13c65-8b12-4a07-a3ec-4ed52ad317ba", // orn-parchment-grain
  leather: "kino:d6e4bf3a-812d-4c6a-95ca-b58efbfd7fec", // orn-leather-grain
  music: "kino:5b9f94fe-6f78-4576-9f86-f45072ef6118",
  score: "kino:51ec22be-7bf9-46ea-965c-ff80101b555e", // music re-cut to 96s, downbeats on scene cuts
  launcherIcon: "kino:190f77c4-bcd2-42d3-ba91-f19084c49eb1", // real ReadyM Launcher app icon, {rM} on black sand
  wallpaper: "kino:abcd4758-f49d-4827-a4db-cb0c8bd6542f", // Windows 11 Bloom-style dark wallpaper, 2880x1620
};

// Real captures from this PC, 1600x900 CSS at 2x
export const shots = {
  docsTop: "kino:8dacce5e-4b2e-4f21-bfcc-0437183b48e5",
  docsDownloads: "kino:d84efdb6-339d-48bb-b75c-c25ee8b8080a",
  docsConfig: "kino:e7796df0-74f4-4f96-b67b-66d8f9ae94ec",
  docsFirstLaunch: "kino:fb385207-7af4-445c-b4e3-97d1d81b324d",
  // dotnet.microsoft.com/en-us/download/dotnet/10.0, 2x, scrollY 0 to 992 in one strip (1600x1892 CSS), Feedback tab hidden
  dotnetStrip: "kino:92374a15-1a72-4a65-9ac0-a1fae7a35092",
  dotnetThanks: "kino:7b1c7784-73db-4186-916b-a4987c20a68e",
  adminSetup: "kino:971c2b39-9a58-4ccc-8bf1-e788c154164c",
  adminPin: "kino:a12391e8-877a-4afb-9a01-5a0205e7a734",
  adminLogin: "kino:c8143a08-5fa4-46b9-a843-4794224c6181",
  adminTerminal: "kino:047cedcc-0492-4763-849b-2cabc951fece",
  adminPlayers: "kino:e69a3cdf-4f15-4c7f-bef1-a5f66868c72c",
  adminMods: "kino:6e09ce78-5b7b-4bb2-8c58-e98d9d86b8a7",
  // ReadyM Launcher 0.34.0 window captures (title bar included) for a 1364x940 window; Direct connect kept at full 3743px for the zoom
  launcherHome: "kino:d38a413c-6b3f-457d-9cd4-938e5a7db11a",
  launcherServers: "kino:84ed0c26-c2ed-429c-9b3c-da5c483b737f",
  launcherDirect: "kino:647b858f-e8bc-420b-b4d2-9d3632f9c680",
};
