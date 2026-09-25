-- IDs and rows in tracks remain untouched. Sync IDs are independent of local paths.
ALTER TABLE music_folders RENAME TO library_folders;
CREATE TABLE track_identities (
    track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE RESTRICT,
    sync_id TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    CHECK(length(sync_id)=32)
);
INSERT INTO track_identities(track_id) SELECT id FROM tracks;
CREATE TRIGGER tracks_create_identity AFTER INSERT ON tracks
BEGIN INSERT INTO track_identities(track_id) VALUES(NEW.id); END;
