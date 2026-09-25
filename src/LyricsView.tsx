import { useEffect, useMemo, useRef } from 'react';
import { MicVocal } from 'lucide-react';
import type { LyricsDocument, Track } from './types';
import { activeLyricIndex, lyricLineTone, lyricsDisplayKind, lyricsSourceHelp, lyricsSourceLabel, seekSyncedLine, shouldAutoScroll, suppressAutoScrollUntil } from './lyricsViewModel';
import { Tooltip } from './Tooltip';

export function LyricsRenderer({trackId,lyrics,loading,position,onSeek,compact=false}:{trackId:number|null;lyrics:LyricsDocument|null;loading:boolean;position:number;onSeek:(seconds:number)=>void;compact?:boolean}){
  const lines=useRef<(HTMLButtonElement|null)[]>([]),manualUntil=useRef(0);
  const active=useMemo(()=>lyrics?.synced.length?activeLyricIndex(lyrics.synced,position):-1,[lyrics,position]);
  const kind=lyricsDisplayKind(lyrics);
  useEffect(()=>{
    if(active<0||!shouldAutoScroll(Date.now(),manualUntil.current))return;
    lines.current[active]?.scrollIntoView({block:'center',behavior:'smooth'});
  },[active,trackId]);
  const suppress=()=>{manualUntil.current=suppressAutoScrollUntil(Date.now());};
  return <div className={`lyrics-scroll ${compact?'compact':''}`} onWheel={suppress} onTouchMove={suppress} onPointerDown={suppress}>
    {loading?<div className="lyrics-empty">Загрузка текста…</div>:trackId===null?<div className="lyrics-empty">Сначала выберите трек.</div>:kind==='synced'?<div className="synced-lyrics">{lyrics!.synced.map((line,index)=><button key={`${line.order}-${line.timestamp_ms}`} ref={element=>{lines.current[index]=element;}} className={lyricLineTone(index,active)} onClick={()=>seekSyncedLine(line,onSeek)}>{line.text||'♪'}</button>)}</div>:kind==='plain'?<pre className="plain-lyrics">{lyrics!.plain}</pre>:<div className="lyrics-empty"><MicVocal size={34}/><h2>Текст недоступен</h2><p>Для этого трека текст пока не найден.</p></div>}
  </div>;
}

export default function LyricsView({track,lyrics,loading,position,onSeek}:{track:Track|null;lyrics:LyricsDocument|null;loading:boolean;position:number;onSeek:(seconds:number)=>void}){
  return <section className="lyrics-screen" aria-label="Текст песни">
    <header><span><MicVocal size={18}/>ТЕКСТ ПЕСНИ</span><h1>{track?.title||'Текст песни'}</h1><p>{track?.artist||'Выберите трек'}</p>{lyrics&&<Tooltip content={lyricsSourceHelp(lyrics.origin)}><small className="lyrics-source-badge">{lyricsSourceLabel(lyrics.origin)}</small></Tooltip>}</header>
    <LyricsRenderer trackId={track?.id??null} lyrics={lyrics} loading={loading} position={position} onSeek={onSeek}/>
  </section>;
}
