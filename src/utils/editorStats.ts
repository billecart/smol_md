export type CounterMode = "words" | "characters";

export function countWords(markdown: string) {
  const matches = markdown.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

export function countCharacters(markdown: string) {
  return markdown.length;
}
