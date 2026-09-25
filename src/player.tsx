import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, ListMusic, Shuffle, Repeat2, Radio, MicVocal, Heart, Trash2 } from 'lucide-react';
import { AudioStatus, PlaybackSession, Track, time } from './types';
import { Cover } from './ui';
import { moveItem } from './libraryModel';
import { chooseAutoplay, cycleRepeat, decideAdvance, shuffleFrom, shuffleUpcoming, type PlaybackContext, type PlaybackModes } from './playbackModes';
import { openContextMenu } from './trackContextMenuModel';
import { lyricsButtonDisabled } from './lyricsViewModel';
import { deletedTrackQueue, planDeletedTrack } from './deletedSongsModel';
import { chooseRandomLocalTrack, decideMainPlay, playbackSessionSnapshot, playableLocalTracks, restorePlaybackSession } from './playbackSessionModel';
import { Tooltip } from './Tooltip';
import { volumeAction, volumeFromWheel, volumePercent } from './playerVolumeModel';
import './playerResponsive.css';
import {MusicVisualizer} from './MusicVisualizer';
import PlayerControlStrip from './PlayerControlStrip';
import type {PlayerControlId} from './playerControlLayout';

export type QueueEntry={key:number;track:Track};
export type PlayContext={kind:'playlist';playlistId:number};
export function usePlayer(report:(error:unknown)=>void,onStarted?:()=>void,localTracks:Track[]=[],libraryLoaded=false) {
  const [status,setStatus]=useState<AudioStatus>({id:null,playing:false,position:0,duration:0,volume:0.65,ended:false});
  const [current,setCurrent]=useState<Track|null>(null);
  const [busy,setBusy]=useState(false);
  const [queue,setQueue]=useState<{items:QueueEntry[];cursor:number}>({items:[],cursor:-1});
  const [modes,setModes]=useState<PlaybackModes>({shuffle:false,repeatMode:'off',autoplay:false});
  const [context,setContext]=useState<PlaybackContext>({kind:'queue'});
  const queueRef=useRef(queue), serial=useRef(0), pending=useRef(0), ended=useRef<number|null>(null),statusRef=useRef(status),volumeSerial=useRef(0);
  const modesRef=useRef(modes),contextRef=useRef<PlaybackContext>(context),canonicalRef=useRef<QueueEntry[]>([]),playlistRef=useRef<QueueEntry[]|null>(null),libraryRef=useRef(localTracks),currentRef=useRef(current);
  const sessionRestoreStarted=useRef(false),sessionRestored=useRef(false),persistTimer=useRef<number|null>(null),persistChain=useRef<Promise<unknown>>(Promise.resolve()),lastPositionPersist=useRef(0);
  modesRef.current=modes;libraryRef.current=localTracks;currentRef.current=current;
  const startedRef=useRef(onStarted);startedRef.current=onStarted;
  const reportRef=useRef(report); reportRef.current=report;
  function persistNow(){
    if(!isTauri()||!sessionRestored.current)return;
    const q=queueRef.current,snapshot=playbackSessionSnapshot(q.items,q.cursor,currentRef.current,statusRef.current.position);
    persistChain.current=persistChain.current.catch(()=>{}).then(()=>invoke('save_playback_session',{session:snapshot})).catch(error=>reportRef.current(error));
  }
  function persistSoon(delay=180){if(!sessionRestored.current)return;if(persistTimer.current!==null)window.clearTimeout(persistTimer.current);persistTimer.current=window.setTimeout(()=>{persistTimer.current=null;persistNow();},delay);}
  function updateQueue(value:typeof queue){queueRef.current=value;setQueue(value);persistSoon();}
  async function command(action:Record<string,unknown>) {
    pending.current++; setBusy(true);
    try { const result=await invoke<AudioStatus>('audio_command',{action}); statusRef.current=result;setStatus(result);if(action.type!=='status')persistSoon();if(result.warning)reportRef.current(result.warning); return result; }
    catch(e) { reportRef.current(e); return null; }
    finally { pending.current--; setBusy(pending.current>0); }
  }
  const changeVolume=useCallback(async(value:number)=>{
    const request=++volumeSerial.current;
    try{
      const result=await invoke<AudioStatus>('audio_command',{action:volumeAction(value)});
      if(request===volumeSerial.current)statusRef.current={...statusRef.current,volume:result.volume};
      if(result.warning)reportRef.current(result.warning);
      return result;
    }catch(error){reportRef.current(error);return null;}
  },[]);
  async function load(items:QueueEntry[],cursor:number) {
    if(pending.current||!items[cursor])return false;
    const track=items[cursor].track;
    const result=await command({type:'play',id:track.id});
    if(result){updateQueue({items,cursor});currentRef.current=track;setCurrent(track);ended.current=null;startedRef.current?.();persistSoon();return true;}return false;
  }
  async function play(track:Track, tracks:Track[]=[track],index=tracks.findIndex(t=>t.id===track.id),source?:PlayContext) {
    if(index<0)return false;
    const canonical=tracks.map(t=>({key:++serial.current,track:t}));
    const ordered=modesRef.current.shuffle?shuffleFrom(canonical,index):{items:canonical,cursor:index};
    if(await load(ordered.items,ordered.cursor)){canonicalRef.current=canonical;const nextContext:PlaybackContext=source??{kind:'queue'};contextRef.current=nextContext;setContext(nextContext);playlistRef.current=source?canonical:null;return true;}return false;
  }
  async function jump(index:number){return load(queueRef.current.items,index);}
  function enqueue(track:Track,playNext=false){
    if(pending.current)return;
    const q=queueRef.current,items=[...q.items],entry={key:++serial.current,track};
    items.splice(playNext?q.cursor+1:items.length,0,entry);
    const canonical=[...canonicalRef.current],currentKey=q.items[q.cursor]?.key,at=playNext&&currentKey!==undefined?canonical.findIndex(item=>item.key===currentKey)+1:canonical.length;canonical.splice(Math.max(0,at),0,entry);canonicalRef.current=canonical;updateQueue({...q,items});
  }
  function remove(key:number){if(pending.current)return;const q=queueRef.current,index=q.items.findIndex(e=>e.key===key);if(index<=q.cursor)return;canonicalRef.current=canonicalRef.current.filter(e=>e.key!==key);updateQueue({...q,items:q.items.filter(e=>e.key!==key)});}
  function move(key:number,index:number){if(pending.current)return;const q=queueRef.current,from=q.items.findIndex(e=>e.key===key);if(from<=q.cursor||index<=q.cursor)return;const items=moveItem(q.items,from,index),canonical=canonicalRef.current,canonicalFrom=canonical.findIndex(e=>e.key===key);canonicalRef.current=canonicalFrom<0?canonical:moveItem(canonical,canonicalFrom,Math.min(index,canonical.length-1));updateQueue({...q,items});}
  function clearUpcoming(){if(pending.current)return;const q=queueRef.current,removed=new Set(q.items.slice(q.cursor+1).map(item=>item.key));canonicalRef.current=canonicalRef.current.filter(item=>!removed.has(item.key));updateQueue({...q,items:q.items.slice(0,q.cursor+1)});}
  async function removeDeletedTrack(trackId:number){
    const q=queueRef.current,plan=planDeletedTrack(q.items,q.cursor,trackId,currentRef.current?.id??null),items=plan.items;
    canonicalRef.current=deletedTrackQueue(canonicalRef.current,trackId);
    if(playlistRef.current)playlistRef.current=deletedTrackQueue(playlistRef.current,trackId);
    if(!plan.wasCurrent){updateQueue({items,cursor:plan.cursor});return;}
    setCurrent(null);currentRef.current=null;
    statusRef.current={...statusRef.current,id:null,playing:false,position:0,duration:0,ended:false};setStatus(statusRef.current);
    if(plan.nextIndex>=0&&await load(items,plan.nextIndex))return;
    updateQueue({items,cursor:plan.cursor});
  }
  async function advance(natural:boolean){
    const q=queueRef.current,decision=decideAdvance({length:q.items.length,cursor:q.cursor,natural,context:contextRef.current,modes:modesRef.current});
    if(decision.kind==='index')return jump(decision.index);
    if(decision.kind==='repeat_track')return jump(q.cursor);
    if(decision.kind==='restart'){
      const base=contextRef.current.kind==='playlist'?(playlistRef.current||[]):canonicalRef.current;
      const ordered=modesRef.current.shuffle?shuffleFrom(base,0):{items:[...base],cursor:0};return load(ordered.items,ordered.cursor);
    }
    if(decision.kind==='autoplay'){
      const track=chooseAutoplay(libraryRef.current,current?.id??null);if(!track)return;
      const entry={key:++serial.current,track},items=[...q.items,entry];canonicalRef.current=[...canonicalRef.current,entry];contextRef.current={kind:'queue'};setContext({kind:'queue'});playlistRef.current=null;return load(items,items.length-1);
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
        if(!alive||pending.current) return;
        statusRef.current=result;setStatus(result);
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
    sessionRestoreStarted.current=true;let alive=true;
    void invoke<PlaybackSession>('playback_session').then(saved=>{
      if(!alive)return;
      const restored=restorePlaybackSession(saved,libraryRef.current);
      serial.current=Math.max(serial.current,restored.maxEntryId);canonicalRef.current=[...restored.entries];queueRef.current={items:restored.entries,cursor:restored.cursor};setQueue(queueRef.current);
      currentRef.current=restored.current;setCurrent(restored.current);
      const nextStatus:AudioStatus={id:null,playing:false,position:restored.position,duration:restored.current?.duration??0,volume:statusRef.current.volume,ended:false};statusRef.current=nextStatus;setStatus(nextStatus);
      sessionRestored.current=true;
    }).catch(error=>{if(alive){sessionRestored.current=true;reportRef.current(error);}});
    return()=>{alive=false;};
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
  function toggleShuffle(){const enabled=!modesRef.current.shuffle,nextModes={...modesRef.current,shuffle:enabled};modesRef.current=nextModes;setModes(nextModes);const q=queueRef.current;if(!q.items[q.cursor])return;if(enabled)updateQueue({...q,items:shuffleUpcoming(q.items,q.cursor)});else{const items=[...canonicalRef.current],cursor=items.findIndex(item=>item.key===q.items[q.cursor].key);updateQueue({items,cursor});}}
  function changeRepeat(){const repeatMode=cycleRepeat(modesRef.current.repeatMode,contextRef.current),nextModes={...modesRef.current,repeatMode};modesRef.current=nextModes;setModes(nextModes);}
  function toggleAutoplay(){const nextModes={...modesRef.current,autoplay:!modesRef.current.autoplay};modesRef.current=nextModes;setModes(nextModes);}
  const nextDecision=decideAdvance({length:queue.items.length,cursor:queue.cursor,natural:false,context,modes});
  const primaryDecision=decideMainPlay({currentId:current?.id??null,loadedId:status.id,queueLength:queue.items.length,cursor:queue.cursor,libraryLength:playableLocalTracks(localTracks).length});
  return {status,current,busy,play,next,toggle,primaryPlay,command,changeVolume,queue,enqueue,jump,remove,move,clearUpcoming,removeDeletedTrack,modes,context,toggleShuffle,changeRepeat,toggleAutoplay,canNext:nextDecision.kind!=='stop',canPrimaryPlay:primaryDecision.kind!=='nothing'};
}
export type PlayerModel=ReturnType<typeof usePlayer>;
export default function Player({player,onDetails,onQueue,onLyrics,onVisualizer,visualizerOpen,lyricsOpen,lyricsAvailable,liked,onToggleLike,onTrackContextMenu,onMoveToTrash,trashAvailable,controlOrder,onControlOrderChange}:{player:PlayerModel;onDetails:()=>void;onQueue:()=>void;onLyrics:()=>void;onVisualizer:()=>void;visualizerOpen:boolean;lyricsOpen:boolean;lyricsAvailable:boolean;liked:boolean;onToggleLike:()=>void;onTrackContextMenu:(track:Track,point:{x:number;y:number})=>void;onMoveToTrash:(track:Track)=>void;trashAvailable:boolean;controlOrder:PlayerControlId[];onControlOrderChange:(order:PlayerControlId[])=>void}) {
  const {status,current,busy}=player;
  const [seek,setSeek]=useState<number|null>(null);
  const [controlsLocked,setControlsLocked]=useState(()=>{try{return localStorage.getItem('undertone.player.controls.locked')!=='false';}catch{return true;}});
  const [displayVolume,setDisplayVolume]=useState(status.volume);
  const previousVolume=useRef(0.65),volumeDragging=useRef(false);
  useEffect(()=>{if(!volumeDragging.current)setDisplayVolume(status.volume);},[status.volume]);
  const repeatLabel={off:'Повтор выключен',track:'Повтор трека',queue:'Повтор очереди',playlist:'Повтор плейлиста'}[player.modes.repeatMode];
  const repeatBadge={off:'',track:'1',queue:'Q',playlist:'P'}[player.modes.repeatMode];
  const volumeRangeStyle={'--range-progress':`${Math.round(displayVolume*100)}%`} as CSSProperties;
  const seekValue=seek??Math.min(status.position,status.duration);
  const seekRangeStyle={'--range-progress':`${status.duration?Math.max(0,Math.min(100,seekValue/status.duration*100)):0}%`} as CSSProperties;
  const setControlsLock=()=>{const next=!controlsLocked;setControlsLocked(next);try{localStorage.setItem('undertone.player.controls.locked',String(next));}catch{/* Storage can be unavailable. */}};
  const controls:Record<PlayerControlId,ReactNode>={
    shuffle:<Tooltip content={player.modes.shuffle?'Выключить перемешивание':'Перемешать'}><button className={`icon-button ${player.modes.shuffle?'mode-active':''}`} aria-label={player.modes.shuffle?'Выключить перемешивание':'Включить перемешивание'} disabled={!current||busy} onClick={player.toggleShuffle}><Shuffle size={17}/></button></Tooltip>,
    previous:<Tooltip content="Предыдущий трек"><button className="icon-button" aria-label="Предыдущий трек" disabled={!current||busy} onClick={()=>status.position>3?void player.command({type:'seek',seconds:0}):void player.next(-1)}><SkipBack size={19} fill="currentColor"/></button></Tooltip>,
    play:<Tooltip content={status.playing?'Пауза':'Воспроизвести'}><button className="play-toggle" aria-label={status.playing?'Пауза':'Воспроизвести'} disabled={busy||!player.canPrimaryPlay} onClick={()=>void player.primaryPlay()}>{status.playing?<Pause size={20} fill="currentColor"/>:<Play size={20} fill="currentColor"/>}</button></Tooltip>,
    next:<Tooltip content="Следующий трек"><button className="icon-button" aria-label="Следующий трек" disabled={!current||busy||!player.canNext} onClick={()=>void player.next(1)}><SkipForward size={19} fill="currentColor"/></button></Tooltip>,
    repeat:<Tooltip content={`${repeatLabel}. Нажмите, чтобы изменить режим`}><button className={`icon-button repeat-mode ${player.modes.repeatMode!=='off'?'mode-active':''}`} aria-label={repeatLabel} disabled={!current||busy} onClick={player.changeRepeat}><Repeat2 size={17}/>{repeatBadge&&<small>{repeatBadge}</small>}</button></Tooltip>,
    like:<Tooltip content={liked?'Убрать из любимых':'Добавить в любимые'}><button className={`icon-button player-like ${liked?'liked':''}`} aria-pressed={liked} aria-label={liked?'Убрать из любимых':'Добавить в любимые'} disabled={!current||busy} onClick={onToggleLike}><Heart size={18} fill={liked?'currentColor':'none'}/></button></Tooltip>,
    trash:<Tooltip content={trashAvailable?'Переместить в удалённые':'Выберите папку удалённых песен в настройках'}><button className="icon-button player-trash" aria-label="Переместить в удалённые" disabled={!current||busy||!trashAvailable} onClick={()=>{if(current)onMoveToTrash(current);}}><Trash2 size={18}/></button></Tooltip>,
    autoplay:<Tooltip content={player.modes.autoplay?'Автовоспроизведение включено':'Автовоспроизведение выключено'}><button className={`icon-button player-autoplay ${player.modes.autoplay?'mode-active':''}`} aria-label={player.modes.autoplay?'Выключить автовоспроизведение':'Включить автовоспроизведение'} onClick={player.toggleAutoplay}><Radio size={18}/></button></Tooltip>,
    queue:<Tooltip content="Очередь"><button className="icon-button player-queue" aria-label="Открыть очередь" onClick={onQueue}><ListMusic size={19}/></button></Tooltip>,
    lyrics:<Tooltip content="Текст песни"><button className={`icon-button player-lyrics ${lyricsOpen?'mode-active':''}`} aria-label="Текст песни" disabled={lyricsButtonDisabled(lyricsAvailable,lyricsOpen)} onClick={onLyrics}><MicVocal size={18}/></button></Tooltip>,
    visualizer:<MusicVisualizer playing={status.playing} hasTrack={current!==null} open={visualizerOpen} onToggle={onVisualizer}/>,
    volume:<div className="volume-group" onWheel={event=>{event.preventDefault();const value=volumeFromWheel(displayVolume,event.deltaY);if(value===displayVolume)return;if(value>0)previousVolume.current=value;setDisplayVolume(value);void player.changeVolume(value);}}>
      <Tooltip content="Громкость"><div className="volume-control"><button className="icon-button" aria-label={displayVolume?'Выключить звук':'Включить звук'} onClick={()=>{const value=displayVolume?0:previousVolume.current;if(displayVolume)previousVolume.current=displayVolume;setDisplayVolume(value);void player.changeVolume(value);}}>{displayVolume?<Volume2 size={19}/>:<VolumeX size={19}/>}</button>
      <input aria-label="Громкость" type="range" min="0" max="1" step="0.01" value={displayVolume} style={volumeRangeStyle} onPointerDown={()=>{volumeDragging.current=true;}} onPointerUp={()=>{volumeDragging.current=false;}} onPointerCancel={()=>{volumeDragging.current=false;}} onBlur={()=>{volumeDragging.current=false;}} onChange={e=>{const value=+e.target.value;if(value>0)previousVolume.current=value;setDisplayVolume(value);void player.changeVolume(value);}}/></div></Tooltip>
      <output className="volume-readout" aria-label="Текущая громкость" aria-live="polite">{volumePercent(displayVolume)}</output>
    </div>,
  };
  return <footer className="player">
    <div className="player-left">
      <div className="player-track-group">
        <button className="now-playing" onClick={onDetails} onContextMenu={event=>{if(current)openContextMenu(event,point=>onTrackContextMenu(current,point));}} disabled={!current} title="Информация о треке">
          <Cover track={current} size="small"/>
          <span><strong>{current?.title||'Музыка начинается с вас'}</strong><small>{current?.artist||'Выберите трек из библиотеки'}</small></span>
        </button>
        <div className="player-track-actions" aria-label="Действия с текущим треком">{controls.like}{controls.trash}</div>
      </div>
    </div>
    <div className="transport">
      <PlayerControlStrip order={controlOrder} excluded={['volume','like','trash']} controls={controls} onOrderChange={onControlOrderChange} locked={controlsLocked} onToggleLocked={setControlsLock}/>
      <div className="seek"><span>{time(seekValue)}</span><input aria-label="Позиция воспроизведения" type="range" min="0" max={status.duration||1} step="0.1" value={seekValue} style={seekRangeStyle} disabled={!current||busy} onChange={e=>setSeek(+e.target.value)} onPointerUp={e=>{void player.command({type:'seek',seconds:+e.currentTarget.value});setSeek(null);}} onKeyUp={e=>{if(e.key.startsWith('Arrow')||['Home','End','PageUp','PageDown'].includes(e.key)){void player.command({type:'seek',seconds:+e.currentTarget.value});setSeek(null);}}} onBlur={()=>setSeek(null)}/><span>{time(status.duration)}</span></div>
    </div>
    <div className="player-output">
      {current&&<span className="format player-format">{current.format}</span>}
      <div className="player-volume-dock player-control-item player-control-volume">{controls.volume}</div>
    </div>
  </footer>;
}
