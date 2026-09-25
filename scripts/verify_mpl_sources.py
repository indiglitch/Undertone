"""Verify the exact source links/hashes shipped to recipients, including our modification."""
import concurrent.futures, hashlib, io, pathlib, re, tarfile, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
text=(ROOT/'third-party/MPL-SOURCE-ACCESS.md').read_text(encoding='utf-8')
sources=re.findall(r'(https://crates.io/api/v1/crates/[^\s;]+/download); archive SHA-256 ([a-f0-9]{64})',text)
sources.append(('https://crates.io/api/v1/crates/symphonia-bundle-mp3/0.5.5/download','4872dd6bb56bf5eac799e3e957aa1981086c3e613b27e0ac23b176054f7c57ed'))
def verify(item):
    url,digest=item
    request=urllib.request.Request(url,headers={'User-Agent':'Undertone source-compliance verification'})
    data=urllib.request.urlopen(request,timeout=40).read()
    assert hashlib.sha256(data).hexdigest()==digest,url
    if '/symphonia-bundle-mp3/' in url:
        with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
            for member in archive.getmembers():
                if not member.isfile() or not member.name.endswith('.rs'):continue
                relative=pathlib.PurePosixPath(member.name).relative_to('symphonia-bundle-mp3-0.5.5')
                original=archive.extractfile(member).read()
                current=(ROOT/'src-tauri/vendor/symphonia-bundle-mp3'/relative).read_bytes()
                if str(relative)=='src/synthesis.rs':
                    supplied=(ROOT/'third-party/MPL-MODIFICATIONS/symphonia-bundle-mp3-0.5.5/synthesis.rs').read_bytes()
                    assert supplied==current and current!=original
                else:assert current==original,str(relative)
        print('Modified MP3 source reconstructed exactly from upstream + supplied synthesis.rs',flush=True)
    return 'PASS '+url+' SHA-256 '+digest
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    for result in pool.map(verify,sources):print(result,flush=True)
print(f'PASS {len(sources)} exact source downloads; no proprietary source needed')
