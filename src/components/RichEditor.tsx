import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Code,
  FileCode2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListOrdered,
  Redo2,
  Unlink,
  Undo2,
} from "lucide-react";
import {
  CmdKey,
  Editor,
  defaultValueCtx,
  editorViewCtx,
  rootCtx,
} from "@milkdown/kit/core";
import { Ctx } from "@milkdown/kit/ctx";
import {
  commonmark,
  createCodeBlockCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  updateLinkCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { redoDepth, undoDepth } from "@milkdown/kit/prose/history";
import { EditorState } from "@milkdown/kit/prose/state";
import { EditorView } from "@milkdown/kit/prose/view";
import { history, redoCommand, undoCommand } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { callCommand, replaceAll } from "@milkdown/kit/utils";
import {
  Milkdown,
  MilkdownProvider,
  useEditor,
  useInstance,
} from "@milkdown/react";
import { normalizeMarkdownLineBreaks } from "../utils/markdown";
import "@milkdown/kit/prose/view/style/prosemirror.css";

type RichEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

type ToolbarState = {
  bold: boolean;
  italic: boolean;
  headingLevel: number | null;
  bulletList: boolean;
  orderedList: boolean;
  link: boolean;
  linkHref: string;
  inlineCode: boolean;
  codeBlock: boolean;
  canUndo: boolean;
  canRedo: boolean;
};

const DEFAULT_TOOLBAR_STATE: ToolbarState = {
  bold: false,
  italic: false,
  headingLevel: null,
  bulletList: false,
  orderedList: false,
  link: false,
  linkHref: "",
  inlineCode: false,
  codeBlock: false,
  canUndo: false,
  canRedo: false,
};

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
  const [toolbarState, setToolbarState] = useState(DEFAULT_TOOLBAR_STATE);

  const { loading, get } = useEditor(
    (root) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, value);
          ctx
            .get(listenerCtx)
            .mounted((ctx) => updateToolbarState(ctx, setToolbarState))
            .selectionUpdated((ctx) => updateToolbarState(ctx, setToolbarState))
            .markdownUpdated((ctx, markdown) => {
              const normalizedMarkdown = normalizeMarkdownLineBreaks(markdown);
              lastKnownMarkdown.current = normalizedMarkdown;
              updateToolbarState(ctx, setToolbarState);

              if (!isSyncingFromApp.current) {
                onChange(normalizedMarkdown);
              }
            });
        })
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

  return (
    <div className="rich-editor-shell">
      <RichFormatToolbar toolbarState={toolbarState} />
      <div className="rich-editor" aria-label="Rich Markdown editor">
        {loading ? <p className="editor-loading">Loading editor...</p> : null}
        <Milkdown />
      </div>
    </div>
  );
}

type RichFormatToolbarProps = {
  toolbarState: ToolbarState;
};

