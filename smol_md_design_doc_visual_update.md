# Tiny Markdown Editor for Windows — Design Doc

## 1. Product summary

Build a tiny focused Windows desktop editor that lets a user open Markdown files, edit them in a live rich-preview interface, and save them back as Markdown.

The app is intentionally not a note-taking system, not an Obsidian clone, and not a vault-based knowledge base. It is a lightweight Markdown file editor for users who want the comfort of WYSIWYG-style editing while keeping Markdown as the real saved format.

## 2. Target user

Primary user:

- A non-developer or semi-technical user who works with Markdown files.
- Wants to edit `.md` files without thinking too much about Markdown syntax.
- Uses Windows.
- May work with files from Git repos, documentation folders, or exported notes.
- Wants files on disk to remain normal Markdown files.

Secondary user:

- A developer or technical writer who wants a clean, minimal editor for quick Markdown edits.

## 3. Core promise

> Open Markdown files, edit them visually, save them back as Markdown.

The original v1 promise is still the foundation:

> Open one `.md` file, edit it in live rich preview, save it back as Markdown.

Multi-document tabs can be added later, but only as a way to keep multiple files open. They should not turn the app into a vault, workspace, or file browser.

## 4. Non-goals

The first version should not include:

- Vaults
- Backlinks
- Graph view
- Tags system
- Plugin system
- Multi-file project explorer
- Sync
- Collaboration
- AI writing features
- Publishing
- Mobile support
- Markdown linting
- Git UI
- Full Obsidian compatibility
- Full CommonMark edge-case perfection

These can be considered later only if the core editor feels solid.

## 5. Platform

Initial platform:

- Windows desktop app

Recommended implementation path:

- **Tauri + React + TypeScript**

Alternative implementation path:

- **Electron + React + TypeScript**

Recommendation: use **Tauri** if possible because it creates a smaller, lighter Windows app than Electron. Use Electron only if local file handling, packaging, or editor integration becomes too frustrating.

## 6. Editor approach

There are two possible editor models.

### Option A — Rich editor that serializes to Markdown

The editor document is internally a rich-text structure. When saving, the app converts the document to Markdown.

Examples of possible frameworks:

- Milkdown
- TipTap with Markdown serialization
- ProseMirror-based editor

Pros:

- Easier to get a nice WYSIWYG feel.
- Toolbar behavior is more natural if controls are added later.
- Better for non-technical users.

Cons:

- Saving may reformat Markdown.
- Exact original Markdown may not be preserved.
- Edge cases can be surprising.

### Option B — Markdown text remains the source, live preview is visual decoration

The file remains a Markdown text buffer at all times. The editor visually decorates Markdown syntax into a richer view.

Examples of possible frameworks:

- CodeMirror 6
- Lezer Markdown parser
- Custom syntax decorations

Pros:

- Safest model for preserving Markdown.
- Closer to Obsidian’s live preview concept.
- Less risk of unexpected Markdown rewrites.

Cons:

- Harder to make feel like true rich-text editing.
- Cursor behavior and editing interactions are more complex.
- More development effort.

### Recommended v1 choice

Use **Milkdown** for v1.

Reasoning:

- The project is for a non-developer working with Codex.
- The goal is to create a useful personal tool, not a perfect Markdown engine.
- Milkdown is Markdown-oriented and already designed for WYSIWYG Markdown editing.
- It should allow a faster path to a usable prototype.

Important product decision:

The app should be honest that it may normalize Markdown formatting on save. For example, it may convert list spacing, heading spacing, or emphasis syntax into its preferred Markdown style.

Future improvement:

If exact Markdown preservation becomes critical, consider a later CodeMirror-based version.

## 7. MVP feature set

### 7.0 Writing experience and visual style

The rich editor should feel closer to **iA Writer** than to a complex IDE or note-taking app.

Desired feel:

- Minimal
- Quiet
- Focused on writing
- Generous whitespace
- Excellent typography
- No visual clutter
- No heavy borders or panels
- Markdown-native, but comfortable for non-technical writing

The editor should prioritize readability over feature density.

Important v1 decision:

The app should not try to clone iA Writer exactly. It should use iA Writer as inspiration: clean, typographic, focused, distraction-light.

This style goal should be included from the beginning as a product/design constraint, but detailed polish should happen after file open/save and editor reliability are working.

### 7.1 File actions

The app must support:

