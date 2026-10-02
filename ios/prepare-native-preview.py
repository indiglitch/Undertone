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
        album=album, duration=240, size=path.stat().st_size, format="WAV", addedAt=812592000))
(root / "library.json").write_text(json.dumps(dict(version=1, songs=songs)))
(root / "player-session.json").write_text(json.dumps(dict(ids=[s["id"] for s in songs],
    currentID=songs[0]["id"], repeatMode="off", position=42)))
