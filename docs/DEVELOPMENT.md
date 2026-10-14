# Building smol_md

## Setup

You need Node.js, npm, and Rust (edition 2021). On macOS also the Xcode Command Line Tools (`xcode-select --install`); on Windows, the Microsoft C++ Build Tools.

```sh
npm install
```

`npm run dev` runs it in a browser, which is handy for looking at the interface but can't use the native file dialogs. `npm run tauri dev` runs the real desktop app. `npm run tauri build` produces:

```
src-tauri/target/release/bundle/macos/smol_md.app
src-tauri/target/release/bundle/dmg/smol_md_1.1.8_aarch64.dmg
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
