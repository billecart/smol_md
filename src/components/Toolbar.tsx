import {
  FilePlus2,
  FolderOpen,
  Save,
  SaveAll,
} from "lucide-react";

type EditorMode = "rich" | "source";

type ToolbarProps = {
  fileName: string;
  isDirty: boolean;
  canSave: boolean;
  editorMode: EditorMode;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onEditorModeChange: (mode: EditorMode) => void;
};

export function Toolbar({
  fileName,
  isDirty,
  canSave,
  editorMode,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onEditorModeChange,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark">s</span>
        <span>smol_md</span>
      </div>

      <p className="toolbar-document-title">
        <span
          className={isDirty ? "dirty-dot" : "saved-dot"}
          aria-hidden="true"
        />
        <span>{fileName}</span>
      </p>

      <div className="toolbar-controls">
        <div className="mode-switch" aria-label="Editor mode">
          <button
            type="button"
            className={editorMode === "rich" ? "active" : ""}
            aria-pressed={editorMode === "rich"}
            onClick={() => onEditorModeChange("rich")}
          >
            Rich
          </button>
          <button
            type="button"
            className={editorMode === "source" ? "active" : ""}
            aria-pressed={editorMode === "source"}
            onClick={() => onEditorModeChange("source")}
          >
            Source
          </button>
        </div>

        <nav className="toolbar-actions" aria-label="File actions">
          <button type="button" onClick={onNew} title="New document">
            <FilePlus2 aria-hidden="true" size={18} />
            <span>New</span>
          </button>
          <button type="button" onClick={onOpen} title="Open Markdown file">
            <FolderOpen aria-hidden="true" size={18} />
            <span>Open</span>
          </button>
          <button
            type="button"
            onClick={onSave}
            title="Save"
            disabled={!canSave && !isDirty}
          >
            <Save aria-hidden="true" size={18} />
            <span>Save</span>
          </button>
          <button type="button" onClick={onSaveAs} title="Save As">
            <SaveAll aria-hidden="true" size={18} />
            <span>Save As</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
