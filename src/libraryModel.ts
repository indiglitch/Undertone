import type { Track } from './types';

export type Page={kind:'home'|'library'|'artists'|'albums'|'liked'|'playlists'|'history'|'queue'|'search'|'downloads'|'lyrics'|'lyricsView'}|{kind:'artist'|'album'|'playlist';id:number};
export type Sort='default'|'title'|'artist'|'album'|'duration'|'year'|'added';
export const sortLabels:Record<Sort,string>={default:'Порядок списка',title:'Название',artist:'Исполнитель',album:'Альбом',duration:'Длительность',year:'Год',added:'Дата добавления'};
const collator=new Intl.Collator('ru',{numeric:true,sensitivity:'base'});
export function sortTracks(tracks:Track[],sort:Sort,descending=false):Track[] {
  if(sort==='default')return descending?[...tracks].reverse():tracks;
  return [...tracks].sort((a,b)=>{
    const diff=sort==='duration'?a.duration-b.duration:sort==='year'?(a.year??0)-(b.year??0):collator.compare(sort==='added'?a.added_at:a[sort],sort==='added'?b.added_at:b[sort]);
    return (descending?-1:1)*(diff||a.id-b.id);
  });
}
export function matchesQuery(track:Track,query:string):boolean {
  const needle=query.normalize('NFKC').trim().toLocaleLowerCase('ru');
  if(!needle)return false;
  return [track.title,track.artist,track.album].some(value=>value.normalize('NFKC').toLocaleLowerCase('ru').includes(needle));
}
// External results have their own keys; they must never masquerade as imported track IDs.
export type SearchHit={source:string;key:string;title:string;artist:string;localTrackId?:number};
export interface SearchSource {id:string;search(query:string,signal:AbortSignal):Promise<SearchHit[]>;searchNow(query:string):SearchHit[]}
export function localSearchSource(tracks:Track[]):SearchSource {
  const run=(query:string,signal?:AbortSignal)=>signal?.aborted?[]:tracks.filter(t=>matchesQuery(t,query)).map(t=>({source:'local',key:String(t.id),title:t.title,artist:t.artist,localTrackId:t.id}));
  return {id:'local',async search(query,signal){return run(query,signal);},searchNow(query){return run(query);}};
}
export function localTracksForHits(tracks:Track[],hits:SearchHit[]):Track[]{
  const byId=new Map(tracks.map(track=>[track.id,track]));
  return hits.flatMap(hit=>hit.source==='local'&&hit.localTrackId!==undefined&&byId.has(hit.localTrackId)?[byId.get(hit.localTrackId)!]:[]);
}
export function moveItem<T>(items:T[],from:number,to:number):T[] {
  if(from<0||from>=items.length||to<0||to>=items.length)return items;
  const next=[...items];next.splice(to,0,next.splice(from,1)[0]);return next;
}
