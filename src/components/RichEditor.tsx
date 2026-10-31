import {
  useCallback,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  CmdKey,
  Editor,
  defaultValueCtx,
  editorViewCtx,
  remarkStringifyOptionsCtx,
  rootCtx,
  serializerCtx,
} from "@milkdown/kit/core";
import {
  blockquoteSchema,
  bulletListSchema,
  codeBlockAttr,
  codeBlockSchema,
  commonmark,
  remarkPreserveEmptyLinePlugin,
  hardbreakSchema,
  headingSchema,
  htmlSchema,
  inlineCodeAttr,
  inlineCodeSchema,
  linkSchema,
  paragraphSchema,
  orderedListSchema,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  listItemSchema,
  toggleStrongCommand,
  wrapInHeadingCommand,
} from "@milkdown/kit/preset/commonmark";
import { gfm, toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import type { Ctx } from "@milkdown/ctx";
import {
  getLinkPreviewPosition,
  LINK_PREVIEW_DELAY_MS,
} from "../utils/linkPreview";
import { lift, setBlockType, toggleMark, wrapIn } from "@milkdown/kit/prose/commands";
import { markRule } from "@milkdown/kit/prose";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, EditorView } from "@milkdown/kit/prose/view";
import { Fragment, Slice } from "@milkdown/kit/prose/model";
import type { Node as ProseNode, NodeType } from "@milkdown/kit/prose/model";
import { history } from "@milkdown/kit/plugin/history";
import { liftListItem, wrapInList } from "@milkdown/kit/prose/schema-list";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { keymap } from "@milkdown/kit/prose/keymap";
import {
  $command,
  $inputRule,
  $markSchema,
  $prose,
  $remark,
  callCommand,
  markdownToSlice,
  replaceAll,
} from "@milkdown/kit/utils";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { normalizeMarkdownLineBreaks } from "../utils/markdown";
import {
  codeBlockDomAttrs,
  inlineCodeDomAttrs,
  straightenQuotesInCode,
} from "../utils/codeText";
import {
  editableHtmlNodeSpec,
  insertLineBreakInHtml,
  removeEmptyHtmlNodes,
} from "../utils/htmlNode";
import { detectBulletMarker, listStringifyHandlers } from "../utils/markdownLists";
import {
  handleText,
  protectMarkSpaces,
  remarkEmptyParagraphMarkers,
  remarkHighlight,
} from "../utils/markdownSyntax";
import {
  checkSpelling,
  ignoreSpelling,
  learnSpelling,
  openExternalUrl,
  spellingSuggestions,
} from "../services/fileService";
import { isMacOs } from "../utils/platform";
import {
  misspelledDocumentRanges,
  spellcheckBlocks,
  type MisspelledRanges,
} from "../utils/spellcheck";
import {
  MARKDOWN_LINK_INPUT,
  isPlainTextHtml,
  linkifySlice,
  splitMarkdownLinks,
} from "../utils/markdownLinks";
import {
  convertBulletParagraphs,
  convertPastedBullets,
  fitPastedListToListItem,
  type BulletListTypes,
} from "../utils/unicodeBullets";
import {
  backspaceMergesHeadingAsBodyText,
  backspaceOutdentsListItem,
  chainCommands,
  enterLeavesEmptyListItem,
  findLinkAt,
  indentListItem,
  liftOutOfWrappers,
  makeBodyText,
  outdentListItem,
  removeLinkAt,
  runBlockFormat,
  setLinkOnSelection,
  updateLinkAt,
  type LinkRange,
} from "../utils/editorCommands";
import { TableOfContents } from "./TableOfContents";
import { useTableOfContents, type TocEntry } from "../hooks/useTableOfContents";
import "@milkdown/kit/prose/view/style/prosemirror.css";

// Module-level state for the link dialog (used by formattingKeymap and component).
type LinkDialogCoords = { x: number; y: number };
let _linkDialogCoords: LinkDialogCoords | null = null;
let _linkDialogOnSubmit: ((href: string) => void) | null = null;
let _linkDialogSync: (() => void) | null = null;

let _linkDialogInitialHref = "";

function openLinkDialog(
  view: EditorView,
  onSubmit: (href: string) => void,
  initialHref = "",
  atPos?: number,
) {
  const coords = view.coordsAtPos(atPos ?? view.state.selection.from);
  _linkDialogCoords = { x: Math.round(coords.left), y: Math.round(coords.bottom) + 4 };
  _linkDialogOnSubmit = onSubmit;
  _linkDialogInitialHref = initialHref;
  _linkDialogSync?.();
}

function closeLinkDialog() {
  _linkDialogCoords = null;
  _linkDialogOnSubmit = null;
  _linkDialogInitialHref = "";
  _linkDialogSync?.();
}

type RichEditorProps = {
  value: string;
  onChange: (value: string) => void;
  // Called as soon as an edit starts, ahead of onChange's 200ms delay.
  onEditPending?: () => void;
  findQuery?: string;
  findActiveIndex?: number;
  onFindMatchCount?: (count: number) => void;
};

// The ids the native macOS Format menu sends through App.tsx's "menu-action"
// listener - see build_app_menu's Format submenu in src-tauri/src/lib.rs.
// Kept in sync with those menu item ids by hand; there is no single shared
// source of truth across the Rust/TS boundary.
export type FormatCommandId =
  | "bold"
  | "italic"
  | "strikethrough"
  | "h1"
  | "h2"
  | "h3"
  | "bullet-list"
  | "ordered-list"
  | "convert-bullets"
  | "blockquote"
  | "code-block"
  | "link"
  | "highlight";

export type RichEditorHandle = {
  runFormatCommand: (command: FormatCommandId) => void;
  // Hands App any edit the listener has not delivered yet and returns the
  // editor's markdown, or null when App already has the latest text.
  flush: () => string | null;
};

type ContextMenuPosition = {
  x: number;
  y: number;
};

function applyHeading(ctx: Ctx, level: number) {
  const view = ctx.get(editorViewCtx);

  liftOutOfWrappers(view);
  callCommand(wrapInHeadingCommand.key, level)(ctx);
}

