import { useEffect, useRef, useState, type MouseEvent } from "react";
import { CmdKey, Editor, defaultValueCtx, rootCtx } from "@milkdown/kit/core";
import {
  commonmark,
  createCodeBlockCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  wrapInBulletListCommand,
  wrapInBlockquoteCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { $prose, callCommand, replaceAll } from "@milkdown/kit/utils";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { normalizeMarkdownLineBreaks } from "../utils/markdown";
import "@milkdown/kit/prose/view/style/prosemirror.css";

type RichEditorProps = {
  value: string;
  onChange: (value: string) => void;
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

export function RichEditor({ value, onChange }: RichEditorProps) {
  const normalizedValue = normalizeMarkdownLineBreaks(value);

  return (
    <MilkdownProvider>
      <RichEditorInner value={normalizedValue} onChange={onChange} />
    </MilkdownProvider>
  );
}

function RichEditorInner({ value, onChange }: RichEditorProps) {
  const lastKnownMarkdown = useRef(value);
  const isSyncingFromApp = useRef(false);
  const [contextMenuPosition, setContextMenuPosition] =
    useState<ContextMenuPosition | null>(null);

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
        })
        .use(customEnterPlugin)
        .use(commonmark)
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

  const runCommand = <T,>(command: { key: CmdKey<T> }, payload?: T) => {
    const editor = get();

    if (!editor) {
      return;
    }

    editor.action(callCommand(command.key, payload));
    setContextMenuPosition(null);
  };

  const promptForLink = () => {
    const href = window.prompt("Link URL");

    if (!href?.trim()) {
      return;
    }

    runCommand(toggleLinkCommand, { href: href.trim() });
  };

  const openContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const menuWidth = 184;
    const menuHeight = 340;

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
            onClick={() => runCommand(toggleInlineCodeCommand)}
          >
            Inline code
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
            onClick={() => runCommand(wrapInBulletListCommand)}
          >
            Bullet list
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runCommand(wrapInOrderedListCommand)}
          >
            Numbered list
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runCommand(wrapInBlockquoteCommand)}
          >
            Blockquote
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runCommand(createCodeBlockCommand)}
          >
            Code block
          </button>
          <button type="button" role="menuitem" onClick={promptForLink}>
            Link
          </button>
        </div>
      ) : null}
    </div>
  );
}
