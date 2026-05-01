# smol_md Design Doc

## 1. Product Summary

smol_md is a tiny focused Windows Markdown editor. It opens normal `.md` and
`.markdown` files, lets the user edit them in a live rich editor or raw source
mode, and saves them back as Markdown.

The app is intentionally not a note-taking system, not an Obsidian clone, and
not a vault-based knowledge base. It is a lightweight file editor for users who
want a calm writing surface while keeping Markdown as the real saved format.

Core promise:

> Open Markdown files, edit them visually, save them back as Markdown.

## 2. Target User

Primary user:

- A non-developer or semi-technical user who works with Markdown files.
- Uses Windows.
- Wants to edit `.md` files without thinking too much about Markdown syntax.
- May work with files from Git repos, documentation folders, or exported notes.
- Wants files on disk to remain normal Markdown files.

Secondary user:

- A developer or technical writer who wants a clean, minimal editor for quick
  Markdown edits.

## 3. Non-Goals

smol_md does not currently include:

- Vaults
- Backlinks
- Graph view
- Tags
- Plugin system
- Multi-file project explorer
- Sync or collaboration
- AI writing features
- Publishing
- Mobile support
- Markdown linting
- Git UI
- Autosave
- Theme switching or dark mode
- Full Obsidian compatibility
- Full CommonMark edge-case perfection

These may be considered later only if the core editor remains simple and solid.

## 4. Platform And Stack

Current implementation:

- Tauri 2
- React 18
- TypeScript
- Vite
- Milkdown 7 with the CommonMark preset
- Tauri dialog plugin
- Tauri backend commands for native file reads and writes
- Lucide React for small window/menu icons

The Windows desktop build produces:

- A release executable
- An NSIS installer
- An MSI installer

The browser preview mode is supported during development. In browser preview,
Save As downloads a Markdown file; in the desktop app, native Windows dialogs
and backend file writes are used.

## 5. App Shell

The app uses a custom borderless Tauri window.

Top chrome:

- A 32px app bar.
- A small app icon and menu trigger on the left.
- A draggable center region.
- Native-feeling custom minimize, maximize, and close controls on Windows.

The app menu contains:

- new
- open
- save
- save as
- close
- close all

The window title is updated to:

```text
<fileName> - smol_md
```

Dirty documents prefix the title with `*`.

## 6. Document Model

smol_md supports multiple open documents.

Current document shape:

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
```

Workspace state:

- `documents`: all open documents.
- `activeDocumentId`: selected document.
- `editorMode`: `rich` or `source`.

Dirty state:

- `isDirty` is true when `markdown !== originalMarkdown`.
- After a successful save, `originalMarkdown` is reset to the saved Markdown.
- Each tab tracks its own dirty state.

## 7. File Behavior

Supported file actions:

- New empty document.
- Open `.md` and `.markdown` files.
- Save to the current path.
- Save As to a new path.
- Close current document.
- Close all documents.

Desktop file behavior:

- Open uses the native Tauri dialog.
- Save As uses the native Tauri save dialog.
- Read/write happens through backend commands.
- Markdown is saved as UTF-8 text.
- Saving an existing file creates a `.bak` backup before overwrite.

Browser preview behavior:

- Open uses a browser file picker.
- Save As downloads a Markdown file.
- Save without an existing desktop file path falls through to Save As.

Unsaved-change protection:

- Closing a dirty tab asks for confirmation.
- Closing all documents asks for confirmation if any document is dirty.
- Closing the desktop window warns when there are dirty documents.
- New document does not replace the current document; it opens another tab, so
  no discard confirmation is needed.

## 8. Editor Modes

smol_md has two editor modes:

- Rich
- Source

Rich mode:

- Uses Milkdown.
- Initializes from the current Markdown string.
- Updates shared Markdown state through Milkdown's listener plugin.
- Uses a small custom ProseMirror plugin for editor ergonomics.

Source mode:

- Uses a plain textarea.
- Edits the shared Markdown string directly.
- Uses the same editor font, size, caret color, and line height as rich mode.

Mode switching:

- Rich and Source are selected by a quiet top-right mode switch.
- ``Ctrl+` `` toggles between Rich and Source.
- Switching modes rehydrates the target editor from the shared Markdown string.
- There are not two independent document models.

