"""Generate a copyright-free fixture and start the real PC service on the macOS CI host."""
import json, pathlib, sqlite3, subprocess, sys, tempfile, time, wave

root = pathlib.Path(tempfile.mkdtemp(prefix='undertone-ios-network-'))
music = root / 'network.wav'
with wave.open(str(music), 'wb') as audio:
    audio.setnchannels(2); audio.setsampwidth(2); audio.setframerate(44100)
    audio.writeframes(bytes(44100 * 4 * 8))
db = root / 'library.sqlite3'
connection = sqlite3.connect(db)
connection.executescript('CREATE TABLE artists(id INTEGER,name TEXT); CREATE TABLE albums(id INTEGER,title TEXT); CREATE TABLE tracks(id INTEGER,path TEXT,title TEXT,artist_id INTEGER,album_id INTEGER,duration REAL,format TEXT,cover TEXT); CREATE TABLE track_identities(track_id INTEGER,sync_id TEXT); INSERT INTO artists VALUES(1,"CI"); INSERT INTO albums VALUES(1,"Network test");')
connection.execute('INSERT INTO tracks VALUES(1,?,"Network original",1,1,8,"WAV",NULL)', (str(music),))
connection.execute('INSERT INTO track_identities VALUES(1,?)', ('d' * 32,))
connection.commit(); connection.close()
status = root / 'pairing.json'
exe = pathlib.Path('phone-sync/target/debug/undertone-phone-sync').resolve()
process = subprocess.Popen([str(exe), str(db), str(status)], stdout=subprocess.DEVNULL, stderr=open(root / 'server.log', 'w'))
for _ in range(100):
    if status.exists(): break
    if process.poll() is not None: raise RuntimeError('Network fixture server exited')
    time.sleep(0.1)
pairing = json.loads(status.read_text())['code']
pathlib.Path('ios/Tests/Fixtures/network-pairing.json').write_text(pairing)
print('Native networking fixture ready')