const customEnterPlugin = $prose(
  () =>
    new Plugin({
      props: {
        handleKeyDown(view, event) {
          if (event.key !== "Enter") {
            return false;
          }

          if (insertLineBreakInHtml(view.state, view.dispatch)) {
            event.preventDefault();
            return true;
          }

          if (!view.state.selection.empty) {
            return false;
          }

          const { state, dispatch } = view;
          const { $from } = state.selection;
          const paragraph = state.schema.nodes.paragraph;

          if ($from.parent.type.name === "code_block" && paragraph) {
            const codeBlock = $from.parent;
            const cursorOffset = $from.parentOffset;
            const textBeforeCursor = codeBlock.textBetween(
              0,
              cursorOffset,
              "\n",
              "\n",
            );
            const textAfterCursor = codeBlock.textBetween(
              cursorOffset,
              codeBlock.content.size,
              "\n",
              "\n",
            );
            const isOnTrailingEmptyLine =
              textAfterCursor.length === 0 &&
              (textBeforeCursor.length === 0 ||
                textBeforeCursor.endsWith("\n"));

            if (!isOnTrailingEmptyLine) {
              return false;
            }

            event.preventDefault();

            const paragraphNode = paragraph.createAndFill();

            if (!paragraphNode) {
              return false;
            }

            const codeBlockDepth = $from.depth;
            const codeBlockContentStart = $from.start(codeBlockDepth);
            const hasTrailingLineBreak = textBeforeCursor.endsWith("\n");
            let afterCodeBlock = $from.after(codeBlockDepth);
            let transaction = state.tr;

            if (hasTrailingLineBreak) {
              const lineBreakPosition = codeBlockContentStart + cursorOffset - 1;
              transaction = transaction.delete(
                lineBreakPosition,
                lineBreakPosition + 1,
              );
              afterCodeBlock -= 1;
            }

            transaction = transaction
              .insert(afterCodeBlock, paragraphNode)
              .setSelection(
                TextSelection.near(transaction.doc.resolve(afterCodeBlock + 1)),
              )
              .scrollIntoView();
            dispatch(transaction);
            return true;
          }

          if ($from.parent.type.name !== "heading" || !paragraph) {
            return false;
          }

          // Enter at the very start of a heading: insert empty paragraph above
          if ($from.parentOffset === 0) {
            const emptyParagraph = paragraph.createAndFill();
            if (!emptyParagraph) return false;
            const before = $from.before($from.depth);
            const tr = state.tr.insert(before, emptyParagraph);
            dispatch(
              tr
                .setSelection(TextSelection.near(tr.doc.resolve(before + 1)))
                .scrollIntoView(),
            );
            return true;
          }

          dispatch(
            state.tr
              .split($from.pos, 1, [{ type: paragraph }])
              .scrollIntoView(),
          );
          return true;
        },
      },
    }),
);

// Raw HTML (`<!-- note -->`, `<br>`, block tags) as editable text instead of
// Milkdown's atom, which the caret skips over. Registered after commonmark so
// it replaces the stock html node. See utils/htmlNode.ts.
const editableHtmlSchema = htmlSchema.extendSchema(() => () => editableHtmlNodeSpec);

const htmlNodeCleanupPlugin = $prose(
  () =>
    new Plugin({
      appendTransaction(transactions, _oldState, newState) {
        if (!transactions.some((tr) => tr.docChanged)) return null;

        return removeEmptyHtmlNodes(newState);
      },
    }),
);

// Straight quotes in code even where WebKit's smart quotes ignore the
// no-substitution attributes (see utils/codeText.ts).
const codeQuotesPlugin = $prose(
  () =>
    new Plugin({
      appendTransaction(transactions, _oldState, newState) {
        return straightenQuotesInCode(transactions, newState);
      },
    }),
);

function applyLink(ctx: Ctx, href: string) {
  const view = ctx.get(editorViewCtx);
  if (!setLinkOnSelection(view.state, linkSchema.type(ctx), href, view.dispatch)) {
    callCommand(toggleLinkCommand.key, { href })(ctx);
  }
}

const formattingKeymap = $prose((ctx) =>
  keymap({
    "Mod-b": () => {
      callCommand(toggleStrongCommand.key)(ctx);
      return true;
    },
    "Mod-i": () => {
      callCommand(toggleEmphasisCommand.key)(ctx);
      return true;
    },
    "Mod-k": () => {
      const view = ctx.get(editorViewCtx);
      openLinkDialog(view, (href) => applyLink(ctx, href));
      return true;
    },
    "Mod-1": () => {
      applyHeading(ctx, 1);
      return true;
    },
    "Mod-2": () => {
      applyHeading(ctx, 2);
      return true;
    },
    "Mod-3": () => {
      applyHeading(ctx, 3);
      return true;
    },
    Backspace: () => {
      const view = ctx.get(editorViewCtx);

      return chainCommands(
        backspaceOutdentsListItem(listItemSchema.type(ctx)),
        backspaceMergesHeadingAsBodyText(
          headingSchema.type(ctx),
          paragraphSchema.type(ctx),
        ),
      )(view.state, view.dispatch);
    },
    Tab: () => {
      const view = ctx.get(editorViewCtx);

      return indentListItem(listItemSchema.type(ctx))(view.state, view.dispatch);
    },
    "Shift-Tab": () => {
      const view = ctx.get(editorViewCtx);

      return outdentListItem(listItemSchema.type(ctx))(view.state, view.dispatch);
    },
    Enter: () => {
      const view = ctx.get(editorViewCtx);

      return enterLeavesEmptyListItem(listItemSchema.type(ctx))(
        view.state,
        view.dispatch,
      );
    },
    "Mod-Shift-s": () => {
      callCommand(toggleStrikethroughCommand.key)(ctx);
      return true;
    },
  }),
);

// Highlight mark: ==text== syntax rendered as <mark>. Parsing and writing
// it back live in utils/markdownSyntax.ts.
const highlightRemarkPlugin = $remark("highlight", () => remarkHighlight);

const emptyParagraphMarkersPlugin = $remark(
  "empty-paragraph-markers",
  () => remarkEmptyParagraphMarkers,
);

// Milkdown's own version of the plugin above, which deleted every `<br>`.
// Its options entry stays: the paragraph serializer checks for it before
// writing an empty paragraph as `<br />`.
const commonmarkWithoutBreakStripping = commonmark.filter(
  (plugin) => plugin !== remarkPreserveEmptyLinePlugin.plugin,
);

const highlightSchema = $markSchema("highlight", () => ({
  parseDOM: [{ tag: "mark" }],
  toDOM: () => ["mark" as const, 0 as const],
  parseMarkdown: {
    match: (node: any) => node.type === "highlight",
    runner: (state: any, node: any, markType: any) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark: any) => mark.type.name === "highlight",
    runner: (state: any, mark: any) => {
      state.withMark(mark, "highlight");
    },
  },
}));

const highlightInputRule = $inputRule((ctx) =>
  markRule(/(?:^|[^=])==([^=\n]+)==$/, highlightSchema.type(ctx), {
    updateCaptured: ({ fullMatch, group }) => ({
      fullMatch: fullMatch.startsWith("=") ? fullMatch : fullMatch.slice(1),
      group,
    }),
  }),
);

