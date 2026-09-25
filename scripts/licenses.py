"""Locked dependency inventory, SPDX 2.3 SBOM, notices and MPL corresponding sources.
Uses Cargo metadata, npm lockfile and package license files; no license service required.
"""
import base64, csv, datetime, hashlib, json, pathlib, re, shutil, subprocess, sys, tarfile, tomllib, uuid, zipfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/(sys.argv[1] if len(sys.argv)>1 else 'reports/phase-1.5')
DEST=ROOT/'third-party'
OUT.mkdir(parents=True,exist_ok=True);DEST.mkdir(exist_ok=True)
def metadata(platform=None):
    cmd=['cargo','metadata','--manifest-path',str(ROOT/'src-tauri/Cargo.toml'),'--locked','--format-version','1']
    if len(sys.argv)>2:cmd+=['--features',sys.argv[2]]
    if platform:cmd+=['--filter-platform',platform]
    return json.loads(subprocess.check_output(cmd))
all_meta=metadata(); win=metadata('x86_64-pc-windows-msvc')
(OUT/'cargo-metadata-all.json').write_text(json.dumps(all_meta),encoding='utf-8')
(OUT/'cargo-metadata-windows.json').write_text(json.dumps(win),encoding='utf-8')
active={n['id'] for n in win['resolve']['nodes']}
nodes={n['id']:n for n in win['resolve']['nodes']}
root_id=win['resolve']['root']
direct_ids={d['pkg'] for d in nodes[root_id]['deps']}
runtime=set()
def visit(pid):
    if pid in runtime:return
    runtime.add(pid)
    for d in nodes[pid]['deps']:
        if any(k['kind'] is None for k in d['dep_kinds']):visit(d['pkg'])
visit(root_id)
lock=tomllib.loads((ROOT/'src-tauri/Cargo.lock').read_text())
checksums={(p['name'],p['version']):p.get('checksum') for p in lock['package']}
npm=json.loads((ROOT/'package-lock.json').read_text())
rows=[]; packages=[]; edges=[]; notice=['# Third Party Notices','', 'Generated from the locked dependency graph. Includes build tools and other-platform packages; their inclusion here does not mean they are linked into the Windows executable.','', 'MPL-2.0 source access: see MPL-SOURCE-ACCESS.md next to this file for exact versions, upstream source links and the included modified MP3 source file. No proprietary application source is included or licensed under MPL by this notice.','']
source_access=['# MPL-2.0 corresponding source access','', 'These components remain under the Mozilla Public License 2.0 (MPL-2.0.txt). You may obtain their original source from the exact-version URLs below. Undertone application files that contain no covered code are separate and are not offered under MPL by this notice.','', '## Modified symphonia-bundle-mp3 0.5.5','', '1. Download https://crates.io/api/v1/crates/symphonia-bundle-mp3/0.5.5/download and extract the .crate (gzip tar) archive.','2. Verify original archive SHA-256: 4872dd6bb56bf5eac799e3e957aa1981086c3e613b27e0ac23b176054f7c57ed.','3. Replace src/synthesis.rs with the accompanying MPL-MODIFICATIONS/symphonia-bundle-mp3-0.5.5/synthesis.rs. This is the complete modified file in preferred source form, under MPL-2.0. All other original source files are unchanged.','', 'Modification: preserve float PCM synthesis overshoot instead of clamping to [-1,1] before volume. Original copyright/license headers are preserved. No application source is needed to obtain these covered sources.','', '## Exact unchanged upstream source versions','']
modified=ROOT/'src-tauri/vendor/symphonia-bundle-mp3/src/synthesis.rs'
modified_dest=DEST/'MPL-MODIFICATIONS/symphonia-bundle-mp3-0.5.5'
modified_dest.mkdir(parents=True,exist_ok=True)
shutil.copyfile(modified,modified_dest/'synthesis.rs')
source_access+=['Modified file SHA-256: '+hashlib.sha256(modified.read_bytes()).hexdigest(),'']
shutil.copyfile(DEST/'upstream-licenses/symphonia-0.5.5/LICENSE',DEST/'MPL-2.0.txt')
permissive={'MIT','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC','0BSD','Zlib','Unlicense','CC0-1.0','MIT-0','Unicode-3.0','Unicode-DFS-2016','BSL-1.0'}
def risk(license):
    if not license:return 'REVIEW: no declared license'
    if 'MPL-2.0' in license:return 'MPL: preserve notices and provide corresponding covered source'
    if any(x in license for x in ['GPL','AGPL','SSPL','NonCommercial','non-commercial']):
        if ' OR ' in license and any(x in license for x in ['MIT','Apache-2.0','BSD']):return 'Choose documented permissive OR alternative'
        return 'REVIEW: copyleft/restricted distribution terms'
    terms=set(re.findall(r'[A-Za-z0-9][A-Za-z0-9.\-+]*',license))-{'AND','OR','WITH'}
    if terms-permissive:return 'REVIEW: additional/custom license terms'
    return 'Permissive; retain required license/attribution notices'
