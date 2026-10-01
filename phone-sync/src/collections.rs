use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize)]
pub struct Snapshot { pub likes: Vec<String>, pub playlists: Vec<Playlist> }
#[derive(Serialize)]
pub struct Playlist { pub id: String, pub name: String, pub tracks: Vec<String> }
#[derive(Deserialize)]
pub struct Operation {
    pub id: String, pub kind: String, pub track: Option<String>, pub liked: Option<bool>,
    pub playlist: Option<String>, pub name: Option<String>, pub tracks: Option<Vec<String>>,
}
fn valid_id(id: &str) -> bool { id.len()==32 && id.bytes().all(|b|b.is_ascii_hexdigit()) }
fn snapshot_connection(db: &Connection) -> rusqlite::Result<Snapshot> {
    let likes = db.prepare("SELECT i.sync_id FROM likes l JOIN track_identities i ON i.track_id=l.track_id ORDER BY i.sync_id")?
        .query_map([],|r|r.get(0))?.collect::<Result<Vec<String>,_>>()?;
    let mut playlists = db.prepare("SELECT sync_id,name,id FROM playlists ORDER BY sync_id")?
        .query_map([],|r|Ok((Playlist{id:r.get(0)?,name:r.get(1)?,tracks:vec![]},r.get::<_,i64>(2)?)))?
        .collect::<Result<Vec<_>,_>>()?;
    for (p,id) in &mut playlists {
        p.tracks=db.prepare("SELECT i.sync_id FROM playlist_tracks p JOIN track_identities i ON i.track_id=p.track_id WHERE p.playlist_id=?1 ORDER BY p.position,p.id")?
            .query_map([*id],|r|r.get(0))?.collect::<Result<Vec<String>,_>>()?;
    }
    Ok(Snapshot{likes,playlists:playlists.into_iter().map(|(p,_)|p).collect()})
}
pub fn snapshot(path: &PathBuf) -> Result<Snapshot,String> {
    let mut db=Connection::open_with_flags(path,rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e|e.to_string())?;
    let tx=db.transaction().map_err(|e|e.to_string())?;
    snapshot_connection(&tx).map_err(|e|e.to_string())
}
pub fn apply(path: &PathBuf, operations: Vec<Operation>) -> Result<Snapshot,String> {
    if operations.len()>500 {return Err("Too many edits".into());}
    let mut db=Connection::open(path).map_err(|e|e.to_string())?;
    db.busy_timeout(std::time::Duration::from_secs(10)).map_err(|e|e.to_string())?;
    db.execute_batch("PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS phone_sync_operations(id TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);").map_err(|e|e.to_string())?;
    let tx=db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(|e|e.to_string())?;
    for op in operations {
        if !valid_id(&op.id){return Err("Invalid edit identity".into());}
        if tx.query_row("SELECT EXISTS(SELECT 1 FROM phone_sync_operations WHERE id=?1)",[&op.id],|r|r.get::<_,bool>(0)).map_err(|e|e.to_string())? {continue;}
        let playlist=op.playlist.as_deref().unwrap_or("");
        let track=op.track.as_deref().unwrap_or("");
        let track_id=|id:&str|->Result<i64,String>{tx.query_row("SELECT track_id FROM track_identities WHERE sync_id=?1",[id],|r|r.get(0)).map_err(|_|"Track no longer exists on PC".into())};
        let playlist_id=||->Result<i64,String>{tx.query_row("SELECT id FROM playlists WHERE sync_id=?1",[playlist],|r|r.get(0)).map_err(|_|"Playlist no longer exists on PC".into())};
        let name=op.name.as_deref().unwrap_or("").trim();
        if op.kind != "like" && !valid_id(playlist) {return Err("Invalid playlist identity".into());}
        if matches!(op.kind.as_str(),"create_playlist"|"rename_playlist") && (name.is_empty()||name.chars().count()>120){return Err("Playlist name must contain 1–120 characters".into());}
        let result=match op.kind.as_str() {
            "like" => {let id=track_id(track)?; if op.liked.ok_or("Missing liked state")? {tx.execute("INSERT OR IGNORE INTO likes(track_id) VALUES(?1)",[id])}else{tx.execute("DELETE FROM likes WHERE track_id=?1",[id])}},
            "create_playlist" => tx.execute("INSERT INTO playlists(sync_id,name) VALUES(?1,?2)",params![playlist,name]),
            "rename_playlist" => tx.execute("UPDATE playlists SET name=?1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2",params![name,playlist_id()?]),
            "delete_playlist" => tx.execute("DELETE FROM playlists WHERE sync_id=?1",[playlist]),
            "add_tracks" => {
                let id=playlist_id()?;let tracks=op.tracks.as_ref().ok_or("Missing tracks")?;if tracks.len()>10000{return Err("Too many tracks".into());}
                let mut position:i64=tx.query_row("SELECT COALESCE(MAX(position),-1)+1 FROM playlist_tracks WHERE playlist_id=?1",[id],|r|r.get(0)).map_err(|e|e.to_string())?;
                for track in tracks {tx.execute("INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(?1,?2,?3)",params![id,track_id(track)?,position]).map_err(|e|e.to_string())?;position+=1;}
                tx.execute("UPDATE playlists SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?1",[id])
            },
            "remove_track" => {let id=playlist_id()?;tx.execute("DELETE FROM playlist_tracks WHERE playlist_id=?1 AND track_id=?2",params![id,track_id(track)?])},
            _ => return Err("Unknown edit".into()),
        };
        result.map_err(|e|e.to_string())?;
        tx.execute("INSERT INTO phone_sync_operations(id) VALUES(?1)",[op.id]).map_err(|e|e.to_string())?;
    }
    let result=snapshot_connection(&tx).map_err(|e|e.to_string())?;
    tx.commit().map_err(|e|e.to_string())?;Ok(result)
}
