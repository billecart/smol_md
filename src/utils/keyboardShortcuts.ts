export type ShortcutAction =
  | "new"
  | "open"
  | "save"
  | "saveAs"
  | "toggleSource"
  | "closeTab"
  | "closeWindow"
  | "find";

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
    default:
      return null;
  }
}