## 9. Rich Editor Formatting

Current rich editor support:

- Paragraphs
- H1, H2, H3
- Bold
- Italic
- Links
- Bullet lists
- Numbered lists
- Inline code
- Code blocks
- Blockquotes
- Horizontal rules through Markdown input, when supported by Milkdown

The app uses Milkdown's CommonMark preset. GFM-only features such as tables,
task lists, and strikethrough are not part of the current rich-editor contract.

Formatting access:

- Markdown typing works where Milkdown supports input rules.
- A right-click context menu provides direct formatting commands.
- There is no persistent formatting toolbar.

Right-click context menu:

- Bold
- Italic
- Inline code
- Heading 1
- Heading 2
- Heading 3
- Bullet list
- Numbered list
- Blockquote
- Code block
- Link

Code block exit behavior:

- Pressing Enter on a non-empty line inside a code block inserts another code
  line.
- Pressing Enter on a trailing blank line inside a code block exits the block
  and inserts a normal paragraph below it.

Heading behavior:

- Pressing Enter from a heading creates a normal paragraph below the heading.

Link behavior:

- Link insertion uses a simple prompt for the URL.

## 10. Markdown Handling Policy

Markdown is the shared source of truth, but the rich editor may normalize it.

Expected behavior:

- Markdown may be reformatted by Milkdown serialization.
- Unsupported Markdown should not crash the app.
- Source mode exists so users can inspect and edit raw Markdown.
- Exact preservation of every Markdown edge case is not a v1 promise.

Known limitations:

- The current Milkdown setup does not parse `==text==` highlight syntax into a
  `<mark>` node.
- `<mark>` elements have CSS styling if they appear in rendered content, but the
  `==...==` syntax is not currently enabled as a rich-editor Markdown extension.
- Tables are not supported as a v1 editing feature.
- Advanced Markdown extensions may not serialize exactly as originally written.

## 11. Visual Design

The app is inspired by iA Writer: quiet, typographic, focused, and light.

Design principles:

- The writing surface is the product.
- No persistent formatting toolbar.
- No heavy cards or panels around the editor.
- Center the writing column.
- Use generous whitespace.
- Keep controls visually quiet until needed.
- Use a single calm light theme.

Current light theme tokens:

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
  --toolbar-peek-height: 14px;
}
```

Font loading:

- IBM Plex Mono is loaded from Google Fonts.
- Requested weights are `400;500;600;700`.
- Body editor text uses weight 400.
- Tabs and headings use weight 600.

Writing column:

- Width: `min(740px, calc(100vw - 80px))`
- Mobile width: `min(100vw - 32px, 740px)`
- Desktop page padding: `96px 0 120px`
- Mobile page padding: `80px 0 96px`

## 12. Markdown Element Styling

Body editor:

```css
.rich-editor .ProseMirror {
  font-family: var(--font-editor);
  font-size: var(--editor-font-size);
  font-weight: 400;
  line-height: var(--editor-line-height);
  letter-spacing: 0;
  color: var(--editor-text);
  caret-color: var(--color-accent);
}
```

Headings:

```css
.rich-editor .ProseMirror h1 {
  margin: 0 0 1.25rem;
  font-size: 1.82rem;
  line-height: 1.28;
  letter-spacing: -0.025em;
  font-weight: 600;
  color: var(--text-normal);
}

.rich-editor .ProseMirror h2 {
  margin: 2.6rem 0 0.7rem;
  font-size: 1.32rem;
  line-height: 1.36;
  letter-spacing: -0.018em;
  font-weight: 600;
  color: var(--text-normal);
}

