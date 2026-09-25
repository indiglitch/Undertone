CREATE TABLE app_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  deleted_songs_folder TEXT
);
INSERT INTO app_settings(id, deleted_songs_folder) VALUES(1, NULL);