- Open `.md` file
- Display file name in window title, tab, or quiet file kicker
- Edit content in rich live-preview editor
- Save changes back to the same file
- Save As new `.md` file
- New empty document
- Unsaved changes warning before closing, opening another file, closing a tab, or creating a new document

### 7.2 Editing support

The MVP should support:

- Paragraphs
- Headings H1–H3
- Bold
- Italic
- Strikethrough, optional
- Bullet lists
- Numbered lists
- Links
- Inline code
- Code blocks
- Blockquotes
- Horizontal rule, optional

Do not include tables in v1 unless the editor framework gives them almost for free.

### 7.3 Markdown source visibility

The app should include a source mode toggle:

- Rich Edit mode
- Markdown Source mode

This helps users trust that the file is still Markdown.

In v1, source mode can be a plain text editor or textarea. It does not need rich syntax highlighting, though syntax highlighting is a nice later enhancement.

### 7.4 Commands and shortcuts

The app should not have a persistent toolbar in the polished interface.

Primary interaction model:

- Markdown typing
- Keyboard shortcuts
- Optional command palette later
- Optional tiny custom icon controls later, shown only on hover or selection

Required keyboard shortcuts:

- Ctrl+N: New document
- Ctrl+O: Open
- Ctrl+S: Save
- Ctrl+Shift+S: Save As
- Ctrl+B: Bold
- Ctrl+I: Italic
- Ctrl+K: Insert/edit link
- Ctrl+1: Heading 1
- Ctrl+2: Heading 2
- Ctrl+3: Heading 3
- Ctrl+0: Paragraph
- Ctrl+`: Toggle Source mode
- F11: Full-screen mode, later milestone

Optional later UI controls:

- Tiny monochrome icons designed specifically for this app.
- Icons should be 14–16 px.
- Icons should appear only when useful, such as on text selection, top-edge hover, or command-mode activation.
- Avoid default library icon styling if it makes the app feel generic.

### 7.5 Layout

The polished interface should have:

- Hidden or hover-revealed top tabs area
- Main centered writing area
- Hidden or hover-revealed bottom status bar
- No persistent toolbar

Status bar should show:

- Saved / Unsaved
- Current file path, possibly shortened
- Word count or character count

### 7.6 Visual design system

The app should use a quiet iA Writer-inspired visual style, with the writing surface treated as the main interface. The design should feel minimal, typographic, and distraction-light rather than like a conventional productivity app.

Core decisions:

- No persistent toolbar in the polished interface.
- Centered writing column.
- Hover-revealed top tabs for multiple open documents.
- Hover-revealed bottom status bar.
- IBM Plex Mono Regular 400 for body writing text.
- Heavier document title and Markdown headings using IBM Plex Mono weight 600.
- Soft off-white background.
- Near-black warm text.
- Dark green links and accent states.

Final light theme tokens:

```css
:root {
  --background-primary: #f3f3f2;
  --background-secondary: #ececea;

  --text-normal: #16160e;
  --editor-text: rgba(22, 22, 14, 0.88);
  --text-muted: rgba(22, 22, 14, 0.55);
  --text-faint: rgba(22, 22, 14, 0.34);

  --color-accent: #004225;
  --link-color: #004225;
  --link-decoration-color: rgba(0, 66, 37, 0.45);

  --border-subtle: rgba(22, 22, 14, 0.12);
  --selection-background: rgba(0, 66, 37, 0.16);
  --highlight-background: rgba(0, 66, 37, 0.08);

  --font-ui: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  --font-editor: "IBM Plex Mono", "Cascadia Mono", "Cascadia Code", "Roboto Mono", ui-monospace, "SFMono-Regular", Consolas, monospace;

  --editor-line-height: 1.75;
  --editor-font-size: 16px;
  --editor-column-width: min(740px, calc(100vw - 80px));
}
```

Typography rules:

```css
.editor {
  font-family: var(--font-editor);
  font-size: var(--editor-font-size);
  line-height: var(--editor-line-height);
  letter-spacing: 0;
  font-weight: 400;
  color: var(--editor-text);
  caret-color: var(--color-accent);
}
```

Body text should remain IBM Plex Mono Regular 400. Do not use bold body text as the default; it makes the page feel too heavy.

Document file title / kicker:

```css
.file-kicker {
  margin: 0 0 56px;
  font-family: var(--font-editor);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text-muted);
}
```

Headings should be visibly stronger than body text, but not overly bold or web-article-like. Use weight 600 rather than 700.

```css
.editor h1 {
  margin: 0 0 2.25rem;
  font-size: 1.82rem;
  line-height: 1.28;
  letter-spacing: -0.025em;
  font-weight: 600;
  color: var(--text-normal);
}

