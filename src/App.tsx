import {notify,feedbackError} from './feedback';
import {createPortal} from 'react-dom';
import { exportPlaylist } from './playlistExport';
import DesktopHome from "./DesktopHome";
import ListeningDialog from "./ListeningDialog";
import NowPlayingPanel from './NowPlayingPanel';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { AudioLines, House, LibraryBig, FolderPlus, Search, ArrowRight, ArrowLeft, Play, RefreshCw, X, Folder, Disc3, Info, Users, Heart, ListMusic, Clock3, Plus, Download, MicVocal, Settings as SettingsIcon, Unplug, Pencil } from 'lucide-react';
import { Collections, DeletedSongsSettings, ExternalLyricsResult, ExternalLyricsStatus, Library, LyricsDocument, MoveTrackResult, Playlist, Progress, Track, TrackFileStatus } from './types';
import Player, { usePlayer } from './player';
import CollectionView, { PlaylistEditor } from './CollectionView';
import { Divider, Button, IconButton } from './ui';
import { AppShell, Sidebar, MainContent, PlayerArea, SidebarTools, useSidebarCollapse } from './AppShell';
import { TrackDrag } from './trackDrag';
import AppSettings from './AppSettings';
import BulkLyricsIndexer from './BulkLyricsIndexer';
import LyricsView from './LyricsView';
import {lyricsFailureFromError,lyricsFailureFromResult,type LyricsFailure} from './lyricsViewModel';
import TrackContextMenu from './TrackContextMenu';
import type {TrackListContext} from './TrackList';
import CollectionContextMenu, { type CollectionMenuTarget } from './CollectionContextMenu';
import { ContextMenu, MenuItem, MenuSection } from './ContextMenu';
import { enqueueGroup, openContextMenu, playlistAddAction } from './trackContextMenuModel';
import { lyricsForTrack } from './lyricsViewModel';
import { likeAction, setLiked, stableRandomAlbumIds } from './phase3d2Model';
import { enterSearch, goBack, initialNavigation, loadSidebarOrder, recentlyAddedTracks, reorderSidebar, rescanConfiguredFolders, saveSidebarOrder, searchScreen, sidebarGroup, visit, type NavigationPage, type SidebarId } from './navigationModel';
import MusicFoldersDialog from './MusicFoldersDialog';
import MoveTrackDialog from './MoveTrackDialog';
import TrackMetadataDialog from './TrackMetadataDialog';
import {loadPlayerControlOrder,loadPlayerControlPositions,resetPlayerControlOrder,resetPlayerControlPositions,savePlayerControlPositions,type PlayerControlPositions} from './playerControlLayout';
import ResizeHandle from './ResizeHandle';
import { useResizableLayout } from './useResizableLayout';
import { Tooltip } from './Tooltip';
import {FullVisualizer} from './FullVisualizer';
import { addLibraryFoldersSnapshot, removeLibraryFolderSnapshot } from './librarySourcesModel';
import { applyCustomColor, clearCustomColor, readColorPalette, readCustomColor, saveColorPalette, saveCustomColor, type ColorPaletteId } from './colorPalette';

