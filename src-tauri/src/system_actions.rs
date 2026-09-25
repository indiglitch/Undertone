#[cfg(target_os = "windows")]
use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

#[cfg(target_os = "windows")]
fn existing_file(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if !path.is_absolute() || !path.is_file() {
        return Err("Local file is unavailable".into());
    }
    Ok(path.to_path_buf())
}

#[cfg(target_os = "windows")]
fn explorer_select_arguments(path: &Path) -> [OsString; 2] {
    [OsString::from("/select,"), path.as_os_str().to_owned()]
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn copy_system_text(text: String) -> Result<(), String> {
    arboard::Clipboard::new()
        .and_then(|mut clipboard| clipboard.set_text(text))
        .map_err(|_| "Clipboard is unavailable".into())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn copy_cover_image(path: String) -> Result<(), String> {
    let path = existing_file(&path)?;
    let image = image::open(path)
        .map_err(|_| "Artwork is unavailable")?
        .to_rgba8();
    let (width, height) = image.dimensions();
    arboard::Clipboard::new()
        .and_then(|mut clipboard| {
            clipboard.set_image(arboard::ImageData {
                width: width as usize,
                height: height as usize,
                bytes: std::borrow::Cow::Owned(image.into_raw()),
            })
        })
        .map_err(|_| "Clipboard is unavailable".into())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn show_in_file_explorer(path: String) -> Result<(), String> {
    let path = existing_file(&path)?;
    std::process::Command::new("explorer.exe")
        .args(explorer_select_arguments(&path))
        .spawn()
        .map(|_| ())
        .map_err(|_| "File Explorer could not be opened".into())
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;
    #[test]
    fn explorer_receives_exact_unicode_and_special_character_path() {
        let path = Path::new(r"D:\Long music folder\Кириллица # [live] & (2026)\song.flac");
        let args = explorer_select_arguments(path);
        assert_eq!(args[0], OsString::from("/select,"));
        assert_eq!(args[1], path.as_os_str());
    }
    #[test]
    fn existing_absolute_file_is_preserved_without_extended_path_rewrite() {
        let path = std::env::temp_dir().join(format!(
            "Undertone Explorer тест # [a]&() {}.flac",
            std::process::id()
        ));
        std::fs::write(&path, b"audio fixture").unwrap();
        assert_eq!(existing_file(path.to_str().unwrap()).unwrap(), path);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn remote_relative_paths_are_not_local_files() {
        assert!(existing_file(r"peer\album\song.flac").is_err());
    }
}
