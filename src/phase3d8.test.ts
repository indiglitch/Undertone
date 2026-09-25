import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { localSearchSource, localTracksForHits } from './libraryModel.ts';
import { enterSearch, goBack, initialNavigation, recentlyAddedTracks, visit } from './navigationModel.ts';
import { volumeAction } from './playerVolumeModel.ts';
import type { Track } from './types.ts';

const track=(id:number,title:string,artist:string,album:string,added_at='2026-09-01T00:00:00Z'):Track=>({id,path:`F:\\Music\\${id}.flac`,title,artist,album,album_artist:artist,artist_id:id,album_id:id,added_at,track_number:null,year:null,duration:180,format:'FLAC',cover:null,genre:'',has_lyrics:false});
const library=[track(1,'Northern Lights','Echo Harbor','Night Drive'),track(2,'Тихий свет','Северный Ветер','Ночные песни')];

async function local(query:string){return localSearchSource(library).search(query,new AbortController().signal);}

test('local Search resolves title, artist, album, Cyrillic and partial queries into TrackList tracks',async()=>{
  for(const [query,id] of [['LIGHT',1],['harb',1],['drive',1],['ТИХ',2],['ветер',2],['песн',2]] as const){
    const hits=await local(query);assert.deepEqual(localTracksForHits(library,hits).map(item=>item.id),[id],query);
    assert.deepEqual(localTracksForHits(library,localSearchSource(library).searchNow(query)).map(item=>item.id),[id],`synchronous ${query}`);
  }
  const view=readFileSync(new URL('./CollectionView.tsx',import.meta.url),'utf8');
  assert.match(view,/localTracksForHits\(library\.tracks,searchHits\)/);
  assert.match(view,/source\.searchNow\(query\)/);
  assert.match(view,/<TrackList tracks=\{tracks\}/);
});

test('empty local query shows no tracks until a query is entered',async()=>{
  assert.deepEqual(localTracksForHits(library,await local('')).map(item=>item.id),[]);
  assert.match(readFileSync(new URL('./CollectionView.tsx',import.meta.url),'utf8'),/query\.trim\(\)\?'Ничего не найдено[^:]+:'Введите запрос/);
});

test('the single Search page and Back preserve the query',()=>{
  let state=enterSearch(initialNavigation,'свет');
  assert.equal(state.current.query,'свет');
  state=visit(state,{kind:'album',id:4});state=goBack(state);
  assert.equal(state.current.query,'свет');
});

test('the one persistent Search host keeps local and Soulseek sections on one page with tabs removed',()=>{
  const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8'),css=readFileSync(new URL('./styles.css',import.meta.url),'utf8'),view=readFileSync(new URL('./CollectionView.tsx',import.meta.url),'utf8');
  assert.match(app,/className="search-page-host" hidden=/);
  assert.match(css,/\.search-page-host\{display:flex;flex:1;min-height:0;overflow:hidden\}/);
  assert.match(css,/\.unified-search-content\{[^}]*overflow-y:auto/);
  assert.match(view,/className="unified-search-section unified-search-library"[\s\S]*className="unified-search-section unified-search-soulseek"/);
  assert.ok(view.indexOf('className="unified-search-section unified-search-library"')<view.indexOf('className="unified-search-section unified-search-soulseek"'));
  assert.match(view,/localTracksForHits\(library\.tracks,searchHits\)/);
  assert.doesNotMatch(view,/search-tabs|role="tablist"/);
  assert.equal((view.match(/<form className="search unified-search-form"/g)||[]).length,1);
  assert.match(css,/\.soulseek-results\{flex:1;min-height:0;overflow-y:auto;/);
});

test('Enter or the shared Search button is the only remote trigger, with unavailable state below local results',()=>{
  const view=readFileSync(new URL('./CollectionView.tsx',import.meta.url),'utf8'),remote=readFileSync(new URL('./SoulseekSearchView.tsx',import.meta.url),'utf8');
  assert.match(view,/onSubmit=\{e=>\{e\.preventDefault\(\);soulseek\.onSearch\(\);\}\}/);
  assert.match(view,/disabled=\{!query\.trim\(\)\|\|!soulseek\.enabled\|\|!soulseek\.configured\}/);
  assert.match(remote,/Soulseek unavailable/);
  assert.doesNotMatch(remote,/<button className="primary-button"/);
});

test('newly imported track is immediately visible to Recently Added and local Search snapshots',async()=>{
  const imported=track(3,'Новая песня','Группа','Альбом','2026-09-10T00:00:00Z'),snapshot=[...library,imported];
  assert.equal(recentlyAddedTracks(snapshot)[0].id,3);
  assert.deepEqual(localTracksForHits(snapshot,await localSearchSource(snapshot).search('новая',new AbortController().signal)).map(item=>item.id),[3]);
});

test('volume drag uses the isolated immediate action path without remount keys or per-event busy/status resets',()=>{
  assert.deepEqual(volumeAction(.37),{type:'volume',value:.37});
  const player=readFileSync(new URL('./player.tsx',import.meta.url),'utf8'),view=readFileSync(new URL('./CollectionView.tsx',import.meta.url),'utf8');
  const isolated=player.slice(player.indexOf('const changeVolume='),player.indexOf('const changeVolume=')+700);
  assert.doesNotMatch(isolated,/setBusy|setStatus/);
  assert.match(player,/onPointerDown=\{\(\)=>\{volumeDragging\.current=true;\}\}[\s\S]*onChange=\{e=>\{const value=\+e\.target\.value;setDisplayVolume\(value\);void player\.changeVolume\(value\);\}\}/);
  assert.match(player,/if\(!volumeDragging\.current\)setDisplayVolume\(status\.volume\)/);
  assert.doesNotMatch(view,/<TrackList key=/);
});
