import type { Mark } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";

// macOS text substitution (smart quotes, smart dashes) runs as you type in the
// packaged app's WebKit, so a typed `"` becomes `“` and `--` becomes `–`. That
// is right for prose and wrong for code. WebKit skips substitution where
// spellcheck is off, so every element that holds code text carries these.
export const noTextSubstitutionAttrs = {
  spellcheck: "false",
  autocorrect: "off",
  autocapitalize: "off",
} as const;

// Values for Milkdown's codeBlockAttr and inlineCodeAttr: the attributes put
// on a code block's `pre`/`code` and on inline `code`.
export const codeBlockDomAttrs = () => ({
  pre: { ...noTextSubstitutionAttrs },
  code: { ...noTextSubstitutionAttrs },
});

export const inlineCodeDomAttrs = () => ({ ...noTextSubstitutionAttrs });

// The attributes above are only a hint, and WebKit does not always take it:
// in the packaged app an opening `"` in a code block still came out as `“`.
// So anything that lands in code is checked after the fact as well: a curly
// quote typed or substituted into a code block, inline code or an HTML tag
// (anything ProseMirror marks `code`) is turned back into a straight one.
// Only text the transactions inserted is touched, so a curly quote that was
// already in the code (pasted on purpose, say) stays.
const STRAIGHT_QUOTES: Record<string, string> = {
  "“": '"',
  "”": '"',
  "„": '"',
  "‘": "'",
  "’": "'",
  "‚": "'",
};

function insertedRanges(transactions: readonly Transaction[]) {
  let ranges: { from: number; to: number }[] = [];

  for (const tr of transactions) {
    if (!tr.docChanged) continue;

    ranges = ranges.map(({ from, to }) => ({
      from: tr.mapping.map(from, -1),
      to: tr.mapping.map(to, 1),
    }));

    tr.mapping.maps.forEach((stepMap, index) => {
      const later = tr.mapping.slice(index + 1);

      stepMap.forEach((_oldFrom, _oldTo, newFrom, newTo) => {
        if (newTo > newFrom) {
          ranges.push({ from: later.map(newFrom, -1), to: later.map(newTo, 1) });
        }
      });
    });
  }

  return ranges;
}

export function straightenQuotesInCode(
  transactions: readonly Transaction[],
  state: EditorState,
): Transaction | null {
  const fixes = new Map<number, { quote: string; marks: readonly Mark[] }>();

  for (const { from, to } of insertedRanges(transactions)) {
    state.doc.nodesBetween(from, to, (node, pos, parent) => {
      if (!node.isText || !node.text) return;

      const inCode =
        parent?.type.spec.code === true ||
        node.marks.some((mark) => mark.type.spec.code === true);

      if (!inCode) return;

      const start = Math.max(from, pos);
      const end = Math.min(to, pos + node.text.length);

      for (let at = start; at < end; at += 1) {
        const straight = STRAIGHT_QUOTES[node.text[at - pos]!];

        if (straight) fixes.set(at, { quote: straight, marks: node.marks });
      }
    });
  }

  if (fixes.size === 0) return null;

  const tr = state.tr;

  for (const [at, { quote, marks }] of fixes) {
    tr.replaceWith(at, at + 1, state.schema.text(quote, marks));
  }

  return tr;
}