const toggleHighlightCommand = $command("ToggleHighlight", (ctx) => () =>
  toggleMark(highlightSchema.type(ctx)),
);

function bulletListTypes(ctx: Ctx): BulletListTypes {
  return {
    bulletList: bulletListSchema.type(ctx),
    listItem: listItemSchema.type(ctx),
    paragraph: paragraphSchema.type(ctx),
    hardBreak: hardbreakSchema.type(ctx),
  };
}

// The slice to paste once bullet lines are real list items, or the same slice
// when there were none.
function withPastedBullets(ctx: Ctx, state: EditorState, slice: Slice): Slice {
  const types = bulletListTypes(ctx);
  const converted = convertPastedBullets(slice, types);
  if (converted === slice) return slice;

  const { $from } = state.selection;
  const caretInListItem =
    $from.depth > 1 && $from.node(-1).type === types.listItem;

  return fitPastedListToListItem(converted, caretInListItem, types);
}

// Typing `[label](https://example.com)` in Rich mode used to leave the whole
// thing as plain text, because nothing turned it into a link. Serializing then
// escaped it - `\[label]\(https\://example.com)` - since remark has to stop
// literal text being read back as a link, and the colon has to be escaped too
// or the bare URL would become an autolink. The document looked fine until you
// switched to Source, where it was full of backslashes.
//
// Everything else about links already worked: files that come in with links
// keep them, and Cmd+K sets a real link mark. This is only about the syntax
// being typed out by hand.
// The input rule only fires on a keystroke, so pasting a whole
// `[label](url)` in one go still landed as plain text - which is how the
// original report was produced, the URL having been copied from a browser.
// Pasted text containing markdown links is converted into real links.
// Single-line pastes use fast text fragments; multi-line pastes parse through
// markdownToSlice so paragraph/block structure is preserved.
const markdownLinkPastePlugin = $prose((ctx) => {
  return new Plugin({
    key: new PluginKey("smolMarkdownLinkPaste"),
    props: {
      handlePaste: (view, event) => {
        const clipboard = event.clipboardData;
        if (!clipboard) return false;
        if (
          clipboard.types.includes("text/html") &&
          !isPlainTextHtml(clipboard.getData("text/html"))
        ) {
          return false;
        }
        if (view.state.selection.$from.parent.type.spec.code) return false;

        const text = clipboard.getData("text/plain");
        if (!text) return false;

        const segments = splitMarkdownLinks(text);
        if (!segments) return false;

        if (!text.includes("\n")) {
          const linkType = linkSchema.type(ctx);
          const pieces = segments.map((segment) =>
            segment.href
              ? view.state.schema.text(segment.text, [
                  linkType.create({ href: segment.href, title: segment.title ?? "" }),
                ])
              : view.state.schema.text(segment.text),
          );

          view.dispatch(
            view.state.tr
              .replaceSelection(new Slice(Fragment.from(pieces), 0, 0))
              .scrollIntoView(),
          );
          return true;
        }

        try {
          const slice = withPastedBullets(
            ctx,
            view.state,
            markdownToSlice(text)(ctx),
          );
          view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
          return true;
        } catch {
          return false;
        }
      },
    },
  });
});

// Lines pasted with "•" (or "◦", "▪", "–" ...) bullets become a real bullet
// list rather than paragraphs that start with the character - see
// unicodeBullets.ts. This runs after ProseMirror has parsed the clipboard, so
// it covers HTML from rich-text apps as well as plain text. Registered after
// markdownLinkPastePlugin, which does the same conversion on its own slice.
//
// Bare URLs in the paste become links here too (linkifySlice), since this is
// the one place every paste passes through after the clipboard is parsed.
//
// Copies made inside the editor are left alone: those are the user's own
// paragraphs being moved around, and a file that already has "• item" lines
// keeps them.
const unicodeBulletPastePlugin = $prose((ctx) => {
  return new Plugin({
    key: new PluginKey("smolUnicodeBulletPaste"),
    props: {
      handlePaste: (view, event, slice) => {
        if (view.state.selection.$from.parent.type.spec.code) return false;
        if (event.clipboardData?.getData("text/html").includes("data-pm-slice")) {
          return false;
        }

        const converted = linkifySlice(
          withPastedBullets(ctx, view.state, slice),
          linkSchema.type(ctx),
        );
        if (converted === slice) return false;

        view.dispatch(
          view.state.tr
            .replaceSelection(converted)
            .scrollIntoView()
            .setMeta("paste", true)
            .setMeta("uiEvent", "paste"),
        );
        return true;
      },
    },
  });
});

// Primary clicks on links open the destination in the system browser.
// Option/Alt-click is reserved for caret placement inside the link text.
const linkClickPlugin = $prose((ctx) => {
  return new Plugin({
    key: new PluginKey("smolLinkClick"),
    props: {
      handleClick: (view, pos, event) => {
        if (event.button !== 0) return false;
        if (event.altKey) return false;

        const { from, to } = view.state.selection;
        if (from !== to) return false;

        const target = event.target as HTMLElement | null;
        const anchor = target?.closest?.("a");
        const link = findLinkAt(view.state, linkSchema.type(ctx), pos);
        const href = link?.href || anchor?.getAttribute("href");

        if (!href) return false;

        event.preventDefault();
        void openExternalUrl(href);
        return true;
      },
    },
  });
});

// Milkdown's gfm preset renders a task item as a bare <li data-checked> with
// no checkbox. This adds one as a widget at the start of each task item.
// Clicking it flips the item's `checked` attr in a transaction, so the change
// is undoable and saves back to markdown as [x] / [ ].
function buildTaskCheckboxes(doc: ProseNode): DecorationSet {
  const widgets: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "list_item" || node.attrs.checked == null) return;
    const checked = node.attrs.checked === true;
    widgets.push(
      Decoration.widget(
        pos + 1,
        (view, getPos) => createTaskCheckbox(view, getPos, checked),
        {
          side: -1,
          ignoreSelection: true,
          stopEvent: () => true,
          // A new key when the state flips makes ProseMirror redraw the input
          // instead of reusing the old one.
          key: `task-${checked}`,
        },
      ),
    );
  });
  return DecorationSet.create(doc, widgets);
}

