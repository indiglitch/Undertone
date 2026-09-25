"""Read-only verification against the Phase 2 baseline; does not re-import music."""
import hashlib, json, os, pathlib, sqlite3

root = pathlib.Path(__file__).resolve().parents[1]
out = root / 'reports/phase-2'
db = pathlib.Path(os.environ['APPDATA']) / 'local.undertone.desktop/library.sqlite3'
c = sqlite3.connect(db)
c.execute('PRAGMA query_only=ON')
c.execute('BEGIN')
expected = json.loads((out / 'track-ids-before.json').read_text(encoding='utf-8'))
actual = [list(r) for r in c.execute('SELECT id,path FROM tracks ORDER BY id')]
assert len(actual) == 912 and sorted(actual) == sorted(expected)
before = sqlite3.connect(out / 'library-before.sqlite3')
assert c.execute('SELECT * FROM track_identities ORDER BY track_id').fetchall() == before.execute('SELECT * FROM track_identities ORDER BY track_id').fetchall()
assert c.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
assert c.execute('PRAGMA foreign_key_check').fetchall() == []
assert c.execute('SELECT version FROM schema_migrations ORDER BY version').fetchall() == [(1,), (2,), (3,)]
covers = [r[0] for r in c.execute('SELECT DISTINCT cover FROM tracks WHERE cover IS NOT NULL')]
assert all(pathlib.Path(p).is_file() and pathlib.Path(p).stat().st_size > 0 for p in covers)
audio = json.loads((out / 'audio-baseline.json').read_text(encoding='utf-8'))
assert all(hashlib.sha256((root / p).read_bytes()).hexdigest() == h for p, h in audio.items())
licenses = json.loads((out / 'license-summary.json').read_text(encoding='utf-8'))
assert all(hashlib.sha256((root / p).read_bytes()).hexdigest() == h for p, h in licenses['manifest_sha256'].items())
result = {'tracks': 912, 'original_ids_paths_and_sync_ids': 'unchanged', 'migrations': [1,2,3],
          'integrity_check': 'ok', 'foreign_key_violations': 0, 'cover_files_present': len(covers),
          'audio_core_sha256': audio, 'license_manifest_hashes': 'match',
          'collections': {t: c.execute('SELECT * FROM '+t+' ORDER BY 1').fetchall()
                          for t in ['likes','playlists','playlist_tracks','listening_history']}}
(out / 'final-checks.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k != 'collections'}, ensure_ascii=False, indent=2))
