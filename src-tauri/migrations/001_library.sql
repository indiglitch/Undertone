CREATE TABLE music_folders (path TEXT PRIMARY KEY);
CREATE TABLE artists (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE albums (id INTEGER PRIMARY KEY, title TEXT NOT NULL, artist_id INTEGER NOT NULL REFERENCES artists(id), UNIQUE(title, artist_id));
CREATE TABLE genres (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE tracks (
  id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
  artist_id INTEGER NOT NULL REFERENCES artists(id), album_id INTEGER NOT NULL REFERENCES albums(id),
  album_artist TEXT NOT NULL, track_number INTEGER, year INTEGER, duration REAL NOT NULL,
  format TEXT NOT NULL, cover TEXT, size INTEGER NOT NULL, modified TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE track_genres (track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE, genre_id INTEGER NOT NULL REFERENCES genres(id), PRIMARY KEY(track_id, genre_id));
CREATE TABLE scan_errors (path TEXT PRIMARY KEY, message TEXT NOT NULL);
CREATE INDEX tracks_artist ON tracks(artist_id);
CREATE INDEX tracks_album ON tracks(album_id);
CREATE INDEX tracks_title ON tracks(title COLLATE NOCASE);
CREATE INDEX track_genres_genre ON track_genres(genre_id);
