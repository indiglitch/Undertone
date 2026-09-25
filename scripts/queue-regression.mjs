// Runs the actual player hook with deterministic hook storage and an IPC spy.
// No audio device, browser, test framework, or changes to production code.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

let slots=[],cursor=0,calls=[],started=0;
let audio={id:null,playing:false,position:0,duration:180,volume:0.65,ended:false};
const react={
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
  useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
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
  const code=ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,require,Intl,AbortController});return exports;
}
const library=compile('../src/libraryModel.ts',()=>({}));
const {usePlayer}=compile('../src/player.tsx',name=>name==='react'?react:name==='@tauri-apps/api/core'?ipc:name==='./libraryModel'?library:{});
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
