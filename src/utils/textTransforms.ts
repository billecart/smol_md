// Edit > Transformations and Edit > Substitutions, as plain text functions so
// both editors (and the tests) share them.

export type TextTransform = "upper" | "lower" | "capitalize";

const WORD_CHARACTER = /[\p{L}\p{N}'’]/u;

// `before` is the character just ahead of `text` (empty at the start of a
// paragraph), so Capitalize can tell whether `text` starts mid-word when a
// selection is split across bold/italic runs.
export function transformText(text: string, transform: TextTransform, before = "") {
  if (transform === "upper") return text.toUpperCase();
  if (transform === "lower") return text.toLowerCase();

  // Like macOS: the first letter of every word up, the rest down.
  let previous = before;
  let result = "";

  for (const character of text) {
    result += WORD_CHARACTER.test(previous) ? character.toLowerCase() : character.toUpperCase();
    previous = character;
  }

  return result;
}

const OPENS_QUOTE = /[\s([{<—–-]/u;

// The curly quote to type for a straight one, given the character before it.
export function smartQuote(quote: '"' | "'", before: string) {
  const opening = before === "" || OPENS_QUOTE.test(before);

  if (quote === '"') return opening ? "“" : "”";
  return opening ? "‘" : "’";
}

function isMostlyCyrillic(text: string) {
  const cyrillic = text.match(/\p{Script=Cyrillic}/gu)?.length ?? 0;
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  return cyrillic > latin;
}

// A typed straight double quote, given the paragraph's text up to the cursor.
// Russian text gets « », everything else “ ”. An opening quote is a guess
// from the text around it; the closing quote looks at what was actually
// quoted and fixes the opening one to match, so «Привет» comes out right
// even at the start of a line or inside an English sentence.
export function smartDoubleQuote(textBefore: string): {
  insert: string;
  // Where the opening quote is, and what it should become.
  opening?: { index: number; quote: string };
} {
  const previous = textBefore.slice(-1);

  if (previous === "" || OPENS_QUOTE.test(previous)) {
    return { insert: isMostlyCyrillic(textBefore) ? "\u00AB" : "\u201C" };
  }

  const index = Math.max(textBefore.lastIndexOf("\u201C"), textBefore.lastIndexOf("\u00AB"));
  const isOpen =
    index !== -1 && !/[\u201D\u00BB]/u.test(textBefore.slice(index + 1));

  if (!isOpen) {
    return { insert: isMostlyCyrillic(textBefore) ? "\u00BB" : "\u201D" };
  }

  const russian = isMostlyCyrillic(textBefore.slice(index + 1));
  return {
    insert: russian ? "\u00BB" : "\u201D",
    opening: { index, quote: russian ? "\u00AB" : "\u201C" },
  };
}

export function isWordCharacter(character: string) {
  return WORD_CHARACTER.test(character);
}
