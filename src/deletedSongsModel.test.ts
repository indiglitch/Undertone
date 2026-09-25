import assert from 'node:assert/strict';
import test from 'node:test';
import { createMoveConfirmation, deletedTrackQueue, planDeletedTrack } from './deletedSongsModel.ts';

test('TrackContextMenu move action is dispatched once',async()=>{
  let moves=0,closed=0;
  const confirmation=createMoveConfirmation(()=>closed++,async()=>{moves++;});
  await Promise.all([confirmation.confirm(),confirmation.confirm()]);
  assert.equal(moves,1);assert.equal(closed,1);
});

test('Cancel confirmation performs no move',()=>{
  let moves=0,closed=0;
  const confirmation=createMoveConfirmation(()=>closed++,()=>{moves++;});
  confirmation.cancel();
  assert.equal(moves,0);assert.equal(closed,1);
});

test('deleted track references are removed from the session queue',()=>{
  const queue=[{key:1,track:{id:7}},{key:2,track:{id:8}},{key:3,track:{id:7}}];
  assert.deepEqual(deletedTrackQueue(queue,7),[{key:2,track:{id:8}}]);
});

test('deleting current playing track closes it and selects the next surviving queue item',()=>{
  const queue=[{key:1,track:{id:7}},{key:2,track:{id:7}},{key:3,track:{id:8}}];
  const plan=planDeletedTrack(queue,0,7,7);
  assert.equal(plan.wasCurrent,true);
  assert.equal(plan.nextIndex,0);
  assert.deepEqual(plan.items,[{key:3,track:{id:8}}]);
});
