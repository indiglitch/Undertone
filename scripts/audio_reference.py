"""Independent decoding comparison. FFmpeg is a local QA tool, never a shipped dependency."""
import argparse, collections, json, math, pathlib, subprocess
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('stage', choices=['before', 'after'])
args = parser.parse_args()
out = ROOT / 'reports' / 'phase-1.5' / ('audio-' + args.stage)
out.mkdir(parents=True, exist_ok=True)
rows = json.loads((out.parent / 'track-ids-before.json').read_text(encoding='utf-8'))
selected, rates = {}, collections.Counter()
for _, path in rows:
    p = pathlib.Path(path)
    if p.suffix.lower() == '.mp3':
        selected.setdefault('mp3', path)
    elif p.suffix.lower() == '.flac':
        with p.open('rb') as f:
            data = f.read(128)
        offset = data.find(b'fLaC')
        if offset >= 0:
            packed = int.from_bytes(data[offset+18:offset+26], 'big')
            sr = packed >> 44
            bits = ((packed >> 36) & 31) + 1
            channels = ((packed >> 41) & 7) + 1
            rates[f'{sr}/{bits}/{channels}'] += 1
            selected.setdefault(f'flac-{sr}-{bits}', path)
(out / 'library-formats.json').write_text(json.dumps(rates, indent=2), encoding='utf-8')
paths = list(selected.values())
print('Selected', len(paths), 'files; library rates:', rates, flush=True)
subprocess.run(['cargo','run','--release','--manifest-path',str(ROOT/'src-tauri/Cargo.toml'),'--example','audio_audit','--',str(out),*paths],check=True)
report = json.loads((out/'measurement.json').read_text())
comparisons = []
for track in report['tracks']:
    dest = out / (track['stem'] + '-ffmpeg.f32')
    subprocess.run(['ffmpeg','-v','error','-nostdin','-y','-i',track['path'],'-map','0:a:0','-vn','-c:a','pcm_f32le','-f','f32le',str(dest)],check=True)
    a = np.fromfile(out/(track['stem']+'-decoded.f32'),dtype='<f4').reshape(-1,track['source_channels'])
    b = np.fromfile(dest,dtype='<f4').reshape(-1,track['source_channels'])
    # Alignment is reported, not silently normalized; codecs can differ in gapless trimming.
    lag = 0
    n = min(len(a),len(b))
    if np.max(np.abs(a[:min(n,8192)] - b[:min(n,8192)])) > 0.01:
        anchor = 8192
        corr = np.correlate(a[anchor-2048:anchor+8192+2048,0], b[anchor:anchor+8192,0], mode='valid')
        lag = int(np.argmax(corr))-2048
    aa, bb = (a[lag:],b) if lag>=0 else (a,b[-lag:])
    n=min(len(aa),len(bb)); diff=aa[:n].astype('float64')-bb[:n]
    item={'path':track['path'],'reference':'FFmpeg pcm_f32le; original channels/rate; no DSP','alignment_frames':lag,'rodio_frames':len(a),'reference_frames':len(b),'max_abs_error':float(np.max(np.abs(diff))),'rms_error':float(np.sqrt(np.mean(diff**2))),'reference_peak':float(np.max(np.abs(b))),'reference_over_full_scale':int(np.sum(np.abs(b)>1)), 'volume_scaling':[]}
    unity = np.fromfile(out/(track['stem']+'-100-output.f32'),dtype='<f4')
    for percent in [80,50]:
        scaled=np.fromfile(out/(track['stem']+f'-{percent}-output.f32'),dtype='<f4')
        n=min(len(unity),len(scaled))
        item['volume_scaling'].append({'percent':percent,'max_abs_error_vs_unity_times_gain':float(np.max(np.abs(scaled[:n]-unity[:n]*np.float32(percent/100))))})
    comparisons.append(item)
    if args.stage=='after':
        assert item['max_abs_error'] < (0.00001 if track['path'].lower().endswith('.mp3') else 1e-10)
        assert all(v['max_abs_error_vs_unity_times_gain']<2e-7 for v in item['volume_scaling'])
        assert all(v['output']['non_finite']==0 for v in track['volumes'])
        assert all(v['output']['over_full_scale']==0 for v in track['volumes'] if v['volume']<0.99)
        if track['source_rate']==report['device']['stream_sample_rate'] and track['source_channels']==report['device']['stream_channels']:
            assert np.array_equal(unity,a.reshape(-1)), 'Same-rate unity path must preserve every PCM sample including onset'
        else:
            resampled=out/(track['stem']+'-ffmpeg-resampled.f32')
            subprocess.run(['ffmpeg','-v','error','-nostdin','-y','-i',track['path'],'-map','0:a:0','-vn','-af',f"aresample={report['device']['stream_sample_rate']}:resampler=soxr:precision=28",'-c:a','pcm_f32le','-f','f32le',str(resampled)],check=True)
            reference=np.fromfile(resampled,dtype='<f4');n=min(len(reference),len(unity))
            item['independent_resampling']={'reference':'FFmpeg libsoxr precision 28','reference_peak':float(np.max(np.abs(reference))),'reference_over_full_scale':int(np.sum(np.abs(reference)>1)),'rms_difference':float(np.sqrt(np.mean((reference[:n].astype('float64')-unity[:n])**2))),'note':'Different bandlimited filters; no expectation of bit identity'}
    print(json.dumps(item,ensure_ascii=False),flush=True)
(out/'reference-comparison.json').write_text(json.dumps(comparisons,ensure_ascii=False,indent=2),encoding='utf-8')
