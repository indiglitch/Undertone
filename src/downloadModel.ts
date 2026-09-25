import type { SoulseekResult } from './soulseekSearch';

export type DownloadState='queued'|'downloading'|'completed'|'failed'|'cancelled';
export type DownloadRequest={username:string;remote_path:string;size_bytes:number};
export type DownloadStatus={operation_id:string;transfer_id:string;state:DownloadState;downloaded_bytes:number;total_bytes:number;progress:number;speed_bytes_per_second:number;eta_seconds:number|null;source_username:string;remote_path:string;local_path:string|null};
export type DownloadFinalizeResult={operation_id:string;status:'imported'|'already_in_library'|'file_not_found'|'ambiguous'|'invalid_file'|'import_failed';track_id:number|null;local_path:string|null};
export type DownloadApi={start:(request:DownloadRequest)=>Promise<DownloadStatus>;status:(operationId:string)=>Promise<DownloadStatus>;cancel:(operationId:string)=>Promise<DownloadStatus>;finalize:(operationId:string)=>Promise<DownloadFinalizeResult>};
type Listener=()=>void;
type FinalizeListener=(result:DownloadFinalizeResult)=>void|Promise<void>;

const active=(state:DownloadState)=>state==='queued'||state==='downloading';
const resultKey=(result:SoulseekResult)=>`${result.search_id}\u0000${result.username}\u0000${result.remote_path}\u0000${result.size_bytes}`;
const publicError=(error:unknown,fallback:string)=>{
  const text=String(error).toLowerCase();
  if(text.includes('authentication')||text.includes('credential')||text.includes('api key'))return 'Ошибка авторизации';
  if(text.includes('unreachable')||text.includes('connection refused')||text.includes('request failed'))return 'slskd недоступен';
  return fallback;
};

export class DownloadSession {
  private api:DownloadApi;
  private operations:DownloadStatus[]=[];
  private pending=new Set<string>();
  private started=new Set<string>();
  private cancelling=new Set<string>();
  private finalizing=new Set<string>();
  private finalized=new Set<string>();
  private listeners=new Set<Listener>();
  private polling=false;
  private onFinalized:FinalizeListener;
  error='';
  constructor(api:DownloadApi,onFinalized:FinalizeListener=()=>{}){this.api=api;this.onFinalized=onFinalized;}
  snapshot(){return [...this.operations];}
  subscribe(listener:Listener){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
  private emit(){for(const listener of this.listeners)listener();}
  clearError(){this.error='';this.emit();}
  actionState(result:SoulseekResult):'pending'|'added'|null{
    const key=resultKey(result);
    return this.pending.has(key)?'pending':this.started.has(key)?'added':null;
  }
  async start(result:SoulseekResult){
    const key=resultKey(result);
    if(this.pending.has(key)||this.started.has(key))return;
    this.pending.add(key);this.error='';this.emit();
    try{
      const status=await this.api.start({username:result.username,remote_path:result.remote_path,size_bytes:result.size_bytes});
      this.started.add(key);this.operations=[status,...this.operations];
      await this.finalize(status);
    }catch(error){this.error=publicError(error,'Не удалось начать загрузку');}
    finally{this.pending.delete(key);this.emit();}
  }
  async poll(){
    if(this.polling)return;
    const targets=this.operations.filter(operation=>active(operation.state));
    if(!targets.length)return;
    this.polling=true;
    try{
      await Promise.all(targets.map(async operation=>{
        try{const status=await this.api.status(operation.operation_id);this.replace(status);await this.finalize(status);}
        catch(error){this.error=publicError(error,'Не удалось получить состояние загрузки');}
      }));
      this.emit();
    }finally{this.polling=false;}
  }
  async cancel(operationId:string){
    const operation=this.operations.find(item=>item.operation_id===operationId);
    if(!operation||!active(operation.state)||this.cancelling.has(operationId))return;
    this.cancelling.add(operationId);this.error='';this.emit();
    try{this.replace(await this.api.cancel(operationId));}
    catch(error){this.error=publicError(error,'Не удалось отменить загрузку');}
    finally{this.cancelling.delete(operationId);this.emit();}
  }
  isCancelling(operationId:string){return this.cancelling.has(operationId);}
  private async finalize(status:DownloadStatus){
    if(status.state!=='completed'||this.finalized.has(status.operation_id)||this.finalizing.has(status.operation_id))return;
    this.finalizing.add(status.operation_id);
    try{const result=await this.api.finalize(status.operation_id);await this.onFinalized(result);this.finalized.add(status.operation_id);}
    catch(error){this.error=publicError(error,'Не удалось импортировать загрузку');}
    finally{this.finalizing.delete(status.operation_id);}
  }
  private replace(status:DownloadStatus){this.operations=this.operations.map(item=>item.operation_id===status.operation_id?status:item);}
}

export const formatDownloadBytes=(bytes:number)=>{
  if(bytes<1024)return `${bytes} Б`;
  const units=['КБ','МБ','ГБ','ТБ'];let value=bytes/1024,index=0;
  while(value>=1024&&index<units.length-1){value/=1024;index++;}
  return `${value.toLocaleString('ru',{maximumFractionDigits:1})} ${units[index]}`;
};
export const formatProgress=(progress:number)=>`${Math.round(Math.max(0,Math.min(1,progress))*100)}%`;
export const formatEta=(seconds:number)=>seconds>=3600?`${Math.floor(seconds/3600)}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`:`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
