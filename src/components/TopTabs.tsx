import { X } from "lucide-react";
import type { OpenDocument } from "../hooks/useDocumentState";

type TopTabsProps = {
  documents: OpenDocument[];
  activeDocumentId: string;
  onSelectDocument: (documentId: string) => void;
  onCloseDocument: (documentId: string) => void;
};

export function TopTabs({
  documents,
  activeDocumentId,
  onSelectDocument,
  onCloseDocument,
}: TopTabsProps) {
  return (
    <div className="top-tabs" role="tablist" aria-label="Open documents">
      {documents.map((document) => {
        const isActive = document.id === activeDocumentId;

        return (
          <div
            key={document.id}
            className={isActive ? "tab active" : "tab"}
            role="tab"
            aria-selected={isActive}
          >
            <button
              type="button"
              className="tab-label"
              onClick={() => onSelectDocument(document.id)}
              title={document.filePath ?? document.fileName}
            >
              <span
                className={document.isDirty ? "dirty-dot" : "saved-dot"}
                aria-hidden="true"
              />
              <span>{getTabLabel(document.fileName)}</span>
            </button>
            <button
              type="button"
              className="tab-close"
              onClick={() => onCloseDocument(document.id)}
              title={`Close ${document.fileName}`}
              aria-label={`Close ${document.fileName}`}
            >
              <X aria-hidden="true" size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function getTabLabel(fileName: string) {
  return fileName.replace(/\.(md|markdown)$/i, "");
}