function RichFormatToolbar({ toolbarState }: RichFormatToolbarProps) {
  const [loading, getEditor] = useInstance();
  const [isLinkPanelOpen, setIsLinkPanelOpen] = useState(false);
  const [linkHref, setLinkHref] = useState("");

  useEffect(() => {
    if (isLinkPanelOpen) {
      setLinkHref(toolbarState.linkHref);
    }
  }, [isLinkPanelOpen, toolbarState.linkHref]);

  const run = <T,>(command: { key: CmdKey<T> }, payload?: T) => {
    if (loading) {
      return;
    }

    const editor = getEditor();
    editor.action(callCommand(command.key, payload));
  };

  const openLinkPanel = () => {
    setLinkHref(toolbarState.linkHref);
    setIsLinkPanelOpen((isOpen) => !isOpen);
  };

  const applyLink = () => {
    const href = linkHref.trim();

    if (!href) {
      return;
    }

    if (toolbarState.link) {
      run(updateLinkCommand, { href });
    } else {
      run(toggleLinkCommand, { href });
    }

    setIsLinkPanelOpen(false);
  };

  const removeLink = () => {
    if (!toolbarState.link) {
      return;
    }

    run(toggleLinkCommand);
    setIsLinkPanelOpen(false);
  };

  return (
    <div className="format-toolbar" aria-label="Rich editor formatting">
      <button
        type="button"
        title="Undo"
        aria-label="Undo"
        disabled={loading || !toolbarState.canUndo}
        onClick={() => run(undoCommand)}
      >
        <Undo2 aria-hidden="true" size={17} />
      </button>
      <button
        type="button"
        title="Redo"
        aria-label="Redo"
        disabled={loading || !toolbarState.canRedo}
        onClick={() => run(redoCommand)}
      >
        <Redo2 aria-hidden="true" size={17} />
      </button>
      <span className="toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        title="Bold"
        aria-label="Bold"
        aria-pressed={toolbarState.bold}
        className={toolbarState.bold ? "active" : ""}
        disabled={loading}
        onClick={() => run(toggleStrongCommand)}
      >
        <Bold aria-hidden="true" size={17} />
      </button>
      <button
        type="button"
        title="Italic"
        aria-label="Italic"
        aria-pressed={toolbarState.italic}
        className={toolbarState.italic ? "active" : ""}
        disabled={loading}
        onClick={() => run(toggleEmphasisCommand)}
      >
        <Italic aria-hidden="true" size={17} />
      </button>
      <span className="toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        title="Heading 1"
        aria-label="Heading 1"
        aria-pressed={toolbarState.headingLevel === 1}
        className={toolbarState.headingLevel === 1 ? "active" : ""}
        disabled={loading}
        onClick={() => run(wrapInHeadingCommand, 1)}
      >
        <Heading1 aria-hidden="true" size={18} />
      </button>
      <button
        type="button"
        title="Heading 2"
        aria-label="Heading 2"
        aria-pressed={toolbarState.headingLevel === 2}
        className={toolbarState.headingLevel === 2 ? "active" : ""}
        disabled={loading}
        onClick={() => run(wrapInHeadingCommand, 2)}
      >
        <Heading2 aria-hidden="true" size={18} />
      </button>
      <button
        type="button"
        title="Heading 3"
        aria-label="Heading 3"
        aria-pressed={toolbarState.headingLevel === 3}
        className={toolbarState.headingLevel === 3 ? "active" : ""}
        disabled={loading}
        onClick={() => run(wrapInHeadingCommand, 3)}
      >
        <Heading3 aria-hidden="true" size={18} />
      </button>
      <span className="toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        title="Bullet list"
        aria-label="Bullet list"
        aria-pressed={toolbarState.bulletList}
        className={toolbarState.bulletList ? "active" : ""}
        disabled={loading}
        onClick={() => run(wrapInBulletListCommand)}
      >
        <List aria-hidden="true" size={18} />
      </button>
      <button
        type="button"
        title="Numbered list"
        aria-label="Numbered list"
        aria-pressed={toolbarState.orderedList}
        className={toolbarState.orderedList ? "active" : ""}
        disabled={loading}
        onClick={() => run(wrapInOrderedListCommand)}
      >
        <ListOrdered aria-hidden="true" size={18} />
      </button>
      <span className="toolbar-divider" aria-hidden="true" />
      <div className="link-tools">
        <button
          type="button"
          title="Link"
          aria-label="Link"
          aria-pressed={toolbarState.link}
          className={toolbarState.link ? "active" : ""}
          disabled={loading}
          onClick={openLinkPanel}
        >
          <Link aria-hidden="true" size={17} />
        </button>
        {isLinkPanelOpen ? (
          <form
            className="link-panel"
            onSubmit={(event) => {
              event.preventDefault();
              applyLink();
            }}
          >
            <label htmlFor="rich-editor-link-url">Link URL</label>
            <div className="link-panel-row">
              <input
                id="rich-editor-link-url"
                value={linkHref}
                onChange={(event) => setLinkHref(event.target.value)}
                placeholder="https://example.com"
                autoFocus
              />
              <button type="submit" disabled={!linkHref.trim()}>
                Apply
              </button>
              <button
                type="button"
                title="Remove link"
                aria-label="Remove link"
                disabled={!toolbarState.link}
                onClick={removeLink}
              >
                <Unlink aria-hidden="true" size={16} />
              </button>
            </div>
          </form>
        ) : null}
      </div>
      <button
        type="button"
        title="Inline code"
        aria-label="Inline code"
        aria-pressed={toolbarState.inlineCode}
        className={toolbarState.inlineCode ? "active" : ""}
        disabled={loading}
        onClick={() => run(toggleInlineCodeCommand)}
      >
        <Code aria-hidden="true" size={17} />
      </button>
      <button
        type="button"
        title="Code block"
        aria-label="Code block"
        aria-pressed={toolbarState.codeBlock}
        className={toolbarState.codeBlock ? "active" : ""}
        disabled={loading}
        onClick={() => run(createCodeBlockCommand)}
      >
        <FileCode2 aria-hidden="true" size={17} />
      </button>
    </div>
  );
}

function updateToolbarState(
  ctx: Ctx,
  setToolbarState: (state: ToolbarState) => void,
) {
  try {
    const view = ctx.get(editorViewCtx);
    setToolbarState(getToolbarState(view));
  } catch {
    setToolbarState(DEFAULT_TOOLBAR_STATE);
  }
}

function getToolbarState(view: EditorView): ToolbarState {
  const { state } = view;
  const { schema, selection } = state;
  const activeLink = getActiveLink(state);
  const headingLevel =
    selection.$from.parent.type.name === "heading"
      ? Number(selection.$from.parent.attrs.level)
      : null;

  return {
    bold: isMarkActive(state, schema.marks.strong),
    italic: isMarkActive(state, schema.marks.emphasis),
    headingLevel,
    bulletList: isNodeActive(state, "bullet_list"),
    orderedList: isNodeActive(state, "ordered_list"),
    link: Boolean(activeLink),
    linkHref: String(activeLink?.attrs.href ?? ""),
    inlineCode: isMarkActive(state, schema.marks.inlineCode),
    codeBlock: selection.$from.parent.type.name === "code_block",
    canUndo: undoDepth(state) > 0,
    canRedo: redoDepth(state) > 0,
  };
}

function isMarkActive(
  state: EditorState,
  markType: EditorState["schema"]["marks"][string],
) {
  const { from, to, empty } = state.selection;

  if (empty) {
    return Boolean(
      markType.isInSet(state.storedMarks ?? state.selection.$from.marks()),
    );
  }

  return state.doc.rangeHasMark(from, to, markType);
}

function isNodeActive(state: EditorState, nodeName: string) {
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === nodeName) {
      return true;
    }
  }

  return false;
}

function getActiveLink(state: EditorState) {
  const linkType = state.schema.marks.link;
  const { $from, from, to, empty } = state.selection;

  if (empty) {
    return linkType.isInSet(state.storedMarks ?? $from.marks());
  }

  let activeLink = null;
  state.doc.nodesBetween(from, to, (node) => {
    const link = linkType.isInSet(node.marks);

    if (link) {
      activeLink = link;
      return false;
    }

    return undefined;
  });

  return activeLink;
}
