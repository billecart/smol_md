import { Fragment, type Node as ProseNode } from "@milkdown/kit/prose/model";
import { splice } from "micromark-util-chunked";
import { classifyCharacter } from "micromark-util-classify-character";
import { resolveAll } from "micromark-util-resolve-all";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

// The parts of the markdown round trip that live outside the editor, so the
// test runner can reach them: Rich mode parses with these and writes back
// with them, and anything they get wrong changes the user's file on the first
// edit.

const EQUALS = 61;
const PUNCTUATION = 2;

// ==highlight== used to be found with a regex inside single text nodes, so a
// highlight holding bold or a link could never be read back, and the
// serializer split it into pieces that grew with every save. This is a real
// inline construct instead, modelled on GFM's ~~strikethrough~~: exactly two
// `=`, and the same flanking rules, so `a == b == c` stays plain text.
export function highlightSyntax() {
  const tokenizer = {
    name: "highlight",
    tokenize: tokenizeHighlight,
    resolveAll: resolveAllHighlight,
  };

  return {
    text: { [EQUALS]: tokenizer },
    insideSpan: { null: [tokenizer] },
    attentionMarkers: { null: [EQUALS] },
  };
}

function resolveAllHighlight(events: any[], context: any) {
  let index = -1;

  while (++index < events.length) {
    const closer = events[index];
    if (
      closer[0] !== "enter" ||
      closer[1].type !== "highlightSequenceTemporary" ||
      !closer[1]._close
    ) {
      continue;
    }

    let open = index;
    while (open--) {
      const opener = events[open];
      if (
        opener[0] !== "exit" ||
        opener[1].type !== "highlightSequenceTemporary" ||
        !opener[1]._open
      ) {
        continue;
      }

      opener[1].type = "highlightSequence";
      closer[1].type = "highlightSequence";

      const highlight = {
        type: "highlight",
        start: { ...opener[1].start },
        end: { ...closer[1].end },
      };
      const text = {
        type: "highlightText",
        start: { ...opener[1].end },
        end: { ...closer[1].start },
      };

      const nextEvents: any[] = [
        ["enter", highlight, context],
        ["enter", opener[1], context],
        ["exit", opener[1], context],
        ["enter", text, context],
      ];
      const insideSpan = context.parser.constructs.insideSpan.null;
      if (insideSpan) {
        splice(
          nextEvents,
          nextEvents.length,
          0,
          resolveAll(insideSpan, events.slice(open + 1, index), context),
        );
      }
      splice(nextEvents, nextEvents.length, 0, [
        ["exit", text, context],
        ["enter", closer[1], context],
        ["exit", closer[1], context],
        ["exit", highlight, context],
      ]);
      splice(events, open - 1, index - open + 3, nextEvents);
      index = open + nextEvents.length - 2;
      break;
    }
  }

  for (const event of events) {
    if (event[1].type === "highlightSequenceTemporary") {
      event[1].type = "data";
    }
  }

  return events;
}

function tokenizeHighlight(this: any, effects: any, ok: any, nok: any) {
  const previous = this.previous;
  const events = this.events;
  let size = 0;

  const start = (code: number) => {
    if (
      previous === EQUALS &&
      events[events.length - 1][1].type !== "characterEscape"
    ) {
      return nok(code);
    }

    effects.enter("highlightSequenceTemporary");
    return more(code);
  };

  const more = (code: number): any => {
    if (code === EQUALS) {
      if (size === 2) return nok(code);
      effects.consume(code);
      size += 1;
      return more;
    }

    if (size < 2) return nok(code);

    const before = classifyCharacter(previous);
    const after = classifyCharacter(code);
    const token = effects.exit("highlightSequenceTemporary");
    token._open = !after || (after === PUNCTUATION && Boolean(before));
    token._close = !before || (before === PUNCTUATION && Boolean(after));
    return ok(code);
  };

  return start;
}

const constructsWithoutHighlight = [
  "autolink",
  "destinationLiteral",
  "destinationRaw",
  "reference",
  "titleQuote",
  "titleApostrophe",
];

function handleHighlight(node: any, _parent: any, state: any, info: any) {
  const tracker = state.createTracker(info);
  const exit = state.enter("highlight");
  let value = tracker.move("==");
  value += state.containerPhrasing(node, {
    ...tracker.current(),
    before: value,
    after: "=",
  });
  value += tracker.move("==");
  exit();
  return value;
}
handleHighlight.peek = () => "=";

