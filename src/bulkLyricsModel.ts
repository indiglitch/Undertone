export type BulkLyricsPhase='idle'|'running'|'cancelling'|'completed'|'cancelled';
export type BulkLyricsScope='all_library'|'recent_downloads';
export type BulkLyricsLimit=10|25|50|100|250|'all';
export type BulkLyricsSelection={scope:BulkLyricsScope;limit:BulkLyricsLimit};
export type BulkLyricsEligibility={eligible:number;selected:number};
export const bulkLyricsLimits=[10,25,50,100,250,'all'] as const;
export const defaultBulkLyricsSelection:BulkLyricsSelection={scope:'all_library',limit:50};
export const bulkLyricsScopeLabel=(scope:BulkLyricsScope)=>scope==='all_library'?'Вся медиатека':'Недавние загрузки';
export const bulkLyricsStartArgs=(selection:BulkLyricsSelection)=>({scope:selection.scope,limit:selection.limit==='all'?null:selection.limit});
export type BulkLyricsProgress={
  phase:BulkLyricsPhase;
  total:number;
  processed:number;
  found:number;
  local_existing:number;
  skipped:number;
  not_found:number;
  ambiguous:number;
  temporary_errors:number;
  permanent_errors:number;
  remaining:number;
  current:{track_id:number;title:string;artist:string}|null;
  last_error:string|null;
};

export const emptyBulkLyricsProgress:BulkLyricsProgress={phase:'idle',total:0,processed:0,found:0,local_existing:0,skipped:0,not_found:0,ambiguous:0,temporary_errors:0,permanent_errors:0,remaining:0,current:null,last_error:null};

type Invoke=(command:string,args?:Record<string,unknown>)=>Promise<unknown>;
type TimerHandle=ReturnType<typeof setTimeout>;
export type PollScheduler={set:(callback:()=>void,delay:number)=>TimerHandle;clear:(handle:TimerHandle)=>void};
const defaultScheduler:PollScheduler={set:(callback,delay)=>setTimeout(callback,delay),clear:handle=>clearTimeout(handle)};

export const isBulkLyricsActive=(phase:BulkLyricsPhase)=>phase==='running'||phase==='cancelling';
export const bulkLyricsCurrent=(progress:BulkLyricsProgress)=>progress.current?`${progress.current.title} — ${progress.current.artist}`:'—';
export const bulkLyricsCounters=(progress:BulkLyricsProgress)=>({processed:progress.processed,total:progress.total,remaining:progress.remaining,found:progress.found,skipped:progress.skipped,localExisting:progress.local_existing,notFound:progress.not_found,ambiguous:progress.ambiguous,temporaryErrors:progress.temporary_errors,permanentErrors:progress.permanent_errors});
export const bulkLyricsOutcomeTotal=(progress:BulkLyricsProgress)=>progress.found+progress.local_existing+progress.skipped+progress.not_found+progress.ambiguous+progress.temporary_errors+progress.permanent_errors;
export const bulkLyricsAvailability=(checked:boolean,available:boolean)=>!checked?'checking':available?'available':'unavailable';

export class BulkLyricsPoller {
  private timer:TimerHandle|null=null;
  private polling=false;
  private actionPending=false;
  private disposed=false;
  private phase:BulkLyricsPhase='idle';
  private generation=0;
  private readonly invoke:Invoke;
  private readonly update:(progress:BulkLyricsProgress)=>void;
  private readonly fail:()=>void;
  private readonly scheduler:PollScheduler;
  private readonly interval:number;

  constructor(
    invoke:Invoke,
    update:(progress:BulkLyricsProgress)=>void,
    fail:()=>void,
    scheduler:PollScheduler=defaultScheduler,
    interval=1500,
  ){this.invoke=invoke;this.update=update;this.fail=fail;this.scheduler=scheduler;this.interval=interval;}

  async load(){await this.requestStatus(this.generation);}

  async start(selection:BulkLyricsSelection=defaultBulkLyricsSelection){
    if(this.actionPending||isBulkLyricsActive(this.phase))return;
    this.actionPending=true;
    this.generation++;
    try{this.accept(await this.invoke('start_bulk_lyrics_indexing',bulkLyricsStartArgs(selection)) as BulkLyricsProgress);}
    catch{this.fail();}
    finally{this.actionPending=false;}
  }

  async cancel(){
    if(this.actionPending||!isBulkLyricsActive(this.phase))return;
    this.actionPending=true;
    this.generation++;
    try{this.accept(await this.invoke('cancel_bulk_lyrics_indexing') as BulkLyricsProgress);}
    catch{this.fail();}
    finally{this.actionPending=false;}
  }

  dispose(){this.disposed=true;this.stopPolling();}

  private accept(progress:BulkLyricsProgress){
    if(this.disposed)return;
    this.phase=progress.phase;
    this.update(progress);
    if(isBulkLyricsActive(progress.phase))this.schedulePolling();else this.stopPolling();
  }

  private schedulePolling(){
    if(this.disposed||this.timer!==null||this.polling||!isBulkLyricsActive(this.phase))return;
    this.timer=this.scheduler.set(()=>{this.timer=null;void this.requestStatus(this.generation);},this.interval);
  }

  private stopPolling(){if(this.timer!==null){this.scheduler.clear(this.timer);this.timer=null;}}

  private async requestStatus(generation:number){
    if(this.disposed||this.polling)return;
    this.polling=true;
    try{const progress=await this.invoke('bulk_lyrics_indexing_status') as BulkLyricsProgress;if(generation===this.generation)this.accept(progress);}
    catch{if(!this.disposed)this.fail();}
    finally{this.polling=false;if(isBulkLyricsActive(this.phase))this.schedulePolling();}
  }
}
