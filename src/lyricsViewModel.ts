import type { LyricsDocument, SyncedLyricLine, Track } from './types';

export const activeLyricIndex=(lines:SyncedLyricLine[],positionSeconds:number)=>{
  const positionMs=Math.max(0,positionSeconds*1000);let active=-1;
  for(let index=0;index<lines.length&&lines[index].timestamp_ms<=positionMs;index++)active=index;
  return active;
};

export const lyricLineTone=(index:number,active:number)=>index===active?'active':Math.abs(index-active)===1?'nearby':index<active?'past':'future';
export const shouldAutoScroll=(now:number,manualUntil:number)=>now>=manualUntil;
export const manualFollowDelay=4000;
export const suppressAutoScrollUntil=(now:number,duration=manualFollowDelay)=>now+duration;
export const seekSyncedLine=(line:SyncedLyricLine,seek:(seconds:number)=>void)=>seek(line.timestamp_ms/1000);
export const lyricsButtonDisabled=(available:boolean,open:boolean)=>!open&&!available;
export const lyricsForTrack=(trackId:number|null,loadedTrackId:number|null,lyrics:LyricsDocument|null)=>trackId!==null&&trackId===loadedTrackId?lyrics:null;
export const lyricsDisplayKind=(lyrics:LyricsDocument|null)=>lyrics?.synced.length?'synced':lyrics?.plain?'plain':'empty';
export const showLyricsIndicator=(track:Pick<Track,'has_lyrics'>)=>track.has_lyrics;
export function lyricsSourceLabel(origin:LyricsDocument['origin']){return origin==='local_lrc'?'Локальный .lrc':origin==='manual'?'Добавлено вручную':origin==='embedded_synced'?'Встроенный · синхронизированный':origin==='embedded_plain'?'Встроенный':`Внешний · ${origin.external}`;}
export function lyricsSourceHelp(origin:LyricsDocument['origin']){return origin==='local_lrc'?'Загружено из .lrc рядом с треком':origin==='manual'?'Текст добавлен вручную':origin==='embedded_synced'||origin==='embedded_plain'?'Прочитано из метаданных аудиофайла':'Получено из внешнего источника текстов';}

export type LyricsFailure='provider_unavailable'|'network'|'malformed_response'|'storage'|'provider_error'|'rate_limited';
export const lyricsFailureMessage=(kind:LyricsFailure)=>({rate_limited:'Источник ограничил частоту запросов. Дождитесь повторной проверки.',provider_unavailable:'Внешний поиск текстов сейчас недоступен.',network:'Не удалось связаться с источником текстов. Проверьте подключение.',malformed_response:'Источник вернул некорректный текст. Попробуйте позже.',storage:'Не удалось прочитать или сохранить текст в локальной библиотеке.',provider_error:'Источник текстов временно недоступен. Попробуйте позже.'}[kind]);
export function lyricsFailureFromError(error:unknown):LyricsFailure{const value=String(error).toLowerCase();return /disabled|provider.*unavailable|unavailable.*provider/.test(value)?'provider_unavailable':/network|timeout|connect/.test(value)?'network':/json|malformed/.test(value)?'malformed_response':'storage';}
export function lyricsFailureFromResult(result:{error_kind?:string|null;rate_limited?:boolean}):LyricsFailure{return result.rate_limited?'rate_limited':result.error_kind==='network'?'network':result.error_kind==='malformed_response'?'malformed_response':result.error_kind==='provider_unavailable'?'provider_unavailable':'provider_error';}
