// macOS text substitution (smart quotes, smart dashes) runs as you type in the
// packaged app's WebKit, so a typed `"` becomes `“` and `--` becomes `–`. That
// is right for prose and wrong for code. WebKit skips substitution where
// spellcheck is off, so every element that holds code text carries these.
export const noTextSubstitutionAttrs = {
  spellcheck: "false",
  autocorrect: "off",
  autocapitalize: "off",
} as const;

// Values for Milkdown's codeBlockAttr and inlineCodeAttr: the attributes put
// on a code block's `pre`/`code` and on inline `code`.
export const codeBlockDomAttrs = () => ({
  pre: { ...noTextSubstitutionAttrs },
  code: { ...noTextSubstitutionAttrs },
});

export const inlineCodeDomAttrs = () => ({ ...noTextSubstitutionAttrs });
