use crate::database::Database;
use rusqlite::{params, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, path::Path};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct QueueEntry {
    pub entry_id: i64,
    pub track_id: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct PlaybackSession {
    pub entries: Vec<QueueEntry>,
    pub current_entry_id: Option<i64>,
    pub current_track_id: Option<i64>,
    pub cursor: Option<usize>,
    pub position_seconds: f64,
}

impl Default for PlaybackSession {
    fn default() -> Self {
        Self {
            entries: Vec::new(),
            current_entry_id: None,
            current_track_id: None,
            cursor: None,
            position_seconds: 0.0,
        }
    }
}

fn safe_error() -> String {
    "Playback session is unavailable".into()
}

pub fn load(db: &Database) -> Result<PlaybackSession, String> {
    let mut conn = db.connect()?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| safe_error())?;
    let (mut current_track_id, current_entry_id, position_seconds): (
        Option<i64>,
        Option<i64>,
        f64,
    ) = tx
        .query_row(
            "SELECT current_track_id,current_entry_id,position_seconds FROM playback_session WHERE id=1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| safe_error())?;
    let candidates = tx
        .prepare("SELECT q.entry_id,q.track_id,t.path FROM playback_queue_entries q JOIN tracks t ON t.id=q.track_id ORDER BY q.order_index")
        .map_err(|_| safe_error())?
        .query_map([], |row| {
            Ok((QueueEntry {
                entry_id: row.get(0)?,
                track_id: row.get(1)?,
            },row.get::<_,String>(2)?))
        })
        .map_err(|_| safe_error())?
        .collect::<Result<Vec<_>, _>>().map_err(|_| safe_error())?;
    let mut invalid_entries = Vec::new();
    let entries = candidates
        .into_iter()
        .filter_map(|(entry, path)| {
            if Path::new(&path).is_file() {
                Some(entry)
            } else {
                invalid_entries.push(entry.entry_id);
                None
            }
        })
        .collect::<Vec<_>>();
    let valid_entries: HashSet<i64> = entries.iter().map(|entry| entry.entry_id).collect();
    tx.execute(
        "DELETE FROM playback_queue_entries WHERE track_id NOT IN (SELECT id FROM tracks)",
        [],
    )
    .map_err(|_| safe_error())?;
    for entry_id in invalid_entries {
        tx.execute(
            "DELETE FROM playback_queue_entries WHERE entry_id=?1",
            [entry_id],
        )
        .map_err(|_| safe_error())?;
    }
    if let Some(track_id) = current_track_id {
        let path = tx
            .query_row("SELECT path FROM tracks WHERE id=?1", [track_id], |row| {
                row.get::<_, String>(0)
            })
            .ok();
        if !path.is_some_and(|value| Path::new(&value).is_file()) {
            current_track_id = None;
        }
    }
    let current_entry_id = current_entry_id.filter(|id| valid_entries.contains(id));
    let cleaned_position = if current_track_id.is_some() {
        position_seconds.max(0.0)
    } else {
        0.0
    };
    tx.execute("UPDATE playback_session SET current_track_id=?1,current_entry_id=?2,position_seconds=?3 WHERE id=1",params![current_track_id,current_entry_id,cleaned_position]).map_err(|_|safe_error())?;
    let cursor =
        current_entry_id.and_then(|id| entries.iter().position(|entry| entry.entry_id == id));
    tx.commit().map_err(|_| safe_error())?;
    Ok(PlaybackSession {
        entries,
        current_entry_id,
        current_track_id,
        cursor,
        position_seconds: cleaned_position,
    })
}

pub fn save(db: &Database, session: PlaybackSession) -> Result<PlaybackSession, String> {
    if session.entries.len() > 100_000
        || !session.position_seconds.is_finite()
        || session.position_seconds < 0.0
    {
        return Err("Invalid playback session".into());
    }
    let mut conn = db.connect()?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| safe_error())?;
    let valid_tracks: HashSet<i64> = tx
        .prepare("SELECT id,path FROM tracks")
        .map_err(|_| safe_error())?
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|_| safe_error())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| safe_error())?
        .into_iter()
        .filter_map(|(id, path)| Path::new(&path).is_file().then_some(id))
        .collect();
    let mut seen_entries = HashSet::new();
    let entries: Vec<_> = session
        .entries
        .into_iter()
        .filter(|entry| {
            entry.entry_id > 0
                && seen_entries.insert(entry.entry_id)
                && valid_tracks.contains(&entry.track_id)
        })
        .collect();
    let current_track_id = session
        .current_track_id
        .filter(|id| valid_tracks.contains(id));
    let current_entry_id = session.current_entry_id.filter(|id| {
        entries
            .iter()
            .any(|entry| entry.entry_id == *id && Some(entry.track_id) == current_track_id)
    });
    tx.execute("DELETE FROM playback_queue_entries", [])
        .map_err(|_| safe_error())?;
    for (order, entry) in entries.iter().enumerate() {
        tx.execute(
            "INSERT INTO playback_queue_entries(entry_id,track_id,order_index) VALUES(?1,?2,?3)",
            params![entry.entry_id, entry.track_id, order as i64],
        )
        .map_err(|_| safe_error())?;
    }
    let position = if current_track_id.is_some() {
        session.position_seconds
    } else {
        0.0
    };
    tx.execute(
        "UPDATE playback_session SET current_track_id=?1,current_entry_id=?2,position_seconds=?3 WHERE id=1",
        params![current_track_id, current_entry_id, position],
    )
    .map_err(|_| safe_error())?;
    tx.commit().map_err(|_| safe_error())?;
    load(db)
}

