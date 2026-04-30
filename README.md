# smol_md

smol_md is a tiny Windows Markdown editor. It opens one Markdown file, lets you edit it visually or as plain Markdown text, and saves it back to disk.

This is Milestone 2 from the design doc. The rich editor is powered by Milkdown, while Markdown remains the app's shared document format.

## What works now

- New empty document
- Open `.md` and `.markdown` files
- Edit Markdown in a quiet writing area
- Switch between Rich and Source modes without losing content
- Use a small formatting toolbar for headings, bold, italic, lists, links, inline code, and code blocks
- Save back to the same file
- Save As a new Markdown file
- Warn before discarding unsaved changes
- Create a `.bak` backup before overwriting an existing file
- Keyboard shortcuts:
  - `Ctrl+N`: New
  - `Ctrl+O`: Open
  - `Ctrl+S`: Save
  - `Ctrl+Shift+S`: Save As

## What is not here yet

- Dark mode
- Tables
- Advanced link editing

## Setup

You need:

- Node.js
- npm
- Rust, which Tauri uses to build the desktop app

Node and npm are already installed on this machine. Rust was not found when this project was created.

## Install dependencies

```powershell
npm install
```

## Run as a web preview

This starts the editor in a browser-like preview. It is useful for checking the interface, but normal browser pages cannot silently overwrite files on your disk.

```powershell
npm run dev
```

## Run as a Windows desktop app

After Rust and Microsoft C++ Build Tools are installed:

```powershell
npm run tauri dev
```

On this machine, the easier command is:

```powershell
.\scripts\run-desktop.ps1
```

## Build a Windows app

After Rust and Microsoft C++ Build Tools are installed:

```powershell
npm run tauri build
```

On this machine, the easier command is:

```powershell
.\scripts\build-windows.ps1
```

Built files are copied to:

```text
release/
```

## Safety note

When saving over an existing Markdown file, smol_md creates a backup next to it first. For example:

```text
notes.md
notes.md.bak
```

If a backup already exists, smol_md creates a timestamped backup instead.

## Known limitation

Rich mode covers the common Markdown writing tools first. Source mode is still available when you want to edit the exact Markdown text.
