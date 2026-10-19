import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { activeLyricIndex, lyricsDisplayKind, seekSyncedLine } from './lyricsViewModel.ts';
import { goBack, initialNavigation, sidebarIds, visit } from './navigationModel.ts';
import { collectionActionLabels, homeAlbumContextTarget } from './trackContextMenuModel.ts';
import { likeAction, setLiked, stableRandomAlbumIds } from './phase3d2Model.ts';
import type { LyricsDocument } from './types.ts';

const synced:LyricsDocument={plain:null,synced:[{timestamp_ms:0,text:'first',order:0},{timestamp_ms:1000,text:'second',order:1},{timestamp_ms:2000,text:'third',order:2}],origin:'local_lrc',manually_edited:false,revision:'test'};
const plain:LyricsDocument={...synced,plain:'one\ntwo\nthree',synced:[]};

test('Now Playing is a modal and does not reserve a shell grid column',()=>{const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8'),shell=readFileSync(new URL('./desktopLayout.css',import.meta.url),'utf8');assert.doesNotMatch(app,/detailsLayoutClass|details-open/);assert.match(readFileSync(new URL('./ListeningDialog.tsx',import.meta.url),'utf8'),/now-playing-overlay/);assert.match(app,/<ListeningDialog/);assert.match(shell,/grid-template-columns:var\(--shell-sidebar-width\) var\(--splitter-size\) minmax\(0,1fr\)/);});
test('right panel and dedicated page share the full lyrics renderer',()=>{const view=readFileSync(new URL('./LyricsView.tsx',import.meta.url),'utf8'),app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');assert.match(view,/export default function LyricsView/);assert.match(view,/synced\.map/);assert.match(app,/<NowPlayingPanel player=/);assert.match(readFileSync(new URL('./NowPlayingPanel.tsx',import.meta.url),'utf8'),/<LyricsView showHeader=\{false\}/);assert.equal(synced.synced.length,3);});
test('shared synced logic selects active line and seeks once',()=>{assert.equal(activeLyricIndex(synced.synced,1.4),1);const seeks:number[]=[];seekSyncedLine(synced.synced[2],seconds=>seeks.push(seconds));assert.deepEqual(seeks,[2]);});
test('plain lyrics remain one full plain document',()=>{assert.equal(lyricsDisplayKind(plain),'plain');assert.equal(plain.plain,'one\ntwo\nthree');assert.equal(plain.synced.length,0);});
test('Lyrics is a top-level sidebar management page with normal Back history',()=>{assert.ok(sidebarIds.includes('lyrics'));const page=visit(initialNavigation,{kind:'lyrics'});assert.equal(page.current.page.kind,'lyrics');assert.equal(goBack(page).current.page.kind,'home');});
test('Bulk indexer is absent from Home and visible only on Lyrics management page',()=>{const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');assert.match(app,/BulkLyricsIndexer[^>]+visible=\{contentPage\.kind==='lyrics'&&!visualizerOpen\}/);assert.doesNotMatch(app,/BulkLyricsIndexer[^>]+visible=\{page\.kind==='home'\}/);});
test('Home album sample is unique and stable across ordinary rerenders',()=>{const albums=[1,2,2,3,4,5,6,7].map(album_id=>({album_id}));const first=stableRandomAlbumIds(albums,[],true,6,()=>0.37);const second=stableRandomAlbumIds(albums,first,false,6,()=>0.91);assert.equal(first.length,6);assert.equal(new Set(first).size,6);assert.deepEqual(second,first);assert.notDeepEqual(first,[1,2,3,4,5,6]);});
test('Home random album cards preserve the existing album context menu',()=>{const tracks=[{id:1},{id:2}],target=homeAlbumContextTarget(9,'Nine',tracks);assert.deepEqual(target,{kind:'album',id:9,title:'Nine',tracks});assert.deepEqual(collectionActionLabels(target.kind),['Play','Play Next','Add to Queue','Add to Playlist']);});
test('Like and Unlike reuse one existing collection action and update optimistic state',()=>{let calls=0;const dispatch=(id:number,liked:boolean)=>{calls++;return likeAction(id,liked);};assert.deepEqual(setLiked([],7,true),[7]);assert.deepEqual(dispatch(7,true),{type:'like',track_id:7,liked:true});assert.deepEqual(setLiked([7],7,false),[]);assert.deepEqual(dispatch(7,false),{type:'like',track_id:7,liked:false});assert.equal(calls,2);});
test('switching current track immediately selects that track liked state',()=>{const likes=[2];const liked=(trackId:number)=>likes.includes(trackId);assert.equal(liked(1),false);assert.equal(liked(2),true);});
