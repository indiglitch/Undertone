// Runs the actual player hook with deterministic hook storage and an IPC spy.
// No audio device, browser, test framework, or changes to production code.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

let slots=[],cursor=0,calls=[],started=0;
let audio={id:null,playing:false,position:0,duration:180,volume:0.65,ended:false};
const react={
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
  useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
  useCallback(fn){return fn;},
  useEffect(){}, // Polling is not involved in enqueue or explicit Next.
};
const ipc={isTauri:()=>false,async invoke(command,{action}){
  assert.equal(command,'audio_command');calls.push({...action});
  if(action.type==='play')audio={...audio,id:action.id,playing:true,position:0,ended:false};
  else if(action.type==='seek')audio={...audio,position:action.seconds};
  else throw Error('Unexpected audio command '+action.type);
  return {...audio};
}};
function compile(path,require){
  const code=ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,require,Intl,AbortController,Math:Object.assign(Object.create(Math),{random:()=>0})});return exports;
}
const library=compile('../src/libraryModel.ts',()=>({}));
const preferences=compile('../src/volumePreferences.ts',()=>({}));
const feedback=compile('../src/feedback.ts',()=>({}));
const models=Object.fromEntries(['playbackModes','playbackSessionModel','deletedSongsModel'].map(name=>['./'+name,compile('../src/'+name+'.ts',()=>({}))]));
const {usePlayer}=compile('../src/player.tsx',name=>name==='react'?react:name==='@tauri-apps/api/core'?ipc:name==='./libraryModel'?library:name==='./feedback'?feedback:name==='./volumePreferences'?preferences:models[name]||{});
const render=()=>{cursor=0;return usePlayer(e=>{throw Error(String(e));},()=>started++);};
const ids=p=>Array.from(p.queue.items,e=>e.track.id);
const [a,b,c,d]=[11,12,13,14].map(id=>({id,title:String(id)}));
let p=render();await p.play(b,[a,b,c],1);p=render();
await p.command({type:'seek',seconds:37});p=render();
const previous=p.queue.items[0],current=p.queue.items[1],status=p.status,callCount=calls.length;
p.enqueue(d,true);p=render();
assert.deepEqual(ids(p),[11,12,14,13]);assert.equal(p.queue.cursor,1);
assert.equal(p.queue.items[0],previous);assert.equal(p.queue.items[1],current);
assert.equal(p.current,b);assert.equal(p.status,status);assert.equal(p.status.position,37);assert.equal(p.status.playing,true);
assert.equal(calls.length,callCount);assert.equal(started,1); // no load/pause/seek/history event on Play Next
p.enqueue(b,true);p=render();
assert.deepEqual(ids(p),[11,12,12,14,13]);assert.equal(new Set(p.queue.items.map(e=>e.key)).size,5);
for(const id of [12,14,13]){const before=calls.length;await p.next(1);p=render();assert.equal(p.current.id,id);assert.equal(calls.length,before+1);assert.equal(calls.at(-1).type,'play');}
const end=calls.length;await p.next(1);assert.equal(calls.length,end);
slots=[];p=render();const emptyCalls=calls.length;p.enqueue(d,true);p=render();
assert.deepEqual(ids(p),[14]);assert.equal(p.current,null);assert.equal(p.queue.cursor,-1);assert.equal(calls.length,emptyCalls);
console.log('PASS Play Next: inserts after cursor, preserves played prefix/tail/current status/position, zero audio IPC calls, unique duplicate entries, exact Next order, end boundary, empty queue');

// Phase 7: occurrence operations never reload or mutate the current prefix.
slots=[];p=render();await p.play(b,[a,b,a,c,d],1);p=render();
const prefixKeys=p.queue.items.slice(0,2).map(e=>e.key),removeKey=p.queue.items[2].key;
let count=calls.length;p.remove(removeKey);p=render();assert.deepEqual(ids(p),[11,12,13,14]);assert.equal(p.current,b);assert.equal(calls.length,count);
p.move(p.queue.items[3].key,2);p=render();assert.deepEqual(ids(p),[11,12,14,13]);assert.deepEqual(Array.from(p.queue.items.slice(0,2),e=>e.key),Array.from(prefixKeys));
p.move(p.queue.items[2].key,0);p.remove(p.queue.items[1].key);p=render();assert.deepEqual(ids(p),[11,12,14,13]);
p.enqueue(a);p=render();p.toggleShuffle();p=render();const target=p.queue.items[3],moving=p.queue.items[2];p.move(moving.key,3);p=render();
p.toggleShuffle();p=render();const movedAt=p.queue.items.findIndex(e=>e.key===moving.key),targetAt=p.queue.items.findIndex(e=>e.key===target.key);assert(movedAt>targetAt,'shuffle reorder must use occurrence anchors rather than a shuffled numeric index');
p.clearUpcoming();p=render();assert.deepEqual(ids(p),[11,12]);assert.equal(p.queue.cursor,1);assert.equal(p.current,b);assert.equal(calls.length,count);
console.log('PASS Phase 7: duplicate remove/reorder, protected current/prefix, shuffle occurrence anchors, clear upcoming without audio reload');

