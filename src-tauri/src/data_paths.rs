use std::path::{Path, PathBuf};

pub fn application_data_dir(app_data: &Path, executable: &Path) -> Result<PathBuf, String> {
    #[cfg(feature = "portable")]
    {
        let _ = app_data;
        let directory = executable.parent().ok_or("Portable executable directory is unavailable")?;
        if !directory.join("portable.flag").is_file() {
            return Err("Portable build requires portable.flag beside Undertone.exe".into());
        }
        let data = directory.join("data");
        std::fs::create_dir_all(&data).map_err(|_| "Portable data directory is unavailable")?;
        Ok(data)
    }
    #[cfg(not(feature = "portable"))]
    {
        let _ = executable;
        Ok(app_data.to_path_buf())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(feature = "portable")]
    #[test]
    fn portable_requires_flag_and_creates_adjacent_data() {
        assert!(!tauri::is_dev(), "portable builds must embed the frontend");
        let root=std::env::temp_dir().join(format!("undertone-portable-path-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&root).unwrap();
        let exe=root.join("Undertone.exe");
        let app_data=root.join("should-not-be-used");
        assert!(application_data_dir(&app_data,&exe).is_err());
        std::fs::write(root.join("portable.flag"),b"").unwrap();
        assert_eq!(application_data_dir(&app_data,&exe).unwrap(),root.join("data"));
        assert!(root.join("data").is_dir());
        assert!(!app_data.exists());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[cfg(not(feature = "portable"))]
    #[test]
    fn installed_build_keeps_app_data_path() {
        let app_data=Path::new("app-data");
        assert_eq!(application_data_dir(app_data,Path::new("Undertone.exe")).unwrap(),app_data);
    }
}