.rich-editor .ProseMirror h3 {
  margin: 2rem 0 0.5rem;
  font-size: 0.98rem;
  line-height: 1.45;
  letter-spacing: -0.004em;
  font-weight: 600;
  color: var(--text-normal);
}
```

Heading rhythm:

- H1 has no top margin when first in the document.
- H2 sits closer to its body than to the previous section.
- H3 sits closer to its first body line than to the H2 above it.

Links:

```css
.rich-editor .ProseMirror a {
  color: var(--link-color);
  text-decoration-line: underline;
  text-decoration-thickness: 1px;
  text-decoration-color: var(--link-decoration-color);
  text-underline-offset: 3px;
}
```

Blockquotes:

```css
.rich-editor .ProseMirror blockquote {
  margin: 1.8em 0;
  padding-left: 1.2em;
  border-left: 2px solid rgba(0, 66, 37, 0.55);
  color: rgba(22, 22, 14, 0.62);
  font-style: normal;
}
```

Blockquotes have no background fill, border radius, or card treatment.

Inline code:

```css
.rich-editor .ProseMirror :not(pre) > code {
  padding: 0.08em 0.28em;
  border-radius: 5px;
  background: rgba(22, 22, 14, 0.045);
  font-family: var(--font-editor);
  font-size: 1em;
}
```

Highlights:

```css
.rich-editor .ProseMirror mark {
  padding: 0.05em 0.22em;
  border-radius: 4px;
  background: rgba(0, 66, 37, 0.1);
  color: inherit;
}
```

This CSS is present for `<mark>`, but `==text==` parsing is not currently
enabled.

Code blocks:

```css
.rich-editor .ProseMirror pre {
  margin: 1.6em 0;
  padding: 14px 16px;
  border: none;
  border-radius: 10px;
  background: rgba(22, 22, 14, 0.045);
  overflow-x: auto;
}

.rich-editor .ProseMirror pre code {
  padding: 0;
  border-radius: 0;
  background: none;
  font-size: 0.94em;
  line-height: 1.6;
}
```

## 13. Tabs And Status

Tabs:

- Live in the hover-revealed top tab bar.
- Are always visible when more than one document is open.
- Show a shortened file name.
- Show a dirty dot for unsaved documents.
- Include a close button.
- Warn before closing a dirty document.

Top tab bar:

- Hidden by default for a single document.
- Revealed when the pointer reaches the top hitbox.
- Uses translucent background and blur.

Status bar:

- Hidden by default at the bottom.
- Revealed on hover or focus.
- Shows file path or `untitled draft`.
- Shows `Unsaved`, `saved`, or `saved <time>`.
- Shows transient status messages such as open/save results.
- Shows a word or character counter.
- Clicking the counter toggles between words and characters.

## 14. Keyboard Shortcuts

App-level shortcuts:

- `Ctrl+N`: New document
- `Ctrl+O`: Open
- `Ctrl+S`: Save
- `Ctrl+Shift+S`: Save As
- ``Ctrl+` ``: Toggle Source mode

Milkdown handles its own editor-native shortcuts where available, such as common
formatting shortcuts.

Not currently implemented:

- `Ctrl+Shift+P` command palette
- `F11` full-screen mode
- Dedicated app-level shortcuts for each heading level

## 15. Core User Flows

### Open File

1. User selects open from the menu or presses `Ctrl+O`.
2. Desktop app opens a native file dialog.
3. User selects a `.md` or `.markdown` file.
4. App reads file contents as Markdown.
5. If the file is already open, app switches to that tab.
6. Otherwise, app opens a new tab or replaces the initial untouched draft.
7. Dirty state is false.

### Edit File

1. User types in Rich or Source mode.
2. The active document's Markdown updates.
3. Dirty state becomes true.
4. Window title and tab reflect the dirty state.
5. Status bar shows `Unsaved`.

### Save File

1. User selects save from the menu or presses `Ctrl+S`.
2. If the document has no file path, app uses Save As.
3. If the document has a path, app writes current Markdown to that path.
4. Backend creates a backup before overwriting.
5. Dirty state becomes false.
6. Status bar shows the save result.

