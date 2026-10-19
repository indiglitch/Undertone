import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const css=readFileSync(new URL('./PlayerPresentation.css',import.meta.url),'utf8');
const player=readFileSync(new URL('./player.tsx',import.meta.url),'utf8');
const layout=readFileSync(new URL('./playerControlLayout.css',import.meta.url),'utf8');
test('volume retains a usable slider and remains visible on narrow desktop',()=>{
 assert.match(css,/\.volume-control input\[type=range\][^}]*width:100px;[^}]*min-width:100px/);
 assert.doesNotMatch(css,/\.volume-group[^}]*display:none/);
 assert.doesNotMatch(css,/\.player-output[^}]*display:none/);
});
test('controls use shared primitives while sliders keep forty pixel targets',()=>{
 assert.match(player,/<IconButton/);assert.match(player,/variant="primary" size="lg"/);
 assert.match(css,/\.player input\[type=range\][^}]*height:40px/);
 assert.match(layout,/min-width:40px; min-height:40px/);
});
test('custom strip keeps scroll and absolute geometry without a legacy override sheet',()=>{
 assert.match(layout,/overflow-x:auto/);assert.match(layout,/position:absolute/);
 const main=readFileSync(new URL('./main.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(main,/playerFreeLayout|playerPolish/);
 assert.doesNotMatch(css,/!important/);
});
