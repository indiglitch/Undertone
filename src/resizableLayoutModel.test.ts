import assert from 'node:assert/strict';
import test from 'node:test';
import {clampLayout,layoutDefaults,layoutLimits,layoutStorageKeys,loadLayout,persistLayout,resetPane,resizeLayout,shouldStartResize,type StorageLike} from './resizableLayoutModel.ts';
const viewport={width:1440,height:940};
const memory=(entries:Record<string,string>={}):StorageLike=>({getItem:key=>entries[key]??null,setItem:(key,value)=>{entries[key]=value;}});
test('sidebar resizing clamps and resets without any player height state',()=>{
 assert.equal(resizeLayout(layoutDefaults,'left',50,viewport).left,274);
 assert.equal(resizeLayout(layoutDefaults,'left',10000,viewport).left,layoutLimits.left.max);
 assert.equal(resizeLayout(layoutDefaults,'left',-10000,viewport).left,layoutLimits.left.min);
 assert.deepEqual(resetPane({left:300},'left',viewport),layoutDefaults);
});
test('legacy player/right values are ignored and never persisted',()=>{
 const entries={[layoutStorageKeys.left]:'280','undertone.layout.playerHeight':'220','undertone.layout.rightWidth':'420'};
 assert.deepEqual(loadLayout(memory(entries),viewport),{left:280});
 const writes:string[]=[];persistLayout({getItem:()=>null,setItem:key=>writes.push(key)},{left:281});assert.deepEqual(writes,[layoutStorageKeys.left]);
});
test('invalid preferences and denied storage keep a usable layout',()=>{
 assert.deepEqual(loadLayout(memory(),viewport),layoutDefaults);
 assert.equal(loadLayout(memory({[layoutStorageKeys.left]:'9999'}),viewport).left,380);
 assert.deepEqual(loadLayout(memory({[layoutStorageKeys.left]:'NaN'}),viewport),layoutDefaults);
 assert.deepEqual(loadLayout({getItem(){throw Error('denied');},setItem(){}},viewport),layoutDefaults);
});
test('minimum window leaves positive main width and only handle pointer starts resizing',()=>{
 const small={width:1000,height:640},value=clampLayout({left:380},small);assert(small.width-value.left-layoutLimits.splitter>=layoutLimits.mainMin);
 assert.equal(shouldStartResize(0,false),false);assert.equal(shouldStartResize(0,true),true);assert.equal(shouldStartResize(2,true),false);
});
