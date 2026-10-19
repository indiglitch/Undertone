import {useEffect,useMemo,useRef,useState} from 'react';
import {MicVocal} from 'lucide-react';
import type {ExternalLyricsStatus,LyricsDocument,Track} from './types';
import {activeLyricIndex,lyricLineTone,lyricsDisplayKind,lyricsSourceHelp,lyricsSourceLabel,seekSyncedLine,lyricsFailureMessage,manualFollowDelay,type LyricsFailure} from './lyricsViewModel';
import PageHeader from './PageHeader';
import {Button,Tooltip} from './ui';
import './LyricsPresentation.css';

export type LyricsViewProps={track:Track|null;lyrics:LyricsDocument|null;loading:boolean;position:number;onSeek?:(seconds:number)=>void;compact?:boolean;showHeader?:boolean;status?:ExternalLyricsStatus|'idle'|'searching';error?:LyricsFailure|null;lookupAvailable?:boolean;onLookup?:()=>void;retryAfter?:number|null;following?:boolean;onFollowingChange?:(following:boolean)=>void};
/** Canonical presentation for both page and embedded Now Playing, with no lookup on render. */
export default function LyricsView({track,lyrics,loading,position,onSeek,compact=false,showHeader=!compact,status='idle',error=null,lookupAvailable=false,onLookup,retryAfter,following,onFollowingChange}:LyricsViewProps){
 const scroll=useRef<HTMLDivElement>(null),lines=useRef<(HTMLButtonElement|null)[]>([]),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [geometry,setGeometry]=useState(''),[clock,setClock]=useState(Date.now()),[ownFollowing,setOwnFollowing]=useState(true),follow=following??ownFollowing;
 const active=useMemo(()=>lyrics?.synced.length?activeLyricIndex(lyrics.synced,position):-1,[lyrics,position]),kind=lyricsDisplayKind(lyrics);
 const setFollow=(value:boolean)=>{setOwnFollowing(value);onFollowingChange?.(value);};
 const clearTimer=()=>{if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}};
 useEffect(()=>{clearTimer();setFollow(true);return clearTimer;},[track?.id]);
 useEffect(()=>{const el=scroll.current;if(!el)return;const size=()=>{el.style.setProperty('--lyrics-center-padding',`${Math.max(24,el.clientHeight/2-24)}px`);setGeometry(`${el.clientWidth}:${el.clientHeight}`);};size();const observer=new ResizeObserver(size);observer.observe(el);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(!follow||active<0||loading)return;const el=scroll.current,line=lines.current[active];if(!el||!line)return;const frame=requestAnimationFrame(()=>{const rect=line.getBoundingClientRect(),viewport=el.getBoundingClientRect();el.scrollTo({top:el.scrollTop+rect.top-viewport.top+rect.height/2-el.clientHeight/2,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});return()=>cancelAnimationFrame(frame);},[active,follow,track?.id,lyrics?.revision,loading,geometry]);
 const manual=()=>{if(kind!=='synced')return;clearTimer();scroll.current?.scrollTo({top:scroll.current.scrollTop,behavior:'auto'});setFollow(false);timer.current=setTimeout(()=>{timer.current=null;setFollow(true);},manualFollowDelay);};
 const returnToCurrent=()=>{clearTimer();setFollow(true);if(onSeek)lines.current[active]?.focus({preventScroll:true});else scroll.current?.focus({preventScroll:true});};
 useEffect(()=>{if(retryAfter==null)return;const delay=retryAfter*1000-Date.now();if(delay<=0){setClock(Date.now());return;}const id=setTimeout(()=>setClock(Date.now()),delay+10);return()=>clearTimeout(id);},[retryAfter]);
 const searching=status==='searching',waiting=retryAfter!=null&&retryAfter>clock/1000;
 const lookupAction=!lyrics&&lookupAvailable&&onLookup&&!loading?<Button disabled={searching||waiting} onClick={onLookup}>{searching?'Поиск текста…':error?'Повторить':'Найти текст'}</Button>:null;
 return <section className={`lyrics-screen ${compact?'lyrics-embedded':''}`} aria-label="Текст песни">
  {showHeader&&<PageHeader icon={<MicVocal size={28}/>} title={track?.title||'Текст песни'} subtitle={track?.artist||'Выберите трек'} actions={lyrics&&<Tooltip content={lyricsSourceHelp(lyrics.origin)}><small className="lyrics-source-badge">{lyricsSourceLabel(lyrics.origin)}</small></Tooltip>}/>}
  <div className="lyrics-content">
   <div ref={scroll} className="lyrics-scroll" tabIndex={0} aria-label="Текст песни — прокрутка" onWheel={manual} onTouchMove={manual} onPointerDown={event=>{if(!(event.target as HTMLElement).closest('button'))manual();}} onKeyDown={event=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End'].includes(event.key))manual();}}>
    {(loading||searching)&&!lyrics?<div className="lyrics-empty" role="status">{searching?'Поиск текста…':'Загрузка текста…'}</div>:!track?<div className="lyrics-empty">Сначала выберите трек.</div>:kind==='synced'?<div className="synced-lyrics">{lyrics!.synced.map((line,index)=><button key={`${line.order}-${line.timestamp_ms}`} ref={element=>{lines.current[index]=element;}} className={lyricLineTone(index,active)} aria-current={index===active?'true':undefined} disabled={!onSeek} aria-label={`${line.text||'Музыкальная пауза'} — ${Math.floor(line.timestamp_ms/60000)}:${String(Math.floor(line.timestamp_ms/1000)%60).padStart(2,'0')}`} onClick={()=>{if(onSeek){clearTimer();setFollow(true);seekSyncedLine(line,onSeek);}}}>{line.text||'♪'}</button>)}</div>:kind==='plain'?<pre className="plain-lyrics">{lyrics!.plain}</pre>:<div className="lyrics-empty"><h2>{error?'Не удалось получить текст':status==='ambiguous'?'Найдено несколько похожих вариантов':'Текст не найден'}</h2><p>{error?lyricsFailureMessage(error):status==='ambiguous'?'Источник не подтвердил точное совпадение. Автоматический выбор не выполнен.':lookupAvailable?'Можно явно проверить внешний источник текстов.':'Внешний поиск текстов недоступен в этой сборке.'}</p>{lookupAction}{waiting&&<small>Повторная проверка доступна после {new Date(retryAfter!*1000).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})}.</small>}</div>}
   </div>
   {kind==='synced'&&!follow&&active>=0&&<Button className="lyrics-return" onClick={returnToCurrent}>К текущей строке</Button>}
  </div>
  {!!lyrics&&error&&<p className="lyrics-status-note" role="status">{lyricsFailureMessage(error)} Сохранённый текст остаётся доступен.</p>}
 </section>;
}
