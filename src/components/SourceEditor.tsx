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

  useEffect(() => {
    const textarea = textareaRef.current;
    const start = matchOffsets[findActiveIndex];

    if (!textarea || start === undefined) {
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
