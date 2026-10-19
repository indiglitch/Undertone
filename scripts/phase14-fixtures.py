"""Seed only the dedicated, stopped Phase14 portable QA database. Never touches user storage."""
from pathlib import Path
import json, math, shutil, sqlite3, struct, subprocess, wave
root=Path.cwd().resolve()
qa=(root/'releases/phase14-qa').resolve()
db=(qa/'data/library.sqlite3').resolve()
assert db.is_relative_to(qa) and qa.name=='phase14-qa' and db.is_file()
check=subprocess.run(['powershell','-NoProfile','-Command',"Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '"+str(qa/'Undertone.exe')+"' } | Select-Object -ExpandProperty ProcessId"],capture_output=True,text=True)
assert not check.stdout.strip(), 'Close the QA executable before offline seeding'
fixtures=qa/'fixtures';fixtures.mkdir(exist_ok=True)
for name,seconds in [('current',60),('short',2),('plain',45),('trash',30),('duplicate',2)]:
 path=fixtures/(name+'.wav')
 with wave.open(str(path),'wb') as file:
  file.setnchannels(1);file.setsampwidth(2);file.setframerate(16000)
  block=b''.join(struct.pack('<h',int(180*math.sin(2*math.pi*220*i/16000))) for i in range(16000))
  file.writeframes(block*seconds)
(fixtures/'corrupt.wav').write_bytes(b'not an audio file - generated QA fixture')
(fixtures/'current.lrc').write_text('\n'.join(f'[{i//60:02}:{i%60:02}.00]Синхронизированный текст — строка {i+1}' for i in range(0,60,2)),encoding='utf-8')
conn=sqlite3.connect(db);conn.execute('PRAGMA foreign_keys=ON')
for table in ['playback_queue_entries','lyric_lines','lyrics_scan_state','lyrics','listening_history','playlist_tracks','playlists','likes','track_genres','track_identities','scan_errors','library_folders','tracks','albums','artists','genres']:
 if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(table,)).fetchone():conn.execute('DELETE FROM '+table)
conn.execute('UPDATE playback_session SET current_track_id=NULL,current_entry_id=NULL,position_seconds=0 WHERE id=1')
conn.executemany('INSERT INTO artists(id,name) VALUES(?,?)',[(i,f'Synthetic Artist {i}') for i in range(1,501)])
conn.executemany('INSERT INTO albums(id,title,artist_id) VALUES(?,?,?)',[(i,f'Synthetic Album {i}',(i-1)//5+1) for i in range(1,2501)])
cover=qa/'data/covers/synthetic.jpg';shutil.copyfile(root/'src-tauri/icons/128x128.png',cover)
rows=[];real=['current','short','plain','trash','duplicate']
for i in range(1,25001):
 album=(i-1)//10+1;artist=(album-1)//5+1
 path=fixtures/(real[i-1]+'.wav') if i<=5 else fixtures/'virtual'/f'{i}.flac'
 duration=[60,2,45,30,2][i-1] if i<=5 else 150+i%210
 rows.append((i,str(path),f'Synthetic Song {i}',artist,album,f'Synthetic Artist {artist}',(i-1)%10+1,2020+i%7,duration,'WAV' if i<=5 else 'FLAC',str(cover) if i%3==1 else None,path.stat().st_size if path.is_file() else 25000000,'qa-fixture','2026-10-06T10:00:00Z'))
conn.executemany('INSERT INTO tracks(id,path,title,artist_id,album_id,album_artist,track_number,year,duration,format,cover,size,modified,added_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',rows)
conn.execute('INSERT INTO library_folders(path) VALUES(?)',(str(fixtures),))
conn.execute("INSERT INTO genres(id,name) VALUES(1,'Alternative')")
conn.executemany('INSERT INTO track_genres(track_id,genre_id) VALUES(?,1)',[(i,) for i in range(1,25001)])
conn.execute("INSERT INTO playlists(id,name,description) VALUES(1,'Production QA Playlist','Synthetic duplicate occurrence fixture')")
conn.execute("INSERT INTO playlists(id,name) VALUES(2,'Empty Playlist')")
conn.executemany('INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(1,?,?)',[(i%5+1,i) for i in range(30)])
conn.executemany('INSERT INTO likes(track_id) VALUES(?)',[(1,),(3,),(5,)])
conn.executemany('INSERT INTO listening_history(track_id) VALUES(?)',[(i,) for i in [1,2,1,3,4,5]])
conn.executemany('INSERT INTO playback_queue_entries(entry_id,track_id,order_index) VALUES(?,?,?)',[(i+10,1 if i==0 else i%5+1,i) for i in range(1001)])
conn.execute('UPDATE playback_session SET current_track_id=1,current_entry_id=10,position_seconds=17 WHERE id=1')
# Plain read-only canonical LyricsView fixture. Synced lyrics are parsed from the real adjacent LRC.
conn.execute("INSERT INTO lyrics(track_id,source,kind,plain_text,source_fingerprint,manual_override) VALUES(3,'manual','plain',?,'qa',1)",('Обычный текст песни\n'*40,))
conn.commit();assert conn.execute('PRAGMA integrity_check').fetchone()[0]=='ok';conn.execute('PRAGMA wal_checkpoint(TRUNCATE)');conn.close()
print(json.dumps({'tracks':25000,'albums':2500,'artists':500,'queueOccurrences':1001,'isolated':True}))
