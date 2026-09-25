import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Clock3, Play, AudioLines, Heart, MoreHorizontal, MicVocal } from 'lucide-react';
import { Track, time } from './types';
import { Cover } from './ui';
import { openContextMenu } from './trackContextMenuModel';
import { showLyricsIndicator } from './lyricsViewModel';
import { Tooltip } from './Tooltip';

export default function TrackList({tracks,currentId,playing,onPlay,likes=new Set(),onLike,onActions,onContextMenu,onArtist,onAlbum,busy=false,rowNotes,emptyText='Треков пока нет. Добавьте папку или измените поиск.'}:{tracks:Track[];currentId:number|null;playing:boolean;onPlay:(track:Track,index:number)=>void;likes?:Set<number>;onLike?:(track:Track)=>void;onActions?:(track:Track,index:number)=>void;onContextMenu?:(track:Track,point:{x:number;y:number})=>void;onArtist?:(id:number)=>void;onAlbum?:(id:number)=>void;busy?:boolean;rowNotes?:string[];emptyText?:string}) {
  const ref=useRef<HTMLDivElement>(null);
  const rows=useVirtualizer({count:tracks.length,getScrollElement:()=>ref.current,estimateSize:()=>66,overscan:8});
  return <div className="track-table" role="table" aria-label="Музыкальная библиотека" aria-rowcount={tracks.length+1}>
    <div className="track-head track-grid" role="row"><span role="columnheader">#</span><span role="columnheader">Название</span><span role="columnheader">Альбом</span><span role="columnheader">Формат</span><span role="columnheader" aria-label="Действия"/><span role="columnheader" aria-label="Длительность"><Clock3 size={16}/></span></div>
    <div className="track-scroll" ref={ref} role="rowgroup">
      <div style={{height:rows.getTotalSize(),position:'relative'}}>
        {rows.getVirtualItems().map(row=>{
          const t=tracks[row.index], active=t.id===currentId;
          return <div key={`${t.id}-${row.index}`} role="row" aria-rowindex={row.index+2} data-track-id={busy?undefined:t.id} className={`track-row track-grid ${active?'active':''}`} onContextMenu={event=>openContextMenu(event,point=>onContextMenu?.(t,point))} style={{position:'absolute',top:0,left:0,width:'100%',height:66,transform:`translateY(${row.start}px)`}}>
            <span role="cell" className="track-number">{active&&playing?<AudioLines size={17}/>:row.index+1}</span>
            <div role="cell" className="track-name"><Cover track={t} size="small"/><div className="track-titles"><button disabled={busy} onClick={()=>onPlay(t,row.index)} title={`${t.title} — ${t.artist}`} aria-label={`Слушать ${t.title} — ${t.artist}`}><strong>{t.title}</strong></button><div className="track-subtitle"><button className="artist-link" onClick={event=>{event.stopPropagation();onArtist?.(t.artist_id);}}>{t.artist}</button>{rowNotes?.[row.index]&&<span className="track-row-note"> · {rowNotes[row.index]}</span>}</div></div>{showLyricsIndicator(t)&&<Tooltip content="Есть текст песни"><span className="lyrics-available" aria-label="Есть текст песни"><MicVocal size={13}/></span></Tooltip>}<Play className="row-play" size={15}/></div>
            <button role="cell" className="album-cell" title={t.album} onClick={()=>onAlbum?.(t.album_id)}>{t.album}</button>
            <span role="cell"><span className="format">{t.format}</span></span>
            <span role="cell" className="row-actions"><button className={`icon-button ${likes.has(t.id)?'liked':''}`} disabled={busy||!onLike} aria-pressed={likes.has(t.id)} aria-label={`${likes.has(t.id)?'Убрать лайк':'Нравится'}: ${t.title}`} onClick={()=>onLike?.(t)}><Heart size={16} fill={likes.has(t.id)?'currentColor':'none'}/></button><button className="icon-button" disabled={busy||!onActions} aria-label={`Действия: ${t.title}`} onClick={()=>onActions?.(t,row.index)}><MoreHorizontal size={18}/></button></span>
            <span role="cell" className="duration">{time(t.duration)}</span>
          </div>;
        })}
      </div>
      {!tracks.length&&<div className="empty-inline">{emptyText}</div>}
    </div>
  </div>;
}
