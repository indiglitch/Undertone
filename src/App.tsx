import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { AudioLines, House, LibraryBig, FolderPlus, Search, ArrowUpRight, ArrowRight, ArrowLeft, Play, RefreshCw, HardDrive, X, Folder, Check, Disc3, Music2, Info, Users, Heart, ListMusic, Clock3, Plus, Download, MicVocal, Settings as SettingsIcon, Unplug, Pencil } from 'lucide-react';
import { Collections, DeletedSongsSettings, ExternalLyricsResult, ExternalLyricsStatus, Library, LyricsDocument, MoveTrackResult, Playlist, Progress, Track, TrackFileStatus, time } from './types';
import Player, { usePlayer } from './player';
import CollectionView, { PlaylistEditor } from './CollectionView';
import { Cover } from './ui';
import { TrackDrag } from './trackDrag';
import SoulseekSettings from './SoulseekSettings';
import DownloadManager, { useDownloadSession } from './DownloadManager';
import BulkLyricsIndexer from './BulkLyricsIndexer';
import LyricsView, { LyricsRenderer } from './LyricsView';
import TrackContextMenu from './TrackContextMenu';
import CollectionContextMenu, { type CollectionMenuTarget } from './CollectionContextMenu';
import { ContextMenu, MenuItem, MenuSection } from './ContextMenu';
import { enqueueGroup, homeAlbumContextTarget, openContextMenu, playlistAddAction } from './trackContextMenuModel';
import { lyricsForTrack, lyricsSourceHelp, lyricsSourceLabel } from './lyricsViewModel';
import { detailsLayoutClass, likeAction, setLiked, stableRandomAlbumIds } from './phase3d2Model';
import { downloadPageEntries, enterSearch, goBack, groupedSidebarOrder, homeCopy, initialNavigation, loadSidebarOrder, recentlyAddedTracks, reorderSidebar, rescanConfiguredFolders, saveSidebarOrder, searchScreen, sidebarGroup, sidebarGroups, visit, type NavigationPage, type SidebarId } from './navigationModel';
import MoveTrackDialog from './MoveTrackDialog';
import TrackMetadataDialog from './TrackMetadataDialog';
import {loadPlayerControlOrder,resetPlayerControlOrder,savePlayerControlOrder,type PlayerControlId} from './playerControlLayout';
import ResizeHandle from './ResizeHandle';
import { useResizableLayout } from './useResizableLayout';
import { Tooltip } from './Tooltip';
import {FullVisualizer} from './FullVisualizer';
import { addLibraryFoldersSnapshot, displayFolderPath, removeLibraryFolderSnapshot } from './librarySourcesModel';
import { applyCustomColor, clearCustomColor, readColorPalette, readCustomColor, saveColorPalette, saveCustomColor, type ColorPaletteId } from './colorPalette';

