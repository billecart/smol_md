import { useEffect, useRef, type KeyboardEvent } from "react";
import { X } from "lucide-react";

type FindBarProps = {
  query: string;
  matchCount: number;
  activeIndex: number;
  onQueryChange: (q: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
};

export function FindBar({
  query,
  matchCount,
  activeIndex,
  onQueryChange,
  onNext,
  onPrev,
  onClose,
}: FindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      onClose();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        onPrev();
      } else {
        onNext();
      }
    }
  };

  const counter =
    query && matchCount > 0
      ? `${activeIndex + 1} / ${matchCount}`
      : query && matchCount === 0
        ? "No results"
        : "";

  return (
    <div className="find-bar" role="search" aria-label="Find in document">
      <input
        ref={inputRef}
        className="find-bar-input"
        type="text"
        placeholder="Find…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Search text"
      />
      {counter ? (
        <span className="find-bar-counter" aria-live="polite">
          {counter}
        </span>
      ) : null}
      <button
        type="button"
        className="find-bar-close"
        aria-label="Close find bar"
        onClick={onClose}
      >
        <X size={14} />
      </button>
    </div>
  );
}