function createTaskCheckbox(
  view: EditorView,
  getPos: () => number | undefined,
  checked: boolean,
): HTMLElement {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "smol-task-checkbox";
  input.checked = checked;
  input.tabIndex = -1;
  input.setAttribute("aria-label", checked ? "Mark as not done" : "Mark as done");
  // Keep the caret and focus where they were.
  input.addEventListener("mousedown", (event) => event.preventDefault());
  input.addEventListener("click", (event) => {
    // The redraw after the transaction shows the new state.
    event.preventDefault();
    if (!view.editable) return;
    const widgetPos = getPos();
    if (widgetPos == null) return;
    const itemPos = widgetPos - 1;
    const item = view.state.doc.nodeAt(itemPos);
    if (!item || item.attrs.checked == null) return;
    view.dispatch(
      view.state.tr.setNodeMarkup(itemPos, undefined, {
        ...item.attrs,
        checked: !item.attrs.checked,
      }),
    );
    // Without focus in the editor, Cmd+Z right after a tick never reaches
    // ProseMirror's history. Focus keeps the caret where it was.
    view.focus();
  });
  return input;
}

const taskCheckboxPlugin = $prose(
  () =>
    new Plugin<DecorationSet>({
      key: new PluginKey("smolTaskCheckbox"),
      state: {
        init: (_, state) => buildTaskCheckboxes(state.doc),
        apply: (tr, set) => (tr.docChanged ? buildTaskCheckboxes(tr.doc) : set),
      },
      props: {
        decorations(state) {
          return this.getState(state);
        },
      },
    }),
);

const linkInputRule = $inputRule((ctx) =>
  new InputRule(MARKDOWN_LINK_INPUT, (state, match, start, end) => {
    const [, text, href, title] = match;
    if (!text || !href) return null;

    const linkType = linkSchema.type(ctx);
    const link = linkType.create({ href, title: title ?? "" });

    return (
      state.tr
        .replaceWith(start, end, state.schema.text(text, [link]))
        // Without this the link mark stays active and whatever is typed next
        // gets swallowed into the link.
        .removeStoredMark(linkType)
    );
  }),
);

type FindMatch = { from: number; to: number };

type FindState = {
  query: string;
  activeIndex: number;
  matches: FindMatch[];
  decorations: DecorationSet;
};

const EMPTY_FIND_STATE: FindState = {
  query: "",
  activeIndex: 0,
  matches: [],
  decorations: DecorationSet.empty,
};

// Spelling underlines on macOS (see utils/spellcheck.ts). Results are kept by
// paragraph text, so only paragraphs that changed go back to the dictionary,
// and switching back to a tab costs nothing.
const spellcheckPluginKey = new PluginKey<DecorationSet>("smolSpelling");
const spellingResults = new Map<string, MisspelledRanges>();
// Checks the whole document again, e.g. after a word was learned or ignored.
let _recheckSpelling: (() => void) | null = null;

// `typingAt` is where the user is typing, if they are: the word there is
// left alone until they move on.
function spellingDecorations(state: EditorState, typingAt: number | null) {
  const ranges = misspelledDocumentRanges(
    spellcheckBlocks(state.doc),
    (text) => spellingResults.get(text),
    typingAt,
  );

  return DecorationSet.create(
    state.doc,
    ranges.map(({ from, to }) => Decoration.inline(from, to, { class: "spelling-error" })),
  );
}

function misspellingAt(state: EditorState, pos: number) {
  const found = spellcheckPluginKey
    .getState(state)
    ?.find(pos, pos)
    .find((decoration) => decoration.from <= pos && pos <= decoration.to);

  return found
    ? { from: found.from, to: found.to, word: state.doc.textBetween(found.from, found.to) }
    : null;
}

const spellcheckPlugin = $prose(
  () =>
    new Plugin<DecorationSet>({
      key: spellcheckPluginKey,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, decorations, _oldState, newState) {
          const meta = tr.getMeta(spellcheckPluginKey) as
            | { typingAt: number | null }
            | undefined;

          if (meta) {
            return spellingDecorations(newState, meta.typingAt);
          }

          return tr.docChanged ? decorations.map(tr.mapping, tr.doc) : decorations;
        },
      },
      props: {
        decorations: (state) => spellcheckPluginKey.getState(state),
      },
      view: (editorView) => {
        // Windows' webview already checks the whole document by itself.
        if (!isMacOs()) {
          return {};
        }

        let timer: number | undefined;
        let destroyed = false;
        let typingAt: number | null = null;

        const check = async () => {
          const missing = [
            ...new Set(
              spellcheckBlocks(editorView.state.doc)
                .map((block) => block.text)
                .filter((text) => !spellingResults.has(text)),
            ),
          ];

          if (missing.length > 0) {
            let results: MisspelledRanges[];

            try {
              results = await checkSpelling(missing);
            } catch {
              return;
            }

            if (spellingResults.size > 5000) {
              spellingResults.clear();
            }

            missing.forEach((text, index) => spellingResults.set(text, results[index] ?? []));
          }

          if (!destroyed) {
            editorView.dispatch(
              editorView.state.tr
                .setMeta(spellcheckPluginKey, { typingAt })
                .setMeta("addToHistory", false),
            );
          }
        };

        const schedule = (delay: number) => {
          window.clearTimeout(timer);
          timer = window.setTimeout(() => void check(), delay);
        };

        _recheckSpelling = () => {
          spellingResults.clear();
          schedule(0);
        };
        schedule(0);

        return {
          update: (view, prevState) => {
            if (view.state.doc !== prevState.doc) {
              typingAt = view.state.selection.empty ? view.state.selection.head : null;
              // Wait for a pause in typing.
              schedule(400);
            } else if (!view.state.selection.eq(prevState.selection) && typingAt !== null) {
              // Moved on from the word being typed: it can be underlined now.
              typingAt = null;
              schedule(150);
            }
          },
          destroy: () => {
            destroyed = true;
            window.clearTimeout(timer);
          },
        };
      },
    }),
);

const findPluginKey = new PluginKey<FindState>("smolFind");

// Matching is per text node and non-overlapping, so a match spanning a mark
// boundary is not found - unchanged from the original implementation.
function findMatches(doc: ProseNode, query: string): FindMatch[] {
  const matches: FindMatch[] = [];
  const needle = query.toLowerCase();

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text.toLowerCase();
    let offset = 0;
    while (true) {
      const index = text.indexOf(needle, offset);
      if (index === -1) break;
      matches.push({ from: pos + index, to: pos + index + needle.length });
      offset = index + needle.length;
    }
  });

  return matches;
}

function buildDecorations(
  doc: ProseNode,
  matches: FindMatch[],
  activeIndex: number,
): DecorationSet {
  return DecorationSet.create(
    doc,
    matches.map((match, index) =>
      Decoration.inline(match.from, match.to, {
        class:
          index === activeIndex
            ? "smol-find-match smol-find-match-active"
            : "smol-find-match",
      }),
    ),
  );
}

