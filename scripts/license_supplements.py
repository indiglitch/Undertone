"""Retrieve missing Windows license notices from upstream at packaged VCS revisions."""
import concurrent.futures, json, pathlib, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
meta=json.loads((ROOT/'reports/phase-1.5/cargo-metadata-windows.json').read_text())
missing=set(json.loads((ROOT/'reports/phase-1.5/license-summary.json').read_text())['missing_license_text'])
dest=ROOT/'third-party/upstream-licenses';dest.mkdir(exist_ok=True)
def fetch(p):
    key=f"cargo:{p['name']}@{p['version']}"
    if key not in missing:return
    directory=pathlib.Path(p['manifest_path']).parent
    vcs=directory/'.cargo_vcs_info.json'
    repo=(p.get('repository') or '').removesuffix('.git').rstrip('/')
    if not repo.startswith('https://github.com/') or not vcs.exists():return key+' unresolved'
    revision=json.loads(vcs.read_text())['git']['sha1']
    sub=json.loads(vcs.read_text()).get('path_in_vcs','').strip('/')
    hits=[]
    for name in ['LICENSE','LICENSE-MIT','LICENSE-APACHE','LICENSE.md','LICENSE.txt','COPYING','LICENSE_MIT','LICENSE_APACHE','LICENSE-MPL-2.0']:
        url=repo.replace('github.com','raw.githubusercontent.com')+'/'+revision+'/'+name
        try:
            data=urllib.request.urlopen(url,timeout=8).read()
            if len(data)<100:continue
            out=dest/(p['name']+'-'+p['version']);out.mkdir(exist_ok=True)
            (out/name).write_bytes(data);hits.append({'file':name,'source':url})
        except Exception:pass
    if hits:(out/'provenance.json').write_text(json.dumps(hits,indent=2))
    return key+f' {len(hits)} notices'
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    for result in pool.map(fetch,meta['packages']):
        if result:print(result,flush=True)
