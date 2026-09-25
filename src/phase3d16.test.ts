import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {groupedSidebarOrder,loadSidebarOrder,sidebarGroups,sidebarIds} from './navigationModel.ts';
import {once} from './trackContextMenuModel.ts';

const source=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');

test('sidebar renders each route once in the requested groups, with Settings separate',()=>{
  const groups=sidebarGroups.map(group=>[...group.ids]);
  assert.deepEqual(groups,[
    ['home','search','library','recentlyAdded','history'],
    ['liked','queue','playlists','albums','artists'],
    ['downloads','lyrics'],
  ]);
  assert.deepEqual([...groups.flat(),'settings'].sort(),[...sidebarIds].sort());
  const oldOrder=['settings','lyrics','search','home','downloads','library','queue','albums','artists','liked','playlists','history','recentlyAdded'];
  const storage={getItem:()=>JSON.stringify(oldOrder),setItem:()=>{}};
  const rendered=groupedSidebarOrder(loadSidebarOrder(storage));
  assert.deepEqual(rendered[0],['search','home','library','history','recentlyAdded']);
  assert.deepEqual(rendered[2],['lyrics','downloads']);
  assert.equal(rendered.flat().includes('settings'),false);
});

test('sidebar routes and resizer remain wired to existing actions',()=>{
  const app=source('./App.tsx');
  for(const pair of [
    "search:{selected:page.kind==='search',action:()=>navigate({kind:'search'})",
    "lyrics:{selected:page.kind==='lyrics'||page.kind==='lyricsView',action:()=>navigate({kind:'lyrics'})",
    "settings:{selected:settingsOpen,action:()=>setSettingsOpen(true)",
  ])assert.ok(app.includes(pair),pair);
  assert.match(app,/groupedSidebarOrder\(sidebarOrder\)/);
  assert.match(app,/ResizeHandle axis="horizontal" label="Resize sidebar"/);
});

test('both context menus use one left-aligned item grid and separated destructive actions',async()=>{
  const menu=source('./ContextMenu.tsx'),track=source('./TrackContextMenu.tsx'),collection=source('./CollectionContextMenu.tsx'),css=source('./phase3d16.css');
  assert.match(menu,/className="context-menu-icon"/);
  assert.match(menu,/className="context-menu-label"/);
  assert.match(menu,/className="context-menu-trailing"/);
  assert.match(menu,/ChevronRight size=\{15\}/);
  assert.match(menu,/<details className="context-submenu">/);
  assert.match(css,/grid-template-columns: 20px minmax\(0, 1fr\) auto/);
  assert.match(css,/\.context-menu-label \{[^}]*text-align: left/s);
  assert.match(css,/\.context-menu-item:focus-visible/);
  assert.match(css,/\.context-menu-item:disabled/);
  assert.match(track,/<MenuSection separated><MenuItem destructive[\s\S]*?Move to Trash/);
  assert.match(collection,/<MenuSection separated><MenuItem destructive[\s\S]*?Delete/);
  let calls=0;const invokeOnce=once(async()=>{calls++;});await Promise.all([invokeOnce(),invokeOnce()]);assert.equal(calls,1);
});

test('artist navigation is attached to inline text and isolated from track playback',()=>{
  const track=source('./TrackList.tsx'),app=source('./App.tsx'),css=source('./phase3d16.css');
  assert.match(track,/<button className="artist-link" onClick=\{event=>\{event\.stopPropagation\(\);onArtist\?\.\(t\.artist_id\);\}\}>\{t\.artist\}<\/button>/);
  assert.match(track,/<button disabled=\{busy\} onClick=\{\(\)=>onPlay\(t,row.index\)\}/);
  assert.match(track,/<div className="track-subtitle">/);
  assert.match(track,/onContextMenu=\{event=>openContextMenu\(event,point=>onContextMenu\?\.\(t,point\)\)\}/);
  assert.match(app,/closest\('\.artist-link'\)/);
  assert.match(css,/\.track-subtitle > \.artist-link \{[^}]*width: auto/);
  assert.match(css,/\.track-subtitle > \.artist-link:hover \{[^}]*text-decoration: underline/);
  assert.match(css,/\.track-subtitle > \.artist-link:focus-visible/);
});
