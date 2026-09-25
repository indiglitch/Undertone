use super::*;
use crate::{metadata::Metadata, providers::MetadataProvider};
use std::{
    path::Path,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};

struct FakeMetadata {
    reads: AtomicUsize,
    fail: bool,
}
impl FakeMetadata {
    fn good() -> Self {
        Self {
            reads: AtomicUsize::new(0),
            fail: false,
        }
    }
    fn failing() -> Self {
        Self {
            reads: AtomicUsize::new(0),
            fail: true,
        }
    }
}
impl MetadataProvider for FakeMetadata {
    fn read(&self, path: &Path, _: &Path) -> Result<Metadata, String> {
        self.reads.fetch_add(1, Ordering::SeqCst);
        if self.fail {
            return Err("injected importer error".into());
        }
        Ok(Metadata {
            title: path.file_stem().unwrap().to_string_lossy().into_owned(),
            artist: "Artist".into(),
            album: "Album".into(),
            album_artist: "Artist".into(),
            track_number: None,
            year: None,
            duration: 1.0,
            genre: String::new(),
            cover: None,
            format: "WAV".into(),
        })
    }
}
fn fixture() -> (PathBuf, Database) {
    let root = std::env::temp_dir().join(format!(
        "undertone-finalize-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(root.join("downloads")).unwrap();
    let db = Database::open(&root.join("db")).unwrap();
    (root, db)
}
fn wav(path: &Path) {
    let data_len = 8000u32 * 2;
    let mut bytes = Vec::new();
    bytes.extend(b"RIFF");
    bytes.extend((36 + data_len).to_le_bytes());
    bytes.extend(b"WAVEfmt ");
    bytes.extend(16u32.to_le_bytes());
    bytes.extend(1u16.to_le_bytes());
    bytes.extend(1u16.to_le_bytes());
    bytes.extend(8000u32.to_le_bytes());
    bytes.extend(16000u32.to_le_bytes());
    bytes.extend(2u16.to_le_bytes());
    bytes.extend(16u16.to_le_bytes());
    bytes.extend(b"data");
    bytes.extend(data_len.to_le_bytes());
    bytes.resize(44 + data_len as usize, 0);
    std::fs::write(path, bytes).unwrap();
}
fn completed(id: &str, remote: &str, size: u64) -> DownloadStatus {
    DownloadStatus {
        operation_id: id.into(),
        transfer_id: "11111111-1111-1111-1111-111111111111".into(),
        state: DownloadState::Completed,
        downloaded_bytes: size,
        total_bytes: size,
        progress: 1.0,
        speed_bytes_per_second: 0.0,
        eta_seconds: None,
        source_username: "peer".into(),
        remote_path: remote.into(),
        local_path: None,
    }
}

#[test]
fn completed_single_file_uses_existing_intake_and_returns_track() {
    let (root, db) = fixture();
    let downloads = root.join("downloads");
    let file = downloads.join("песня.wav");
    wav(&file);
    let size = file.metadata().unwrap().len();
    let outcome = finalize_known_status(
        &db,
        &completed("op-single", "remote\\песня.wav", size),
        &downloads,
        &FakeMetadata::good(),
    )
    .unwrap();
    assert_eq!(outcome.status, DownloadFinalizeState::Imported);
    assert_eq!(outcome.track_id, Some(db.library().unwrap().tracks[0].id));
    assert_eq!(
        outcome.local_path,
        Some(file.canonicalize().unwrap().to_string_lossy().into_owned())
    );
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn repeated_finalize_is_idempotent_and_existing_track_is_not_duplicated() {
    let (root, db) = fixture();
    let downloads = root.join("downloads");
    let file = downloads.join("song.wav");
    wav(&file);
    let size = file.metadata().unwrap().len();
    let provider = FakeMetadata::good();
    let first = finalize_known_status(
        &db,
        &completed("op-repeat", "song.wav", size),
        &downloads,
        &provider,
    )
    .unwrap();
    let again = finalize_known_status(
        &db,
        &completed("op-repeat", "song.wav", size),
        &downloads,
        &provider,
    )
    .unwrap();
    assert_eq!(first, again);
    assert_eq!(provider.reads.load(Ordering::SeqCst), 1);
    let other = finalize_known_status(
        &db,
        &completed("op-other", "song.wav", size),
        &downloads,
        &provider,
    )
    .unwrap();
    assert_eq!(other.status, DownloadFinalizeState::AlreadyInLibrary);
    assert_eq!(db.library().unwrap().tracks.len(), 1);
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn missing_and_wrong_size_do_not_import() {
    let (root, db) = fixture();
    let downloads = root.join("downloads");
    let file = downloads.join("song.wav");
    wav(&file);
    let size = file.metadata().unwrap().len();
    assert_eq!(
        finalize_known_status(
            &db,
            &completed("op-missing", "missing.wav", size),
            &downloads,
            &FakeMetadata::good()
        )
        .unwrap()
        .status,
        DownloadFinalizeState::FileNotFound
    );
    assert_eq!(
        finalize_known_status(
            &db,
            &completed("op-size", "song.wav", size + 1),
            &downloads,
            &FakeMetadata::good()
        )
        .unwrap()
        .status,
        DownloadFinalizeState::FileNotFound
    );
    assert!(db.library().unwrap().tracks.is_empty());
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn two_equal_candidates_are_ambiguous() {
    let (root, db) = fixture();
    let downloads = root.join("downloads");
    std::fs::create_dir_all(downloads.join("a")).unwrap();
    std::fs::create_dir_all(downloads.join("b")).unwrap();
    wav(&downloads.join("a/song.wav"));
    wav(&downloads.join("b/song.wav"));
    let size = downloads.join("a/song.wav").metadata().unwrap().len();
    let outcome = finalize_known_status(
        &db,
        &completed("op-ambiguous", "song.wav", size),
        &downloads,
        &FakeMetadata::good(),
    )
    .unwrap();
    assert_eq!(outcome.status, DownloadFinalizeState::Ambiguous);
    assert!(outcome.local_path.is_none());
    assert!(db.library().unwrap().tracks.is_empty());
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn corrupted_or_non_audio_candidate_is_invalid() {
    let (root, db) = fixture();
    let downloads = root.join("downloads");
    let file = downloads.join("broken.mp3");
    std::fs::write(&file, b"not audio").unwrap();
    let outcome = finalize_known_status(
        &db,
        &completed("op-broken", "broken.mp3", file.metadata().unwrap().len()),
        &downloads,
        &metadata::LocalMetadata,
    )
    .unwrap();
    assert_eq!(outcome.status, DownloadFinalizeState::InvalidFile);
    assert!(file.exists());
    assert!(db.library().unwrap().tracks.is_empty());
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn traversal_absolute_and_unicode_remote_paths_never_become_local_paths() {
    let (root, db) = fixture();
    let downloads = root.join("downloads");
    let file = downloads.join("музыка 🦄.wav");
    wav(&file);
    let size = file.metadata().unwrap().len();
    for (index, remote) in [
        "../outside/музыка 🦄.wav",
        "C:\\outside\\музыка 🦄.wav",
        "/absolute/музыка 🦄.wav",
    ]
    .iter()
    .enumerate()
    {
        let outcome = finalize_known_status(
            &db,
            &completed(&format!("op-safe-{index}"), remote, size),
            &downloads,
            &FakeMetadata::good(),
        )
        .unwrap();
        assert!(matches!(
            outcome.status,
            DownloadFinalizeState::Imported | DownloadFinalizeState::AlreadyInLibrary
        ));
        assert!(Path::new(outcome.local_path.as_ref().unwrap())
            .starts_with(downloads.canonicalize().unwrap()));
    }
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn outside_candidate_and_symlink_escape_are_rejected() {
    let (root, db) = fixture();
    let downloads = root.join("downloads");
    let outside = root.join("outside.wav");
    wav(&outside);
    let size = outside.metadata().unwrap().len();
    assert!(safe_candidate(&downloads, &outside, size).is_none());
    let link = downloads.join("outside.wav");
    #[cfg(windows)]
    let linked = std::os::windows::fs::symlink_file(&outside, &link).is_ok();
    #[cfg(unix)]
    let linked = std::os::unix::fs::symlink(&outside, &link).is_ok();
    if linked {
        assert!(safe_candidate(&downloads, &link, size).is_none());
        let outcome = finalize_known_status(
            &db,
            &completed("op-link", "outside.wav", size),
            &downloads,
            &FakeMetadata::good(),
        )
        .unwrap();
        assert_eq!(outcome.status, DownloadFinalizeState::FileNotFound);
    }
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn importer_error_keeps_downloaded_file() {
    let (root, db) = fixture();
    let downloads = root.join("downloads");
    let file = downloads.join("song.wav");
    wav(&file);
    let size = file.metadata().unwrap().len();
    let outcome = finalize_known_status(
        &db,
        &completed("op-import-error", "song.wav", size),
        &downloads,
        &FakeMetadata::failing(),
    )
    .unwrap();
    assert_eq!(outcome.status, DownloadFinalizeState::ImportFailed);
    assert!(file.exists());
    assert!(db.library().unwrap().tracks.is_empty());
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn concurrent_polling_finalizes_operation_once() {
    let (root, db) = fixture();
    let downloads = root.join("downloads");
    let file = downloads.join("song.wav");
    wav(&file);
    let size = file.metadata().unwrap().len();
    let provider = Arc::new(FakeMetadata::good());
    let mut joins = Vec::new();
    for _ in 0..2 {
        let db = db.clone();
        let downloads = downloads.clone();
        let provider = provider.clone();
        joins.push(std::thread::spawn(move || {
            finalize_known_status(
                &db,
                &completed("op-concurrent", "song.wav", size),
                &downloads,
                provider.as_ref(),
            )
            .unwrap()
        }));
    }
    let a = joins.remove(0).join().unwrap();
    let b = joins.remove(0).join().unwrap();
    assert_eq!(a, b);
    assert_eq!(provider.reads.load(Ordering::SeqCst), 1);
    assert_eq!(db.library().unwrap().tracks.len(), 1);
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn download_root_setting_requires_and_stores_canonical_directory() {
    let (root, db) = fixture();
    let downloads = root.join("downloads");
    db.connect().unwrap().execute("INSERT INTO slskd_settings(id,server_url,secret_ref) VALUES(1,'http://127.0.0.1:5030/','Undertone/slskd/test')",[]).unwrap();
    assert!(crate::services::slskd::save_download_root(&db, Some("relative/path")).is_err());
    crate::services::slskd::save_download_root(&db, Some(downloads.to_string_lossy().as_ref()))
        .unwrap();
    let saved: String = db
        .connect()
        .unwrap()
        .query_row(
            "SELECT download_root FROM slskd_settings WHERE id=1",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(Path::new(&saved), downloads.canonicalize().unwrap());
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}
