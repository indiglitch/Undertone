ALTER TABLE slskd_settings ADD COLUMN download_root TEXT;

CREATE TABLE slskd_download_finalizations (
  operation_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('imported','already_in_library','file_not_found','ambiguous','invalid_file','import_failed')),
  track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
  local_path TEXT,
  finalized_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
