// Isolated frontend fault injection; never invokes a real updater installer.
const {chromium}=require(process.env.PHASE14_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
fs.mkdirSync('qa-output',{recursive:true});
fs.writeFileSync('qa-output/phase14-boundary.html',`<!doctype html><html lang="ru"><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import ReactDOM from 'react-dom/client';
import Boundary from '/src/AppErrorBoundary.tsx';import Settings from '/src/AppSettings.tsx';
import ToastHost from '/src/ToastHost.tsx';import {notify} from '/src/feedback.ts';
import '/src/designTokens.css';import '/src/primitives.css';
const mode=new URL(location.href).searchParams.get('mode');
function Broken(){throw Error('QA deliberately induced render failure');}
const props={onClose:()=>{},deletedSongsFolder:null,onDeletedSongsFolder:()=>{},onResetPlayerLayout:()=>{},controlOrder:[],controlPositions:{},onControlPositionsChange:()=>{},previewTrack:null,colorPalette:'midnight',onColorPaletteChange:()=>{},customColor:[100,100,100],onCustomColorChange:()=>{},musicFolders:[],onMusicFolders:()=>{}};
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Boundary,null,mode==='boundary'?React.createElement(Broken):React.createElement(React.Fragment,null,React.createElement(Settings,props),React.createElement(ToastHost))));
if(mode==='toast')notify('QA keyboard action','info',{label:'QA action',run:()=>{window.__acted=(window.__acted||0)+1;}},10000);
</script></body></html>`);
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});const results=[];try{
 for(const mode of ['boundary','current','available','failure','download','toast']){
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  await context.addInitScript(mode=>{window.__TAURI__={};window.isTauri=true;let serial=1;window.__callbacks={};window.__TAURI_INTERNALS__={convertFileSrc:p=>p,transformCallback:fn=>{const id=serial++;window.__callbacks[id]=fn;return id;},unregisterCallback:()=>{},invoke:async(cmd,args={})=>{
   if(cmd==='plugin:app|version')return '0.2.6';if(cmd==='plugin:updater|check'){if(mode==='failure')throw Error('QA offline');return mode==='current'?null:{rid:10,currentVersion:'0.2.6',version:'0.2.7',body:'QA',rawJson:{}};}
   if(cmd==='plugin:updater|download_and_install'){const id=args.onEvent.id;const fn=window.__callbacks[id];fn({message:{event:'Started',data:{contentLength:100}},index:0});fn({message:{event:'Progress',data:{chunkLength:50}},index:1});await new Promise(r=>setTimeout(r,300));throw Error('QA interrupted download; no install');}
   if(cmd==='plugin:resources|close')return null;if(cmd==='phone_sync_status')return null;if(cmd==='audio_command'){sessionStorage.setItem('paused-before-reload','true');return {playing:false};}return null;
  }};},mode);
  const page=await context.newPage();page.on('pageerror',e=>console.log('QA page error:',e.message));page.setDefaultTimeout(5000);await page.goto('http://127.0.0.1:1420/qa-output/phase14-boundary.html?mode='+mode);
  if(mode==='boundary'){await page.getByRole('heading',{name:'Undertone столкнулся с ошибкой'}).waitFor();assert(!await page.locator('body').innerText().then(s=>s.includes('QA deliberately')));await page.getByRole('button',{name:'Перезапустить интерфейс'}).focus();await page.screenshot({path:'qa-output/phase14-native/fatal-fallback.png'});await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Перезапустить интерфейс'}).click()]);assert.equal(await page.evaluate(()=>sessionStorage.getItem('paused-before-reload')),'true');results.push({mode,reload:true,pausedBeforeReload:true});}
  else if(mode==='toast'){await page.getByRole('button',{name:'QA action',exact:true}).focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.__acted),1);results.push({mode,keyboardAction:true});}
  else{await page.getByRole('button',{name:'Проверить обновления'}).click();const status=page.locator('.settings-update-status');if(mode==='current')await page.getByText('Установлена последняя версия.').waitFor();if(mode==='failure')await page.getByText(/Не удалось проверить GitHub/).waitFor();if(['available','download'].includes(mode))await page.getByText('Доступна версия 0.2.7.').waitFor();if(mode==='download'){await page.getByRole('button',{name:'Установить',exact:true}).click();await page.getByRole('progressbar',{name:'Загрузка обновления'}).waitFor();await page.getByText(/Не удалось установить обновление/).waitFor();}results.push({mode,status:await status.textContent()});}
  await context.close();
 }
 fs.writeFileSync('qa-output/phase14-failure-results.json',JSON.stringify({passed:true,results,realInstall:false},null,2));console.log('PASS boundary + controlled updater current/available/failure/download interrupted; no real install');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
