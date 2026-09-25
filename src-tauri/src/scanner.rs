use crate::{
    database::Database,
    lyrics, metadata,
    providers::{MetadataProvider, SongContext},
};
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::UNIX_EPOCH,
};
use walkdir::WalkDir;

#[derive(Clone, Default, Serialize, Debug)]
pub struct Progress {
    pub running: bool,
    pub stage: String,
    pub total: usize,
    pub processed: usize,
    pub imported: usize,
    pub skipped: usize,
    pub errors: usize,
    pub current: String,
}
pub type ScanState = Arc<Mutex<Progress>>;

#[derive(Debug, PartialEq)]
pub enum IntakeOutcome {
    Imported(i64),
    AlreadyInLibrary(i64),
}

#[derive(Debug, PartialEq)]
pub enum IntakeError {
    InvalidFile(String),
    ImportFailed(String),
}

impl IntakeError {
    fn message(self) -> String {
        match self {
            Self::InvalidFile(message) | Self::ImportFailed(message) => message,
        }
    }
}

pub fn scan(db: &Database, folders: Vec<String>, state: &ScanState) -> Result<(), String> {
    let conn = db.connect()?;
    let mut files = Vec::new();
    let mut seen = HashSet::new();
    for folder in folders {
        let root = Path::new(&folder)
            .canonicalize()
            .map_err(|e| format!("{folder}: {e}"))?;
        if !root.is_dir() {
            return Err(format!("Не папка: {folder}"));
        }
        conn.execute(
            "INSERT OR IGNORE INTO library_folders VALUES(?1)",
            [root.to_string_lossy().as_ref()],
        )
        .map_err(|e| e.to_string())?;
        for entry in WalkDir::new(&root).follow_links(false) {
            match entry {
                Ok(entry) if entry.file_type().is_file() && metadata::supported(entry.path()) => {
                    if seen.insert(entry.path().to_path_buf()) {
                        files.push(entry.into_path());
                    }
                }
                Err(e) => {
                    let path = e.path().unwrap_or(&root).to_string_lossy().to_string();
                    conn.execute(
                        "INSERT OR REPLACE INTO scan_errors VALUES(?1,?2)",
                        params![path, e.to_string()],
                    )
                    .map_err(|e| e.to_string())?;
                    state.lock().unwrap().errors += 1;
                }
                _ => (),
            }
        }
    }
    import_files(db, files, state, &metadata::LocalMetadata)
}

