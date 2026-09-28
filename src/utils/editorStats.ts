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

// Characters that make up block markdown syntax: heading "#", list "-" "*" "+",
// quote ">", rules "---" "***" "___", setext "===", table "|" and ":", fences
// "```" "~~~", task boxes "[" "]", and the "." / ")" of ordered list markers.
// A run made only of these is markup the reader never sees, so it is not a word.
function isSyntaxCode(code: number) {
  return (
    code === 0x23 || // #
    code === 0x2d || // -
    code === 0x2a || // *
    code === 0x2b || // +
    code === 0x3e || // >
    code === 0x7c || // |
    code === 0x3a || // :
    code === 0x60 || // `
    code === 0x7e || // ~
    code === 0x3d || // =
    code === 0x5f || // _
    code === 0x5b || // [
    code === 0x5d || // ]
    code === 0x2e || // .
    code === 0x29 // )
  );
}

function isDigitCode(code: number) {
  return code >= 0x30 && code <= 0x39;
}

// "1." or "12)" as the first thing on a line is an ordered list marker. The same
// run later in a line ("in 2024.") is text. Only called for runs made of digits
// and syntax, which are rare, so the rescan stays off the hot path.
function isOrderedListMarker(markdown: string, start: number, end: number) {
  const last = markdown.charCodeAt(end - 1);
  if (last !== 0x2e && last !== 0x29) return false;
  for (let i = start; i < end - 1; i++) {
    if (!isDigitCode(markdown.charCodeAt(i))) return false;
  }
  return end - start > 1;
}

// "[x]" is a checked task box; its "x" is not a word.
function isCheckedTaskBox(markdown: string, start: number, end: number) {
  if (end - start !== 3) return false;
  const middle = markdown.charCodeAt(start + 1);
  return (
    markdown.charCodeAt(start) === 0x5b &&
    markdown.charCodeAt(start + 2) === 0x5d &&
    (middle === 0x78 || middle === 0x58)
  );
}

// One pass over the document. Words are whitespace-separated runs, minus runs
// that are pure markdown syntax. Characters are the characters of those words
// plus one separator between neighbouring words, so both counts describe the
// same visible text and syntax-only runs are left out of each.
function measure(markdown: string) {
  let words = 0;
  let characters = 0;
  let runStart = -1;
  let hasText = false;
  let hasDigit = false;
  let lineHasWord = false;

  for (let i = 0; i <= markdown.length; i++) {
    const code = i < markdown.length ? markdown.charCodeAt(i) : 0x0a;

    if (isWhitespaceCode(code)) {
      if (runStart !== -1) {
        let isWord = hasText || hasDigit;
        if (hasText) {
          isWord = !isCheckedTaskBox(markdown, runStart, i);
        } else if (hasDigit && !lineHasWord) {
          isWord = !isOrderedListMarker(markdown, runStart, i);
        }

        if (isWord) {
          if (words > 0) characters++;
          characters += i - runStart;
          words++;
          lineHasWord = true;
        }
        runStart = -1;
      }
      if (code === 0x0a) lineHasWord = false;
    } else {
      if (runStart === -1) {
        runStart = i;
        hasText = false;
        hasDigit = false;
      }
      if (isDigitCode(code)) {
        hasDigit = true;
      } else if (!isSyntaxCode(code)) {
        hasText = true;
      }
    }
  }

  return { words, characters };
}

export function countWords(markdown: string) {
  return measure(markdown).words;
}

export function countCharacters(markdown: string) {
  return measure(markdown).characters;
}
