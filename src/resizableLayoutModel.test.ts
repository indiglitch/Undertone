import assert from 'node:assert/strict';
import test from 'node:test';
import { clampLayout, layoutDefaults, layoutLimits, layoutStorageKeys, loadLayout, resetPane, resizeLayout, shouldStartResize, type StorageLike } from './resizableLayoutModel.ts';

const viewport={width:1440,height:940};
const memory=(entries:Record<string,string>={}):StorageLike=>({getItem:key=>entries[key]??null,setItem:(key,value)=>{entries[key]=value;}});

test('sidebar and right panel resize in their expected directions',()=>{
  assert.equal(resizeLayout(layoutDefaults,'left',50,viewport).left,310);
  assert.equal(resizeLayout(layoutDefaults,'right',-50,viewport).right,385);
});

test('all panes clamp to configured minimum and maximum',()=>{
  const large=resizeLayout(layoutDefaults,'left',10_000,viewport);assert.equal(large.left,layoutLimits.left.max);
  const small=resizeLayout(layoutDefaults,'left',-10_000,viewport);assert.equal(small.left,layoutLimits.left.min);
  assert.equal(resizeLayout(layoutDefaults,'right',10_000,viewport).right,layoutLimits.right.min);
  assert.equal(resizeLayout(layoutDefaults,'player',-10_000,viewport).player,layoutLimits.player.max);
});

test('persisted values restore and invalid values clamp',()=>{
  const valid=memory({[layoutStorageKeys.left]:'280',[layoutStorageKeys.right]:'410',[layoutStorageKeys.player]:'130'});
  assert.deepEqual(loadLayout(valid,viewport),{left:280,right:410,player:130});
  const invalid=memory({[layoutStorageKeys.left]:'9999',[layoutStorageKeys.right]:'NaN',[layoutStorageKeys.player]:'-4'});
  const loaded=loadLayout(invalid,viewport);assert.equal(loaded.left,380);assert.equal(loaded.right,layoutDefaults.right);assert.equal(loaded.player,96);
});

test('double click reset returns only the selected pane to default',()=>{
  assert.deepEqual(resetPane({left:300,right:400,player:140},'right',viewport),{left:300,right:335,player:140});
});

test('window shrink clamps panes and preserves positive main content width',()=>{
  const small={width:1000,height:700};const value=clampLayout({left:360,right:648,player:180},small,true);
  const usable=small.width-value.left-value.right-layoutLimits.splitter*2;
  assert.ok(usable>=layoutLimits.mainMin);assert.ok(value.right<=small.width*.45);
});

test('click beside a splitter cannot begin resizing',()=>{
  assert.equal(shouldStartResize(0,false),false);assert.equal(shouldStartResize(0,true),true);assert.equal(shouldStartResize(2,true),false);
});

test('resizing the right lyrics panel preserves its content state object',()=>{
  const lyricsState={trackId:91,activeLine:12,text:'still mounted'};
  const screen={layout:layoutDefaults,lyrics:lyricsState};
  const resized={...screen,layout:resizeLayout(screen.layout,'right',-80,viewport)};
  assert.strictEqual(resized.lyrics,lyricsState);assert.equal(resized.layout.right,415);
});
