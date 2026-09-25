import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {clampVolume,volumeFromWheel,volumePercent} from './playerVolumeModel.ts';

const player=readFileSync(new URL('./player.tsx',import.meta.url),'utf8');
const controlLayout=readFileSync(new URL('./playerControlLayout.css',import.meta.url),'utf8');
const styles=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
const controls=player.slice(player.indexOf('const controls:Record<PlayerControlId,ReactNode>='),player.indexOf('return <footer className="player">'));
const output=player.slice(player.indexOf('<div className="player-output">'));

test('all utility actions stay in one movable strip above the timeline',()=>{
  for(const action of ['onToggleLike','onMoveToTrash(current)','player.toggleAutoplay','onQueue','onLyrics'])assert.match(controls,new RegExp(action.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for(const className of ['player-like','player-trash','player-autoplay','player-queue','player-lyrics'])assert.match(controls,new RegExp(className));
  assert.doesNotMatch(output,/player-like|player-trash|player-autoplay|player-queue|player-lyrics/);
  assert.ok(player.indexOf('<PlayerControlStrip order={controlOrder}')<player.indexOf('className="seek"'));
  assert.match(controls,/visualizer:<MusicVisualizer/);
  assert.match(controls,/volume:<div className="volume-group"/);
});

test('wheel volume uses a one-percent local clamped step',()=>{
  assert.equal(volumeFromWheel(0.5,-1),0.51);
  assert.equal(volumeFromWheel(0.5,1),0.49);
  assert.equal(volumeFromWheel(0.99,-1),1);
  assert.equal(volumeFromWheel(0.01,1),0);
  assert.equal(clampVolume(-3),0);
  assert.equal(clampVolume(4),1);
  assert.match(player,/className="volume-group" onWheel=\{event=>\{event\.preventDefault\(\);const value=volumeFromWheel\(displayVolume,event\.deltaY\)/);
  assert.doesNotMatch(player,/window\.addEventListener\(['"]wheel/);
});

test('volume readout is immediate and slider drag wiring remains intact',()=>{
  assert.equal(volumePercent(0), '0%');
  assert.equal(volumePercent(0.654), '65%');
  assert.equal(volumePercent(1), '100%');
  assert.match(player,/<output className="volume-readout"[^>]*>\{volumePercent\(displayVolume\)\}<\/output>/);
  assert.match(player,/onPointerDown=\{\(\)=>\{volumeDragging\.current=true;\}\}/);
  assert.match(player,/onPointerUp=\{\(\)=>\{volumeDragging\.current=false;\}\}/);
  assert.match(player,/onChange=\{e=>\{const value=\+e\.target\.value;[\s\S]*?setDisplayVolume\(value\);void player\.changeVolume\(value\);\}\}/);
});

test('visualizer yields before fixed volume and cannot overlap it',()=>{
  assert.match(controlLayout,/\.player-control-visualizer \{ width: 94px/);
  assert.match(controlLayout,/\.player-control-volume \{ width: 190px/);
  assert.match(controlLayout,/@media \(max-width: 1060px\)[^}]*\} \.player-control-visualizer \{ display: none/);
});

test('player spans resizable layouts without page-wide horizontal overflow',()=>{
  assert.match(styles,/\.app-shell\{[^}]*overflow:hidden/);
  assert.match(styles,/\.app-shell\.details-open\{grid-template-columns:var\(--sidebar-width\)[^}]*minmax\(320px,1fr\)[^}]*var\(--right-panel-width\)\}/);
  assert.match(styles,/\.player\{grid-column:1\/-1;grid-row:3;min-height:0\}/);
  assert.match(controlLayout,/\.player \.player-control-strip \{[^}]*min-width: 0;[^}]*max-width: 100%;[^}]*overflow-x: auto/);
});
