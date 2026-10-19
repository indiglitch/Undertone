import { useSyncExternalStore } from 'react';

export const trackDisplayLabels = {cover:'Обложка',artist:'Исполнитель',album:'Альбом',format:'Формат',size:'Размер файла',duration:'Длительность',year:'Год',genre:'Жанр',number:'Номер трека'};
export type TrackDisplay = Record<keyof typeof trackDisplayLabels,boolean>;
const defaults: TrackDisplay = {cover:true,artist:true,album:true,format:true,size:true,duration:true,year:false,genre:false,number:false};
const key = 'undertone.trackDisplay.v1';
let cached = '', value = defaults;
function read() {
  let raw = '';try {raw = localStorage.getItem(key)||'';} catch {}
  if (raw !== cached) {
    cached = raw; value = {...defaults};
    try {const parsed = JSON.parse(raw);for(const field of Object.keys(defaults) as (keyof TrackDisplay)[])if(typeof parsed[field]==='boolean')value[field]=parsed[field];}catch{}
  }
  return value;
}
function subscribe(change:()=>void){window.addEventListener('track-display-change',change);window.addEventListener('storage',change);return()=>{window.removeEventListener('track-display-change',change);window.removeEventListener('storage',change);};}
export function useTrackDisplay(){return useSyncExternalStore(subscribe,read,()=>defaults);}
export function TrackDisplaySettings(){
  const display = useTrackDisplay();
  return <section className="settings-card"><h3>Данные в списке треков</h3><p>Выберите, что показывать на Главной, в медиатеке, поиске и плейлистах.</p><div className="track-display-options">{(Object.keys(trackDisplayLabels) as (keyof TrackDisplay)[]).map(field=><label key={field}><input type="checkbox" checked={display[field]} onChange={event=>{const next={...display,[field]:event.target.checked};try{localStorage.setItem(key,JSON.stringify(next));}catch{}window.dispatchEvent(new Event('track-display-change'));}}/>{trackDisplayLabels[field]}</label>)}</div></section>;
}
