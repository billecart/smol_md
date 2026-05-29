import { useEffect, useRef, useState, type MouseEvent } from "react";
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
  toggleStrongCommand,
  wrapInHeadingCommand,
} from "@milkdown/kit/preset/commonmark";
import { gfm, toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import { lift, setBlockType, toggleMark, wrapIn } from "@milkdown/kit/prose/commands";
import { markRule } from "@milkdown/kit/prose";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, EditorView } from "@milkdown/kit/prose/view";
import { history } from "@milkdown/kit/plugin/history";
import { wrapInList } from "@milkdown/kit/prose/schema-list";
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

type ContextMenuPosition = {
  x: number;
  y: number;
};

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
      callCommand(wrapInHeadingCommand.key, 1)(ctx);
      return true;
    },
    "Mod-2": () => {
      callCommand(wrapInHeadingCommand.key, 2)(ctx);
      return true;
    },
    "Mod-3": () => {
      callCommand(wrapInHeadingCommand.key, 3)(ctx);
      return true;
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

// Option B: ProseMirror decoration plugin for in-page find.
const findPluginKey = new PluginKey<{ query: string; activeIndex: number }>(
  "smolFind",
);

const findDecorationPlugin = $prose(
  () =>
    new Plugin({
      key: findPluginKey,
      state: {
        init() {
          return { query: "", activeIndex: 0 };
        },
        apply(tr, prev) {
          const meta = tr.getMeta(findPluginKey) as
            | { query: string; activeIndex: number }
            | undefined;
          return meta ?? prev;
        },
      },
      props: {
        decorations(state) {
          const { query, activeIndex } = findPluginKey.getState(state) ?? {
            query: "",
            activeIndex: 0,
          };
          if (!query) return DecorationSet.empty;

          const decorations: Decoration[] = [];
          const q = query.toLowerCase();
          let matchIndex = 0;

          state.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return;
            const text = node.text.toLowerCase();
            let offset = 0;
            while (true) {
              const idx = text.indexOf(q, offset);
              if (idx === -1) break;
              const cls =
                matchIndex === activeIndex
                  ? "smol-find-match smol-find-match-active"
                  : "smol-find-match";
              decorations.push(
                Decoration.inline(pos + idx, pos + idx + q.length, {
                  class: cls,
                }),
              );
              matchIndex++;
              offset = idx + q.length;
            }
          });

          return DecorationSet.create(state.doc, decorations);
        },
      },
    }),
);

export function RichEditor({
  value,
  onChange,
  findQuery = "",
  findActiveIndex = 0,
  onFindMatchCount,
}: RichEditorProps) {
  const normalizedValue = normalizeMarkdownLineBreaks(value);

  return (
    <MilkdownProvider>
      <RichEditorInner
        value={normalizedValue}
        onChange={onChange}
        findQuery={findQuery}
        findActiveIndex={findActiveIndex}
        onFindMatchCount={onFindMatchCount}
      />
    </MilkdownProvider>
  );
}

function RichEditorInner({
  value,
  onChange,
  findQuery,
  findActiveIndex,
  onFindMatchCount,
}: RichEditorProps) {
  const lastKnownMarkdown = useRef(value);
  const isSyncingFromApp = useRef(false);
  const [contextMenuPosition, setContextMenuPosition] =
    useState<ContextMenuPosition | null>(null);
  const [linkDialogPos, setLinkDialogPos] = useState<LinkDialogCoords | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

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

  // Sync find query + active index into the ProseMirror decoration plugin.
  useEffect(() => {
    if (loading) return;
    const editor = get();
    if (!editor) return;

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      // Compute match count while dispatching so we do one doc walk.
      let count = 0;
      if (findQuery) {
        const q = findQuery.toLowerCase();
        view.state.doc.descendants((node) => {
          if (!node.isText || !node.text) return;
          const text = node.text.toLowerCase();
          let offset = 0;
          while (true) {
            const idx = text.indexOf(q, offset);
            if (idx === -1) break;
            count++;
            offset = idx + q.length;
          }
        });
      }
      onFindMatchCount?.(count);
      view.dispatch(
        view.state.tr.setMeta(findPluginKey, {
          query: findQuery ?? "",
          activeIndex: findActiveIndex ?? 0,
        }),
      );
    });
  }, [loading, get, findQuery, findActiveIndex, onFindMatchCount]);

  // Scroll active match into view when activeIndex changes.
  useEffect(() => {
    if (loading || !findQuery) return;
    const editor = get();
    if (!editor) return;

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
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const editor = get();
              if (!editor) return;
              editor.action((ctx) => {
                runBlockFormat(ctx.get(editorViewCtx), wrapInList(bulletListSchema.type(ctx)));
              });
              setContextMenuPosition(null);
            }}
          >
            Bullet list
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const editor = get();
              if (!editor) return;
              editor.action((ctx) => {
                runBlockFormat(ctx.get(editorViewCtx), wrapInList(orderedListSchema.type(ctx)));
              });
              setContextMenuPosition(null);
            }}
          >
            Numbered list
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const editor = get();
              if (!editor) return;
              editor.action((ctx) => {
                runBlockFormat(ctx.get(editorViewCtx), wrapIn(blockquoteSchema.type(ctx)));
              });
              setContextMenuPosition(null);
            }}
          >
            Blockquote
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const editor = get();
              if (!editor) return;
              editor.action((ctx) => {
                runBlockFormat(ctx.get(editorViewCtx), setBlockType(codeBlockSchema.type(ctx)));
              });
              setContextMenuPosition(null);
            }}
          >
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
}
