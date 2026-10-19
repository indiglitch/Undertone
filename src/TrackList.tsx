import {createPortal} from 'react-dom';
import {useTrackDisplay,type TrackDisplay} from './trackDisplay';
import {useEffect,useId,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {useVirtualizer,defaultRangeExtractor} from '@tanstack/react-virtual';
import {GripVertical,Clock3,Play,Pause,AudioLines,Heart,MoreHorizontal,MicVocal,FileWarning} from 'lucide-react';
import {type Track,time} from './types';
import {Cover,IconButton} from './ui';
import {openContextMenu,type MenuPoint} from './trackContextMenuModel';
import {showLyricsIndicator} from './lyricsViewModel';
import {Tooltip} from './Tooltip';
import {occurrenceKeys,selectRange,type TrackContextPayload} from './trackListModel';
import {useTrackAvailability} from './trackAvailability';
import './TrackList.css';

export type TrackListContext=TrackContextPayload<Track>;
export function fileSize(bytes:number|null|undefined){if(bytes==null||!Number.isFinite(bytes)||bytes<0)return '—';const units=['Б','КБ','МБ','ГБ'];const unit=Math.min(3,bytes>0?Math.floor(Math.log(bytes)/Math.log(1024)):0);return `${(bytes/1024**unit).toLocaleString('ru',{maximumFractionDigits:1})} ${units[unit]}`;}
type Props={label?:string;onRemoveSelection?:(keys:string[])=>void;embedded?:boolean;onReorder?:(from:number,to:number)=>void;reorderEnabled?:boolean;rowHeight?:number;tracks:Track[];currentId:number|null;playing:boolean;onPlay:(track:Track,index:number)=>void;onToggleCurrent?:()=>void;likes?:Set<number>;onLike?:(track:Track)=>void;onActions?:(track:Track,index:number,context:TrackListContext)=>void;onContextMenu?:(track:Track,point:MenuPoint,context:TrackListContext)=>void;onArtist?:(id:number)=>void;onAlbum?:(id:number)=>void;busy?:boolean;rowNotes?:string[];rowKeys?:readonly (string|number)[];columns?:Partial<TrackDisplay>&{index?:boolean};source?:string;emptyText?:string};
export default function TrackList({label="Музыкальная библиотека",onRemoveSelection,embedded=false,onReorder,reorderEnabled=true,rowHeight=48,tracks,currentId,playing,onPlay,onToggleCurrent,likes=new Set(),onLike,onActions,onContextMenu,onArtist,onAlbum,busy=false,rowNotes,rowKeys,columns,source='library',emptyText='Треков пока нет. Добавьте папку или измените поиск.'}:Props){
  const preferences=useTrackDisplay(),root=useRef<HTMLDivElement>(null),ref=useRef<HTMLDivElement>(null),instance=useId();
  const [width,setWidth]=useState(1400),[selected,setSelected]=useState<Set<string>>(new Set()),[activeKey,setActiveKey]=useState<string|null>(null);
  const anchor=useRef<string|null>(null),previousSource=useRef(source);
  const keys=useMemo(()=>occurrenceKeys(tracks.map(t=>t.id),rowKeys),[tracks,rowKeys]);
  const previousKeys=useRef(keys);
  const activeIndex=activeKey===null?-1:keys.indexOf(activeKey);
  const display={...preferences,...columns};
  // Container width, rather than document width, also handles sidebar resizing and embedded lists.
  display.size=display.size&&width>=1100;display.format=display.format&&width>=900;display.album=display.album&&width>=700;
  const compactMetadata=width<700;
  useEffect(()=>{const el=root.current;if(!el)return;const observer=new ResizeObserver(()=>setWidth(el.clientWidth));observer.observe(el);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    if(previousSource.current!==source){previousSource.current=source;setSelected(new Set());setActiveKey(null);anchor.current=null;ref.current?.scrollTo({top:0});return;}
    const available=new Set(keys);setSelected(previous=>new Set([...previous].filter(k=>available.has(k))));
    if(activeKey!==null&&!available.has(activeKey))setActiveKey(keys[Math.min(Math.max(0,previousKeys.current.indexOf(activeKey)),keys.length-1)]??null);
    if(anchor.current!==null&&!available.has(anchor.current))anchor.current=null;
    previousKeys.current=keys;
  },[keys,source,activeKey]);
  const [dragPreview,setDragPreview]=useState<{from:number;top:number;left:number;width:number}|null>(null);
  const [dropIndex,setDropIndex]=useState<number|null>(null);
  const cleanupRef=useRef<()=>void>(()=>{});
  useEffect(()=>()=>cleanupRef.current(),[]);
  const grid={gridTemplateColumns:`${onReorder?'80px':'40px'} minmax(0,1fr) ${display.album?'minmax(120px,var(--track-album-width,220px)) ':''}${display.format?'64px ':''}${display.size?'88px ':''}80px ${display.duration?'56px':''}`};
  function beginReorder(event:ReactPointerEvent<HTMLButtonElement>,from:number){
    event.stopPropagation();
    if(busy||!reorderEnabled||!onReorder||event.button!==0)return;
    event.preventDefault();cleanupRef.current();setActiveKey(keys[from]);
    const pointer=event.pointerId,start=event.clientY,button=event.currentTarget;
    const sourceRect=button.closest('.track-row')!.getBoundingClientRect();
    let y=start,to=from,active=false,frame=0;
    button.setPointerCapture(pointer);
    const tick=()=>{const el=ref.current;if(el&&active){const rect=el.getBoundingClientRect();const speed=y<rect.top+28?-10:y>rect.bottom-28?10:0;if(speed)el.scrollTop+=speed;to=Math.max(0,Math.min(tracks.length-1,Math.floor((el.scrollTop+y-rect.top)/rowHeight)));setDropIndex(to);setDragPreview({from,top:y-(start-sourceRect.top),left:sourceRect.left,width:sourceRect.width});}frame=requestAnimationFrame(tick);};
    const move=(e:PointerEvent)=>{if(e.pointerId!==pointer)return;y=e.clientY;active=active||Math.abs(y-start)>5;};
    const cleanup=()=>{cancelAnimationFrame(frame);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',cancel);window.removeEventListener('keydown',key);button.removeEventListener('lostpointercapture',cancel);if(button.hasPointerCapture(pointer))button.releasePointerCapture(pointer);setDropIndex(null);setDragPreview(null);cleanupRef.current=()=>{};};
    const finish=(e:PointerEvent)=>{if(e.pointerId!==pointer)return;const changed=active&&from!==to;cleanup();if(changed){setActiveKey(keys[from]);root.current?.focus({preventScroll:true});onReorder(from,to);}};
    const cancel=()=>cleanup();
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();cleanup();}};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',cancel);window.addEventListener('keydown',key);button.addEventListener('lostpointercapture',cancel);cleanupRef.current=cleanup;frame=requestAnimationFrame(tick);
  }
  const rows=useVirtualizer({count:tracks.length,getScrollElement:()=>ref.current,estimateSize:()=>rowHeight,overscan:8,getItemKey:index=>keys[index],rangeExtractor:range=>{
    const indexes=defaultRangeExtractor(range);if(activeIndex>=0&&!indexes.includes(activeIndex))indexes.push(activeIndex);return indexes.sort((a,b)=>a-b);
  }});
  useEffect(()=>{rows.measure();},[rowHeight,rows]);
  const visibleRows=embedded?tracks.map((_,index)=>({index,start:index*rowHeight})):rows.getVirtualItems();
  const availability=useTrackAvailability(visibleRows.map(row=>tracks[row.index]));
  const rowId=(index:number)=>`${instance}-row-${encodeURIComponent(keys[index])}`;
  function context(index:number):TrackListContext{
    const selection=selected.has(keys[index])?tracks.filter((_,i)=>selected.has(keys[i])):[tracks[index]];
    return {track:tracks[index],selection,source,index,rowKey:keys[index],selectionKeys:selected.has(keys[index])?keys.filter(key=>selected.has(key)):[keys[index]]};
  }
  function select(index:number,shift=false,ctrl=false){
    const key=keys[index];if(key===undefined)return;
    setActiveKey(key);setSelected(previous=>{
      if(shift)return selectRange(keys,anchor.current,key,previous,ctrl);
      anchor.current=key;if(ctrl){const next=new Set(previous);next.has(key)?next.delete(key):next.add(key);return next;}return new Set([key]);
    });
    root.current?.focus({preventScroll:true});
  }
  function play(index:number,toggle=false){
    const track=tracks[index];if(busy||!track||availability(track)==='missing')return;
    if(toggle&&track.id===currentId&&onToggleCurrent)onToggleCurrent();else onPlay(track,index);
  }
  function menu(index:number,point:MenuPoint){
    if(!selected.has(keys[index]))select(index);else{setActiveKey(keys[index]);root.current?.focus({preventScroll:true});}
    onContextMenu?.(tracks[index],point,context(index));
    if(onContextMenu)requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.track-context-menu [role=menuitem]:not(:disabled)')?.focus({preventScroll:true}));
  }
  const columnCount=3+Number(display.album)+Number(display.format)+Number(display.size)+Number(display.duration);
  return <div ref={root} className={`track-table ${embedded?'track-table-embedded':''}`} role="grid" aria-label={label} aria-multiselectable="true" aria-rowcount={tracks.length+1} aria-colcount={columnCount} aria-activedescendant={activeIndex>=0?rowId(activeIndex):undefined} tabIndex={busy?-1:0} data-source={source} data-row-height={rowHeight} onFocusCapture={event=>{
    const focusedRow=(event.target as HTMLElement).closest<HTMLElement>('.track-row');
    const index=Number(focusedRow?.getAttribute('aria-rowindex'))-2;
    if(index>=0&&index<keys.length)setActiveKey(keys[index]);
  }} onKeyDown={event=>{
    if(busy||event.defaultPrevented||document.querySelector('.track-context-menu'))return;
    const ctrl=event.ctrlKey||event.metaKey;
    if(event.key==='Delete'&&event.target===event.currentTarget&&onRemoveSelection&&selected.size){event.preventDefault();onRemoveSelection(keys.filter(key=>selected.has(key)));return;}
    const navigationKey=['ArrowDown','ArrowUp','Home','End','ContextMenu'].includes(event.key)||(ctrl&&event.key.toLowerCase()==='a')||(event.shiftKey&&event.key==='F10');
    if(event.target!==event.currentTarget&&!navigationKey)return;
    if(ctrl&&event.key.toLowerCase()==='a'){event.preventDefault();setSelected(new Set(keys));if(activeIndex<0)setActiveKey(keys[0]??null);return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&tracks.length){
      event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?tracks.length-1:Math.max(0,Math.min(tracks.length-1,activeIndex<0?0:activeIndex+(event.key==='ArrowDown'?1:-1)));
      if(ctrl&&!event.shiftKey)setActiveKey(keys[index]);else select(index,event.shiftKey,ctrl);
      if(!embedded)rows.scrollToIndex(index,{align:'auto'});else document.getElementById(rowId(index))?.scrollIntoView({block:'nearest'});return;
    }
    if((event.key==='Enter'||event.key===' ')&&activeIndex>=0){event.preventDefault();play(activeIndex,event.key===' ');}
    if(((event.shiftKey&&event.key==='F10')||event.key==='ContextMenu')&&activeIndex>=0){event.preventDefault();const rect=document.getElementById(rowId(activeIndex))?.getBoundingClientRect();menu(activeIndex,{x:rect?.left??0,y:rect?.bottom??0});}
    if(event.key==='Escape'){setSelected(new Set());anchor.current=null;}
  }}>
    <div className="track-head track-grid" style={grid} role="row"><span role="columnheader">{columns?.index===false?'':'#'}</span><span role="columnheader">Название</span>{display.album&&<span role="columnheader">Альбом</span>}{display.format&&<span role="columnheader">Формат</span>}{display.size&&<span role="columnheader">Размер</span>}<span role="columnheader" aria-label="Действия"/>{display.duration&&<span role="columnheader" aria-label="Длительность"><Clock3 size={16}/></span>}</div>
    <div className="track-scroll" ref={ref} role="rowgroup">
      <div style={{height:embedded?tracks.length*rowHeight:rows.getTotalSize(),position:'relative'}}>
        {visibleRows.map(row=>{
          const t=tracks[row.index],active=t.id===currentId,isSelected=selected.has(keys[row.index]),missing=availability(t)==='missing';
          const interactive=(target:EventTarget)=>!!(target as HTMLElement).closest('button,a,input,[role=menuitem]');
          const isPause=active&&playing;
          return <div key={keys[row.index]} id={rowId(row.index)} role="row" aria-rowindex={row.index+2} aria-selected={isSelected} aria-disabled={missing||undefined} aria-label={missing?`${t.title} — ${t.artist}. Файл недоступен`:undefined} data-track-id={busy?undefined:t.id} data-current={active||undefined} data-missing={missing||undefined} data-focused={activeIndex===row.index||undefined} data-insertion={dragPreview&&dropIndex===row.index?(dragPreview.from<row.index?'after':'before'):undefined} className={`track-row track-grid ${active?'active':''} ${isPause?'row-is-playing':''} ${isSelected?'selected':''} ${isSelected&&selected.size>1?'multi-selected':''} ${dragPreview?.from===row.index?'playlist-drag-source':''} ${dragPreview?'playlist-drag-neighbor':''}`} onClick={event=>{if(!busy&&!event.defaultPrevented&&!interactive(event.target))select(row.index,event.shiftKey,event.ctrlKey||event.metaKey);}} onDoubleClick={event=>{if(!interactive(event.target))play(row.index);}} onContextMenu={event=>openContextMenu(event,point=>menu(row.index,point))} style={{...grid,position:'absolute',top:0,left:0,width:'100%',height:rowHeight,transform:`translateY(${row.start+(dragPreview&&dropIndex!==null?(row.index>dragPreview.from&&row.index<=dropIndex?-rowHeight:row.index<dragPreview.from&&row.index>=dropIndex?rowHeight:0):0)}px)`}}>
            <span role="gridcell" className="track-number">{onReorder&&<Tooltip content={reorderEnabled?'Перетащить трек':'Для перемещения выберите порядок плейлиста и очистите поиск'}><IconButton className="playlist-reorder-handle" disabled={busy||!reorderEnabled} aria-label={`Переместить ${t.title}`} onClick={event=>event.stopPropagation()} onPointerDown={event=>beginReorder(event,row.index)}><GripVertical size={16}/></IconButton></Tooltip>}
              <Tooltip content={missing?'Файл недоступен':isPause?'Пауза':'Воспроизвести'}><IconButton className="track-play-button" disabled={busy||missing} aria-label={`${isPause?'Пауза':'Слушать'}: ${t.title} — ${t.artist}`} onClick={event=>{event.stopPropagation();play(row.index,true);}}><span className="track-index" aria-hidden="true">{active?<AudioLines size={16}/>:columns?.index===false?<Play size={16}/>:row.index+1}</span><span className="track-play-icon" aria-hidden="true">{isPause?<Pause size={16}/>:<Play size={16}/>}</span></IconButton></Tooltip>
            </span>
            <div role="gridcell" className="track-name">{display.cover&&<Cover track={t} size="small"/>}<div className="track-titles"><strong className="track-title" title={`${t.title} — ${t.artist}`}>{t.title}</strong><div className="track-subtitle">{display.artist&&<button className="artist-link" onClick={event=>{event.stopPropagation();onArtist?.(t.artist_id);}}>{t.artist}</button>}{!compactMetadata&&<>{display.year&&t.year&&<span> · {t.year}</span>}{display.genre&&t.genre&&<span> · {t.genre}</span>}{display.number&&t.track_number&&<span> · № {t.track_number}</span>}</>}{rowNotes?.[row.index]&&<span className="track-row-note" title={rowNotes[row.index]}> · {rowNotes[row.index]}</span>}</div></div>{missing&&<Tooltip content="Файл недоступен"><span className="track-missing-indicator" aria-label="Файл недоступен"><FileWarning size={16}/></span></Tooltip>}{showLyricsIndicator(t)&&<Tooltip content="Есть текст песни"><span className="lyrics-available" aria-label="Есть текст песни"><MicVocal size={16}/></span></Tooltip>}</div>
            {display.album&&<button role="gridcell" className="album-cell" title={t.album} onClick={event=>{event.stopPropagation();onAlbum?.(t.album_id);}}>{t.album}</button>}
            {display.format&&<span role="gridcell" className="track-format">{t.format}</span>}
            {display.size&&<span role="gridcell" className="track-file-size" title={t.size_bytes==null?'Размер неизвестен':`${t.size_bytes.toLocaleString('ru')} байт`}>{fileSize(t.size_bytes)}</span>}
            <span role="gridcell" className="row-actions"><Tooltip content={likes.has(t.id)?'Убрать из любимых':'Добавить в любимые'}><IconButton className={likes.has(t.id)?'liked':''} disabled={busy||!onLike} aria-pressed={likes.has(t.id)} aria-label={`${likes.has(t.id)?'Убрать лайк':'Нравится'}: ${t.title}`} onClick={event=>{event.stopPropagation();onLike?.(t);}}><Heart size={16} fill={likes.has(t.id)?'currentColor':'none'}/></IconButton></Tooltip><Tooltip content="Действия с треком"><IconButton disabled={busy||(!onContextMenu&&!onActions)} aria-label={`Действия: ${t.title}`} onClick={event=>{event.stopPropagation();const rect=event.currentTarget.getBoundingClientRect();if(onContextMenu)menu(row.index,{x:rect.left,y:rect.bottom});else onActions?.(t,row.index,context(row.index));}}><MoreHorizontal size={20}/></IconButton></Tooltip></span>
            {display.duration&&<span role="gridcell" className="duration">{time(t.duration)}</span>}
          </div>;
        })}
      </div>
      {!tracks.length&&<div className="empty-inline">{emptyText}</div>}
    </div>
    {dragPreview&&createPortal(<div className="playlist-drag-ghost" aria-hidden="true" style={{position:'fixed',top:dragPreview.top,left:dragPreview.left,width:dragPreview.width,height:rowHeight}}><GripVertical size={16}/><Cover track={tracks[dragPreview.from]} size="small"/><div><strong>{tracks[dragPreview.from].title}</strong><small>{tracks[dragPreview.from].artist}</small></div></div>,root.current?.closest('dialog[open]')??document.body)}
  </div>;
}
