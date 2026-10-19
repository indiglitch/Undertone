import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useVirtualizer,defaultRangeExtractor} from '@tanstack/react-virtual';
import {MoreHorizontal,Play} from 'lucide-react';
import {IconButton,Tooltip} from './ui';
import EntityArtwork,{type EntityKind} from './EntityArtwork';
import {openContextMenu,type MenuPoint} from './trackContextMenuModel';
import type {CollectionMenuTarget} from './CollectionContextMenu';
import './EntityPresentation.css';
export type EntityCardData={id:number;title:string;subtitle:string;menuTarget:CollectionMenuTarget};
// Preserve the existing row virtualizer, with geometry shared by every variant.
const CARD_WIDTH=224,GAP=24,ROW_HEIGHT=324;
export function EntityCard({item,kind,onOpen,onPlay,onContextMenu,busy=false,dropTargets=false,onFocus}:{item:EntityCardData;kind:EntityKind;onOpen:(id:number)=>void;onPlay:(item:EntityCardData)=>void;onContextMenu:(target:CollectionMenuTarget,point:MenuPoint)=>void;busy?:boolean;dropTargets?:boolean;onFocus:()=>void}){
 return <article className={`entity-card entity-card--${kind}`} data-entity-id={item.id} data-playlist-id={dropTargets?item.id:undefined} onFocusCapture={onFocus} onContextMenu={event=>openContextMenu(event,point=>onContextMenu(item.menuTarget,point))}>
  <button className="entity-card-open" aria-label={`Открыть: ${item.title}`} onClick={()=>onOpen(item.id)} onKeyDown={event=>{if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();onContextMenu(item.menuTarget,{x:rect.left,y:rect.bottom});}}}>
   <EntityArtwork kind={kind} title={item.title} tracks={item.menuTarget.tracks}/><strong title={item.title}>{item.title}</strong><small title={item.subtitle}>{item.subtitle}</small>
  </button>
  <div className="entity-card-actions">{kind!=='artist'&&<Tooltip content="Воспроизвести"><IconButton aria-label={`Слушать: ${item.title}`} disabled={busy||!item.menuTarget.tracks.length} onClick={()=>onPlay(item)}><Play aria-hidden="true"/></IconButton></Tooltip>}<Tooltip content="Действия с коллекцией"><IconButton aria-label={`Действия: ${item.title}`} onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();onContextMenu(item.menuTarget,{x:rect.left,y:rect.bottom});}}><MoreHorizontal aria-hidden="true"/></IconButton></Tooltip></div>
 </article>;
}
export default function EntityGrid({items,kind,onOpen,onPlay,onContextMenu,busy=false,dropTargets=false}:{items:EntityCardData[];kind:EntityKind;onOpen:(id:number)=>void;onPlay:(item:EntityCardData)=>void;onContextMenu:(target:CollectionMenuTarget,point:MenuPoint)=>void;busy?:boolean;dropTargets?:boolean}){
 const ref=useRef<HTMLDivElement>(null),[columns,setColumns]=useState(1),[focused,setFocused]=useState<number|null>(null),previous=useRef(items),columnRef=useRef(1),restoreFocus=useRef<{id:string;label:string}|null>(null),restoreScroll=useRef<{index:number;offset:number}|null>(null);
 useEffect(()=>{const el=ref.current;if(!el)return;const observer=new ResizeObserver(()=>{const next=Math.max(1,Math.floor((el.clientWidth+GAP)/(CARD_WIDTH+GAP)));if(next===columnRef.current)return;
  const active=document.activeElement as HTMLElement|null,card=active?.closest<HTMLElement>('.entity-card');
  if(active&&card&&el.contains(card))restoreFocus.current={id:card.dataset.entityId!,label:active.getAttribute('aria-label')??''};
  restoreScroll.current={index:Math.floor(el.scrollTop/ROW_HEIGHT)*columnRef.current,offset:el.scrollTop%ROW_HEIGHT};columnRef.current=next;setColumns(next);
 });observer.observe(el);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(previous.current!==items){previous.current=items;if(focused!==null&&!items.some(item=>item.id===focused))setFocused(null);}},[items,focused]);
 useLayoutEffect(()=>{const position=restoreScroll.current;restoreScroll.current=null;if(position&&ref.current)ref.current.scrollTop=Math.floor(Math.min(position.index,Math.max(0,items.length-1))/columns)*ROW_HEIGHT+position.offset;const previousFocus=restoreFocus.current;if(!previousFocus)return;restoreFocus.current=null;ref.current?.querySelector<HTMLButtonElement>(`.entity-card[data-entity-id="${previousFocus.id}"] button[aria-label="${CSS.escape(previousFocus.label)}"]`)?.focus({preventScroll:true});},[columns]);
 const focusIndex=items.findIndex(item=>item.id===focused),focusRow=focusIndex<0?-1:Math.floor(focusIndex/columns);
 const rows=useVirtualizer({count:Math.ceil(items.length/columns),getScrollElement:()=>ref.current,estimateSize:()=>ROW_HEIGHT,overscan:2,rangeExtractor:range=>{const indexes=defaultRangeExtractor(range);if(focusRow>=0&&!indexes.includes(focusRow))indexes.push(focusRow);return indexes.sort((a,b)=>a-b);}});
 return <div className="entity-scroll" ref={ref} data-entity-kind={kind} data-entity-count={items.length} data-columns={columns} role="region" aria-label={kind==='album'?'Альбомы':kind==='artist'?'Исполнители':'Плейлисты'}><div style={{height:rows.getTotalSize(),position:'relative'}}>{rows.getVirtualItems().map(row=><div key={row.key} className="entity-grid-row" style={{position:'absolute',top:0,width:'100%',height:ROW_HEIGHT,transform:`translateY(${row.start}px)`,gridTemplateColumns:`repeat(${columns},minmax(0,${CARD_WIDTH}px))`}}>{items.slice(row.index*columns,(row.index+1)*columns).map(item=><EntityCard key={item.id} item={item} kind={kind} onOpen={onOpen} onPlay={onPlay} onContextMenu={onContextMenu} busy={busy} dropTargets={dropTargets} onFocus={()=>setFocused(item.id)}/>)}</div>)}</div>{!items.length&&<div className="empty-inline">Нет элементов в локальной коллекции.</div>}</div>;
}
