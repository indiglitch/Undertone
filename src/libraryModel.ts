import type { Track, Playlist } from './types';

export type Page={kind:'home'|'library'|'artists'|'albums'|'liked'|'playlists'|'history'|'queue'|'search'|'lyrics'|'lyricsView'}|{kind:'artist'|'album'|'playlist';id:number};
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
export function normalizeSearch(value:string):string {
 return value.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
function matchRank(fields:string[],query:string,tokens=query.split(' ')):number|null {
 if(!query)return null;
 let best=Infinity;
 fields.forEach((field,index)=>{const tier=field===query?0:field.startsWith(query)?1:tokens.every(token=>(field.startsWith(token)||field.includes(' '+token)))?2:field.includes(query)?3:Infinity;best=Math.min(best,tier+index/100);});
 if(best===Infinity&&tokens.every(token=>fields.some(field=>field.includes(token))))best=3.9;
 return best===Infinity?null:best;
}
const trackFields=(track:Track)=>[track.title,track.artist,track.album,track.album_artist,track.genre??''].map(normalizeSearch);
export function matchesQuery(track:Track,query:string):boolean {
  const tokens=query.normalize('NFKC').trim().toLocaleLowerCase('ru').split(/\s+/).filter(Boolean);
  if(!tokens.length)return false;
  const text=[track.title,track.artist,track.album,track.album_artist,track.genre].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase('ru');
  return tokens.every(token=>text.includes(token));
}
// External results have their own keys; they must never masquerade as imported track IDs.
export type SearchHit={source:string;key:string;title:string;artist:string;localTrackId?:number};
export type LocalSearchEntity={kind:'album'|'artist'|'playlist';id:number;title:string;subtitle:string;tracks:Track[];playlist?:Playlist};
export type LocalSearchResults={hits:SearchHit[];albums:LocalSearchEntity[];artists:LocalSearchEntity[];playlists:LocalSearchEntity[]};
export interface SearchSource {id:string;search(query:string,signal:AbortSignal):Promise<SearchHit[]>;searchNow(query:string):SearchHit[];searchAllNow(query:string):LocalSearchResults}
export function localSearchSource(tracks:Track[],playlists:Playlist[]=[]):SearchSource {
 const records=tracks.map(track=>({item:track,fields:trackFields(track)})),byId=new Map(tracks.map(t=>[t.id,t]));
 const albums=new Map<number,Track[]>(),artists=new Map<number,Track[]>();
 for(const t of tracks){for(const [groups,id] of [[albums,t.album_id],[artists,t.artist_id]] as const){const group=groups.get(id);if(group)group.push(t);else groups.set(id,[t]);}}
 const entityRecords=(items:LocalSearchEntity[])=>items.map(item=>({item,fields:[item.title,item.kind==='album'?item.tracks[0]?.album_artist??'':''].map(normalizeSearch)}));
 const albumRecords=entityRecords([...albums].map(([id,ts])=>({kind:'album',id,title:ts[0].album,subtitle:ts[0].album_artist,tracks:ts})));
 const artistRecords=entityRecords([...artists].map(([id,ts])=>({kind:'artist',id,title:ts[0].artist,subtitle:`${ts.length} треков`,tracks:ts})));
 const playlistRecords=entityRecords(playlists.map(playlist=>({kind:'playlist',id:playlist.id,title:playlist.name,subtitle:`${playlist.entries.length} треков`,tracks:playlist.entries.flatMap(entry=>byId.has(entry.track_id)?[byId.get(entry.track_id)!]:[]),playlist})));
 function ranked<T>(items:{item:T;fields:string[]}[],query:string):T[]{const tokens=query.split(' ');return items.flatMap((record,index)=>{const rank=matchRank(record.fields,query,tokens);return rank===null?[]:[{item:record.item,rank,index}];}).sort((a,b)=>a.rank-b.rank||a.index-b.index).map(record=>record.item);}
 const hits=(query:string)=>ranked(records,query).map(t=>({source:'local',key:String(t.id),title:t.title,artist:t.artist,localTrackId:t.id}));
 return {id:'local',async search(query,signal){return signal.aborted?[]:hits(normalizeSearch(query));},searchNow(query){return hits(normalizeSearch(query));},searchAllNow(query){const normalized=normalizeSearch(query);return {hits:hits(normalized),albums:ranked(albumRecords,normalized),artists:ranked(artistRecords,normalized),playlists:ranked(playlistRecords,normalized)};}};
}
export function localTracksForHits(tracks:Track[],hits:SearchHit[],byId:ReadonlyMap<number,Track>=new Map(tracks.map(track=>[track.id,track]))):Track[]{
  return hits.flatMap(hit=>hit.source==='local'&&hit.localTrackId!==undefined&&byId.has(hit.localTrackId)?[byId.get(hit.localTrackId)!]:[]);
}
export function moveItem<T>(items:T[],from:number,to:number):T[] {
  if(from<0||from>=items.length||to<0||to>=items.length)return items;
  const next=[...items];next.splice(to,0,next.splice(from,1)[0]);return next;
}
