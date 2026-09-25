import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ListPlus } from 'lucide-react';
import type { Playlist } from './types';
import { dismissesMenu, MENU_MARGIN, outsideMenu, placeContextMenu, placeSubmenu, type MenuPoint, type SubmenuPlacement } from './trackContextMenuModel';
import { Tooltip } from './Tooltip';
import './TrackContextMenu.css';

export type MenuRun=(action:()=>void|Promise<unknown>,message?:string)=>Promise<void>;
const ContextMenuLayerContext=createContext<HTMLDivElement|null>(null);

function viewportSize(){return {width:window.innerWidth,height:window.innerHeight};}
function safeMenuBottom(){
  const viewport=viewportSize(),player=document.querySelector<HTMLElement>('.player'),rect=player?.getBoundingClientRect();
  return rect&&rect.height>0&&rect.top>0?Math.min(viewport.height,rect.top):viewport.height;
}

export function ContextMenu({point,label,onClose,onNotice,children}:{point:MenuPoint;label:string;onClose:()=>void;onNotice?:(message:string)=>void;children:(run:MenuRun)=>ReactNode}){
  const layerRef=useRef<HTMLDivElement>(null),menuRef=useRef<HTMLDivElement>(null),actionStarted=useRef(false),[position,setPosition]=useState(point),[layerElement,setLayerElement]=useState<HTMLDivElement|null>(null);
  const bindLayer=useCallback((node:HTMLDivElement|null)=>{layerRef.current=node;setLayerElement(node);},[]);
  useLayoutEffect(()=>{
    const menu=menuRef.current;if(!menu)return;
    const place=()=>{
      const viewport=viewportSize(),safeBottom=safeMenuBottom();
      menu.style.maxHeight=`${Math.max(1,Math.min(viewport.height-2*MENU_MARGIN,safeBottom-2*MENU_MARGIN))}px`;
      const rect=menu.getBoundingClientRect(),next=placeContextMenu(point,{width:rect.width,height:rect.height},viewport,safeBottom);
      setPosition(current=>current.x===next.x&&current.y===next.y?current:next);
    };
    place();const observer=new ResizeObserver(place);observer.observe(menu);window.addEventListener('resize',place);
    return()=>{observer.disconnect();window.removeEventListener('resize',place);};
  },[point]);
  useEffect(()=>{
    const pointer=(event:PointerEvent)=>{if(outsideMenu(!!layerRef.current?.contains(event.target as Node)))onClose();};
    const key=(event:KeyboardEvent)=>{if(dismissesMenu(event.key)){event.preventDefault();onClose();}};
    window.addEventListener('pointerdown',pointer,true);window.addEventListener('keydown',key,true);
    return()=>{window.removeEventListener('pointerdown',pointer,true);window.removeEventListener('keydown',key,true);};
  },[onClose]);
  const run:MenuRun=async(action,message)=>{if(actionStarted.current)return;actionStarted.current=true;try{await action();if(message)onNotice?.(message);}catch(error){onNotice?.(String(error));}finally{onClose();}};
  return createPortal(<div ref={bindLayer} className="context-menu-layer" onContextMenu={event=>event.preventDefault()}><ContextMenuLayerContext.Provider value={layerElement}><div ref={menuRef} className="track-context-menu" role="menu" aria-label={label} style={{left:position.x,top:position.y}}>{children(run)}</div></ContextMenuLayerContext.Provider></div>,document.body);
}

export function MenuSection({label,children,separated=false}:{label?:string;children:ReactNode;separated?:boolean}){return <section className={separated?'context-menu-separated':undefined}>{label&&<small className="context-menu-heading">{label}</small>}{children}</section>;}
export function MenuItem({icon,children,disabled=false,onClick,tooltip,destructive=false,trailing}:{icon?:ReactNode;children:ReactNode;disabled?:boolean;onClick:()=>void;tooltip?:string;destructive?:boolean;trailing?:ReactNode}){const button=<button className={`context-menu-item${destructive?' destructive':''}`} role="menuitem" disabled={disabled} onClick={onClick}><span className="context-menu-icon" aria-hidden="true">{icon}</span><span className="context-menu-label">{children}</span>{trailing&&<span className="context-menu-trailing" aria-hidden="true">{trailing}</span>}</button>;return tooltip?<Tooltip content={tooltip}>{button}</Tooltip>:button;}

export function PlaylistSubmenu({playlists,disabled=false,run,onSelect}:{playlists:Playlist[];disabled?:boolean;run:MenuRun;onSelect:(playlist:Playlist)=>void|Promise<unknown>}){
  if(!playlists.length)return <MenuItem icon={<ListPlus size={16}/>} tooltip="Сначала создайте плейлист" disabled onClick={()=>{}}>Нет плейлистов</MenuItem>;
  return <PlaylistSubmenuWithItems playlists={playlists} disabled={disabled} run={run} onSelect={onSelect}/>;
}

function PlaylistSubmenuWithItems({playlists,disabled,run,onSelect}:{playlists:Playlist[];disabled:boolean;run:MenuRun;onSelect:(playlist:Playlist)=>void|Promise<unknown>}){
  const layerElement=useContext(ContextMenuLayerContext);
  const detailsRef=useRef<HTMLDetailsElement>(null),summaryRef=useRef<HTMLElement>(null),panelRef=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false),[placement,setPlacement]=useState<SubmenuPlacement>({x:MENU_MARGIN,y:MENU_MARGIN,side:'right'});
  useLayoutEffect(()=>{
    if(!open)return;
    const panel=panelRef.current,summary=summaryRef.current;if(!panel||!summary)return;
    const place=()=>{
      const viewport=viewportSize(),safeBottom=safeMenuBottom();
      panel.style.maxHeight=`${Math.max(1,Math.min(viewport.height-2*MENU_MARGIN,safeBottom-2*MENU_MARGIN))}px`;
      const anchor=summary.getBoundingClientRect(),rect=panel.getBoundingClientRect();
      const next=placeSubmenu({left:anchor.left,top:anchor.top,right:anchor.right,bottom:anchor.bottom},{width:rect.width,height:rect.height},viewport,safeBottom);
      setPlacement(current=>current.x===next.x&&current.y===next.y&&current.side===next.side?current:next);
    };
    place();const observer=new ResizeObserver(place);observer.observe(panel);observer.observe(summary);
    window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    return()=>{observer.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[open]);
  return <><Tooltip content="Выбрать плейлист"><details ref={detailsRef} className="context-submenu" data-side={placement.side} onToggle={()=>setOpen(!!detailsRef.current?.open)}><summary ref={summaryRef} role="menuitem" aria-haspopup="menu" aria-disabled={disabled} tabIndex={disabled?-1:0} onClick={event=>{if(disabled)event.preventDefault();}} onKeyDown={event=>{if(disabled&&(event.key==='Enter'||event.key===' '))event.preventDefault();}}><span className="context-menu-icon" aria-hidden="true"><ListPlus size={16}/></span><span className="context-menu-label">Добавить в плейлист</span><span className="context-menu-trailing" aria-hidden="true"><ChevronRight size={15}/></span></summary></details></Tooltip>{open&&layerElement&&createPortal(<div ref={panelRef} className="context-submenu-panel" role="menu" aria-label="Выбрать плейлист" data-side={placement.side} style={{left:placement.x,top:placement.y}}>{playlists.map(playlist=><MenuItem key={playlist.id} disabled={disabled} onClick={()=>void run(()=>onSelect(playlist),'Добавлено в плейлист')}>{playlist.name}</MenuItem>)}</div>,layerElement)}</>;
}
