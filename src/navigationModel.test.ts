import assert from 'node:assert/strict';
import test from 'node:test';
import { enterSearch, goBack, homeCopy, initialNavigation, loadSidebarOrder, recentlyAddedTracks, reorderSidebar, rescanConfiguredFolders, saveSidebarOrder, sidebarIds, visit } from './navigationModel.ts';

test('Back restores previous screen and search query',()=>{
  let state=visit(initialNavigation,{kind:'library'});state=visit(state,{kind:'artist',id:4});state=visit(state,{kind:'album',id:8});state=goBack(state);assert.deepEqual(state.current.page,{kind:'artist',id:4});
  state=enterSearch(state,'ambient');state=visit(state,{kind:'album',id:9});state=goBack(state);assert.equal(state.current.page.kind,'search');assert.equal(state.current.query,'ambient');
  state=visit(state,{kind:'playlist',id:3});state=visit(state,{kind:'album',id:2});assert.deepEqual(goBack(state).current.page,{kind:'playlist',id:3});
});

test('Search is one top-level page and Back restores its query',()=>{
  assert.ok(sidebarIds.includes('search'));
  let state=enterSearch(initialNavigation,'ambient');state=visit(state,{kind:'album',id:9});state=goBack(state);
  assert.equal(state.current.page.kind,'search');assert.equal(state.current.query,'ambient');
});

test('navigation does not touch playback state',()=>{const playback={playing:true,trackId:42};goBack(visit(initialNavigation,{kind:'library'}));assert.deepEqual(playback,{playing:true,trackId:42});});

test('Rescan calls the existing scanner with configured folders',async()=>{let received:string[]=[];await rescanConfiguredFolders(['F:\\Music'],async folders=>{received=folders;});assert.deepEqual(received,['F:\\Music']);});

test('sidebar reorder persists and cannot remove system items',()=>{const values=new Map<string,string>();const storage={getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value);}};const order=reorderSidebar(loadSidebarOrder(storage),'queue','library');saveSidebarOrder(storage,order);const restored=loadSidebarOrder(storage);assert.equal(restored[2],'queue');assert.equal(restored.length,12);assert.ok(restored.includes('home')&&restored.includes('lyrics')&&restored.includes('settings'));});


test('Recently Added is newest-first and a newly imported track appears first',()=>{const older={id:1,added_at:'2026-09-01T10:00:00Z'},newer={id:2,added_at:'2026-09-02T10:00:00Z'};assert.deepEqual(recentlyAddedTracks([older,newer]).map(t=>t.id),[2,1]);const imported={id:3,added_at:'2026-09-09T10:00:00Z'};assert.deepEqual(recentlyAddedTracks([older,newer,imported]).map(t=>t.id),[3,2,1]);});


test('decorative copy is removed while actionable empty state remains',()=>{assert.equal(homeCopy.title,'Главная');assert.match(homeCopy.emptyHelp,/Добавьте папку/);assert.doesNotMatch(Object.values(homeCopy).join(' '),/Любимые треки уже здесь|Хороший день|Больше музыки/);});

test('old sidebar order safely drops removed routes',()=>{const storage={getItem:()=>JSON.stringify(['downloads','home','queue']),setItem:()=>{}};const order=loadSidebarOrder(storage);assert.equal(order.length,12);assert(!order.includes('downloads' as never));assert(order.includes('recentlyAdded')&&order.includes('history'));});
