// Production WebView2 integration smoke: real IPC, isolated portable profile, no mocks.
const {chromium}=require(process.env.PHASE14_PLAYWRIGHT || 'playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const out=path.resolve('qa-output/phase14-native');
const results={screens:[],matrix:[],audio:[],errors:[]};
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:9128');
 const page=browser.contexts()[0].pages()[0];
 page.setDefaultTimeout(5000);
 assert.equal(new URL(page.url()).hostname,'tauri.localhost');
 page.on('pageerror',e=>results.errors.push(e.message));
 page.on('console',e=>{if(['error','warning'].includes(e.type()))results.errors.push(e.text());});
 const invoke=(cmd,args={})=>page.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
 const click=async(name,role='button')=>{await page.getByRole(role,{name,exact:true}).first().evaluate(e=>e.click());await page.waitForTimeout(120);};
 const capture=async(name)=>{await page.waitForTimeout(350);await page.screenshot({path:path.join(out,name+'.png')});results.screens.push({name,...await geometry()});};
 const geometry=()=>page.evaluate(()=>({viewport:[innerWidth,innerHeight,devicePixelRatio],overflow:document.documentElement.scrollWidth>innerWidth,dom:document.querySelectorAll('*').length,rows:document.querySelectorAll('.track-row').length}));
 if(await page.getByRole('button',{name:'Закрыть Now Playing',exact:true}).count())await click('Закрыть Now Playing');
 results.library=await page.evaluate(async()=>{const start=performance.now();const lib=await window.__TAURI_INTERNALS__.invoke('library');return {tracks:lib.tracks.length,loadMs:Math.round(performance.now()-start)};});assert(results.library.tracks>=25000);
 await click('Локальная медиатека');await click('Слушать: Synthetic Song 1 — Synthetic Artist 1');await invoke('audio_command',{action:{type:'pause'}});
 await click('Главная');await capture('home');
 await click('Локальная медиатека');await capture('library');
 await click('Альбомы');await capture('albums');
 await click('Исполнители');await capture('artists');
 await click('Плейлист: Production QA Playlist');await capture('playlist');
 await click('Плейлист: Empty Playlist');await capture('empty-playlist');
 await click('Очередь воспроизведения');await capture('queue');
 await click('Поиск музыки · Ctrl+K');
 const input=page.getByRole('textbox',{name:'Поиск музыки',exact:true});await input.fill('Synthetic Song 100');await page.waitForTimeout(400);await capture('search');
 await input.fill('no-match-phase14-7d47c');await page.waitForTimeout(400);await capture('search-empty');
 await click('Текст песни');await capture('lyrics');
 await click('Сейчас играет: Synthetic Song 1');await capture('now-playing-lyrics');
 for(const [tab,name]of [['Далее','now-playing-next'],['О треке','now-playing-about']]){await click(tab,'tab');await capture(name);}
 const cdp=await page.context().newCDPSession(page);
 for(const [width,height]of [[1000,700],[1280,720],[1920,1080],[2560,1440]])for(const scale of [1,1.25,1.5,2]){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:false});await page.waitForTimeout(80);results.matrix.push({surface:'now-playing',...await geometry()});
 }
 await click('Закрыть Now Playing');
 for(const surface of ['Главная','Локальная медиатека','Очередь воспроизведения','Настройки']){
   await click(surface);
   for(const [width,height]of [[1000,700],[1280,720],[1920,1080],[2560,1440]])for(const scale of [1,1.25,1.5,2]){await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:false});results.matrix.push({surface,...await geometry()});}
   if(surface==='Настройки'){await capture('settings');await click('Закрыть настройки');}
 }
 await cdp.send('Emulation.clearDeviceMetricsOverride');
 await click('Действия с треком');await capture('context-menu');await page.keyboard.press('Escape');
 await click('Выключить звук');await page.waitForTimeout(220);assert.equal((await invoke('audio_command',{action:{type:'status'}})).volume,0);
 await click('Включить звук');assert(Math.abs((await invoke('audio_command',{action:{type:'status'}})).volume-.27)<.001);results.muteRestore=true;
 for(const action of [{type:'play',id:1},{type:'pause'},{type:'seek',seconds:12},{type:'resume'},{type:'pause'}])results.audio.push({action,status:await invoke('audio_command',{action})});
 const rapid=await Promise.all([1,3,4,1,3].map(id=>invoke('audio_command',{action:{type:'play',id}})));results.rapid={responses:rapid.length,status:await invoke('audio_command',{action:{type:'pause'}})};
 try{await invoke('audio_command',{action:{type:'play',id:6}});throw Error('missing file unexpectedly played');}catch(e){results.missingFile=String(e).slice(0,160);}
 await click('Локальная медиатека');await click('Слушать: Synthetic Song 2 — Synthetic Artist 1');await page.waitForTimeout(2800);results.naturalEnd=await invoke('audio_command',{action:{type:'status'}});assert.equal(results.naturalEnd.id,3);await invoke('audio_command',{action:{type:'pause'}});
 results.memory=await cdp.send('Runtime.getHeapUsage');results.overflows=results.matrix.filter(x=>x.overflow);assert.equal(results.overflows.length,0);assert.deepEqual(results.errors,[]);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({screens:results.screens.length,matrix:results.matrix.length,library:results.library,overflows:results.overflows.length,errors:results.errors,muteRestore:results.muteRestore}));
 // Disconnect the debugger without Browser.close(), which can close a native WebView.
 process.exit(0);
})().catch(e=>{fs.writeFileSync(path.join(out,'results-partial.json'),JSON.stringify(results,null,2));console.error(e);process.exit(1);});
