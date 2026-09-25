-- Secrets live in the OS credential vault; only opaque references belong here.
CREATE TABLE slskd_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  server_url TEXT NOT NULL,
  secret_ref TEXT NOT NULL CHECK(secret_ref LIKE 'Undertone/slskd/%')
);