pub fn playable_track_ids(db: &Database) -> Result<Vec<i64>, String> {
    let conn = db.connect()?;
    let rows = conn
        .prepare("SELECT id,path FROM tracks ORDER BY id")
        .map_err(|_| safe_error())?
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|_| safe_error())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| safe_error())?;
    Ok(rows
        .into_iter()
        .filter_map(|(id, path)| Path::new(&path).is_file().then_some(id))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf, time::SystemTime};

    struct Fixture {
        root: PathBuf,
        db: Database,
    }
    impl Fixture {
        fn new(name: &str) -> Self {
            let root = std::env::temp_dir().join(format!(
                "undertone-session-{name}-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            let db = Database::open(&root).unwrap();
            Self { root, db }
        }
        fn track(&self, title: &str) -> i64 {
            let path = self.root.join(format!("{title}.flac"));
            fs::write(&path, b"fixture").unwrap();
            let conn = self.db.connect().unwrap();
            conn.execute("INSERT OR IGNORE INTO artists(name) VALUES('Artist')", [])
                .unwrap();
            conn.execute("INSERT OR IGNORE INTO albums(title,artist_id) SELECT 'Album',id FROM artists WHERE name='Artist'",[]).unwrap();
            conn.execute("INSERT INTO tracks(path,title,artist_id,album_id,album_artist,duration,format,size,modified) SELECT ?1,?2,a.id,b.id,'Artist',180,'flac',1,'0' FROM artists a,albums b WHERE a.name='Artist' AND b.title='Album'",params![path.to_string_lossy(),title]).unwrap();
            conn.last_insert_rowid()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn order_duplicates_cursor_current_and_position_survive_restart() {
        let fixture = Fixture::new("restore");
        let a = fixture.track("A");
        let b = fixture.track("B");
        let saved = save(
            &fixture.db,
            PlaybackSession {
                entries: vec![
                    QueueEntry {
                        entry_id: 10,
                        track_id: a,
                    },
                    QueueEntry {
                        entry_id: 11,
                        track_id: b,
                    },
                    QueueEntry {
                        entry_id: 12,
                        track_id: a,
                    },
                ],
                current_entry_id: Some(11),
                current_track_id: Some(b),
                cursor: Some(1),
                position_seconds: 73.5,
            },
        )
        .unwrap();
        assert_eq!(
            saved
                .entries
                .iter()
                .map(|entry| entry.track_id)
                .collect::<Vec<_>>(),
            vec![a, b, a]
        );
        assert_eq!(saved.cursor, Some(1));
        assert_eq!(saved.current_track_id, Some(b));
        assert_eq!(saved.position_seconds, 73.5);
        assert_eq!(load(&fixture.db).unwrap(), saved);
    }

    #[test]
    fn missing_tracks_are_skipped_and_missing_current_is_cleared() {
        let fixture = Fixture::new("missing");
        let existing = fixture.track("Existing");
        let missing = fixture.track("Missing");
        save(
            &fixture.db,
            PlaybackSession {
                entries: vec![
                    QueueEntry {
                        entry_id: 1,
                        track_id: missing,
                    },
                    QueueEntry {
                        entry_id: 2,
                        track_id: existing,
                    },
                ],
                current_entry_id: Some(1),
                current_track_id: Some(missing),
                cursor: Some(0),
                position_seconds: 22.0,
            },
        )
        .unwrap();
        let conn = fixture.db.connect().unwrap();
        conn.execute("DELETE FROM track_identities WHERE track_id=?1", [missing])
            .unwrap();
        conn.execute("DELETE FROM tracks WHERE id=?1", [missing])
            .unwrap();
        drop(conn);
        let restored = load(&fixture.db).unwrap();
        assert_eq!(
            restored.entries,
            vec![QueueEntry {
                entry_id: 2,
                track_id: existing
            }]
        );
        assert_eq!(restored.current_track_id, None);
        assert_eq!(restored.current_entry_id, None);
        assert_eq!(restored.cursor, None);
        assert_eq!(restored.position_seconds, 0.0);
    }

    #[test]
    fn later_queue_mutation_replaces_persisted_snapshot() {
        let fixture = Fixture::new("mutation");
        let a = fixture.track("A");
        let b = fixture.track("B");
        save(
            &fixture.db,
            PlaybackSession {
                entries: vec![
                    QueueEntry {
                        entry_id: 1,
                        track_id: a,
                    },
                    QueueEntry {
                        entry_id: 2,
                        track_id: b,
                    },
                ],
                current_entry_id: Some(1),
                current_track_id: Some(a),
                cursor: Some(0),
                position_seconds: 0.0,
            },
        )
        .unwrap();
        let updated = save(
            &fixture.db,
            PlaybackSession {
                entries: vec![QueueEntry {
                    entry_id: 2,
                    track_id: b,
                }],
                current_entry_id: Some(2),
                current_track_id: Some(b),
                cursor: Some(0),
                position_seconds: 4.0,
            },
        )
        .unwrap();
        assert_eq!(load(&fixture.db).unwrap(), updated);
    }
}
