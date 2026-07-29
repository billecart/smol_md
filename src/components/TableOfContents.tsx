import { type TocEntry } from "../hooks/useTableOfContents";

type TableOfContentsProps = {
  entries: TocEntry[];
  onNavigate: (entry: TocEntry) => void;
};

export function TableOfContents({
  entries,
  onNavigate,
}: TableOfContentsProps) {
  if (entries.length === 0) return null;

  return (
    <div className="toc-wrapper">
      <div className="toc-trigger-area" aria-hidden="true" />
      <div className="toc-panel-content">
        <div className="toc-header">
          <h3>Contents</h3>
        </div>
        
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
      </div>
    </div>
  );
}
