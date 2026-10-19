import {useState} from 'react';
import {Disc3,ListMusic,Users} from 'lucide-react';
import type {Track} from './types';
import {Cover} from './ui';
export type EntityKind='album'|'artist'|'playlist';
function ArtworkTile({track,kind}:{track:Track|null;kind:EntityKind}){
 const [phase,setPhase]=useState(track?.cover?'loading':'empty');
 const Icon=kind==='playlist'?ListMusic:Disc3;
 return <div className="entity-artwork-tile" data-artwork-state={phase} onLoadCapture={()=>setPhase('ready')} onErrorCapture={()=>setPhase('error')}>
  {track?.cover&&phase!=='error'&&<Cover track={track}/>}
  {phase!=='ready'&&<span className="entity-artwork-fallback" aria-label={phase==='loading'?'Обложка загружается':phase==='error'?'Обложка недоступна':'Без обложки'}><Icon aria-hidden="true"/></span>}
 </div>;
}
export default function EntityArtwork({kind,title,tracks}:{kind:EntityKind;title:string;tracks:Track[]}){
 const covers=tracks.filter(t=>t.cover);const unique=[...new Map(covers.map(t=>[t.cover,t])).values()].slice(0,4);
 return <div className={`entity-artwork entity-artwork--${kind}`}>
  {kind==='artist'?<div className="entity-artist-identity" aria-label="Локальный исполнитель — фото отсутствует"><Users aria-hidden="true"/><span aria-hidden="true">{title.trim().split(/\s+/).slice(0,2).map(word=>Array.from(word)[0]).join('').toLocaleUpperCase('ru')}</span></div>:kind==='playlist'&&unique.length>1?<div className="entity-artwork-mosaic">{Array.from({length:4},(_,i)=><ArtworkTile key={unique[i]?.cover??i} track={unique[i]??null} kind={kind}/>)}</div>:<ArtworkTile key={unique[0]?.cover??'empty'} track={unique[0]??null} kind={kind}/>}
  {kind==='playlist'&&<span className="entity-kind-badge" aria-label="Плейлист"><ListMusic aria-hidden="true"/></span>}
 </div>;
}