.editor h2 {
  margin: 3rem 0 1.1rem;
  font-size: 1.24rem;
  line-height: 1.38;
  letter-spacing: -0.016em;
  font-weight: 600;
  color: var(--text-normal);
}

.editor h3 {
  margin: 2.3rem 0 0.9rem;
  font-size: 1.02rem;
  line-height: 1.45;
  letter-spacing: -0.006em;
  font-weight: 600;
  color: var(--text-normal);
}
```

Editor layout:

```css
main {
  width: var(--editor-column-width);
  margin: 0 auto;
  padding: 112px 0 120px;
}
```

The editor should not sit inside a heavy card or bordered panel. The page itself is the editor.

Markdown element styling:

```css
.editor a {
  color: var(--link-color);
  text-decoration-line: underline;
  text-decoration-thickness: 1px;
  text-decoration-color: var(--link-decoration-color);
  text-underline-offset: 3px;
}

.editor blockquote {
  margin: 1.8em 0;
  padding-left: 1.2em;
  border-left: 2px solid rgba(0, 66, 37, 0.24);
  color: var(--text-muted);
}

.editor code {
  font-family: var(--font-editor);
  font-size: 0.94em;
  background: rgba(22, 22, 14, 0.045);
  border-radius: 5px;
  padding: 0.08em 0.28em;
}

.editor pre {
  margin: 1.8em 0;
  padding: 15px 17px;
  overflow-x: auto;
  border-radius: 12px;
  background: rgba(22, 22, 14, 0.045);
  border: 1px solid var(--border-subtle);
}

.current-line {
  background: var(--highlight-background);
  box-shadow: 0.45em 0 0 var(--highlight-background), -0.45em 0 0 var(--highlight-background);
  border-radius: 3px;
}
```

### 7.7 Minimal UI behavior

The interface should become more minimal over time. The writing surface is the product; visible controls should not dominate it.

#### Toolbar direction

Preferred direction:

- Remove the persistent toolbar.
- Keep formatting available through keyboard shortcuts and Markdown typing.
- Optionally add a tiny floating command strip later, shown only on selection or via keyboard.

Alternative direction:

- Use tiny custom monochrome icons.
- Show icons only on hover or when the editor is focused.
- Avoid filled button states.
- Keep icon size around 14–16 px.

Decision:

Start by removing the toolbar visually rather than designing a custom icon set immediately. Custom icons can be added later if the app feels too hidden.

#### Multi-document tabs

Add tabs for multiple open documents in a later milestone.

Behavior:

- Tabs should appear only when the pointer is near the top area, or when multiple documents are open.
- Tabs should be visually quiet and compact.
- Each tab should show file name and unsaved indicator.
- Closing a dirty tab should warn the user.
- Opening multiple docs should not require a vault or project system.

Important scope constraint:

Tabs are for multiple open files only. They are not a file browser, workspace, or vault.

Visual direction:

```css
.tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 220px;
  padding: 5px 9px;
  border-radius: 9px;
  color: var(--text-muted);
}

.tab.active {
  color: var(--text-normal);
  background: rgba(22, 22, 14, 0.045);
}

.dirty-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-accent);
}
```

#### Mode switch

Rich / Source should be available, but visually quiet.

```css
.mode-switch {
  display: flex;
  gap: 16px;
  color: var(--text-faint);
}

