import {useMemo,useState} from 'react';
import {ArrowRight,Disc3,Heart,LibraryBig,Plus,FolderPlus,RefreshCw,Shuffle,ListMusic} from 'lucide-react';
import TrackList,{type TrackListContext} from './TrackList';
import {EntityCard,type EntityCardData} from './EntityGrid';
import type {CollectionMenuTarget} from './CollectionContextMenu';
import {Button,IconButton,SearchInput,Tooltip} from './ui';
import type {Track,Collections} from './types';
import type {PlayerModel} from './player';
import type {NavigationPage} from './navigationModel';
import './DesktopHome.css';

function HomeSectionHeader({title,action,onAction}:{title:string;action:string;onAction:()=>void}){
 return <header className="home-section-header"><h2>{title}</h2><Button variant="ghost" onClick={onAction}>{action}<ArrowRight aria-hidden="true"/></Button></header>;
}
export default function DesktopHome({tracks,albums,recent,collections,player,navigate,onAdd,onRescan,scanning,onCreate,onAlbumMenu,onSearch,onTrackMenu,onLike,busy}:{tracks:Track[];albums:Track[];recent:Track[];collections:Collections;player:PlayerModel;navigate:(page:NavigationPage)=>void;onAdd:()=>void;onRescan:()=>void;scanning:boolean;onCreate:()=>void;onAlbumMenu:(target:CollectionMenuTarget,point:{x:number;y:number})=>void;onSearch:(query:string)=>void;onTrackMenu:(track:Track,point:{x:number;y:number},context?:TrackListContext)=>void;onLike:(track:Track)=>void;busy:boolean}){
 const [homeQuery,setHomeQuery]=useState('');
 const randomPlay=()=>{if(!tracks.length)return;const index=Math.floor(Math.random()*tracks.length);if(!player.modes.shuffle)player.toggleShuffle();void player.play(tracks[index],tracks,index);};
 const preview=useMemo(()=>{const groups=new Map<number,Track[]>();for(const track of tracks){const group=groups.get(track.album_id);if(group)group.push(track);else groups.set(track.album_id,[track]);}return albums.slice(0,4).map(track=>({id:track.album_id,title:track.album,subtitle:track.album_artist,menuTarget:{kind:'album',id:track.album_id,title:track.album,tracks:groups.get(track.album_id)??[]} as CollectionMenuTarget}));},[tracks,albums]);
 const likes=useMemo(()=>new Set(collections.likes),[collections.likes]);
 return <div className="home-content desktop-home">
  <form className="home-search-entry" onSubmit={event=>{event.preventDefault();onSearch(homeQuery);}}><SearchInput aria-label="Поиск с Главной" placeholder="Найти треки, исполнителей, альбомы…" value={homeQuery} onChange={event=>setHomeQuery(event.target.value)} onClear={()=>setHomeQuery('')}><IconButton aria-label="Открыть поиск" type="submit"><ArrowRight aria-hidden="true"/></IconButton></SearchInput></form>
  <Button className="home-random-action" disabled={!tracks.length||player.busy} onClick={randomPlay}><Shuffle aria-hidden="true"/><span><strong>Слушать случайное</strong></span><ArrowRight aria-hidden="true"/></Button>
  <nav className="home-destinations" aria-label="Коллекции"><Button onClick={()=>navigate({kind:'playlists'})}><ListMusic aria-hidden="true"/><span><strong>Плейлисты</strong><small>Твои подборки · {collections.playlists.length}</small></span><ArrowRight aria-hidden="true"/></Button><Button onClick={()=>navigate({kind:'albums'})}><Disc3 aria-hidden="true"/><span><strong>Альбомы</strong><small>Исследовать коллекцию</small></span><ArrowRight aria-hidden="true"/></Button></nav>
  <section className="home-recent-preview" aria-label="Недавно слушали"><HomeSectionHeader title="Недавно слушали" action="Все" onAction={()=>navigate({kind:'history'})}/>{recent.length?<TrackList tracks={recent.slice(0,5)} columns={{index:false,album:false,format:false,size:false,duration:false,year:false,genre:false,number:false}} embedded source="home-recent" onToggleCurrent={()=>void player.toggle()} currentId={player.current?.id??null} playing={player.status.playing} onPlay={(track,index)=>void player.play(track,recent,index)} likes={likes} onLike={onLike} busy={busy||player.busy} onArtist={id=>navigate({kind:'artist',id})} onAlbum={id=>navigate({kind:'album',id})} onContextMenu={onTrackMenu} emptyText="История появится после первого прослушивания."/>:<p className="home-note">История появится после первого прослушивания.</p>}</section>
  <section className="home-collection-preview" aria-label="Твоя коллекция"><HomeSectionHeader title="Твоя коллекция" action="Все альбомы" onAction={()=>navigate({kind:'albums'})}/><div className="home-collection-tools"><p className="home-note">{tracks.length?`${tracks.length.toLocaleString('ru')} треков`:'Добавь папку с музыкой — здесь появятся твои альбомы.'}</p><div><Tooltip content="Пересканировать папки"><IconButton aria-label="Пересканировать папки" disabled={scanning} onClick={onRescan}><RefreshCw aria-hidden="true"/></IconButton></Tooltip><Button onClick={onAdd}><FolderPlus aria-hidden="true"/>Добавить музыку</Button></div></div>
   <div className="home-library-links"><Button variant="ghost" onClick={()=>navigate({kind:'library'})}><LibraryBig aria-hidden="true"/>Вся медиатека</Button><Button variant="ghost" onClick={()=>navigate({kind:'liked'})}><Heart aria-hidden="true"/>Любимые треки · {collections.likes.length}</Button><Button variant="ghost" onClick={onCreate}><Plus aria-hidden="true"/>Создать плейлист</Button><Button variant="ghost" onClick={()=>navigate({kind:'recentlyAdded'})}>Недавно добавлено<ArrowRight aria-hidden="true"/></Button></div>
   {preview.length?<div className="home-entity-preview">{preview.map((item:EntityCardData)=><EntityCard key={item.id} item={item} kind="album" busy={busy||player.busy} onOpen={id=>navigate({kind:'album',id})} onPlay={entity=>void player.play(entity.menuTarget.tracks[0],entity.menuTarget.tracks)} onContextMenu={onAlbumMenu} onFocus={()=>{}}/>)}</div>:tracks.length>0?<p className="home-note">В коллекции пока нет альбомов.</p>:null}
  </section>
 </div>;
}
