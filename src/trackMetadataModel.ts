import type { Track, TrackMetadataDetails } from './types.ts';
import { time } from './types.ts';

export type MetadataRow={label:string;value:string};
const known=(value:string|null|undefined)=>value?.trim()||'—';
export function formatFileSize(bytes:number|null|undefined):string{
  if(bytes==null||!Number.isFinite(bytes)||bytes<=0)return '—';
  if(bytes<1024)return `${bytes} Б`;
  const unit=Math.min(3,Math.floor(Math.log(bytes)/Math.log(1024)));
  return `${(bytes/1024**unit).toLocaleString('ru',{maximumFractionDigits:1})} ${['Б','КБ','МБ','ГБ'][unit]}`;
}
const sourceLabel=(value:string|null|undefined)=>({manual:'Добавлено вручную',local_lrc:'Локальный .lrc',embedded_plain:'Встроенный',embedded_synced:'Встроенный с синхронизацией',external:'Внешний источник'} as Record<string,string>)[value||'']||'—';
export function metadataRows(track:Track,details:TrackMetadataDetails|null):MetadataRow[]{
  return [
    {label:'Название',value:known(track.title)},
    {label:'Исполнитель',value:known(track.artist)},
    {label:'Альбом',value:known(track.album)},
    {label:'Исполнитель альбома',value:known(track.album_artist)},
    {label:'Жанр',value:known(track.genre)},
    {label:'Год / дата',value:track.year?String(track.year):'—'},
    {label:'Номер трека',value:track.track_number?String(track.track_number):'—'},
    {label:'Номер диска',value:'—'},
    {label:'Длительность',value:Number.isFinite(track.duration)&&track.duration>=0?time(track.duration):'—'},
    {label:'Кодек / формат',value:known(track.format)},
    {label:'Частота дискретизации',value:'—'},
    {label:'Битность',value:'—'},
    {label:'Каналы',value:'—'},
    {label:'Битрейт',value:'—'},
    {label:'Размер файла',value:formatFileSize(details?.size_bytes)},
    {label:'Локальный путь',value:known(track.path)},
    {label:'Добавлено',value:known(track.added_at)},
    {label:'Источник текста песни',value:track.has_lyrics?sourceLabel(details?.lyrics_source):'—'},
    {label:'Обложка',value:track.cover?'Есть':'—'},
  ];
}
