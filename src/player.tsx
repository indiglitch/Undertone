import {preferenceStorage,readVolumePreference,saveVolumePreference} from './volumePreferences';
import {notify} from './feedback';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, ListMusic, Shuffle, Repeat2, Radio, MicVocal, Heart, Trash2, LockKeyhole, LockKeyholeOpen,MoreHorizontal,Info,AudioLines,FileWarning } from 'lucide-react';
import { AudioStatus, PlaybackSession, Track, time } from './types';
import {Button,Cover,IconButton} from './ui';
import {ContextMenu,MenuItem,MenuSection} from './ContextMenu';
import {usePlayerSeek} from './usePlayerSeek';
import {useTrackAvailability} from './trackAvailability';
import './PlayerPresentation.css';
import { moveItem } from './libraryModel';
import { chooseAutoplay, cycleRepeat, decideAdvance, shuffleFrom, shuffleUpcoming, type PlaybackContext, type PlaybackModes } from './playbackModes';
import { openContextMenu } from './trackContextMenuModel';
import { lyricsButtonDisabled } from './lyricsViewModel';
import { deletedTrackQueue, planDeletedTrack } from './deletedSongsModel';
import { chooseRandomLocalTrack, decideMainPlay, playbackSessionSnapshot, playableLocalTracks, restorePlaybackSession } from './playbackSessionModel';
import { Tooltip } from './Tooltip';
import { volumeAction, volumeFromWheel, volumePercent } from './playerVolumeModel';
import PlayerControlStrip from './PlayerControlStrip';
import type {PlayerControlId,PlayerControlPositions} from './playerControlLayout';