export function remarkHighlight(this: any) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(highlightSyntax());
  (data.fromMarkdownExtensions ??= []).push({
    canContainEols: ["highlight"],
    enter: {
      highlight(this: any, token: any) {
        this.enter({ type: "highlight", children: [] }, token);
      },
    },
    exit: {
      highlight(this: any, token: any) {
        this.exit(token);
      },
    },
  });
  (data.toMarkdownExtensions ??= []).push({
    unsafe: [
      {
        character: "=",
        inConstruct: "phrasing",
        notInConstruct: constructsWithoutHighlight,
      },
    ],
    handlers: { highlight: handleHighlight },
  });
}

// Milkdown writes an empty paragraph as `<br />` and, reading back, deleted
// every `<br>` anywhere in the file - including real line breaks inside a
// sentence or a table cell. Only a `<br>` that is a paragraph's whole content
// is that marker.
const BREAK_TAG = /^<br\s*\/?>$/i;

const BLOCK_CONTAINERS = ["root", "blockquote", "listItem"];

const isBreakTag = (node: any) =>
  node?.type === "html" && BREAK_TAG.test(String(node.value).trim());

// On its own line `<br />` parses as an HTML block. Milkdown's
// remarkHtmlTransformer wraps that in a paragraph first, but this does not
// count on running after it.
export function remarkEmptyParagraphMarkers() {
  return (tree: any) => {
    visit(tree, (node: any, index, parent: any) => {
      if (node.type === "paragraph" && node.children.length === 1 && isBreakTag(node.children[0])) {
        node.children = [];
      } else if (
        isBreakTag(node) &&
        parent &&
        index !== undefined &&
        BLOCK_CONTAINERS.includes(parent.type)
      ) {
        parent.children[index] = { type: "paragraph", children: [] };
      }
    });
  };
}

// remark escapes conservatively: every `[` in case it starts a link, every
// `_` and `*` in case they start emphasis. So `[[wikilinks]]`, `> [!NOTE]`
// callouts, `[TODO]`, `snake_case` and `2 * 3` all gained backslashes on the
// first edit. This writes text the same way and then drops the backslashes
// that cannot matter where they are. The rules only look inside one text
// node, and an escape next to the node's edge is always kept, because what
// sits on the other side is not known here. As a last check the result has to
// read back as exactly the original text; if it does not, the fully escaped
// version is used.
// Milkdown closes every mark after each piece of text and moves spaces at a
// mark's edge outside it, then merges marks that end up side by side. In
// "==**bold** mark==" the space at the start of " mark" is moved out, the two
// highlights no longer touch, and the file was saved as
// "==**bold**== ==mark==". Spaces in the middle of a mark's run are swapped
// for this placeholder before serializing, so Milkdown leaves them alone, and
// handleText turns them back into spaces.
export const MARK_SPACE = "\uFDD0";

export function protectMarkSpaces(doc: ProseNode): ProseNode {
  const protect = (node: ProseNode): ProseNode => {
    if (node.isLeaf) return node;

    let changed = false;
    const children: ProseNode[] = [];

    node.forEach((child, _offset, index) => {
      // Inline code is written by its own handler, which would keep the
      // placeholder, and Milkdown does not move spaces out of it anyway.
      const isCode = child.marks.some((mark) => mark.type.spec.code);
      if (!node.isTextblock || !child.isText || child.marks.length === 0 || isCode) {
        const next = node.isTextblock ? child : protect(child);
        changed ||= next !== child;
        children.push(next);
        return;
      }

      const continues = (other: ProseNode | null) =>
        other !== null &&
        child.marks.some((mark) => mark.isInSet(other.marks));
      const spaces = (run: string) => MARK_SPACE.repeat(run.length);

      let text = child.text ?? "";
      if (index > 0 && continues(node.child(index - 1))) {
        text = text.replace(/^ +/, spaces);
      }
      if (index < node.childCount - 1 && continues(node.child(index + 1))) {
        text = text.replace(/ +$/, spaces);
      }

      if (text === child.text) {
        children.push(child);
      } else {
        changed = true;
        children.push(child.type.schema.text(text, child.marks));
      }
    });

    return changed ? node.copy(Fragment.fromArray(children)) : node;
  };

  return protect(doc);
}

export function handleText(node: any, _parent: any, state: any, info: any) {
  const value: string = String(node.value).split(MARK_SPACE).join(" ");
  // The same as Milkdown's own text handler, which this replaces.
  if (/^[^*_\\]*\s+$/.test(value)) return value;

  const escaped: string = state.safe(value, { ...info, encode: [] });
  return relaxEscapes(escaped, value, info.after ?? "");
}

