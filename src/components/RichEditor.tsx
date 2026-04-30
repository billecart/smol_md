import { useEffect, useRef } from "react";
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
} from "lucide-react";
import {
  CmdKey,
  Editor,
  defaultValueCtx,
  rootCtx,
} from "@milkdown/kit/core";
import {
  commonmark,
  createCodeBlockCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { callCommand, replaceAll } from "@milkdown/kit/utils";
import {
  Milkdown,
  MilkdownProvider,
  useEditor,
  useInstance,
} from "@milkdown/react";
import "@milkdown/kit/prose/view/style/prosemirror.css";

type RichEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

export function RichEditor({ value, onChange }: RichEditorProps) {
  return (
    <MilkdownProvider>
      <RichEditorInner value={value} onChange={onChange} />
    </MilkdownProvider>
  );
}

function RichEditorInner({ value, onChange }: RichEditorProps) {
  const lastKnownMarkdown = useRef(value);
  const isSyncingFromApp = useRef(false);

  const { loading, get } = useEditor(
    (root) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, value);
          ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
            lastKnownMarkdown.current = markdown;

            if (!isSyncingFromApp.current) {
              onChange(markdown);
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
      <RichFormatToolbar />
      <div className="rich-editor" aria-label="Rich Markdown editor">
        {loading ? <p className="editor-loading">Loading editor...</p> : null}
        <Milkdown />
      </div>
    </div>
  );
}

function RichFormatToolbar() {
  const [loading, getEditor] = useInstance();

  const run = <T,>(command: { key: CmdKey<T> }, payload?: T) => {
    if (loading) {
      return;
    }

    const editor = getEditor();
    editor.action(callCommand(command.key, payload));
  };

  const addLink = () => {
    const href = window.prompt("Link URL", "https://");

    if (!href) {
      return;
    }

    run(toggleLinkCommand, { href });
  };

  return (
    <div className="format-toolbar" aria-label="Rich editor formatting">
      <button
        type="button"
        title="Bold"
        aria-label="Bold"
        disabled={loading}
        onClick={() => run(toggleStrongCommand)}
      >
        <Bold aria-hidden="true" size={17} />
      </button>
      <button
        type="button"
        title="Italic"
        aria-label="Italic"
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
        disabled={loading}
        onClick={() => run(wrapInHeadingCommand, 1)}
      >
        <Heading1 aria-hidden="true" size={18} />
      </button>
      <button
        type="button"
        title="Heading 2"
        aria-label="Heading 2"
        disabled={loading}
        onClick={() => run(wrapInHeadingCommand, 2)}
      >
        <Heading2 aria-hidden="true" size={18} />
      </button>
      <button
        type="button"
        title="Heading 3"
        aria-label="Heading 3"
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
        disabled={loading}
        onClick={() => run(wrapInBulletListCommand)}
      >
        <List aria-hidden="true" size={18} />
      </button>
      <button
        type="button"
        title="Numbered list"
        aria-label="Numbered list"
        disabled={loading}
        onClick={() => run(wrapInOrderedListCommand)}
      >
        <ListOrdered aria-hidden="true" size={18} />
      </button>
      <span className="toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        title="Link"
        aria-label="Link"
        disabled={loading}
        onClick={addLink}
      >
        <Link aria-hidden="true" size={17} />
      </button>
      <button
        type="button"
        title="Inline code"
        aria-label="Inline code"
        disabled={loading}
        onClick={() => run(toggleInlineCodeCommand)}
      >
        <Code aria-hidden="true" size={17} />
      </button>
      <button
        type="button"
        title="Code block"
        aria-label="Code block"
        disabled={loading}
        onClick={() => run(createCodeBlockCommand)}
      >
        <FileCode2 aria-hidden="true" size={17} />
      </button>
    </div>
  );
}
