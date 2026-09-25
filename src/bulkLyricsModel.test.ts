import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BulkLyricsPoller, bulkLyricsAvailability, bulkLyricsCounters, bulkLyricsCurrent, bulkLyricsLimits, bulkLyricsOutcomeTotal, bulkLyricsScopeLabel, bulkLyricsStartArgs, defaultBulkLyricsSelection, emptyBulkLyricsProgress, type BulkLyricsPhase, type BulkLyricsProgress, type PollScheduler } from './bulkLyricsModel.ts';

const progress=(phase:BulkLyricsPhase,values:Partial<BulkLyricsProgress>={}):BulkLyricsProgress=>({...emptyBulkLyricsProgress,phase,...values});

class FakeScheduler implements PollScheduler{
  callbacks=new Map<number,()=>void>();next=1;
  set(callback:()=>void){const id=this.next++;this.callbacks.set(id,callback);return id as ReturnType<typeof setTimeout>;}
  clear(handle:ReturnType<typeof setTimeout>){this.callbacks.delete(handle as unknown as number);}
  run(){const callbacks=[...this.callbacks.values()];this.callbacks.clear();callbacks.forEach(callback=>callback());}
}

const flush=()=>new Promise(resolve=>setTimeout(resolve,0));

test('Start sends one IPC call and begins polling only for running state',async()=>{
  const commands:string[]=[];let release:(value:BulkLyricsProgress)=>void=()=>{};
  const pending=new Promise<BulkLyricsProgress>(resolve=>{release=resolve;});
  const scheduler=new FakeScheduler();
  const poller=new BulkLyricsPoller(async command=>{commands.push(command);return pending;},()=>{},()=>{},scheduler);
  const first=poller.start(),second=poller.start();
  assert.deepEqual(commands,['start_bulk_lyrics_indexing']);assert.equal(scheduler.callbacks.size,0);
  release(progress('running'));await Promise.all([first,second]);
  assert.equal(scheduler.callbacks.size,1);poller.dispose();
});

test('scope and every supported limit are explicit start-only IPC arguments',async()=>{
  assert.deepEqual(bulkLyricsLimits,[10,25,50,100,250,'all']);
  assert.deepEqual(defaultBulkLyricsSelection,{scope:'all_library',limit:50});
  assert.equal(bulkLyricsScopeLabel('recent_downloads'),'Recent downloads');
  assert.deepEqual(bulkLyricsStartArgs({scope:'recent_downloads',limit:25}),{scope:'recent_downloads',limit:25});
  assert.deepEqual(bulkLyricsStartArgs({scope:'all_library',limit:'all'}),{scope:'all_library',limit:null});
  const calls:{command:string;args?:Record<string,unknown>}[]=[];
  const poller=new BulkLyricsPoller(async(command,args)=>{calls.push({command,args});return progress('completed',{total:3,processed:3});},()=>{},()=>{});
  await poller.start({scope:'recent_downloads',limit:50});
  assert.deepEqual(calls,[{command:'start_bulk_lyrics_indexing',args:{scope:'recent_downloads',limit:50}}]);poller.dispose();
});

test('idle status does not start polling',async()=>{
  const scheduler=new FakeScheduler();
  const poller=new BulkLyricsPoller(async()=>progress('idle'),()=>{},()=>{},scheduler);
  await poller.load();assert.equal(scheduler.callbacks.size,0);
});

test('all counters and current track are exposed for rendering',()=>{
  const value=progress('running',{processed:12,total:100,remaining:88,found:4,skipped:5,local_existing:3,not_found:2,ambiguous:1,temporary_errors:6,permanent_errors:7,current:{track_id:9,title:'Песня',artist:'Артист'}});
  assert.deepEqual(bulkLyricsCounters(value),{processed:12,total:100,remaining:88,found:4,skipped:5,localExisting:3,notFound:2,ambiguous:1,temporaryErrors:6,permanentErrors:7});
  assert.equal(bulkLyricsCurrent(value),'Песня — Артист');
});

test('terminal run outcomes are mutually exclusive and sum to processed',()=>{
  const value=progress('completed',{processed:7,total:7,found:1,local_existing:1,skipped:1,not_found:1,ambiguous:1,temporary_errors:1,permanent_errors:1});
  assert.equal(bulkLyricsOutcomeTotal(value),value.processed);
});

test('cached and local tracks are each counted exactly once',()=>{
  const cached=progress('completed',{processed:1,total:1,skipped:1});
  const local=progress('completed',{processed:1,total:1,local_existing:1});
  assert.equal(bulkLyricsOutcomeTotal(cached),1);
  assert.equal(bulkLyricsOutcomeTotal(local),1);
  assert.equal(bulkLyricsCounters(cached).skipped,1);
  assert.equal(bulkLyricsCounters(local).localExisting,1);
});

test('found, not found, ambiguous, and errors remain separate outcomes',()=>{
  const outcomes:Partial<BulkLyricsProgress>[]=[
    {found:1},
    {not_found:1},
    {ambiguous:1},
    {temporary_errors:1},
    {permanent_errors:1},
  ];
  for(const outcome of outcomes){
    const value=progress('completed',{processed:1,total:1,...outcome});
    assert.equal(bulkLyricsOutcomeTotal(value),1);
  }
});