/// Shared intake for folder discovery, completed downloads, watches and device sync.
/// Call only with completed local files. Does not register a download as a watched folder.
pub fn import_files(
    db: &Database,
    files: Vec<PathBuf>,
    state: &ScanState,
    provider: &dyn MetadataProvider,
) -> Result<(), String> {
    let mut conn = db.connect()?;
    let mut unique = HashSet::new();
    let files: Vec<_> = files
        .into_iter()
        .map(|p| p.canonicalize().unwrap_or(p))
        .filter(|p| unique.insert(p.clone()))
        .collect();
    {
        let mut s = state.lock().unwrap();
        s.total = files.len();
        s.stage = "Метаданные".into();
    }
    for path in files {
        let result = import_file_with_connection(db, &mut conn, &path, provider);
        let mut s = state.lock().unwrap();
        s.processed += 1;
        s.current = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        match result {
            Ok(IntakeOutcome::Imported(_)) => s.imported += 1,
            Ok(IntakeOutcome::AlreadyInLibrary(_)) => s.skipped += 1,
            Err(e) => {
                s.errors += 1;
                conn.execute(
                    "INSERT OR REPLACE INTO scan_errors VALUES(?1,?2)",
                    params![path.to_string_lossy(), e.message()],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

pub fn import_file(
    db: &Database,
    path: &Path,
    provider: &dyn MetadataProvider,
) -> Result<IntakeOutcome, IntakeError> {
    let canonical = path
        .canonicalize()
        .map_err(|e| IntakeError::InvalidFile(e.to_string()))?;
    let mut conn = db.connect().map_err(IntakeError::ImportFailed)?;
    import_file_with_connection(db, &mut conn, &canonical, provider)
}

fn import_file_with_connection(
    db: &Database,
    conn: &mut rusqlite::Connection,
    path: &Path,
    provider: &dyn MetadataProvider,
) -> Result<IntakeOutcome, IntakeError> {
    let invalid = |message: String| IntakeError::InvalidFile(message);
    let failed = |message: String| IntakeError::ImportFailed(message);
    let info = path.metadata().map_err(|e| invalid(e.to_string()))?;
    if !info.is_file() || !metadata::supported(path) || info.len() == 0 {
        return Err(invalid(
            "Не поддерживаемый или незавершённый аудиофайл".into(),
        ));
    }
    let modified = info
        .modified()
        .map_err(|e| invalid(e.to_string()))?
        .duration_since(UNIX_EPOCH)
        .map_err(|e| invalid(e.to_string()))?
        .as_nanos()
        .to_string();
    let path_text = path.to_string_lossy();
    let size = i64::try_from(info.len()).map_err(|e| invalid(e.to_string()))?;
    let previous: Option<(i64, String, i64)> = conn
        .query_row(
            "SELECT size,modified,id FROM tracks WHERE path=?1",
            [path_text.as_ref()],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(|e| failed(e.to_string()))?;
    if let Some((old_size, old_modified, id)) = previous {
        if old_size == size && old_modified == modified {
            let song = song_context(conn, id, path).map_err(failed)?;
            lyrics::refresh_track(db, &song, &format!("{size}:{modified}")).map_err(failed)?;
            return Ok(IntakeOutcome::AlreadyInLibrary(id));
        }
    }
    let m = provider.read(path, &db.covers).map_err(invalid)?;
    let song_fields = (
        m.title.clone(),
        m.artist.clone(),
        m.album.clone(),
        m.duration,
    );
    let tx = conn.transaction().map_err(|e| failed(e.to_string()))?;
    for name in [&m.artist, &m.album_artist] {
        tx.execute("INSERT OR IGNORE INTO artists(name) VALUES(?1)", [name])
            .map_err(|e| failed(e.to_string()))?;
    }
    let artist: i64 = tx
        .query_row("SELECT id FROM artists WHERE name=?1", [&m.artist], |r| {
            r.get(0)
        })
        .map_err(|e| failed(e.to_string()))?;
    let album_artist: i64 = tx
        .query_row(
            "SELECT id FROM artists WHERE name=?1",
            [&m.album_artist],
            |r| r.get(0),
        )
        .map_err(|e| failed(e.to_string()))?;
    tx.execute(
        "INSERT OR IGNORE INTO albums(title,artist_id) VALUES(?1,?2)",
        params![m.album, album_artist],
    )
    .map_err(|e| failed(e.to_string()))?;
    let album: i64 = tx
        .query_row(
            "SELECT id FROM albums WHERE title=?1 AND artist_id=?2",
            params![m.album, album_artist],
            |r| r.get(0),
        )
        .map_err(|e| failed(e.to_string()))?;
    tx.execute("INSERT INTO tracks(path,title,artist_id,album_id,album_artist,track_number,year,duration,format,cover,size,modified) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12) ON CONFLICT(path) DO UPDATE SET title=excluded.title,artist_id=excluded.artist_id,album_id=excluded.album_id,album_artist=excluded.album_artist,track_number=excluded.track_number,year=excluded.year,duration=excluded.duration,format=excluded.format,cover=excluded.cover,size=excluded.size,modified=excluded.modified",params![path_text,m.title,artist,album,m.album_artist,m.track_number,m.year,m.duration,m.format,m.cover,size,modified]).map_err(|e| failed(e.to_string()))?;
    let id: i64 = tx
        .query_row(
            "SELECT id FROM tracks WHERE path=?1",
            [path_text.as_ref()],
            |r| r.get(0),
        )
        .map_err(|e| failed(e.to_string()))?;
    tx.execute("DELETE FROM track_genres WHERE track_id=?1", [id])
        .map_err(|e| failed(e.to_string()))?;
    if !m.genre.trim().is_empty() {
        tx.execute("INSERT OR IGNORE INTO genres(name) VALUES(?1)", [&m.genre])
            .map_err(|e| failed(e.to_string()))?;
        tx.execute(
            "INSERT INTO track_genres SELECT ?1,id FROM genres WHERE name=?2",
            params![id, m.genre],
        )
        .map_err(|e| failed(e.to_string()))?;
    }
    tx.execute(
        "DELETE FROM scan_errors WHERE path=?1",
        [path_text.as_ref()],
    )
    .map_err(|e| failed(e.to_string()))?;
    tx.commit().map_err(|e| failed(e.to_string()))?;
    let song = SongContext {
        id,
        path: path.to_path_buf(),
        title: song_fields.0,
        artist: song_fields.1,
        album: song_fields.2,
        duration: song_fields.3,
    };
    lyrics::refresh_track(db, &song, &format!("{size}:{modified}")).map_err(failed)?;
    Ok(IntakeOutcome::Imported(id))
}

fn song_context(conn: &rusqlite::Connection, id: i64, path: &Path) -> Result<SongContext, String> {
    conn.query_row(
        "SELECT t.title,a.name,b.title,t.duration FROM tracks t JOIN artists a ON a.id=t.artist_id JOIN albums b ON b.id=t.album_id WHERE t.id=?1",
        [id],
        |row| Ok(SongContext {
            id,
            path: path.to_path_buf(),
            title: row.get(0)?,
            artist: row.get(1)?,
            album: row.get(2)?,
            duration: row.get(3)?,
        }),
    ).map_err(|e| e.to_string())
}
