import {
  FilePlus2,
  FolderOpen,
  Save,
  SaveAll,
} from "lucide-react";
import type { ReactNode } from "react";

type EditorMode = "rich" | "source";

type ToolbarProps = {
  canSave: boolean;
  editorMode: EditorMode;
  tabs: ReactNode;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onEditorModeChange: (mode: EditorMode) => void;
};

export function Toolbar({
  canSave,
  editorMode,
  tabs,
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

      {tabs}

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
            disabled={!canSave}
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
