CREATE TABLE playback_session (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  current_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
  current_entry_id INTEGER,
  position_seconds REAL NOT NULL DEFAULT 0 CHECK(position_seconds >= 0)
);
INSERT INTO playback_session(id) VALUES(1);

CREATE TABLE playback_queue_entries (
  entry_id INTEGER PRIMARY KEY,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL UNIQUE CHECK(order_index >= 0)
);
CREATE INDEX playback_queue_track ON playback_queue_entries(track_id);