.mode-switch .active {
  color: var(--text-normal);
  text-decoration: underline;
  text-underline-offset: 4px;
  text-decoration-color: var(--link-decoration-color);
}
```

#### Bottom status bar

Add a tiny bottom status bar.

Behavior:

- Hidden or nearly invisible by default.
- Appears on hover near the bottom edge, or when the editor is focused and the pointer is nearby.
- Bottom right shows either word count or character count.
- Clicking the counter toggles between words and characters.
- Bottom left may show saved/unsaved state and shortened file path.

Suggested labels:

- `342 words`
- `1,984 chars`
- `Saved`
- `Unsaved`

#### Autosave

Autosave should be postponed until a final milestone.

Reason:

- Explicit save is safer during early development.
- Autosave increases the risk of accidentally overwriting a file with malformed Markdown while the editor is still stabilizing.

Possible later autosave behavior:

- Disabled by default in early builds.
- User can enable it in settings later.
- Autosave only after successful file load.
- Debounced save, for example after 1–2 seconds of inactivity.
- Show subtle status: `Saving…`, `Saved`, `Save failed`.

#### Essential iA Writer-inspired features to consider

These are worth considering because they support focused writing without turning the app into a full writing suite:

- Focus Mode: optionally dim all text except the current sentence or paragraph.
- Typewriter Mode: keep the active line vertically centered while typing.
- Dark Mode: add after the light theme is stable.
- Reading width controls: narrow, normal, wide.
- Full-screen distraction-free mode.
- Subtle file safety features: explicit save first, clear dirty state, and optional backup-on-save later.

A command palette is a better future direction than visible buttons:

- Ctrl+Shift+P: Open command palette
- Commands can include Open, Save, Save As, Toggle Source, Toggle Focus Mode, Toggle Typewriter Mode, and Toggle Word Count.

## 8. Suggested technical stack

### App shell

Recommended:

- Tauri
- React
- TypeScript
- Vite

Why:

- Good desktop app packaging for Windows.
- Web UI is easier to vibe-code with Codex.
- TypeScript helps catch mistakes.
- React ecosystem has editor components and UI libraries.

### Editor

Recommended first attempt:

- Milkdown

Potential supporting packages:

- `@milkdown/core`
- `@milkdown/react`
- `@milkdown/preset-commonmark`
- `@milkdown/plugin-listener`
- `@milkdown/plugin-history`
- Optional later: tooltip or slash command plugins

### File access

With Tauri:

- Use Tauri dialog API for Open and Save As.
- Use Tauri filesystem API or backend commands for reading/writing files.

Important:

- The app should never silently overwrite a file if it has not loaded it successfully.
- Save should write UTF-8 Markdown.
- Preserve line endings if practical, but this is not mandatory for v1.

## 9. Data model

Initial single-document state:

```ts
type DocumentState = {
  filePath: string | null;
  fileName: string;
  markdown: string;
  originalMarkdown: string;
  isDirty: boolean;
  mode: 'rich' | 'source';
  lastSavedAt: Date | null;
};
```

Later multi-document state:

```ts
type OpenDocument = {
  id: string;
  filePath: string | null;
  fileName: string;
  markdown: string;
  originalMarkdown: string;
  isDirty: boolean;
  lastSavedAt: Date | null;
};

type WorkspaceState = {
  documents: OpenDocument[];
  activeDocumentId: string;
  mode: 'rich' | 'source';
  counterMode: 'words' | 'characters';
};
```

Dirty state:

- `isDirty` is true when current Markdown differs from `originalMarkdown`.
- After successful save, set `originalMarkdown = markdown` and `isDirty = false`.

## 10. Core user flows

### 10.1 Open file

1. User clicks Open, uses Ctrl+O, or opens via command palette later.
2. If current document has unsaved changes and will be replaced, show confirmation dialog.
3. User selects a `.md` or `.markdown` file.
4. App reads file as text.
5. App loads Markdown into editor.
6. App updates title/header/tab with file name.
7. Dirty state is false.

Acceptance criteria:

- User can open a valid Markdown file.
- The file content appears in the editor.
- The app does not lose unsaved changes without warning.

### 10.2 Edit file

1. User types in rich editor or source mode.
2. Editor updates Markdown state.
3. App marks document as dirty.
4. Window/header/tab/status shows unsaved indicator.

Acceptance criteria:

- Basic formatting works.
- Typing is responsive.
- Dirty state appears after changes.

### 10.3 Save file

1. User presses Ctrl+S.
2. If file has an existing path, app writes current Markdown to that path.
3. App clears dirty state.
4. App shows saved state.

Acceptance criteria:

- The same file on disk is updated.
- Reopening the file shows the saved changes.

### 10.4 Save As

1. User presses Ctrl+Shift+S.
2. App opens save dialog.
3. User chooses path.
4. App writes current Markdown.
5. App updates current file path.
6. Dirty state becomes false.

Acceptance criteria:

- User can save a new file.
- Default extension should be `.md`.

### 10.5 Toggle source mode

1. User toggles Source mode with shortcut or quiet mode switch.
2. App shows Markdown text.
3. User can edit Markdown directly.
4. User toggles back to Rich mode.
5. Rich editor reflects updated Markdown.

Acceptance criteria:

- Switching modes does not lose content.
- Markdown remains editable directly.

### 10.6 Multiple open documents

Later milestone:

1. User opens another document.
2. App adds it as a new tab.
3. User can switch between tabs.
4. Each tab maintains its own dirty state.
5. Closing a dirty tab shows a warning.

Acceptance criteria:

- Multiple files can be open at once.
- Tabs do not imply a vault or project system.
- Dirty state is clear per tab.

## 11. Markdown handling policy

The app should support CommonMark-style Markdown for v1.

Expected behavior:

- Markdown may be normalized on save.
- Unsupported Markdown should not crash the app.
- Unknown HTML blocks should ideally be preserved, but this is not required in v1.
- Frontmatter should be preserved if possible.

Frontmatter policy:

- If a file starts with YAML frontmatter, the app should keep it.
- It does not need to provide a special UI for frontmatter.
- If Milkdown has trouble with frontmatter, treat this as a known limitation and test carefully.

Example:

```md
---
title: Example
status: draft
---

