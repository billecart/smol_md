use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager, RunEvent};
#[cfg(any(target_os = "macos", target_os = "ios"))]
use tauri::Url;
#[cfg(target_os = "macos")]
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
#[cfg(target_os = "macos")]
use objc2::rc::Retained;
#[cfg(target_os = "macos")]
use objc2::runtime::{NSObjectProtocol, ProtocolObject};
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSPrintInfo, NSPrintJobSavingURL, NSPrintOperation, NSPrintSaveJob};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSString, NSURL};
#[cfg(target_os = "macos")]
use objc2_web_kit::WKWebView;

#[derive(Default)]
struct OpenedMarkdownFiles(Mutex<Vec<String>>);

#[derive(Default)]
struct HasUnsavedChanges(AtomicBool);

// Holds the live "Open Recent" Submenu so `set_recent_documents` can rebuild
// its contents in place without touching the rest of the native menu. Only
// populated on macOS, where the native menu (and this submenu) actually
// exists - see `build_app_menu`.
#[cfg(target_os = "macos")]
struct RecentDocumentsMenuState(Mutex<Submenu<tauri::Wry>>);

// Mirrors the frontend's `RecentDocument` shape (see
// src/utils/recentDocuments.ts). `file_path` isn't read on the Rust side -
// the menu only ever displays `file_name` - but it's kept on the payload so
// the shape matches the frontend's own recent-documents record and stays
// self-describing for anyone reading the command signature later.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecentDocumentPayload {
    #[allow(dead_code)]
    file_path: String,
    file_name: String,
}

#[tauri::command]
fn set_unsaved_changes(has_unsaved: bool, state: tauri::State<HasUnsavedChanges>) {
    state.0.store(has_unsaved, Ordering::SeqCst);
}

#[tauri::command]
fn force_quit(app: tauri::AppHandle) {
    if let Some(state) = app.try_state::<HasUnsavedChanges>() {
        state.0.store(false, Ordering::SeqCst);
    }

    app.exit(0);
}

// `window.print()` on the webview opens the OS print panel; on macOS/wry that
// panel has a "Save as PDF" option, so this one command covers both Print
// and Export to PDF from the File menu.
#[tauri::command]
fn print_document(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|error| error.to_string())
}

// 20mm margins expressed in points, matching the `@page { margin: 20mm }`
// rule already used by the print stylesheet (1mm = 72/25.4pt ≈ 2.83465pt).
#[cfg(target_os = "macos")]
const PDF_EXPORT_MARGIN_POINTS: f64 = 56.7;

// A true "Export as PDF": writes straight to `path` with no print panel and
// no print dialog at all, unlike `print_document` above (which opens the OS
// print panel - "Save as PDF" there still needs the user to click through
// it). `with_webview`'s closure runs on the main thread but is fire-and-forget
// from the caller's point of view, so the result comes back over a channel.
#[tauri::command]
fn export_pdf(window: tauri::WebviewWindow, path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let (result_tx, result_rx) = std::sync::mpsc::channel::<Result<(), String>>();

        window
            .with_webview(move |platform| {
                let outcome = export_pdf_from_webview(&platform, &path);
                let _ = result_tx.send(outcome);
            })
            .map_err(|error| error.to_string())?;

        result_rx
            .recv()
            .map_err(|_| "PDF export did not complete.".to_string())?
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, path);
        Err("PDF export is only available on macOS".into())
    }
}

