// Any edit in Rich mode used to save every tight list as a loose one:
// `- a\n- b` came back as `* a\n\n* b`. Milkdown's commonmark preset stores a
// list's `spread` as the string "false" or "true" when it parses markdown, and
// hands that string straight back to remark when it serializes. The markdown
// writer only reads `spread` when it is a boolean, so a string falls through to
// its default: a blank line between items.
//
// Milkdown's serializer calls remark's stringify directly and never runs remark
// transformers, so the fix has to live in the stringify handlers themselves.
// The bullet marker is handled here too: remark writes `*` unless told
// otherwise, which rewrote every `-` list on the first edit.
//
// This lives in utils rather than the editor because the editor file is not
// compiled by the test runner.

import type { List, ListItem } from "mdast";
import { defaultHandlers } from "mdast-util-to-markdown";
import type { Handle, Info, State } from "mdast-util-to-markdown";

export type BulletMarker = "-" | "*" | "+";

export const DEFAULT_BULLET_MARKER: BulletMarker = "-";

export function spreadAsBoolean(spread: unknown): boolean {
  return spread === true || spread === "true";
}

// The first bullet marker the document uses, so saving keeps the author's
// choice. Skips fenced code and thematic breaks (`* * *`, `---`), which look
// like bullets to a line scan.
export function detectBulletMarker(markdown: string): BulletMarker {
  let fence: string | null = null;

  for (const line of markdown.split("\n")) {
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence === null) {
        fence = marker;
      } else if (marker[0] === fence[0] && marker.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fence !== null) continue;
    if (/^ {0,3}([-*_])( *\1){2,} *$/.test(line)) continue;

    const bullet = line.match(/^\s*(?:>\s*)*([-*+])(?:[ \t]|$)/);
    if (bullet) return bullet[1] as BulletMarker;
  }

  return DEFAULT_BULLET_MARKER;
}

// Stringify handlers for `list` and `listItem` that coerce `spread` to a
// boolean before the default handlers run. `getBullet` is read on every save,
// so the marker follows whichever document is loaded.
export function listStringifyHandlers(getBullet: () => BulletMarker = () => DEFAULT_BULLET_MARKER) {
  const list: Handle = (node: List, parent, state: State, info: Info) => {
    node.spread = spreadAsBoolean(node.spread);
    // state.options is a fresh copy per stringify call, so this does not leak.
    state.options.bullet = getBullet();
    return defaultHandlers.list(node, parent, state, info);
  };

  const listItem: Handle = (node: ListItem, parent, state: State, info: Info) => {
    node.spread = spreadAsBoolean(node.spread);
    return defaultHandlers.listItem(node, parent, state, info);
  };

  return { list, listItem };
}
