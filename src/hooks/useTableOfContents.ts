import { useMemo } from 'react';

export type TocEntry = {
  level: number;
  text: string;
  id: string;
};

export function useTableOfContents(markdown: string): TocEntry[] {
  return useMemo(() => {
    const entries: TocEntry[] = [];
    const lines = markdown.split('\n');
    let inCodeBlock = false;
    
    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      
      if (inCodeBlock) continue;
      
      const match = line.match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2];
        // Generate an ID similar to what standard markdown parsers do
        const id = text
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-');
        
        entries.push({ level, text, id });
      }
    }
    
    return entries;
  }, [markdown]);
}

export function generateTocMarkdown(entries: TocEntry[]): string {
  if (entries.length === 0) return "";
  const tocLines = ["## Table of Contents"];
  entries.forEach((entry) => {
    const indent = Math.max(0, entry.level - 2) * 2;
    const spaces = " ".repeat(indent);
    tocLines.push(`${spaces}- [${entry.text}](#${entry.id})`);
  });
  tocLines.push(""); 
  return tocLines.join("\n");
}