// Drives WKWebView's own print machinery directly instead of going through
// wry's `print()`/`print_with_options()`, which always calls
// `runOperationModalForWindow...` and therefore always shows the print
// panel (see wry-0.54.4 src/wkwebview/mod.rs, print_with_options). Getting a
// silent save-to-PDF instead means stopping one step earlier: build the
// NSPrintOperation ourselves, point its NSPrintInfo at a file instead of a
// printer, and call `runOperation` (not the modal-for-window variant).
#[cfg(target_os = "macos")]
fn export_pdf_from_webview(
    platform: &tauri::webview::PlatformWebview,
    path: &str,
) -> Result<(), String> {
    // Safety: on macOS, `PlatformWebview::inner` returns the `WKWebView *`
    // backing this window. `with_webview` runs this closure on the main
    // thread while the window is alive, so the pointer is valid for the
    // duration of this call.
    let webview_ptr = platform.inner() as *mut WKWebView;
    if webview_ptr.is_null() {
        return Err("Could not access the webview to export a PDF.".to_string());
    }
    let webview: &WKWebView = unsafe { &*webview_ptr };

    let can_print =
        unsafe { webview.respondsToSelector(objc2::sel!(printOperationWithPrintInfo:)) };
    if !can_print {
        return Err("This version of macOS cannot export to PDF.".to_string());
    }

    let print_info = NSPrintInfo::sharedPrintInfo();
    print_info.setTopMargin(PDF_EXPORT_MARGIN_POINTS);
    print_info.setRightMargin(PDF_EXPORT_MARGIN_POINTS);
    print_info.setBottomMargin(PDF_EXPORT_MARGIN_POINTS);
    print_info.setLeftMargin(PDF_EXPORT_MARGIN_POINTS);

    let destination_url = NSURL::fileURLWithPath(&NSString::from_str(path));

    // Two attributes on NSPrintInfo turn this into "save straight to a file"
    // rather than "spool to a printer" or "open a preview": the job
    // disposition, and the destination URL under NSPrintJobSavingURL in its
    // attribute dictionary.
    unsafe {
        print_info.setJobDisposition(NSPrintSaveJob);

        let dictionary = print_info.dictionary();
        dictionary.setObject_forKey(
            destination_url.as_ref(),
            ProtocolObject::from_ref(NSPrintJobSavingURL),
        );
    }

    let print_operation: Retained<NSPrintOperation> =
        unsafe { webview.printOperationWithPrintInfo(&print_info) };
    print_operation.setShowsPrintPanel(false);
    print_operation.setShowsProgressPanel(false);

    // Deliberately `runOperation`, not
    // `runOperationModalForWindow_delegate_didRunSelector_contextInfo` - the
    // modal variant is what makes wry's own print() show a panel.
    if print_operation.runOperation() {
        Ok(())
    } else {
        Err("Exporting to PDF failed.".to_string())
    }
}

// Rebuilds ONLY the "Open Recent" submenu in place, leaving the rest of the
// native menu untouched. The frontend calls this whenever its own
// `recentDocuments` list changes, since that list (backed by localStorage)
// is the source of truth and the native menu has no other way to learn about
// it. A no-op off macOS, where there is no native menu to update.
#[tauri::command]
fn set_recent_documents(
    app: tauri::AppHandle,
    documents: Vec<RecentDocumentPayload>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        rebuild_open_recent_submenu(&app, &documents)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, documents);
        Ok(())
    }
}

#[cfg(target_os = "macos")]
fn rebuild_open_recent_submenu(
    app: &tauri::AppHandle,
    documents: &[RecentDocumentPayload],
) -> Result<(), String> {
    let Some(state) = app.try_state::<RecentDocumentsMenuState>() else {
        // The menu hasn't finished building yet (or failed to). Nothing to
        // update - the caller will try again the next time recent documents
        // change.
        return Ok(());
    };

    let submenu = state
        .0
        .lock()
        .map_err(|_| "Open Recent menu lock was poisoned".to_string())?;

    for item in submenu.items().map_err(|error| error.to_string())? {
        submenu.remove(&item).map_err(|error| error.to_string())?;
    }

    for (index, document) in documents.iter().enumerate() {
        let item = MenuItem::with_id(
            app,
            format!("recent:{index}"),
            &document.file_name,
            true,
            None::<&str>,
        )
        .map_err(|error| error.to_string())?;

        submenu.append(&item).map_err(|error| error.to_string())?;
    }

    submenu
        .set_enabled(!documents.is_empty())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_startup_markdown_file_path() -> Option<String> {
    find_startup_markdown_file(std::env::args_os().skip(1))
}

#[tauri::command]
fn take_opened_markdown_file_paths(state: tauri::State<OpenedMarkdownFiles>) -> Vec<String> {
    state
        .0
        .lock()
        .map(|mut paths| paths.drain(..).collect())
        .unwrap_or_default()
}

fn read_markdown_file_blocking(path: String) -> Result<String, String> {
    let path = PathBuf::from(path);

    if !is_markdown_path(&path) {
        return Err("Please choose a .md or .markdown file.".to_string());
    }

    fs::read_to_string(&path).map_err(|error| format!("Could not read file: {error}"))
}

// Async, and the read itself runs on a blocking thread. Tauri executes
// synchronous commands on the main thread, and a cloud-backed file that is
// online-only has to be downloaded before its first byte can be read - which
// froze the whole window until the download finished.
#[tauri::command]
async fn read_markdown_file(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || read_markdown_file_blocking(path))
        .await
        .map_err(|error| format!("Could not read file: {error}"))?
}

