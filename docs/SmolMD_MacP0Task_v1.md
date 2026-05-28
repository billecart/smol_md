# smol_md — Mac P0 Implementation Brief

Brief for Claude Code. Self-contained. Read it top to bottom before touching files.

## Mission

Ship the first round of macOS improvements: one bug fix, formatting keyboard shortcuts, window/tab shortcuts, and an in-page find bar. No other features in this pass — defer everything else.

## Context

- Repo: `smol_md` — a small Tauri 2 + React + TypeScript + Vite + Milkdown markdown editor. Originally Windows, now being polished for macOS.
- Editor: Milkdown on the `commonmark` preset (`src/components/RichEditor.tsx`). No GFM yet — strikethrough and task lists are intentionally out of scope for P0.
- Mac vs Windows split is detected at runtime via `src/utils/platform.ts` (`isMacOs()`) and `src/services/fileService.ts` (`isRunningInTauri()`).
- Shortcuts today: only Cmd/Ctrl+N, O, S, Shift+S, ` (toggle source). See `src/utils/keyboardShortcuts.ts` and `src/hooks/useKeyboardShortcuts.ts`.
- Custom Enter handling already exists for the “Enter at end of heading → next line is paragraph” case (`customEnterPlugin` in `RichEditor.tsx`). We are extending the same plugin for the bug below.
- Tests run via `npm test` (`scripts/run-tests.mjs`, node-based, no Vitest/Jest). Existing tests live under `tests/`.

## Scope — four items, all P0

### 1. Bug fix: Enter at start of a heading flattens the heading

**Repro**: Place cursor at offset 0 of a heading line (e.g. before the “H” in `# Hello`). Press Enter.

**Current**: The split call in `customEnterPlugin` rewrites the heading itself into a paragraph — heading is lost.

**Expected**: An empty paragraph is inserted **above** the heading. The heading content stays a heading. Cursor moves to the new empty paragraph above. (This matches Notion / Obsidian behaviour.)

**Where**: `src/components/RichEditor.tsx`, inside `customEnterPlugin`, in the branch that handles `$from.parent.type.name === "heading"`. Add a guard `if ($from.parentOffset === 0)` that inserts a paragraph **before** the heading instead of splitting at cursor.

**Implementation sketch** (ProseMirror):
```ts
if ($from.parent.type.name === "heading" && paragraph) {
  if ($from.parentOffset === 0) {
    const before = $from.before($from.depth); // pos just before the heading node
    const emptyParagraph = paragraph.createAndFill();
    if (!emptyParagraph) return false;
    const tr = state.tr
      .insert(before, emptyParagraph)
      .setSelection(TextSelection.near(state.tr.doc.resolve(before + 1)));
    dispatch(tr.scrollIntoView());
    return true;
  }
  // existing split-into-paragraph behaviour stays for cursor-mid/end-of-heading
  dispatch(state.tr.split($from.pos, 1, [{ type: paragraph }]).scrollIntoView());
  return true;
}
```
Resolve the position math against ProseMirror docs — don’t trust the sketch line-for-line.

**Acceptance**:
- Cursor at offset 0 of `# Hello` + Enter → document becomes `<p></p><h1>Hello</h1>`, cursor in the new paragraph.
- Cursor anywhere else inside the heading + Enter → keeps current behaviour (split into paragraph after).
- Works for H1–H6.
- Add a unit-ish test in `tests/` that drives `customEnterPlugin` against a known doc state. If too heavy, at minimum add a manual-verification checklist to the PR description.

### 2. Formatting keyboard shortcuts (rich mode)

Add Mac-style shortcuts that fire **only when the rich editor is focused** (don’t hijack them globally):

| Shortcut | Action | Milkdown command |
|---|---|---|
| Cmd+B | Toggle bold | `toggleStrongCommand` |
| Cmd+I | Toggle italic | `toggleEmphasisCommand` |
| Cmd+K | Insert/edit link (prompt for URL via `window.prompt`, same as right-click) | `toggleLinkCommand` |
| Cmd+1 | Wrap in H1 | `wrapInHeadingCommand` with payload `1` |
| Cmd+2 | Wrap in H2 | `wrapInHeadingCommand` with payload `2` |
| Cmd+3 | Wrap in H3 | `wrapInHeadingCommand` with payload `3` |

**Where**: Inside `RichEditor.tsx`. Use Milkdown’s ProseMirror keymap pattern — register a `keymap` plugin via `$prose` that calls `callCommand` on each, or use `@milkdown/kit/plugin/keymap` if available in v7.20. Keep these editor-scoped so they don’t fire when the source-mode textarea is focused.

On Windows the same shortcuts should bind to Ctrl. Don’t branch on platform — ProseMirror keymaps accept `"Mod-b"` (Mod = Cmd on Mac, Ctrl elsewhere). Use Mod.

**Cmd+K specifics**: Reuse the existing `promptForLink` flow in `RichEditor.tsx` (currently called from the right-click menu). Pull it out into a helper if needed.

**Acceptance**:
- Each shortcut works with text selected and with cursor in-line.
- Shortcuts do nothing in source mode (textarea handles its own).
- Shortcuts don’t fire when focus is in the hamburger menu, tab bar, or any input.
- Browser preview (npm run dev) gets the same shortcuts.

### 3. Window/tab shortcuts (global)

Add to `src/utils/keyboardShortcuts.ts` and `src/hooks/useKeyboardShortcuts.ts`:

