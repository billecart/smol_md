export type ShortcutAction =
  | "new"
  | "open"
  | "save"
  | "saveAs"
  | "toggleSource"
  | "closeTab"
  | "closeWindow"
  | "find"
  | "zoomIn"
  | "zoomOut"
  | "zoomReset"
  | "nextTab"
  | "previousTab";

type ShortcutEvent = Pick<
  KeyboardEvent,
  "code" | "ctrlKey" | "metaKey" | "shiftKey"
>;

export function getShortcutAction(
  event: ShortcutEvent,
  isMac = false,
): ShortcutAction | null {
  if (!event.ctrlKey && !event.metaKey) {
    return null;
  }

  // Ctrl plus the key under Esc cycles tabs on macOS, where Cmd is the
  // primary modifier and so Cmd+` keeps toggling Source mode. On Apple ISO
  // keyboards that key is §± and WebKit reports it as IntlBackslash (the
  // two codes are swapped there), so both are accepted. Elsewhere Ctrl is
  // the primary modifier and Ctrl+` stays the Source toggle.
  if (
    isMac &&
    event.ctrlKey &&
    !event.metaKey &&
    (event.code === "Backquote" || event.code === "IntlBackslash")
  ) {
    return event.shiftKey ? "previousTab" : "nextTab";
  }

  // Ctrl+Tab is the browser/Windows convention; Cmd+Shift+] / [ is the
  // macOS one (Safari, Finder, Terminal). Both cycle through open tabs.
  if (event.code === "Tab" && event.ctrlKey) {
    return event.shiftKey ? "previousTab" : "nextTab";
  }

  switch (event.code) {
    case "BracketRight":
      return event.shiftKey ? "nextTab" : null;
    case "BracketLeft":
      return event.shiftKey ? "previousTab" : null;
    case "KeyN":
      return "new";
    case "KeyO":
      return "open";
    case "KeyS":
      return event.shiftKey ? "saveAs" : "save";
    case "Backquote":
      return "toggleSource";
    case "KeyW":
      return event.shiftKey ? "closeWindow" : "closeTab";
    case "KeyF":
      return "find";
    case "Equal":
    case "NumpadAdd":
      return "zoomIn";
    case "Minus":
    case "NumpadSubtract":
      return "zoomOut";
    case "Digit0":
    case "Numpad0":
      return "zoomReset";
    default:
      return null;
  }
}
