use crate::database::Database;
use std::path::{Path, PathBuf};

fn safe_name(name: &str) -> String {
    let cleaned: String = name.chars().map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c }).take(100).collect();
    let cleaned = cleaned.trim().trim_end_matches(['.', ' ']);
    let stem = cleaned.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4 && (stem.starts_with("COM") || stem.starts_with("LPT")) && matches!(stem.as_bytes()[3], b'1'..=b'9'));
    if cleaned.is_empty() { "Плейлист".into() } else if reserved { format!("_{cleaned}") } else { cleaned.into() }
}

/// Copies original bytes, retaining order and repeated entries without overwriting exports.
pub fn copy_playlist(db: &Database, id: i64, destination: &Path) -> Result<PathBuf, String> {
    let conn = db.connect().map_err(|e| e.to_string())?;
    let name: String = conn.query_row("SELECT name FROM playlists WHERE id=?1", [id], |r| r.get(0))
        .map_err(|_| "Плейлист не найден".to_string())?;
    let mut query = conn.prepare("SELECT t.path FROM playlist_tracks p JOIN tracks t ON t.id=p.track_id WHERE p.playlist_id=?1 ORDER BY p.position,p.id").map_err(|e| e.to_string())?;
    let paths = query.query_map([id], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let destination = destination.canonicalize().map_err(|e| format!("Папка назначения недоступна: {e}"))?;
    if !destination.is_dir() { return Err("Выберите папку назначения".into()); }
    // Validate the complete source list before creating an export directory.
    for path in &paths {
        if !Path::new(path).is_file() { return Err(format!("Трек недоступен: {path}")); }
        std::fs::File::open(path).map_err(|e| format!("Не удалось открыть {path}: {e}"))?;
    }
    let name = safe_name(&name);
    let mut suffix = 1usize;
    let folder = loop {
        let folder = destination.join(if suffix == 1 { name.clone() } else { format!("{name} ({suffix})") });
        match std::fs::create_dir(&folder) {
            Ok(()) => break folder,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => suffix += 1,
            Err(e) => return Err(format!("Не удалось создать папку плейлиста: {e}")),
        }
    };
    for (index, path) in paths.iter().enumerate() {
        let source = Path::new(path);
        let filename = source.file_name().ok_or_else(|| format!("Некорректный путь: {path}"))?;
        let target = folder.join(format!("{:03} - {}", index + 1, filename.to_string_lossy()));
        let result = (|| -> std::io::Result<()> {
            let mut source = std::fs::File::open(source)?;
            let mut output = std::fs::OpenOptions::new().write(true).create_new(true).open(target)?;
            std::io::copy(&mut source, &mut output)?;
            output.sync_all()
        })();
        if let Err(e) = result {
            return Err(format!("Экспорт прерван после {index} треков: {e}. Неполная копия: {}", folder.display()));
        }
    }
    Ok(folder)
}

#[cfg(test)]
mod tests {
    use super::safe_name;
    #[test]
    fn windows_names_stay_inside_export_folder() {
        assert_eq!(safe_name("../chill: vibe "), ".._chill_ vibe");
        assert_eq!(safe_name("CON"), "_CON");
        assert_eq!(safe_name("LPT1.flac"), "_LPT1.flac");
        assert_eq!(safe_name("..."), "Плейлист");
    }
}
