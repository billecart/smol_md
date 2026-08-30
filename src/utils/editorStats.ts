export type CounterMode = "words" | "characters";

const WHITESPACE_CODES = new Set([
  0x09, // tab
  0x0a, // line feed
  0x0b, // vertical tab
  0x0c, // form feed
  0x0d, // carriage return
  0x20, // space
  0xa0, // non-breaking space
]);

export function countWords(markdown: string) {
  let words = 0;
  let inWord = false;

  for (let i = 0; i < markdown.length; i++) {
    const isWhitespace = WHITESPACE_CODES.has(markdown.charCodeAt(i));

    if (isWhitespace) {
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      words++;
    }
  }

  return words;
}

export function countCharacters(markdown: string) {
  return markdown.length;
}
