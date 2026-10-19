import {feedbackError} from './feedback';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ListPlus } from 'lucide-react';
import type { Playlist } from './types';
import { dismissesMenu, MENU_MARGIN, outsideMenu, placeContextMenu, placeSubmenu, type MenuPoint, type SubmenuPlacement } from './trackContextMenuModel';
import { Tooltip } from './Tooltip';
import './TrackContextMenu.css';
import {focusOrigin,rememberMenuOrigin} from './Dialog';

export type MenuRun=(action:()=>unknown|Promise<unknown>,message?:string)=>Promise<void>;
const ContextMenuLayerContext=createContext<HTMLDivElement|null>(null);

function viewportSize(){return {width:window.innerWidth,height:window.innerHeight};}
function safeMenuBottom(){
  if(document.querySelector('dialog[open]'))return window.innerHeight;
  const viewport=viewportSize(),player=document.querySelector<HTMLElement>('.player'),rect=player?.getBoundingClientRect();
  return rect&&rect.height>0&&rect.top>0?Math.min(viewport.height,rect.top):viewport.height;
}

export function ContextMenu({point,label,onClose,onNotice,children}:{point:MenuPoint;label:string;onClose:()=>void;onNotice?:(message:string)=>void;children:(run:MenuRun)=>ReactNode}){
  const layerRef=useRef<HTMLDivElement>(null),menuRef=useRef<HTMLDivElement>(null),actionStarted=useRef(false),[position,setPosition]=useState(point),[layerElement,setLayerElement]=useState<HTMLDivElement|null>(null);
  const [origin]=useState(focusOrigin);
  useLayoutEffect(()=>{const menu=menuRef.current;rememberMenuOrigin(origin);menuRef.current?.querySelector<HTMLElement>('[role=menuitem]:not(:disabled):not([aria-disabled=true])')?.focus({preventScroll:true});return()=>{queueMicrotask(()=>{const active=document.activeElement;if(!menu?.isConnected&&origin?.isConnected&&(active===document.body||!!menu?.contains(active)))origin.focus({preventScroll:true});});};},[]);
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
    const key=(event:KeyboardEvent)=>{if(dismissesMenu(event.key)){event.preventDefault();event.stopPropagation();const details=layerRef.current?.querySelector<HTMLDetailsElement>('.context-submenu[open]');if(details){details.open=false;details.querySelector<HTMLElement>('summary')?.focus();}else onClose();}};
    window.addEventListener('pointerdown',pointer,true);window.addEventListener('keydown',key,true);
    return()=>{window.removeEventListener('pointerdown',pointer,true);window.removeEventListener('keydown',key,true);};
  },[onClose]);
  const run:MenuRun=async(action,message)=>{if(actionStarted.current)return;actionStarted.current=true;try{const result=await action();if(message&&result!==false)onNotice?.(message);}catch(error){feedbackError(error);}finally{onClose();}};
  return createPortal(<div ref={bindLayer} className="context-menu-layer" onContextMenu={event=>event.preventDefault()}><ContextMenuLayerContext.Provider value={layerElement}><div ref={menuRef} className="track-context-menu" role="menu" aria-label={label} onKeyDown={event=>{if(event.defaultPrevented)return;const menu=(event.target as HTMLElement).closest('[role=menu]');if(menu!==event.currentTarget)return;const shortcut=[...menu.querySelectorAll<HTMLButtonElement>('button[data-menu-shortcut]:not(:disabled)')].find(item=>item.dataset.menuShortcut===event.key);if(shortcut&&!event.repeat&&!event.ctrlKey&&!event.altKey&&!event.metaKey){event.preventDefault();shortcut.click();return;}if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;const items=[...menu.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled):not([aria-disabled=true])')];const at=items.indexOf(document.activeElement as HTMLElement);event.preventDefault();(event.key==='Home'?items[0]:event.key==='End'?items.at(-1):items[(at+(event.key==='ArrowDown'?1:-1)+items.length)%items.length])?.focus();}} style={{left:position.x,top:position.y}}>{children(run)}</div></ContextMenuLayerContext.Provider></div>,document.activeElement?.closest('dialog[open]')??document.querySelector('.now-playing-overlay[open]')??document.body);
}

export function MenuSection({label,children,separated=false}:{label?:string;children:ReactNode;separated?:boolean}){return <section className={separated?'context-menu-separated':undefined}>{label&&<small className="context-menu-heading">{label}</small>}{children}</section>;}
export function MenuItem({icon,children,disabled=false,onClick,tooltip,destructive=false,trailing,shortcut}:{shortcut?:string;icon?:ReactNode;children:ReactNode;disabled?:boolean;onClick:()=>void;tooltip?:string;destructive?:boolean;trailing?:ReactNode}){const button=<button className={`context-menu-item${destructive?' destructive':''}`} role="menuitem" data-menu-shortcut={shortcut} disabled={disabled} onClick={onClick}><span className="context-menu-icon" aria-hidden="true">{icon}</span><span className="context-menu-label">{children}</span>{(trailing||shortcut)&&<span className="context-menu-trailing" aria-hidden="true">{trailing??<kbd>{shortcut}</kbd>}</span>}</button>;return tooltip?<Tooltip content={tooltip}>{button}</Tooltip>:button;}

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
  return <><Tooltip content="Выбрать плейлист"><details ref={detailsRef} className="context-submenu" data-side={placement.side} onToggle={()=>setOpen(!!detailsRef.current?.open)}><summary ref={summaryRef} role="menuitem" aria-haspopup="menu" aria-expanded={open} aria-disabled={disabled} tabIndex={disabled?-1:0} onClick={event=>{if(disabled)event.preventDefault();}} onKeyDown={event=>{if(disabled&&(event.key==='Enter'||event.key===' '||event.key==='ArrowRight'))event.preventDefault();else if(event.key==='ArrowRight'){event.preventDefault();detailsRef.current!.open=true;setOpen(true);requestAnimationFrame(()=>panelRef.current?.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus());}}}><span className="context-menu-icon" aria-hidden="true"><ListPlus size={16}/></span><span className="context-menu-label">Добавить в плейлист</span><span className="context-menu-trailing" aria-hidden="true"><ChevronRight size={15}/></span></summary></details></Tooltip>{open&&layerElement&&createPortal(<div ref={panelRef} className="context-submenu-panel" role="menu" aria-label="Выбрать плейлист" onKeyDown={event=>{if(event.key==='ArrowLeft'){event.preventDefault();event.stopPropagation();detailsRef.current!.open=false;setOpen(false);summaryRef.current?.focus();}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],at=items.indexOf(document.activeElement as HTMLButtonElement);(event.key==='Home'?items[0]:event.key==='End'?items.at(-1):items[(at+(event.key==='ArrowDown'?1:-1)+items.length)%items.length])?.focus();}}} data-side={placement.side} style={{left:placement.x,top:placement.y}}>{playlists.map(playlist=><MenuItem key={playlist.id} disabled={disabled} onClick={()=>void run(()=>onSelect(playlist))}>{playlist.name}</MenuItem>)}</div>,layerElement)}</>;
}
