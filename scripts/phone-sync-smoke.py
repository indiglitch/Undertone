"""Exercise the real TLS service with original bytes and a read-only library fixture."""
import hashlib, http.client, json, pathlib, sqlite3, ssl, subprocess, tempfile, time, wave

exe = pathlib.Path('phone-sync/target/debug/undertone-phone-sync.exe').resolve()
with tempfile.TemporaryDirectory(prefix='undertone-phone-test-') as temporary:
    root = pathlib.Path(temporary)
    music = root / 'original.wav'
    with wave.open(str(music), 'wb') as audio:
        audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(8000)
        audio.writeframes(bytes(1600))
    original = music.read_bytes()
    db = root / 'library.sqlite3'
    connection = sqlite3.connect(db)
    connection.executescript('CREATE TABLE artists(id INTEGER,name TEXT); CREATE TABLE albums(id INTEGER,title TEXT); CREATE TABLE tracks(id INTEGER,path TEXT,title TEXT,artist_id INTEGER,album_id INTEGER,duration REAL,format TEXT); CREATE TABLE track_identities(track_id INTEGER,sync_id TEXT); INSERT INTO artists VALUES(1,"Test artist"); INSERT INTO albums VALUES(1,"Test album");')
    identity = 'a' * 32
    connection.execute('INSERT INTO tracks VALUES(1,?,"Test song",1,1,0.1,"WAV")', (str(music),))
    connection.execute('INSERT INTO track_identities VALUES(1,?)', (identity,))
    connection.commit(); connection.close()
    status_file = root / 'pairing.json'
    process = subprocess.Popen([str(exe), str(db), str(status_file)], stdout=subprocess.DEVNULL)
    try:
        for _ in range(100):
            if status_file.exists(): break
            if process.poll() is not None: raise RuntimeError('Server exited')
            time.sleep(0.1)
        pairing = json.loads(json.loads(status_file.read_text())['code'])
        from urllib.parse import urlparse
        address = urlparse(pairing['address'])
        # The test disables CA validation ONLY to independently check the pinned certificate.
        context = ssl._create_unverified_context()
        def get(path, token=None):
            client = http.client.HTTPSConnection(address.hostname, address.port, context=context, timeout=15)
            client.connect()
            assert hashlib.sha256(client.sock.getpeercert(binary_form=True)).hexdigest() == pairing['fingerprint']
            client.request('GET', path, headers={} if token is None else {'Authorization': 'Bearer ' + token})
            response = client.getresponse(); body = response.read(); headers = dict(response.getheaders()); status = response.status
            client.close(); return status, headers, body
        assert get('/v1/library')[0] == 401
        assert get('/v1/library', 'b' * 64)[0] == 401
        status, headers, body = get('/v1/library', pairing['token'])
        manifest = json.loads(body)
        assert status == 200 and len(manifest['tracks']) == 1
        assert 'path' not in manifest['tracks'][0]
        assert manifest['tracks'][0]['size'] == len(original)
        status, headers, body = get('/v1/file/' + identity, pairing['token'])
        assert status == 200 and body == original
        assert headers['X-Content-SHA256'] == hashlib.sha256(original).hexdigest()
        assert get('/v1/file/../../outside', pairing['token'])[0] == 404
        assert get('/v1/file/' + 'f' * 32, pairing['token'])[0] == 404
        print('PASS: TLS fingerprint, auth rejection, catalog, original bytes/hash, traversal and missing identity')
    finally:
        process.terminate(); process.wait(timeout=10)
