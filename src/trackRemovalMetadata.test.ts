import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {metadataRows} from './trackMetadataModel.ts';
import {deletedTrackQueue,planDeletedTrack} from './deletedSongsModel.ts';
import type {Track} from './types.ts';

const source=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
const track:Track={id:7,path:'F:\\Music\\Artist\\Album\\a very long song name.flac',title:'Song',artist:'Artist',album:'Album',album_artist:'Album Artist',artist_id:1,album_id:2,added_at:'2026-09-01',track_number:3,year:2007,duration:61,format:'FLAC',cover:'cover.jpg',genre:'Jazz',has_lyrics:true};
const values=(value:Track,details:{size_bytes:number|null;lyrics_source:string|null}|null)=>Object.fromEntries(metadataRows(value,details).map(row=>[row.label,row.value]));

test('metadata displays stored values and marks unavailable fields with a dash',()=>{
  const rows=values(track,{size_bytes:2048,lyrics_source:'local_lrc'});
  assert.equal(rows.Title,'Song');assert.equal(rows.Artist,'Artist');assert.equal(rows['Album Artist'],'Album Artist');
  assert.equal(rows['Track number'],'3');assert.equal(rows.Duration,'1:01');assert.equal(rows['File size'],'2 KB');
  assert.equal(rows['Lyrics availability/source'],'Local .lrc');assert.equal(rows['Local path'],track.path);
  const missing=values({...track,genre:'',year:null,track_number:null,cover:null,path:''},null);
  for(const key of ['Genre','Year / Date','Track number','Disc number','Sample rate','Bit depth','Channels','Bitrate','File size','Local path','Artwork presence'])assert.equal(missing[key],'—',key);
});

test('menu offers one destructive action from authoritative file status and metadata only for local tracks',()=>{
  const menu=source('./TrackContextMenu.tsx'),remote=source('./SoulseekSearchView.tsx');
  assert.match(menu,/invoke<TrackFileStatus>\('track_file_status',\{trackId:track.id\}\)/);
  assert.match(menu,/fileStatus==='missing'\?<MenuItem destructive[^\n]*Remove from Library/);
  assert.match(menu,/fileStatus==='present'\?<MenuItem destructive[^\n]*Move to Trash/);
  assert.match(menu,/View metadata<\/MenuItem>/);
  assert.doesNotMatch(remote,/TrackContextMenu|View metadata/);
});

test('confirmation and removal update current snapshot and queue without a rescan',()=>{
  const app=source('./App.tsx'),dialog=source('./MoveTrackDialog.tsx');
  assert.match(dialog,/The local file could not be found\. Remove this track from Undertone library\?/);
  assert.match(dialog,/onCancel=\{event=>\{event.preventDefault\(\);if\(!busy\)onCancel\(\);\}\}/);
  assert.match(app,/invoke\('remove_missing_track',\{trackId\}\)/);
  assert.match(app,/tracks:value.tracks.filter\(track=>track.id!==trackId\)/);
  assert.match(app,/await player.removeDeletedTrack\(trackId\)/);
  assert.doesNotMatch(app.slice(app.indexOf('async function confirmMoveToTrash'),app.indexOf('function navigate(next')),/\bscan\(/);
  const queue=[{key:1,track:{id:7}},{key:2,track:{id:8}},{key:3,track:{id:7}}];
  assert.deepEqual(deletedTrackQueue(queue,7),[{key:2,track:{id:8}}]);
  assert.equal(planDeletedTrack(queue,0,7,7).wasCurrent,true);
});

test('metadata dialog closes on Escape or outside and keeps long values selectable',()=>{
  const dialog=source('./TrackMetadataDialog.tsx'),css=source('./TrackMetadataDialog.css');
  assert.match(dialog,/onCancel=\{event=>\{event.preventDefault\(\);onClose\(\);\}\}/);
  assert.match(dialog,/event.target===dialog.current\)onClose\(\)/);
  assert.match(dialog,/invoke<TrackMetadataDetails>\('track_metadata_details',\{trackId:track.id\}\)/);
  assert.doesNotMatch(dialog,/onPlay|navigate|audio_command/);
  assert.match(css,/overflow-wrap: anywhere; user-select: text/);
});
