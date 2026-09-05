export type CounterMode = "words" | "characters";

// Compared inline rather than looked up in a Set. This runs once per character
// of the whole document, so on a 500KB file a Set.has() call per character cost
// roughly ten times as much as these comparisons and dominated every keystroke.
function isWhitespaceCode(code: number) {
  return (
    code === 0x20 || // space
    code === 0x0a || // line feed
    code === 0x09 || // tab
    code === 0x0d || // carriage return
    code === 0x0b || // vertical tab
    code === 0x0c || // form feed
    code === 0xa0 // non-breaking space
  );
}

export function countWords(markdown: string) {
  let words = 0;
  let inWord = false;

  for (let i = 0; i < markdown.length; i++) {
    const isWhitespace = isWhitespaceCode(markdown.charCodeAt(i));

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
