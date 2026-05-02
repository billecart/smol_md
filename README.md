# smol_md

smol_md is a tiny Windows Markdown editor for focused writing. It opens Markdown files, lets you edit them visually or as plain text, and saves them back to disk without turning the app into a whole publishing suite.

## Version 1.0.0

The 1.0.0 Windows release package is built into `release/`.

Use one of these files:

- `release/smol_md_1.0.0_x64-setup.exe` - Windows installer
- `release/smol_md_1.0.0_x64_en-US.msi` - MSI package
- `release/smol_md_1.0.0_portable.exe` - portable executable

`release/smol_md.exe` is also copied as the latest built executable.

## Features

- Create new Markdown documents
- Open `.md` and `.markdown` files
- Work with multiple open tabs
- Edit in Rich mode or Source mode
- Preserve Markdown as the shared document format
- Save back to the same file
- Save As a new Markdown file
- Warn before closing dirty tabs or quitting with unsaved changes
- Block unsafe empty overwrites of existing non-empty files
- Use a custom Windows titlebar with drag, minimize, maximize, and close controls
- Keyboard shortcuts:
  - `Ctrl+N`: New
  - `Ctrl+O`: Open
  - `Ctrl+S`: Save
  - `Ctrl+Shift+S`: Save As
  - `` Ctrl+` ``: Toggle Source mode

## Setup

You need:

- Node.js
- npm
- Rust
- Microsoft C++ Build Tools

## Install dependencies

```powershell
npm install
```

## Run as a web preview

This starts the editor in a browser-like preview. It is useful for checking the interface, but normal browser pages cannot use the native Windows file dialogs.

```powershell
npm run dev
```

## Run as a Windows desktop app

```powershell
npm run tauri dev
```

On this machine, the easier command is:

```powershell
.\scripts\run-desktop.ps1
```

## Build the Windows release

```powershell
.\scripts\build-windows.ps1
```

The script builds the Tauri app and copies the 1.0.0 release artifacts into:

```text
release/
```

## Test

```powershell
npm test
```

## Known limitations

- No dark mode yet
- Tables are best edited in Source mode
- Advanced link editing is intentionally minimal
