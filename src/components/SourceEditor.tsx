import { useEffect, useMemo, useRef } from "react";
import { normalizeMarkdownLineBreaks } from "../utils/markdown";
import { findMatchOffsets, lineIndexAtOffset } from "../utils/findMatches";

type SourceEditorProps = {
  value: string;
  onChange: (value: string) => void;
  findQuery?: string;
  findActiveIndex?: number;
  onFindMatchCount?: (count: number) => void;
};

export function SourceEditor({
  value,
  onChange,
  findQuery = "",
  findActiveIndex = 0,
  onFindMatchCount,
}: SourceEditorProps) {
  const normalizedValue = normalizeMarkdownLineBreaks(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const matchOffsets = useMemo(
    () => findMatchOffsets(normalizedValue, findQuery),
    [normalizedValue, findQuery],
  );

  useEffect(() => {
    onFindMatchCount?.(matchOffsets.length);
  }, [matchOffsets, onFindMatchCount]);

  // Which match was last shown. Edits change the match offsets, and this
  // effect used to re-run on each one: with Find open, every keystroke in
  // the text pulled the selection back onto the match, so the next character
  // typed over it.
  const lastShownMatch = useRef({ query: "", index: -1 });

  useEffect(() => {
    const textarea = textareaRef.current;
    const start = matchOffsets[findActiveIndex];

    if (!findQuery) {
      // Find closed: show the first match again when it reopens.
      lastShownMatch.current = { query: "", index: -1 };
    }

    if (!textarea || start === undefined) {
      return;
    }

    const shown = lastShownMatch.current;
    if (shown.query === findQuery && shown.index === findActiveIndex) {
      return;
    }
    lastShownMatch.current = { query: findQuery, index: findActiveIndex };

    // Someone typing in the text is not looking for the next match.
    if (document.activeElement === textarea) {
      return;
    }

    // A textarea cannot be decorated the way the rich editor is, so the active
    // match is shown as a selection instead. Set it without focusing: the find
    // input must keep the caret so the user can carry on typing their query.
    textarea.selectionStart = start;
    textarea.selectionEnd = start + findQuery.length;

    const lineHeight =
      parseFloat(getComputedStyle(textarea).lineHeight) || 20;
    const line = lineIndexAtOffset(normalizedValue, start);
    const target = line * lineHeight - textarea.clientHeight / 2;

    textarea.scrollTop = Math.max(0, target);
  }, [matchOffsets, findActiveIndex, findQuery, normalizedValue]);

  return (
    <textarea
      ref={textareaRef}
      className="source-editor"
      aria-label="Markdown source"
      spellCheck="true"
      value={normalizedValue}
      onChange={(event) =>
        onChange(normalizeMarkdownLineBreaks(event.target.value))
      }
      placeholder="# Start writing"
    />
  );
}