fn write_markdown_file_blocking(path: String, contents: String) -> Result<(), String> {
    let path = PathBuf::from(path);

    if !is_markdown_path(&path) {
        return Err("Please save as a .md or .markdown file.".to_string());
    }

    if contents.is_empty() && path.exists() && existing_file_has_content(&path)? {
        return Err(
            "Refusing to overwrite an existing non-empty file with empty content.".to_string(),
        );
    }

    write_file_durably(&path, contents.as_bytes())
}

// Same reasoning as read_markdown_file: saving into a cloud folder can block
// for as long as the provider takes, and that must not be the main thread.
#[tauri::command]
async fn write_markdown_file(path: String, contents: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || write_markdown_file_blocking(path, contents))
        .await
        .map_err(|error| format!("Could not finish save: {error}"))?
}

fn existing_file_has_content(path: &Path) -> Result<bool, String> {
    let metadata =
        fs::metadata(path).map_err(|error| format!("Could not inspect existing file: {error}"))?;

    Ok(metadata.len() > 0)
}

fn write_file_durably(path: &Path, contents: &[u8]) -> Result<(), String> {
    let temporary_path = create_temporary_save_path(path)?;
    let write_result = write_temporary_file(&temporary_path, contents)
        .and_then(|()| replace_file_with_temporary(path, &temporary_path));

    if write_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }

    write_result
}

fn write_temporary_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| format!("Could not prepare temporary save file: {error}"))?;

    file.write_all(contents)
        .and_then(|()| file.sync_all())
        .map_err(|error| format!("Could not write temporary save file: {error}"))
}

fn replace_file_with_temporary(path: &Path, temporary_path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("Could not replace existing file: {error}"))?;
    }

    fs::rename(temporary_path, path).map_err(|error| format!("Could not finish save: {error}"))
}

fn create_temporary_save_path(path: &Path) -> Result<PathBuf, String> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Could not prepare save path.".to_string())?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Could not prepare save path: {error}"))?
        .as_nanos();

    for attempt in 0..100 {
        let candidate = parent.join(format!(".smol_md.{file_name}.{timestamp}.{attempt}.tmp"));

        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("Could not prepare a temporary save path.".to_string())
}

fn is_markdown_path(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|extension| extension.to_str()),
        Some(extension) if extension.eq_ignore_ascii_case("md")
            || extension.eq_ignore_ascii_case("markdown")
    )
}

fn find_startup_markdown_file<I>(args: I) -> Option<String>
where
    I: IntoIterator<Item = OsString>,
{
    args.into_iter().find_map(markdown_path_from_arg)
}

