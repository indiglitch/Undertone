export type SoulseekResult={source:'soulseek';search_id:string;username:string;remote_path:string;size_bytes:number;extension?:string|null;bitrate_kbps?:number|null;sample_rate_hz?:number|null;bit_depth?:number|null;duration_seconds?:number|null;has_free_upload_slot?:boolean|null;queue_length?:number|null;upload_speed_bytes_per_second?:number|null;is_locked:boolean};
export type SoulseekReply={search_id:string;completion:'complete'|'timed_out'|'result_limit';results:SoulseekResult[];cleanup_succeeded:boolean};
export type SoulseekState={kind:'ready'|'searching'|'not_configured'|'authentication_failed'|'unreachable'|'failed';results:SoulseekResult[]};
export type QualityFilter='all'|'lossless'|'flac'|'mp3_320';
export type ResultSort='default'|'size'|'bitrate'|'sample_rate'|'availability';
export type SoulseekFilters={quality:QualityFilter;minimumBitrate:number;minimumSampleRate:number;minimumBitDepth:number};

export async function performSoulseekSearch(query:string,isCurrent:()=>boolean,search:(query:string)=>Promise<SoulseekReply>):Promise<SoulseekState|null>{
  try{
    const reply=await search(query);
    if(!isCurrent())return null;
    return reply.completion==='timed_out'?{kind:'failed',results:[]}:{kind:'ready',results:reply.results};
  }catch(error){
    if(!isCurrent())return null;
    const message=String(error).toLowerCase();
    const kind=message.includes('not configured')||message.includes('не настро')||message.includes('api key not configured')?'not_configured':message.includes('authentication')||message.includes('credential')||message.includes('invalid api key')?'authentication_failed':message.includes('request failed')||message.includes('unreachable')||message.includes('connection refused')?'unreachable':'failed';
    return {kind,results:[]};
  }
}
export const formatBytes=(bytes:number)=>`${(bytes/(bytes>=1024**3?1024**3:1024**2)).toLocaleString('ru',{maximumFractionDigits:1})} ${bytes>=1024**3?'ГБ':'МБ'}`;
export const formatDuration=(seconds:number)=>seconds>=3600?`${Math.floor(seconds/3600)}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`:`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
export const remoteFilename=(path:string)=>path.split(/[\\/]/).at(-1)||path;
export const resultFacts=(result:SoulseekResult)=>[result.extension?.toUpperCase(),formatBytes(result.size_bytes),result.bitrate_kbps!=null?`${result.bitrate_kbps} кбит/с`:null,result.sample_rate_hz!=null?`${(result.sample_rate_hz/1000).toLocaleString('ru',{maximumFractionDigits:1})} кГц`:null,result.bit_depth!=null?`${result.bit_depth} бит`:null,result.duration_seconds!=null?formatDuration(result.duration_seconds):null,result.has_free_upload_slot==null?null:result.has_free_upload_slot?'Свободный слот':'Нет свободного слота',result.queue_length!=null?`В очереди: ${result.queue_length}`:null,result.upload_speed_bytes_per_second!=null?`${formatBytes(result.upload_speed_bytes_per_second)}/с`:null,result.is_locked?'Закрыт':'Открыт'].filter((value):value is string=>!!value);
const lossless=new Set(['flac','alac','wav','wave','aif','aiff','ape','wv']);
export function filterSoulseekResults(results:SoulseekResult[],filters:SoulseekFilters):SoulseekResult[]{
  return results.filter(result=>{
    const extension=result.extension?.toLowerCase();
    if(filters.quality==='lossless'&&(!extension||!lossless.has(extension)))return false;
    if(filters.quality==='flac'&&extension!=='flac')return false;
    if(filters.quality==='mp3_320'&&(extension!=='mp3'||result.bitrate_kbps==null||result.bitrate_kbps<320))return false;
    return (!filters.minimumBitrate||(result.bitrate_kbps!=null&&result.bitrate_kbps>=filters.minimumBitrate))&&(!filters.minimumSampleRate||(result.sample_rate_hz!=null&&result.sample_rate_hz>=filters.minimumSampleRate))&&(!filters.minimumBitDepth||(result.bit_depth!=null&&result.bit_depth>=filters.minimumBitDepth));
  });
}
const descending=(a:number|null|undefined,b:number|null|undefined)=>a==null?b==null?0:1:b==null?-1:b-a;
const ascending=(a:number|null|undefined,b:number|null|undefined)=>a==null?b==null?0:1:b==null?-1:a-b;
export function sortSoulseekResults(results:SoulseekResult[],sort:ResultSort):SoulseekResult[]{
  if(sort==='default')return results;
  return results.map((result,index)=>({result,index})).sort((a,b)=>{
    const order=sort==='size'?descending(a.result.size_bytes,b.result.size_bytes):sort==='bitrate'?descending(a.result.bitrate_kbps,b.result.bitrate_kbps):sort==='sample_rate'?descending(a.result.sample_rate_hz,b.result.sample_rate_hz):Number(b.result.has_free_upload_slot===true)-Number(a.result.has_free_upload_slot===true)||ascending(a.result.queue_length,b.result.queue_length)||descending(a.result.upload_speed_bytes_per_second,b.result.upload_speed_bytes_per_second);
    return order||a.index-b.index;
  }).map(item=>item.result);
}
