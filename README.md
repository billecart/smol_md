# smol_md

smol_md is a smol markdown & rich text editor for macOS and Windows. It's for those who, like me, like the minimalism of iA Writer and hate the markdown clutter.
Open Markdown files, edit them visually or as plain text, and save them back to disk. Smol and efficient.

<img width="782" height="572" alt="smol_screen_rich" src="https://github.com/user-attachments/assets/59465f76-a91c-4b71-932b-511747f1ea7b" />

I'm no real coder, so this is entirely vibecoded within 24 hours.

## Version 1.0.0

### macOS

- `release/smol_md_1.0.0_aarch64.dmg` — Apple Silicon (M-series) disk image

### Windows

- `release/smol_md_1.0.0_x64-setup.exe` — Windows installer
- `release/smol_md_1.0.0_x64_en-US.msi` — MSI package
- `release/smol_md_1.0.0_portable.exe` — portable executable

## Features

### Document management
- Create new Markdown documents
- Open `.md` and `.markdown` files
- Work with multiple open tabs
- Edit in Rich mode (WYSIWYG) or Source mode (plain textarea)
- Preserve Markdown as the shared document format
- Save back to the same file
- Save As a new Markdown file
- Warn before closing dirty tabs or quitting with unsaved changes
- Block unsafe empty overwrites of existing non-empty files
- `.bak` backup created before overwriting
- Open files from Finder/Explorer via registered file association (`.md`, `.markdown`)
- Accept `.md` files as command-line argument on launch
- **macOS**: Open `.md` files by dragging onto the app icon
- **macOS**: Recent documents menu (last 5 files, persisted in localStorage)

### Rich editing
All formatting available via the right-click context menu:

| Format | Shortcut |
|---|---|
| Bold | `Cmd/Ctrl+B` |
| Italic | `Cmd/Ctrl+I` |
| Strikethrough | `Cmd/Ctrl+Shift+S` |
| Inline code | menu only |
| Highlight (`==text==`) | menu only |
| Heading 1 | `Cmd/Ctrl+1` |
| Heading 2 | `Cmd/Ctrl+2` |
| Heading 3 | `Cmd/Ctrl+3` |
| Bullet list | menu only |
| Numbered list | menu only |
| Blockquote | menu only |
| Code block | menu only |
| Link | `Cmd/Ctrl+K` (inline URL prompt) |

Block format buttons (list, blockquote, code) can be freely switched — converting one format to another is supported.

### Find in page
- `Cmd/Ctrl+F` opens an overlay find bar in both Rich and Source mode
- Case-insensitive substring matching
- Enter / Shift+Enter to cycle through matches
- Match counter (current / total)
- In Source mode the active match is selected and scrolled to, since a plain textarea cannot carry highlights
- Escape to close

### Smart Enter key
- **Heading at start of line**: inserts an empty paragraph before the heading
- **Heading mid-line**: splits the heading content into a paragraph below
- **Code block on trailing empty line**: exits the code block
- **Code block mid-content**: inserts a new line inside the block

### Window & platform
- **macOS**: Native titlebar with traffic-light window controls, hidden title, overlay style
- **Windows**: Custom titlebar with drag, minimize, maximize, and close controls
- **macOS**: `Cmd+W` closes active tab, and closes the window once it is the last tab; `Cmd+Shift+W` closes window
- **Windows**: `Ctrl+W` closes active tab, and closes the window once it is the last tab; `Ctrl+Shift+W` closes window
- **macOS**: App icon (`smol_md`) shown in the toolbar
- **Windows**: Small `s` icon shown in the menu area

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+N` | New document |
| `Cmd/Ctrl+O` | Open file |
| `Cmd/Ctrl+S` | Save |
| `Cmd/Ctrl+Shift+S` | Save As |
| `Cmd/Ctrl+` ` ` ` | Toggle Source / Rich mode |
| `Cmd/Ctrl+W` | Close active tab, or the window if it is the last tab |
| `Cmd/Ctrl+Shift+W` | Close window |
| `Cmd/Ctrl+F` | Find in page |
| `Cmd/Ctrl+B` | Bold |
| `Cmd/Ctrl+I` | Italic |
| `Cmd/Ctrl+K` | Insert link |
| `Cmd/Ctrl+1/2/3` | Heading 1/2/3 |
| `Cmd/Ctrl+Shift+S` | Strikethrough |

## Setup

You need:

- Node.js
- npm
- Rust (edition 2021)

**macOS**: Xcode Command Line Tools (`xcode-select --install`)
**Windows**: Microsoft C++ Build Tools

## Install dependencies

```sh
npm install
```

## Run as a web preview

This starts the editor in a browser-like preview. Useful for checking the interface, but normal browser pages cannot use the native file dialogs.

```sh
npm run dev
```

## Run as a desktop app

```sh
npm run tauri dev
```

## Build a release

```sh
npm run tauri build
```

On **macOS** this produces:
```
src-tauri/target/release/bundle/macos/smol_md.app
src-tauri/target/release/bundle/dmg/smol_md_1.0.0_aarch64.dmg
```

On **Windows** (using PowerShell):
```
.\scripts\build-windows.ps1
```
which also copies release artifacts into the `release/` directory.

## Test

```sh
npm test
```

Runs unit tests under `tests/` for the document model, editor stats, keyboard shortcuts, recent documents,
heading extraction, in-page find, zoom, tab labels, save state, file paths, and a stylesheet guard that fails
if a CSS variable is used without being declared or a remote resource is imported.

## Document size

The editor keeps the whole document in the DOM, so cost grows with file size. Measured on Apple Silicon,
typing a character in Source mode costs roughly:

| Document | Per keystroke |
|---|---|
| 100 KB | under 1 ms |
| 500 KB | about 7 ms |
| 2 MB | about 66 ms |

500 KB is comfortable. Past roughly 1 MB, typing in Source mode starts to feel heavy, and 2 MB is slow
enough to notice on every key. Rich mode holds up better at every size because its editor batches updates.
Splitting very large documents is the practical answer; nothing is virtualised.

## Known limitations

- No dark mode yet
- Tables are best edited in Source mode
- Advanced link editing is intentionally minimal
