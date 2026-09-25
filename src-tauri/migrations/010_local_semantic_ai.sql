CREATE TABLE track_embeddings (
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL CHECK(length(provider_id) > 0),
  model_id TEXT NOT NULL CHECK(length(model_id) > 0),
  model_version TEXT NOT NULL CHECK(length(model_version) > 0),
  dimension INTEGER NOT NULL CHECK(dimension > 0),
  vector BLOB NOT NULL CHECK(typeof(vector) = 'blob' AND length(vector) = dimension * 4),
  input_fingerprint TEXT NOT NULL CHECK(length(input_fingerprint) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(track_id, provider_id, model_id, model_version)
);

CREATE INDEX track_embeddings_track ON track_embeddings(track_id);

CREATE TABLE semantic_analyses (
  id INTEGER PRIMARY KEY,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL CHECK(length(provider_id) > 0),
  model_id TEXT NOT NULL CHECK(length(model_id) > 0),
  model_version TEXT NOT NULL CHECK(length(model_version) > 0),
  schema_version INTEGER NOT NULL CHECK(schema_version > 0),
  energy REAL,
  valence REAL,
  summary TEXT,
  input_fingerprint TEXT NOT NULL CHECK(length(input_fingerprint) > 0),
  analyzed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(track_id, provider_id, model_id, model_version, schema_version)
);

CREATE INDEX semantic_analyses_track ON semantic_analyses(track_id);

CREATE TABLE semantic_analysis_moods (
  analysis_id INTEGER NOT NULL REFERENCES semantic_analyses(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL CHECK(order_index >= 0),
  mood TEXT NOT NULL CHECK(length(mood) > 0),
  PRIMARY KEY(analysis_id, order_index)
);

CREATE TABLE semantic_analysis_themes (
  analysis_id INTEGER NOT NULL REFERENCES semantic_analyses(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL CHECK(order_index >= 0),
  theme TEXT NOT NULL CHECK(length(theme) > 0),
  PRIMARY KEY(analysis_id, order_index)
);