### Save As

1. User selects save as from the menu or presses `Ctrl+Shift+S`.
2. Desktop app opens a native save dialog.
3. App ensures a Markdown extension.
4. App writes current Markdown.
5. Current document path and file name update.
6. Dirty state becomes false.

### Toggle Source Mode

1. User clicks Rich/Source or presses ``Ctrl+` ``.
2. App switches editor mode.
3. Source mode shows raw Markdown in a textarea.
4. Rich mode rehydrates Milkdown from the Markdown string.
5. Content is preserved through the switch.

### Multiple Open Documents

1. User creates or opens another document.
2. App adds it as a tab.
3. User switches tabs from the top bar.
4. Each tab keeps independent path, Markdown, dirty state, and saved time.
5. Closing a dirty tab requires confirmation.

## 16. Current Project Structure

```text
smol_md/
  src/
    App.tsx
    main.tsx
    components/
      RichEditor.tsx
      SourceEditor.tsx
      StatusBar.tsx
      Toolbar.tsx
      TopTabs.tsx
    hooks/
      useBeforeCloseWarning.ts
      useDocumentState.ts
      useKeyboardShortcuts.ts
    services/
      fileService.ts
    styles/
      app.css
    utils/
      markdown.ts
  src-tauri/
    tauri.conf.json
    src/
      main.rs
  test-files/
    frontmatter.md
    headings-and-lists.md
    links-and-code.md
    simple.md
    weird-markdown.md
  package.json
  README.md
```

## 17. Build And Packaging

Development:

```powershell
npm run dev
npm run tauri dev
```

Production build:

```powershell
npm run tauri build
```

Current release build outputs:

```text
%TEMP%\smol_md-build-target\release\smol_md.exe
%TEMP%\smol_md-build-target\release\bundle\nsis\smol_md_0.1.0_x64-setup.exe
%TEMP%\smol_md-build-target\release\bundle\msi\smol_md_0.1.0_x64_en-US.msi
```

## 18. Test Files

Existing test files:

```text
test-files/
  frontmatter.md
  headings-and-lists.md
  links-and-code.md
  simple.md
  weird-markdown.md
```

Recommended additional manual test content:

````md
# Notes with Structure

Body text should sit naturally under the page title.

## Heading Rhythm

H2 text should attach to the section it introduces.

### Compact Detail

This H3 should sit closer to this first body line than to the H2 above it.

> A blockquote should have a dark green rule, muted text, and no card fill.

Inline `code` should match body size, while <mark>always</mark> uses a soft green tint.

```js
function hello() {
  console.log("soft block, no border");
}
```
````

Manual checks:

- Right-click menu includes Blockquote.
- Code block Enter on a trailing blank line creates body text below the block.
- Blockquote has a green left rule and no gray card.
- Inline code is body-sized.
- Code blocks have fill, rounded corners, and no border.
- Headings render at weight 600.

## 19. Current Definition Of Done

The current app satisfies v1 when:

- It runs as a Windows desktop app.
- It can open `.md` and `.markdown` files.
- It can open multiple documents as quiet tabs.
- It can edit Markdown in Rich mode.
- It can edit Markdown in Source mode.
- It can save changes back to Markdown.
- It creates a backup before overwriting an existing file.
- It warns before closing dirty documents.
- It has app-level shortcuts for New, Open, Save, Save As, and Source toggle.
- It has a right-click formatting menu with the current formatting commands.
- It has hover-revealed tabs and status bar.
- It builds into Windows installer artifacts.
- README explains usage and known limitations.

## 20. Later Work

Possible future improvements:

- Optional autosave with clear controls and visible save failures.
- Command palette.
- Focus mode.
- Typewriter mode.
- Dark mode.
- Reading width controls.
- Full-screen mode.
- Better Markdown preservation for advanced edge cases.
- Optional GFM support if it can be added without destabilizing serialization.
- Native highlight mark support for `==text==`.
- Syntax highlighting in Source mode.
- More complete keyboard shortcuts for block formatting.
