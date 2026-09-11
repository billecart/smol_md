# smol_md

smol_md is a smol markdown & rich text editor for macOS and Windows. It's for those who, like me, like the minimalism of iA Writer and hate the markdown clutter.
Open Markdown files, edit them visually or as plain text, and save them back to disk. Smol and efficient.

<img width="782" height="572" alt="smol_screen_rich" src="https://github.com/user-attachments/assets/59465f76-a91c-4b71-932b-511747f1ea7b" />

I'm no real coder, so this is entirely vibecoded within 24 hours.

## Download

Built versions live on the [releases
page](https://github.com/billecart/smol_md/releases/latest) - a `.dmg`
for Apple Silicon Macs, and an installer or an MSI for Windows.

The macOS build is signed and notarised by Apple, so it opens without the
"unidentified developer" or "damaged" warnings.

## Working with files

Open `.md` and `.markdown` files, edit them in tabs, save them back. Markdown is the only format it keeps, so switching between Rich and Source mode is just two views of the same file.

It asks before you lose anything: closing a tab with unsaved edits, quitting with unsaved work, or saving empty content over a file that isn't empty. It writes to a temporary file and renames it, so a crash mid-save can't leave you with half a document.

On both platforms you can open files by double-clicking them in Finder or Explorer, or pass one as a command-line argument. On macOS you can also drop a file onto the app icon, and the menu keeps your last five documents.

## Rich editing

Everything is in the right-click menu. Some of it also has a shortcut.

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

Lists, blockquotes and code blocks convert into each other, so you can change your mind about a block without deleting it first.

## Find

`Cmd/Ctrl+F` opens a find bar in either mode. Matching ignores case, Enter and Shift+Enter walk through the matches, and the counter tells you where you are. Escape closes it.

Rich mode highlights every match. Source mode can't — a plain textarea has nowhere to put a highlight — so it selects the current match and scrolls to it instead.

## The Enter key

Enter does something slightly different depending on where you are, mostly so headings and code blocks stop trapping you:

Pressing it at the start of a heading pushes an empty paragraph above it. Pressing it mid-heading splits the rest into a paragraph underneath. In a code block it adds a line, unless you're on a trailing empty line, in which case it drops you out of the block.

## Windows and platform differences

macOS gets the native titlebar with traffic lights and a hidden title. Windows gets a custom titlebar with its own drag region, minimize, maximize and close.

`Cmd/Ctrl+W` closes the current tab, or the window when it's the last one left. `Cmd/Ctrl+Shift+W` always closes the window.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+N` | New document |
| `Cmd/Ctrl+O` | Open file |
| `Cmd/Ctrl+S` | Save |
| `Cmd/Ctrl+Shift+S` | Save As |
| `Cmd/Ctrl+` ` ` ` | Toggle Source / Rich mode |
| `Cmd/Ctrl+W` | Close tab, or the window if it's the last one |
| `Cmd/Ctrl+Shift+W` | Close window |
| `Cmd/Ctrl+F` | Find |
| `Cmd/Ctrl+B` | Bold |
| `Cmd/Ctrl+I` | Italic |
| `Cmd/Ctrl+K` | Insert link |
| `Cmd/Ctrl+1/2/3` | Heading 1/2/3 |
| `Cmd/Ctrl+Shift+S` | Strikethrough |
| `Cmd/Ctrl+=` / `Cmd/Ctrl+-` / `Cmd/Ctrl+0` | Zoom in, out, reset |

## Setup

You need Node.js, npm, and Rust (edition 2021). On macOS also the Xcode Command Line Tools (`xcode-select --install`); on Windows, the Microsoft C++ Build Tools.

```sh
npm install
```

`npm run dev` runs it in a browser, which is handy for looking at the interface but can't use the native file dialogs. `npm run tauri dev` runs the real desktop app. `npm run tauri build` produces:

```
src-tauri/target/release/bundle/macos/smol_md.app
src-tauri/target/release/bundle/dmg/smol_md_1.1.4_aarch64.dmg
```

On Windows, `.\scripts\build-windows.ps1` builds and copies the artifacts into `release/`.

## Tests

```sh
npm test
```

A hand-rolled runner with no dependencies. It covers the pure logic — the document model, word counts, keyboard shortcuts, recent files, heading extraction, find, zoom, tab labels, save state and file paths — plus a stylesheet check that fails the build if a CSS variable is used without being declared, or if anything is loaded from a URL.

## Releasing a signed macOS build

The app is code-signed with a Developer ID certificate and notarised by Apple.
Without this macOS refuses to open a downloaded copy — an unsigned bundle is
reported as "damaged", and a signed-but-unnotarised one as coming from an
unidentified developer.

Credentials live in the shell, never in the repo. The app-specific password
comes from appleid.apple.com (Sign-In and Security → App-Specific Passwords),
and is not your Apple ID password.

```sh
export APPLE_SIGNING_IDENTITY="Developer ID Application: <your name> (<team id>)"
export APPLE_ID="<your apple id email>"
export APPLE_PASSWORD="<app-specific password>"
export APPLE_TEAM_ID="<team id>"

npm run tauri build
```

An App Store Connect API key works too, and avoids the app-specific password.
Download the `.p8` once from App Store Connect (Users and Access → Integrations
→ Keys), keep it outside the repo, and `chmod 600` it. `APPLE_API_ISSUER` is
the Issuer ID shown above the key list - a UUID, not the key ID.

```sh
export APPLE_SIGNING_IDENTITY="Developer ID Application: <your name> (<team id>)"
export APPLE_TEAM_ID="<team id>"
export APPLE_API_KEY="<key id, the 10 characters in the filename>"
export APPLE_API_ISSUER="<issuer uuid>"
export APPLE_API_KEY_PATH="$HOME/private_keys/AuthKey_<key id>.p8"

npm run tauri build
```

To check the credentials without waiting on a whole build:

```sh
xcrun notarytool history --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER"
```

Tauri signs with the hardened runtime and submits to Apple automatically when
those are set; notarisation adds a few minutes to the build. To check the
result:

```sh
spctl -a -t exec -vvv src-tauri/target/release/bundle/macos/smol_md.app
```

`accepted` means it will open cleanly on someone else's machine.
`source=Unnotarized Developer ID` means it signed but did not notarise.

For test builds none of this is needed — `npm run tauri build -- --bundles app`
skips both the DMG and the notarisation wait.

## How big a file can it handle?

The whole document sits in the DOM, so cost grows with the file. Typing one character in Source mode, measured on Apple Silicon:

| Document | Per keystroke |
|---|---|
| 100 KB | under 1 ms |
| 500 KB | about 7 ms |
| 2 MB | about 66 ms |

Half a megabyte is fine. Past a megabyte, Source mode starts to drag. At 2 MB you feel every key. Rich mode copes better throughout because its editor batches updates instead of reacting to each keystroke.

Nothing is virtualised, and I'd rather split a long document than build windowing into an editor called smol.

## Known limitations

- No dark mode yet
- Tables are best edited in Source mode
- Advanced link editing is intentionally minimal
