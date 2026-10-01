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
    connection.executescript('CREATE TABLE artists(id INTEGER,name TEXT); CREATE TABLE albums(id INTEGER,title TEXT); CREATE TABLE tracks(id INTEGER,path TEXT,title TEXT,artist_id INTEGER,album_id INTEGER,duration REAL,format TEXT,cover TEXT); CREATE TABLE track_identities(track_id INTEGER,sync_id TEXT); INSERT INTO artists VALUES(1,"Test artist"); INSERT INTO albums VALUES(1,"Test album");')
    identity = 'a' * 32
    connection.execute('INSERT INTO tracks VALUES(1,?,"Test song",1,1,0.1,"WAV",NULL)', (str(music),))
    connection.execute('INSERT INTO track_identities VALUES(1,?)', (identity,))
    connection.executescript('CREATE TABLE likes(track_id INTEGER PRIMARY KEY);CREATE TABLE playlists(id INTEGER PRIMARY KEY,sync_id TEXT UNIQUE,name TEXT,updated_at TEXT);CREATE TABLE playlist_tracks(id INTEGER PRIMARY KEY,playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,track_id INTEGER,position INTEGER);')
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
        def get(path, token=None, extra=None, body=None):
            client = http.client.HTTPSConnection(address.hostname, address.port, context=context, timeout=15)
            client.connect()
            assert hashlib.sha256(client.sock.getpeercert(binary_form=True)).hexdigest() == pairing['fingerprint']
            headers={} if token is None else {'Authorization': 'Bearer ' + token}
            headers.update(extra or {})
            client.request('GET' if body is None else 'POST', path, body=body, headers=headers)
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
        status, headers, body = get('/v1/file/' + identity, pairing['token'], {'Range':'bytes=100-199'})
        assert status == 206 and body == original[100:200] and headers['Content-Range'] == f'bytes 100-199/{len(original)}'
        assert get('/v1/file/'+identity, pairing['token'], {'Range':'bytes=999999-'})[0] == 416
        assert get('/v1/file/'+identity, pairing['token'], {'Range':'bytes=100-', 'If-Range':'"changed"'})[2] == original
        playlist = 'c' * 32
        edits=[{'id':'1'*32,'kind':'like','track':identity,'liked':True}, {'id':'2'*32,'kind':'create_playlist','playlist':playlist,'name':'Phone playlist'}, {'id':'3'*32,'kind':'add_tracks','playlist':playlist,'tracks':[identity]}]
        body=json.dumps(edits).encode()
        status,_,data=get('/v1/collections',pairing['token'],{'Content-Type':'application/json'},body)
        snapshot=json.loads(data)
        assert status==200 and snapshot['likes']==[identity] and snapshot['playlists'][0]['tracks']==[identity]
        assert json.loads(get('/v1/collections',pairing['token'],{},body)[2]) == snapshot, 'Retries must not duplicate playlist entries'
        bad=json.dumps([{'id':'4'*32,'kind':'like','track':identity,'liked':False},{'id':'5'*32,'kind':'add_tracks','playlist':playlist,'tracks':['f'*32]}]).encode()
        assert get('/v1/collections',pairing['token'],{},bad)[0]==409
        assert json.loads(get('/v1/collections',pairing['token'])[2])==snapshot, 'Conflicting batch must roll back'
        connection=sqlite3.connect(db);connection.execute('UPDATE playlists SET name="Renamed on PC"');connection.commit();connection.close()
        assert json.loads(get('/v1/collections',pairing['token'])[2])['playlists'][0]['name']=='Renamed on PC'
        protected = (root / 'phone-sync-identity.bin').read_bytes()
        assert pairing['token'].encode() not in protected
        for _ in range(2):
            process.terminate(); process.wait(timeout=10)
            status_file.unlink()
            process = subprocess.Popen([str(exe), str(db), str(status_file)], stdout=subprocess.DEVNULL)
            for attempt in range(100):
                if status_file.exists(): break
                if process.poll() is not None: raise RuntimeError('Restart failed')
                time.sleep(0.1)
            restored = json.loads(json.loads(status_file.read_text())['code'])
            assert restored == pairing, 'Address, token and certificate must survive restart'
            assert get('/v1/library', pairing['token'])[0] == 200
            status, headers, body = get('/v1/file/' + identity, pairing['token'])
            assert status == 200 and body == original
        print('PASS: TLS/auth, ranges/resume, bidirectional collections, idempotent retry/rollback, original bytes, encrypted identity/restarts')
    finally:
        process.terminate(); process.wait(timeout=10)
