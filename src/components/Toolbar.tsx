import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Menu, Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import appIcon from "../assets/icons/s.svg";
import smolLogo from "../assets/icons/smol_md.svg";
import { isRunningInTauri } from "../services/fileService";

type EditorMode = "rich" | "source";

type ToolbarProps = {
  canSave: boolean;
  editorMode: EditorMode;
  tabs: ReactNode;
  onNew: () => void | Promise<void>;
  onOpen: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onSaveAs: () => void | Promise<void>;
  onClose: () => void | Promise<void>;
  onCloseAll: () => void | Promise<void>;
  onCloseWindow: () => void | Promise<void>;
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
  onClose,
  onCloseAll,
  onCloseWindow,
  onEditorModeChange,
}: ToolbarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isDesktopApp = isRunningInTauri();

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  const runMenuCommand = async (command: () => void | Promise<void>) => {
    setIsMenuOpen(false);
    await command();
  };

  const startWindowDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDesktopApp || event.button !== 0) {
      return;
    }

    void getCurrentWindow().startDragging();
  };

  const toggleWindowMaximize = () => {
    if (!isDesktopApp) {
      return;
    }

    void getCurrentWindow().toggleMaximize();
  };

  const minimizeWindow = () => {
    void getCurrentWindow().minimize();
  };

  return (
    <>
      <header className="app-bar">
        <div className="app-menu" ref={menuRef}>
          <img className="app-icon" src={appIcon} alt="" aria-hidden="true" />
          <button
            type="button"
            className="menu-trigger"
            aria-label="open menu"
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            onClick={() => setIsMenuOpen((current) => !current)}
            title="menu"
          >
            <Menu aria-hidden="true" size={18} strokeWidth={1.8} />
          </button>

          {isMenuOpen ? (
            <nav className="command-menu" aria-label="file commands">
              <button type="button" onClick={() => void runMenuCommand(onNew)}>
                new
              </button>
              <button type="button" onClick={() => void runMenuCommand(onOpen)}>
                open
              </button>
              <button
                type="button"
                disabled={!canSave}
                onClick={() => void runMenuCommand(onSave)}
              >
                save
              </button>
              <button
                type="button"
                onClick={() => void runMenuCommand(onSaveAs)}
              >
                save as
              </button>
              <div className="command-menu-divider" aria-hidden="true" />
              <button type="button" onClick={() => void runMenuCommand(onClose)}>
                close
              </button>
              <button
                type="button"
                onClick={() => void runMenuCommand(onCloseAll)}
              >
                close all
              </button>
              <div className="command-menu-divider" aria-hidden="true" />
              <button
                type="button"
                onClick={() => void runMenuCommand(onCloseWindow)}
              >
                quit
              </button>
            </nav>
          ) : null}
        </div>
        <div
          className="window-drag-region"
          aria-hidden="true"
          onDoubleClick={toggleWindowMaximize}
          onPointerDown={startWindowDrag}
        />
        {isDesktopApp ? (
          <div className="window-controls" aria-label="Window controls">
            <button type="button" onClick={minimizeWindow} title="Minimize">
              <Minus aria-hidden="true" size={14} />
            </button>
            <button
              type="button"
              onClick={toggleWindowMaximize}
              title="Maximize"
            >
              <Square aria-hidden="true" size={12} />
            </button>
            <button
              type="button"
              className="window-close"
              onClick={() => void onCloseWindow()}
              title="Close"
            >
              <X aria-hidden="true" size={15} />
            </button>
          </div>
        ) : null}
      </header>

      <header className="tab-bar">
        <div className="tab-brand">
          <img className="brand-logo" src={smolLogo} alt="smol_md" />
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
        </div>
      </header>
    </>
  );
}
