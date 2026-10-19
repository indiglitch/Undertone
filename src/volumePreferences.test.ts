import assert from 'node:assert/strict';
import test from 'node:test';
import {DEFAULT_VOLUME,VOLUME_KEY,readVolumePreference,saveVolumePreference} from './volumePreferences.ts';
const memory=(text:string|null=null)=>({getItem:()=>text,setItem:(_key:string,value:string)=>{text=value;}});
test('volume preferences use a safe default for missing, corrupt and invalid values',()=>{
  for(const text of [null,'','broken','null','{"volume":"0.3"}','{"volume":null}','{"volume":1e999}'])assert.equal(readVolumePreference(memory(text)).volume,DEFAULT_VOLUME);
  assert.equal(readVolumePreference(null).saved,false);
  assert.equal(readVolumePreference({getItem(){throw Error('denied');},setItem(){}}).volume,DEFAULT_VOLUME);
});
test('volume clamps finite values and keeps the last audible level through muted restart',()=>{
  assert.equal(readVolumePreference(memory('{"volume":-4}')).volume,0);
  assert.equal(readVolumePreference(memory('{"volume":8}')).volume,1);
  const store=memory();assert(saveVolumePreference(store,{volume:.27,lastAudible:.27,saved:true}));assert.equal(readVolumePreference(store).volume,.27);
  saveVolumePreference(store,{volume:0,lastAudible:.27,saved:true});assert.deepEqual(readVolumePreference(store),{volume:0,lastAudible:.27,saved:true});
  assert.equal(readVolumePreference(memory('{"volume":0,"lastAudible":-1}')).lastAudible,DEFAULT_VOLUME);
  assert.equal(saveVolumePreference({getItem:()=>null,setItem(){throw Error('full');}},{volume:.3,lastAudible:.3,saved:true}),false);
  assert.equal(VOLUME_KEY,'undertone.player.volume.v1');
});
