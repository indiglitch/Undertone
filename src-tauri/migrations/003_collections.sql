CREATE TABLE likes (
  track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE RESTRICT,
  liked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_id TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description)<=2000),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE playlist_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL,
  UNIQUE(playlist_id,position)
);
CREATE INDEX playlist_tracks_track ON playlist_tracks(track_id);
CREATE TABLE listening_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_id TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE RESTRICT,
  played_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX listening_history_track ON listening_history(track_id,id DESC);
