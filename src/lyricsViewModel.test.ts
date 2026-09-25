import assert from 'node:assert/strict';
import test from 'node:test';
import { goBack, initialNavigation, visit } from './navigationModel.ts';
import { activeLyricIndex, lyricLineTone, lyricsButtonDisabled, lyricsDisplayKind, lyricsForTrack, seekSyncedLine, shouldAutoScroll, showLyricsIndicator, suppressAutoScrollUntil } from './lyricsViewModel.ts';
import { collectionActionLabels, dismissesMenu, homeAlbumContextTarget, openContextMenu, outsideMenu } from './trackContextMenuModel.ts';
import type { LyricsDocument } from './types.ts';

const synced:LyricsDocument={plain:null,synced:[{timestamp_ms:1000,text:'one',order:0},{timestamp_ms:2500,text:'two',order:1},{timestamp_ms:4000,text:'three',order:2}],origin:'local_lrc',manually_edited:false,revision:'1'};
const plain:LyricsDocument={...synced,plain:'Первая строка\nВторая строка',synced:[]};

test('Lyrics button is disabled only when the current track has no lyrics and view is closed',()=>{assert.equal(lyricsButtonDisabled(false,false),true);assert.equal(lyricsButtonDisabled(true,false),false);assert.equal(lyricsButtonDisabled(false,true),false);});
test('Lyrics button opens a dedicated history entry and Back returns to the previous page',()=>{const library=visit(initialNavigation,{kind:'library'});const lyrics=visit(library,{kind:'lyricsView'});assert.equal(lyrics.current.page.kind,'lyricsView');assert.deepEqual(goBack(lyrics).current.page,{kind:'library'});});
test('opening and closing Lyrics does not mutate playback state',()=>{const playback={id:7,playing:true,position:31};const opened=visit(initialNavigation,{kind:'lyricsView'});goBack(opened);assert.deepEqual(playback,{id:7,playing:true,position:31});});
test('synced view uses one deterministic active line and manual scrolling suppresses auto-scroll',()=>{assert.equal(activeLyricIndex(synced.synced,2.7),1);assert.equal(lyricLineTone(1,1),'active');const until=suppressAutoScrollUntil(1000);assert.equal(shouldAutoScroll(2000,until),false);assert.equal(shouldAutoScroll(until,until),true);});
test('clicking a synced line seeks exactly once',()=>{const values:number[]=[];seekSyncedLine(synced.synced[1],seconds=>values.push(seconds));assert.deepEqual(values,[2.5]);});
test('plain lyrics remain plain text without fake timestamps',()=>{assert.equal(lyricsDisplayKind(plain),'plain');assert.equal(plain.plain,'Первая строка\nВторая строка');assert.equal(plain.synced.length,0);});
test('changing current track hides stale lyrics until the new track result arrives',()=>{assert.equal(lyricsForTrack(2,1,synced),null);assert.equal(lyricsForTrack(2,2,plain),plain);});
test('availability icon uses the batched has_lyrics field without lyrics fetches',()=>{const tracks=[{has_lyrics:true},{has_lyrics:false}];assert.deepEqual(tracks.map(track=>showLyricsIndicator(track)),[true,false]);});
test('Home album right click builds the existing album context target and actions',()=>{const tracks=[{id:1},{id:2}];assert.deepEqual(homeAlbumContextTarget(8,'Album',tracks),{kind:'album',id:8,title:'Album',tracks});assert.deepEqual(collectionActionLabels('album'),['Play','Play Next','Add to Queue','Add to Playlist']);});
test('Home album and player current-track right clicks open through the shared handler without a normal click',()=>{for(const surface of ['home-album','player-track']){let prevented=0,stopped=0,clicked=0,point=null as {x:number;y:number}|null;openContextMenu({clientX:12,clientY:34,preventDefault:()=>{prevented++;},stopPropagation:()=>{stopped++;}},value=>{point=value;});assert.equal(clicked,0,surface);assert.equal(prevented,1);assert.equal(stopped,1);assert.deepEqual(point,{x:12,y:34});}});
test('Escape and outside pointer close context menus',()=>{assert.equal(dismissesMenu('Escape'),true);assert.equal(outsideMenu(false),true);assert.equal(outsideMenu(true),false);});