slots=[];p=render();await p.play(a,[a,b,a,c,d],0);p=render();count=calls.length;
const secondA=p.queue.items[2].key;await p.jump(2);p=render();assert.equal(p.queue.cursor,2);assert.equal(p.queue.items[p.queue.cursor].key,secondA);
count=calls.length;p.removeMany([p.queue.items[0].key,secondA,p.queue.items[3].key,p.queue.items[4].key]);p=render();assert.deepEqual(ids(p),[11,12,11]);assert.equal(p.queue.cursor,2);assert.equal(calls.length,count);
slots=[];p=render();await p.play(a,[a,...Array.from({length:5000},(_,i)=>i%2?b:a)],0);p=render();count=calls.length;const removal=p.queue.items.slice(1).map(e=>e.key);p.removeMany(removal);p=render();assert.equal(p.queue.items.length,1);assert.equal(p.current,a);assert.equal(calls.length,count);
const enqueueGroup=compile('../src/trackContextMenuModel.ts',()=>({})).enqueueGroup;enqueueGroup([b,b,c],true,p.enqueue);p=render();assert.deepEqual(ids(p),[11,12,12,13]);enqueueGroup([d,b],false,p.enqueue);p=render();assert.deepEqual(ids(p),[11,12,12,13,14,12]);assert.equal(new Set(p.queue.items.map(e=>e.key)).size,6);assert.equal(calls.length,count);
console.log('PASS Phase 7: exact duplicate jump, multi-remove protects played/current entries, 5000-entry removal, ordered duplicate group Play Next/Add');

// Phase 13: exact transient Undo and conservative invalidation, with zero audio commands.
slots=[];p=render();await p.play(b,[a,b,a,a,c,d],1);p=render();
const original=p.queue.items,originalStatus=p.status;count=calls.length;
p.removeMany([original[2].key,original[4].key]);p=render();
let undo=feedback.feedbackStore.snapshot().at(-1).action;assert(undo.available());assert.equal(undo.run(),true);p=render();
assert.deepEqual(Array.from(p.queue.items,e=>e.key),Array.from(original,e=>e.key));assert.equal(p.queue.cursor,1);assert.equal(p.status,originalStatus);assert.equal(p.current,b);assert.equal(calls.length,count);assert.equal(undo.available(),false);
p.toggleShuffle();p=render();const shuffled=p.queue.items;p.clearUpcoming();p=render();undo=feedback.feedbackStore.snapshot().at(-1).action;assert.equal(undo.run(),true);p=render();assert.deepEqual(Array.from(p.queue.items,e=>e.key),Array.from(shuffled,e=>e.key));p.toggleShuffle();p=render();assert.deepEqual(Array.from(p.queue.items,e=>e.key),Array.from(original,e=>e.key));
p.remove(original[2].key);p=render();undo=feedback.feedbackStore.snapshot().at(-1).action;p.enqueue(d);p=render();const changed=p.queue.items;assert.equal(undo.available(),false);assert.equal(undo.run(),false);assert.equal(p.queue.items,changed);
p.clearUpcoming();p=render();undo=feedback.feedbackStore.snapshot().at(-1).action;await p.play(a,[a,b,c],0);p=render();assert.equal(undo.run(),false);assert.equal(calls.length,count+1);
slots=[];p=render();p.enqueue(a);p=render();p.enqueue(a);p=render();const emptyCurrent=p.queue.items;p.clearUpcoming();p=render();undo=feedback.feedbackStore.snapshot().at(-1).action;assert.equal(undo.run(),true);p=render();assert.equal(p.queue.cursor,-1);assert.deepEqual(Array.from(p.queue.items,e=>e.key),Array.from(emptyCurrent,e=>e.key));
console.log('PASS Phase 13: duplicate/multi-remove and shuffled clear exact Undo, canonical restoration, no playback mutation, enqueue/new-play invalidation, no-current queue');
