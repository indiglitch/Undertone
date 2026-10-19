import {useEffect,useState,useRef,type HTMLAttributes,type ReactNode,type Ref} from 'react';
import {PanelLeftClose,PanelLeftOpen,Wrench} from 'lucide-react';
import {IconButton,Tooltip} from './ui';
const collapseKey='undertone.shell.sidebarCollapsed';
export function useSidebarCollapse(){
  const [collapsed,setCollapsed]=useState(()=>{try{const saved=localStorage.getItem(collapseKey);return saved===null?window.innerWidth<1100:saved==='true';}catch{return window.innerWidth<1100;}});
  useEffect(()=>{try{localStorage.setItem(collapseKey,String(collapsed));}catch{/* Layout stays usable with storage disabled. */}},[collapsed]);
  return {collapsed,toggle:()=>setCollapsed(value=>!value)};
}
export function AppShell({collapsed,children,className='',...props}:HTMLAttributes<HTMLDivElement>&{collapsed:boolean;ref?:Ref<HTMLDivElement>}){
  return <div {...props} data-sidebar-collapsed={collapsed} className={`app-shell ${className}`}>{children}</div>;
}
export function Sidebar({collapsed,onToggle,brand,navigation,playlists,sources,settings}:{collapsed:boolean;onToggle:()=>void;brand:ReactNode;navigation:ReactNode;playlists:ReactNode;sources:ReactNode;settings:ReactNode}){
  const label=collapsed?'Развернуть боковую панель':'Свернуть боковую панель';
  return <aside className="sidebar" aria-label="Боковая панель"><div className="sidebar-heading">{brand}<Tooltip content={label}><IconButton aria-label={label} aria-expanded={!collapsed} aria-controls="sidebar-navigation" onClick={onToggle}>{collapsed?<PanelLeftOpen/>:<PanelLeftClose/>}</IconButton></Tooltip></div><div id="sidebar-navigation" className="sidebar-navigation">{navigation}</div><div className="sidebar-playlists">{playlists}</div><div className="sidebar-sources">{sources}</div><div className="sidebar-settings">{settings}</div></aside>;
}
export function MainContent({page,children}:{page:string;children:ReactNode}){return <main className="main-content" data-page={page}>{children}</main>;}
export function PlayerArea({children}:{children:ReactNode}){return <div className="player-area">{children}</div>;}

export function SidebarTools({collapsed,children,active=false}:{collapsed:boolean;children:ReactNode;active?:boolean}){
  const ref=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(ref.current&&!ref.current.contains(event.target as Node))ref.current.open=false;};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&ref.current?.open){ref.current.open=false;ref.current.querySelector('summary')?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[]);
  if(!collapsed)return <div className="sidebar-tools"><div className="nav-label">ИНСТРУМЕНТЫ</div>{children}</div>;
  return <Tooltip content="Инструменты"><details ref={ref} className={`sidebar-tools sidebar-tools-disclosure ${active?'selected':''}`}><summary aria-label="Инструменты"><Wrench aria-hidden="true"/></summary><div className="sidebar-tools-menu" onClick={event=>{if((event.target as Element).closest('button')&&ref.current){ref.current.open=false;ref.current.querySelector('summary')?.focus();}}}>{children}</div></details></Tooltip>;
}