const empty:Library={tracks:[],folders:[],errors:[]};
function paletteStorage():Storage|null{try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}}
export default function App() {
  const sidebar = useSidebarCollapse();
  const [error,setError]=useState('');
  const report=useCallback((e:unknown)=>setError(String(e)),[]);
  const [library,setLibrary]=useState<Library>(empty),[libraryLoaded,setLibraryLoaded]=useState(false),[progress,setProgress]=useState<Progress|null>(null);
  const refresh=useCallback(async()=>{const result=await invoke<Library>('library');setLibrary(result);setLibraryLoaded(true);return result;},[]);
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
  const {page}=navigation.current;
  const [sidebarOrder,setSidebarOrder]=useState(()=>loadSidebarOrder(typeof localStorage==='undefined'?null:localStorage));
  const [playerControlOrder,setPlayerControlOrder]=useState(()=>loadPlayerControlOrder(typeof localStorage==='undefined'?null:localStorage));
  const [playerControlPositions,setPlayerControlPositions]=useState(()=>loadPlayerControlPositions(typeof localStorage==='undefined'?null:localStorage));
  function updatePlayerControlPositions(positions:PlayerControlPositions){setPlayerControlPositions(positions);savePlayerControlPositions(typeof localStorage==='undefined'?null:localStorage,positions);}
  function resetPlayerLayout(){const storage=typeof localStorage==='undefined'?null:localStorage;setPlayerControlOrder(resetPlayerControlOrder(storage));setPlayerControlPositions(resetPlayerControlPositions(storage));}
  const sidebarDrag=useRef<{id:SidebarId;pointerId:number;x:number;y:number;moved:boolean}|null>(null),suppressNavClick=useRef(false);
  const [sidebarMenu,setSidebarMenu]=useState<({kind:'nav';id:SidebarId}|{kind:'playlist';id:number}|{kind:'source';folder:string})&{point:{x:number;y:number}}|null>(null);
  const [sidebarPlaylistEditor,setSidebarPlaylistEditor]=useState<Playlist|null>(null);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [searchFocusRequest,setSearchFocusRequest]=useState(0);
  const searchCommandReturn=useRef<{anchor:HTMLElement|null;opened:boolean;page:NavigationPage}|null>(null);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key.toLowerCase()!=='k'||!(event.ctrlKey||event.metaKey)||event.altKey||event.shiftKey||event.repeat||event.isComposing||event.keyCode===229)return;const active=document.activeElement as HTMLElement|null;if(document.querySelector('dialog[open]')||active?.isContentEditable)return;if(active?.matches('input,textarea,select')&&!active.closest('.search-surface,.home-search-entry'))return;event.preventDefault();setHomeAlbumMenu(null);setPlayerTrackMenu(null);if(page.kind!=='search')searchCommandReturn.current={anchor:active,opened:true,page};setNavigation(state=>visit(state,{kind:'search'}));setSearchFocusRequest(value=>value+1);};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[page.kind]);
  function escapeSearch(){const previous=searchCommandReturn.current;if(!previous?.opened)return;searchCommandReturn.current=null;setNavigation(goBack);requestAnimationFrame(()=>{if(previous.anchor?.isConnected)previous.anchor.focus({preventScroll:true});else{const kind=previous.page.kind,id=kind==='album'?'albums':kind==='artist'?'library':kind==='playlist'?'playlists':kind;document.querySelector<HTMLElement>(`[data-nav-id="${id}"]`)?.focus({preventScroll:true});}});}
  const [externalLyricsEnabled,setExternalLyricsEnabled]=useState(false),[externalLyricsChecked,setExternalLyricsChecked]=useState(false);
  useEffect(()=>{if(!isTauri()){setExternalLyricsChecked(true);return;}void invoke<boolean>('external_lyrics_enabled').then(setExternalLyricsEnabled).catch(()=>setExternalLyricsEnabled(false)).finally(()=>setExternalLyricsChecked(true));},[]);
  const [deletedSongsFolder,setDeletedSongsFolder]=useState<string|null>(null),[deleteTrack,setDeleteTrack]=useState<Track|null>(null),[deleteMode,setDeleteMode]=useState<'move'|'remove'>('move'),[deleteBusy,setDeleteBusy]=useState(false),[metadataTrack,setMetadataTrack]=useState<Track|null>(null);
  const [folderBusy,setFolderBusy]=useState<string|null>(null),[folderNotice,setFolderNotice]=useState(''),[folderError,setFolderError]=useState('');
  const [collections,setCollections]=useState<Collections>({likes:[],playlists:[],history:[]}),[collectionBusy,setCollectionBusy]=useState(false),[newPlaylist,setNewPlaylist]=useState(false);
  const collectionJobs=useRef<Promise<unknown>>(Promise.resolve());
  const [foldersOpen,setFoldersOpen]=useState(false), [details,setDetails]=useState(false);
  const resizableLayout=useResizableLayout();
  const [lyrics,setLyrics]=useState<LyricsDocument|null>(null),[lyricsLoading,setLyricsLoading]=useState(false);
  const [lyricsTrackId,setLyricsTrackId]=useState<number|null>(null);
  const lyricsRequest=useRef(0),activeTrackId=useRef<number|null>(null);
  const [lyricsError,setLyricsError]=useState<LyricsFailure|null>(null),[lyricsRetryAfter,setLyricsRetryAfter]=useState<number|null>(null);
  const [lyricsFetchStatus,setLyricsFetchStatus]=useState<ExternalLyricsStatus|'idle'|'searching'>('idle');
  const homeMenuAnchor=useRef<HTMLElement|null>(null);
  const playerMenuReturn=useRef<HTMLElement|null>(null);
  const [homeAlbumMenu,setHomeAlbumMenu]=useState<{target:CollectionMenuTarget;point:{x:number;y:number}}|null>(null),[playerTrackMenu,setPlayerTrackMenu]=useState<{track:Track;point:{x:number;y:number};context?:TrackListContext}|null>(null);
  const [homeAlbumIds,setHomeAlbumIds]=useState<number[]>([]),previousPage=useRef<string|null>(null);
  const started=useRef(false), wasScanning=useRef(false),deleteJob=useRef(false);
  useEffect(()=>{if(isTauri())void invoke<DeletedSongsSettings>('deleted_songs_settings').then(value=>setDeletedSongsFolder(value.folder)).catch(report);},[report]);
  const refreshCollections=useCallback(()=>{
    const task=collectionJobs.current.catch(()=>{}).then(()=>invoke<Collections>('collections')).then(result=>{setCollections(result);return result;});
    collectionJobs.current=task;return task;
  },[]);
  useEffect(()=>{if(!isTauri())return;let disposed=false;let stop:(()=>void)|undefined;
    void listen('phone-collections-changed',()=>{void refreshCollections().catch(report);}).then(unlisten=>{if(disposed)unlisten();else stop=unlisten;});
    return()=>{disposed=true;stop?.();};
  },[refreshCollections,report]);
  async function mutate(action:Record<string,unknown>,options?:{inlineError?:boolean}){
    setCollectionBusy(true);
    const task=collectionJobs.current.catch(()=>{}).then(()=>invoke<Collections>('collection_action',{action})).then(result=>{setCollections(result);return result;});
    collectionJobs.current=task;
    try{const result=await task;const message=({create_playlist:'Плейлист создан',edit_playlist:'Плейлист сохранён',add_tracks:'Добавлено в плейлист',remove_entry:'Удалено из плейлиста',delete_playlist:'Плейлист удалён'} as Record<string,string>)[String(action.type)];if(message)notify(message);return result;}catch(e){if(!options?.inlineError&&!['create_playlist','edit_playlist'].includes(String(action.type)))feedbackError(e);return undefined;}finally{setCollectionBusy(false);}
  }
  const player=usePlayer(report,()=>void refreshCollections().catch(report),library.tracks,libraryLoaded);
  activeTrackId.current=player.current?.id??null;
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
      feedbackError(error);
    }
    finally{deleteJob.current=false;setDeleteBusy(false);}
  }
  function navigate(next:NavigationPage){setHomeAlbumMenu(null);setPlayerTrackMenu(null);setNavigation(state=>visit(state,next));}
  function back(){setHomeAlbumMenu(null);setPlayerTrackMenu(null);setNavigation(goBack);}
  function changeSearch(value:string){setNavigation(state=>enterSearch(state,value));}
  useEffect(()=>saveSidebarOrder(typeof localStorage==='undefined'?null:localStorage,sidebarOrder),[sidebarOrder]);
  const setToast=useCallback((message:string)=>{notify(message);},[]);
  const [scanStarting,setScanStarting]=useState(false);
  const scanPending=useRef(false),lyricsPending=useRef(false),folderPending=useRef(false);
  const scan=useCallback(async(folders:string[])=>{
    if(scanPending.current||wasScanning.current)return false;scanPending.current=true;setScanStarting(true);
    try {setError('');await invoke('scan_folders',{folders});wasScanning.current=true;setProgress(await invoke<Progress>('scan_status'));return true;}
    catch(e){feedbackError(e);return false;}finally{scanPending.current=false;setScanStarting(false);}
  },[]);
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
        if(wasScanning.current&&!p.running){if(p.errors&&p.stage!=='Готово')feedbackError(p.stage);else notify('Библиотека обновлена');}
        wasScanning.current=p.running;
      }catch(e){if(alive)report(e);}finally{polling=false;}
    },700);
    return()=>{alive=false;clearInterval(timer);};
  },[refresh,report]);
  useEffect(()=>{
    const request=++lyricsRequest.current;
    if((!details&&page.kind!=='lyricsView')||!player.current||!isTauri()){setLyrics(null);setLyricsTrackId(null);setLyricsLoading(false);return;}
    let alive=true;const trackId=player.current.id;setLyrics(null);setLyricsTrackId(null);setLyricsFetchStatus('idle');setLyricsError(null);setLyricsRetryAfter(null);setLyricsLoading(true);
    void invoke<LyricsDocument|null>('track_lyrics',{trackId})
      .then(value=>{if(alive&&request===lyricsRequest.current){setLyrics(value);setLyricsTrackId(trackId);}})
      .catch(error=>{if(alive&&request===lyricsRequest.current)setLyricsError(lyricsFailureFromError(error));}).finally(()=>{if(alive&&request===lyricsRequest.current)setLyricsLoading(false);});
    return()=>{alive=false;};
  },[details,page.kind,player.current?.id,report]);
  async function fetchLyrics(){
    if(!player.current||lyricsPending.current||lyricsFetchStatus==='searching')return;lyricsPending.current=true;
    const trackId=player.current.id,request=++lyricsRequest.current;
    setLyricsLoading(false);setLyricsFetchStatus('searching');setLyricsError(null);
    try{const result=await invoke<ExternalLyricsResult>('fetch_track_lyrics',{trackId});if(request!==lyricsRequest.current||activeTrackId.current!==trackId)return;setLyricsFetchStatus(result.status);setLyricsRetryAfter(result.retry_after??null);setLyricsError(result.status==='temporary_error'?lyricsFailureFromResult(result):null);if(result.lyrics){setLyrics(result.lyrics);setLyricsTrackId(trackId);setLibrary(value=>({...value,tracks:value.tracks.map(track=>track.id===trackId?{...track,has_lyrics:true}:track)}));}}
    catch(e){if(request===lyricsRequest.current&&activeTrackId.current===trackId){setLyricsFetchStatus('temporary_error');setLyricsError(lyricsFailureFromError(e));}}finally{lyricsPending.current=false;}
  }
  const albumGroups=useMemo(()=>{
    const map=new Map<number,Track[]>();for(const track of library.tracks){const group=map.get(track.album_id);if(group)group.push(track);else map.set(track.album_id,[track]);}return map;
  },[library.tracks]);
  const albums=useMemo(()=>[...albumGroups.values()].map(tracks=>tracks.find(track=>track.cover)||tracks[0]),[albumGroups]);
  useEffect(()=>{
    const entering=page.kind==='home'&&previousPage.current!=='home';
    if(page.kind==='home')setHomeAlbumIds(ids=>stableRandomAlbumIds(albums,ids,entering,10));
    previousPage.current=page.kind;
  },[page.kind,albums]);
  const homeAlbums=useMemo(()=>homeAlbumIds.map(id=>albumGroups.get(id)?.find(track=>track.cover)||albumGroups.get(id)?.[0]).filter((track):track is Track=>!!track),[homeAlbumIds,albumGroups]);
  const homeTrackById=useMemo(()=>new Map(library.tracks.map(track=>[track.id,track] as const)),[library.tracks]);
  const homeRecentTracks=useMemo(()=>{
    const recent=collections.history.map(entry=>homeTrackById.get(entry.track_id)).filter((track):track is Track=>!!track);
    const seen=new Set<number>();
    return recent.filter(track=>{if(seen.has(track.id))return false;seen.add(track.id);return true;}).slice(0,5);
  },[collections.history,homeTrackById]);
  async function chooseFolder(){
    if(folderPending.current)return;folderPending.current=true;setFolderBusy('__adding__');setFolderError('');setFolderNotice('');
    try{
      const selected=await open({directory:true,multiple:true,title:'Добавить папку с музыкой'});if(!selected)return;
      const paths=Array.isArray(selected)?selected:[selected];
      setLibrary(value=>addLibraryFoldersSnapshot(value,paths));
      if(await scan(paths))setFolderNotice(paths.length===1?'Папка с музыкой добавлена.':`Добавлено папок: ${paths.length}.`);
      else{setFolderError('Не удалось добавить выбранную папку. Проверьте доступ к ней.');await refresh().catch(()=>{});}
    }catch(e){setFolderError(String(e));}finally{folderPending.current=false;setFolderBusy(null);}
  }
  async function removeFolder(folder:string){
    if(folderPending.current)return;folderPending.current=true;setFolderBusy(folder);setFolderError('');setFolderNotice('');
    try{
      const removed=await invoke<boolean>('remove_library_folder',{folder});
      if(removed){setLibrary(value=>removeLibraryFolderSnapshot(value,folder));setFolderNotice('Источник убран. Импортированные треки и файлы сохранены.');}
      else{await refresh();setFolderNotice('Источник уже был убран.');}
    }catch(e){setFolderError(String(e));}
    finally{folderPending.current=false;setFolderBusy(null);}
  }
  function showLibrary(){navigate({kind:'library'});}
  const savedCurrentHasLyrics=useMemo(()=>library.tracks.find(track=>track.id===player.current?.id)?.has_lyrics??false,[library.tracks,player.current?.id]);
  const lyricsOpen=page.kind==='lyricsView',currentHasLyrics=!!player.current&&(player.current.has_lyrics||savedCurrentHasLyrics||(lyricsTrackId===player.current.id&&!!lyrics));
  function toggleLyrics(){if(lyricsOpen)back();else if(currentHasLyrics)navigate({kind:'lyricsView'});}
  const visualizerOpen=page.kind==='visualizer';
  function toggleVisualizer(){if(visualizerOpen)back();else navigate({kind:'visualizer'});}
  const contentPage:NavigationPage=visualizerOpen?(navigation.back.at(-1)?.page??{kind:'home'}):page;
  const currentLiked=!!player.current&&collections.likes.includes(player.current.id);
  function toggleCurrentLike(){if(!player.current)return;const trackId=player.current.id,next=!currentLiked;setCollections(value=>({...value,likes:setLiked(value.likes,trackId,next)}));void mutate(likeAction(trackId,next)).then(result=>{if(!result)void refreshCollections().catch(report);});}
  const drag=useRef(new TrackDrag());
  const suppressClick=useRef(false),[dragging,setDragging]=useState(false),[dragPoint,setDragPoint]=useState({x:0,y:0});
  const dragSourceRow=useRef<HTMLElement|null>(null),dragTarget=useRef<HTMLElement|null>(null);
  function clearDragVisuals(){if(dragSourceRow.current)delete dragSourceRow.current.dataset.globalDragSource;if(dragTarget.current)delete dragTarget.current.dataset.dragTarget;dragSourceRow.current=null;dragTarget.current=null;resizableLayout.root.current?.removeAttribute('data-drag-track-id');}
  function cancelDrag(){drag.current.cancel();setDragging(false);clearDragVisuals();}
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
    settings:{selected:settingsOpen,action:()=>setSettingsOpen(true),content:<><SettingsIcon size={19}/><span className="nav-text">Настройки</span></>},
  };
  const navTooltips:Record<SidebarId,string>={home:'Главная',search:'Поиск музыки · Ctrl+K',library:'Локальная медиатека',lyrics:'Тексты песен и индексация',recentlyAdded:'Недавно добавленные треки',artists:'Исполнители',albums:'Альбомы',liked:'Любимые треки',playlists:'Плейлисты',history:'Недавно прослушано',queue:'Очередь воспроизведения',settings:'Настройки'};
  const sidebarPlaylist=sidebarMenu?.kind==='playlist'?collections.playlists.find(playlist=>playlist.id===sidebarMenu.id):null;
  const sidebarPlaylistTracks=sidebarPlaylist?sidebarPlaylist.entries.map(entry=>library.tracks.find(track=>track.id===entry.track_id)).filter((track):track is Track=>!!track):[];
  const sidebarQuickTracks=sidebarMenu?.kind==='nav'&&['library','recentlyAdded','history','liked','queue'].includes(sidebarMenu.id)?(()=>{const byId=new Map(library.tracks.map(track=>[track.id,track]));switch(sidebarMenu.id){case 'library':return library.tracks;case 'recentlyAdded':return recentlyAddedTracks(library.tracks);case 'history':return collections.history.map(entry=>byId.get(entry.track_id)).filter((track):track is Track=>!!track);case 'liked':return collections.likes.map(id=>byId.get(id)).filter((track):track is Track=>!!track);case 'queue':return player.queue.items.slice(player.queue.cursor+1).map(entry=>entry.track);default:return [];}})():[];
  return <AppShell collapsed={sidebar.collapsed} ref={resizableLayout.root} style={resizableLayout.style} data-color-palette={colorPalette} className={dragging?'dragging-track':''}
    onDragStartCapture={e=>e.preventDefault()}
    onPointerDownCapture={e=>{
      e.currentTarget.dataset.interacted='true';
      if(e.button!==0||player.busy||collectionBusy||(e.target as Element).closest('.artist-link')||(e.target as Element).closest('.album-cell,.playlist-reorder-handle,.row-actions,.track-play-button'))return;
      const row=(e.target as Element).closest<HTMLElement>('[data-track-id]');
      if(row){dragSourceRow.current=row;drag.current.begin(Number(row.dataset.trackId),e.pointerId,e.clientX,e.clientY);}
    }}
    onPointerMoveCapture={e=>{
      if(drag.current.move(e.pointerId,e.clientX,e.clientY)){e.currentTarget.setPointerCapture(e.pointerId);setDragging(true);if(dragSourceRow.current){dragSourceRow.current.dataset.globalDragSource='true';e.currentTarget.dataset.dragTrackId=dragSourceRow.current.dataset.trackId;}}
      if(e.currentTarget.dataset.dragTrackId){
        setDragPoint({x:e.clientX,y:e.clientY});e.preventDefault();if(dragTarget.current)delete dragTarget.current.dataset.dragTarget;
        const hit=document.elementFromPoint(e.clientX,e.clientY),target=hit?.closest<HTMLElement>('[data-playlist-id]');
        dragTarget.current=target?(hit?.closest<HTMLElement>('.track-row')??target.querySelector<HTMLElement>('.track-head')??target):(hit?.closest<HTMLElement>('.track-row')??null);
        if(dragTarget.current)dragTarget.current.dataset.dragTarget=target&&collections.playlists.some(p=>p.id===Number(target.dataset.playlistId))?'valid':'invalid';
      }
    }}
    onPointerUpCapture={e=>{
      const trackId=drag.current.finish(e.pointerId);setDragging(false);clearDragVisuals();
      if(trackId===null)return;
      suppressClick.current=true;setTimeout(()=>{suppressClick.current=false;},0);
      const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-playlist-id]');
      const id=Number(target?.dataset.playlistId);
      if(collections.playlists.some(p=>p.id===id))void mutate({type:'add_tracks',id,track_ids:[trackId]});
    }}
    onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}
    onKeyDownCapture={e=>{e.currentTarget.dataset.interacted='true';if(e.key==='Escape')cancelDrag();}}
    onClickCapture={e=>{if(suppressClick.current){e.preventDefault();e.stopPropagation();}}}>

    {dragging&&createPortal(<div className="feedback-drag-ghost" aria-hidden="true" style={{left:Math.max(8,Math.min(dragPoint.x+12,window.innerWidth-252)),top:Math.max(8,Math.min(dragPoint.y+12,window.innerHeight-56))}}><span>{library.tracks.find(track=>track.id===Number(dragSourceRow.current?.dataset.trackId))?.title}</span><small>В плейлист</small></div>,dragSourceRow.current?.closest('dialog[open]')??document.querySelector('dialog[open]')??document.body)}
    <Sidebar collapsed={sidebar.collapsed} onToggle={sidebar.toggle}
      brand={<a className="brand" href="#" aria-label="Undertone — Главная" onClick={e=>{e.preventDefault();navigate({kind:'home'});}}><AudioLines aria-hidden="true" size={20}/><span>undertone</span></a>}
      navigation={<nav aria-label="Главная навигация" onPointerDown={navPointerDown} onPointerMove={navPointerMove} onPointerUp={navPointerEnd} onPointerCancel={navPointerEnd} onClickCapture={e=>{if(suppressNavClick.current){e.preventDefault();e.stopPropagation();}}}>
        <div className="primary-navigation">{(['home','search','playlists','albums','liked','library'] as SidebarId[]).map(id=>{const active=navItems[id].selected||(id==='library'&&['artists','artist','recentlyAdded'].includes(page.kind));return <Tooltip key={id} content={navTooltips[id]}><Button variant="ghost" data-nav-id={id} aria-label={navTooltips[id]} aria-current={active?'page':undefined} className={active?'selected':''} onClick={navItems[id].action}>{navItems[id].content}</Button></Tooltip>;})}</div>
        <Tooltip content="Создать плейлист"><Button variant="ghost" className="sidebar-create" aria-label="Создать плейлист" onClick={()=>setNewPlaylist(true)}><Plus size={18}/><span className="nav-text">Создать плейлист</span></Button></Tooltip>
        <SidebarTools collapsed={sidebar.collapsed} active={['history','queue','lyrics','lyricsView'].includes(page.kind)}>{(['history','queue','lyrics'] as const).map(id=><Tooltip key={id} content={navTooltips[id]}><Button variant="ghost" data-nav-id={id} aria-label={navTooltips[id]} aria-current={navItems[id].selected?'page':undefined} className={navItems[id].selected?'selected':''} onClick={navItems[id].action}>{navItems[id].content}</Button></Tooltip>)}</SidebarTools>
      </nav>}
      playlists={<><div className="sources-label nav-label"><span>ПЛЕЙЛИСТЫ</span><Tooltip content="Новый плейлист"><IconButton aria-label="Новый плейлист" onClick={()=>setNewPlaylist(true)}><Plus/></IconButton></Tooltip></div><div className="sidebar-playlist-scroll" tabIndex={0} role="region" aria-label="Ваши плейлисты">{collections.playlists.map(p=><Tooltip key={p.id} content={p.name}><Button variant="ghost" className={`playlist-link ${page.kind==='playlist'&&page.id===p.id?'selected':''}`} aria-label={`Плейлист: ${p.name}`} aria-current={page.kind==='playlist'&&page.id===p.id?'page':undefined} onClick={()=>navigate({kind:'playlist',id:p.id})} onContextMenu={event=>openContextMenu(event,point=>setSidebarMenu({kind:'playlist',id:p.id,point}))} data-playlist-id={p.id}><ListMusic/><span>{p.name}</span><small>{p.entries.length}</small></Button></Tooltip>)}</div></>}
      sources={<><Divider/><div className="nav-label sources-label"><span>ИСТОЧНИКИ</span><Tooltip content="Добавить папку"><IconButton aria-label="Добавить папку" onClick={()=>setFoldersOpen(true)}><FolderPlus/></IconButton></Tooltip></div><div className="sidebar-source-scroll">{library.folders.map(folder=><Tooltip key={folder} content={folder}><Button variant="ghost" className="source" aria-label={`Источник: ${folder}`} onClick={()=>setFoldersOpen(true)} onContextMenu={event=>openContextMenu(event,point=>setSidebarMenu({kind:'source',folder,point}))}><Folder/><span>{folder.split(/[\\/]/).filter(Boolean).at(-1)}</span></Button></Tooltip>)}{!library.folders.length&&<Tooltip content="Добавить музыку"><Button variant="ghost" className="source" aria-label="Добавить музыку" onClick={()=>setFoldersOpen(true)} onContextMenu={event=>openContextMenu(event,point=>setSidebarMenu({kind:'source',folder:'',point}))}><FolderPlus/><span>Добавить музыку</span></Button></Tooltip>}</div></>}
      settings={<Tooltip content={navTooltips.settings}><Button variant="ghost" data-nav-id="settings" aria-label="Настройки" aria-haspopup="dialog" className={`settings-nav-item ${settingsOpen?'selected':''}`} onClick={navItems.settings.action} onContextMenu={event=>openContextMenu(event,point=>setSidebarMenu({kind:'nav',id:'settings',point}))}>{navItems.settings.content}</Button></Tooltip>}
    />
    <ResizeHandle label="Изменить ширину боковой панели" className="sidebar-resize" {...resizableLayout.handle('left')}/>
    <MainContent page={page.kind}>
      <header className="topbar"><button className="icon-button back-button" aria-label="Назад" disabled={!navigation.back.length} onClick={back}><ArrowLeft size={18}/></button><div className="breadcrumb"><strong>{({home:'Главная',search:'Поиск',library:'Медиатека',recentlyAdded:'Недавно добавлено',artists:'Исполнители',artist:'Исполнитель',albums:'Альбомы',album:'Альбом',liked:'Любимые треки',playlists:'Плейлисты',playlist:'Плейлист',history:'Недавно слушали',queue:'Очередь',lyrics:'Тексты песен',lyricsView:'Текст песни',visualizer:'Визуализатор'})[page.kind]}</strong></div><span className="local-badge"><span className="status-dot"/>Локальная библиотека</span></header>
      {error&&<div className="error" role="alert"><Info size={18}/><span>{error}</span><button className="icon-button" aria-label="Закрыть ошибку" onClick={()=>setError('')}><X size={18}/></button></div>}
      {progress?.running&&<div className="scan-banner" role="status" aria-live="off"><RefreshCw className="spinning" size={17}/><span>{progress.stage} <strong>{progress.processed} / {progress.total||'…'}</strong></span><progress max={progress.total||1} value={progress.processed}/><small>{progress.current||'Ищем вашу музыку…'}</small></div>}
      <div className="visualizer-preserved-page" hidden={visualizerOpen}>
      <BulkLyricsIndexer available={externalLyricsEnabled} checked={externalLyricsChecked} visible={contentPage.kind==='lyrics'&&!visualizerOpen} onCompleted={()=>void refresh().catch(()=>report('Не удалось обновить библиотеку после проверки текстов.'))} onOpenTrack={id=>{const track=library.tracks.find(track=>track.id===id);if(track)navigate({kind:'album',id:track.album_id});}} />
      {contentPage.kind==='home'?<DesktopHome busy={collectionBusy} onLike={track=>void mutate({type:'like',track_id:track.id,liked:!collections.likes.includes(track.id)})} onTrackMenu={(track,point,context)=>{setPlayerTrackMenu({track,point,context});requestAnimationFrame(()=>document.querySelector<HTMLElement>('[role="menu"] [role="menuitem"]:not(:disabled)')?.focus({preventScroll:true}));}} onSearch={value=>{changeSearch(value);}} tracks={library.tracks} albums={homeAlbums} recent={homeRecentTracks} collections={collections} player={player} navigate={navigate} onAdd={()=>setFoldersOpen(true)} onRescan={()=>void rescanConfiguredFolders(library.folders,scan)} scanning={(!!progress?.running||scanStarting)||!library.folders.length} onCreate={()=>setNewPlaylist(true)} onAlbumMenu={(target,point)=>{const active=document.activeElement as HTMLElement|null;homeMenuAnchor.current=active?.closest('.home-entity-preview')?active:document.querySelector<HTMLElement>(`.home-entity-preview [data-entity-id="${target.id}"] .entity-card-open`);homeMenuAnchor.current?.focus({preventScroll:true});setHomeAlbumMenu({target,point});requestAnimationFrame(()=>document.querySelector<HTMLElement>('[role="menu"] [role="menuitem"]:not(:disabled)')?.focus({preventScroll:true}));}}/>:contentPage.kind==='lyricsView'?<LyricsView status={lyricsFetchStatus} error={lyricsError} retryAfter={lyricsRetryAfter} lookupAvailable={externalLyricsEnabled} onLookup={()=>void fetchLyrics()} track={player.current} lyrics={lyricsForTrack(player.current?.id??null,lyricsTrackId,lyrics)} loading={lyricsLoading} position={player.status.position} onSeek={seconds=>void player.command({type:'seek',seconds})}/>:contentPage.kind==='lyrics'?null:contentPage.kind!=='search'&&contentPage.kind!=='visualizer'?<CollectionView page={contentPage} query="" onQueryChange={changeSearch} library={library} collections={collections} mutate={mutate} busy={collectionBusy} player={player} navigate={navigate} onScan={()=>void scan(library.folders)} scanning={(!!progress?.running||scanStarting)} notice={setToast} trashAvailable={!!deletedSongsFolder} onMoveToTrash={requestMoveToTrash} onRemoveFromLibrary={requestRemoveFromLibrary} onViewMetadata={viewTrackMetadata}/>:null}
      {(()=>{const search=searchScreen(navigation);return <div className="search-page-host" hidden={contentPage.kind!=='search'}><CollectionView searchActive={contentPage.kind==='search'} searchFocusRequest={searchFocusRequest} onEmptySearchEscape={escapeSearch} page={{kind:'search'}} query={search.query} onQueryChange={changeSearch} library={library} collections={collections} mutate={mutate} busy={collectionBusy} player={player} navigate={navigate} onScan={()=>void scan(library.folders)} scanning={(!!progress?.running||scanStarting)} notice={setToast} trashAvailable={!!deletedSongsFolder} onMoveToTrash={requestMoveToTrash} onRemoveFromLibrary={requestRemoveFromLibrary} onViewMetadata={viewTrackMetadata}/></div>;})()}
      </div>
      {visualizerOpen&&<FullVisualizer track={player.current} playing={player.status.playing} onClose={back}/>} 
    </MainContent>
    <PlayerArea><Player key="player-controls-layout-v3" player={player} onDetails={()=>setDetails(v=>!v)} onQueue={()=>navigate({kind:"queue"})} onLyrics={toggleLyrics} onVisualizer={toggleVisualizer} visualizerOpen={visualizerOpen} lyricsOpen={lyricsOpen} queueOpen={page.kind==="queue"} onMetadata={viewTrackMetadata} lyricsAvailable={currentHasLyrics} liked={currentLiked} onToggleLike={toggleCurrentLike} onTrackContextMenu={(track,point)=>{playerMenuReturn.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setPlayerTrackMenu({track,point});}} onMoveToTrash={requestMoveToTrash} trashAvailable={!!deletedSongsFolder} controlOrder={playerControlOrder} controlPositions={playerControlPositions} onControlPositionsChange={updatePlayerControlPositions}/></PlayerArea>

    {sidebarMenu?.kind==='nav'&&<ContextMenu point={sidebarMenu.point} label={`Действия: ${navTooltips[sidebarMenu.id]}`} onClose={()=>setSidebarMenu(null)} onNotice={setToast}>{run=><><MenuSection><MenuItem icon={<ArrowRight size={16}/>} onClick={()=>void run(navItems[sidebarMenu.id].action)}>Открыть</MenuItem></MenuSection>
      {['library','recentlyAdded','history','liked','queue'].includes(sidebarMenu.id)&&<MenuSection><MenuItem icon={<Play size={16}/>} disabled={!sidebarQuickTracks.length||player.busy} onClick={()=>void run(()=>sidebarMenu.id==='queue'?player.jump(player.queue.cursor+1):player.play(sidebarQuickTracks[0],sidebarQuickTracks))}>Воспроизвести список</MenuItem>{sidebarMenu.id!=='queue'&&<MenuItem icon={<ListMusic size={16}/>} disabled={!sidebarQuickTracks.length||player.busy} onClick={()=>void run(()=>enqueueGroup(sidebarQuickTracks,false,player.enqueue),'Добавлено в очередь')}>Добавить список в очередь</MenuItem>}</MenuSection>}
      {sidebarMenu.id==='queue'&&<MenuSection><MenuItem icon={<X size={16}/>} disabled={!sidebarQuickTracks.length||player.busy} onClick={()=>void run(player.clearUpcoming)}>Очистить следующие</MenuItem></MenuSection>}
      {['home','library','recentlyAdded','artists','albums'].includes(sidebarMenu.id)&&<MenuSection><MenuItem icon={<RefreshCw size={16}/>} disabled={!library.folders.length||(!!progress?.running||scanStarting)} onClick={()=>void run(()=>scan(library.folders))}>Пересканировать папки</MenuItem><MenuItem icon={<FolderPlus size={16}/>} onClick={()=>void run(()=>setFoldersOpen(true))}>Добавить папку</MenuItem></MenuSection>}
      {sidebarMenu.id==='search'&&<MenuSection><MenuItem icon={<Search size={16}/>} onClick={()=>void run(()=>setNavigation(state=>enterSearch(state,'')))}>Новый поиск</MenuItem></MenuSection>}
      {sidebarMenu.id==='lyrics'&&<MenuSection><MenuItem icon={<MicVocal size={16}/>} disabled={!currentHasLyrics} onClick={()=>void run(()=>navigate({kind:'lyricsView'}))}>Текст текущего трека</MenuItem></MenuSection>}
      {sidebarMenu.id==='playlists'&&<MenuSection><MenuItem icon={<Plus size={16}/>} onClick={()=>void run(()=>setNewPlaylist(true))}>Создать плейлист</MenuItem></MenuSection>}
      {sidebarMenu.id==='settings'&&<MenuSection><MenuItem icon={<RefreshCw size={16}/>} onClick={()=>void run(resetPlayerLayout,'Расположение плеера сброшено')}>Сбросить панель плеера</MenuItem></MenuSection>}
    </>}</ContextMenu>}
    {sidebarMenu?.kind==='playlist'&&sidebarPlaylist&&<ContextMenu point={sidebarMenu.point} label={`Действия с плейлистом ${sidebarPlaylist.name}`} onClose={()=>setSidebarMenu(null)} onNotice={setToast}>{run=><><MenuSection><MenuItem icon={<ArrowRight size={16}/>} onClick={()=>void run(()=>navigate({kind:'playlist',id:sidebarPlaylist.id}))}>Открыть плейлист</MenuItem><MenuItem icon={<Play size={16}/>} disabled={!sidebarPlaylistTracks.length||player.busy} onClick={()=>void run(()=>player.play(sidebarPlaylistTracks[0],sidebarPlaylistTracks,0,{kind:'playlist',playlistId:sidebarPlaylist.id}))}>Воспроизвести</MenuItem><MenuItem icon={<ListMusic size={16}/>} disabled={!sidebarPlaylistTracks.length||player.busy} onClick={()=>void run(()=>enqueueGroup(sidebarPlaylistTracks,false,player.enqueue),'Добавлено в очередь')}>Добавить в очередь</MenuItem></MenuSection><MenuSection><MenuItem icon={<Pencil size={16}/>} onClick={()=>void run(()=>setSidebarPlaylistEditor(sidebarPlaylist))}>Изменить плейлист</MenuItem><MenuItem icon={<Download size={16}/>} disabled={collectionBusy} onClick={()=>void run(()=>exportPlaylist(sidebarPlaylist,setToast))}>Экспортировать с аудиофайлами…</MenuItem></MenuSection></>}</ContextMenu>}
    {sidebarMenu?.kind==='source'&&<ContextMenu point={sidebarMenu.point} label="Действия с музыкальной папкой" onClose={()=>setSidebarMenu(null)} onNotice={setToast}>{run=><><MenuSection><MenuItem icon={<Folder size={16}/>} onClick={()=>void run(()=>setFoldersOpen(true))}>Управление папками</MenuItem><MenuItem icon={<RefreshCw size={16}/>} disabled={!sidebarMenu.folder||(!!progress?.running||scanStarting)} onClick={()=>void run(()=>scan([sidebarMenu.folder]))}>Пересканировать папку</MenuItem></MenuSection>{sidebarMenu.folder&&<MenuSection separated><MenuItem destructive icon={<Unplug size={16}/>} disabled={folderBusy!==null||(!!progress?.running||scanStarting)} onClick={()=>void run(()=>removeFolder(sidebarMenu.folder))}>Убрать источник</MenuItem></MenuSection>}</>}</ContextMenu>}
    {settingsOpen&&<AppSettings scanning={(!!progress?.running||scanStarting)} musicFolders={library.folders} onMusicFolders={()=>setFoldersOpen(true)} controlOrder={playerControlOrder} controlPositions={playerControlPositions} onControlPositionsChange={updatePlayerControlPositions} previewTrack={player.current} deletedSongsFolder={deletedSongsFolder} onDeletedSongsFolder={setDeletedSongsFolder} onResetPlayerLayout={resetPlayerLayout} colorPalette={colorPalette} onColorPaletteChange={setColorPalette} customColor={customColor} onCustomColorChange={color=>{setCustomColor(color);setColorPalette('custom');}} onClose={()=>setSettingsOpen(false)}/>}
    {newPlaylist&&<PlaylistEditor onClose={()=>setNewPlaylist(false)} mutate={mutate} busy={collectionBusy} onSaved={id=>navigate({kind:"playlist",id})}/>}
    {sidebarPlaylistEditor&&<PlaylistEditor playlist={sidebarPlaylistEditor} onClose={()=>setSidebarPlaylistEditor(null)} mutate={mutate} busy={collectionBusy} onSaved={id=>navigate({kind:'playlist',id})}/>}
    {homeAlbumMenu&&<CollectionContextMenu target={homeAlbumMenu.target} point={homeAlbumMenu.point} busy={collectionBusy||player.busy} playlists={collections.playlists} onPlay={()=>player.play(homeAlbumMenu.target.tracks[0],homeAlbumMenu.target.tracks)} onPlayNext={()=>enqueueGroup(homeAlbumMenu.target.tracks,true,player.enqueue)} onAddToQueue={()=>enqueueGroup(homeAlbumMenu.target.tracks,false,player.enqueue)} onAddToPlaylist={playlist=>mutate(playlistAddAction(playlist.id,homeAlbumMenu.target.tracks))} onRename={()=>{}} onDelete={()=>{}} onNotice={setToast} onClose={()=>{setHomeAlbumMenu(null);homeMenuAnchor.current?.focus({preventScroll:true});}}/>}
    {playerTrackMenu&&<TrackContextMenu track={playerTrackMenu.track} point={playerTrackMenu.point} busy={collectionBusy||player.busy} liked={collections.likes.includes(playerTrackMenu.track.id)} playlists={collections.playlists} trashAvailable={!!deletedSongsFolder} onRemoveFromQueue={playerTrackMenu.context?.source==="now-playing-queue"?()=>player.removeMany((playerTrackMenu.context?.selectionKeys??[]).map(Number)):undefined} selectionCount={playerTrackMenu.context?.selection.length} onPlayNext={()=>enqueueGroup(playerTrackMenu.context?.selection??[playerTrackMenu.track],true,player.enqueue)} onAddToQueue={()=>enqueueGroup(playerTrackMenu.context?.selection??[playerTrackMenu.track],false,player.enqueue)} onAddToLiked={()=>mutate({type:'like',track_id:playerTrackMenu.track.id,liked:!collections.likes.includes(playerTrackMenu.track.id)})} onAddToPlaylist={playlist=>mutate(playlistAddAction(playlist.id,playerTrackMenu.context?.selection??[playerTrackMenu.track]))} onMoveToTrash={requestMoveToTrash} onRemoveFromLibrary={requestRemoveFromLibrary} onViewMetadata={viewTrackMetadata} onNotice={setToast} onClose={()=>{setPlayerTrackMenu(null);if(details&&!playerTrackMenu.context)document.querySelector<HTMLElement>(".np-context-trigger")?.focus({preventScroll:true});else if(!playerTrackMenu.context)playerMenuReturn.current?.focus({preventScroll:true});if(playerTrackMenu.context)document.querySelector<HTMLElement>(`.track-table[data-source="${playerTrackMenu.context.source}"]`)?.focus({preventScroll:true});}}/>}
    {deleteTrack&&(deleteMode==='remove'||deletedSongsFolder)&&<MoveTrackDialog track={deleteTrack} destination={deletedSongsFolder} mode={deleteMode} busy={deleteBusy} onCancel={()=>{if(!deleteBusy)setDeleteTrack(null);}} onConfirm={()=>void confirmMoveToTrash()}/>}
    {metadataTrack&&<TrackMetadataDialog track={metadataTrack} onClose={()=>setMetadataTrack(null)}/>}
    {details&&player.current&&<ListeningDialog onClose={()=>setDetails(false)}><NowPlayingPanel player={player} lookupStatus={lyricsFetchStatus} lookupError={lyricsError} retryAfter={lyricsRetryAfter} lyrics={lyricsForTrack(player.current.id,lyricsTrackId,lyrics)} loading={lyricsLoading} likes={new Set(collections.likes)} onLike={track=>void mutate(likeAction(track.id,!collections.likes.includes(track.id)))} onContextMenu={(track,point,context)=>setPlayerTrackMenu({track,point,context})} onOpenQueue={()=>{setDetails(false);navigate({kind:"queue"});}} canFetch={externalLyricsEnabled} fetching={lyricsFetchStatus==='searching'} onFetch={()=>void fetchLyrics()} onMetadata={viewTrackMetadata} onClose={()=>setDetails(false)}/></ListeningDialog>}
    {foldersOpen&&<MusicFoldersDialog library={library} scanning={(!!progress?.running||scanStarting)} busy={folderBusy} error={folderError} notice={folderNotice} onAdd={()=>void chooseFolder()} onRescan={()=>void scan(library.folders)} onRemove={folder=>void removeFolder(folder)} onClose={()=>setFoldersOpen(false)}/>}
  </AppShell>;
}
