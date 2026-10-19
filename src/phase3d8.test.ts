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
  assert.match(view,/localTracksForHits\(library\.tracks,searchHits,byId\)/);
  assert.match(view,/source\.searchAllNow\(/);
  assert.match(view,/<TrackList tracks=\{tracks\}/);
});

test('empty local query shows no tracks until a query is entered',async()=>{
  assert.deepEqual(localTracksForHits(library,await local('')).map(item=>item.id),[]);
  assert.equal(localSearchSource(library).searchAllNow('').albums.length,0);
});

test('the single Search page and Back preserve the query',()=>{
  let state=enterSearch(initialNavigation,'свет');
  assert.equal(state.current.query,'свет');
  state=visit(state,{kind:'album',id:4});state=goBack(state);
  assert.equal(state.current.query,'свет');
});

test('persistent Search keeps one input with local category tabs and local-only results',()=>{
 const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8'),search=readFileSync(new URL('./SearchPage.tsx',import.meta.url),'utf8');
 assert.match(app,/className="search-page-host" hidden=/);
 assert.equal((search.match(/<SearchInput /g)||[]).length,1);
 assert.match(search,/Категории локального поиска/);
 assert.match(search,/search-results-body/);assert.doesNotMatch(search,/search-network-section|SoulseekSearchView/);
 assert.doesNotMatch(search,/Library.*Soulseek.*tab|SearchTrackRow|SearchAlbumCard/);
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
  assert.doesNotMatch(isolated,/setBusy/);assert.match(isolated,/setStatus\(current=>\(\{\.\.\.current,volume:result\.volume\}\)\)/);
  assert.match(player,/onPointerDown=\{\(\)=>\{volumeDragging\.current=true;\}\}[\s\S]*onChange=\{e=>\{const value=\+e\.target\.value;[\s\S]*?setDisplayVolume\(value\);void player\.changeVolume\(value\);\}\}/);
  assert.match(player,/if\(!volumeDragging\.current\)\{setDisplayVolume\(status\.volume\)/);
  assert.doesNotMatch(view,/<TrackList key=/);
});
