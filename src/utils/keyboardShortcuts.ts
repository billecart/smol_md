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
  | "zoomReset";

type ShortcutEvent = Pick<
  KeyboardEvent,
  "code" | "ctrlKey" | "metaKey" | "shiftKey"
>;

export function getShortcutAction(event: ShortcutEvent): ShortcutAction | null {
  if (!event.ctrlKey && !event.metaKey) {
    return null;
  }

  switch (event.code) {
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
