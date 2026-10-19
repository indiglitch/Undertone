import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');

test('removed music network feature has no frontend implementation or hidden entry point',()=>{
  for(const name of ['DownloadManager.tsx','downloadModel.ts','SoulseekSearchView.tsx','SoulseekSettings.tsx','soulseekSearch.ts','RemoteSearchResult.tsx'])assert.equal(existsSync(new URL(name,import.meta.url)),false,name);
  for(const name of readdirSync(new URL('.',import.meta.url)).filter(name=>/\.(tsx?|css)$/.test(name)&&!name.endsWith('.test.ts'))){
    assert.doesNotMatch(read(name),/slskd_|Soulseek|DownloadSession|RemoteSearchResult|data-nav-id="downloads"|kind:'downloads'/,name);
  }
  const search=read('./SearchPage.tsx');assert.match(search,/В библиотеке ничего не найдено/);assert.doesNotMatch(search,/search-network|Искать в сети|Скачать/);
  const settings=read('./AppSettings.tsx');assert.match(settings,/downloadAndInstall/);assert.match(settings,/Папка удалённых песен/);
});

test('native remote commands/contracts/feature are removed while local intake and updater survive',()=>{
  const main=read('../src-tauri/src/main.rs'),providers=read('../src-tauri/src/providers.rs'),cargo=read('../src-tauri/Cargo.toml');
  assert.doesNotMatch(main,/slskd|soulseek_commands/);assert.doesNotMatch(providers,/Soulseek|SearchProvider|DownloadProvider|SecretStore/);assert.doesNotMatch(cargo,/slskd\s*=/);
  assert.match(main,/scan_folders/);assert.match(main,/tauri_plugin_updater/);assert.match(providers,/trait MetadataProvider/);assert.match(read('../src-tauri/src/scanner.rs'),/pub fn import_files/);
  assert.equal(existsSync(new URL('../src-tauri/src/services',import.meta.url)),false);
  for(const migration of ['004_retired.sql','005_retired.sql'])assert.doesNotMatch(read('../src-tauri/migrations/'+migration),/CREATE TABLE|DROP TABLE|DELETE FROM/);
});