# Heading

Body text.
```

## 12. Risks and mitigations

### Risk 1 — Markdown gets reformatted unexpectedly

Mitigation:

- Include Source mode.
- Warn in README that Markdown may be normalized.
- Add tests with real sample files.

### Risk 2 — Editor framework is difficult to control

Mitigation:

- Keep commands small.
- Avoid advanced Markdown features in v1.
- Do not fight the framework too much.

### Risk 3 — File save bugs could cause data loss

Mitigation:

- Always track dirty state.
- Confirm before destructive actions.
- Save with explicit user action only in v1.
- Consider backup-on-save later.

### Risk 4 — Tauri setup is hard for a non-developer

Mitigation:

- Use a standard starter template.
- Keep dependencies minimal.
- Let Codex handle setup commands and packaging.

### Risk 5 — Source mode and rich mode can drift

Mitigation:

- Use Markdown string as the shared state.
- On every mode switch, rehydrate the target editor from the current Markdown string.
- Avoid maintaining two independent documents.

## 13. Project structure

Possible structure:

```text
markdown-editor/
  src/
    App.tsx
    main.tsx
    components/
      TopTabs.tsx
      EditorPane.tsx
      SourceEditor.tsx
      StatusBar.tsx
      CommandPalette.tsx
    hooks/
      useDocumentState.ts
      useKeyboardShortcuts.ts
      useWordCharacterCount.ts
    services/
      fileService.ts
      markdownService.ts
    styles/
      theme.css
      app.css
  src-tauri/
    tauri.conf.json
    src/
      main.rs
  package.json
  README.md
```

## 14. Development milestones

### Milestone 0 — Project scaffold

Goal:

- Create a working Tauri + React + TypeScript app.

Acceptance criteria:

- App launches on Windows.
- Basic window appears.
- Development command works.

### Milestone 1 — Plain Markdown open/save

Goal:

- Build file open/save before adding rich editing.

Acceptance criteria:

- User can open a `.md` file.
- User can edit raw text.
- User can save the file.
- Unsaved changes are tracked.

### Milestone 2 — Add rich editor

Goal:

- Replace or supplement plain text editor with Milkdown rich Markdown editor.

Acceptance criteria:

- Markdown renders as editable rich text.
- User can edit text and formatting.
- Save writes Markdown.

### Milestone 3 — Source mode toggle

Goal:

- Add Rich / Source toggle.

Acceptance criteria:

- User can switch between modes.
- Edits in either mode are preserved.
- No content loss when switching.

### Milestone 4 — Minimal UI and shortcuts

Goal:

- Remove the persistent toolbar.
- Add reliable keyboard shortcuts.
- Add hover-revealed top tabs for multiple open documents.
- Add hover-revealed bottom status bar.

Acceptance criteria:

- Ctrl+S, Ctrl+O, Ctrl+B, Ctrl+I, Ctrl+K work.
- Rich/Source mode can be toggled without a persistent toolbar.
- Multiple open documents are represented as quiet tabs.
- Tabs appear on hover or when multiple documents are open.
- Bottom status bar appears on hover.
- Counter toggles between words and characters on click.

### Milestone 5 — Visual polish

Goal:

- Apply the finalized iA Writer-inspired visual baseline.

Acceptance criteria:

- Background is `#f3f3f2`.
- Editor body text uses IBM Plex Mono, 16px, 1.75 line height, weight 400.
- Body editor text uses `rgba(22, 22, 14, 0.88)`.
- Headings and document title use weight 600.
- Links and subtle accent states use `#004225`.
- Editor is a centered writing column with no heavy card or border.

### Milestone 6 — Packaging

Goal:

- Make app comfortable to use and package for Windows.

Acceptance criteria:

