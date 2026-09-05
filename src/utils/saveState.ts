// "Unsaved" in this UI means "has edits that are not on disk" - it is the same
// claim the tab's dirty dot makes. A brand new draft that has never been typed
// into has no edits to lose, so reporting it as unsaved contradicted the dot
// sitting a few inches away. Such a draft has no save state to report at all;
// the status bar already identifies it as an untitled draft.
export type SaveState = "unsaved-changes" | "saved-at" | "saved" | "new-draft";

export function getSaveState({
  isDirty,
  hasSavedAt,
  hasFilePath,
}: {
  isDirty: boolean;
  hasSavedAt: boolean;
  hasFilePath: boolean;
}): SaveState {
  if (isDirty) {
    return "unsaved-changes";
  }

  if (hasSavedAt) {
    return "saved-at";
  }

  return hasFilePath ? "saved" : "new-draft";
}
