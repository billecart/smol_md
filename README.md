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
- `Cmd/Ctrl+F` opens an overlay find bar (rich mode only)
- Case-insensitive substring matching
- Enter / Shift+Enter to cycle through matches
- Match counter (current / total)
- Escape to close

### Smart Enter key
- **Heading at start of line**: inserts an empty paragraph before the heading
- **Heading mid-line**: splits the heading content into a paragraph below
- **Code block on trailing empty line**: exits the code block
- **Code block mid-content**: inserts a new line inside the block

### Window & platform
- **macOS**: Native titlebar with traffic-light window controls, hidden title, overlay style
- **Windows**: Custom titlebar with drag, minimize, maximize, and close controls
- **macOS**: `Cmd+W` closes active tab, `Cmd+Shift+W` closes window
- **Windows**: `Ctrl+W` closes active tab, `Ctrl+Shift+W` closes window
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
| `Cmd/Ctrl+W` | Close active tab |
| `Cmd/Ctrl+Shift+W` | Close window |
| `Cmd/Ctrl+F` | Find in page (rich mode only) |
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

Runs unit tests under `tests/` for document model, editor stats, keyboard shortcuts, and recent documents.

## Known limitations

- No dark mode yet
- Tables are best edited in Source mode
- Advanced link editing is intentionally minimal
