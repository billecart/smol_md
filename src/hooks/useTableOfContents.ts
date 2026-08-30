import { useMemo } from "react";
import { extractHeadings, type TocEntry } from "../utils/tableOfContents";

export type { TocEntry };

export function useTableOfContents(markdown: string): TocEntry[] {
  return useMemo(() => extractHeadings(markdown), [markdown]);
}
