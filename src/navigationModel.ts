import type { Page } from './libraryModel';

export type NavigationPage=Page|{kind:'recentlyAdded'}|{kind:'visualizer'};
export type Screen={page:NavigationPage;query:string};
export type NavigationState={current:Screen;back:Screen[]};
export const initialNavigation:NavigationState={current:{page:{kind:'home'},query:''},back:[]};
const samePage=(a:NavigationPage,b:NavigationPage)=>a.kind===b.kind&&(!('id' in a)||('id' in b&&a.id===b.id));
export function searchScreen(state:NavigationState):Screen{
  if(state.current.page.kind==='search')return state.current;
  return [...state.back].reverse().find(screen=>screen.page.kind==='search')??{page:{kind:'search'},query:''};
}
export function visit(state:NavigationState,page:NavigationPage):NavigationState{
  if(samePage(state.current.page,page))return state;
  const current=page.kind==='search'?searchScreen(state):{page,query:''};
  return {current,back:[...state.back,state.current]};
}
export function enterSearch(state:NavigationState,query:string):NavigationState{
  if(state.current.page.kind==='search')return {...state,current:{...state.current,query}};
  return {current:{page:{kind:'search'},query},back:[...state.back,state.current]};
}
export function goBack(state:NavigationState):NavigationState{
  const previous=state.back.at(-1);return previous?{current:previous,back:state.back.slice(0,-1)}:state;
}

export const sidebarIds=['home','search','library','lyrics','recentlyAdded','artists','albums','liked','playlists','history','queue','downloads','settings'] as const;
export type SidebarId=typeof sidebarIds[number];
export const sidebarGroups=[
  {label:'ОСНОВНОЕ',ids:['home','search','library','recentlyAdded','history']},
  {label:'МУЗЫКА',ids:['liked','queue','playlists','albums','artists']},
  {label:'ИНСТРУМЕНТЫ',ids:['downloads','lyrics']},
] as const satisfies ReadonlyArray<{label:string;ids:readonly SidebarId[]}>;
export function sidebarGroup(id:SidebarId):number{return sidebarGroups.findIndex(group=>(group.ids as readonly SidebarId[]).includes(id));}
export function groupedSidebarOrder(order:SidebarId[]):SidebarId[][]{return sidebarGroups.map(group=>order.filter(id=>(group.ids as readonly SidebarId[]).includes(id)));}
type StorageLike={getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void};
const storageKey='undertone.sidebar.order.v1';
export function normalizeSidebarOrder(value:unknown):SidebarId[]{
  const requested=Array.isArray(value)?value.filter((id):id is SidebarId=>sidebarIds.includes(id as SidebarId)):[];
  return [...new Set([...requested,...sidebarIds])];
}
export function loadSidebarOrder(storage:StorageLike|null):SidebarId[]{
  if(!storage)return [...sidebarIds];
  try{return normalizeSidebarOrder(JSON.parse(storage.getItem(storageKey)||'null'));}catch{return [...sidebarIds];}
}
export function saveSidebarOrder(storage:StorageLike|null,order:SidebarId[]){try{storage?.setItem(storageKey,JSON.stringify(normalizeSidebarOrder(order)));}catch{/* storage can be unavailable */}}
export function reorderSidebar(order:SidebarId[],source:SidebarId,target:SidebarId):SidebarId[]{
  if(source===target)return order;const next=order.filter(id=>id!==source);const index=next.indexOf(target);if(index<0)return order;next.splice(index,0,source);return normalizeSidebarOrder(next);
}
export async function rescanConfiguredFolders(folders:string[],scan:(folders:string[])=>Promise<unknown>){if(folders.length)await scan(folders);}
export const homeCopy={title:'Главная',emptyTitle:'Медиатека пуста',emptyHelp:'Добавьте папку с MP3, FLAC, M4A, AAC, OGG или WAV.'} as const;

export function downloadPageEntries<T>(operations:T[]):T[]{return operations;}
export function recentlyAddedTracks<T extends {added_at:string}>(tracks:T[]):T[]{
  return [...tracks].sort((a,b)=>Date.parse(b.added_at)-Date.parse(a.added_at));
}
