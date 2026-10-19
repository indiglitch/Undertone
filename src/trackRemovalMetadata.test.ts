import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {metadataRows} from './trackMetadataModel.ts';
import {deletedTrackQueue,planDeletedTrack} from './deletedSongsModel.ts';
import type {Track} from './types.ts';

const source=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
const track:Track={id:7,path:'F:\\Music\\Artist\\Album\\a very long song name.flac',title:'Song',artist:'Artist',album:'Album',album_artist:'Исполнитель альбома',artist_id:1,album_id:2,added_at:'2026-09-01',track_number:3,year:2007,duration:61,format:'FLAC',cover:'cover.jpg',genre:'Jazz',has_lyrics:true};
const values=(value:Track,details:{size_bytes:number|null;lyrics_source:string|null}|null)=>Object.fromEntries(metadataRows(value,details).map(row=>[row.label,row.value]));

test('metadata displays stored values and marks unavailable fields with a dash',()=>{
  const rows=values(track,{size_bytes:2048,lyrics_source:'local_lrc'});
  assert.equal(rows['Название'],'Song');assert.equal(rows['Исполнитель'],'Artist');assert.equal(rows['Исполнитель альбома'],'Исполнитель альбома');
  assert.equal(rows['Номер трека'],'3');assert.equal(rows['Длительность'],'1:01');assert.equal(rows['Размер файла'],'2 КБ');
  assert.equal(rows['Источник текста песни'],'Локальный .lrc');assert.equal(rows['Локальный путь'],track.path);
  const missing=values({...track,genre:'',year:null,track_number:null,cover:null,path:''},null);
  for(const key of ['Жанр','Год / дата','Номер трека','Номер диска','Частота дискретизации','Битность','Каналы','Битрейт','Размер файла','Локальный путь','Обложка'])assert.equal(missing[key],'—',key);
});

test('menu offers one destructive action from authoritative file status and metadata only for local tracks',()=>{
  const menu=source('./TrackContextMenu.tsx');
  assert.match(menu,/invoke<TrackFileStatus>\('track_file_status',\{trackId:track.id\}\)/);
  assert.match(menu,/fileStatus==='missing'\?<MenuItem destructive[^\n]*Убрать из медиатеки/);
  assert.match(menu,/fileStatus==='present'\?<MenuItem destructive[^\n]*Переместить в удалённые/);
  assert.match(menu,/Метаданные<\/MenuItem>/);
});

test('confirmation and removal update current snapshot and queue without a rescan',()=>{
  const app=source('./App.tsx'),dialog=source('./MoveTrackDialog.tsx');
  assert.match(dialog,/Локальный файл не найден\. Убрать этот трек из медиатеки Undertone\?/);
  assert.match(dialog,/<ConfirmationDialog/);assert.match(dialog,/busy=\{busy\} onClose=\{onCancel\}/);
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
  const shell=source('./Dialog.tsx');assert.match(dialog,/<Dialog/);assert.match(shell,/event.preventDefault\(\);if\(!busy/);
  assert.match(shell,/backdropDown.current&&event.target===event.currentTarget/);
  assert.match(dialog,/invoke<TrackMetadataDetails>\('track_metadata_details',\{trackId:track.id\}\)/);
  assert.doesNotMatch(dialog,/onPlay|navigate|audio_command/);
  assert.match(css,/overflow-wrap:anywhere; user-select:text/);
});
