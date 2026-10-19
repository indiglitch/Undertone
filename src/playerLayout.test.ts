import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {clampVolume,volumeFromWheel,volumePercent} from './playerVolumeModel.ts';

const player=readFileSync(new URL('./player.tsx',import.meta.url),'utf8');
const controlLayout=readFileSync(new URL('./playerControlLayout.css',import.meta.url),'utf8');
const styles=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
const controls=player.slice(player.indexOf('const controls:Record<PlayerControlId,ReactNode>='),player.indexOf('return <footer className="player">'));
const output=player.slice(player.indexOf('<div className="player-output">'));

test('player keeps three zones with rare actions in the existing menu',()=>{
 for(const className of ['player-left','transport','player-output'])assert.ok(player.includes(`className="${className}"`));
 for(const action of ['onToggleLike','onMoveToTrash(current)','player.toggleAutoplay','onQueue','onLyrics','onMetadata(current)'])assert.ok(player.includes(action),action);
 assert.match(player,/zoneOrder\(\['shuffle','previous','play','next','repeat'\]\)/);
 assert.match(player,/zoneOrder\(\['queue','lyrics'\]\)/);
 assert.equal((player.match(/className="volume-group"/g)||[]).length,1);
 assert.match(player,/<ContextMenu point=\{menu\} label="Действия плеера"/);
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

test('utilities yield to the persistent volume control on narrow desktop',()=>{
 const css=readFileSync(new URL('./PlayerPresentation.css',import.meta.url),'utf8');
 assert.match(css,/\.player-output \{ flex-direction:column/);
 assert.match(css,/\.player \.volume-control input\[type=range\] \{[^}]*min-width:100px/);
 assert.doesNotMatch(css,/\.player-output[^}]*display:none/);
 assert.match(controlLayout,/\.player-control-scroll[^}]*overflow-x:auto/);
});

test('fixed-height player spans the shell without page-wide horizontal overflow',()=>{
  const shell=readFileSync(new URL('./desktopLayout.css',import.meta.url),'utf8');
  assert.match(shell,/\.app-shell \{[^}]*overflow:hidden/);
  assert.match(shell,/grid-template-rows:minmax\(0,1fr\)/);
  assert.match(shell,/\.player-area \{[^}]*grid-column:1\/-1; grid-row:2/);
  assert.match(readFileSync(new URL('./App.tsx',import.meta.url),'utf8'),/<PlayerArea><Player/);
  assert.match(controlLayout,/\.player-control-strip \{[^}]*min-width:0;[^}]*max-width:100%/);assert.match(controlLayout,/\.player-control-scroll[^}]*overflow-x:auto/);
});