def license_files(directory):
    return sorted(p for p in directory.iterdir() if p.is_file() and re.match(r'(?i)(licen[cs]e|copying|notice|copyright)([.\-_]|$)',p.name)) if directory.exists() else []
def spdx_id(kind,key):return 'SPDXRef-'+kind+'-'+hashlib.sha256(key.encode()).hexdigest()[:20]
mapping={}
source_archive=zipfile.ZipFile(DEST/'MPL-SOURCES.zip','w',zipfile.ZIP_DEFLATED,strict_timestamps=False)
missing=[]
for p in sorted(all_meta['packages'],key=lambda p:(p['name'],p['version'])):
    if p['id']==root_id:continue
    directory=pathlib.Path(p['manifest_path']).parent
    lic=(p.get('license') or '').replace(' / ',' OR ').replace('/',' OR ')
    source=p.get('source')
    download=f"https://crates.io/api/v1/crates/{p['name']}/{p['version']}/download" if source else 'NOASSERTION'
    scope='windows-runtime' if p['id'] in runtime else ('windows-build' if p['id'] in active else 'other-platform-or-dev')
    files=license_files(directory)
    supplement=DEST/'upstream-licenses'/(p['name']+'-'+p['version'])
    if not files:files=license_files(supplement)
    text='\n\n'.join(f'### {f.name}\n\n'+f.read_text(encoding='utf-8',errors='replace') for f in files)
    if not files:missing.append('cargo:'+p['name']+'@'+p['version'])
    concern=risk(lic)
    if not files:concern+='; no standalone upstream license text collected'
    if p['name']=='symphonia-codec-aac':concern+='; separately review AAC patent licensing for product/territories'
    rows.append({'ecosystem':'cargo','dependency':p['name'],'version':p['version'],'direct':p['id'] in direct_ids,'license':lic or 'NOASSERTION','scope':scope,'commercial_distribution':concern,'source':download,'license_text_found':bool(files)})
    sid=spdx_id('cargo',p['id']);mapping[p['id']]=sid
    package={'SPDXID':sid,'name':p['name'],'versionInfo':p['version'],'downloadLocation':download,'filesAnalyzed':False,'licenseConcluded':'NOASSERTION','licenseDeclared':lic or 'NOASSERTION','copyrightText':'NOASSERTION','externalRefs':[{'referenceCategory':'PACKAGE-MANAGER','referenceType':'purl','referenceLocator':f"pkg:cargo/{p['name']}@{p['version']}"}],'comment':scope+('; locally patched; see MPL-SOURCE-ACCESS.md and MPL-MODIFICATIONS' if not source else '')}
    checksum=checksums.get((p['name'],p['version']))
    if checksum:package['checksums']=[{'algorithm':'SHA256','checksumValue':checksum}]
    packages.append(package)
    notice.extend([f"## {p['name']} {p['version']} ({scope})",'',f'License: {lic or "NOASSERTION"}',f'Source: {download}',f'Authors: {", ".join(p.get("authors",[]))}', '',text or 'No standalone license text in this package; see the source distribution and declared SPDX license.',''])
    if lic=='MPL-2.0' and p['id'] in active:
        if source:source_access.append(f"- {p['name']} {p['version']}: {download}; archive SHA-256 {checksums.get((p['name'],p['version']),'NOASSERTION')}")
        for f in sorted(directory.rglob('*')):
            if f.is_file() and 'target' not in f.relative_to(directory).parts:
                source_archive.write(f,f"{p['name']}-{p['version']}/{f.relative_to(directory).as_posix()}")
        for f in license_files(supplement):
            if not (directory/f.name).exists():source_archive.write(f,f"{p['name']}-{p['version']}/{f.name}")
source_archive.close()
(DEST/'MPL-SOURCE-ACCESS.md').write_text('\n'.join(source_access)+'\n',encoding='utf-8')
for node in all_meta['resolve']['nodes']:
    for d in node['deps']:
        if node['id'] in mapping and d['pkg'] in mapping:edges.append({'spdxElementId':mapping[node['id']],'relationshipType':'DEPENDS_ON','relatedSpdxElement':mapping[d['pkg']]})
