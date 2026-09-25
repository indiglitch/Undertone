import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {defaultPlayerControlOrder,finishPlayerControlDrag,loadPlayerControlOrder,normalizePlayerControlOrder,passedPlayerDragThreshold,playerControlStorageKey,resetPlayerControlOrder,savePlayerControlOrder,type PlayerControlId} from './playerControlLayout.ts';

const source=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
const storage=()=>{const data=new Map<string,string>();return {data,getItem:(key:string)=>data.get(key)||null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};};

test('valid horizontal drop moves one control, while click and invalid drop preserve order',()=>{
  const before=[...defaultPlayerControlOrder];
  assert.equal(passedPlayerDragThreshold(3,3),false);
  assert.equal(passedPlayerDragThreshold(6,0),true);
  const slot={target:'queue' as const,side:'after' as const};
  assert.deepEqual(finishPlayerControlDrag(before,'shuffle',slot,false,true),before);
  assert.deepEqual(finishPlayerControlDrag(before,'shuffle',slot,true,false),before);
  assert.deepEqual(finishPlayerControlDrag(before,'shuffle',null,true,true),before);
  const moved=finishPlayerControlDrag(before,'shuffle',slot,true,true);
  assert.equal(moved.indexOf('shuffle'),moved.indexOf('queue')+1);
  assert.equal(new Set(moved).size,before.length);
  assert.deepEqual(before,[...defaultPlayerControlOrder]);
});

test('saved layout survives remount and invalid IDs or duplicates sanitize safely',()=>{
  const local=storage();
  const custom=finishPlayerControlDrag([...defaultPlayerControlOrder],'volume',{target:'play',side:'before'},true,true);
  savePlayerControlOrder(local,custom);
  assert.deepEqual(loadPlayerControlOrder(local),custom);
  local.setItem(playerControlStorageKey,JSON.stringify(['queue','queue','obsolete','play',null]));
  const restored=loadPlayerControlOrder(local);
  assert.equal(restored.filter(id=>id==='queue').length,1);
  assert.equal(restored.includes('obsolete' as PlayerControlId),false);
  assert.deepEqual([...restored].sort(),[...defaultPlayerControlOrder].sort());
});

test('new controls join near their default position without changing saved relative order',()=>{
  const restored=normalizePlayerControlOrder(['queue','play'],['play','visualizer','queue','volume']);
  assert.deepEqual(restored,['queue','volume','play','visualizer']);
});

test('volume and visualizer remain single atomic controls and reset clears saved layout',()=>{
  assert.equal(defaultPlayerControlOrder.filter(id=>id==='volume').length,1);
  assert.equal(defaultPlayerControlOrder.filter(id=>id==='visualizer').length,1);
  const player=source('./player.tsx'),strip=source('./PlayerControlStrip.tsx'),app=source('./App.tsx'),settings=source('./SoulseekSettings.tsx');
  assert.match(player,/volume:<div className="volume-group"/);
  assert.match(player,/visualizer:<MusicVisualizer/);
  assert.match(strip,/order\.map\(id=><span key=\{id\}/);
  assert.match(strip,/setPointerCapture\(event.pointerId\)/);
  assert.match(strip,/onPointerCancel=/);
  assert.match(strip,/event.key==='Escape'/);
  assert.match(strip,/onClickCapture=\{event=>\{if\(suppressClick.current\)/);
  assert.match(app,/function resetPlayerLayout\(\)\{setPlayerControlOrder\(resetPlayerControlOrder/);
  assert.match(settings,/Reset player layout/);
  const local=storage();savePlayerControlOrder(local,[...defaultPlayerControlOrder].reverse());
  assert.deepEqual(resetPlayerControlOrder(local),[...defaultPlayerControlOrder]);
  assert.equal(local.data.has(playerControlStorageKey),false);
});

test('reorder and reset touch only layout state and preserve playback state',()=>{
  const playback={trackId:42,playing:true,position:18.5,queue:[42,7]};
  const snapshot=structuredClone(playback);
  const local=storage();
  const moved=finishPlayerControlDrag([...defaultPlayerControlOrder],'like',{target:'previous',side:'before'},true,true);
  savePlayerControlOrder(local,moved);
  resetPlayerControlOrder(local);
  assert.deepEqual(playback,snapshot);
  const app=source('./App.tsx');
  assert.match(app,/function updatePlayerControlOrder\(order:PlayerControlId\[\]\)\{setPlayerControlOrder\(order\);savePlayerControlOrder/);
  assert.doesNotMatch(app.slice(app.indexOf('function resetPlayerLayout'),app.indexOf('const sidebarDrag')),/player\.|audio_command|setNavigation/);
});
