import { normalizeMarkdownLineBreaks } from "../utils/markdown";

type SourceEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SourceEditor({ value, onChange }: SourceEditorProps) {
  const normalizedValue = normalizeMarkdownLineBreaks(value);

  return (
    <textarea
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