npm_ids={}
for path,p in npm['packages'].items():
    if not path:continue
    name=p.get('name') or path.split('node_modules/')[-1]
    lic=p.get('license','')
    directory=ROOT/path
    if not lic and (directory/'package.json').exists():lic=json.loads((directory/'package.json').read_text(encoding='utf-8')).get('license','')
    if not isinstance(lic,str):lic=json.dumps(lic)
    files=license_files(directory)
    scope='frontend-build' if p.get('dev') else 'frontend-runtime'
    if not directory.exists():scope+='-optional-not-installed'
    rows.append({'ecosystem':'npm','dependency':name,'version':p['version'],'direct':name in (npm['packages'][''].get('dependencies',{})|npm['packages'][''].get('devDependencies',{})),'license':lic or 'NOASSERTION','scope':scope,'commercial_distribution':risk(lic)+('; no standalone license text collected' if directory.exists() and not files else ''),'source':p.get('resolved','NOASSERTION'),'license_text_found':bool(files)})
    sid=spdx_id('npm',path);npm_ids[path]=sid
    package={'SPDXID':sid,'name':name,'versionInfo':p['version'],'downloadLocation':p.get('resolved','NOASSERTION'),'filesAnalyzed':False,'licenseConcluded':'NOASSERTION','licenseDeclared':lic or 'NOASSERTION','copyrightText':'NOASSERTION','comment':scope,'externalRefs':[{'referenceCategory':'PACKAGE-MANAGER','referenceType':'purl','referenceLocator':f'pkg:npm/{name.replace("@","%40")}@{p["version"]}'}]}
    integrity=p.get('integrity','')
    if integrity.startswith('sha512-'):package['checksums']=[{'algorithm':'SHA512','checksumValue':base64.b64decode(integrity[7:]).hex()}]
    packages.append(package)
    if directory.exists():
        if not files:missing.append('npm:'+name+'@'+p['version'])
        notice.extend([f'## {name} {p["version"]} ({scope})','',f'License: {lic}',f'Source: {p.get("resolved", "NOASSERTION")}','', '\n\n'.join(f'### {f.name}\n\n'+f.read_text(encoding='utf-8',errors='replace') for f in files) or 'No standalone license text found.',''])
for path,p in npm['packages'].items():
    if not path:continue
    for name in p.get('dependencies',{}):
        parent=path
        while True:
            candidate=parent+'/node_modules/'+name if parent else 'node_modules/'+name
            if candidate in npm_ids:
                edges.append({'spdxElementId':npm_ids[path],'relationshipType':'DEPENDS_ON','relatedSpdxElement':npm_ids[candidate]});break
            if not parent:break
            parent=parent.rsplit('/node_modules/',1)[0] if '/node_modules/' in parent else ''
with (OUT/'license-inventory.csv').open('w',encoding='utf-8-sig',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=rows[0].keys());writer.writeheader();writer.writerows(rows)
(DEST/'THIRD_PARTY_NOTICES.md').write_text('\n'.join(notice),encoding='utf-8')
sbom={'spdxVersion':'SPDX-2.3','dataLicense':'CC0-1.0','SPDXID':'SPDXRef-DOCUMENT','name':'Undertone dependency catalog - locked all-target and build graph','documentNamespace':'https://undertone.local/spdx/'+str(uuid.uuid4()),'creationInfo':{'creators':['Tool: Undertone scripts/licenses.py'],'created':datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')},'packages':packages,'relationships':[{'spdxElementId':'SPDXRef-DOCUMENT','relationshipType':'DESCRIBES','relatedSpdxElement':p['SPDXID']} for p in packages]+edges}
(DEST/'dependencies.spdx.json').write_text(json.dumps(sbom,indent=2),encoding='utf-8')
ids={p['SPDXID'] for p in packages}|{'SPDXRef-DOCUMENT'}
assert len(ids)==len(packages)+1
assert all(r['spdxElementId'] in ids and r['relatedSpdxElement'] in ids for r in sbom['relationships'])
summary={'cargo_packages':sum(r['ecosystem']=='cargo' for r in rows),'npm_packages':sum(r['ecosystem']=='npm' for r in rows),'licenses':sorted({r['license'] for r in rows}),'review':[r for r in rows if not r['commercial_distribution'].startswith('Permissive')],'missing_license_text':missing,'manifest_sha256':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in ['package.json','package-lock.json','src-tauri/Cargo.toml','src-tauri/Cargo.lock']}}
(OUT/'license-summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in summary.items() if k not in ['review','licenses']},indent=2))
