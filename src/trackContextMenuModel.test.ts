import assert from 'node:assert/strict';
import test from 'node:test';
import { collectionActionLabels, dismissesMenu, enqueueGroup, fitMenuToViewport, localFileActions, once, outsideMenu, placeContextMenu, placeSubmenu, playlistAddAction } from './trackContextMenuModel.ts';

test('edge positioning keeps the menu inside every viewport edge',()=>{
  assert.deepEqual(fitMenuToViewport({x:990,y:790},{width:240,height:300},{width:1000,height:800}),{x:752,y:492});
  assert.deepEqual(fitMenuToViewport({x:-30,y:-20},{width:240,height:300},{width:1000,height:800}),{x:8,y:8});
});

test('context menu flips above the lower edge and avoids the player safe area',()=>{
  assert.deepEqual(placeContextMenu({x:120,y:550},{width:240,height:150},{width:1000,height:800},700),{x:120,y:400});
  assert.deepEqual(placeContextMenu({x:120,y:550},{width:240,height:150},{width:1000,height:800}),{x:120,y:550});
});

test('context menu and submenu clamp to the viewport when opened near an edge',()=>{
  assert.deepEqual(placeContextMenu({x:990,y:790},{width:240,height:300},{width:1000,height:800}),{x:750,y:490});
  const right=placeSubmenu({left:520,top:790,right:750,bottom:818},{width:220,height:180},{width:800,height:800});
  assert.deepEqual(right,{x:300,y:612,side:'left'});
  const left=placeSubmenu({left:10,top:80,right:42,bottom:108},{width:220,height:180},{width:800,height:600});
  assert.deepEqual(left,{x:42,y:80,side:'right'});
});

test('local actions preserve the exact local path and cover availability',()=>{
  assert.deepEqual(localFileActions({kind:'local',path:'D:\\Music\\Artist\\song.flac',cover:'D:\\Cache\\cover.jpg'}),{copyPath:'D:\\Music\\Artist\\song.flac',showInExplorer:'D:\\Music\\Artist\\song.flac',copyCover:'D:\\Cache\\cover.jpg'});
  assert.equal(localFileActions({kind:'local',path:'D:\\Music\\song.flac',cover:null})?.copyCover,null);
});

test('remote results never receive local-file actions',()=>assert.equal(localFileActions({kind:'remote',remotePath:'peer\\album\\song.flac'}),null));
test('Escape and outside pointer dismiss; other keys and inside pointer do not',()=>{assert.equal(dismissesMenu('Escape'),true);assert.equal(dismissesMenu('Enter'),false);assert.equal(outsideMenu(false),true);assert.equal(outsideMenu(true),false);});
test('one menu action cannot run twice',async()=>{let calls=0;const action=once(async()=>{calls++;});await Promise.all([action(),action()]);assert.equal(calls,1);});
test('play next, queue, liked and copy values dispatch exactly once',async()=>{const calls:string[]=[];for(const value of ['play-next','add-queue','add-liked','title','artist','album','D:\\Music\\song.flac'])await once(async()=>{calls.push(value);})();assert.deepEqual(calls,['play-next','add-queue','add-liked','title','artist','album','D:\\Music\\song.flac']);});
test('Add to Playlist reuses add_tracks and preserves duplicate entries',()=>assert.deepEqual(playlistAddAction(42,[{id:7},{id:9},{id:7}]),{type:'add_tracks',id:42,track_ids:[7,9,7]}));
test('Album and Artist expose grouped local collection actions',()=>{assert.deepEqual(collectionActionLabels('album'),['Play','Play Next','Add to Queue','Add to Playlist']);assert.deepEqual(collectionActionLabels('artist'),['Play','Play Next','Add to Queue','Add to Playlist']);});
test('Playlist exposes playback, rename and delete actions',()=>assert.deepEqual(collectionActionLabels('playlist'),['Play','Play Next','Add to Queue','Rename','Delete']));
test('grouped Play Next preserves internal order after current item',()=>{const queue=['current','old'];const enqueue=(track:string,next:boolean)=>queue.splice(next?1:queue.length,0,track);enqueueGroup(['one','two','three'],true,enqueue);assert.deepEqual(queue,['current','one','two','three','old']);});
test('grouped Add to Queue preserves internal order',()=>{const queue=['current'];enqueueGroup(['one','two','three'],false,(track,next)=>queue.splice(next?1:queue.length,0,track));assert.deepEqual(queue,['current','one','two','three']);});