- App has a usable icon/name.
- App builds into a Windows installer or executable.
- README explains limitations and usage.

### Later milestone — Autosave

Goal:

- Add optional autosave after the editor is stable.

Acceptance criteria:

- Autosave is opt-in or clearly controllable.
- Saves are debounced.
- Save failures are visible.
- Autosave never begins before a file has been successfully loaded or explicitly saved.

## 15. Test files

Create a `test-files/` folder with sample Markdown files:

```text
test-files/
  simple.md
  headings-and-lists.md
  links-and-code.md
  frontmatter.md
  cyrillic.md
  weird-markdown.md
```

### simple.md

```md
# Simple Test

This is a paragraph with **bold** and *italic* text.

- One
- Two
- Three
```

### links-and-code.md

```md
# Links and Code

Here is [a link](https://example.com).

Inline code: `const x = 1`.

```js
function hello() {
  console.log('hello');
}
```
```

### frontmatter.md

```md
---
title: Frontmatter Test
status: draft
---

# Document with Frontmatter

Body text.
```

### cyrillic.md

```md
# Заголовок

Пример текста: русский, українська, беларуская.

[Ссылка](https://example.com)
```

## 16. Definition of done for v1

The v1 app is done when:

- It runs as a Windows desktop app.
- It can open one `.md` file.
- It can edit the file in rich-preview mode.
- It can show and edit Markdown source.
- It can save changes back to Markdown.
- It warns before losing unsaved changes.
- It handles basic Markdown reliably.
- It has a short README explaining usage and known limitations.

## 17. Suggested README positioning

Possible app description:

> Tiny Markdown Editor is a minimal Windows desktop app for opening Markdown files, editing them in a clean live-preview interface, and saving them back as Markdown. It is designed for quick focused edits, not for managing a full note vault or documentation site.

Known limitations to mention:

- Markdown may be normalized on save.
- Advanced Markdown extensions may not be preserved perfectly.
- Tables are not supported in the first version.
- Autosave is intentionally not included in early builds.

## 18. First prompt to give Codex

Use this as the initial Codex prompt:

```text
Create a Windows desktop Markdown editor using Tauri, React, TypeScript, and Vite.

Product goal: open one .md file, edit it in a live rich-preview Markdown editor, and save it back as Markdown.

Start with Milestone 1 only:
- Create the Tauri + React + TypeScript project structure.
- Implement a simple raw Markdown textarea.
- Add Open, Save, Save As, and New actions.
- Use Tauri file dialog and filesystem APIs.
- Track filePath, markdown, originalMarkdown, and isDirty state.
- Warn before replacing a dirty document.
- Add Ctrl+O, Ctrl+S, and Ctrl+Shift+S shortcuts.
- Do not add Milkdown yet.

Keep the code simple and readable. Include a README with setup and run instructions.
```

## 19. Later Codex prompt for rich editor

Use this after Milestone 1 works:

```text
Now add a rich Markdown editor using Milkdown.

Requirements:
- Keep Markdown as the shared app state.
- Add two modes: Rich and Source.
- Source mode should show the existing textarea.
- Rich mode should show a Milkdown editor initialized from the Markdown string.
- Changes in the rich editor should update the Markdown state.
- Switching between Source and Rich must not lose content.
- Preserve the existing Open, Save, Save As, New, dirty state, and keyboard shortcut behavior.
- Do not add a persistent toolbar.
- Keep formatting available through keyboard shortcuts and Markdown typing.
- If temporary controls are needed for debugging, keep them behind a dev-only flag or remove them before polish.
```

## 20. Codex prompt for visual polish

Use this after basic editing and saving are stable:

```text
Update the app UI to match the finalized visual baseline from the design doc.

Requirements:
- Use IBM Plex Mono as the primary editor font.
- Use body editor text at 16px, line-height 1.75, font-weight 400.
- Use rgba(22, 22, 14, 0.88) for body editor text.
- Use #16160e for headings and stronger UI text.
- Use heading weight 600, not 700.
- Use #f3f3f2 as the main background.
- Use #004225 for links, caret, dirty dot, selection, and subtle accent states.
- Remove the persistent toolbar from the polished UI.
- Use a centered writing column, max around 740px.
- Add or preserve hover-revealed top tabs for multiple open docs.
- Add or preserve hover-revealed bottom status bar.
- Bottom right counter toggles between words and characters on click.
- Do not change file open/save logic.
- Do not change Markdown serialization logic.
- Do not add autosave yet.
```