test('running to completed keeps counter semantics unchanged',()=>{
  const running=progress('running',{processed:7,total:7,found:1,local_existing:1,skipped:1,not_found:1,ambiguous:1,temporary_errors:1,permanent_errors:1});
  const completed={...running,phase:'completed' as const};
  assert.deepEqual(bulkLyricsCounters(completed),bulkLyricsCounters(running));
  assert.equal(bulkLyricsOutcomeTotal(completed),bulkLyricsOutcomeTotal(running));
});

test('Cancel sends one IPC and keeps polling while cancelling',async()=>{
  const commands:string[]=[];const scheduler=new FakeScheduler();
  const poller=new BulkLyricsPoller(async command=>{commands.push(command);return progress(command==='bulk_lyrics_indexing_status'?'running':'cancelling');},()=>{},()=>{},scheduler);
  await poller.load();await poller.cancel();
  assert.deepEqual(commands,['bulk_lyrics_indexing_status','cancel_bulk_lyrics_indexing']);assert.equal(scheduler.callbacks.size,1);poller.dispose();
});

for(const terminal of ['completed','cancelled'] as const)test(`${terminal} status stops polling`,async()=>{
  let calls=0;const scheduler=new FakeScheduler();
  const poller=new BulkLyricsPoller(async()=>progress(calls++===0?'running':terminal),()=>{},()=>{},scheduler);
  await poller.load();assert.equal(scheduler.callbacks.size,1);scheduler.run();await flush();assert.equal(scheduler.callbacks.size,0);poller.dispose();
});

test('repeated load and replacement mount do not create duplicate polling loops',async()=>{
  const scheduler=new FakeScheduler();let calls=0;
  const invoke=async()=>{calls++;return progress('running');};
  const first=new BulkLyricsPoller(invoke,()=>{},()=>{},scheduler);
  await Promise.all([first.load(),first.load()]);assert.equal(calls,1);assert.equal(scheduler.callbacks.size,1);
  first.dispose();assert.equal(scheduler.callbacks.size,0);
  const replacement=new BulkLyricsPoller(invoke,()=>{},()=>{},scheduler);await replacement.load();assert.equal(scheduler.callbacks.size,1);replacement.dispose();
});

test('Start is available again after cancelled or completed',async()=>{
  const starts:string[]=[];const terminalStates=['cancelled','completed'] as const;let index=0;
  const poller=new BulkLyricsPoller(async command=>{if(command==='start_bulk_lyrics_indexing')starts.push(command);return progress(terminalStates[index++]);},()=>{},()=>{});
  await poller.start();await poller.start();assert.equal(starts.length,2);poller.dispose();
});

test('cancelled job can restart with a different selection',async()=>{
  const starts:Record<string,unknown>[]=[];let run=0;
  const poller=new BulkLyricsPoller(async(command,args)=>{if(command==='start_bulk_lyrics_indexing'){starts.push(args!);return progress(run++===0?'cancelled':'completed');}return progress('cancelled');},()=>{},()=>{});
  await poller.start({scope:'recent_downloads',limit:10});await poller.start({scope:'all_library',limit:'all'});
  assert.deepEqual(starts,[{scope:'recent_downloads',limit:10},{scope:'all_library',limit:null}]);poller.dispose();
});

test('lyrics page reads job status only while visible and starts indexing only on the explicit action',()=>{
  const source=readFileSync(new URL('./BulkLyricsIndexer.tsx',import.meta.url),'utf8');
  assert.match(source,/value=\{scope\} disabled=\{active\}/);assert.match(source,/value=\{limit\} disabled=\{active\}/);
  assert.match(source,/if\(!checked\|\|!available\|\|!visible\)return/);assert.match(source,/poller\.current\.start\(\{scope,limit\}\)/);
  assert.doesNotMatch(source,/invoke<BulkLyricsEligibility>/);
  assert.doesNotMatch(source,/bulk_lyrics_indexing_eligibility/);
  assert.doesNotMatch(source,/LyricsDocument|track_lyrics|lyric_lines|lyrics_rows/);
  assert.doesNotMatch(source,/onChange=\{[^}]*\.start\(/);
});

test('bulk lyrics worklist commands run on a blocking worker, outside Tauri synchronous UI commands',()=>{
  const source=readFileSync(new URL('../src-tauri/src/main.rs',import.meta.url),'utf8');
  for(const command of ['bulk_lyrics_indexing_eligibility','start_bulk_lyrics_indexing']){
    const start=source.indexOf(`async fn ${command}`),next=source.indexOf('\n#[tauri::command]',start+1),body=source.slice(start,next<0?undefined:next);
    assert.notEqual(start,-1,command);assert.match(body,/spawn_blocking/);
  }
});

test('feature unavailable has an explicit non-action state',()=>{
  assert.equal(bulkLyricsAvailability(false,false),'checking');assert.equal(bulkLyricsAvailability(true,false),'unavailable');assert.equal(bulkLyricsAvailability(true,true),'available');
});
