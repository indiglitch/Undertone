import assert from 'node:assert/strict';
import test from 'node:test';
import { DownloadSession, formatDownloadBytes, formatEta, formatProgress, type DownloadApi, type DownloadStatus } from './downloadModel.ts';
import type { SoulseekResult } from './soulseekSearch.ts';

const result:SoulseekResult={source:'soulseek',search_id:'search-1',username:'peer',remote_path:'..\\odd 🦄\\song.flac',size_bytes:4096,extension:'flac',is_locked:false};
const status=(state:DownloadStatus['state'],changes:Partial<DownloadStatus>={}):DownloadStatus=>({operation_id:'operation-1',transfer_id:'transfer-1',state,downloaded_bytes:0,total_bytes:4096,progress:0,speed_bytes_per_second:0,eta_seconds:null,source_username:'peer',remote_path:result.remote_path,local_path:null,...changes});
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};};
const api=(changes:Partial<DownloadApi>={}):DownloadApi=>({start:async()=>status('queued'),status:async()=>status('queued'),cancel:async()=>status('cancelled'),finalize:async operation_id=>({operation_id,status:'imported',track_id:1,local_path:null}),...changes});

test('one result action starts once even when double-clicked',async()=>{
  const start=deferred<DownloadStatus>();let calls=0;
  const session=new DownloadSession(api({start:async request=>{calls++;assert.deepEqual(request,{username:'peer',remote_path:result.remote_path,size_bytes:4096});return start.promise;}}));
  const first=session.start(result),second=session.start(result);
  assert.equal(calls,1);assert.equal(session.actionState(result),'pending');
  start.resolve(status('queued'));await Promise.all([first,second]);
  assert.equal(session.actionState(result),'added');assert.equal(session.snapshot().length,1);
  await session.start(result);assert.equal(calls,1);
});

test('queued progresses to downloading and completed, then stops polling',async()=>{
  const replies=[status('downloading',{downloaded_bytes:2048,progress:.5,speed_bytes_per_second:1024,eta_seconds:2}),status('completed',{downloaded_bytes:4096,progress:1})];let polls=0;
  const session=new DownloadSession(api({status:async()=>{polls++;return replies.shift()!;}}));
  await session.start(result);await session.poll();assert.equal(session.snapshot()[0].state,'downloading');
  await session.poll();assert.equal(session.snapshot()[0].state,'completed');
  await session.poll();assert.equal(polls,2);
});

test('cancel and failed terminal states are preserved',async()=>{
  const cancelled=new DownloadSession(api());await cancelled.start(result);await cancelled.cancel('operation-1');assert.equal(cancelled.snapshot()[0].state,'cancelled');
  const failed=new DownloadSession(api({status:async()=>status('failed')}));await failed.start(result);await failed.poll();assert.equal(failed.snapshot()[0].state,'failed');
});

test('overlapping poll ticks use one network request and navigation subscriptions do not add loops',async()=>{
  const pending=deferred<DownloadStatus>();let polls=0;
  const session=new DownloadSession(api({status:async()=>{polls++;return pending.promise;}}));await session.start(result);
  const unsubscribe=session.subscribe(()=>{});unsubscribe();session.subscribe(()=>{});
  const first=session.poll(),second=session.poll();assert.equal(polls,1);
  pending.resolve(status('completed',{progress:1,downloaded_bytes:4096}));await Promise.all([first,second]);assert.equal(polls,1);
});

test('formatting clamps progress and formats bytes and ETA',()=>{
  assert.equal(formatProgress(.456),'46%');assert.equal(formatProgress(2),'100%');
  assert.equal(formatDownloadBytes(1024),'1 КБ');assert.equal(formatDownloadBytes(1024**2*1.5),'1,5 МБ');
  assert.equal(formatEta(65),'1:05');assert.equal(formatEta(3661),'1:01:01');
});

test('remote result remains remote and null local path is not inferred',async()=>{
  let requestKeys:string[]=[];
  const session=new DownloadSession(api({start:async request=>{requestKeys=Object.keys(request).sort();return status('completed',{local_path:null});}}));
  await session.start(result);
  assert.deepEqual(requestKeys,['remote_path','size_bytes','username']);
  assert.equal('localTrackId' in result,false);assert.equal(session.snapshot()[0].local_path,null);
});

test('errors are mapped to safe user messages',async()=>{
  const authentication=new DownloadSession(api({start:async()=>{throw new Error('authentication failed: secret body');}}));await authentication.start(result);assert.equal(authentication.error,'Ошибка авторизации');
  const unreachable=new DownloadSession(api({start:async()=>{throw new Error('connection refused: raw body');}}));await unreachable.start(result);assert.equal(unreachable.error,'slskd недоступен');
  const failed=new DownloadSession(api({start:async()=>{throw new Error('HTTP 500 raw body');}}));await failed.start(result);assert.equal(failed.error,'Не удалось начать загрузку');
});

test('completed polling finalizes once across later polls and subscriptions',async()=>{
  let finalizes=0;const refreshed:number[]=[];const session=new DownloadSession(api({status:async()=>status('completed',{progress:1,downloaded_bytes:4096}),finalize:async operation_id=>{finalizes++;return {operation_id,status:'imported',track_id:7,local_path:null};}}),result=>{if(result.track_id!==null)refreshed.push(result.track_id);});
  await session.start(result);const unsubscribe=session.subscribe(()=>{});await session.poll();unsubscribe();session.subscribe(()=>{});await session.poll();
  assert.equal(finalizes,1);assert.deepEqual(refreshed,[7]);
});

test('already-in-library finalize also refreshes the current snapshot once',async()=>{
  const refreshed:number[]=[];let finalizes=0;
  const session=new DownloadSession(api({status:async()=>status('completed',{progress:1,downloaded_bytes:4096}),finalize:async operation_id=>{finalizes++;return {operation_id,status:'already_in_library',track_id:9,local_path:'F:\\Music\\song.flac'};}}),result=>{if(result.track_id!==null)refreshed.push(result.track_id);});
  await session.start(result);await session.poll();await session.poll();
  assert.equal(finalizes,1);assert.deepEqual(refreshed,[9]);
});
