import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {goBack,initialNavigation,visit} from './navigationModel.ts';
import {makeVisualizerIdle,settleVisualizer,visualizerSpectrumFrame} from './visualizerModel.ts';

const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');
const compact=readFileSync(new URL('./MusicVisualizer.tsx',import.meta.url),'utf8');
const full=readFileSync(new URL('./FullVisualizer.tsx',import.meta.url),'utf8');
const hook=readFileSync(new URL('./useVisualizerBars.ts',import.meta.url),'utf8');
const meter=readFileSync(new URL('./visualizerMeter.ts',import.meta.url),'utf8');
const css=readFileSync(new URL('./FullVisualizer.css',import.meta.url),'utf8');
const canvas=readFileSync(new URL('./VisualizerCanvas.tsx',import.meta.url),'utf8');
const renderer=readFileSync(new URL('./visualizerRenderer.ts',import.meta.url),'utf8');

test('compact click opens visualizer and Back restores the exact previous page',()=>{
  const library=visit(initialNavigation,{kind:'library'});
  const opened=visit(library,{kind:'visualizer'});
  assert.equal(opened.current.page.kind,'visualizer');
  assert.deepEqual(goBack(opened).current,library.current);
  assert.match(compact,/onClick=\{onToggle\}/);
  assert.match(app,/function toggleVisualizer\(\)\{if\(visualizerOpen\)back\(\);else navigate\(\{kind:'visualizer'\}\);\}/);
  assert.match(app,/<FullVisualizer track=\{player\.current\} playing=\{player\.status\.playing\} onClose=\{back\}\/>/);
});

test('visualizer navigation never mutates playback state',()=>{
  const playback={trackId:41,playing:true,position:72};
  goBack(visit(initialNavigation,{kind:'visualizer'}));
  assert.deepEqual(playback,{trackId:41,playing:true,position:72});
  assert.doesNotMatch(full,/usePlayer|audio_command|playback_session/);
});

test('full view has explicit empty state and follows current track props',()=>{
  assert.match(full,/track\?\.title\|\|'Сейчас ничего не играет'/);
  assert.match(full,/'Выберите трек, чтобы запустить визуализатор\.'/);
  assert.match(full,/track\?`\$\{track\.artist\}/);
  assert.match(app,/track=\{player\.current\} playing=\{player\.status\.playing\}/);
});

test('playing advances bars and pause settles the same presentation model',()=>{
  const idle=makeVisualizerIdle(36),active=visualizerSpectrumFrame(idle,[.8,.7,.4,.3,.2,.5,.7,.9],0.64),paused=settleVisualizer(active);
  assert.equal(idle.length,36);
  assert.ok(active.some((value,index)=>value>idle[index]));
  assert.ok(paused.some((value,index)=>value<active[index]));
  assert.match(hook,/visualizerSpectrumFrame\(value,meter\.levels\.bins,meter\.levels\.energy\)/);
  assert.match(hook,/if\(active\)return;[\s\S]*setBars\(settleVisualizer\)/);
  assert.match(canvas,/destination=state\.playing&&state\.hasTrack\?target\.current:silence/);
  assert.match(canvas,/current\.bass\+=\(destination\.bass-current\.bass\)\*speed/);
});

test('compact and full share one meter polling source',()=>{
  assert.match(compact,/useVisualizerBars\(playing,hasTrack,VISUALIZER_BAR_COUNT\)/);
  assert.match(full,/<VisualizerCanvas mode=\{mode\} intensity=\{intensity\} playing=\{playing\} hasTrack=\{track!==null\}\/>/);
  assert.match(canvas,/subscribeVisualizerMeter/);
  assert.equal((meter.match(/invoke<VisualizerLevels>\('audio_meter'\)/g)||[]).length,1);
  assert.equal((meter.match(/setInterval\(poll,40\)/g)||[]).length,1);
  assert.doesNotMatch(compact,/audio_meter/);
  assert.doesNotMatch(full,/audio_meter/);
});

test('previous page stays mounted and full view remains responsive',()=>{
  assert.match(app,/<div className="visualizer-preserved-page" hidden=\{visualizerOpen\}>/);
  assert.match(app,/const contentPage:NavigationPage=visualizerOpen\?\(navigation\.back\.at\(-1\)\?\.page\?\?\{kind:'home'\}\):page/);
  assert.match(css,/\.full-visualizer\{[^}]*display:flex;[^}]*min-width:0;[^}]*min-height:0;[^}]*overflow:hidden/);
  assert.match(css,/@media\(max-width:760px\)/);
});

test('full view exposes title, close affordance and accessible visualization',()=>{
  assert.match(full,/Визуализатор<\/span>/);
  assert.match(full,/aria-label="Закрыть визуализатор"/);
  assert.match(canvas,/<canvas[^>]*role="img" aria-label="Музыкальный визуализатор"/);
  assert.match(compact,/cursor:pointer|onClick=\{onToggle\}/);
});

test('three visual modes and intensity controls switch locally',()=>{
  assert.match(renderer,/\['cosmos','kaleidoscope','psychedelic'\]/);
  assert.match(renderer,/\['low','normal','high'\]/);
  assert.match(full,/onClick=\{\(\)=>setMode\(value\)\}/);
  assert.match(full,/onClick=\{\(\)=>setIntensity\(value\)\}/);
  assert.match(full,/useState<VisualizerMode>\('cosmos'\)/);
  assert.match(full,/useState<VisualizerIntensity>\('normal'\)/);
  assert.doesNotMatch(full,/player\.|audio_command|playback_session/);
});

test('canvas loop is local, DPR-capped and does not drive React frames',()=>{
  assert.match(canvas,/requestAnimationFrame\(draw\)/);
  assert.match(canvas,/Math\.min\(window\.devicePixelRatio\|\|1,1\.5\)/);
  assert.match(canvas,/new ResizeObserver\(resize\)/);
  assert.doesNotMatch(canvas,/setState|useState/);
  assert.match(renderer,/if\(frame\.mode==='cosmos'\)cosmos[\s\S]*kaleidoscope[\s\S]*psychedelic/);
  assert.match(renderer,/levels\.bass/);
  assert.match(renderer,/levels\.mids/);
  assert.match(renderer,/levels\.highs/);
  assert.match(renderer,/binAt\(levels/);
});
