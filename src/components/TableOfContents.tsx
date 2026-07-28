import { useState } from "react";
import { type TocEntry } from "../hooks/useTableOfContents";

type TableOfContentsProps = {
  entries: TocEntry[];
  onNavigate: (entry: TocEntry) => void;
};

export function TableOfContents({
  entries,
  onNavigate,
}: TableOfContentsProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  // If there are no entries, we do not even render the trigger area.
  // The panel will be permanently collapsed.
  const isExpanded = isHovered && entries.length > 0;

  return (
    <div
      className={`toc-panel ${isExpanded ? "toc-panel-expanded" : "toc-panel-collapsed"}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="toc-panel-content">
        <div className="toc-header">
          <h3>Contents</h3>
        </div>
        
        {entries.length === 0 ? (
          <p className="toc-empty">No headings found</p>
        ) : (
          <ul className="toc-list">
            {entries.map((entry, idx) => (
              <li
                key={`${entry.id}-${idx}`}
                className={`toc-item toc-level-${entry.level}`}
              >
                <button
                  type="button"
                  className="toc-link"
                  onClick={() => onNavigate(entry)}
                  title={`Navigate to ${entry.text}`}
                >
                  {entry.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      
      {/* Invisible trigger area that spans the right edge of the screen */}
      {!isHovered && entries.length > 0 && (
        <div className="toc-trigger-area" aria-hidden="true" />
      )}
    </div>
  );
}