const verifier = unified().use(remarkParse).use(remarkGfm).use(remarkHighlight);

// Letters on both sides, so leading and trailing spaces are not trimmed off as
// paragraph whitespace. Every relaxed escape keeps a character of the node on
// each side, or is a `[` that does not care, so the sentinels cannot change
// what it means.
function readsBackAs(markdown: string, value: string) {
  const tree: any = verifier.parse(`x${markdown}x`);
  const [paragraph] = tree.children;

  return (
    tree.children.length === 1 &&
    paragraph.type === "paragraph" &&
    paragraph.children.length === 1 &&
    paragraph.children[0].type === "text" &&
    paragraph.children[0].value === `x${value}x`
  );
}

type Token = { text: string; escaped: boolean };

const ALPHANUMERIC = /[\p{L}\p{N}]/u;
const SPACE = /^[ \t]$/;

// `after` is the character that follows this text in the output: the start of
// the next inline, or a line break at the end of a paragraph.
export function relaxEscapes(escaped: string, value: string, after = ""): string {
  if (!escaped.includes("\\")) return escaped;

  // Split into literal characters and `\X` escapes, so a `\\` is never
  // mistaken for the start of another escape.
  const tokens: Token[] = [];
  for (let index = 0; index < escaped.length; index += 1) {
    const char = escaped[index];
    const next = escaped[index + 1];
    if (char === "\\" && next !== undefined && /[!-/:-@[-`{-~]/.test(next)) {
      tokens.push({ text: next, escaped: true });
      index += 1;
    } else {
      tokens.push({ text: char, escaped: false });
    }
  }

  const textAt = (index: number) => tokens[index]?.text ?? "";
  const isSpace = (index: number) => SPACE.test(textAt(index));
  // Something other than whitespace earlier on the same line, so a character
  // here cannot be a list bullet or a setext underline.
  const hasTextEarlierOnLine = (index: number) => {
    for (let back = index - 1; back >= 0; back -= 1) {
      if (textAt(back) === "\n") return false;
      if (!isSpace(back)) return true;
    }
    return false;
  };

  const keep = tokens.map((token, index) => {
    if (!token.escaped) return false;

    switch (token.text) {
      case "[":
        return !bracketIsLiteral(tokens, index, after);
      case "_":
        return !(
          ALPHANUMERIC.test(textAt(index - 1)) && ALPHANUMERIC.test(textAt(index + 1))
        );
      case "*":
      case "~":
        // Spaces on both sides: it can neither open nor close emphasis or
        // strikethrough.
        return !(isSpace(index - 1) && isSpace(index + 1) && hasTextEarlierOnLine(index));
      case "=": {
        let first = index;
        while (textAt(first - 1) === "=") first -= 1;
        let last = index;
        while (textAt(last + 1) === "=") last += 1;

        // At the node's edge the run could join `=` on the other side.
        if (first === 0 || last === tokens.length - 1) return true;
        if (!hasTextEarlierOnLine(first)) return true;
        // Only a run of exactly two can be a highlight, and not with spaces
        // on both sides.
        if (last - first + 1 !== 2) return false;
        return !(isSpace(first - 1) && isSpace(last + 1));
      }
      default:
        return true;
    }
  });

  const relaxed = tokens
    .map((token, index) => (keep[index] ? `\\${token.text}` : token.text))
    .join("");

  if (relaxed === escaped) return escaped;

  return readsBackAs(relaxed, value) ? relaxed : escaped;
}

// `[` only starts something when a `]` closes it and is followed by `(` (an
// inline link), `[` or `:` (references), or when it reads as a task box or a
// footnote. Milkdown drops link reference definitions, so `[TODO]` or
// `[[Page]]` on its own never becomes a link.
function bracketIsLiteral(tokens: Token[], index: number, after: string) {
  const first = tokens[index + 1];
  if (!first || first.text === "^") return false;

  for (let close = index + 1; close < tokens.length; close += 1) {
    const token = tokens[close];
    if (token.text === "\n") return false;
    if (token.text !== "]" || token.escaped) continue;

    const inner = tokens
      .slice(index + 1, close)
      .map((t) => t.text)
      .join("");
    if (/^[ xX]$/.test(inner)) return false;

    const following = tokens[close + 1]?.text ?? after.charAt(0);
    return !["(", "[", ":"].includes(following);
  }

  return false;
}
