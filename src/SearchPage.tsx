import {useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {ArrowRight,Search,X} from 'lucide-react';
import {Button,IconButton,SearchInput,Tabs,Tooltip} from './ui';
import PageHeader from './PageHeader';
import EntityGrid,{EntityCard,type EntityCardData} from './EntityGrid';
import type {LocalSearchEntity,LocalSearchResults} from './libraryModel';
import type {Track} from './types';
import type {NavigationPage} from './navigationModel';
import type {CollectionMenuTarget} from './CollectionContextMenu';
import {recentSearchKey,recentSearches,rememberSearch} from './searchPreferences';
import './SearchPage.css';
type Category='all'|'tracks'|'albums'|'artists'|'playlists';
const labels={all:'Все',tracks:'Треки',albums:'Альбомы',artists:'Исполнители',playlists:'Плейлисты'};
const kinds={albums:'album',artists:'artist',playlists:'playlist'} as const;
export default function SearchPage({query,onQueryChange,results,tracks,renderTracks,navigate,onPlayEntity,onEntityMenu,busy,focusRequest=0,onEmptyEscape,active=true}:{query:string;onQueryChange:(value:string)=>void;results:LocalSearchResults;tracks:Track[];renderTracks:(tracks:Track[],embedded:boolean,onUse:()=>void)=>ReactNode;navigate:(page:NavigationPage)=>void;onPlayEntity:(item:EntityCardData)=>void;onEntityMenu:(target:CollectionMenuTarget,point:{x:number;y:number})=>void;busy:boolean;focusRequest?:number;onEmptyEscape?:()=>void;active?:boolean}){
 const [category,setCategory]=useState<Category>('all'),[recent,setRecent]=useState<string[]>(()=>{try{return recentSearches(JSON.parse(localStorage.getItem(recentSearchKey)||'[]'));}catch{return [];}});
 const input=useRef<HTMLInputElement>(null),body=useRef<HTMLDivElement>(null),composing=useRef(false);
 const scrollPositions=useRef({body:0,tracks:0,entities:0}),restoring=useRef(false);
 useLayoutEffect(()=>{if(!active)return;restoring.current=true;let second=0;const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{const saved=scrollPositions.current;if(body.current){body.current.scrollTop=saved.body;const track=body.current.querySelector<HTMLElement>('.track-scroll'),entity=body.current.querySelector<HTMLElement>('.entity-scroll');if(track)track.scrollTop=saved.tracks;if(entity)entity.scrollTop=saved.entities;}restoring.current=false;});});return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);restoring.current=false;};},[active]);
 useEffect(()=>{if(focusRequest)input.current?.focus({preventScroll:true});},[focusRequest]);
 useEffect(()=>{try{localStorage.setItem(recentSearchKey,JSON.stringify(recent));}catch{}},[recent]);
 useEffect(()=>{scrollPositions.current={body:0,tracks:0,entities:0};body.current?.scrollTo({top:0});body.current?.querySelector<HTMLElement>('.track-scroll')?.scrollTo({top:0});body.current?.querySelector<HTMLElement>('.entity-scroll')?.scrollTo({top:0});},[query,category]);
 const entities=useMemo(()=>Object.fromEntries((['albums','artists','playlists'] as const).map(key=>[key,results[key].map((entity:LocalSearchEntity):EntityCardData=>({id:entity.id,title:entity.title,subtitle:entity.subtitle,menuTarget:entity.kind==='playlist'?{kind:'playlist',id:entity.id,title:entity.title,tracks:entity.tracks,playlist:entity.playlist!}:{kind:entity.kind,id:entity.id,title:entity.title,tracks:entity.tracks}}))])) as Record<'albums'|'artists'|'playlists',EntityCardData[]>,[results]);
 const count=tracks.length+results.albums.length+results.artists.length+results.playlists.length;
 const categoryCount=category==='all'?count:category==='tracks'?tracks.length:entities[category].length;
 const localEmpty=!query.trim()||categoryCount===0;
 function remember(value=query){setRecent(previous=>rememberSearch(previous,value));}
 function openEntity(item:EntityCardData){remember();navigate({kind:item.menuTarget.kind,id:item.id});}
 function submit(){if(composing.current||!query.trim())return;remember();body.current?.querySelector<HTMLElement>('.track-table,.entity-card-open')?.focus({preventScroll:true});}
 const heading=(title:string,total:number,kind:Category)=><header className="search-group-heading"><h2>{title}<small>{total}</small></h2><Button variant="ghost" onClick={()=>{remember();setCategory(kind);}}>Все {title.toLocaleLowerCase('ru')}<ArrowRight aria-hidden="true"/></Button></header>;
 return <div className="search-surface" data-local-empty={localEmpty} onScrollCapture={event=>{if(!active||restoring.current)return;const target=event.target as HTMLElement;if(target===body.current)scrollPositions.current.body=target.scrollTop;else if(target.classList.contains('track-scroll'))scrollPositions.current.tracks=target.scrollTop;else if(target.classList.contains('entity-scroll'))scrollPositions.current.entities=target.scrollTop;}}>
  <PageHeader className="search-page-heading" icon={<Search aria-hidden="true"/>} title="Поиск" subtitle="Локальная библиотека"/>
  <form className="search-query-form" onSubmit={event=>{event.preventDefault();submit();}}><SearchInput ref={input} aria-label="Поиск музыки" placeholder="Треки, альбомы, исполнители, плейлисты" value={query} onChange={event=>onQueryChange(event.target.value)} onClear={()=>{onQueryChange('');input.current?.focus();}} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={event=>{if(event.nativeEvent.isComposing||composing.current||event.keyCode===229){if(event.key==='Enter')event.preventDefault();return;}if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(query)onQueryChange('');else onEmptyEscape?.();}}}><Tooltip content="Глобальный поиск · Ctrl+K"><span className="search-key-hint">Ctrl+K</span></Tooltip><IconButton aria-label="Перейти к результатам" type="submit"><ArrowRight aria-hidden="true"/></IconButton></SearchInput></form>
  <Tabs label="Категории локального поиска" value={category} onValueChange={value=>{remember();setCategory(value);}} items={(Object.keys(labels) as Category[]).map(value=>({value,label:labels[value],panelId:'search-results-panel'}))}/>
  <div className={`search-results-body ${category==='all'?'search-results-grouped':'search-results-category'} ${localEmpty?'search-results-empty':''}`} ref={body} id="search-results-panel" role="tabpanel" aria-label={labels[category]}>
   {!query.trim()?<section className="search-empty-query"><p>Ищи треки, альбомы, исполнителей и плейлисты.</p>{!!recent.length&&<><header className="search-group-heading"><h2>Недавние запросы</h2><Button variant="ghost" onClick={()=>setRecent([])}>Очистить все</Button></header><ul className="search-recent-queries">{recent.map(value=><li key={value}><Button variant="ghost" onClick={()=>onQueryChange(value)}>{value}</Button><IconButton aria-label={`Удалить запрос: ${value}`} onClick={()=>setRecent(previous=>previous.filter(item=>item!==value))}><X aria-hidden="true"/></IconButton></li>)}</ul></>}</section>:!categoryCount?<p className="search-empty-note">{!count?'В библиотеке ничего не найдено':'В этой категории ничего не найдено. Выбери «Все» или измени запрос.'}</p>:category==='all'?<>
    {!!tracks.length&&<section aria-label="Локальные треки">{heading('Треки',tracks.length,'tracks')}{renderTracks(tracks.slice(0,6),true,remember)}</section>}
    {(['albums','artists','playlists'] as const).map(key=>entities[key].length>0&&<section key={key} aria-label={`Локальные ${labels[key].toLocaleLowerCase('ru')}`}>{heading(labels[key],entities[key].length,key)}<div className="search-entity-preview">{entities[key].slice(0,3).map(item=><EntityCard key={item.id} item={item} kind={kinds[key]} onOpen={()=>openEntity(item)} onPlay={item=>{remember();onPlayEntity(item);}} onContextMenu={onEntityMenu} onFocus={()=>{}} busy={busy}/>)}</div></section>)}
   </>:<><div className="search-category-count">Локально · {category==='tracks'?tracks.length:entities[category].length} результатов</div>{category==='tracks'?renderTracks(tracks,false,remember):<EntityGrid key={`search-${category}`} items={entities[category]} kind={kinds[category]} onOpen={id=>openEntity(entities[category].find(item=>item.id===id)!)} onPlay={item=>{remember();onPlayEntity(item);}} onContextMenu={onEntityMenu} busy={busy}/>}</>}
  </div>
 </div>;
}
