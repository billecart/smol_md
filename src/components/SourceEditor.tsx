type SourceEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SourceEditor({ value, onChange }: SourceEditorProps) {
  return (
    <textarea
      className="source-editor"
      aria-label="Markdown source"
      spellCheck="true"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="# Start writing"
    />
  );
}

