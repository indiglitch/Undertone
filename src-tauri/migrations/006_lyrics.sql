CREATE TABLE lyrics (
  track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK(source IN ('manual','local_lrc','embedded_synced','embedded_plain')),
  kind TEXT NOT NULL CHECK(kind IN ('plain','synced')),
  plain_text TEXT,
  source_fingerprint TEXT NOT NULL,
  manual_override INTEGER NOT NULL DEFAULT 0 CHECK(manual_override IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK((kind='plain' AND plain_text IS NOT NULL) OR (kind='synced' AND plain_text IS NULL)),
  CHECK((source='manual') = (manual_override=1))
);

CREATE TABLE lyric_lines (
  track_id INTEGER NOT NULL REFERENCES lyrics(track_id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  timestamp_ms INTEGER NOT NULL CHECK(timestamp_ms >= 0),
  text TEXT NOT NULL,
  PRIMARY KEY(track_id, order_index)
);
CREATE INDEX lyric_lines_timestamp ON lyric_lines(track_id, timestamp_ms, order_index);

-- Records both positive and negative lookups so an unchanged rescan does no tag/text decoding.
CREATE TABLE lyrics_scan_state (
  track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  audio_fingerprint TEXT NOT NULL,
  lrc_fingerprint TEXT
);
