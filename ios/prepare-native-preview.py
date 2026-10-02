"""Seed only the CI simulator container with real WAV originals for visual captures."""
import hashlib, json, struct, sys, wave
from pathlib import Path
root = Path(sys.argv[1]) / "Library/Application Support/Undertone"
(root / "Music").mkdir(parents=True, exist_ok=True)
songs = []
for index, (title, artist, album) in enumerate([
    ("Midnight city", "Demo Artist", "Night drive"),
    ("After the rain", "Demo Artist", "Night drive"),
    ("Slow motion", "Second Artist", "Soft light"),
]):
    path = root / "Music" / f"preview-{index}.wav"
    with wave.open(str(path), "wb") as audio:
        audio.setparams((1, 2, 8000, 0, "NONE", "not compressed"))
        audio.writeframes(struct.pack("<h", index) * (8000 * 240))
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    songs.append(dict(id=digest, filename=path.name, title=title, artist=artist,
        album=album, duration=240, size=path.stat().st_size, format="WAV", addedAt=812592000, syncID=f"{index+1:032x}"))
(root / "library.json").write_text(json.dumps(dict(version=1, songs=songs)))
(root / "player-session.json").write_text(json.dumps(dict(ids=[s["id"] for s in songs],
    currentID=songs[0]["id"], repeatMode="off", position=42)))

tracks = [dict(sync_id=s["syncID"], title=s["title"], artist=s["artist"], album=s["album"], duration=s["duration"], size=s["size"], format="WAV") for s in songs]
tracks.append(dict(sync_id="ffffffffffffffffffffffffffffffff", title="Far away", artist="Demo Artist", album="Night drive", duration=240, size=songs[0]["size"], format="WAV"))
(root / "pc-catalog.json").write_text(json.dumps(dict(version=1,tracks=tracks)))
(root / "pc-collections.json").write_text(json.dumps(dict(collections=dict(likes=[songs[0]["syncID"]], playlists=[dict(id="11111111111111111111111111111111", name="Вечером", tracks=[s["syncID"] for s in songs]+[tracks[-1]["sync_id"]], description="Общий плейлист iPhone и ПК")]), pending=[])))
(root / "personal-library.json").write_text(json.dumps(dict(likes=[],albums=["Demo Artist — Night drive"],artists=[],pins=[],playlists=[],folders=[],playlistFolders={},recents=[],searches=[])))
