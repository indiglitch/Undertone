// Browser layout checks using a read-only library snapshot and simulated IPC.
// node scripts/desktop-layout-qa.cjs <playwright-module> <fixture-json> [base-url]
const {chromium}=require(process.argv[2]);
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const fixture=JSON.parse(await fs.readFile(process.argv[3],'utf8'));
 // Simulated IPC supplies lyrics for every fixture track, including random picks.
 fixture.library.tracks.forEach(track=>{track.has_lyrics=true;track.size_bytes=10485760;});
 const out=path.resolve('qa-output/desktop-density');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/qa-cover?*',async route=>{const file=new URL(route.request().url()).searchParams.get('path');try{await route.fulfill({body:await fs.readFile(file),contentType:'image/jpeg'});}catch{await route.fulfill({status:404,body:''});}});
 await page.addInitScript(f=>{
   const callbacks=new Map();let serial=1;
   let status={id:null,playing:false,position:f.session.position_seconds||0,duration:0,volume:.65,ended:false};
   window.__TAURI__={};window.isTauri=true;
   window.__TAURI_INTERNALS__={transformCallback:(fn)=>{const id=serial++;callbacks.set(id,fn);return id;},unregisterCallback:id=>callbacks.delete(id),convertFileSrc:p=>`${location.origin}/qa-cover?path=${encodeURIComponent(p)}`,invoke:async(cmd,args={})=>{
     if(cmd==='plugin:dialog|open')return 'F:/qa-export';
     if(cmd==='collection_action'){window.__qaCollectionAction=args;return f.collections;}
     if(cmd==='export_playlist'){window.__qaPlaylistExport=args;return null;}
     if(cmd==='library')return f.library;
     if(cmd==='collections')return f.collections;
     if(cmd==='playback_session')return f.session;
     if(cmd==='audio_command'){const a=args.action;window.__qaAudioAction=a;if(a.type==='play'){window.__qaAudioPlay=a;window.__qaAudioPlayCount=(window.__qaAudioPlayCount||0)+1;}if(a.type==='play'){const t=f.library.tracks.find(t=>t.id===a.track_id||t.id===a.id||t.path===a.path);status={...status,id:t?.id||f.session.current_track_id,playing:true,duration:t?.duration||240};}if(a.type==='pause')status.playing=false;if(a.type==='resume')status.playing=true;if(a.type==='seek')status.position=a.seconds;return {...status};}
     if(cmd==='audio_meter')return {energy:.36,bass:.3,mids:.35,highs:.2,bins:[.2,.35,.5,.24,.3,.2,.4,.2]};
     if(cmd==='default_scan_folder')return null;
     if(cmd==='deleted_songs_settings')return {folder:null};
     if(cmd==='external_lyrics_enabled')return true;
     
     if(cmd==='phone_sync_status')return {running:true,address:'http://192.168.1.10:47823',code:'qa-pairing',qr_svg:'<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="white"/><path d="M10 10h25v25H10zM65 10h25v25H65zM10 65h25v25H10zM45 45h10v10H45z" fill="black"/></svg>'};
     if(cmd==='scan_status')return {running:false,total:0,processed:0};
     if(cmd==='track_lyrics')return {plain:null,synced:Array.from({length:18},(_,i)=>({timestamp_ms:i*9000,text:`Строка текста для проверки ${i+1}`,order:i})),origin:'local_lrc',revision:'qa'};
     if(cmd==='playback_playable_track_ids')return f.library.tracks.map(t=>t.id);
     if(cmd==='plugin:app|version')return '0.2.5';
     if(cmd==='plugin:event|listen')return serial++;
     if(cmd==='bulk_lyrics_indexing_status')return {phase:'idle',processed:0,total:0,found:0,local_existing:0,skipped:0,not_found:0,ambiguous:0,temporary_errors:0,permanent_errors:0,current:null};
     return null;
   }};
   window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
 },fixture);
 await page.goto(process.argv[4]||'http://127.0.0.1:1420/');await page.waitForSelector('.listening-feature');
 await page.getByRole('textbox',{name:'Поиск с Главной',exact:true}).fill('2Pac');await page.getByRole('button',{name:'Открыть поиск',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Поиск музыки',exact:true}).inputValue(),'2Pac','Home search routes query to unified search');await page.locator('[data-nav-id=home]').click();
 await page.locator('.playlist-link').first().click({button:'right'});
 await page.getByRole('menuitem',{name:'Экспортировать с аудиофайлами…',exact:true}).click();
 assert.equal((await page.evaluate(()=>window.__qaPlaylistExport)).playlistId,fixture.collections.playlists[0].id,'sidebar exports selected playlist');
 await page.locator('[data-nav-id=library]').click();await page.locator('[data-library-id=playlists]').click();
 await page.locator('.entity-card').first().click({button:'right'});
 await page.getByRole('menuitem',{name:'Экспортировать с аудиофайлами…',exact:true}).click();
 assert.equal((await page.evaluate(()=>window.__qaPlaylistExport)).path,'F:/qa-export','collection export uses save dialog path');
 await page.locator('[data-nav-id=home]').click();
 await page.getByRole('button',{name:'Слушать случайное',exact:true}).click();await page.waitForFunction(()=>window.__qaAudioPlay?.type==='play');assert.ok(await page.getByRole('button',{name:'Выключить перемешивание',exact:true}).count()>0,'random action enables shuffle');
 assert.equal(await page.getByText('UNDERTONE / ЛИЧНАЯ ЧАСТОТА',{exact:true}).count(),0,'removed Home tagline');assert.equal(await page.getByText('Собрано тобой. Без правил.',{exact:true}).count(),0,'removed Home signoff');assert.ok((await page.locator('.home-top-actions').boundingBox()).y<(await page.locator('.reference-random').boundingBox()).y,'Home actions above random card');await page.locator('.home-top-actions').getByRole('button',{name:'Недавно добавлено',exact:true}).click();await page.waitForSelector('[data-collection-kind=recentlyAdded]');await page.locator('[data-nav-id=home]').click();await page.locator('.home-top-actions').getByRole('button',{name:'Создать плейлист',exact:true}).click();await page.waitForSelector('.playlist-form');await page.getByRole('button',{name:'Закрыть редактор',exact:true}).click();
 const recentRow=page.locator('.reference-recent .track-row').first();await recentRow.hover();await page.waitForTimeout(180);assert.equal(await recentRow.locator('.row-play').evaluate(el=>getComputedStyle(el).opacity),'1','recent row shows quick play on hover');await recentRow.click();assert.ok(await page.evaluate(()=>window.__qaAudioPlay?.type==='play'),'recent row starts playback');
 assert.equal(await recentRow.locator('.track-file-size').innerText(),'10 МБ','Home shows file size');
 assert.equal(await page.locator('.primary-navigation [data-nav-id]').count(),6,'six primary destinations');
 assert.ok(await page.locator('.recent-list-row').count()<=3,'home history limited to three tracks');
 await page.locator('.playlist-link').first().click();await page.waitForSelector('.collection-detail');assert.ok(await page.locator('.track-row').count()>0,'shortcut opens real playlist');
 await page.getByRole('combobox',{name:'Сортировка',exact:true}).selectOption('title');
 const filterStyle=await page.locator('.playlist-filter input').evaluate(el=>({background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopWidth}));assert.equal(filterStyle.background,'rgba(0, 0, 0, 0)');assert.equal(filterStyle.border,'0px');
 const firstTitle=await page.locator('.track-row .track-titles strong').first().innerText();
 const playlistId=Number(await page.locator('.collection-track-area').getAttribute('data-playlist-id'));
 const byId=new Map(fixture.library.tracks.map(t=>[t.id,t]));
 const entries=fixture.collections.playlists.find(p=>p.id===playlistId).entries;
 const ordered=entries.filter(e=>byId.has(e.track_id)).slice().sort((a,b)=>new Intl.Collator('ru',{numeric:true,sensitivity:'base'}).compare(byId.get(a.track_id).title,byId.get(b.track_id).title)||a.track_id-b.track_id);
 assert.equal(firstTitle,byId.get(ordered[0].track_id).title,'playlist sorts by title');
 await page.getByRole('textbox',{name:'Поиск в плейлисте',exact:true}).fill(firstTitle);
 assert.ok(await page.locator('.track-row').count()>0,'playlist search returns track');
 assert.ok((await page.locator('.track-row .track-titles strong').allTextContents()).every(t=>t===firstTitle),'playlist search filters unrelated tracks');
 await page.locator('.track-row button[aria-label^="Действия:"]').first().click();
 await page.getByRole('button',{name:'Убрать из плейлиста',exact:true}).click();
 assert.equal((await page.evaluate(()=>window.__qaCollectionAction)).action.entry_id,ordered[0].id,'sorted filtered removal uses original playlist entry');
 await page.getByRole('button',{name:'Очистить поиск в плейлисте',exact:true}).click();
 await page.getByRole('combobox',{name:'Сортировка',exact:true}).selectOption('default');
 assert.equal(await page.locator('.track-row .track-titles strong').first().innerText(),byId.get(entries[0].track_id).title,'default restores playlist order');await page.locator('[data-nav-id="home"]').click();
 const report=[];
 const capture=async(name)=>{await page.waitForTimeout(200);await page.screenshot({path:path.join(out,name+'.png')});};
 const nav=async id=>{if(['artists','albums','playlists','recentlyAdded','liked'].includes(id)){await page.locator('[data-nav-id="library"]').click();await page.locator(`[data-library-id="${id}"]`).click();}else{if(['history','queue','lyrics'].includes(id)){await page.locator('.sidebar-tools').evaluate(el=>el.open=true);}await page.locator(`[data-nav-id="${id}"]`).click();}await page.waitForTimeout(180);};
 const geometry=async()=>page.evaluate(()=>{
   const rect=s=>{const el=document.querySelector(s);if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
   const controls=[...document.querySelectorAll('[data-player-control-id]')].map(el=>({id:el.dataset.playerControlId,...(()=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};})()}));
   return {home:rect('.home-content'),collection:rect('.library-content'),player:rect('.player'),main:rect('main'),controls,overflow:document.documentElement.scrollWidth>innerWidth};
 });
 for(const [width,height] of [[1920,1080],[1440,900],[1000,720],[2560,1440]]){
   await page.setViewportSize({width,height});await nav('home');await capture(`home-${width}`);
   const homeDensity=await page.evaluate(()=>({random:document.querySelector('.reference-random').getBoundingClientRect().height,card:document.querySelector('.reference-destinations button').getBoundingClientRect().height,search:document.querySelector('.reference-search').getBoundingClientRect().height,collectionTop:document.querySelector('.listening-home-header').getBoundingClientRect().y,playerTop:document.querySelector('.player').getBoundingClientRect().y}));assert.ok(homeDensity.random<=96&&homeDensity.card<=90&&homeDensity.search<=58,'compact Home blocks');if(height>=900)assert.ok(homeDensity.collectionTop<homeDensity.playerTop-70,'collection visible above player');
   let g=await geometry();await fs.writeFile(path.join(out,'geometry-'+width+'.json'),JSON.stringify(g,null,2));assert.ok(!g.overflow,'page overflow');assert.ok(g.home.width>=g.main.width-2&&g.home.width<=g.main.width+1,'home uses available width');
   for(const c of g.controls){assert.ok(c.x>=g.player.x-1&&c.right<=g.player.right+1&&c.y>=g.player.y-1&&c.bottom<=g.player.bottom+1,`${width}: ${c.id} outside player`);}
   for(let i=0;i<g.controls.length;i++)for(let j=i+1;j<g.controls.length;j++){const a=g.controls[i],b=g.controls[j];assert.ok(!(a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1),`${width}: control overlap ${a.id}/${b.id}`);}
   await nav('library');await capture(`library-${width}`);g=await geometry();assert.ok(g.collection.width>=g.main.width-2&&g.collection.width<=g.main.width+1,'library uses available width');
   const rows=await page.locator('.track-row').evaluateAll(els=>els.slice(0,3).map(el=>el.getBoundingClientRect().height));assert.ok(rows.length&&rows.every(h=>h===52),'virtual row height');
   report.push({viewport:{width,height},homeUsesAvailableWidth:true,table:g.collection,rows,controls:'no overlap'});
 }
 await page.setViewportSize({width:1440,height:900});
 await nav('home');await page.locator('.player-layout-lock').click();const repeat=page.locator('[data-player-control-id=repeat]');const box=await repeat.boundingBox();await page.mouse.move(box.x+20,box.y+25);await page.mouse.down();await page.mouse.move(box.x+40,box.y+25,{steps:8});await page.mouse.up();const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('undertone.player.controls.positions.v3')||'{}'));assert.ok(typeof saved.repeat==='number','drag persists transport positions');await page.locator('.player-layout-lock').click();
 for(const id of ['artists','albums','playlists','recentlyAdded','history','liked','queue','lyrics','search']){await nav(id);await capture(id);}
 await nav('home');const shelf=page.locator('.media-shelf .album-grid');await page.getByRole('button',{name:'Далее: Альбомы',exact:true}).click();await page.waitForTimeout(450);assert.ok(await shelf.evaluate(el=>el.scrollLeft)>0,'shelf arrow scrolls');
 await nav('settings');
 const settingsBounds=await page.locator('.settings-dialog').boundingBox();
 for(const label of ['Общие','Внешний вид','Плеер','Библиотека']){await page.locator('.settings-navigation').getByRole('button',{name:label,exact:true}).click();const tabBounds=await page.locator('.settings-dialog').boundingBox();assert.equal(tabBounds.width,settingsBounds.width,'settings width stable');assert.equal(tabBounds.height,settingsBounds.height,'settings height stable');
 if(label==='Плеер'){const item=page.locator('.settings-player-preview [data-player-control-id=shuffle]');assert.ok((await page.locator('.settings-player-preview .preview-transport .player-control-scroll').boundingBox()).width>250,'preview controls visible');const oldPosition=await page.evaluate(()=>localStorage.getItem('undertone.player.controls.positions.v3'));const itemBox=await item.boundingBox();await page.mouse.move(itemBox.x+12,itemBox.y+20);await page.mouse.down();await page.mouse.move(itemBox.x+32,itemBox.y+20,{steps:8});await page.mouse.up();assert.notEqual(await page.evaluate(()=>localStorage.getItem('undertone.player.controls.positions.v3')),oldPosition,'preview drag saves changed positions');}
 await capture('settings-'+({'Общие':'general','Внешний вид':'appearance','Плеер':'player','Библиотека':'library'}[label]));}
 await page.getByRole('button',{name:'Закрыть настройки',exact:true}).click();
 await page.locator('.now-playing').click();await page.waitForSelector('.now-playing-tabs');await capture('now-lyrics');assert.equal(await page.locator('.listening-dialog[open]').count(),1,'player opens modal');await page.keyboard.press('Escape');await page.waitForSelector('.listening-dialog',{state:'detached'});assert.ok(await page.locator('.now-playing').evaluate(el=>el===document.activeElement),'close restores trigger focus');await page.locator('.now-playing').click();
 for(const label of ['Далее','О треке']){await page.getByRole('tab',{name:label,exact:true}).click();await capture('now-'+(label==='Далее'?'queue':'about'));}
 await page.getByRole('button',{name:'Закрыть информацию',exact:true}).click();await page.locator('.player-lyrics').click();await page.waitForSelector('.lyrics-screen');await page.locator('.now-playing').click();await page.waitForSelector('.listening-dialog[open]');assert.equal(await page.getByRole('tab',{name:'Далее',exact:true}).getAttribute('aria-selected'),'true');await capture('full-lyrics-with-panel');
 await page.setViewportSize({width:1000,height:720});await capture('full-lyrics-panel-1000');assert.ok(!(await geometry()).overflow);await page.setViewportSize({width:1440,height:900});
 await page.getByRole('button',{name:'Закрыть информацию',exact:true}).click();
 await page.locator('.player-control-visualizer button').click();await page.waitForSelector('.full-visualizer');await capture('visualizer-cosmos');
 await page.getByRole('button',{name:'Калейдоскоп',exact:true}).click();await capture('visualizer-kaleidoscope');
 await page.getByRole('button',{name:'Психоделика',exact:true}).click();await capture('visualizer-psychedelic');
 assert.deepEqual(errors,[],'browser runtime errors');
 await fs.writeFile(path.join(out,'geometry.json'),JSON.stringify({report,errors,fixtureTracks:fixture.library.tracks.length},null,2));
 await nav('search');if(await page.getByRole('button',{name:'Очистить поиск',exact:true}).isVisible())await page.getByRole('button',{name:'Очистить поиск',exact:true}).click();const starter=page.locator('.search-starters button').first();const artist=(await starter.innerText()).replace('↗','').trim();await starter.click();assert.equal(await page.getByRole('textbox',{name:'Поиск музыки'}).inputValue(),artist,'artist suggestion sets local search');assert.ok(await page.locator('.unified-search-library .track-row').count()>0,'suggestion returns real local tracks');await page.locator('.search-sort-controls select').selectOption('duration');await page.locator('.search-sort-controls button').click();assert.equal(await page.locator('.search-sort-controls select').inputValue(),'duration','search sort control accessible');await capture('search-results');await page.getByRole('textbox',{name:'Поиск музыки',exact:true}).fill('a');await page.waitForTimeout(200);const density=await page.evaluate(()=>{const list=document.querySelector('.unified-search-library-list').getBoundingClientRect(),main=document.querySelector('main').getBoundingClientRect(),head=document.querySelector('.unified-search-library .track-head').getBoundingClientRect();return {height:list.height,mainHeight:main.height,headOffset:head.y-main.y,rowHeights:[...document.querySelectorAll('.unified-search-library .track-row')].map(el=>el.getBoundingClientRect().height),visible:[...document.querySelectorAll('.unified-search-library .track-row')].filter(el=>{const r=el.getBoundingClientRect();return r.y>=list.y&&r.bottom<=list.bottom;}).length};});assert.ok(density.height>density.mainHeight*.65,'results occupy most search height');assert.ok(density.headOffset<210,'results header starts near top');assert.ok(density.rowHeights.every(h=>h===44),'dense virtual rows match layout');assert.ok(density.visible>=10,'more than ten complete results visible');assert.equal(await page.locator('.unified-search-page .library-heading,.search-frequency').count(),0,'search decoration removed');await capture('search-dense-results');
 await page.emulateMedia({reducedMotion:'reduce'});await nav('home');await page.locator('.freak-home').evaluate(el=>el.classList.add('is-playing'));assert.equal(await page.locator('.feature-record').evaluate(el=>getComputedStyle(el).animationName),'none','reduced motion suppresses record animation');await page.emulateMedia({reducedMotion:'no-preference'});
 await nav('library');await page.locator('.track-row').first().click({button:'right'});const menuMetrics=await page.locator('.track-context-menu').evaluate(el=>({width:el.getBoundingClientRect().width,radius:getComputedStyle(el).borderRadius,rowHeights:[...el.querySelectorAll('.context-menu-item')].map(item=>item.getBoundingClientRect().height)}));assert.ok(menuMetrics.width<=280,'compact menu width');assert.equal(menuMetrics.radius,'9px','shared compact radius');assert.ok(menuMetrics.rowHeights.every(h=>h>=30&&h<=45),'compact rows support wrapped labels');await capture('track-context-menu');await page.getByRole('menuitem',{name:'Добавить в плейлист',exact:true}).click();await page.waitForSelector('.context-submenu-panel');await capture('playlist-submenu');assert.equal(await page.locator('.context-submenu-panel').evaluate(el=>getComputedStyle(el).borderRadius),'9px','submenu shares radius');await page.keyboard.press('Escape');await page.locator('.playlist-link').first().click({button:'right'});await capture('playlist-context-menu');assert.equal(await page.locator('.track-context-menu .context-menu-item').first().evaluate(el=>el.getBoundingClientRect().height),30,'playlist shares row density');await page.keyboard.press('Escape');
 await nav('library');let firstRow=page.locator('.track-row').first();await firstRow.locator('.duration').click();const playsBefore=await page.evaluate(()=>window.__qaAudioPlayCount);await firstRow.locator('.artist-link').click();await page.waitForSelector('[data-collection-kind=artist]');assert.equal(await page.evaluate(()=>window.__qaAudioPlayCount),playsBefore,'artist navigation never starts playback');await nav('library');firstRow=page.locator('.track-row').first();await firstRow.locator('.album-cell').click();await page.waitForSelector('[data-collection-kind=album]');assert.equal(await page.evaluate(()=>window.__qaAudioPlayCount),playsBefore,'album navigation never starts playback');await nav('settings');await page.getByRole('button',{name:'Внешний вид',exact:true}).click();await page.getByRole('checkbox',{name:'Альбом',exact:true}).uncheck();await page.getByRole('button',{name:'Закрыть настройки',exact:true}).click();await nav('library');assert.equal(await page.locator('.album-cell').count(),0,'metadata setting hides album column');await nav('settings');await page.getByRole('button',{name:'Внешний вид',exact:true}).click();assert.equal(await page.getByRole('checkbox',{name:'Альбом',exact:true}).isChecked(),false,'metadata preference survives reopening settings');await page.getByRole('checkbox',{name:'Альбом',exact:true}).check();await page.getByRole('button',{name:'Закрыть настройки',exact:true}).click();await page.locator('.playlist-link').first().click();await page.getByRole('combobox',{name:'Сортировка',exact:true}).selectOption('default');const handle=page.locator('.playlist-reorder-handle').first(),handleBox=await handle.boundingBox();const dragPlaylistId=Number(await page.locator('.collection-track-area').getAttribute('data-playlist-id'));const dragEntries=fixture.collections.playlists.find(p=>p.id===dragPlaylistId).entries;await page.mouse.move(handleBox.x+8,handleBox.y+12);await page.mouse.down();await page.mouse.move(handleBox.x+8,handleBox.y+116,{steps:10});await page.waitForTimeout(100);assert.equal(await page.locator('.playlist-drag-ghost').count(),1,'floating drag preview shown');assert.equal(await page.locator('.playlist-drag-source').count(),1,'source placeholder shown');const shifted=await page.locator('.track-row').nth(1).evaluate(el=>el.style.transform);assert.ok(shifted.includes('0px'),'neighbor opens gap');await page.screenshot({path:path.join(out,'playlist-drag-active.png')});await page.mouse.up();assert.equal(await page.locator('.playlist-drag-ghost').count(),0,'ghost removed on drop');await page.waitForTimeout(100);const reorder=await page.evaluate(()=>window.__qaCollectionAction.action);assert.equal(reorder.type,'move_entry','grip produces playlist reorder');assert.equal(reorder.entry_id,dragEntries[0].id,'grip moves exact entry');assert.equal(reorder.index,2,'grip targets hovered index');await page.evaluate(()=>{window.__qaCollectionAction=null;});const cancelBox=await page.locator('.playlist-reorder-handle').first().boundingBox();await page.mouse.move(cancelBox.x+8,cancelBox.y+12);await page.mouse.down();await page.mouse.move(cancelBox.x+8,cancelBox.y+64,{steps:5});await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await page.evaluate(()=>window.__qaCollectionAction),null,'Escape cancels playlist reordering');await capture('playlist-reorder-handles');
 console.log('PASS working widths, virtual rows, player bounds/overlaps, settings navigation, local search, lyrics tabs; screenshots:',out);
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
