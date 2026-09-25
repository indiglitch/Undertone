use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    time::Duration,
};

#[derive(Clone)]
pub struct Database {
    pub path: PathBuf,
    pub covers: PathBuf,
}

#[cfg(all(test, feature = "portable", not(feature = "ai")))]
mod portable_schema_tests {
    use super::Database;

    #[test]
    fn fresh_portable_database_has_no_semantic_schema() {
        let directory = std::env::temp_dir().join(format!(
            "undertone-no-ai-schema-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let database = Database::open(&directory).unwrap();
        let connection = database.connect().unwrap();
        let ai_migration: i64 = connection
            .query_row(
                "SELECT count(*) FROM schema_migrations WHERE version=10",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(ai_migration, 0);
        assert!(database.library().unwrap().tracks.is_empty());
        drop(connection);
        drop(database);
        std::fs::remove_dir_all(directory).unwrap();
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct Track {
    pub id: i64,
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub track_number: Option<u32>,
    pub year: Option<u32>,
    pub duration: f64,
    pub format: String,
    pub cover: Option<String>,
    pub genre: String,
    pub artist_id: i64,
    pub album_id: i64,
    pub added_at: String,
    pub has_lyrics: bool,
}
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct TrackMetadataDetails {
    pub size_bytes: Option<i64>,
    pub lyrics_source: Option<String>,
}
#[derive(Serialize)]
pub struct Library {
    pub tracks: Vec<Track>,
    pub folders: Vec<String>,
    pub errors: Vec<ScanError>,
}
#[derive(Serialize)]
pub struct ScanError {
    pub path: String,
    pub message: String,
}

impl Database {
    pub fn open(directory: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(directory.join("covers")).map_err(|e| e.to_string())?;
        let db = Self {
            path: directory.join("library.sqlite3"),
            covers: directory.join("covers"),
        };
        let mut conn = db.connect()?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| e.to_string())?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY);",
        )
        .map_err(|e| e.to_string())?;
        #[allow(unused_mut)]
        let mut migrations = vec![
            (1, include_str!("../migrations/001_library.sql")),
            (
                2,
                include_str!("../migrations/002_identity_and_folders.sql"),
            ),
            (3, include_str!("../migrations/003_collections.sql")),
            (4, include_str!("../migrations/004_slskd_settings.sql")),
            (
                5,
                include_str!("../migrations/005_slskd_download_finalize.sql"),
            ),
            (6, include_str!("../migrations/006_lyrics.sql")),
            (7, include_str!("../migrations/007_external_lyrics.sql")),
            (8, include_str!("../migrations/008_deleted_songs.sql")),
            (9, include_str!("../migrations/009_playback_session.sql")),
        ];
        #[cfg(feature = "ai")]
        migrations.push((10, include_str!("../migrations/010_local_semantic_ai.sql")));
        for (version, sql) in migrations {
            let applied: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=?1)",
                    [version],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            if !applied {
                let tx = conn.transaction().map_err(|e| e.to_string())?;
                tx.execute_batch(sql).map_err(|e| e.to_string())?;
                tx.execute("INSERT INTO schema_migrations VALUES(?1)", [version])
                    .map_err(|e| e.to_string())?;
                tx.commit().map_err(|e| e.to_string())?;
            }
        }
        Ok(db)
    }
    pub fn connect(&self) -> Result<Connection, String> {
        let conn = Connection::open(&self.path).map_err(|e| e.to_string())?;
        conn.busy_timeout(Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| e.to_string())?;
        Ok(conn)
    }
    pub fn library(&self) -> Result<Library, String> {
        let conn = self.connect()?;
        // ponytail: metadata-only snapshot is fine for tens of thousands; page IPC if libraries grow beyond that.
        let mut stmt = conn.prepare("SELECT t.id,t.path,t.title,a.name,b.title,t.album_artist,t.track_number,t.year,t.duration,t.format,t.cover,COALESCE((SELECT group_concat(g.name, ', ') FROM track_genres tg JOIN genres g ON g.id=tg.genre_id WHERE tg.track_id=t.id),''),t.artist_id,t.album_id,t.added_at,l.track_id IS NOT NULL FROM tracks t JOIN artists a ON a.id=t.artist_id JOIN albums b ON b.id=t.album_id LEFT JOIN lyrics l ON l.track_id=t.id ORDER BY a.name COLLATE NOCASE,b.title COLLATE NOCASE,t.track_number,t.title COLLATE NOCASE").map_err(|e| e.to_string())?;
        let tracks = stmt
            .query_map([], |r| {
                Ok(Track {
                    id: r.get(0)?,
                    path: r.get(1)?,
                    title: r.get(2)?,
                    artist: r.get(3)?,
                    album: r.get(4)?,
                    album_artist: r.get(5)?,
                    track_number: r.get(6)?,
                    year: r.get(7)?,
                    duration: r.get(8)?,
                    format: r.get(9)?,
                    cover: r.get(10)?,
                    genre: r.get(11)?,
                    artist_id: r.get(12)?,
                    album_id: r.get(13)?,
                    added_at: r.get(14)?,
                    has_lyrics: r.get(15)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT path FROM library_folders ORDER BY path")
            .map_err(|e| e.to_string())?;
        let folders = stmt
            .query_map([], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<String>, _>>()
            .map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT path,message FROM scan_errors ORDER BY path")
            .map_err(|e| e.to_string())?;
        let errors = stmt
            .query_map([], |r| {
                Ok(ScanError {
                    path: r.get(0)?,
                    message: r.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(Library {
            tracks,
            folders,
            errors,
        })
    }
    pub fn remove_library_folder(&self, folder: &str) -> Result<bool, String> {
        if folder.trim().is_empty() {
            return Ok(false);
        }
        self.connect()?
            .execute("DELETE FROM library_folders WHERE path=?1", [folder])
            .map(|changed| changed > 0)
            .map_err(|e| e.to_string())
    }
    pub fn track(&self, id: i64) -> Result<(String, f64), String> {
        self.connect()?
            .query_row(
                "SELECT path,duration FROM tracks WHERE id=?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|e| e.to_string())
    }
    pub fn track_metadata_details(&self, id: i64) -> Result<TrackMetadataDetails, String> {
        self.connect()?
            .query_row(
                "SELECT t.size,l.source FROM tracks t LEFT JOIN lyrics l ON l.track_id=t.id WHERE t.id=?1",
                [id],
                |row| Ok(TrackMetadataDetails { size_bytes: row.get(0)?, lyrics_source: row.get(1)? }),
            )
            .optional()
            .map_err(|_| "Track metadata could not be loaded".to_string())?
            .ok_or_else(|| "Local track was not found".to_string())
    }
}
