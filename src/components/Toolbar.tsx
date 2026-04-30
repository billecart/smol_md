import type { ReactNode } from "react";
import duplicateIcon from "../assets/icons/duplicate.svg";
import newIcon from "../assets/icons/new.svg";
import openIcon from "../assets/icons/open.svg";
import saveIcon from "../assets/icons/save.svg";
import smolLogo from "../assets/icons/smol.svg";

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
        <img className="brand-logo" src={smolLogo} alt="smol" />
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
            <img
              className="toolbar-icon"
              src={newIcon}
              alt=""
              aria-hidden="true"
            />
            <span>New</span>
          </button>
          <button type="button" onClick={onOpen} title="Open Markdown file">
            <img
              className="toolbar-icon"
              src={openIcon}
              alt=""
              aria-hidden="true"
            />
            <span>Open</span>
          </button>
          <button
            type="button"
            onClick={onSave}
            title="Save"
            disabled={!canSave}
          >
            <img
              className="toolbar-icon"
              src={saveIcon}
              alt=""
              aria-hidden="true"
            />
            <span>Save</span>
          </button>
          <button type="button" onClick={onSaveAs} title="Save As">
            <img
              className="toolbar-icon"
              src={duplicateIcon}
              alt=""
              aria-hidden="true"
            />
            <span>Save As</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
