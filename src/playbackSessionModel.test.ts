import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseRandomLocalTrack, decideMainPlay, playbackSessionSnapshot, restorePlaybackSession, type PlaybackSession } from './playbackSessionModel.ts';

const track=(id:number,path=`F:\\Music\\${id}.flac`)=>({id,path,title:`Track ${id}`,duration:180});

test('paused current resumes and restored current uses its queue entry',()=>{
  assert.deepEqual(decideMainPlay({currentId:2,loadedId:2,queueLength:3,cursor:1,libraryLength:20}),{kind:'toggle_current'});
  assert.deepEqual(decideMainPlay({currentId:2,loadedId:null,queueLength:3,cursor:1,libraryLength:20}),{kind:'queue_index',index:1});
});

test('queue wins over random and missing cursor falls back to first entry',()=>{
  assert.deepEqual(decideMainPlay({currentId:null,loadedId:null,queueLength:3,cursor:-1,libraryLength:20}),{kind:'queue_index',index:0});
  assert.deepEqual(decideMainPlay({currentId:null,loadedId:null,queueLength:0,cursor:-1,libraryLength:20}),{kind:'random_track'});
  assert.deepEqual(decideMainPlay({currentId:null,loadedId:null,queueLength:0,cursor:-1,libraryLength:0}),{kind:'nothing'});
});

test('random fallback selects one playable local track from the whole library',()=>{
  const tracks=[track(1),track(2),track(3),track(-4,'soulseek://peer/song.flac')];
  assert.equal(chooseRandomLocalTrack(tracks,()=>0)?.id,1);
  assert.equal(chooseRandomLocalTrack(tracks,()=>0.999)?.id,3);
  assert.equal(chooseRandomLocalTrack([],()=>0),null);
});

test('queue restore preserves order, duplicates, cursor and independent entry identity',()=>{
  const session:PlaybackSession={entries:[{entry_id:41,track_id:1},{entry_id:42,track_id:2},{entry_id:43,track_id:1}],current_entry_id:42,current_track_id:2,cursor:1,position_seconds:64};
  const restored=restorePlaybackSession(session,[track(1),track(2)]);
  assert.deepEqual(restored.entries.map(entry=>[entry.key,entry.track.id]),[[41,1],[42,2],[43,1]]);
  assert.equal(restored.cursor,1);assert.equal(restored.current?.id,2);assert.equal(restored.position,64);
});

test('queue mutations serialize order and duplicate entries without becoming a playlist',()=>{
  const a=track(1),b=track(2),snapshot=playbackSessionSnapshot([{key:7,track:a},{key:8,track:b},{key:9,track:a}],2,a,33);
  assert.deepEqual(snapshot.entries,[{entry_id:7,track_id:1},{entry_id:8,track_id:2},{entry_id:9,track_id:1}]);
  assert.equal(snapshot.current_entry_id,9);assert.equal(snapshot.cursor,2);assert.equal(snapshot.position_seconds,33);
});

test('missing last track is discarded and Play falls back to surviving queue',()=>{
  const session:PlaybackSession={entries:[{entry_id:1,track_id:99},{entry_id:2,track_id:2}],current_entry_id:1,current_track_id:99,cursor:0,position_seconds:90};
  const restored=restorePlaybackSession(session,[track(2)]);
  assert.equal(restored.current,null);assert.equal(restored.cursor,-1);assert.equal(restored.position,0);
  assert.deepEqual(decideMainPlay({currentId:null,loadedId:null,queueLength:restored.entries.length,cursor:restored.cursor,libraryLength:1}),{kind:'queue_index',index:0});
});

test('restored current is shown stopped and does not imply autoplay',()=>{
  const session:PlaybackSession={entries:[{entry_id:1,track_id:1}],current_entry_id:1,current_track_id:1,cursor:0,position_seconds:12};
  const restored=restorePlaybackSession(session,[track(1)]);
  const initialAudio={id:null,playing:false,position:restored.position};
  assert.equal(restored.current?.id,1);assert.equal(initialAudio.playing,false);assert.equal(initialAudio.id,null);
});

test('missing current is cleared while remaining queue stays playable',()=>{
  const session:PlaybackSession={entries:[{entry_id:1,track_id:9},{entry_id:2,track_id:2}],current_entry_id:1,current_track_id:9,cursor:0,position_seconds:50};
  const restored=restorePlaybackSession(session,[track(2)]);
  assert.equal(restored.current,null);assert.equal(restored.cursor,-1);assert.deepEqual(restored.entries.map(entry=>entry.track.id),[2]);
  assert.deepEqual(decideMainPlay({currentId:null,loadedId:null,queueLength:restored.entries.length,cursor:restored.cursor,libraryLength:1}),{kind:'queue_index',index:0});
});

test('queue mutations and playback position serialize without deduplication',()=>{
  const entries=[{key:7,track:track(1)},{key:8,track:track(1)}];
  assert.deepEqual(playbackSessionSnapshot(entries,1,entries[1].track,37.25),{entries:[{entry_id:7,track_id:1},{entry_id:8,track_id:1}],current_entry_id:8,current_track_id:1,cursor:1,position_seconds:37.25});
});
