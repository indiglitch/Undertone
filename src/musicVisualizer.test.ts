import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {settleVisualizer,VISUALIZER_BAR_COUNT,VISUALIZER_IDLE,visualizerFrame,visualizerSpectrumFrame} from './visualizerModel.ts';

const component=readFileSync(new URL('./MusicVisualizer.tsx',import.meta.url),'utf8');
const player=readFileSync(new URL('./player.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('./MusicVisualizer.css',import.meta.url),'utf8');
const hook=readFileSync(new URL('./useVisualizerBars.ts',import.meta.url),'utf8');
const meter=readFileSync(new URL('./visualizerMeter.ts',import.meta.url),'utf8');

test('idle visualizer has a stable compact twelve-bar state',()=>{
  assert.equal(VISUALIZER_IDLE.length,VISUALIZER_BAR_COUNT);
  assert.ok(VISUALIZER_IDLE.every(value=>value>0&&value<0.4));
});

test('real peaks advance frames and pause settles them',()=>{
  const loud=visualizerFrame(VISUALIZER_IDLE,0.81);
  assert.ok(loud.at(-1)!>0.8);
  assert.deepEqual(loud.slice(0,-1),VISUALIZER_IDLE.slice(1));
  const settled=settleVisualizer(loud);
  assert.ok(settled.at(-1)!<loud.at(-1)!);
});

test('compact presentation responds to the shared spectral bins',()=>{
  const next=visualizerSpectrumFrame(VISUALIZER_IDLE,[.05,.1,.2,.4,.7,.9,.3,.1],.5);
  assert.equal(next.length,VISUALIZER_BAR_COUNT);
  assert.ok(next.some((value,index)=>value!==VISUALIZER_IDLE[index]));
  assert.match(hook,/meter\.levels\.bins,meter\.levels\.energy/);
});

test('visualizer owns its 25 FPS updates and player only passes primitive playback state',()=>{
  assert.match(meter,/setInterval\(poll,40\)/);
  assert.match(component,/memo\(function MusicVisualizer/);
  assert.match(hook,/useVisualizerMeter\(active\)/);
  assert.match(player,/<MusicVisualizer playing=\{status\.playing\} hasTrack=\{current!==null\} open=\{visualizerOpen\} onToggle=\{onVisualizer\}\/>/);
  assert.doesNotMatch(player,/audio_meter/);
});

test('track changes keep the component mounted and do not restart its effect',()=>{
  assert.match(hook,/const active=playing&&hasTrack/);
  assert.doesNotMatch(component,/trackId/);
});

test('icon is centered, unclipped, consistent, and accessible through its area',()=>{
  assert.match(component,/viewBox="0 0 20 20" width="18" height="18"/);
  assert.match(component,/<button className=\{`music-visualizer/);
  assert.match(component,/aria-label=\{open\?'Закрыть визуализатор':'Открыть визуализатор'\}/);
  assert.match(component,/Tooltip content=\{open\?'Закрыть визуализатор':'Открыть визуализатор'\}/);
  assert.match(css,/\.visualizer-icon\{[^}]*display:block;[^}]*overflow:visible/);
  assert.match(css,/stroke-width:1\.6;stroke-linecap:round/);
});

test('narrow layout shrinks visualizer while preserving the fixed volume control',()=>{
  assert.match(css,/flex:0 1 94px;min-width:0/);
  assert.match(css,/@media\(max-width:1150px\)\{\.visualizer-tooltip\{flex-basis:78px/);
  assert.match(css,/@container\(max-width:82px\)\{\.visualizer-bars i:nth-child\(n\+9\)\{display:none\}\}/);
});
