import type { Sort } from './libraryModel';

type StorageLike=Pick<Storage,'getItem'|'setItem'>;
export type SortPreference={sort:Sort;descending:boolean};
const sorts:readonly Sort[]=['default','title','artist','album','duration','year','added'];
const storageKey=(pageKey:string)=>`undertone.sort.v1.${pageKey}`;
export function sortStorage():StorageLike|null{
  try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}
}
export function readSortPreference(storage:StorageLike|null,pageKey:string,grid=false):SortPreference{
  try{
    const value=JSON.parse(storage?.getItem(storageKey(pageKey))??'null');
    return {sort:sorts.includes(value?.sort)&&(!grid||value.sort==='default'||value.sort==='title')?value.sort:'default',descending:value?.descending===true};
  }catch{return {sort:'default',descending:false};}
}
export function saveSortPreference(storage:StorageLike|null,pageKey:string,value:SortPreference){
  try{storage?.setItem(storageKey(pageKey),JSON.stringify(value));}catch{/* Sorting stays usable when storage is unavailable. */}
}
