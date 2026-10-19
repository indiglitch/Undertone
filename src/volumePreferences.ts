export const VOLUME_KEY='undertone.player.volume.v1';
export const DEFAULT_VOLUME=.65;
type StorageLike={getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void};
export type VolumePreference={volume:number;lastAudible:number;saved:boolean};
const clamp=(value:number)=>Math.min(1,Math.max(0,value));
export function preferenceStorage():StorageLike|null{try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}}
export function readVolumePreference(storage:StorageLike|null):VolumePreference{
  const fallback={volume:DEFAULT_VOLUME,lastAudible:DEFAULT_VOLUME,saved:false};
  try{const text=storage?.getItem(VOLUME_KEY);if(!text)return fallback;const value=JSON.parse(text);
    if(!value||typeof value.volume!=='number'||!Number.isFinite(value.volume))return fallback;
    const volume=clamp(value.volume),lastAudible=volume>0?volume:typeof value.lastAudible==='number'&&Number.isFinite(value.lastAudible)&&value.lastAudible>0?clamp(value.lastAudible):DEFAULT_VOLUME;
    return {volume,lastAudible,saved:true};
  }catch{return fallback;}
}
export function saveVolumePreference(storage:StorageLike|null,value:VolumePreference){
  try{if(!storage)return false;storage.setItem(VOLUME_KEY,JSON.stringify({volume:clamp(value.volume),lastAudible:clamp(value.lastAudible)}));return true;}catch{return false;}
}
