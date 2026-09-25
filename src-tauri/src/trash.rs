use crate::database::Database;
use rusqlite::{OptionalExtension, TransactionBehavior};
use serde::Serialize;
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
};

const COPY_BUFFER_SIZE: usize = 128 * 1024;

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct DeletedSongsSettings {
    pub folder: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct MoveTrackResult {
    pub track_id: i64,
    pub destination_path: String,
    pub destination_filename: String,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TrackFileStatus {
    Present,
    Missing,
}

fn usable_source_path(path: Option<&str>) -> Option<&Path> {
    let path = path?.trim();
    let candidate = Path::new(path);
    (!path.is_empty() && candidate.is_absolute()).then_some(candidate)
}

fn canonical_status(result: io::Result<PathBuf>) -> Result<TrackFileStatus, String> {
    match result {
        Ok(canonical) => match fs::metadata(canonical) {
            Ok(metadata) if metadata.is_file() => Ok(TrackFileStatus::Present),
            Ok(_) => Ok(TrackFileStatus::Missing),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(TrackFileStatus::Missing),
            Err(_) => Err(safe_error("Source track could not be checked")),
        },
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(TrackFileStatus::Missing),
        Err(_) => Err(safe_error("Source track could not be checked")),
    }
}

fn source_status(db: &Database, track_id: i64) -> Result<TrackFileStatus, String> {
    let path: Option<Option<String>> = db.connect()?
        .query_row("SELECT path FROM tracks WHERE id=?1", [track_id], |row| row.get(0))
        .optional()
        .map_err(|_| safe_error("Local track could not be loaded"))?;
    let path = path.ok_or_else(|| safe_error("Local track was not found"))?;
    let Some(path) = usable_source_path(path.as_deref()) else { return Ok(TrackFileStatus::Missing); };
    canonical_status(path.canonicalize())
}

pub fn track_file_status(db: &Database, track_id: i64) -> Result<TrackFileStatus, String> {
    source_status(db, track_id)
}

pub fn remove_missing_track(db: &Database, track_id: i64) -> Result<(), String> {
    if source_status(db, track_id)? != TrackFileStatus::Missing {
        return Err(safe_error("The local file is still available"));
    }
    delete_library_rows(db, track_id)
}

trait FileOperations {
    fn rename(&self, source: &Path, destination: &Path) -> io::Result<()>;
    fn copy_exclusive(&self, source: &Path, destination: &Path) -> io::Result<u64>;
    fn remove_file(&self, path: &Path) -> io::Result<()>;
}

struct RealFiles;

impl FileOperations for RealFiles {
    fn rename(&self, source: &Path, destination: &Path) -> io::Result<()> {
        fs::rename(source, destination)
    }

    fn copy_exclusive(&self, source: &Path, destination: &Path) -> io::Result<u64> {
        let mut input = File::open(source)?;
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(destination)?;
        let mut buffer = vec![0; COPY_BUFFER_SIZE];
        let mut copied = 0;
        loop {
            let count = input.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            output.write_all(&buffer[..count])?;
            copied += count as u64;
        }
        output.sync_all()?;
        Ok(copied)
    }

    fn remove_file(&self, path: &Path) -> io::Result<()> {
        fs::remove_file(path)
    }
}

fn safe_error(message: &str) -> String {
    message.to_string()
}

fn canonical_directory(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err(safe_error("Deleted songs folder must be an absolute path"));
    }
    let canonical = path
        .canonicalize()
        .map_err(|_| safe_error("Deleted songs folder is unavailable"))?;
    if !canonical.is_dir() {
        return Err(safe_error("Deleted songs folder is unavailable"));
    }
    Ok(canonical)
}

fn library_roots(db: &Database) -> Result<Vec<PathBuf>, String> {
    let conn = db.connect()?;
    let mut statement = conn
        .prepare("SELECT path FROM library_folders")
        .map_err(|_| safe_error("Library settings are unavailable"))?;
    let paths = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|_| safe_error("Library settings are unavailable"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| safe_error("Library settings are unavailable"))?;
    Ok(paths
        .into_iter()
        .filter_map(|path| PathBuf::from(path).canonicalize().ok())
        .collect())
}

fn validate_outside_library(db: &Database, folder: &Path) -> Result<(), String> {
    if library_roots(db)?
        .iter()
        .any(|root| folder.starts_with(root))
    {
        return Err(safe_error(
            "Deleted songs folder must be outside every music library folder",
        ));
    }
    Ok(())
}

pub fn settings(db: &Database) -> Result<DeletedSongsSettings, String> {
    let folder = db
        .connect()?
        .query_row(
            "SELECT deleted_songs_folder FROM app_settings WHERE id=1",
            [],
            |row| row.get(0),
        )
        .map_err(|_| safe_error("Deleted songs settings are unavailable"))?;
    Ok(DeletedSongsSettings { folder })
}

pub fn save_folder(db: &Database, folder: &Path) -> Result<DeletedSongsSettings, String> {
    let canonical = canonical_directory(folder)?;
    validate_outside_library(db, &canonical)?;
    let value = canonical.to_string_lossy().into_owned();
    db.connect()?
        .execute(
            "UPDATE app_settings SET deleted_songs_folder=?1 WHERE id=1",
            [&value],
        )
        .map_err(|_| safe_error("Deleted songs settings could not be saved"))?;
    Ok(DeletedSongsSettings {
        folder: Some(value),
    })
}

fn collision_path(folder: &Path, filename: &std::ffi::OsStr, index: usize) -> PathBuf {
    if index == 0 {
        return folder.join(filename);
    }
    let original = Path::new(filename);
    let stem = original.file_stem().unwrap_or(filename).to_string_lossy();
    match original.extension() {
        Some(extension) => folder.join(format!("{stem} ({index}).{}", extension.to_string_lossy())),
        None => folder.join(format!("{stem} ({index})")),
    }
}

fn next_destination(folder: &Path, filename: &std::ffi::OsStr) -> Result<PathBuf, String> {
    for index in 0..100_000 {
        let candidate = collision_path(folder, filename, index);
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err(safe_error("No available destination filename"))
}

fn cross_device(error: &io::Error) -> bool {
    matches!(error.raw_os_error(), Some(17 | 18))
}

fn transfer(files: &dyn FileOperations, source: &Path, destination: &Path) -> Result<(), String> {
    match files.rename(source, destination) {
        Ok(()) => return Ok(()),
        Err(error) if cross_device(&error) => {}
        Err(_) => return Err(safe_error("Could not move the track file")),
    }
    let expected = fs::metadata(source)
        .map_err(|_| safe_error("Source track is unavailable"))?
        .len();
    let copied = match files.copy_exclusive(source, destination) {
        Ok(copied) => copied,
        Err(_) => {
            let _ = files.remove_file(destination);
            return Err(safe_error("Could not copy the track to Deleted songs"));
        }
    };
    let destination_size = fs::metadata(destination).map(|value| value.len()).ok();
    if copied != expected || destination_size != Some(expected) {
        let _ = files.remove_file(destination);
        return Err(safe_error("Copied track could not be verified"));
    }
    if files.remove_file(source).is_err() {
        let _ = files.remove_file(destination);
        return Err(safe_error(
            "Could not remove the source track after copying",
        ));
    }
    Ok(())
}

fn delete_library_rows(db: &Database, track_id: i64) -> Result<(), String> {
    let mut conn = db.connect()?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| safe_error("Library could not be updated"))?;
    tx.execute("DELETE FROM playlist_tracks WHERE track_id=?1", [track_id])
        .map_err(|_| safe_error("Library could not be updated"))?;
    tx.execute("DELETE FROM likes WHERE track_id=?1", [track_id])
        .map_err(|_| safe_error("Library could not be updated"))?;
    tx.execute(
        "DELETE FROM listening_history WHERE track_id=?1",
        [track_id],
    )
    .map_err(|_| safe_error("Library could not be updated"))?;
    tx.execute("DELETE FROM track_identities WHERE track_id=?1", [track_id])
        .map_err(|_| safe_error("Library could not be updated"))?;
    tx.execute("UPDATE playback_session SET current_track_id=NULL,current_entry_id=NULL,position_seconds=0 WHERE current_track_id=?1", [track_id])
        .map_err(|_| safe_error("Library could not be updated"))?;
    if tx
        .execute("DELETE FROM tracks WHERE id=?1", [track_id])
        .map_err(|_| safe_error("Library could not be updated"))?
        != 1
    {
        return Err(safe_error("Local track was not found"));
    }
    tx.commit()
        .map_err(|_| safe_error("Library could not be updated"))
}

fn move_track_with(
    db: &Database,
    track_id: i64,
    files: &dyn FileOperations,
) -> Result<MoveTrackResult, String> {
    let conn = db.connect()?;
    let source_text: Option<String> = conn
        .query_row("SELECT path FROM tracks WHERE id=?1", [track_id], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|_| safe_error("Local track could not be loaded"))?;
    drop(conn);
    let source_text = source_text.ok_or_else(|| safe_error("Local track was not found"))?;
    let source_path = PathBuf::from(source_text);
    if !source_path.is_absolute() {
        return Err(safe_error("Track is not a local file"));
    }
    let source = source_path
        .canonicalize()
        .map_err(|_| safe_error("Source track is unavailable"))?;
    if !source.is_file() {
        return Err(safe_error("Source track is unavailable"));
    }
    let folder_text = settings(db)?
        .folder
        .ok_or_else(|| safe_error("Choose a Deleted songs folder in Settings first"))?;
    let folder = canonical_directory(Path::new(&folder_text))?;
    validate_outside_library(db, &folder)?;
    if source.starts_with(&folder) {
        return Err(safe_error("Track is already inside Deleted songs"));
    }
    let filename = source
        .file_name()
        .ok_or_else(|| safe_error("Source track has no filename"))?;
    let destination = next_destination(&folder, filename)?;
    transfer(files, &source, &destination)?;
    if let Err(error) = delete_library_rows(db, track_id) {
        let _ = transfer(files, &destination, &source);
        return Err(error);
    }
    Ok(MoveTrackResult {
        track_id,
        destination_filename: destination
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        destination_path: destination.to_string_lossy().into_owned(),
    })
}

pub fn move_track(db: &Database, track_id: i64) -> Result<MoveTrackResult, String> {
    move_track_with(db, track_id, &RealFiles)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct Fixture {
        root: PathBuf,
        library: PathBuf,
        deleted: PathBuf,
        db: Database,
    }

    impl Fixture {
        fn new(name: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "undertone-trash-{name}-{}-{nonce}",
                std::process::id()
            ));
            let library = root.join("library");
            let deleted = root.join("deleted");
            fs::create_dir_all(&library).unwrap();
            fs::create_dir_all(&deleted).unwrap();
            let db = Database::open(&root.join("db")).unwrap();
            db.connect()
                .unwrap()
                .execute(
                    "INSERT INTO library_folders(path) VALUES(?1)",
                    [library.canonicalize().unwrap().to_string_lossy().as_ref()],
                )
                .unwrap();
            Self {
                root,
                library,
                deleted,
                db,
            }
        }

        fn track(&self, name: &str) -> (i64, PathBuf) {
            let path = self.library.join(name);
            fs::write(&path, b"not real audio, inserted directly").unwrap();
            let conn = self.db.connect().unwrap();
            conn.execute("INSERT OR IGNORE INTO artists(name) VALUES('Artist')", [])
                .unwrap();
            conn.execute(
                "INSERT OR IGNORE INTO albums(title,artist_id) SELECT 'Album',id FROM artists WHERE name='Artist'",
                [],
            )
            .unwrap();
            conn.execute("INSERT INTO tracks(path,title,artist_id,album_id,album_artist,duration,format,size,modified) SELECT ?1,?2,a.id,b.id,'Artist',1.0,'flac',?3,'0' FROM artists a,albums b WHERE a.name='Artist' AND b.title='Album'",params![path.canonicalize().unwrap().to_string_lossy(),name,fs::metadata(&path).unwrap().len() as i64]).unwrap();
            (conn.last_insert_rowid(), path)
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    struct CrossVolume;
    impl FileOperations for CrossVolume {
        fn rename(&self, _source: &Path, _destination: &Path) -> io::Result<()> {
            Err(io::Error::from_raw_os_error(17))
        }
        fn copy_exclusive(&self, source: &Path, destination: &Path) -> io::Result<u64> {
            RealFiles.copy_exclusive(source, destination)
        }
        fn remove_file(&self, path: &Path) -> io::Result<()> {
            RealFiles.remove_file(path)
        }
    }

    struct FailedMove;
    impl FileOperations for FailedMove {
        fn rename(&self, _source: &Path, _destination: &Path) -> io::Result<()> {
            Err(io::Error::new(io::ErrorKind::PermissionDenied, "denied"))
        }
        fn copy_exclusive(&self, _source: &Path, _destination: &Path) -> io::Result<u64> {
            panic!("copy must not run")
        }
        fn remove_file(&self, _path: &Path) -> io::Result<()> {
            panic!("remove must not run")
        }
    }

    struct FailedCopy;
    impl FileOperations for FailedCopy {
        fn rename(&self, _source: &Path, _destination: &Path) -> io::Result<()> {
            Err(io::Error::from_raw_os_error(17))
        }
        fn copy_exclusive(&self, _source: &Path, destination: &Path) -> io::Result<u64> {
            fs::write(destination, b"partial")?;
            Err(io::Error::new(io::ErrorKind::WriteZero, "partial copy"))
        }
        fn remove_file(&self, path: &Path) -> io::Result<()> {
            RealFiles.remove_file(path)
        }
    }

    #[test]
    fn setting_persists_and_library_child_is_rejected() {
        let fixture = Fixture::new("setting");
        let saved = save_folder(&fixture.db, &fixture.deleted).unwrap();
        assert_eq!(settings(&fixture.db).unwrap(), saved);
        let nested = fixture.library.join("deleted");
        fs::create_dir_all(&nested).unwrap();
        assert!(save_folder(&fixture.db, &nested).is_err());
        assert_eq!(settings(&fixture.db).unwrap(), saved);
    }

    #[test]
    fn local_track_moves_and_collision_never_overwrites() {
        let fixture = Fixture::new("collision");
        save_folder(&fixture.db, &fixture.deleted).unwrap();
        let (id, source) = fixture.track("Song.flac");
        fs::write(fixture.deleted.join("Song.flac"), b"keep me").unwrap();
        let result = move_track(&fixture.db, id).unwrap();
        assert_eq!(result.destination_filename, "Song (1).flac");
        assert_eq!(
            fs::read(fixture.deleted.join("Song.flac")).unwrap(),
            b"keep me"
        );
        assert!(!source.exists());
        assert!(Path::new(&result.destination_path).exists());
        assert_eq!(fixture.db.library().unwrap().tracks.len(), 0);
    }

    #[test]
    fn cross_volume_copies_verifies_then_removes_source() {
        let fixture = Fixture::new("cross-volume");
        save_folder(&fixture.db, &fixture.deleted).unwrap();
        let (id, source) = fixture.track("Cross.flac");
        let expected = fs::read(&source).unwrap();
        let result = move_track_with(&fixture.db, id, &CrossVolume).unwrap();
        assert!(!source.exists());
        assert_eq!(fs::read(result.destination_path).unwrap(), expected);
        assert!(fixture.db.library().unwrap().tracks.is_empty());
    }

    #[test]
    fn source_is_kept_until_cross_volume_destination_is_complete() {
        let fixture = Fixture::new("failed-copy");
        save_folder(&fixture.db, &fixture.deleted).unwrap();
        let (id, source) = fixture.track("Partial.flac");
        assert!(move_track_with(&fixture.db, id, &FailedCopy).is_err());
        assert!(source.exists());
        assert!(!fixture.deleted.join("Partial.flac").exists());
        assert_eq!(fixture.db.library().unwrap().tracks.len(), 1);
    }

    #[test]
    fn missing_remote_or_filesystem_failure_does_not_change_database() {
        let fixture = Fixture::new("failures");
        save_folder(&fixture.db, &fixture.deleted).unwrap();
        assert!(move_track(&fixture.db, 999_999).is_err());
        let (missing_id, missing) = fixture.track("Missing.flac");
        fs::remove_file(&missing).unwrap();
        assert!(move_track(&fixture.db, missing_id).is_err());
        let (failed_id, source) = fixture.track("Denied.flac");
        assert!(move_track_with(&fixture.db, failed_id, &FailedMove).is_err());
        assert!(source.exists());
        let ids: Vec<i64> = fixture
            .db
            .library()
            .unwrap()
            .tracks
            .into_iter()
            .map(|track| track.id)
            .collect();
        assert!(ids.contains(&missing_id));
        assert!(ids.contains(&failed_id));
        assert_eq!(track_file_status(&fixture.db, failed_id).unwrap(), TrackFileStatus::Present);
        assert!(remove_missing_track(&fixture.db, failed_id).is_err());
        assert!(fixture.db.library().unwrap().tracks.iter().any(|track| track.id == failed_id));
    }

    #[test]
    fn only_not_found_or_invalid_paths_are_removable() {
        assert!(usable_source_path(None).is_none());
        assert!(usable_source_path(Some("")).is_none());
        assert!(usable_source_path(Some("relative.flac")).is_none());
        assert_eq!(canonical_status(Err(io::Error::from(io::ErrorKind::NotFound))).unwrap(), TrackFileStatus::Missing);
        for kind in [io::ErrorKind::PermissionDenied, io::ErrorKind::WouldBlock, io::ErrorKind::Other] {
            assert!(canonical_status(Err(io::Error::from(kind))).is_err());
        }
        let fixture = Fixture::new("invalid-paths");
        let (empty_id, _) = fixture.track("Empty.flac");
        fixture.db.connect().unwrap().execute("UPDATE tracks SET path='' WHERE id=?1",[empty_id]).unwrap();
        assert_eq!(track_file_status(&fixture.db, empty_id).unwrap(), TrackFileStatus::Missing);
        remove_missing_track(&fixture.db, empty_id).unwrap();
        assert!(fixture.db.library().unwrap().tracks.is_empty());
    }

    #[test]
    fn missing_file_removes_only_library_record_and_dependent_state() {
        let fixture = Fixture::new("missing-removal");
        let (id, source) = fixture.track("Gone.flac");
        let conn = fixture.db.connect().unwrap();
        conn.execute("INSERT INTO likes(track_id) VALUES(?1)",[id]).unwrap();
        conn.execute("INSERT INTO playlists(name) VALUES('List')",[]).unwrap();
        let playlist = conn.last_insert_rowid();
        conn.execute("INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(?1,?2,0)",params![playlist,id]).unwrap();
        conn.execute("INSERT INTO listening_history(track_id) VALUES(?1)",[id]).unwrap();
        conn.execute("INSERT INTO lyrics(track_id,source,kind,plain_text,source_fingerprint) VALUES(?1,'local_lrc','plain','words','test')",[id]).unwrap();
        conn.execute("INSERT INTO lyrics_scan_state(track_id,audio_fingerprint) VALUES(?1,'test')",[id]).unwrap();
        drop(conn);
        let metadata=fixture.db.track_metadata_details(id).unwrap();
        assert_eq!(metadata.lyrics_source.as_deref(),Some("local_lrc"));
        assert!(metadata.size_bytes.is_some_and(|size| size>0));
        crate::playback_session::save(&fixture.db,crate::playback_session::PlaybackSession{
            entries:vec![crate::playback_session::QueueEntry{entry_id:91,track_id:id}],
            current_entry_id:Some(91),current_track_id:Some(id),cursor:Some(0),position_seconds:15.0,
        }).unwrap();
        fs::remove_file(&source).unwrap();
        assert_eq!(track_file_status(&fixture.db,id).unwrap(),TrackFileStatus::Missing);
        remove_missing_track(&fixture.db,id).unwrap();
        assert!(fixture.db.library().unwrap().tracks.is_empty());
        let conn=fixture.db.connect().unwrap();
        for table in ["likes","playlist_tracks","listening_history","lyrics","lyrics_scan_state","playback_queue_entries"] {
            let count:i64=conn.query_row(&format!("SELECT count(*) FROM {table} WHERE track_id=?1"),[id],|row|row.get(0)).unwrap();
            assert_eq!(count,0,"{table}");
        }
        let session=crate::playback_session::load(&fixture.db).unwrap();
        assert!(session.entries.is_empty());
        assert_eq!(session.current_track_id,None);
        assert_eq!(session.current_entry_id,None);
        assert_eq!(session.position_seconds,0.0);
    }

    #[test]
    fn successful_move_cleans_collection_references() {
        let fixture = Fixture::new("references");
        save_folder(&fixture.db, &fixture.deleted).unwrap();
        let (id, _) = fixture.track("References.flac");
        let conn = fixture.db.connect().unwrap();
        conn.execute("INSERT INTO likes(track_id) VALUES(?1)", [id])
            .unwrap();
        conn.execute("INSERT INTO playlists(name) VALUES('List')", [])
            .unwrap();
        let playlist = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(?1,?2,0)",
            params![playlist, id],
        )
        .unwrap();
        conn.execute("INSERT INTO listening_history(track_id) VALUES(?1)", [id])
            .unwrap();
        drop(conn);
        crate::playback_session::save(
            &fixture.db,
            crate::playback_session::PlaybackSession {
                entries: vec![crate::playback_session::QueueEntry {
                    entry_id: 77,
                    track_id: id,
                }],
                current_entry_id: Some(77),
                current_track_id: Some(id),
                cursor: Some(0),
                position_seconds: 12.0,
            },
        )
        .unwrap();
        move_track(&fixture.db, id).unwrap();
        let conn = fixture.db.connect().unwrap();
        for table in [
            "likes",
            "playlist_tracks",
            "listening_history",
            "track_identities",
        ] {
            let count: i64 = conn
                .query_row(
                    &format!("SELECT count(*) FROM {table} WHERE track_id=?1"),
                    [id],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 0, "{table}");
        }
        let session = crate::playback_session::load(&fixture.db).unwrap();
        assert!(session.entries.is_empty());
        assert_eq!(session.current_track_id, None);
    }
}