fn markdown_path_from_arg(arg: OsString) -> Option<String> {
    let path = arg.to_string_lossy().trim_matches('"').to_string();

    if is_markdown_path(Path::new(&path)) {
        return Some(path);
    }

    None
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
fn markdown_path_from_url(url: &Url) -> Option<String> {
    url.to_file_path()
        .ok()
        .and_then(|path| markdown_path_from_arg(path.into_os_string()))
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
fn handle_opened_urls(app: &tauri::AppHandle, urls: Vec<Url>) {
    let paths: Vec<String> = urls.iter().filter_map(markdown_path_from_url).collect();

    if paths.is_empty() {
        return;
    }

    if let Some(state) = app.try_state::<OpenedMarkdownFiles>() {
        if let Ok(mut opened_paths) = state.0.lock() {
            opened_paths.extend(paths.clone());
        }
    }

    let _ = app.emit("opened-markdown-files", paths);
}

// The default Tauri menu on macOS wires `PredefinedMenuItem::quit` to Cmd+Q, which calls
// AppKit's `terminate:` directly and never emits `RunEvent::ExitRequested` — the unsaved-changes
// prompt below is dead code for that path. It also puts `close_window` on Cmd+W in the Window
// submenu, which steals that accelerator from the webview before our JS keydown handler (which
// closes a tab, or the window with its own confirmation, on the last tab) ever sees it.
//
// So on macOS we register our own menu: a custom "quit" item (routed through `on_menu_event`
// below so we can gate it on unsaved changes) instead of the predefined quit, a full Edit
// submenu so copy/paste/undo/redo keep working, and no Window submenu / close_window item at
// all. File > Close Tab does bind Cmd+W now, but - unlike a predefined close_window item - it's
// routed back through `on_menu_event` to the same frontend handler the old unbound-key path
// called, so closing a tab (or the window, on the last tab) still works the same way.
#[cfg(target_os = "macos")]
fn build_app_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let quit_item = MenuItem::with_id(app, "quit", "Quit smol_md", true, Some("CmdOrCtrl+Q"))?;

    let app_menu = Submenu::with_items(
        app,
        "smol_md",
        true,
        &[
            &PredefinedMenuItem::about(app, None, Some(AboutMetadata::default()))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &quit_item,
        ],
    )?;

    // Starts empty and disabled; `set_recent_documents` (called from the
    // frontend on mount and whenever its recent-documents list changes)
    // populates it from the same data the old hamburger menu's "open recent"
    // submenu used, via `RecentDocumentsMenuState` below.
    let open_recent_submenu = Submenu::with_items(app, "Open Recent", true, &[])?;
    open_recent_submenu.set_enabled(false)?;

    let new_item = MenuItem::with_id(app, "new", "New", true, Some("CmdOrCtrl+N"))?;
    let open_item = MenuItem::with_id(app, "open", "Open…", true, Some("CmdOrCtrl+O"))?;
    let close_tab_item = MenuItem::with_id(app, "close-tab", "Close Tab", true, Some("CmdOrCtrl+W"))?;
    let close_all_item = MenuItem::with_id(app, "close-all", "Close All", true, None::<&str>)?;
    let save_item = MenuItem::with_id(app, "save", "Save", true, Some("CmdOrCtrl+S"))?;
    let save_as_item = MenuItem::with_id(
        app,
        "save-as",
        "Save As…",
        true,
        Some("CmdOrCtrl+Shift+S"),
    )?;
    let print_item = MenuItem::with_id(app, "print", "Print…", true, Some("CmdOrCtrl+P"))?;
    let export_pdf_item = MenuItem::with_id(
        app,
        "export-pdf",
        "Export as PDF…",
        true,
        None::<&str>,
    )?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &new_item,
            &open_item,
            &open_recent_submenu,
            &PredefinedMenuItem::separator(app)?,
            &close_tab_item,
            &close_all_item,
            &PredefinedMenuItem::separator(app)?,
            &save_item,
            &save_as_item,
            &PredefinedMenuItem::separator(app)?,
            &print_item,
            &export_pdf_item,
        ],
    )?;

    let find_item = MenuItem::with_id(app, "find", "Find", true, Some("CmdOrCtrl+F"))?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &find_item,
        ],
    )?;

    // These route through `on_menu_event` to the frontend, which forwards
    // them to RichEditor's existing formatting commands - see
    // `App.tsx`'s "menu-action" listener. They only do anything while the
    // rich editor is mounted (i.e. not in Source mode).
    let bold_item = MenuItem::with_id(app, "bold", "Bold", true, Some("CmdOrCtrl+B"))?;
    let italic_item = MenuItem::with_id(app, "italic", "Italic", true, Some("CmdOrCtrl+I"))?;
    // Deliberately no accelerator: CmdOrCtrl+Shift+S is already Save As.
    let strikethrough_item =
        MenuItem::with_id(app, "strikethrough", "Strikethrough", true, None::<&str>)?;
    let h1_item = MenuItem::with_id(app, "h1", "Heading 1", true, Some("CmdOrCtrl+1"))?;
    let h2_item = MenuItem::with_id(app, "h2", "Heading 2", true, Some("CmdOrCtrl+2"))?;
    let h3_item = MenuItem::with_id(app, "h3", "Heading 3", true, Some("CmdOrCtrl+3"))?;
    let bullet_list_item =
        MenuItem::with_id(app, "bullet-list", "Bullet List", true, None::<&str>)?;
    let ordered_list_item =
        MenuItem::with_id(app, "ordered-list", "Numbered List", true, None::<&str>)?;
    let blockquote_item = MenuItem::with_id(app, "blockquote", "Blockquote", true, None::<&str>)?;
    let code_block_item = MenuItem::with_id(app, "code-block", "Code Block", true, None::<&str>)?;
    let link_item = MenuItem::with_id(app, "link", "Link", true, Some("CmdOrCtrl+K"))?;
    let highlight_item = MenuItem::with_id(app, "highlight", "Highlight", true, None::<&str>)?;

    let format_menu = Submenu::with_items(
        app,
        "Format",
        true,
        &[
            &bold_item,
            &italic_item,
            &strikethrough_item,
            &PredefinedMenuItem::separator(app)?,
            &h1_item,
            &h2_item,
            &h3_item,
            &PredefinedMenuItem::separator(app)?,
            &bullet_list_item,
            &ordered_list_item,
            &blockquote_item,
            &code_block_item,
            &PredefinedMenuItem::separator(app)?,
            &link_item,
            &highlight_item,
        ],
    )?;

    let toggle_mode_item = MenuItem::with_id(
        app,
        "toggle-mode",
        "Toggle Source / Rich",
        true,
        Some("CmdOrCtrl+`"),
    )?;
    let zoom_in_item = MenuItem::with_id(app, "zoom-in", "Zoom In", true, Some("CmdOrCtrl+="))?;
    let zoom_out_item = MenuItem::with_id(app, "zoom-out", "Zoom Out", true, Some("CmdOrCtrl+-"))?;
    let zoom_reset_item =
        MenuItem::with_id(app, "zoom-reset", "Actual Size", true, Some("CmdOrCtrl+0"))?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &toggle_mode_item,
            &PredefinedMenuItem::separator(app)?,
            &zoom_in_item,
            &zoom_out_item,
            &zoom_reset_item,
        ],
    )?;

    // Deliberately no Close Window item: Cmd+W has to reach the webview so the
    // app can close a tab, and only close the window on the last one. A native
    // menu accelerator would swallow the key before JavaScript ever saw it.
    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;

    let menu = Menu::with_items(
        app,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &format_menu,
            &view_menu,
            &window_menu,
        ],
    )?;

    app.manage(RecentDocumentsMenuState(Mutex::new(open_recent_submenu)));

    Ok(menu)
}