// The decorations live in plugin state rather than being rebuilt inside the
// `decorations` prop. ProseMirror calls that prop on every view update - every
// selection move, every no-op transaction - and rebuilding there meant walking
// the whole document each time. Here the walk happens only when the query or
// the document actually changes.
const findDecorationPlugin = $prose(
  () =>
    new Plugin<FindState>({
      key: findPluginKey,
      state: {
        init() {
          return EMPTY_FIND_STATE;
        },
        apply(tr, prev, _oldState, newState) {
          const meta = tr.getMeta(findPluginKey) as
            | { query: string; activeIndex: number }
            | undefined;

          const query = meta ? meta.query : prev.query;
          const activeIndex = meta ? meta.activeIndex : prev.activeIndex;

          if (!query) {
            return prev.query === "" && prev.matches.length === 0
              ? prev
              : EMPTY_FIND_STATE;
          }

          const mustRescan = query !== prev.query || tr.docChanged;
          const matches = mustRescan
            ? findMatches(newState.doc, query)
            : prev.matches;

          // Nothing the decorations depend on moved, so keep the same set and
          // let ProseMirror skip redrawing entirely.
          if (
            !mustRescan &&
            activeIndex === prev.activeIndex &&
            query === prev.query
          ) {
            return prev;
          }

          return {
            query,
            activeIndex,
            matches,
            decorations: buildDecorations(newState.doc, matches, activeIndex),
          };
        },
      },
      props: {
        decorations(state) {
          return findPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
        },
      },
    }),
);

export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(
  function RichEditor(
    {
      value,
      onChange,
      onEditPending,
      findQuery = "",
      findActiveIndex = 0,
      onFindMatchCount,
    },
    ref,
  ) {
    const normalizedValue = normalizeMarkdownLineBreaks(value);

    return (
      <MilkdownProvider>
        <RichEditorInner
          ref={ref}
          value={normalizedValue}
          onChange={onChange}
          onEditPending={onEditPending}
          findQuery={findQuery}
          findActiveIndex={findActiveIndex}
          onFindMatchCount={onFindMatchCount}
        />
      </MilkdownProvider>
    );
  },
);

