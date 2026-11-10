// OS-specific words, shortcuts and fonts for the panels. The panels run inside Kino on the same
// machine as the bridge, so the browser's platform is the bridge's platform.
const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & { userAgentData?: { platform?: string } })
const PLATFORM = String(nav?.userAgentData?.platform || nav?.platform || nav?.userAgent || '')

export const IS_MAC = /mac/i.test(PLATFORM)
export const IS_WIN = /win/i.test(PLATFORM)

/** "this Mac" / "this PC", for sentences like "a small bridge on this Mac". */
export const MACHINE = IS_MAC ? 'this Mac' : IS_WIN ? 'this PC' : 'this computer'
/** "your Mac" / "your PC". */
export const YOUR_MACHINE = IS_MAC ? 'your Mac' : IS_WIN ? 'your PC' : 'your computer'
/** Name of the file manager: Finder or Explorer. */
export const FILE_MANAGER = IS_MAC ? 'Finder' : IS_WIN ? 'Explorer' : 'Files'
/** "Show in Finder" / "Show in Explorer". */
export const SHOW_IN = `Show in ${FILE_MANAGER}`
/** Where the pairing dialog appears. */
export const PAIR_DIALOG = IS_WIN ? 'the “Kino bridge” message box (Yes allows it)' : 'the “Kino bridge” dialog'
/** Answer to give in the pairing dialog. */
export const ALLOW = IS_WIN ? 'Yes' : 'Allow'

/** Modifier glyph for shortcut hints: ⌘ on macOS, Ctrl elsewhere. */
export const MOD = IS_MAC ? '⌘' : 'Ctrl+'
export const MOD_ENTER = IS_MAC ? '⌘↩' : 'Ctrl+Enter'
/** True when the platform's primary shortcut modifier is held (Cmd on macOS, Ctrl elsewhere). */
export const modKey = (event: { metaKey: boolean; ctrlKey: boolean }) => (IS_MAC ? event.metaKey : event.ctrlKey)

/** How to start the bridge. Shown when a panel cannot reach it. */
export const START_BRIDGE = 'npm start'
export const START_BRIDGE_HINT = IS_WIN
	? 'In the cp-kino-ext folder, run npm start in PowerShell, or double-click start.cmd.'
	: 'In the cp-kino-ext folder, run npm start in a terminal, or double-click start.command.'
/** Name of the app people usually start the bridge from. */
export const TERMINAL_APP = IS_MAC ? 'Terminal' : IS_WIN ? 'PowerShell' : 'a terminal'

/** How to reach a copied path in the OS file picker. */
export const PICKER_HINT = IS_MAC
	? 'In the picker press ⌘⇧G, then ⌘V and Enter.'
	: 'In the picker paste it into the File name box (Ctrl+V), then press Enter.'
export const PICKER_HINT_SHORT = IS_MAC ? 'Press ⌘⇧G, ⌘V, Enter.' : 'Paste it into File name (Ctrl+V), Enter.'

/** Example absolute path for path inputs. */
export const EXAMPLE_VIDEO_PATH = IS_WIN ? 'C:\\Users\\you\\Videos\\my-video.mp4' : '/Users/you/Movies/my-video.mp4'

// Font stacks that exist on both systems: SF / Segoe UI for text, Menlo / Cascadia Mono / Consolas for code.
export const MONO_FONT = 'ui-monospace, Menlo, Monaco, "Cascadia Mono", "Cascadia Code", Consolas, "Courier New", monospace'
export const UI_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", system-ui, sans-serif'