export type QueueEntry={key:number;track:Track};
export type PlayContext={kind:'playlist';playlistId:number};
export function usePlayer(report:(error:unknown)=>void,onStarted?:()=>void,localTracks:Track[]=[],libraryLoaded=false) {
  const [initialVolume]=useState(()=>readVolumePreference(preferenceStorage()));
  const volumePreference=useRef(initialVolume),volumeSaveTimer=useRef<number|null>(null),volumeRestoring=useRef(initialVolume.saved);
  const [status,setStatus]=useState<AudioStatus>({id:null,playing:false,position:0,duration:0,volume:initialVolume.volume,ended:false});
  const [current,setCurrent]=useState<Track|null>(null);
  const [busy,setBusy]=useState(false);
  const [queue,setQueue]=useState<{items:QueueEntry[];cursor:number}>({items:[],cursor:-1});
  const [modes,setModes]=useState<PlaybackModes>({shuffle:false,repeatMode:'off',autoplay:false});
  const [sourceIntact,setSourceIntact]=useState(false);
  const [context,setContext]=useState<PlaybackContext>({kind:'queue'});
  const queueRef=useRef(queue), serial=useRef(0), pending=useRef(0), ended=useRef<number|null>(null),statusRef=useRef(status),volumeSerial=useRef(0);
  const modesRef=useRef(modes),contextRef=useRef<PlaybackContext>(context),canonicalRef=useRef<QueueEntry[]>([]),playlistRef=useRef<QueueEntry[]|null>(null),libraryRef=useRef(localTracks),currentRef=useRef(current);
  const sessionRestoreStarted=useRef(false),sessionRestored=useRef(false),persistTimer=useRef<number|null>(null),persistPending=useRef<PlaybackSession|null>(null),persistRunning=useRef(false),lastPositionPersist=useRef(0),restoredPosition=useRef<number|null>(null),playRevision=useRef(0);
  modesRef.current=modes;libraryRef.current=localTracks;currentRef.current=current;
  const startedRef=useRef(onStarted);startedRef.current=onStarted;
  const reportRef=useRef(report); reportRef.current=report;
  function persistNow(){
    if(!isTauri()||!sessionRestored.current)return;
    const q=queueRef.current,snapshot=playbackSessionSnapshot(q.items,q.cursor,currentRef.current,statusRef.current.position);
    persistPending.current=snapshot;
    if(persistRunning.current)return;
    persistRunning.current=true;
    void (async()=>{try{while(persistPending.current){const session=persistPending.current;persistPending.current=null;try{await invoke('save_playback_session',{session});}catch(error){reportRef.current(error);}}}finally{persistRunning.current=false;}})();
  }
  function persistSoon(delay=180){if(!sessionRestored.current)return;if(persistTimer.current!==null)window.clearTimeout(persistTimer.current);persistTimer.current=window.setTimeout(()=>{persistTimer.current=null;persistNow();},delay);}
  const queueRevision=useRef(0);
  function updateQueue(value:typeof queue){queueRevision.current++;queueRef.current=value;setQueue(value);persistSoon();}
  async function command(action:Record<string,unknown>) {
    if(action.type==='seek'&&restoredPosition.current!==null&&statusRef.current.id===null){
      const seconds=Number(action.seconds);
      if(!Number.isFinite(seconds))return null;
      restoredPosition.current=Math.max(0,Math.min(statusRef.current.duration,seconds));
      statusRef.current={...statusRef.current,position:restoredPosition.current};setStatus(statusRef.current);persistSoon();return statusRef.current;
    }
    pending.current++; setBusy(true);
    try { const result=await invoke<AudioStatus>('audio_command',{action}); statusRef.current=result;setStatus(result);if(action.type!=='status')persistSoon();if(result.warning)reportRef.current(result.warning); return result; }
    catch(e) { reportRef.current(e); return null; }
    finally { pending.current--; setBusy(pending.current>0); }
  }
  function flushVolume(){if(!volumePreference.current.saved)return;if(volumeSaveTimer.current!==null){window.clearTimeout(volumeSaveTimer.current);volumeSaveTimer.current=null;}saveVolumePreference(preferenceStorage(),volumePreference.current);}
  useEffect(()=>{
    if(isTauri()&&initialVolume.saved){const request=++volumeSerial.current;void invoke<AudioStatus>('audio_command',{action:volumeAction(initialVolume.volume)}).then(result=>{if(request===volumeSerial.current){statusRef.current={...statusRef.current,volume:result.volume};setStatus(current=>({...current,volume:result.volume}));}}).catch(error=>reportRef.current(error)).finally(()=>{volumeRestoring.current=false;});}else volumeRestoring.current=false;
    window.addEventListener('beforeunload',flushVolume);window.addEventListener('pagehide',flushVolume);
    return()=>{window.removeEventListener('beforeunload',flushVolume);window.removeEventListener('pagehide',flushVolume);if(volumePreference.current.saved)flushVolume();};
  },[]);
  const changeVolume=useCallback(async(value:number)=>{
    const request=++volumeSerial.current;
    try{
      const result=await invoke<AudioStatus>('audio_command',{action:volumeAction(value)});
      if(request===volumeSerial.current){statusRef.current={...statusRef.current,volume:result.volume};setStatus(current=>({...current,volume:result.volume}));volumePreference.current={volume:result.volume,lastAudible:result.volume>0?result.volume:volumePreference.current.lastAudible,saved:true};if(volumeSaveTimer.current!==null)window.clearTimeout(volumeSaveTimer.current);volumeSaveTimer.current=window.setTimeout(flushVolume,180);}
      if(result.warning)reportRef.current(result.warning);
      return result;
    }catch(error){reportRef.current(error);return null;}
  },[]);
  async function load(items:QueueEntry[],cursor:number) {
    if(pending.current||!items[cursor])return false;
    playRevision.current++;
    const track=items[cursor].track;
    const result=await command({type:'play',id:track.id});
    if(result){restoredPosition.current=null;updateQueue({items,cursor});currentRef.current=track;setCurrent(track);ended.current=null;startedRef.current?.();persistSoon();return true;}return false;
  }
  async function play(track:Track, tracks:Track[]=[track],index=tracks.findIndex(t=>t.id===track.id),source?:PlayContext) {
    if(index<0)return false;
    const canonical=tracks.map(t=>({key:++serial.current,track:t}));
    const ordered=modesRef.current.shuffle?shuffleFrom(canonical,index):{items:canonical,cursor:index};
    if(await load(ordered.items,ordered.cursor)){canonicalRef.current=canonical;setSourceIntact(!!source);const nextContext:PlaybackContext=source??{kind:'queue'};contextRef.current=nextContext;setContext(nextContext);playlistRef.current=source?canonical:null;return true;}return false;
  }
  async function jump(index:number){return load(queueRef.current.items,index);}
  function enqueue(track:Track,playNext=false){
    if(pending.current)return false;
    const q=queueRef.current,items=[...q.items],entry={key:++serial.current,track};
    items.splice(playNext?q.cursor+1:items.length,0,entry);setSourceIntact(false);
    const canonical=[...canonicalRef.current],currentKey=q.items[q.cursor]?.key,at=playNext&&currentKey!==undefined?canonical.findIndex(item=>item.key===currentKey)+1:canonical.length;canonical.splice(Math.max(0,at),0,entry);canonicalRef.current=canonical;updateQueue({...q,items});return true;
  }
  function queueUndo(before:typeof queue,canonical:QueueEntry[],intact:boolean,message:string){
    const revision=queueRevision.current;
    const available=()=>queueRevision.current===revision&&!pending.current;
    notify(message,'info',{label:'Отменить',available,run:()=>{if(!available())return false;canonicalRef.current=canonical;setSourceIntact(intact);updateQueue(before);return true;}});
  }
  function removeMany(keys:readonly number[]){
    if(pending.current)return;const q=queueRef.current,requested=new Set(keys),removed=new Set(q.items.slice(q.cursor+1).filter(entry=>requested.has(entry.key)).map(entry=>entry.key));
    if(!removed.size)return;const canonical=[...canonicalRef.current];setSourceIntact(false);canonicalRef.current=canonicalRef.current.filter(e=>!removed.has(e.key));updateQueue({...q,items:q.items.filter(e=>!removed.has(e.key))});queueUndo(q,canonical,sourceIntact,removed.size===1?'Убрано из очереди':`Убрано из очереди: ${removed.size}`);
  }
  function remove(key:number){removeMany([key]);}
  function move(key:number,index:number){
    if(pending.current)return;const q=queueRef.current,from=q.items.findIndex(e=>e.key===key),target=q.items[index];
    if(from<=q.cursor||index<=q.cursor||!target||from===index)return;
    const items=moveItem(q.items,from,index),canonical=canonicalRef.current,entry=canonical.find(e=>e.key===key),remaining=canonical.filter(e=>e.key!==key),at=remaining.findIndex(e=>e.key===target.key);
    if(entry&&at>=0){remaining.splice(at+(from<index?1:0),0,entry);canonicalRef.current=remaining;}
    setSourceIntact(false);updateQueue({...q,items});
  }
  function clearUpcoming(){if(pending.current)return;const q=queueRef.current,removed=new Set(q.items.slice(q.cursor+1).map(item=>item.key));if(!removed.size)return;const canonical=[...canonicalRef.current];setSourceIntact(false);canonicalRef.current=canonicalRef.current.filter(item=>!removed.has(item.key));updateQueue({...q,items:q.items.slice(0,q.cursor+1)});queueUndo(q,canonical,sourceIntact,'Далее очищено');}
  async function removeDeletedTrack(trackId:number){
    setSourceIntact(false);
    const q=queueRef.current,plan=planDeletedTrack(q.items,q.cursor,trackId,currentRef.current?.id??null),items=plan.items;
    canonicalRef.current=deletedTrackQueue(canonicalRef.current,trackId);
    if(playlistRef.current)playlistRef.current=deletedTrackQueue(playlistRef.current,trackId);
    if(!plan.wasCurrent){updateQueue({items,cursor:plan.cursor});return;}
    restoredPosition.current=null;setCurrent(null);currentRef.current=null;
    statusRef.current={...statusRef.current,id:null,playing:false,position:0,duration:0,ended:false};setStatus(statusRef.current);
    if(plan.nextIndex>=0&&await load(items,plan.nextIndex))return;
    updateQueue({items,cursor:plan.cursor});
  }
  async function advance(natural:boolean){
    const q=queueRef.current,decision=decideAdvance({length:q.items.length,cursor:q.cursor,natural,context:contextRef.current,modes:modesRef.current});
    const tryQueue=async(items:QueueEntry[],start:number)=>{for(let index=start;index<items.length;index++){if(await load(items,index))return true;}return false;};
    if(decision.kind==='index')return tryQueue(q.items,decision.index);
    if(decision.kind==='repeat_track'){if(await jump(q.cursor))return true;return tryQueue(q.items,q.cursor+1);}
    if(decision.kind==='restart'){
      const base=contextRef.current.kind==='playlist'?(playlistRef.current||[]):canonicalRef.current;
      const ordered=modesRef.current.shuffle?shuffleFrom(base,0):{items:[...base],cursor:0};return tryQueue(ordered.items,ordered.cursor);
    }
    if(decision.kind==='autoplay'){
      const playableIds=new Set(await invoke<number[]>('playback_playable_track_ids'));
      const track=chooseAutoplay(libraryRef.current.filter(track=>playableIds.has(track.id)),current?.id??null);if(!track)return;
      const entry={key:++serial.current,track},items=[...q.items,entry];canonicalRef.current=[...canonicalRef.current,entry];contextRef.current={kind:'queue'};setContext({kind:'queue'});setSourceIntact(false);playlistRef.current=null;return load(items,items.length-1);
    }
  }
  async function next(direction:number) {
    if(direction<0)return jump(queueRef.current.cursor-1);await advance(false);
  }
  const advanceRef=useRef(advance); advanceRef.current=advance;
  useEffect(()=>{
    if(!isTauri())return;
    let alive=true, polling=false;
    const poll=async()=>{
      if(polling||pending.current) return; polling=true;
      try {
        const result=await invoke<AudioStatus>('audio_command',{action:{type:'status'}});
        if(!alive||pending.current||volumeRestoring.current) return;
        const next=result.id===null&&restoredPosition.current!==null?{...result,position:restoredPosition.current,duration:currentRef.current?.duration??0}:result;
        statusRef.current=next;setStatus(next);
        if(result.playing&&Date.now()-lastPositionPersist.current>=5000){lastPositionPersist.current=Date.now();persistSoon(0);}
        if(result.ended&&result.id!==null&&ended.current!==result.id) {
          ended.current=result.id;
          await advanceRef.current(true);
        }
      } catch(e) { if(alive) reportRef.current(e); }
      finally { polling=false; }
    };
    const timer=window.setInterval(poll,400);
    return ()=>{alive=false;clearInterval(timer);};
  },[]);
  useEffect(()=>{
    if(!isTauri()||!libraryLoaded||sessionRestoreStarted.current)return;
    sessionRestoreStarted.current=true;let alive=true;const revision=playRevision.current;
    void invoke<PlaybackSession>('playback_session').then(saved=>{
      if(!alive)return;
      if(playRevision.current!==revision){sessionRestored.current=true;persistSoon();return;}
      const restored=restorePlaybackSession(saved,libraryRef.current);
      serial.current=Math.max(serial.current,restored.maxEntryId);canonicalRef.current=[...restored.entries];queueRef.current={items:restored.entries,cursor:restored.cursor};setQueue(queueRef.current);
      currentRef.current=restored.current;setCurrent(restored.current);
      restoredPosition.current=restored.current?restored.position:null;
      const nextStatus:AudioStatus={id:null,playing:false,position:restored.position,duration:restored.current?.duration??0,volume:statusRef.current.volume,ended:false};statusRef.current=nextStatus;setStatus(nextStatus);
      sessionRestored.current=true;
    }).catch(error=>{if(alive){sessionRestored.current=true;reportRef.current(error);}});
    return()=>{alive=false;if(!sessionRestored.current)sessionRestoreStarted.current=false;};
  },[libraryLoaded]);
  useEffect(()=>()=>{if(persistTimer.current!==null)window.clearTimeout(persistTimer.current);persistNow();},[]);
  async function toggle() {
    if(status.ended&&current) return jump(queueRef.current.cursor);
    await command({type:status.playing?'pause':'resume'});
  }
  async function primaryPlay(){
    const q=queueRef.current,currentTrack=currentRef.current,decision=decideMainPlay({currentId:currentTrack?.id??null,loadedId:statusRef.current.id,queueLength:q.items.length,cursor:q.cursor,libraryLength:playableLocalTracks(libraryRef.current).length});
    if(decision.kind==='toggle_current')return toggle();
    if(decision.kind==='queue_index'){
      const resumeAt=currentTrack&&statusRef.current.id===null?q.items[decision.index]?.track.id===currentTrack.id?statusRef.current.position:0:0;
      if(await jump(decision.index)&&resumeAt>0)await command({type:'seek',seconds:resumeAt});return;
    }
    if(decision.kind==='current_track'&&currentTrack){const resumeAt=statusRef.current.position;if(await play(currentTrack,[currentTrack])&&resumeAt>0)await command({type:'seek',seconds:resumeAt});return;}
    if(decision.kind==='random_track'){
      try{const playableIds=new Set(await invoke<number[]>('playback_playable_track_ids'));const random=chooseRandomLocalTrack(libraryRef.current.filter(track=>playableIds.has(track.id)));if(random)await play(random,[random]);}
      catch(error){reportRef.current(error);}
    }
  }
  const mediaHandler=useRef<(action:string,seconds?:number|null)=>Promise<unknown>>(async()=>{});
  mediaHandler.current=async(action,seconds)=>{
    if(pending.current)return;
    if(action==='play'&&!statusRef.current.playing||action==='toggle')return primaryPlay();
    if(action==='pause'&&statusRef.current.playing)return command({type:'pause'});
    if(action==='next')return next(1);if(action==='previous')return next(-1);
    if(action==='stop')return command({type:'stop'});
    if((action==='seek'||action==='seek_by')&&typeof seconds==='number'&&Number.isFinite(seconds))return command({type:'seek',seconds:Math.max(0,Math.min(statusRef.current.duration,action==='seek_by'?statusRef.current.position+seconds:seconds))});
  };
  useEffect(()=>{if(!isTauri())return;let alive=true,stop:(()=>void)|undefined;
    void listen<{action:string;seconds?:number|null}>('media-control',event=>{void mediaHandler.current(event.payload.action,event.payload.seconds).catch(error=>reportRef.current(error));}).then(unlisten=>{if(alive)stop=unlisten;else unlisten();}).catch(error=>reportRef.current(error));
    return()=>{alive=false;stop?.();};
  },[]);
  const mediaSecond=Math.floor(status.position);
  useEffect(()=>{if(!isTauri())return;let alive=true,timer:number|undefined,attempts=0;const sync=async()=>{try{const ready=await invoke<boolean>('update_media_session',{trackId:current?.id??null,playing:status.playing,position:Math.max(0,mediaSecond)});if(!ready&&alive&&++attempts<8)timer=window.setTimeout(()=>void sync(),500);}catch(error){if(alive)reportRef.current(error);}};void sync();return()=>{alive=false;if(timer!==undefined)window.clearTimeout(timer);};},[current?.id,status.playing,mediaSecond]);
  function toggleShuffle(){const enabled=!modesRef.current.shuffle,nextModes={...modesRef.current,shuffle:enabled};modesRef.current=nextModes;setModes(nextModes);const q=queueRef.current;if(!q.items[q.cursor])return;if(enabled)updateQueue({...q,items:shuffleUpcoming(q.items,q.cursor)});else{const items=[...canonicalRef.current],cursor=items.findIndex(item=>item.key===q.items[q.cursor].key);updateQueue({items,cursor});}}
  function changeRepeat(){const repeatMode=cycleRepeat(modesRef.current.repeatMode,contextRef.current),nextModes={...modesRef.current,repeatMode};modesRef.current=nextModes;setModes(nextModes);}
  function toggleAutoplay(){const nextModes={...modesRef.current,autoplay:!modesRef.current.autoplay};modesRef.current=nextModes;setModes(nextModes);}
  const nextDecision=decideAdvance({length:queue.items.length,cursor:queue.cursor,natural:false,context,modes});
  const primaryDecision=decideMainPlay({currentId:current?.id??null,loadedId:status.id,queueLength:queue.items.length,cursor:queue.cursor,libraryLength:playableLocalTracks(localTracks).length});
  return {status,current,busy,play,next,toggle,primaryPlay,command,changeVolume,queue,enqueue,jump,remove,removeMany,move,clearUpcoming,sourceIntact,removeDeletedTrack,modes,context,toggleShuffle,changeRepeat,toggleAutoplay,canNext:nextDecision.kind!=='stop',canPrimaryPlay:primaryDecision.kind!=='nothing'};
}
export type PlayerModel=ReturnType<typeof usePlayer>;
export default function Player({player,onDetails,onQueue,onLyrics,onVisualizer,visualizerOpen,lyricsOpen,queueOpen,lyricsAvailable,liked,onToggleLike,onTrackContextMenu,onMoveToTrash,onMetadata,trashAvailable,controlOrder,controlPositions,onControlPositionsChange}:{player:PlayerModel;onDetails:()=>void;onQueue:()=>void;onLyrics:()=>void;onVisualizer:()=>void;visualizerOpen:boolean;lyricsOpen:boolean;queueOpen:boolean;lyricsAvailable:boolean;liked:boolean;onToggleLike:()=>void;onTrackContextMenu:(track:Track,point:{x:number;y:number})=>void;onMoveToTrash:(track:Track)=>void;onMetadata:(track:Track)=>void;trashAvailable:boolean;controlOrder:PlayerControlId[];controlPositions:PlayerControlPositions;onControlPositionsChange:(positions:PlayerControlPositions)=>void}) {
 const {status,current,busy}=player;
 const duration=status.duration||current?.duration||0,seek=usePlayerSeek({trackId:current?.id??null,position:status.position,duration,onCommit:seconds=>void player.command({type:'seek',seconds})});
 const available=useTrackAvailability(current?[current]:[]),missing=!!current&&available(current)==='missing';
 const [controlsLocked,setControlsLocked]=useState(()=>{try{return localStorage.getItem('undertone.player.controls.locked.v2')!=='false';}catch{return true;}});
 const [displayVolume,setDisplayVolume]=useState(status.volume),[menu,setMenu]=useState<{x:number;y:number}|null>(null);
 const previousVolume=useRef(status.volume||readVolumePreference(preferenceStorage()).lastAudible),volumeDragging=useRef(false),menuAnchor=useRef<HTMLButtonElement>(null),livePlayer=useRef(player);livePlayer.current=player;
 const blockedPlay=useRef(false);blockedPlay.current=missing&&!status.playing;
 useEffect(()=>{if(!volumeDragging.current){setDisplayVolume(status.volume);if(status.volume>0)previousVolume.current=status.volume;}},[status.volume]);
 useEffect(()=>{const key=(event:KeyboardEvent)=>{const target=event.target as HTMLElement;if(event.code!=='Space'||event.repeat||event.defaultPrevented||event.ctrlKey||event.altKey||event.metaKey||event.isComposing||document.querySelector('dialog[open],.context-menu-layer')||target.closest('button,input,textarea,select,summary,[role=grid],[role=tab],.lyrics-scroll,[contenteditable=true]'))return;const active=livePlayer.current;if(active.busy||!active.canPrimaryPlay||blockedPlay.current)return;event.preventDefault();void active.primaryPlay();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 const repeatLabel={off:'Повтор выключен',track:'Повтор трека',queue:'Повтор очереди',playlist:'Повтор плейлиста'}[player.modes.repeatMode],repeatBadge={off:'',track:'1',queue:'Q',playlist:'P'}[player.modes.repeatMode];
 const volumeRangeStyle={'--range-progress':`${Math.round(displayVolume*100)}%`} as CSSProperties;
 const seekRangeStyle={'--range-progress':`${duration?Math.max(0,Math.min(100,seek.value/duration*100)):0}%`} as CSSProperties;
 const setControlsLock=()=>{const next=!controlsLocked;setControlsLocked(next);try{localStorage.setItem('undertone.player.controls.locked.v2',String(next));}catch{/* Optional UI storage. */}};
 const closeMenu=()=>{setMenu(null);menuAnchor.current?.focus({preventScroll:true});};
 const controls={
  shuffle:<Tooltip content="Перемешать"><IconButton className="player-shuffle" aria-label={player.modes.shuffle?'Выключить перемешивание':'Включить перемешивание'} aria-pressed={player.modes.shuffle} disabled={!current||busy} onClick={player.toggleShuffle}><Shuffle/></IconButton></Tooltip>,
  previous:<Tooltip content="Предыдущий трек"><IconButton aria-label="Предыдущий трек" disabled={!current||busy||(player.queue.cursor<=0&&status.position<=3)} onClick={()=>status.position>3?void player.command({type:'seek',seconds:0}):void player.next(-1)}><SkipBack/></IconButton></Tooltip>,
  play:<Tooltip content={status.playing?'Пауза':'Воспроизвести'}><Button className="play-toggle" variant="primary" size="lg" aria-label={status.playing?'Пауза':'Воспроизвести'} disabled={busy||!player.canPrimaryPlay||(missing&&!status.playing)} onClick={()=>void player.primaryPlay()}>{status.playing?<Pause size={24}/>:<Play size={24} fill="currentColor"/>}</Button></Tooltip>,
  next:<Tooltip content="Следующий трек"><IconButton aria-label="Следующий трек" disabled={!current||busy||!player.canNext} onClick={()=>void player.next(1)}><SkipForward/></IconButton></Tooltip>,
  repeat:<Tooltip content={repeatLabel}><IconButton className="repeat-mode" aria-label={repeatLabel} aria-pressed={player.modes.repeatMode!=='off'} disabled={!current||busy} onClick={player.changeRepeat}><Repeat2/>{repeatBadge&&<small>{repeatBadge}</small>}</IconButton></Tooltip>,
  queue:<Tooltip content="Очередь"><IconButton className="player-queue" aria-label="Открыть очередь" aria-pressed={queueOpen} onClick={onQueue}><ListMusic/></IconButton></Tooltip>,
  lyrics:<Tooltip content="Текст песни"><IconButton className="player-lyrics" aria-label="Текст песни" aria-pressed={lyricsOpen} disabled={lyricsButtonDisabled(lyricsAvailable,lyricsOpen)} onClick={onLyrics}><MicVocal/></IconButton></Tooltip>,
 } as Record<PlayerControlId,ReactNode>;
 const zoneOrder=(ids:PlayerControlId[])=>controlOrder.filter(id=>ids.includes(id));
 const updateZone=(next:PlayerControlPositions)=>onControlPositionsChange({...controlPositions,...next});
 return <footer className="player" aria-label="Плеер">
  <div className="player-left"><button className="now-playing" aria-label={current?`Сейчас играет: ${current.title}`:'Выберите трек'} onClick={onDetails} onContextMenu={event=>{if(current)openContextMenu(event,point=>onTrackContextMenu(current,point));}} disabled={!current} title={current?'Открыть Now Playing':undefined}><Cover track={current} size="small"/><span><strong title={current?.title}>{current?.title||'Ничего не играет'}</strong><small title={current?.artist}>{missing?<><FileWarning size={14}/>Файл недоступен</>:current?.artist||'Выберите трек из библиотеки'}</small></span></button><Tooltip content={liked?'Убрать из любимых':'Добавить в любимые'}><IconButton className="player-like" aria-label={liked?'Убрать из любимых':'Добавить в любимые'} aria-pressed={liked} disabled={!current||busy} onClick={onToggleLike}><Heart fill={liked?'currentColor':'none'}/></IconButton></Tooltip><Tooltip content="Действия с треком"><IconButton className="player-context" aria-label="Действия с треком" aria-haspopup="menu" disabled={!current} onClick={event=>{if(current){const rect=event.currentTarget.getBoundingClientRect();onTrackContextMenu(current,{x:rect.left,y:rect.top});requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.track-context-menu [role=menuitem]:not(:disabled)')?.focus());}}}><MoreHorizontal/></IconButton></Tooltip></div>
  <div className="transport"><PlayerControlStrip order={zoneOrder(['shuffle','previous','play','next','repeat'])} positions={controlPositions} controls={controls} onPositionsChange={updateZone} locked={controlsLocked}/><div className="seek"><span>{time(seek.value)}</span><input aria-label="Позиция воспроизведения" aria-valuetext={`${time(seek.value)} из ${time(duration)}`} type="range" min="0" max={duration||1} step="0.1" value={seek.value} style={seekRangeStyle} disabled={!current||busy||missing} {...seek.handlers}/><span>{time(duration)}</span></div></div>
  <div className="player-output"><div className="player-utility-actions"><PlayerControlStrip order={zoneOrder(['queue','lyrics'])} positions={controlPositions} controls={controls} onPositionsChange={updateZone} locked={controlsLocked}/><Tooltip content="Действия плеера"><IconButton ref={menuAnchor} className="player-more" aria-label="Действия плеера" aria-haspopup="menu" aria-expanded={!!menu} onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();setMenu({x:rect.left,y:rect.top});requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.track-context-menu [role=menuitem]:not(:disabled)')?.focus());}}><MoreHorizontal/></IconButton></Tooltip></div>
   <div className="volume-group" onWheel={event=>{event.preventDefault();const value=volumeFromWheel(displayVolume,event.deltaY);if(value===displayVolume)return;if(value>0)previousVolume.current=value;setDisplayVolume(value);void player.changeVolume(value);}}><div className="volume-control"><Tooltip content="Громкость"><IconButton aria-label={displayVolume?'Выключить звук':'Включить звук'} aria-pressed={displayVolume===0} onClick={()=>{const value=displayVolume?0:previousVolume.current;if(displayVolume)previousVolume.current=displayVolume;setDisplayVolume(value);void player.changeVolume(value);}}>{displayVolume?<Volume2/>:<VolumeX/>}</IconButton></Tooltip><input aria-label="Громкость" aria-valuetext={volumePercent(displayVolume)} type="range" min="0" max="1" step="0.01" value={displayVolume} style={volumeRangeStyle} onPointerDown={()=>{volumeDragging.current=true;}} onPointerUp={()=>{volumeDragging.current=false;}} onPointerCancel={()=>{volumeDragging.current=false;}} onBlur={()=>{volumeDragging.current=false;}} onChange={e=>{const value=+e.target.value;if(value>0)previousVolume.current=value;setDisplayVolume(value);void player.changeVolume(value);}}/></div><output className="volume-readout" aria-label="Текущая громкость">{volumePercent(displayVolume)}</output></div>
  </div>
  {menu&&<ContextMenu point={menu} label="Действия плеера" onClose={closeMenu}>{run=><><MenuSection><MenuItem icon={<Info size={16}/>} disabled={!current} onClick={()=>void run(()=>{if(current)onMetadata(current);})}>Метаданные</MenuItem><MenuItem icon={<Radio size={16}/>} trailing={player.modes.autoplay?'Вкл.':'Выкл.'} onClick={()=>void run(player.toggleAutoplay)}>Автовоспроизведение</MenuItem><MenuItem icon={<AudioLines size={16}/>} onClick={()=>void run(onVisualizer)}>{visualizerOpen?'Закрыть визуализатор':'Открыть визуализатор'}</MenuItem></MenuSection><MenuSection><MenuItem icon={controlsLocked?<LockKeyhole size={16}/>:<LockKeyholeOpen size={16}/>} onClick={()=>void run(setControlsLock)}>{controlsLocked?'Разблокировать расположение кнопок':'Закрепить расположение кнопок'}</MenuItem></MenuSection><MenuSection separated><MenuItem destructive icon={<Trash2 size={16}/>} disabled={!current||busy||!trashAvailable} onClick={()=>void run(()=>{if(current)onMoveToTrash(current);})}>Переместить в удалённые</MenuItem></MenuSection></>}</ContextMenu>}
 </footer>;
}