#[cfg(target_os = "macos")]
fn handle_quit_menu_event(app: &tauri::AppHandle) {
    let has_unsaved_changes = app
        .try_state::<HasUnsavedChanges>()
        .map(|state| state.0.load(Ordering::SeqCst))
        .unwrap_or(false);

    if has_unsaved_changes {
        // Let the frontend confirm and call `force_quit` itself, same as the
        // `RunEvent::ExitRequested` path below.
        let _ = app.emit("quit-requested", ());
    } else {
        // Nothing to lose: exit immediately from Rust rather than round-tripping to the
        // frontend, so quitting never depends on the webview/JS still being alive.
        app.exit(0);
    }
}

pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(OpenedMarkdownFiles::default())
        .manage(HasUnsavedChanges::default())
        .invoke_handler(tauri::generate_handler![
            get_startup_markdown_file_path,
            take_opened_markdown_file_paths,
            read_markdown_file,
            write_markdown_file,
            set_unsaved_changes,
            force_quit,
            print_document,
            set_recent_documents
        ]);

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .menu(|app| build_app_menu(app))
            .on_menu_event(|app, event| {
                let id = event.id().0.clone();

                if id == "quit" {
                    handle_quit_menu_event(app);
                } else {
                    // Every other menu id (including "recent:<index>") is just
                    // forwarded to the frontend - see App.tsx's "menu-action"
                    // listener, which knows how to dispatch each one.
                    let _ = app.emit("menu-action", id);
                }
            });
    }

    builder
        .build(tauri::generate_context!())
        .expect("error while building smol_md")
        .run(|_app, _event| {
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let RunEvent::Opened { ref urls } = _event {
                handle_opened_urls(_app, urls.clone());
            }

            if let RunEvent::ExitRequested { api, .. } = _event {
                let has_unsaved_changes = _app
                    .try_state::<HasUnsavedChanges>()
                    .map(|state| state.0.load(Ordering::SeqCst))
                    .unwrap_or(false);

                if has_unsaved_changes {
                    api.prevent_exit();
                    let _ = _app.emit("quit-requested", ());
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_empty_overwrite_of_existing_non_empty_file() {
        let dir = unique_test_dir("empty-overwrite");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("notes.md");
        fs::write(&path, "original").unwrap();

        let result = write_markdown_file_blocking(path.display().to_string(), String::new());

        assert!(result.is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "original");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn save_existing_file_writes_new_contents_without_backup() {
        let dir = unique_test_dir("overwrite-save");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("notes.md");
        fs::write(&path, "original").unwrap();

        write_markdown_file_blocking(path.display().to_string(), "updated".to_string()).unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "updated");
        assert!(!PathBuf::from(format!("{}.bak", path.display())).exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn save_preserves_cyrillic_text() {
        let dir = unique_test_dir("cyrillic");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("заметка.md");
        let text = "# Привет\n\nТекст заметки.";

        write_markdown_file_blocking(path.display().to_string(), text.to_string()).unwrap();

        assert_eq!(
            read_markdown_file_blocking(path.display().to_string()).unwrap(),
            text
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn startup_file_uses_first_markdown_argument() {
        let args = [
            OsString::from("--ignored"),
            OsString::from("C:\\Notes\\daily.txt"),
            OsString::from("C:\\Notes\\daily.md"),
            OsString::from("C:\\Notes\\other.markdown"),
        ];

        assert_eq!(
            find_startup_markdown_file(args),
            Some("C:\\Notes\\daily.md".to_string())
        );
    }

    #[test]
    fn startup_file_accepts_quoted_windows_paths() {
        let args = [OsString::from("\"C:\\Notes\\daily.markdown\"")];

        assert_eq!(
            find_startup_markdown_file(args),
            Some("C:\\Notes\\daily.markdown".to_string())
        );
    }

    #[test]
    fn opened_url_accepts_markdown_file_urls() {
        let url = Url::from_file_path("/tmp/notes.md").unwrap();

        assert_eq!(
            markdown_path_from_url(&url),
            Some("/tmp/notes.md".to_string())
        );
    }

    #[test]
    fn opened_url_ignores_non_markdown_file_urls() {
        let url = Url::from_file_path("/tmp/notes.txt").unwrap();

        assert_eq!(markdown_path_from_url(&url), None);
    }

    fn unique_test_dir(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();

        std::env::temp_dir().join(format!("smol_md-{name}-{timestamp}"))
    }
}
