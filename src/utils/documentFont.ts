export type DocumentFont = "mono" | "sans" | "serif";

export const DOCUMENT_FONTS: DocumentFont[] = ["mono", "sans", "serif"];

const DOCUMENT_FONT_KEY = "smol_md.documentFont";

export function isDocumentFont(value: unknown): value is DocumentFont {
  return DOCUMENT_FONTS.includes(value as DocumentFont);
}

export function loadDocumentFont(): DocumentFont {
  if (typeof localStorage === "undefined") {
    return "mono";
  }

  try {
    const storedValue = localStorage.getItem(DOCUMENT_FONT_KEY);
    return isDocumentFont(storedValue) ? storedValue : "mono";
  } catch {
    return "mono";
  }
}

export function saveDocumentFont(font: DocumentFont) {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(DOCUMENT_FONT_KEY, font);
  } catch {
    // Losing the preference only means the next launch starts in mono.
  }
}

// app.css switches --font-document on this attribute, so the choice reaches
// both editors and print without either one knowing about it.
export function applyDocumentFont(font: DocumentFont) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.documentFont = font;
}
