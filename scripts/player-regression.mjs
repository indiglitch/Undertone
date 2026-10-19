import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(path,require,extra={}) {
  const code=ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,require,Intl,AbortController,console,...extra});return exports;
}
const library=compile('../src/libraryModel.ts',()=>({}));
const track={id:1,path:'F:\\Music\\song.mp3',title:'Ночь',artist:'Ёлка',album:'Город',album_artist:'Сборник',duration:200};
assert.equal(library.matchesQuery(track,'Ночь'),true);
assert.equal(library.matchesQuery(track,'Ёлка Ночь'),true);
assert.equal(library.matchesQuery(track,'Ночь Город'),true);
console.log('PASS search across title, artist and album');

const slots=[],effects=[];let cursor=0,initial=true,poll;
const react={useState(init){const i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useRef(init){const i=cursor++;if(!(i in slots))slots[i]={current:init};return slots[i];},useCallback(fn){return fn;},useEffect(fn){if(initial)effects.push(fn);}};
let audio={id:null,playing:false,position:0,duration:0,volume:0.65,ended:false};const calls=[];const errors=[];let unavailable=null;
const ipc={isTauri:()=>true,async invoke(name,args){
  if(name==='update_media_session')return true;
  if(name==='playback_session')return {entries:[{entry_id:1,track_id:1}],current_entry_id:1,current_track_id:1,cursor:0,position_seconds:75};
  if(name==='save_playback_session')return args.session;
  if(name==='audio_command'){calls.push(args.action);if(args.action.type==='play'&&args.action.id===unavailable)throw Error('unavailable track');if(args.action.type==='play')audio={...audio,id:args.action.id,playing:true,duration:200,position:0,ended:false};if(args.action.type==='volume')audio={...audio,volume:args.action.value};if(args.action.type==='seek')audio={...audio,position:args.action.seconds};return {...audio};}
  throw Error(name);
}};
const sessionModel=compile('../src/playbackSessionModel.ts',()=>({}));
const modes=compile('../src/playbackModes.ts',()=>({}));
const preferences=compile('../src/volumePreferences.ts',()=>({}));
const volume=compile('../src/playerVolumeModel.ts',()=>({}));
const deleted=compile('../src/deletedSongsModel.ts',()=>({}));
const player=compile('../src/player.tsx',name=>name==='react'?react:name==='@tauri-apps/api/core'?ipc:name==='./volumePreferences'?preferences:name==='@tauri-apps/api/event'?{listen:async()=>()=>{}}:name==='./playerVolumeModel'?volume:name==='./libraryModel'?library:name==='./playbackSessionModel'?sessionModel:name==='./playbackModes'?modes:name==='./deletedSongsModel'?deleted:{},{window:{addEventListener(){},removeEventListener(){},setInterval(fn){poll=fn;return 1;},clearTimeout(){},setTimeout(){return 1;}},clearInterval(){}});
const render=()=>{cursor=0;const result=player.usePlayer(error=>{errors.push(error);},undefined,[track],true);initial=false;return result;};
render();for(const effect of effects)effect();await Promise.resolve();await Promise.resolve();
assert.equal(render().status.position,75);
await poll();assert.equal(render().status.position,75);
await render().command({type:'seek',seconds:90});await poll();assert.equal(render().status.position,90);
await render().primaryPlay();assert.equal(calls.some(action=>action.type==='seek'&&action.seconds===90),true);
console.log('PASS restored position survives idle polling and seeks on Play');

const b={...track,id:2},c={...track,id:3};await render().play(track,[track,b,c],0);unavailable=2;await render().next(1);assert.equal(render().current.id,3);assert.equal(errors.length,1);console.log('PASS queue skips an unavailable next track and continues to the following one');

await render().play(track,[track,b,c],0);render();audio={...audio,ended:true,playing:false};await poll();assert.equal(render().current.id,3);assert.equal(render().status.ended,false);console.log('PASS natural track ending skips an unavailable next file and starts the following one');

await render().changeVolume(.37);assert.equal(render().status.volume,.37);console.log("PASS volume acknowledgement updates shared status before the next poll");

// Shared seek drafts commit once, and cancelled gestures never reach audio.
const uiSlots=[];let uiCursor=0;
const uiReact={useState(init){const i=uiCursor++;if(!(i in uiSlots))uiSlots[i]=init;return [uiSlots[i],value=>{uiSlots[i]=value;}];},useRef(init){const i=uiCursor++;if(!(i in uiSlots))uiSlots[i]={current:init};return uiSlots[i];},useEffect(){}};
const seekModule=compile('../src/usePlayerSeek.ts',name=>name==='react'?uiReact:{});
const commits=[];const seekUI=()=>{uiCursor=0;return seekModule.usePlayerSeek({trackId:1,position:30,duration:180,onCommit:value=>commits.push(value)});};
let seek=seekUI();seek.handlers.onChange({target:{value:'75'}});assert.equal(seekUI().value,75);assert.deepEqual(commits,[]);seek.handlers.onPointerUp({currentTarget:{value:'75'}});seek.handlers.onPointerUp({currentTarget:{value:'75'}});assert.deepEqual(commits,[75]);
seek=seekUI();seek.handlers.onChange({target:{value:'120'}});seek.handlers.onPointerCancel();seek.handlers.onPointerUp({currentTarget:{value:'120'}});assert.deepEqual(commits,[75]);
seek.handlers.onChange({target:{value:'60'}});seek.handlers.onBlur();seek.handlers.onKeyUp({key:'ArrowRight',currentTarget:{value:'60'}});assert.deepEqual(commits,[75]);
seek.handlers.onChange({target:{value:'90'}});seek.handlers.onKeyUp({key:'ArrowRight',currentTarget:{value:'90'}});assert.deepEqual(commits,[75,90]);console.log('PASS shared seek: preview without IPC, one commit, pointer cancellation, blur cancellation, keyboard commit');