const empty:Library={tracks:[],folders:[],errors:[]};
function paletteStorage():Storage|null{try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}}
export default function App() {
  const [error,setError]=useState('');
  const report=useCallback((e:unknown)=>setError(String(e)),[]);
  const [library,setLibrary]=useState<Library>(empty),[libraryLoaded,setLibraryLoaded]=useState(false),[progress,setProgress]=useState<Progress|null>(null);
  const refresh=useCallback(async()=>{const result=await invoke<Library>('library');setLibrary(result);setLibraryLoaded(true);return result;},[]);
  const downloads=useDownloadSession(async result=>{if(result.status==='imported'||result.status==='already_in_library')await refresh();});
  const [navigation,setNavigation]=useState(initialNavigation);
  const [colorPalette,setColorPalette]=useState<ColorPaletteId>(()=>readColorPalette(paletteStorage()));
  const [customColor,setCustomColor]=useState(()=>readCustomColor(paletteStorage()));
  useLayoutEffect(()=>{
    const root=document.documentElement;
    root.dataset.colorPalette=colorPalette;
    if(colorPalette==='custom')applyCustomColor(root,customColor);else clearCustomColor(root);
    saveColorPalette(paletteStorage(),colorPalette);
    saveCustomColor(paletteStorage(),customColor);
  },[colorPalette,customColor]);
  const {page,query}=navigation.current;
  const [sidebarOrder,setSidebarOrder]=useState(()=>loadSidebarOrder(typeof localStorage==='undefined'?null:localStorage));
  const [playerControlOrder,setPlayerControlOrder]=useState(()=>loadPlayerControlOrder(typeof localStorage==='undefined'?null:localStorage));
  function updatePlayerControlOrder(order:PlayerControlId[]){setPlayerControlOrder(order);savePlayerControlOrder(typeof localStorage==='undefined'?null:localStorage,order);}
  function resetPlayerLayout(){setPlayerControlOrder(resetPlayerControlOrder(typeof localStorage==='undefined'?null:localStorage));}
  const sidebarDrag=useRef<{id:SidebarId;pointerId:number;x:number;y:number;moved:boolean}|null>(null),suppressNavClick=useRef(false);
  const [sidebarMenu,setSidebarMenu]=useState<({kind:'nav';id:SidebarId}|{kind:'playlist';id:number}|{kind:'source';folder:string})&{point:{x:number;y:number}}|null>(null);
  const [sidebarPlaylistEditor,setSidebarPlaylistEditor]=useState<Playlist|null>(null);
  const [soulseekEnabled,setSoulseekEnabled]=useState(false),[soulseekConfigured,setSoulseekConfigured]=useState(false),[settingsOpen,setSettingsOpen]=useState(false),[soulseekRequest,setSoulseekRequest]=useState<{id:number;query:string}|null>(null);
  const soulseekRequestId=useRef(0);
  const refreshSoulseek=useCallback(()=>invoke<{has_api_key:boolean}>('slskd_settings').then(s=>setSoulseekConfigured(s.has_api_key)).catch(()=>setSoulseekConfigured(false)),[]);
  useEffect(()=>{if(isTauri())void invoke<boolean>('slskd_enabled').then(enabled=>{setSoulseekEnabled(enabled);if(enabled)return refreshSoulseek();}).catch(()=>{});},[refreshSoulseek]);
  const [externalLyricsEnabled,setExternalLyricsEnabled]=useState(false),[externalLyricsChecked,setExternalLyricsChecked]=useState(false);
  useEffect(()=>{if(!isTauri()){setExternalLyricsChecked(true);return;}void invoke<boolean>('external_lyrics_enabled').then(setExternalLyricsEnabled).catch(()=>setExternalLyricsEnabled(false)).finally(()=>setExternalLyricsChecked(true));},[]);
  const [deletedSongsFolder,setDeletedSongsFolder]=useState<string|null>(null),[deleteTrack,setDeleteTrack]=useState<Track|null>(null),[deleteMode,setDeleteMode]=useState<'move'|'remove'>('move'),[deleteBusy,setDeleteBusy]=useState(false),[metadataTrack,setMetadataTrack]=useState<Track|null>(null);
  const [folderBusy,setFolderBusy]=useState<string|null>(null),[folderNotice,setFolderNotice]=useState(''),[folderError,setFolderError]=useState('');
  const [collections,setCollections]=useState<Collections>({likes:[],playlists:[],history:[]}),[collectionBusy,setCollectionBusy]=useState(false),[newPlaylist,setNewPlaylist]=useState(false),[toast,setToast]=useState('');
  const collectionJobs=useRef<Promise<unknown>>(Promise.resolve());
  const [foldersOpen,setFoldersOpen]=useState(false), [details,setDetails]=useState(false);
  const resizableLayout=useResizableLayout(details);
  const [lyrics,setLyrics]=useState<LyricsDocument|null>(null),[lyricsLoading,setLyricsLoading]=useState(false);
  const [lyricsTrackId,setLyricsTrackId]=useState<number|null>(null);
  const [lyricsFetchStatus,setLyricsFetchStatus]=useState<ExternalLyricsStatus|'idle'|'searching'>('idle');
  const [homeAlbumMenu,setHomeAlbumMenu]=useState<{target:CollectionMenuTarget;point:{x:number;y:number}}|null>(null),[playerTrackMenu,setPlayerTrackMenu]=useState<{track:Track;point:{x:number;y:number}}|null>(null);
  const [homeAlbumIds,setHomeAlbumIds]=useState<number[]>([]),previousPage=useRef<string|null>(null);
  const started=useRef(false), wasScanning=useRef(false), dialog=useRef<HTMLDialogElement>(null),deleteJob=useRef(false);
  useEffect(()=>{if(isTauri())void invoke<DeletedSongsSettings>('deleted_songs_settings').then(value=>setDeletedSongsFolder(value.folder)).catch(report);},[report]);
  const refreshCollections=useCallback(()=>{
    const task=collectionJobs.current.catch(()=>{}).then(()=>invoke<Collections>('collections')).then(result=>{setCollections(result);return result;});
    collectionJobs.current=task;return task;
  },[]);
  async function mutate(action:Record<string,unknown>){
    setCollectionBusy(true);
    const task=collectionJobs.current.catch(()=>{}).then(()=>invoke<Collections>('collection_action',{action})).then(result=>{setCollections(result);return result;});
    collectionJobs.current=task;
    try{return await task;}catch(e){report(e);return undefined;}finally{setCollectionBusy(false);}
  }
  const player=usePlayer(report,()=>void refreshCollections().catch(report),library.tracks,libraryLoaded);
  function requestMoveToTrash(track:Track){
    setHomeAlbumMenu(null);setPlayerTrackMenu(null);
    if(!deletedSongsFolder){setSettingsOpen(true);return;}
    setDeleteMode('move');setDeleteTrack(track);
  }
  function requestRemoveFromLibrary(track:Track){setHomeAlbumMenu(null);setPlayerTrackMenu(null);setDeleteMode('remove');setDeleteTrack(track);}
  function viewTrackMetadata(track:Track){setMetadataTrack(track);}
  async function confirmMoveToTrash(){
    if(!deleteTrack||deleteJob.current)return;
    deleteJob.current=true;
    setDeleteBusy(true);setError('');
    try{
      const trackId=deleteTrack.id;
      const result=deleteMode==='move'?await invoke<MoveTrackResult>('move_track_to_trash',{trackId}):null;
      if(deleteMode==='remove')await invoke('remove_missing_track',{trackId});
      setLibrary(value=>({...value,tracks:value.tracks.filter(track=>track.id!==trackId)}));
      setCollections(value=>({...value,likes:value.likes.filter(id=>id!==trackId),playlists:value.playlists.map(playlist=>({...playlist,entries:playlist.entries.filter(entry=>entry.track_id!==trackId)})),history:value.history.filter(entry=>entry.track_id!==trackId)}));
      await player.removeDeletedTrack(trackId);
      setDeleteTrack(null);if(player.current?.id===trackId)setDetails(false);setToast(result?`Перемещено в удалённые · ${result.destination_filename}`:'Трек убран из медиатеки');
    }catch(error){
      if(deleteMode==='move'&&deleteTrack){
        try{if(await invoke<TrackFileStatus>('track_file_status',{trackId:deleteTrack.id})==='missing'){setDeleteMode('remove');return;}}catch{/* retain the original move error */}
      }
      report(error);
    }
    finally{deleteJob.current=false;setDeleteBusy(false);}
  }
  function navigate(next:NavigationPage){setHomeAlbumMenu(null);setPlayerTrackMenu(null);setNavigation(state=>visit(state,next));}
  function back(){setHomeAlbumMenu(null);setPlayerTrackMenu(null);setNavigation(goBack);}
  function changeSearch(value:string){setNavigation(state=>enterSearch(state,value));}
  useEffect(()=>saveSidebarOrder(typeof localStorage==='undefined'?null:localStorage,sidebarOrder),[sidebarOrder]);
  useEffect(()=>{if(toast){const timer=setTimeout(()=>setToast(''),2600);return()=>clearTimeout(timer);}},[toast]);
  const scan=useCallback(async(folders:string[])=>{
    try {setError('');await invoke('scan_folders',{folders});wasScanning.current=true;setProgress(await invoke<Progress>('scan_status'));return true;}
    catch(e){report(e);return false;}
  },[report]);
  useEffect(()=>{
    if(started.current)return;started.current=true;
    if(!isTauri()){setError('Запустите приложение для компьютера командой npm run desktop. Импорт и воспроизведение доступны в окне Undertone.');return;}
    void Promise.all([refresh(),invoke<string|null>('default_scan_folder')]).then(([result,defaultFolder])=>{
      if(defaultFolder&&!result.folders.length)void scan([defaultFolder]);
    }).catch(report);
    void refreshCollections().catch(report);
  },[refresh,scan,report]);
  useEffect(()=>{
    if(!isTauri())return;
    let alive=true, polling=false, lastRefresh=0;
    const timer=setInterval(async()=>{
      if(polling)return;polling=true;
      try {
        const p=await invoke<Progress>('scan_status'); if(!alive)return;
        setProgress(p);
        if((wasScanning.current&&!p.running)||(p.running&&p.processed-lastRefresh>=40)) {await refresh();lastRefresh=p.processed;}
        if(wasScanning.current&&!p.running&&p.errors&&p.stage!=='Готово')report(p.stage);
        wasScanning.current=p.running;
      }catch(e){if(alive)report(e);}finally{polling=false;}
    },700);
    return()=>{alive=false;clearInterval(timer);};
  },[refresh,report]);
  useEffect(()=>{if(foldersOpen)dialog.current?.showModal();else dialog.current?.close();},[foldersOpen]);
  useEffect(()=>{
    if((!details&&page.kind!=='lyricsView')||!player.current||!isTauri()){setLyrics(null);setLyricsTrackId(null);setLyricsLoading(false);return;}
    let alive=true;const trackId=player.current.id;setLyrics(null);setLyricsTrackId(null);setLyricsFetchStatus('idle');setLyricsLoading(true);
    void invoke<LyricsDocument|null>('track_lyrics',{trackId})
      .then(value=>{if(alive){setLyrics(value);setLyricsTrackId(trackId);}})
      .catch(report).finally(()=>{if(alive)setLyricsLoading(false);});
    return()=>{alive=false;};
  },[details,page.kind,player.current?.id,report]);
  async function fetchLyrics(){
    if(!player.current||lyricsFetchStatus==='searching')return;
    setLyricsFetchStatus('searching');
    try{const trackId=player.current.id;const result=await invoke<ExternalLyricsResult>('fetch_track_lyrics',{trackId});setLyricsFetchStatus(result.status);if(result.lyrics){setLyrics(result.lyrics);setLyricsTrackId(trackId);}}
    catch(e){setLyricsFetchStatus('temporary_error');report(e);}
  }
  const albumGroups=useMemo(()=>{
    const map=new Map<number,Track[]>();for(const track of library.tracks){const group=map.get(track.album_id);if(group)group.push(track);else map.set(track.album_id,[track]);}return map;
  },[library.tracks]);
  const albums=useMemo(()=>[...albumGroups.values()].map(tracks=>tracks.find(track=>track.cover)||tracks[0]),[albumGroups]);
  useEffect(()=>{
    const entering=page.kind==='home'&&previousPage.current!=='home';
    if(page.kind==='home')setHomeAlbumIds(ids=>stableRandomAlbumIds(albums,ids,entering));
    previousPage.current=page.kind;
  },[page.kind,albums]);
  const homeAlbums=useMemo(()=>homeAlbumIds.map(id=>albumGroups.get(id)?.find(track=>track.cover)||albumGroups.get(id)?.[0]).filter((track):track is Track=>!!track),[homeAlbumIds,albumGroups]);
  const homeRecentTracks=useMemo(()=>recentlyAddedTracks(library.tracks).slice(0,6),[library.tracks]);
  const artistCount=useMemo(()=>new Set(library.tracks.map(t=>t.artist)).size,[library.tracks]);
  const totalHours=useMemo(()=>Math.round(library.tracks.reduce((a,t)=>a+t.duration,0)/3600),[library.tracks]);
  async function chooseFolder(){
    setFolderError('');setFolderNotice('');
    try{
      const selected=await open({directory:true,multiple:true,title:'Добавить папку с музыкой'});if(!selected)return;
      const paths=Array.isArray(selected)?selected:[selected];
      setLibrary(value=>addLibraryFoldersSnapshot(value,paths));
      if(await scan(paths))setFolderNotice(paths.length===1?'Папка с музыкой добавлена.':`Добавлено папок: ${paths.length}.`);
      else{setFolderError('Не удалось добавить выбранную папку. Проверьте доступ к ней.');await refresh().catch(()=>{});}
    }catch(e){setFolderError(String(e));}
  }
  async function removeFolder(folder:string){
    if(folderBusy)return;setFolderBusy(folder);setFolderError('');setFolderNotice('');
    try{
      const removed=await invoke<boolean>('remove_library_folder',{folder});
      if(removed){setLibrary(value=>removeLibraryFolderSnapshot(value,folder));setFolderNotice('Источник убран. Импортированные треки и файлы сохранены.');}
      else{await refresh();setFolderNotice('Источник уже был убран.');}
    }catch(e){setFolderError(String(e));}
    finally{setFolderBusy(null);}
  }
  function showLibrary(){navigate({kind:'library'});}
  function searchSoulseek(){const value=query.trim();if(!value)return;setSoulseekRequest({id:++soulseekRequestId.current,query:value});}
  const lyricsOpen=page.kind==='lyricsView',currentHasLyrics=!!player.current&&(player.current.has_lyrics||(lyricsTrackId===player.current.id&&!!lyrics));
  function toggleLyrics(){if(lyricsOpen)back();else if(currentHasLyrics)navigate({kind:'lyricsView'});}
  const visualizerOpen=page.kind==='visualizer';
  function toggleVisualizer(){if(visualizerOpen)back();else navigate({kind:'visualizer'});}
  const contentPage:NavigationPage=visualizerOpen?(navigation.back.at(-1)?.page??{kind:'home'}):page;
  const currentLiked=!!player.current&&collections.likes.includes(player.current.id);
  function toggleCurrentLike(){if(!player.current)return;const trackId=player.current.id,next=!currentLiked;setCollections(value=>({...value,likes:setLiked(value.likes,trackId,next)}));void mutate(likeAction(trackId,next)).then(result=>{if(!result)void refreshCollections().catch(report);});}
  const drag=useRef(new TrackDrag());
  const suppressClick=useRef(false),[dragging,setDragging]=useState(false);
  function cancelDrag(){drag.current.cancel();setDragging(false);}
  function navPointerDown(e:React.PointerEvent<HTMLElement>){if(e.button!==0)return;const item=(e.target as Element).closest<HTMLElement>('[data-nav-id]');if(item)sidebarDrag.current={id:item.dataset.navId as SidebarId,pointerId:e.pointerId,x:e.clientX,y:e.clientY,moved:false};}
  function navPointerMove(e:React.PointerEvent<HTMLElement>){const active=sidebarDrag.current;if(!active||active.pointerId!==e.pointerId)return;if(!active.moved&&Math.hypot(e.clientX-active.x,e.clientY-active.y)<6)return;active.moved=true;e.currentTarget.setPointerCapture(e.pointerId);const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-nav-id]')?.dataset.navId as SidebarId|undefined;if(target&&sidebarGroup(active.id)===sidebarGroup(target))setSidebarOrder(order=>reorderSidebar(order,active.id,target));}
  function navPointerEnd(e:React.PointerEvent<HTMLElement>){const active=sidebarDrag.current;if(!active||active.pointerId!==e.pointerId)return;sidebarDrag.current=null;if(active.moved){suppressNavClick.current=true;setTimeout(()=>{suppressNavClick.current=false;},0);}}
  const navItems:Record<SidebarId,{selected:boolean;action:()=>void;content:React.ReactNode}>={
    home:{selected:page.kind==='home',action:()=>navigate({kind:'home'}),content:<><House size={19}/><span className="nav-text">Главная</span></>},
    search:{selected:page.kind==='search',action:()=>navigate({kind:'search'}),content:<><Search size={19}/><span className="nav-text">Поиск</span></>},
    library:{selected:page.kind==='library',action:showLibrary,content:<><LibraryBig size={19}/><span className="nav-text">Медиатека</span><span className="nav-count">{library.tracks.length||'—'}</span></>},
    lyrics:{selected:page.kind==='lyrics'||page.kind==='lyricsView',action:()=>navigate({kind:'lyrics'}),content:<><MicVocal size={19}/><span className="nav-text">Тексты песен</span></>},
    recentlyAdded:{selected:page.kind==='recentlyAdded',action:()=>navigate({kind:'recentlyAdded'}),content:<><Clock3 size={19}/><span className="nav-text">Недавно добавлено</span></>},
    artists:{selected:['artists','artist'].includes(page.kind),action:()=>navigate({kind:'artists'}),content:<><Users size={19}/><span className="nav-text">Исполнители</span></>},
    albums:{selected:['albums','album'].includes(page.kind),action:()=>navigate({kind:'albums'}),content:<><Disc3 size={19}/><span className="nav-text">Альбомы</span></>},
    liked:{selected:page.kind==='liked',action:()=>navigate({kind:'liked'}),content:<><Heart size={19}/><span className="nav-text">Любимые треки</span><span className="nav-count">{collections.likes.length}</span></>},
    playlists:{selected:page.kind==='playlists'||page.kind==='playlist',action:()=>navigate({kind:'playlists'}),content:<><ListMusic size={19}/><span className="nav-text">Плейлисты</span></>},
    history:{selected:page.kind==='history',action:()=>navigate({kind:'history'}),content:<><Clock3 size={19}/><span className="nav-text">Недавно слушали</span></>},
    queue:{selected:page.kind==='queue',action:()=>navigate({kind:'queue'}),content:<><ListMusic size={19}/><span className="nav-text">Очередь</span><span className="nav-count">{player.queue.items.length-player.queue.cursor-1}</span></>},
    downloads:{selected:page.kind==='downloads',action:()=>navigate({kind:'downloads'}),content:<><Download size={19}/><span className="nav-text">Загрузки</span><span className="nav-count">{downloads.items.length}</span></>},
    settings:{selected:settingsOpen,action:()=>setSettingsOpen(true),content:<><SettingsIcon size={19}/><span className="nav-text">Настройки</span></>},
  };
  const navTooltips:Record<SidebarId,string>={home:'Главная',search:'Поиск музыки',library:'Локальная медиатека',lyrics:'Тексты песен и индексация',recentlyAdded:'Недавно добавленные треки',artists:'Исполнители',albums:'Альбомы',liked:'Любимые треки',playlists:'Плейлисты',history:'Недавно прослушано',queue:'Очередь воспроизведения',downloads:'Загрузки текущего сеанса',settings:'Настройки'};
  const sidebarPlaylist=sidebarMenu?.kind==='playlist'?collections.playlists.find(playlist=>playlist.id===sidebarMenu.id):null;
  const sidebarPlaylistTracks=sidebarPlaylist?sidebarPlaylist.entries.map(entry=>library.tracks.find(track=>track.id===entry.track_id)).filter((track):track is Track=>!!track):[];
  const sidebarQuickTracks=sidebarMenu?.kind==='nav'&&['library','recentlyAdded','history','liked','queue'].includes(sidebarMenu.id)?(()=>{const byId=new Map(library.tracks.map(track=>[track.id,track]));switch(sidebarMenu.id){case 'library':return library.tracks;case 'recentlyAdded':return recentlyAddedTracks(library.tracks);case 'history':return collections.history.map(entry=>byId.get(entry.track_id)).filter((track):track is Track=>!!track);case 'liked':return collections.likes.map(id=>byId.get(id)).filter((track):track is Track=>!!track);case 'queue':return player.queue.items.slice(player.queue.cursor+1).map(entry=>entry.track);default:return [];}})():[];
  return <div ref={resizableLayout.root} style={resizableLayout.style} data-color-palette={colorPalette} className={`app-shell ${detailsLayoutClass(details)} ${dragging?'dragging-track':''}`}
    onDragStartCapture={e=>e.preventDefault()}
    onPointerDownCapture={e=>{
      if(e.button!==0||player.busy||collectionBusy||(e.target as Element).closest('.artist-link'))return;
      const row=(e.target as Element).closest<HTMLElement>('[data-track-id]');
      if(row)drag.current.begin(Number(row.dataset.trackId),e.pointerId,e.clientX,e.clientY);
    }}
    onPointerMoveCapture={e=>{
      if(drag.current.move(e.pointerId,e.clientX,e.clientY)){e.currentTarget.setPointerCapture(e.pointerId);setDragging(true);setToast('Перетащите трек на плейлист');}
      if(dragging)e.preventDefault();
    }}
    onPointerUpCapture={e=>{
      const trackId=drag.current.finish(e.pointerId);setDragging(false);
      if(trackId===null)return;
      suppressClick.current=true;setTimeout(()=>{suppressClick.current=false;},0);
      const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-playlist-id]');
      const id=Number(target?.dataset.playlistId);
      if(collections.playlists.some(p=>p.id===id))void mutate({type:'add_tracks',id,track_ids:[trackId]}).then(result=>{if(result)setToast('Трек добавлен в плейлист');});
    }}
    onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}
    onKeyDownCapture={e=>{if(e.key==='Escape')cancelDrag();}}
    onClickCapture={e=>{if(suppressClick.current){e.preventDefault();e.stopPropagation();}}}>

    <aside className="sidebar">
      <div className="sidebar-scroll-content">
      <a className="brand" href="#" onClick={e=>{e.preventDefault();navigate({kind:'home'});}}><span className="brand-mark"><AudioLines size={23}/></span>undertone<span className="brand-dot">.</span></a>
      <nav aria-label="Главная навигация" onPointerDown={navPointerDown} onPointerMove={navPointerMove} onPointerUp={navPointerEnd} onPointerCancel={navPointerEnd} onClickCapture={e=>{if(suppressNavClick.current){e.preventDefault();e.stopPropagation();}}}>
        {groupedSidebarOrder(sidebarOrder).map((ids,index)=><div className="sidebar-nav-group" key={sidebarGroups[index].label}><div className="nav-label">{sidebarGroups[index].label}</div>{ids.map(id=><Tooltip key={id} content={navTooltips[id]}><button data-nav-id={id} className={navItems[id].selected?'selected':''} onClick={navItems[id].action} onContextMenu={event=>openContextMenu(event,point=>setSidebarMenu({kind:'nav',id,point}))}>{navItems[id].content}</button></Tooltip>)}</div>)}
        <div className="sidebar-settings"><Tooltip content={navTooltips.settings}><button data-nav-id="settings" className={`settings-nav-item ${navItems.settings.selected?'selected':''}`} onClick={navItems.settings.action} onContextMenu={event=>openContextMenu(event,point=>setSidebarMenu({kind:'nav',id:'settings',point}))}>{navItems.settings.content}</button></Tooltip></div>
      </nav>
      <div className="sidebar-playlists"><div className="sources-label nav-label">ПЛЕЙЛИСТЫ <button className="icon-button" aria-label="Новый плейлист" onClick={()=>setNewPlaylist(true)}><Plus size={17}/></button></div>{collections.playlists.map(p=><button className="playlist-link" key={p.id} onClick={()=>navigate({kind:'playlist',id:p.id})} onContextMenu={event=>openContextMenu(event,point=>setSidebarMenu({kind:'playlist',id:p.id,point}))} data-playlist-id={p.id}><ListMusic size={15}/><span>{p.name}</span><small>{p.entries.length}</small></button>)}</div>
      <div className="sidebar-divider"/>
      <div className="nav-label sources-label">ИСТОЧНИКИ <button className="icon-button" aria-label="Добавить папку" onClick={()=>setFoldersOpen(true)}><FolderPlus size={17}/></button></div>
      {library.folders.map(folder=><button className="source" key={folder} title={folder} onClick={()=>setFoldersOpen(true)} onContextMenu={event=>openContextMenu(event,point=>setSidebarMenu({kind:'source',folder,point}))}><Folder size={19}/><span>{folder.split(/[\\/]/).filter(Boolean).at(-1)}<small>Локальная папка</small></span><span className="status-dot"/></button>)}
      {!library.folders.length&&<button className="source" onClick={()=>setFoldersOpen(true)} onContextMenu={event=>openContextMenu(event,point=>setSidebarMenu({kind:'source',folder:'',point}))}><FolderPlus size={19}/><span>Добавить музыку</span></button>}
      </div>
      <div className="offline-status" aria-label="Локальный плеер, версия 0.2.1" title="Версия 0.2.1">
        <span className="offline-status-icon" aria-hidden="true"><AudioLines size={17}/></span>
        <span className="offline-status-copy">
          <strong className="offline-status-label">Локальный плеер</strong>
          <span className="offline-status-version"><span className="status-dot"/>Версия 0.2.1</span>
        </span>
      </div>
    </aside>
    <ResizeHandle axis="horizontal" label="Изменить ширину боковой панели" className="sidebar-resize" {...resizableLayout.handle('left')}/>
    <main>
      <header className="topbar"><button className="icon-button back-button" aria-label="Назад" disabled={!navigation.back.length} onClick={back}><ArrowLeft size={18}/></button><div className="breadcrumb"><strong>{({home:'Главная',search:'Поиск',library:'Медиатека',recentlyAdded:'Недавно добавлено',artists:'Исполнители',artist:'Исполнитель',albums:'Альбомы',album:'Альбом',liked:'Любимые треки',playlists:'Плейлисты',playlist:'Плейлист',history:'Недавно слушали',queue:'Очередь',downloads:'Загрузки',lyrics:'Тексты песен',lyricsView:'Текст песни',visualizer:'Визуализатор'})[page.kind]}</strong></div><span className="local-badge"><span className="status-dot"/>Локальная библиотека</span></header>
      {error&&<div className="error" role="alert"><Info size={18}/><span>{error}</span><button className="icon-button" aria-label="Закрыть ошибку" onClick={()=>setError('')}><X size={18}/></button></div>}
      {progress?.running&&<div className="scan-banner" role="status"><RefreshCw className="spinning" size={17}/><span>{progress.stage} <strong>{progress.processed} / {progress.total||'…'}</strong></span><progress max={progress.total||1} value={progress.processed}/><small>{progress.current||'Ищем вашу музыку…'}</small></div>}
      <div className="visualizer-preserved-page" hidden={visualizerOpen}>
      <BulkLyricsIndexer available={externalLyricsEnabled} checked={externalLyricsChecked} visible={contentPage.kind==='lyrics'&&!visualizerOpen}/>
      {contentPage.kind==='home'?<div className="home-content">
        <div className="page-heading"><h1>{homeCopy.title}</h1><div className="home-actions"><Tooltip content="Обновить треки из добавленных папок"><button className="subtle-button" disabled={!!progress?.running||!library.folders.length} onClick={()=>void rescanConfiguredFolders(library.folders,scan)}><RefreshCw size={17}/>Пересканировать папки</button></Tooltip><button className="subtle-button" onClick={()=>setFoldersOpen(true)}><FolderPlus size={17}/>Добавить папку</button><button className="primary-button" disabled={!library.tracks.length||player.busy} onClick={()=>void player.play(library.tracks[0],library.tracks)}><Play size={17} fill="currentColor"/>Слушать</button></div></div>
        <div className="stats-strip"><span><Music2 size={18}/><strong>{library.tracks.length.toLocaleString('ru')}</strong>треков</span><i/><span><Disc3 size={18}/><strong>{albums.length}</strong>альбомов</span><i/><span><AudioLines size={18}/><strong>{artistCount}</strong>исполнителей</span><span className="hours">{totalHours} ч</span></div>
        {progress&&!progress.running&&progress.total>0&&<div className="scan-result" role="status"><span>Проверено <strong>{progress.processed}</strong></span><span>Добавлено <strong>{progress.imported}</strong></span><span>Пропущено <strong>{progress.skipped}</strong></span><span>Ошибок <strong>{progress.errors}</strong></span></div>}
        <section className="album-section"><div className="section-heading"><h2>Альбомы</h2><button className="text-button" onClick={showLibrary}>Все треки <ArrowRight size={16}/></button></div>
          {albums.length?<div className="album-grid">{homeAlbums.map(t=><button className="album-card" key={t.album_id} onClick={()=>navigate({kind:'album',id:t.album_id})} onContextMenu={event=>openContextMenu(event,point=>setHomeAlbumMenu({target:homeAlbumContextTarget(t.album_id,t.album,albumGroups.get(t.album_id)||[]),point}))}><div className="album-art"><Cover track={t}/><span className="album-arrow"><ArrowUpRight size={20}/></span></div><strong title={t.album}>{t.album}</strong><small>{t.album_artist}{t.year?` · ${t.year}`:''}</small></button>)}</div>:<div className="empty-state"><Disc3 size={42}/><h3>{progress?.running?'Сканирование…':homeCopy.emptyTitle}</h3><p>{progress?.running?'Чтение метаданных файлов.':homeCopy.emptyHelp}</p><button className="subtle-button" onClick={()=>setFoldersOpen(true)}>Выбрать папку</button></div>}
        </section>
        {!!homeRecentTracks.length&&<section className="home-recent-section"><div className="section-heading"><div><h2>Недавно добавлено</h2><p>Свежие треки из вашей медиатеки</p></div><button className="text-button" onClick={()=>navigate({kind:'recentlyAdded'})}>Все треки <ArrowRight size={16}/></button></div><div className="home-recent-grid">{homeRecentTracks.map((track,index)=><button className="home-recent-track" key={track.id} onClick={()=>void player.play(track,homeRecentTracks,index)} title={`Слушать ${track.title} — ${track.artist}`}><Cover track={track} size="small"/><span><strong>{track.title}</strong><small>{track.artist}</small></span><Play className="home-recent-play" size={15} fill="currentColor"/></button>)}</div></section>}
      </div>:contentPage.kind==='lyricsView'?<LyricsView track={player.current} lyrics={lyricsForTrack(player.current?.id??null,lyricsTrackId,lyrics)} loading={lyricsLoading} position={player.status.position} onSeek={seconds=>void player.command({type:'seek',seconds})}/>:contentPage.kind==='lyrics'?null:contentPage.kind==='downloads'?<DownloadManager embedded items={downloadPageEntries(downloads.items)} error={downloads.error} onCancel={operationId=>void downloads.session.cancel(operationId)} onDismissError={()=>downloads.session.clearError()}/>:contentPage.kind!=='search'&&contentPage.kind!=='visualizer'?<CollectionView page={contentPage} query="" onQueryChange={changeSearch} library={library} collections={collections} mutate={mutate} busy={collectionBusy} player={player} navigate={navigate} onScan={()=>void scan(library.folders)} scanning={!!progress?.running} notice={setToast} trashAvailable={!!deletedSongsFolder} onMoveToTrash={requestMoveToTrash} onRemoveFromLibrary={requestRemoveFromLibrary} onViewMetadata={viewTrackMetadata} soulseek={{enabled:soulseekEnabled,configured:soulseekConfigured,request:soulseekRequest,onSearch:searchSoulseek,onDownload:result=>{navigate({kind:'downloads'});void downloads.session.start(result);},downloadState:result=>downloads.session.actionState(result)}}/>:null}
      {(()=>{const search=searchScreen(navigation);return <div className="search-page-host" hidden={contentPage.kind!=='search'}><CollectionView page={{kind:'search'}} query={search.query} onQueryChange={changeSearch} library={library} collections={collections} mutate={mutate} busy={collectionBusy} player={player} navigate={navigate} onScan={()=>void scan(library.folders)} scanning={!!progress?.running} notice={setToast} trashAvailable={!!deletedSongsFolder} onMoveToTrash={requestMoveToTrash} onRemoveFromLibrary={requestRemoveFromLibrary} onViewMetadata={viewTrackMetadata} soulseek={{enabled:soulseekEnabled,configured:soulseekConfigured,request:soulseekRequest,onSearch:searchSoulseek,onDownload:result=>{navigate({kind:'downloads'});void downloads.session.start(result);},downloadState:result=>downloads.session.actionState(result)}}/></div>;})()}
      </div>
      {visualizerOpen&&<FullVisualizer track={player.current} playing={player.status.playing} onClose={back}/>} 
    </main>
    <ResizeHandle axis="vertical" label="Изменить высоту плеера" className="player-resize" {...resizableLayout.handle('player')}/>
    <Player player={player} onDetails={()=>setDetails(v=>!v)} onQueue={()=>navigate({kind:"queue"})} onLyrics={toggleLyrics} onVisualizer={toggleVisualizer} visualizerOpen={visualizerOpen} lyricsOpen={lyricsOpen} lyricsAvailable={currentHasLyrics} liked={currentLiked} onToggleLike={toggleCurrentLike} onTrackContextMenu={(track,point)=>setPlayerTrackMenu({track,point})} onMoveToTrash={requestMoveToTrash} trashAvailable={!!deletedSongsFolder} controlOrder={playerControlOrder} onControlOrderChange={updatePlayerControlOrder}/>
    {toast&&<div className="toast" role="status"><Check size={16}/>{toast}</div>}
    {sidebarMenu?.kind==='nav'&&<ContextMenu point={sidebarMenu.point} label={`Действия: ${navTooltips[sidebarMenu.id]}`} onClose={()=>setSidebarMenu(null)} onNotice={setToast}>{run=><><MenuSection><MenuItem icon={<ArrowRight size={16}/>} onClick={()=>void run(navItems[sidebarMenu.id].action)}>Открыть</MenuItem></MenuSection>
      {['library','recentlyAdded','history','liked','queue'].includes(sidebarMenu.id)&&<MenuSection><MenuItem icon={<Play size={16}/>} disabled={!sidebarQuickTracks.length||player.busy} onClick={()=>void run(()=>sidebarMenu.id==='queue'?player.jump(player.queue.cursor+1):player.play(sidebarQuickTracks[0],sidebarQuickTracks))}>Воспроизвести список</MenuItem>{sidebarMenu.id!=='queue'&&<MenuItem icon={<ListMusic size={16}/>} disabled={!sidebarQuickTracks.length||player.busy} onClick={()=>void run(()=>enqueueGroup(sidebarQuickTracks,false,player.enqueue),'Добавлено в очередь')}>Добавить список в очередь</MenuItem>}</MenuSection>}
      {sidebarMenu.id==='queue'&&<MenuSection><MenuItem icon={<X size={16}/>} disabled={!sidebarQuickTracks.length||player.busy} onClick={()=>void run(player.clearUpcoming)}>Очистить следующие</MenuItem></MenuSection>}
      {['home','library','recentlyAdded','artists','albums'].includes(sidebarMenu.id)&&<MenuSection><MenuItem icon={<RefreshCw size={16}/>} disabled={!library.folders.length||!!progress?.running} onClick={()=>void run(()=>scan(library.folders))}>Пересканировать папки</MenuItem><MenuItem icon={<FolderPlus size={16}/>} onClick={()=>void run(()=>setFoldersOpen(true))}>Добавить папку</MenuItem></MenuSection>}
      {sidebarMenu.id==='search'&&<MenuSection><MenuItem icon={<Search size={16}/>} onClick={()=>void run(()=>setNavigation(state=>enterSearch(state,'')))}>Новый поиск</MenuItem></MenuSection>}
      {sidebarMenu.id==='lyrics'&&<MenuSection><MenuItem icon={<MicVocal size={16}/>} disabled={!currentHasLyrics} onClick={()=>void run(()=>navigate({kind:'lyricsView'}))}>Текст текущего трека</MenuItem></MenuSection>}
      {sidebarMenu.id==='playlists'&&<MenuSection><MenuItem icon={<Plus size={16}/>} onClick={()=>void run(()=>setNewPlaylist(true))}>Создать плейлист</MenuItem></MenuSection>}
      {sidebarMenu.id==='settings'&&<MenuSection><MenuItem icon={<RefreshCw size={16}/>} onClick={()=>void run(resetPlayerLayout,'Расположение плеера сброшено')}>Сбросить панель плеера</MenuItem></MenuSection>}
    </>}</ContextMenu>}
    {sidebarMenu?.kind==='playlist'&&sidebarPlaylist&&<ContextMenu point={sidebarMenu.point} label={`Действия с плейлистом ${sidebarPlaylist.name}`} onClose={()=>setSidebarMenu(null)} onNotice={setToast}>{run=><><MenuSection><MenuItem icon={<ArrowRight size={16}/>} onClick={()=>void run(()=>navigate({kind:'playlist',id:sidebarPlaylist.id}))}>Открыть плейлист</MenuItem><MenuItem icon={<Play size={16}/>} disabled={!sidebarPlaylistTracks.length||player.busy} onClick={()=>void run(()=>player.play(sidebarPlaylistTracks[0],sidebarPlaylistTracks,0,{kind:'playlist',playlistId:sidebarPlaylist.id}))}>Воспроизвести</MenuItem><MenuItem icon={<ListMusic size={16}/>} disabled={!sidebarPlaylistTracks.length||player.busy} onClick={()=>void run(()=>enqueueGroup(sidebarPlaylistTracks,false,player.enqueue),'Добавлено в очередь')}>Добавить в очередь</MenuItem></MenuSection><MenuSection><MenuItem icon={<Pencil size={16}/>} onClick={()=>void run(()=>setSidebarPlaylistEditor(sidebarPlaylist))}>Изменить плейлист</MenuItem></MenuSection></>}</ContextMenu>}
    {sidebarMenu?.kind==='source'&&<ContextMenu point={sidebarMenu.point} label="Действия с музыкальной папкой" onClose={()=>setSidebarMenu(null)} onNotice={setToast}>{run=><><MenuSection><MenuItem icon={<Folder size={16}/>} onClick={()=>void run(()=>setFoldersOpen(true))}>Управление папками</MenuItem><MenuItem icon={<RefreshCw size={16}/>} disabled={!sidebarMenu.folder||!!progress?.running} onClick={()=>void run(()=>scan([sidebarMenu.folder]))}>Пересканировать папку</MenuItem></MenuSection>{sidebarMenu.folder&&<MenuSection separated><MenuItem destructive icon={<Unplug size={16}/>} disabled={folderBusy!==null||!!progress?.running} onClick={()=>void run(()=>removeFolder(sidebarMenu.folder))}>Убрать источник</MenuItem></MenuSection>}</>}</ContextMenu>}
    {settingsOpen&&<SoulseekSettings soulseekEnabled={soulseekEnabled} deletedSongsFolder={deletedSongsFolder} onDeletedSongsFolder={setDeletedSongsFolder} onResetPlayerLayout={resetPlayerLayout} colorPalette={colorPalette} onColorPaletteChange={setColorPalette} customColor={customColor} onCustomColorChange={color=>{setCustomColor(color);setColorPalette('custom');}} onClose={()=>{setSettingsOpen(false);if(soulseekEnabled)void refreshSoulseek();}}/>}
    {newPlaylist&&<PlaylistEditor onClose={()=>setNewPlaylist(false)} mutate={mutate} busy={collectionBusy} onSaved={id=>navigate({kind:"playlist",id})}/>}
    {sidebarPlaylistEditor&&<PlaylistEditor playlist={sidebarPlaylistEditor} onClose={()=>setSidebarPlaylistEditor(null)} mutate={mutate} busy={collectionBusy} onSaved={id=>navigate({kind:'playlist',id})}/>}
    {homeAlbumMenu&&<CollectionContextMenu target={homeAlbumMenu.target} point={homeAlbumMenu.point} busy={collectionBusy||player.busy} playlists={collections.playlists} onPlay={()=>player.play(homeAlbumMenu.target.tracks[0],homeAlbumMenu.target.tracks)} onPlayNext={()=>enqueueGroup(homeAlbumMenu.target.tracks,true,player.enqueue)} onAddToQueue={()=>enqueueGroup(homeAlbumMenu.target.tracks,false,player.enqueue)} onAddToPlaylist={playlist=>mutate(playlistAddAction(playlist.id,homeAlbumMenu.target.tracks))} onRename={()=>{}} onDelete={()=>{}} onNotice={setToast} onClose={()=>setHomeAlbumMenu(null)}/>}
    {playerTrackMenu&&<TrackContextMenu track={playerTrackMenu.track} point={playerTrackMenu.point} busy={collectionBusy||player.busy} liked={collections.likes.includes(playerTrackMenu.track.id)} playlists={collections.playlists} trashAvailable={!!deletedSongsFolder} onPlayNext={()=>player.enqueue(playerTrackMenu.track,true)} onAddToQueue={()=>player.enqueue(playerTrackMenu.track)} onAddToLiked={()=>mutate({type:'like',track_id:playerTrackMenu.track.id,liked:true})} onAddToPlaylist={playlist=>mutate(playlistAddAction(playlist.id,[playerTrackMenu.track]))} onMoveToTrash={requestMoveToTrash} onRemoveFromLibrary={requestRemoveFromLibrary} onViewMetadata={viewTrackMetadata} onNotice={setToast} onClose={()=>setPlayerTrackMenu(null)}/>}
    {deleteTrack&&(deleteMode==='remove'||deletedSongsFolder)&&<MoveTrackDialog track={deleteTrack} destination={deletedSongsFolder} mode={deleteMode} busy={deleteBusy} onCancel={()=>{if(!deleteBusy)setDeleteTrack(null);}} onConfirm={()=>void confirmMoveToTrash()}/>}
    {metadataTrack&&<TrackMetadataDialog track={metadataTrack} onClose={()=>setMetadataTrack(null)}/>}
    {details&&player.current&&<><ResizeHandle axis="horizontal" label="Изменить ширину панели трека" className="details-resize" {...resizableLayout.handle('right')}/><aside className="details-panel"><div className="section-heading"><h3>Сейчас играет</h3><button className="icon-button" aria-label="Закрыть информацию" onClick={()=>setDetails(false)}><X size={20}/></button></div><Cover track={player.current}/><h2>{player.current.title}</h2><p>{player.current.artist}</p><dl>{Object.entries({'Альбом':player.current.album,'Исполнитель альбома':player.current.album_artist,'Жанр':player.current.genre||'Не указан','Год':player.current.year||'Не указан','Номер трека':player.current.track_number||'—','Формат':player.current.format,'Длительность':time(player.current.duration)}).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><section className="panel-lyrics"><div className="panel-lyrics-heading"><h3>Текст песни</h3>{lyrics&&<Tooltip content={lyricsSourceHelp(lyrics.origin)}><small className="lyrics-source-badge">{lyricsSourceLabel(lyrics.origin)}</small></Tooltip>}</div><LyricsRenderer compact trackId={player.current.id} lyrics={lyricsForTrack(player.current.id,lyricsTrackId,lyrics)} loading={lyricsLoading} position={player.status.position} onSeek={seconds=>void player.command({type:'seek',seconds})}/>{!lyricsLoading&&!lyrics&&externalLyricsEnabled&&<button className="subtle-button lyrics-fetch" disabled={lyricsFetchStatus==='searching'} onClick={()=>void fetchLyrics()}>{lyricsFetchStatus==='searching'?'Поиск текста…':'Найти текст'}</button>}</section><small className="file-path">{player.current.path}</small></aside></>}
    <dialog ref={dialog} className="folder-dialog music-folders-dialog" onCancel={()=>setFoldersOpen(false)} onClick={e=>{if(e.target===dialog.current)setFoldersOpen(false);}}><div className="dialog-body">
      <div className="section-heading"><div><h2>Папки с музыкой</h2><p>Undertone сканирует добавленные папки и их вложенные каталоги.</p></div><button className="icon-button" aria-label="Закрыть список папок" onClick={()=>setFoldersOpen(false)}><X size={20}/></button></div>
      {folderError&&<div className="source-message error-message" role="alert"><Info size={17}/><span>{folderError}</span></div>}
      {folderNotice&&<div className="source-message success-message" role="status"><Check size={17}/><span>{folderNotice}</span></div>}
      {library.folders.length?<div className="folder-list source-list">{library.folders.map(folder=><div className="source-card" key={folder}><span className="source-card-icon"><Folder size={20}/></span><span className="source-card-copy"><strong title={displayFolderPath(folder)}>{displayFolderPath(folder)}</strong><small><span className={`source-status-dot ${progress?.running?'scanning':''}`}/>{progress?.running?'Сканирование…':'Подключено'}</small></span><button className="source-remove" disabled={folderBusy!==null||!!progress?.running} onClick={()=>void removeFolder(folder)}><Unplug size={15}/>{folderBusy===folder?'Удаление…':'Убрать'}</button></div>)}</div>:<div className="source-empty"><FolderPlus size={30}/><h3>Папки с музыкой ещё не добавлены</h3><p>Добавьте папку, чтобы просканировать локальную медиатеку.</p></div>}
      <div className="source-actions"><button className="primary-button" disabled={!!progress?.running||folderBusy!==null} onClick={()=>void chooseFolder()}><FolderPlus size={18}/>Добавить папку с музыкой</button><button className="subtle-button" disabled={!!progress?.running||!library.folders.length||folderBusy!==null} onClick={()=>void scan(library.folders)}><RefreshCw size={16}/>Пересканировать папки</button></div>
      {library.errors.length>0&&<details className="scan-errors source-errors"><summary>Ошибок файлов: {library.errors.length}</summary>{library.errors.map(e=><p key={e.path}><strong>{displayFolderPath(e.path)}</strong><br/>{e.message}</p>)}</details>}
      <div className="folder-note"><HardDrive size={16}/>Удаление источника не удаляет музыкальные файлы и уже добавленные треки.</div>
    </div></dialog>
  </div>;
}
