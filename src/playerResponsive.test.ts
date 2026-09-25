import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css=readFileSync(new URL('./playerResponsive.css',import.meta.url),'utf8');
const player=readFileSync(new URL('./player.tsx',import.meta.url),'utf8');
const layout=readFileSync(new URL('./playerControlLayout.css',import.meta.url),'utf8');

test('narrow player cannot shrink volume slider below its usable width',()=>{
  assert.match(css,/\.volume-control input\[type=range\]\{[^}]*width:110px;[^}]*min-width:110px;[^}]*max-width:110px;[^}]*flex:0 0 110px/);
  assert.match(css,/\.volume-control\{[^}]*flex:0 0 150px;[^}]*min-width:150px/);
  assert.match(css,/\.volume-group\{[^}]*flex:0 0 190px;[^}]*width:190px;[^}]*min-width:190px/);
});

test('normal width keeps the preferred slider width near the previous control size',()=>{
  assert.match(css,/width:110px/);
  assert.match(player,/<div className="volume-group" onWheel=[\s\S]*?<div className="volume-control"><button[\s\S]*?<input aria-label="Громкость"/);
});

test('responsive priority prevents overflow before compressing volume',()=>{
  assert.match(layout,/\.player \.player-control-strip \{[^}]*overflow-x: auto/);
  assert.match(layout,/\.player-control-volume \{ width: 190px/);
  assert.match(layout,/@media \(max-width: 1060px\)[^}]*\} \.player-control-visualizer \{ display: none/);
});
