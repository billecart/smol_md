use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[tauri::command]
fn read_markdown_file(path: String) -> Result<String, String> {
    let path = PathBuf::from(path);

    if !is_markdown_path(&path) {
        return Err("Please choose a .md or .markdown file.".to_string());
    }

    fs::read_to_string(&path).map_err(|error| format!("Could not read file: {error}"))
}

#[tauri::command]
fn write_markdown_file(path: String, contents: String) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_empty_overwrite_of_existing_non_empty_file() {
        let dir = unique_test_dir("empty-overwrite");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("notes.md");
        fs::write(&path, "original").unwrap();

        let result = write_markdown_file(path.display().to_string(), String::new());

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

        write_markdown_file(path.display().to_string(), "updated".to_string()).unwrap();

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

        write_markdown_file(path.display().to_string(), text.to_string()).unwrap();

        assert_eq!(
            read_markdown_file(path.display().to_string()).unwrap(),
            text
        );
        let _ = fs::remove_dir_all(dir);
    }

    fn unique_test_dir(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();

        std::env::temp_dir().join(format!("smol_md-{name}-{timestamp}"))
    }
}
