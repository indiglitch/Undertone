export const detailsLayoutClass=(open:boolean)=>open?'details-open':'';

export function stableRandomAlbumIds<T extends {album_id:number}>(albums:T[],previous:number[],reshuffle:boolean,count=6,random:()=>number=Math.random){
  const unique=[...new Map(albums.map(album=>[album.album_id,album])).values()];
  const available=new Set(unique.map(album=>album.album_id));
  const kept=reshuffle?[]:[...new Set(previous)].filter(id=>available.has(id)).slice(0,count);
  const rest=unique.filter(album=>!kept.includes(album.album_id));
  for(let index=rest.length-1;index>0;index--){const swap=Math.floor(random()*(index+1));[rest[index],rest[swap]]=[rest[swap],rest[index]];}
  return [...kept,...rest.slice(0,Math.max(0,count-kept.length)).map(album=>album.album_id)];
}

export const setLiked=(likes:number[],trackId:number,liked:boolean)=>liked?[...new Set([...likes,trackId])]:likes.filter(id=>id!==trackId);
export const likeAction=(trackId:number,liked:boolean)=>({type:'like' as const,track_id:trackId,liked});
