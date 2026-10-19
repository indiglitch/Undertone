import assert from 'node:assert/strict';
import test from 'node:test';
import {readSortPreference,saveSortPreference} from './sortPreferences.ts';

test('sort and direction survive reopening and stay independent for sections and collections',()=>{
  const data=new Map<string,string>();
  const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
  const choices={library:{sort:'added',descending:true},albums:{sort:'title',descending:false},playlist1:{sort:'duration',descending:true},playlist2:{sort:'default',descending:false}} as const;
  for(const [key,value] of Object.entries(choices))saveSortPreference(storage,key,value);
  // A fresh reader has no React state, as after a restart.
  for(const [key,value] of Object.entries(choices))assert.deepEqual(readSortPreference(storage,key,key==='albums'),value);
  assert.deepEqual(readSortPreference(storage,'liked'),{sort:'default',descending:false});
});

test('invalid, unavailable and incompatible saved preferences do not break sorting',()=>{
  for(const raw of [null,'broken','null','[]','{"sort":"unknown","descending":"true"}']){
    assert.deepEqual(readSortPreference({getItem:()=>raw,setItem(){}},'library'),{sort:'default',descending:false});
  }
  assert.deepEqual(readSortPreference({getItem:()=>'{"sort":"duration","descending":true}',setItem(){}},'albums',true),{sort:'default',descending:true});
  const blocked={getItem():string|null{throw Error('denied');},setItem(){throw Error('full');}};
  assert.deepEqual(readSortPreference(blocked,'library'),{sort:'default',descending:false});
  assert.doesNotThrow(()=>saveSortPreference(blocked,'library',{sort:'title',descending:true}));
  assert.deepEqual(readSortPreference(null,'library'),{sort:'default',descending:false});
});
