import {
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
} from "@milkdown/kit/core";
import {
  blockquoteSchema,
  bulletListSchema,
  codeBlockSchema,
  commonmark,
  headingSchema,
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
  replaceAll,
} from "@milkdown/kit/utils";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { SKIP, visit } from "unist-util-visit";
import { normalizeMarkdownLineBreaks } from "../utils/markdown";
import {
  MARKDOWN_LINK_INPUT,
  splitMarkdownLinks,
} from "../utils/markdownLinks";
import {
  backspaceMergesHeadingAsBodyText,
  backspaceOutdentsListItem,
  chainCommands,
  enterLeavesEmptyListItem,
  findLinkAt,
  liftOutOfWrappers,
  makeBodyText,
  removeLinkAt,
  runBlockFormat,
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
  | "blockquote"
  | "code-block"
  | "link"
  | "highlight";

export type RichEditorHandle = {
  runFormatCommand: (command: FormatCommandId) => void;
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
          if (event.key !== "Enter" || !view.state.selection.empty) {
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
      openLinkDialog(view, (href) => {
        callCommand(toggleLinkCommand.key, { href })(ctx);
      });
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

// Highlight mark: ==text== syntax rendered as <mark>.
// The remark plugin transforms ==text== text nodes into highlight MDAST nodes
// during parsing; the stringify handler converts them back to ==text==.
function remarkHighlightTransformer() {
  return (tree: Parameters<typeof visit>[0]) => {
    visit(tree, "text", (node: any, index: any, parent: any) => {
      if (index == null || !parent?.children) return;
      const value: string = node.value;
      const re = /==([^=\n]+)==/g;
      if (!re.test(value)) return;
      re.lastIndex = 0;

      const newNodes: any[] = [];
      let last = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(value)) !== null) {
        if (match.index > last) {
          newNodes.push({ type: "text", value: value.slice(last, match.index) });
        }
        newNodes.push({
          type: "highlight",
          children: [{ type: "text", value: match[1] }],
        });
        last = match.index + match[0].length;
      }
      if (last < value.length) {
        newNodes.push({ type: "text", value: value.slice(last) });
      }

      parent.children.splice(index, 1, ...newNodes);
      return [SKIP, index + newNodes.length] as const;
    });
  };
}

const highlightRemarkPlugin = $remark(
  "highlight",
  () => remarkHighlightTransformer,
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
// Only plain single-line pastes are touched: anything carrying HTML already
// has its own links, and a multi-line paste is a document rather than a link.
const markdownLinkPastePlugin = $prose((ctx) => {
  return new Plugin({
    key: new PluginKey("smolMarkdownLinkPaste"),
    props: {
      handlePaste: (view, event) => {
        const clipboard = event.clipboardData;
        if (!clipboard) return false;
        if (clipboard.types.includes("text/html")) return false;
        if (view.state.selection.$from.parent.type.spec.code) return false;

        const text = clipboard.getData("text/plain");
        if (!text || text.includes("\n")) return false;

        const segments = splitMarkdownLinks(text);
        if (!segments) return false;

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
      },
    },
  });
});

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
    { value, onChange, findQuery = "", findActiveIndex = 0, onFindMatchCount },
    ref,
  ) {
    const normalizedValue = normalizeMarkdownLineBreaks(value);

    return (
      <MilkdownProvider>
        <RichEditorInner
          ref={ref}
          value={normalizedValue}
          onChange={onChange}
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
    { value, onChange, findQuery, findActiveIndex, onFindMatchCount },
    ref,
  ) {
  const lastKnownMarkdown = useRef(value);
  const isSyncingFromApp = useRef(false);
  const [contextMenuLink, setContextMenuLink] = useState<LinkRange | null>(null);
  const [contextMenuPosition, setContextMenuPosition] =
    useState<ContextMenuPosition | null>(null);
  const [linkDialogPos, setLinkDialogPos] = useState<LinkDialogCoords | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

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
          ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
            const normalizedMarkdown = normalizeMarkdownLineBreaks(markdown);
            lastKnownMarkdown.current = normalizedMarkdown;

            if (!isSyncingFromApp.current) {
              onChange(normalizedMarkdown);
            }
          });
          // Register ==text== serializer for the highlight MDAST node type.
          const stringifyOpts = ctx.get(remarkStringifyOptionsCtx);
          ctx.set(remarkStringifyOptionsCtx, {
            ...stringifyOpts,
            handlers: {
              ...(stringifyOpts as any).handlers,
              highlight: (node: any, _parent: any, state: any, info: any) => {
                const exit = state.enter("highlight");
                const value = state.containerPhrasing(node, {
                  before: "=",
                  after: "=",
                  ...info,
                });
                exit();
                return `==${value}==`;
              },
            },
          });
        })
        .use(highlightRemarkPlugin)
        .use(highlightSchema)
        .use(highlightInputRule)
        .use(linkInputRule)
        .use(markdownLinkPastePlugin)
        .use(toggleHighlightCommand)
        .use(customEnterPlugin)
        .use(formattingKeymap)
        .use(findDecorationPlugin)
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener),
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

    isSyncingFromApp.current = true;
    editor.action(replaceAll(value, true));
    lastKnownMarkdown.current = value;
    window.queueMicrotask(() => {
      isSyncingFromApp.current = false;
    });
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
      openLinkDialog(view, (href) => {
        callCommand(toggleLinkCommand.key, { href })(ctx);
      });
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

  useImperativeHandle(ref, () => ({ runFormatCommand }));
  const openContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const menuWidth = 184;
    const menuHeight = 420;

    // Resolve the link from where the pointer actually is rather than from the
    // selection: whether a right-click moves the caret is up to the browser,
    // and this editor runs in Chromium in dev and WebKit when packaged.
    const editor = get();
    let link: LinkRange | null = null;

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

      link = findLinkAt(view.state, linkSchema.type(ctx), at.pos);
    });

    setContextMenuLink(link);

    setContextMenuPosition({
      x: Math.min(event.clientX, window.innerWidth - menuWidth - 8),
      y: Math.min(event.clientY, window.innerHeight - menuHeight - 8),
    });
  };

  return (
    <div className="rich-editor-shell" onContextMenu={openContextMenu}>
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
            onClick={() => runCommand(wrapInHeadingCommand, 1)}
          >
            Heading 1
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runCommand(wrapInHeadingCommand, 2)}
          >
            Heading 2
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runCommand(wrapInHeadingCommand, 3)}
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
