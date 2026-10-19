"""Own WAV/RIFF fixtures for the native scanner and two bounded LRCLIB lookups."""
import pathlib, struct, wave
root=pathlib.Path(__file__).resolve().parents[1]/'releases/phase14-qa/fixtures/scan-smoke'
root.mkdir(exist_ok=True)
def audio(name,title,artist,duration,album='QA'):
    target=root/name
    with wave.open(str(target),'wb') as out:
        out.setnchannels(1);out.setsampwidth(2);out.setframerate(8000)
        out.writeframes(bytes(8000*2*duration))
    chunks=b'INFO'
    for key,value in [(b'INAM',title),(b'IART',artist),(b'IPRD',album)]:
        data=value.encode()+b'\0';chunks+=key+struct.pack('<I',len(data))+data+(b'\0' if len(data)%2 else b'')
    content=target.read_bytes()+b'LIST'+struct.pack('<I',len(chunks))+chunks
    target.write_bytes(content[:4]+struct.pack('<I',len(content)-8)+content[8:])
audio('found.wav','Never Gonna Give You Up','Rick Astley',212)
audio('found-correct.wav','Never Gonna Give You Up','Rick Astley',214,'Whenever You Need Somebody')
audio('not-found.wav','Undertone Phase14 Impossible Title 7d47c','QA Artist 7d47c',3)
audio('remove.wav','Own filesystem smoke','QA Artist',4)
(root/'duplicate.wav').write_bytes((root/'remove.wav').read_bytes())
(root/'corrupt.wav').write_bytes(b'corrupt QA fixture')
print('Created five own scanner fixtures; no user music touched.')
