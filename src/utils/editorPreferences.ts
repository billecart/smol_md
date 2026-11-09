// The Edit menu's on/off switches: Spelling > Check Spelling While Typing and
// Substitutions > Smart Quotes / Smart Dashes. Kept in localStorage like the
// document font, and pushed to the native menu's checkmarks on startup.

export type EditorPreferences = {
  checkSpellingWhileTyping: boolean;
  smartQuotes: boolean;
  smartDashes: boolean;
};

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  checkSpellingWhileTyping: true,
  // Off by default: in Markdown a straight quote is often code or an
  // attribute, and turning it curly breaks it.
  smartQuotes: false,
  smartDashes: false,
};

const EDITOR_PREFERENCES_KEY = "smol_md.editorPreferences";

export function loadEditorPreferences(): EditorPreferences {
  if (typeof localStorage === "undefined") {
    return DEFAULT_EDITOR_PREFERENCES;
  }

  try {
    const stored = JSON.parse(localStorage.getItem(EDITOR_PREFERENCES_KEY) ?? "{}");
    const pick = (key: keyof EditorPreferences) =>
      typeof stored?.[key] === "boolean" ? stored[key] : DEFAULT_EDITOR_PREFERENCES[key];

    return {
      checkSpellingWhileTyping: pick("checkSpellingWhileTyping"),
      smartQuotes: pick("smartQuotes"),
      smartDashes: pick("smartDashes"),
    };
  } catch {
    return DEFAULT_EDITOR_PREFERENCES;
  }
}

export function saveEditorPreferences(preferences: EditorPreferences) {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(EDITOR_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Storage full or blocked: the setting just won't survive a restart.
  }
}
