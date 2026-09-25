ALTER TABLE lyric_lines RENAME TO lyric_lines_phase3a;
ALTER TABLE lyrics RENAME TO lyrics_phase3a;
DROP INDEX lyric_lines_timestamp;

CREATE TABLE lyrics (
  track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK(source IN ('manual','local_lrc','embedded_synced','embedded_plain','external')),
  kind TEXT NOT NULL CHECK(kind IN ('plain','synced')),
  plain_text TEXT,
  source_fingerprint TEXT NOT NULL,
  manual_override INTEGER NOT NULL DEFAULT 0 CHECK(manual_override IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK((kind='plain' AND plain_text IS NOT NULL) OR (kind='synced' AND plain_text IS NULL)),
  CHECK((source='manual') = (manual_override=1))
);
INSERT INTO lyrics SELECT * FROM lyrics_phase3a;

CREATE TABLE lyric_lines (
  track_id INTEGER NOT NULL REFERENCES lyrics(track_id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  timestamp_ms INTEGER NOT NULL CHECK(timestamp_ms >= 0),
  text TEXT NOT NULL,
  PRIMARY KEY(track_id, order_index)
);
INSERT INTO lyric_lines SELECT * FROM lyric_lines_phase3a;
CREATE INDEX lyric_lines_timestamp ON lyric_lines(track_id, timestamp_ms, order_index);

DROP TABLE lyric_lines_phase3a;
DROP TABLE lyrics_phase3a;

ALTER TABLE lyrics_scan_state ADD COLUMN external_status TEXT
  CHECK(external_status IN ('success','not_found','ambiguous','temporary_error'));
ALTER TABLE lyrics_scan_state ADD COLUMN external_provider TEXT;
ALTER TABLE lyrics_scan_state ADD COLUMN external_attempted_at INTEGER;
ALTER TABLE lyrics_scan_state ADD COLUMN external_retry_after INTEGER;
