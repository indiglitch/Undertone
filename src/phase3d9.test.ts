import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { addLibraryFoldersSnapshot, displayFolderPath, removeLibraryFolderSnapshot } from './librarySourcesModel.ts';
import type { Library } from './types.ts';

const library:Library={tracks:[{id:1,path:'F:\\Music\\song.flac'} as Library['tracks'][number]],folders:['F:\\Music','G:\\Audio'],errors:[]};

test('adding folders updates the frontend source snapshot without duplicates',()=>{
  const next=addLibraryFoldersSnapshot(library,['f:\\music','H:\\New Music']);
  assert.deepEqual(next.folders,['F:\\Music','G:\\Audio','H:\\New Music']);
  assert.strictEqual(next.tracks,library.tracks);
});

test('removing a source updates folders only and preserves imported tracks',()=>{
  const next=removeLibraryFolderSnapshot(library,'F:\\Music');
  assert.deepEqual(next.folders,['G:\\Audio']);
  assert.strictEqual(next.tracks,library.tracks);
  assert.equal(displayFolderPath('\\\\?\\F:\\Music'),'F:\\Music');
});

test('Music folders UI uses the native picker and exposes connected, empty, error, and Remove states',()=>{
  const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8');
  const folders=readFileSync(new URL('./MusicFoldersDialog.tsx',import.meta.url),'utf8');for(const text of ['Папки с музыкой','Добавить папку с музыкой','Подключено','Папки с музыкой ещё не добавлены','Убрать'])assert.ok((app+folders).includes(text),text);
  assert.match(app,/open\(\{directory:true,multiple:true,title:'Добавить папку с музыкой'\}\)/);
  assert.match(app,/invoke<boolean>\('remove_library_folder',\{folder\}\)/);
  assert.match(folders,/role="alert"/);
  assert.match(app,/removeLibraryFolderSnapshot\(value,folder\)/);
});

test('Settings is a full-weight sidebar item with icon and obvious active and hover states',()=>{
  const app=readFileSync(new URL('./App.tsx',import.meta.url),'utf8'),css=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
  assert.match(app,/settings:\{selected:settingsOpen[^\n]+<SettingsIcon size=\{19\}\/><span className="nav-text">Настройки/);
  assert.match(app,/className=\{`settings-nav-item /);
  const shell=readFileSync(new URL('./desktopLayout.css',import.meta.url),'utf8');
  assert.match(shell,/\.sidebar button\.ds-button:hover:not\(:disabled\)/);
  assert.match(shell,/\.sidebar button\.ds-button\.selected/);
  assert.match(app,/aria-label="Настройки" aria-haspopup="dialog"/);
});
