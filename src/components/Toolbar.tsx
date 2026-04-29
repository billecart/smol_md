import {
  FilePlus2,
  FolderOpen,
  Save,
  SaveAll,
} from "lucide-react";

type ToolbarProps = {
  isDirty: boolean;
  canSave: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
};

export function Toolbar({
  isDirty,
  canSave,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark">s</span>
        <span>smol_md</span>
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
    </header>
  );
}

