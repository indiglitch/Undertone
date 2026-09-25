use crate::{database::Database, providers::TrackId};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct PlaylistEntry {
    pub id: i64,
    pub track_id: TrackId,
    pub position: i64,
}
#[derive(Serialize)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub entries: Vec<PlaylistEntry>,
}
#[derive(Serialize)]
pub struct HistoryEntry {
    pub id: i64,
    pub track_id: TrackId,
    pub played_at: String,
}
#[derive(Serialize)]
pub struct Collections {
    pub likes: Vec<TrackId>,
    pub playlists: Vec<Playlist>,
    pub history: Vec<HistoryEntry>,
}
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    Like {
        track_id: TrackId,
        liked: bool,
    },
    CreatePlaylist {
        name: String,
        description: String,
    },
    EditPlaylist {
        id: i64,
        name: String,
        description: String,
    },
    DeletePlaylist {
        id: i64,
    },
    AddTracks {
        id: i64,
        track_ids: Vec<TrackId>,
    },
    RemoveEntry {
        id: i64,
        entry_id: i64,
    },
    MoveEntry {
        id: i64,
        entry_id: i64,
        index: usize,
    },
}
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn name<'a>(value: &'a str, description: &str) -> Result<&'a str, String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 120 || description.chars().count() > 2000 {
        return Err("Название: 1–120 символов; описание: до 2000".into());
    }
    Ok(value)
}
fn require_playlist(conn: &Connection, id: i64) -> Result<(), String> {
    if !conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM playlists WHERE id=?1)",
            [id],
            |r| r.get::<_, bool>(0),
        )
        .map_err(error)?
    {
        return Err("Плейлист больше не существует".into());
    }
    Ok(())
}
pub fn snapshot(db: &Database) -> Result<Collections, String> {
    let mut conn = db.connect()?;
    let tx = conn.transaction().map_err(error)?;
    let likes = tx
        .prepare("SELECT track_id FROM likes ORDER BY liked_at DESC,track_id DESC")
        .map_err(error)?
        .query_map([], |r| r.get(0))
        .map_err(error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(error)?;
    let mut playlists = tx
        .prepare("SELECT id,name,description FROM playlists ORDER BY updated_at DESC,id DESC")
        .map_err(error)?
        .query_map([], |r| {
            Ok(Playlist {
                id: r.get(0)?,
                name: r.get(1)?,
                description: r.get(2)?,
                entries: vec![],
            })
        })
        .map_err(error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(error)?;
    for p in &mut playlists {
        p.entries=tx.prepare("SELECT id,track_id,position FROM playlist_tracks WHERE playlist_id=?1 ORDER BY position").map_err(error)?.query_map([p.id],|r|Ok(PlaylistEntry{id:r.get(0)?,track_id:r.get(1)?,position:r.get(2)?})).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
    }
    // ponytail: UI shows the latest 200 starts; retain the full history in SQLite for future pagination.
    let history = tx
        .prepare("SELECT id,track_id,played_at FROM listening_history ORDER BY id DESC LIMIT 200")
        .map_err(error)?
        .query_map([], |r| {
            Ok(HistoryEntry {
                id: r.get(0)?,
                track_id: r.get(1)?,
                played_at: r.get(2)?,
            })
        })
        .map_err(error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(error)?;
    tx.commit().map_err(error)?;
    Ok(Collections {
        likes,
        playlists,
        history,
    })
}
pub fn apply(db: &Database, action: Action) -> Result<Collections, String> {
    let mut conn = db.connect()?;
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(error)?;
    match action {
        Action::Like { track_id, liked } => {
            if liked {
                tx.execute(
                    "INSERT OR IGNORE INTO likes(track_id) VALUES(?1)",
                    [track_id],
                )
                .map_err(error)?;
            } else {
                tx.execute("DELETE FROM likes WHERE track_id=?1", [track_id])
                    .map_err(error)?;
            }
        }
        Action::CreatePlaylist {
            name: n,
            description,
        } => {
            tx.execute(
                "INSERT INTO playlists(name,description) VALUES(?1,?2)",
                params![name(&n, &description)?, description],
            )
            .map_err(error)?;
        }
        Action::EditPlaylist {
            id,
            name: n,
            description,
        } => {
            require_playlist(&tx, id)?;
            tx.execute("UPDATE playlists SET name=?1,description=?2,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?3",params![name(&n,&description)?,description,id]).map_err(error)?;
        }
        Action::DeletePlaylist { id } => {
            require_playlist(&tx, id)?;
            tx.execute("DELETE FROM playlists WHERE id=?1", [id])
                .map_err(error)?;
        }
        Action::AddTracks { id, track_ids } => {
            require_playlist(&tx, id)?;
            if track_ids.is_empty() || track_ids.len() > 10000 {
                return Err("Добавьте от 1 до 10000 треков за одну операцию".into());
            }
            let start: i64 = tx
                .query_row(
                    "SELECT COALESCE(MAX(position),-1)+1 FROM playlist_tracks WHERE playlist_id=?1",
                    [id],
                    |r| r.get(0),
                )
                .map_err(error)?;
            for (i, track) in track_ids.iter().enumerate() {
                tx.execute(
                    "INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(?1,?2,?3)",
                    params![id, track, start + i as i64],
                )
                .map_err(error)?;
            }
        }
        Action::RemoveEntry { id, entry_id } => {
            require_playlist(&tx, id)?;
            if tx
                .execute(
                    "DELETE FROM playlist_tracks WHERE playlist_id=?1 AND id=?2",
                    params![id, entry_id],
                )
                .map_err(error)?
                != 1
            {
                return Err("Запись плейлиста не найдена".into());
            }
        }
        Action::MoveEntry {
            id,
            entry_id,
            index,
        } => {
            require_playlist(&tx, id)?;
            let mut entries = tx
                .prepare("SELECT id FROM playlist_tracks WHERE playlist_id=?1 ORDER BY position")
                .map_err(error)?
                .query_map([id], |r| r.get::<_, i64>(0))
                .map_err(error)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(error)?;
            let old = entries
                .iter()
                .position(|e| *e == entry_id)
                .ok_or("Запись плейлиста не найдена")?;
            if index >= entries.len() {
                return Err("Некорректная позиция".into());
            }
            entries.remove(old);
            entries.insert(index, entry_id);
            tx.execute(
                "UPDATE playlist_tracks SET position=-position-1 WHERE playlist_id=?1",
                [id],
            )
            .map_err(error)?;
            for (position, entry) in entries.iter().enumerate() {
                tx.execute(
                    "UPDATE playlist_tracks SET position=?1 WHERE id=?2",
                    params![position as i64, entry],
                )
                .map_err(error)?;
            }
        }
    }
    tx.commit().map_err(error)?;
    snapshot(db)
}
pub fn record_start(db: &Database, track_id: TrackId) -> Result<(), String> {
    db.connect()?
        .execute(
            "INSERT INTO listening_history(track_id) VALUES(?1)",
            [track_id],
        )
        .map_err(error)?;
    Ok(())
}
