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

export function isWordCharacter(character: string) {
  return WORD_CHARACTER.test(character);
}
