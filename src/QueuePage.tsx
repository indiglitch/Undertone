import {useRef,useState,type ReactNode} from 'react';
import {ListMusic,MoreHorizontal,Save,Trash2} from 'lucide-react';
import type {PlayerModel} from './player';
import type {Playlist} from './types';
import {time} from './types';
import type {NavigationPage} from './navigationModel';
import PageHeader from './PageHeader';
import {Button,Cover,IconButton,Tooltip} from './ui';
import {ContextMenu,MenuItem,MenuSection} from './ContextMenu';
import './QueuePage.css';

/** Composition of the existing player queue and canonical TrackList. */
export default function QueuePage({player,playlists,navigate,onSave,children}:{player:PlayerModel;playlists:Playlist[];navigate:(page:NavigationPage)=>void;onSave:(ids:number[])=>void;children:ReactNode}){
  const upcoming=player.queue.items.slice(player.queue.cursor+1),current=player.queue.items[player.queue.cursor]?.track??null;
  const [menu,setMenu]=useState<{x:number;y:number}|null>(null);
  const anchor=useRef<HTMLButtonElement>(null);
  const source=player.context.kind==='playlist'&&player.sourceIntact?playlists.find(p=>p.id===(player.context as {playlistId:number}).playlistId):undefined;
  const saveIds=[...(current?[current.id]:[]),...upcoming.map(entry=>entry.track.id)];
  function closeMenu(){setMenu(null);anchor.current?.focus({preventScroll:true});}
  return <>
    <PageHeader icon={<ListMusic size={32}/>} title="Очередь" subtitle={`${upcoming.length} далее`} actions={<Tooltip content="Действия с очередью"><IconButton ref={anchor} aria-label="Действия с очередью" onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();setMenu({x:rect.left,y:rect.bottom});requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.track-context-menu [role=menuitem]:not(:disabled)')?.focus());}}><MoreHorizontal/></IconButton></Tooltip>}/>
    {current&&<section className="queue-now" aria-labelledby="queue-current-heading">
      <h2 id="queue-current-heading">Сейчас играет</h2>
      <div className="queue-summary"><Cover track={current} size="small"/><div className="queue-summary-copy"><strong title={current.title}>{current.title}</strong><span title={current.artist}>{current.artist}</span>{source&&<button className="queue-source" onClick={()=>navigate({kind:'playlist',id:source.id})}>Из плейлиста {source.name}</button>}</div><div className="queue-state" role="status"><span>{player.status.playing?'Воспроизводится':player.status.ended?'Завершён':'На паузе'}</span><small>{time(player.status.position)} / {time(current.duration)}</small></div></div>
    </section>}
    {upcoming.length?<section className="queue-upcoming" aria-labelledby="queue-upcoming-heading"><div className="queue-section-heading"><h2 id="queue-upcoming-heading">Далее</h2><span>{upcoming.length} треков</span></div>{children}</section>:<section className="queue-empty"><ListMusic aria-hidden="true"/><h2>{current?'Дальше ничего нет':'Очередь пуста'}</h2><p>Добавьте трек, альбом или плейлист в очередь.</p><Button variant="ghost" onClick={()=>navigate({kind:'search'})}>Открыть поиск</Button></section>}
    {menu&&<ContextMenu point={menu} label="Действия с очередью" onClose={closeMenu}>{run=><MenuSection><MenuItem icon={<Save size={16}/>} disabled={player.busy||!saveIds.length||saveIds.length>10000} onClick={()=>void run(()=>onSave(saveIds))}>Сохранить очередь как плейлист</MenuItem><MenuItem icon={<Trash2 size={16}/>} disabled={player.busy||!upcoming.length} onClick={()=>void run(()=>player.clearUpcoming())}>Очистить далее</MenuItem></MenuSection>}</ContextMenu>}


  </>;
}