| Shortcut | Action |
|---|---|
| Cmd+W | Close active tab (call existing `handleCloseActiveDocument` in `App.tsx`) |
| Cmd+Shift+W | Close window (call existing `handleCloseWindow`) |

Update `ShortcutAction` union and `getShortcutAction` switch. Wire the two new callbacks through `useKeyboardShortcuts` props.

**Acceptance**:
- Cmd+W closes the active tab; if the tab is dirty, the existing `confirmDiscard` flow fires.
- Cmd+Shift+W closes the window; existing dirty-warning fires if needed.
- Cmd+W with only one tab open: same as today’s “close” menu item — does whatever `handleCloseActiveDocument` currently does (don’t change that behaviour in this pass).

### 4. In-page find — Cmd+F

A small overlay search bar at the top-right of the editor. Minimal scope — **no replace, no regex, no whole-word, no “in selection”** in this pass.

**Behaviour**:
- Cmd+F: open the find bar, focus its input. If text is selected in the editor, prefill that text.
- Type to search — case-insensitive substring match. Highlight all matches in the document with a background colour (use the existing `--highlight` style if one exists, otherwise add a CSS class `.smol-find-match`).
- Enter: jump to next match and scroll it into view. Shift+Enter: previous match.
- Show match count next to the input: e.g. `3 / 17`.
- Esc or click outside the bar: close and clear all highlights.
- Cmd+F again while open: refocus and select the input.

**Implementation approach** — pick whichever is lower-effort:
- **Option A (DOM-based, simpler)**: Walk text nodes inside `.ProseMirror`, find matches with `String.prototype.indexOf` in a loop, wrap matches in a styled `<span>` via DOM ranges. Tear them down on close. Caveat: must not mutate the ProseMirror state — only the rendered DOM. Use a MutationObserver or re-run on every keystroke.
- **Option B (ProseMirror decorations)**: Add a `$prose` plugin that holds a “query” in plugin state and emits `Decoration.inline` for matches. Cleaner but more code.

If unsure, do **Option B** — it cooperates with ProseMirror’s reactivity and won’t fight the editor.

**Where**:
- New file: `src/components/FindBar.tsx` — the overlay UI.
- New file: `src/hooks/useInPageFind.ts` — state machine for query/matches/active-index.
- Extend `src/utils/keyboardShortcuts.ts` with a `find` action.
- `App.tsx` owns the open/close state and passes the bar into the rich editor’s shell; the bar should only be active when `editorMode === "rich"` in this pass.
- For source mode, **skip find for now** — disable Cmd+F in source mode (or show a small toast “Find works in Rich mode for now”).

**Acceptance**:
- Cmd+F opens the bar, Esc closes it.
- Typing highlights all matches; counter updates live.
- Enter / Shift+Enter cycles through matches with scroll-into-view.
- Closing the bar removes all highlights.
- No editor crashes when content changes while the bar is open.

## Files to touch

```
src/components/RichEditor.tsx         # bug fix + formatting keymap + find decorations (if Option B)
src/components/FindBar.tsx            # new
src/hooks/useInPageFind.ts            # new
src/hooks/useKeyboardShortcuts.ts     # new actions: closeTab, closeWindow, find
src/utils/keyboardShortcuts.ts        # extend ShortcutAction + switch
src/App.tsx                           # wire new handlers, own find open/close state
src/styles/                           # add .smol-find-match style (find/touch the right file)
tests/                                # add coverage for the Enter-bug fix and the shortcut mapping
```

## Out of scope (do NOT touch in this PR)

- Three-button Save/Don’t Save/Cancel dialog — deferred.
- GFM preset switch, task list, strikethrough, highlight (`==text==`) — P1.
- Print, Share, dark mode, autosave, Mac native menu bar — P1+.
- Table of contents insertion — P2.
- Find & Replace, regex, whole-word — P3.
- Source-mode find — deferred (call it out in the PR).

## Verification before opening the PR

1. `npm test` passes.
2. `npm run tauri dev` on macOS — manual run through each shortcut and the Enter bug.
3. `npm run dev` (browser preview) — shortcuts behave the same minus the window controls.
4. No regressions in existing right-click menu, mode switch, tab close behaviour.
5. PR description includes:
   - The four scope items as a checklist.
   - Screenshots/GIF of the find bar and Enter-bug fix.
   - Explicit note of what was deferred to P1.

## Conventions

- Match the existing code style — functional components, hooks, no class components, no new global state libs.
- Keep platform-conditional logic behind the existing `isMacOs()` / `isRunningInTauri()` helpers; don’t sprinkle UA checks.
- Use “Mod-…” in ProseMirror keymaps, not separate Mac/Windows branches.
- Follow existing import ordering and the existing `lucide-react` icon set for any new UI affordances.

## Open decisions for the implementer

- **ProseMirror keymap plugin**: if `@milkdown/kit` v7.20 exports a `keymap` helper, use it. Otherwise wrap `prosemirror-keymap` directly via `$prose`. Document the choice in a code comment.
- **Find highlight colour**: pick something visible in both rich and (future) dark modes. If unsure, use `background: rgba(204, 255, 0, 0.45)` — matches the project’s `#ccff00` accent and stays legible on white.
- **Match counter behaviour when query is empty**: show nothing, not `0 / 0`.

When all four items are done and verified, stop. Don’t pull P1 forward.