const RichEditorInner = forwardRef<RichEditorHandle, RichEditorProps>(
  function RichEditorInner(
    { value, onChange, onEditPending, findQuery, findActiveIndex, onFindMatchCount },
    ref,
  ) {
  const lastKnownMarkdown = useRef(value);
  // The bullet marker saves use, read from markdown the app hands in. The
  // editor's own output already uses it, so it is never read back from there.
  const bulletMarker = useRef(detectBulletMarker(value));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onEditPendingRef = useRef(onEditPending);
  onEditPendingRef.current = onEditPending;

  // The listener only calls back 200ms after the last edit, so App's copy of
  // the text lags behind the editor. Anything that reads it in that window -
  // switching to Source, saving, closing a tab - would see the text from
  // before the edit. flush() closes the gap. It only serializes when there is
  // a real edit pending: serializing an untouched document can still change
  // it (`*` bullets come back as `-`), which would mark it dirty.
  const hasPendingEdit = useRef(false);
  const isUnmounted = useRef(false);
  const editorViewRef = useRef<EditorView | null>(null);
  const serializerRef = useRef<((doc: ProseNode) => string) | null>(null);

  const deliverMarkdown = (markdown: string) => {
    const normalizedMarkdown = normalizeMarkdownLineBreaks(markdown);
    hasPendingEdit.current = false;
    lastKnownMarkdown.current = normalizedMarkdown;
    onChangeRef.current(normalizedMarkdown);
  };

  const flush = () => {
    const view = editorViewRef.current;
    const serialize = serializerRef.current;

    if (!hasPendingEdit.current || !view || !serialize) {
      return null;
    }

    deliverMarkdown(serialize(protectMarkSpaces(view.state.doc)));
    return lastKnownMarkdown.current;
  };

  // Unmounting (switching tabs or modes) hands over the last edit, and stops
  // the listener's timer, which outlives the editor, from delivering it again
  // over whatever was typed in Source mode since. Reset on mount because
  // StrictMode unmounts and remounts once in development.
  useEffect(() => {
    isUnmounted.current = false;

    return () => {
      flush();
      isUnmounted.current = true;
    };
  }, []);
  const [contextMenuLink, setContextMenuLink] = useState<LinkRange | null>(null);
  // The bullet conversion is offered only when there are "• item" lines for
  // it to convert. Shown all the time it read like a leftover debug item.
  const [canConvertBullets, setCanConvertBullets] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] =
    useState<ContextMenuPosition | null>(null);
  // The misspelled word under the pointer when the menu opened, with the
  // dictionary's suggestions (null while they're still being fetched).
  const [contextMenuMisspelling, setContextMenuMisspelling] = useState<{
    from: number;
    to: number;
    word: string;
    suggestions: string[] | null;
  } | null>(null);
  const [linkDialogPos, setLinkDialogPos] = useState<LinkDialogCoords | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  // Hovering a link shows where it goes, after a short pause so the bubble
  // doesn't flicker while the pointer just passes over text.
  const [linkPreview, setLinkPreview] = useState<{
    href: string;
    x: number;
    y: number;
  } | null>(null);
  const linkPreviewTimer = useRef<number | undefined>(undefined);
  const hoveredLinkRef = useRef<HTMLAnchorElement | null>(null);

  const hideLinkPreview = useCallback(() => {
    window.clearTimeout(linkPreviewTimer.current);
    hoveredLinkRef.current = null;
    setLinkPreview(null);
  }, []);

  const handleEditorMouseOver = useCallback(
    (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.(
        ".ProseMirror a[href]",
      ) as HTMLAnchorElement | null;

      if (anchor === hoveredLinkRef.current) return;

      hideLinkPreview();
      if (!anchor) return;

      hoveredLinkRef.current = anchor;
      linkPreviewTimer.current = window.setTimeout(() => {
        const href = anchor.getAttribute("href");
        if (!href || !anchor.isConnected) return;
        // getClientRects: a link that wraps onto two lines gets the bubble
        // under its first line, not under the whole block.
        const rect = anchor.getClientRects()[0] ?? anchor.getBoundingClientRect();
        setLinkPreview({
          href,
          ...getLinkPreviewPosition(rect, {
            width: window.innerWidth,
            height: window.innerHeight,
          }),
        });
      }, LINK_PREVIEW_DELAY_MS);
    },
    [hideLinkPreview],
  );

  useEffect(() => {
    if (!linkPreview) return;
    // Anything that moves the text or starts an action makes the bubble stale.
    window.addEventListener("scroll", hideLinkPreview, true);
    window.addEventListener("keydown", hideLinkPreview, true);
    window.addEventListener("mousedown", hideLinkPreview, true);
    return () => {
      window.removeEventListener("scroll", hideLinkPreview, true);
      window.removeEventListener("keydown", hideLinkPreview, true);
      window.removeEventListener("mousedown", hideLinkPreview, true);
    };
  }, [linkPreview, hideLinkPreview]);

  useEffect(() => () => window.clearTimeout(linkPreviewTimer.current), []);

  const tocEntries = useTableOfContents(value);

  const handleNavigateToc = (entry: TocEntry) => {
    const editor = get();
    if (!editor) return;
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      let pos = -1;
      let seen = 0;
      view.state.doc.descendants((node, p) => {
        if (pos !== -1) return false;
        if (node.type.name === 'heading' && node.textContent === entry.plainText) {
          if (seen === entry.occurrence) {
            pos = p;
            return false;
          }
          seen++;
        }
      });
      if (pos !== -1) {
        const domNode = view.nodeDOM(pos) as HTMLElement;
        if (domNode && domNode.scrollIntoView) {
          domNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          const { tr } = view.state;
          const selection = TextSelection.create(view.state.doc, pos);
          view.dispatch(tr.setSelection(selection).scrollIntoView());
        }
      }
    });
  };

  // Sync module-level link dialog state into React state.
  _linkDialogSync = () => {
    setLinkDialogPos(_linkDialogCoords);
  };

  const { loading, get } = useEditor(
    (root) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, value);
          // `updated` rather than `markdownUpdated`, so the document goes
          // through protectMarkSpaces like flush() does before serializing.
          ctx.get(listenerCtx).updated((innerCtx, doc) => {
            // Already delivered by flush(), or the editor is gone.
            if (!hasPendingEdit.current || isUnmounted.current) {
              return;
            }

            deliverMarkdown(innerCtx.get(serializerCtx)(protectMarkSpaces(doc)));
          });
          // Links and inline code stop at their last letter. Milkdown leaves
          // both marks inclusive (ProseMirror's default), so a space or full
          // stop typed right after one joined it and there was no way to type
          // out of it.
          for (const markSchema of [linkSchema, inlineCodeSchema]) {
            ctx.update(markSchema.key, (prev) => (innerCtx) => ({
              ...prev(innerCtx),
              inclusive: false,
            }));
          }
          // Code keeps straight quotes and plain dashes: no macOS smart
          // quotes or dashes in code blocks or inline code (utils/codeText.ts).
          ctx.set(codeBlockAttr.key, codeBlockDomAttrs);
          ctx.set(inlineCodeAttr.key, inlineCodeDomAttrs);
          // List handlers that keep tight lists tight (see markdownLists.ts),
          // and text that is not escaped more than it needs (markdownSyntax.ts).
          const stringifyOpts = ctx.get(remarkStringifyOptionsCtx);
          ctx.set(remarkStringifyOptionsCtx, {
            ...stringifyOpts,
            // remark writes `***` by default, so every `---` rule changed
            // on the first edit anywhere in the file.
            rule: "-",
            handlers: {
              ...(stringifyOpts as any).handlers,
              ...listStringifyHandlers(() => bulletMarker.current),
              text: handleText,
            },
          });
        })
        .use(highlightRemarkPlugin)
        .use(highlightSchema)
        .use(highlightInputRule)
        .use(linkInputRule)
        .use(markdownLinkPastePlugin)
        .use(unicodeBulletPastePlugin)
        .use(linkClickPlugin)
        .use(taskCheckboxPlugin)
        .use(toggleHighlightCommand)
        .use(customEnterPlugin)
        .use(formattingKeymap)
        .use(findDecorationPlugin)
        .use(commonmarkWithoutBreakStripping)
        .use(emptyParagraphMarkersPlugin)
        .use(editableHtmlSchema)
        .use(htmlNodeCleanupPlugin)
        .use(codeQuotesPlugin)
        .use(spellcheckPlugin)
        .use(gfm)
        .use(history)
        .use(listener)
        .use(
          $prose(
            (ctx) =>
              new Plugin({
                state: {
                  init: () => null,
                  // Same rule the listener uses to decide what to report.
                  apply: (tr) => {
                    if (tr.docChanged && tr.getMeta("addToHistory") !== false) {
                      if (!hasPendingEdit.current) {
                        onEditPendingRef.current?.();
                      }

                      hasPendingEdit.current = true;
                    }

                    return null;
                  },
                },
                view: (editorView) => {
                  editorViewRef.current = editorView;
                  serializerRef.current = ctx.get(serializerCtx);
                  return {};
                },
              }),
          ),
        ),
    [],
  );

  useEffect(() => {
    if (loading || value === lastKnownMarkdown.current) {
      return;
    }

    const editor = get();

    if (!editor) {
      return;
    }

    bulletMarker.current = detectBulletMarker(value);
    editor.action(replaceAll(value, true));
    lastKnownMarkdown.current = value;
    // Whatever was pending has just been replaced by App's text.
    hasPendingEdit.current = false;
  }, [get, loading, value]);

  // `get` from useEditor is a new function on every render, so these effects
  // re-run constantly. The ref makes them no-ops unless the find query or the
  // active match actually changed.
  const lastDispatchedFind = useRef<{ query: string; activeIndex: number }>({
    query: "",
    activeIndex: -1,
  });

  // Sync find query + active index into the ProseMirror decoration plugin.
  useEffect(() => {
    if (loading) return;

    const query = findQuery ?? "";
    const activeIndex = findActiveIndex ?? 0;
    const previous = lastDispatchedFind.current;

    if (previous.query === query && previous.activeIndex === activeIndex) {
      return;
    }

    const editor = get();
    if (!editor) return;

    lastDispatchedFind.current = { query, activeIndex };

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(
        view.state.tr.setMeta(findPluginKey, { query, activeIndex }),
      );
      // The plugin already walked the document; read the count from it rather
      // than walking a second time.
      onFindMatchCount?.(
        findPluginKey.getState(view.state)?.matches.length ?? 0,
      );
    });
  }, [loading, get, findQuery, findActiveIndex, onFindMatchCount]);

  // Editing while find is open changes the match set, so the count has to be
  // refreshed from the plugin after the document changes too.
  useEffect(() => {
    if (loading || !findQuery) return;
    const editor = get();
    if (!editor) return;

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      onFindMatchCount?.(
        findPluginKey.getState(view.state)?.matches.length ?? 0,
      );
    });
  }, [loading, get, value, findQuery, onFindMatchCount]);

  // Scroll active match into view when activeIndex changes.
  const lastScrolledTo = useRef<{ query: string; activeIndex: number }>({
    query: "",
    activeIndex: -1,
  });

  useEffect(() => {
    if (loading || !findQuery) return;

    const activeIndex = findActiveIndex ?? 0;
    const previous = lastScrolledTo.current;

    if (previous.query === findQuery && previous.activeIndex === activeIndex) {
      return;
    }

    const editor = get();
    if (!editor) return;

    lastScrolledTo.current = { query: findQuery, activeIndex };

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const activeEl = view.dom.querySelector<HTMLElement>(
        ".smol-find-match-active",
      );
      activeEl?.scrollIntoView({ block: "nearest" });
    });
  }, [loading, get, findActiveIndex, findQuery]);

  useEffect(() => {
    if (!contextMenuPosition) {
      return;
    }

    const closeContextMenu = () => setContextMenuPosition(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    };

    window.addEventListener("click", closeContextMenu);
    window.addEventListener("resize", closeContextMenu);
    window.addEventListener("scroll", closeContextMenu, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("resize", closeContextMenu);
      window.removeEventListener("scroll", closeContextMenu, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenuPosition]);

  useEffect(() => {
    if (!linkDialogPos) return;
    linkInputRef.current?.focus();
    // Editing an existing link starts with the old href selected, so typing
    // replaces it rather than appending to it.
    linkInputRef.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLinkDialog();
    };
    const onDown = (e: Event) => {
      if (!(e.target as HTMLElement)?.closest?.(".link-dialog")) {
        closeLinkDialog();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [linkDialogPos]);

  const runCommand = <T,>(command: { key: CmdKey<T> }, payload?: T) => {
    const editor = get();

    if (!editor) {
      return;
    }

    editor.action(callCommand(command.key, payload));
    setContextMenuPosition(null);
  };

  const runBodyText = () => {
    const editor = get();
    if (!editor) return;

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      makeBodyText(view, paragraphSchema.type(ctx));
    });
    setContextMenuPosition(null);
  };

  const replaceMisspelling = (from: number, to: number, replacement: string) => {
    setContextMenuPosition(null);
    get()?.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(view.state.tr.insertText(replacement, from, to));
      view.focus();
    });
  };

  const learnMisspelling = (word: string) => {
    setContextMenuPosition(null);
    void learnSpelling(word).then(() => _recheckSpelling?.());
  };

  const ignoreMisspelling = (word: string) => {
    setContextMenuPosition(null);
    void ignoreSpelling(word).then(() => _recheckSpelling?.());
  };

  const openLink = (link: LinkRange) => {
    setContextMenuPosition(null);
    void openExternalUrl(link.href);
  };

  const editLink = (link: LinkRange) => {
    setContextMenuPosition(null);
    const editor = get();
    if (!editor) return;

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const linkType = linkSchema.type(ctx);

      openLinkDialog(
        view,
        (href) => {
          editor.action((inner) => {
            const innerView = inner.get(editorViewCtx);
            updateLinkAt(
              innerView.state,
              linkType,
              link.from,
              href,
              innerView.dispatch,
            );
          });
        },
        link.href,
        link.from,
      );
    });
  };

  const removeLink = (link: LinkRange) => {
    setContextMenuPosition(null);
    const editor = get();
    if (!editor) return;

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      removeLinkAt(
        view.state,
        linkSchema.type(ctx),
        link.from,
        view.dispatch,
      );
    });
  };

  const copyLink = (link: LinkRange) => {
    setContextMenuPosition(null);
    void navigator.clipboard?.writeText(link.href);
  };

  const promptForLink = () => {
    setContextMenuPosition(null);
    const editor = get();
    if (!editor) return;
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      openLinkDialog(view, (href) => applyLink(ctx, href));
    });
  };

  const runBulletList = () => {
    const editor = get();
    if (!editor) return;
    editor.action((ctx) => {
      runBlockFormat(ctx.get(editorViewCtx), wrapInList(bulletListSchema.type(ctx)));
    });
    setContextMenuPosition(null);
  };

  const runOrderedList = () => {
    const editor = get();
    if (!editor) return;
    editor.action((ctx) => {
      runBlockFormat(ctx.get(editorViewCtx), wrapInList(orderedListSchema.type(ctx)));
    });
    setContextMenuPosition(null);
  };

  // Existing documents keep their "• item" lines until this is run on them;
  // pastes are converted as they come in (see unicodeBulletPastePlugin).
  const runConvertBullets = () => {
    const editor = get();
    if (!editor) return;
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      convertBulletParagraphs(bulletListTypes(ctx))(view.state, view.dispatch);
      view.focus();
    });
    setContextMenuPosition(null);
  };

  const runBlockquote = () => {
    const editor = get();
    if (!editor) return;
    editor.action((ctx) => {
      runBlockFormat(ctx.get(editorViewCtx), wrapIn(blockquoteSchema.type(ctx)));
    });
    setContextMenuPosition(null);
  };

  const runCodeBlock = () => {
    const editor = get();
    if (!editor) return;
    editor.action((ctx) => {
      runBlockFormat(ctx.get(editorViewCtx), setBlockType(codeBlockSchema.type(ctx)));
    });
    setContextMenuPosition(null);
  };

  // Headings go through applyHeading rather than the raw command: inside a
  // list item the command fails outright, which read as the menu item doing
  // nothing.
  const runHeading = (level: number) => {
    const editor = get();
    if (!editor) return;
    editor.action((ctx) => applyHeading(ctx, level));
    setContextMenuPosition(null);
  };

  // Single dispatch point for every formatting command, shared by the
  // right-click menu buttons below and by the imperative handle the native
  // macOS Format menu drives through App.tsx (see RichEditorHandle above).
  const runFormatCommand = (command: FormatCommandId) => {
    switch (command) {
      case "bold":
        runCommand(toggleStrongCommand);
        break;
      case "italic":
        runCommand(toggleEmphasisCommand);
        break;
      case "strikethrough":
        runCommand(toggleStrikethroughCommand);
        break;
      case "h1":
        runHeading(1);
        break;
      case "h2":
        runHeading(2);
        break;
      case "h3":
        runHeading(3);
        break;
      case "bullet-list":
        runBulletList();
        break;
      case "ordered-list":
        runOrderedList();
        break;
      case "convert-bullets":
        runConvertBullets();
        break;
      case "blockquote":
        runBlockquote();
        break;
      case "code-block":
        runCodeBlock();
        break;
      case "link":
        promptForLink();
        break;
      case "highlight":
        runCommand(toggleHighlightCommand);
        break;
    }
  };

  useImperativeHandle(ref, () => ({ runFormatCommand, flush }));
  const openContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const menuWidth = 184;
    let menuHeight = 484;

    // Resolve the link from where the pointer actually is rather than from the
    // selection: whether a right-click moves the caret is up to the browser,
    // and this editor runs in Chromium in dev and WebKit when packaged.
    const editor = get();
    let link: LinkRange | null = null;
    let hasBulletLines = false;
    let misspelling: { from: number; to: number; word: string } | null = null;

    editor?.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (!at) return;

      // Put the caret where the pointer is, unless the right-click landed
      // inside an existing selection - then it is a menu for that selection
      // and moving the caret would throw it away. Every block item in this
      // menu acts on the caret, so without this they act on wherever the
      // caret happened to be and the menu appears to do nothing.
      const { from, to } = view.state.selection;
      const insideSelection = at.pos >= from && at.pos <= to && from !== to;

      if (!insideSelection) {
        view.dispatch(
          view.state.tr.setSelection(
            TextSelection.create(view.state.doc, at.pos),
          ),
        );
      }

      misspelling = misspellingAt(view.state, at.pos);
      link = findLinkAt(view.state, linkSchema.type(ctx), at.pos);
      hasBulletLines = convertBulletParagraphs(bulletListTypes(ctx))(view.state);
    });

    setContextMenuLink(link);
    setCanConvertBullets(hasBulletLines);

    const found = misspelling as { from: number; to: number; word: string } | null;
    setContextMenuMisspelling(found ? { ...found, suggestions: null } : null);

    if (found) {
      // Room for up to five suggestions, Learn, Ignore and a divider.
      menuHeight += 7 * 28 + 11;
      void spellingSuggestions(found.word)
        .catch(() => [])
        .then((suggestions) =>
          setContextMenuMisspelling((current) =>
            current?.from === found.from && current.word === found.word
              ? { ...current, suggestions: suggestions.slice(0, 5) }
              : current,
          ),
        );
    }

    setContextMenuPosition({
      x: Math.min(event.clientX, window.innerWidth - menuWidth - 8),
      y: Math.min(event.clientY, window.innerHeight - menuHeight - 8),
    });
  };

  return (
    <div
      className="rich-editor-shell"
      onContextMenu={openContextMenu}
      onMouseOver={handleEditorMouseOver}
      onMouseLeave={hideLinkPreview}
    >
      <div className="rich-editor" aria-label="Rich Markdown editor">
        {loading ? <p className="editor-loading">Loading editor...</p> : null}
        <Milkdown />
      </div>
      
      <TableOfContents 
        entries={tocEntries} 
        onNavigate={handleNavigateToc} 
      />

      {contextMenuPosition ? (
        <div
          className="editor-context-menu"
          style={{
            left: contextMenuPosition.x,
            top: contextMenuPosition.y,
          }}
          role="menu"
          aria-label="Formatting"
          onMouseDown={(event) => event.preventDefault()}
        >
          {contextMenuMisspelling ? (
            <>
              {contextMenuMisspelling.suggestions === null ? (
                <span className="editor-context-note">Looking up…</span>
              ) : contextMenuMisspelling.suggestions.length === 0 ? (
                <span className="editor-context-note">No suggestions</span>
              ) : (
                contextMenuMisspelling.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    role="menuitem"
                    className="editor-context-suggestion"
                    onClick={() =>
                      replaceMisspelling(
                        contextMenuMisspelling.from,
                        contextMenuMisspelling.to,
                        suggestion,
                      )
                    }
                  >
                    {suggestion}
                  </button>
                ))
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => learnMisspelling(contextMenuMisspelling.word)}
              >
                Learn spelling
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => ignoreMisspelling(contextMenuMisspelling.word)}
              >
                Ignore spelling
              </button>
              <span className="editor-context-divider" aria-hidden="true" />
            </>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => runCommand(toggleStrongCommand)}
          >
            Bold
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runCommand(toggleEmphasisCommand)}
          >
            Italic
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runCommand(toggleStrikethroughCommand)}
          >
            Strikethrough
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runCommand(toggleInlineCodeCommand)}
          >
            Inline code
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runCommand(toggleHighlightCommand)}
          >
            Highlight
          </button>
          <span className="editor-context-divider" aria-hidden="true" />
          <button type="button" role="menuitem" onClick={runBodyText}>
            Body text
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runHeading(1)}
          >
            Heading 1
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runHeading(2)}
          >
            Heading 2
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runHeading(3)}
          >
            Heading 3
          </button>
          <span className="editor-context-divider" aria-hidden="true" />
          <button type="button" role="menuitem" onClick={runBulletList}>
            Bullet list
          </button>
          <button type="button" role="menuitem" onClick={runOrderedList}>
            Numbered list
          </button>
          {canConvertBullets ? (
            <button type="button" role="menuitem" onClick={runConvertBullets}>
              Turn • lines into a list
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={runBlockquote}>
            Blockquote
          </button>
          <button type="button" role="menuitem" onClick={runCodeBlock}>
            Code block
          </button>
          {contextMenuLink ? (
            <>
              <span className="editor-context-divider" aria-hidden="true" />
              <button
                type="button"
                role="menuitem"
                onClick={() => openLink(contextMenuLink)}
              >
                Open link
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => editLink(contextMenuLink)}
              >
                Edit link…
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => copyLink(contextMenuLink)}
              >
                Copy link
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => removeLink(contextMenuLink)}
              >
                Remove link
              </button>
            </>
          ) : (
            <button type="button" role="menuitem" onClick={promptForLink}>
              Link
            </button>
          )}
        </div>
      ) : null}
      {linkPreview && !contextMenuPosition && !linkDialogPos ? (
        <div
          className="link-preview"
          role="tooltip"
          style={{ left: linkPreview.x, top: linkPreview.y }}
        >
          {linkPreview.href}
        </div>
      ) : null}
      {linkDialogPos ? (
        <div
          className="link-dialog"
          style={{ left: linkDialogPos.x, top: linkDialogPos.y }}
        >
          <input
            ref={linkInputRef}
            key={_linkDialogInitialHref}
            type="text"
            defaultValue={_linkDialogInitialHref}
            placeholder="https://example.com"
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.currentTarget.value.trim()) {
                _linkDialogOnSubmit?.(e.currentTarget.value.trim());
                closeLinkDialog();
              }
            }}
          />
          <button
            onClick={() => {
              const val = linkInputRef.current?.value.trim();
              if (val) {
                _linkDialogOnSubmit?.(val);
                closeLinkDialog();
              }
            }}
          >
            OK
          </button>
        </div>
      ) : null}
    </div>
  );
  },
);
