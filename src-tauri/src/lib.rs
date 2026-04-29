use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize)]
struct SaveResult {
    #[serde(rename = "backupPath")]
    backup_path: Option<String>,
}

#[tauri::command]
fn read_markdown_file(path: String) -> Result<String, String> {
    let path = PathBuf::from(path);

    if !is_markdown_path(&path) {
        return Err("Please choose a .md or .markdown file.".to_string());
    }

    fs::read_to_string(&path).map_err(|error| format!("Could not read file: {error}"))
}

#[tauri::command]
fn write_markdown_file(
    path: String,
    contents: String,
    create_backup: bool,
) -> Result<SaveResult, String> {
    let path = PathBuf::from(path);

    if !is_markdown_path(&path) {
        return Err("Please save as a .md or .markdown file.".to_string());
    }

    let backup_path = if create_backup && path.exists() {
        Some(create_backup_file(&path)?)
    } else {
        None
    };

    fs::write(&path, contents).map_err(|error| format!("Could not save file: {error}"))?;

    Ok(SaveResult { backup_path })
}

fn create_backup_file(path: &Path) -> Result<String, String> {
    let first_choice = PathBuf::from(format!("{}.bak", path.display()));
    let backup_path = if first_choice.exists() {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| format!("Could not prepare backup: {error}"))?
            .as_secs();
        PathBuf::from(format!("{}.{}.bak", path.display(), timestamp))
    } else {
        first_choice
    };

    fs::copy(path, &backup_path)
        .map_err(|error| format!("Could not create backup before saving: {error}"))?;

    Ok(backup_path.display().to_string())
}

fn is_markdown_path(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|extension| extension.to_str()),
        Some(extension) if extension.eq_ignore_ascii_case("md")
            || extension.eq_ignore_ascii_case("markdown")
    )
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_markdown_file,
            write_markdown_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running smol_md");
}

