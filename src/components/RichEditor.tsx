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
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, EditorView } from "@milkdown/kit/prose/view";
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
import { TableOfContents } from "./TableOfContents";
import { useTableOfContents, type TocEntry } from "../hooks/useTableOfContents";
import "@milkdown/kit/prose/view/style/prosemirror.css";

// Module-level state for the link dialog (used by formattingKeymap and component).
type LinkDialogCoords = { x: number; y: number };
let _linkDialogCoords: LinkDialogCoords | null = null;
let _linkDialogOnSubmit: ((href: string) => void) | null = null;
let _linkDialogSync: (() => void) | null = null;

function openLinkDialog(
  view: EditorView,
  onSubmit: (href: string) => void,
) {
  const coords = view.coordsAtPos(view.state.selection.from);
  _linkDialogCoords = { x: Math.round(coords.left), y: Math.round(coords.bottom) + 4 };
  _linkDialogOnSubmit = onSubmit;
  _linkDialogSync?.();
}

function closeLinkDialog() {
  _linkDialogCoords = null;
  _linkDialogOnSubmit = null;
  _linkDialogSync?.();
}

// True when the caret sits in the first paragraph of a list item, at its very
// start - the position where Backspace should outdent rather than merge the
// item into the one above it.
function isAtStartOfListItem(state: EditorState, listItem: NodeType) {
  const { $from, empty } = state.selection;

  return (
    empty &&
    $from.parentOffset === 0 &&
    $from.depth > 1 &&
    $from.node(-1).type === listItem &&
    $from.index(-1) === 0
  );
}

function isInEmptyListItem(state: EditorState, listItem: NodeType) {
  const { $from, empty } = state.selection;

  return (
    empty &&
    $from.depth > 1 &&
    $from.node(-1).type === listItem &&
    $from.node(-1).textContent.length === 0
  );
}

// A heading cannot be applied inside a list item, and the underlying command
// simply reports failure - which looked to the user like the menu item doing
// nothing at all. Step out of the list first, then apply it. Bounded in case
// the structure is deeper or lifting stops making progress.
function liftOutOfLists(view: EditorView, listItem: NodeType) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { $from } = view.state.selection;

    if ($from.depth < 2 || $from.node(-1).type !== listItem) {
      return;
    }

    if (!liftListItem(listItem)(view.state, view.dispatch)) {
      return;
    }
  }
}

function runBlockFormat(
  view: EditorView,
  cmd: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean,
) {
  if (cmd(view.state, view.dispatch)) return;

  lift(view.state, view.dispatch);
  cmd(view.state, view.dispatch);
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

  liftOutOfLists(view, listItemSchema.type(ctx));
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
      const listItem = listItemSchema.type(ctx);

      // Only claim the key at the start of a list item; everywhere else the
      // default delete behaviour is what you want. Without this, the default
      // joins the item into the one above, which drops the bullet but leaves
      // the text stranded inside the previous item.
      if (!isAtStartOfListItem(view.state, listItem)) {
        return false;
      }

      return liftListItem(listItem)(view.state, view.dispatch);
    },
    Enter: () => {
      const view = ctx.get(editorViewCtx);
      const listItem = listItemSchema.type(ctx);

      // Enter on an empty bullet leaves the list, the usual "press Enter
      // twice to stop making a list" behaviour. A bullet with text in it
      // still splits normally, so fall through.
      if (!isInEmptyListItem(view.state, listItem)) {
        return false;
      }

      return liftListItem(listItem)(view.state, view.dispatch);
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
          <button type="button" role="menuitem" onClick={promptForLink}>
            Link
          </button>
        </div>
      ) : null}
      {linkDialogPos ? (
        <div
          className="link-dialog"
          style={{ left: linkDialogPos.x, top: linkDialogPos.y }}
        >
          <input
            ref={linkInputRef}
            type="text"
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
