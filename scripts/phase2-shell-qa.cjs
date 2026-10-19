const {chromium}=require(process.argv[2]);const assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 const context=await browser.newContext({viewport:{width:1280,height:720},reducedMotion:'reduce'});
 await context.addInitScript(()=>{
  window.__TAURI__={};window.isTauri=true;window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};let serial=1;
  const tracks=Array.from({length:1500},(_,i)=>({id:i+1,path:`F:/fixture/${i}.flac`,title:`Track ${String(i).padStart(4,'0')}`,artist:'Fixture Artist',album:'Fixture Album',album_artist:'Fixture Artist',artist_id:1,album_id:1,added_at:'2026-10-05',track_number:i+1,year:2026,duration:240,format:'FLAC',cover:null,genre:'Test',has_lyrics:false}));
  const collections={likes:[1],history:[{id:1,track_id:1,played_at:'2026-10-05'}],playlists:Array.from({length:120},(_,i)=>({id:i+1,name:`Playlist ${i+1} — long name to check overflow`,description:'',entries:[{id:i+1,track_id:1,position:0}]}))};
  let status={id:1,playing:false,position:0,duration:240,volume:.65,ended:false};
  window.__TAURI_INTERNALS__={transformCallback:()=>serial++,unregisterCallback:()=>{},convertFileSrc:path=>path,invoke:async(cmd,args={})=>{
   if(cmd==='library')return {tracks,folders:['F:/Music','F:/Other','F:/More'],errors:[]};if(cmd==='collections'||cmd==='collection_action')return collections;
   if(cmd==='playback_session')return {entries:[{entry_id:1,track_id:1},{entry_id:2,track_id:2}],current_entry_id:1,current_track_id:1,cursor:0,position_seconds:0};
   if(cmd==='audio_status')return status;if(cmd==='audio_command'){if(args.action.type==='play')status={...status,id:args.action.track_id??args.action.id??1};return status;}
   if(cmd==='audio_meter')return {energy:0,bass:0,mids:0,highs:0,bins:[]};if(cmd==='external_lyrics_enabled')return true;
   if(cmd==='deleted_songs_settings')return {folder:null};
   if(cmd==='playback_playable_track_ids')return tracks.map(t=>t.id);if(cmd==='plugin:event|listen')return serial++;if(cmd==='plugin:app|version')return '0.2.5';
   if(cmd==='bulk_lyrics_indexing_status')return {phase:'idle',processed:0,total:0,found:0,local_existing:0,skipped:0,not_found:0,ambiguous:0,temporary_errors:0,pending:0};if(cmd==='track_lyrics')return null;return null;
  }};
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const base=process.argv[3]||'http://127.0.0.1:1431';await fs.mkdir('qa-output/phase2-shell',{recursive:true});
 await page.goto(base);await page.locator('[data-nav-id=library]').click();await page.locator('.track-row').first().waitFor();
 const results=[];
 async function geometry(name){const g=await page.evaluate(()=>{const rect=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight}};return {viewport:{width:innerWidth,height:innerHeight},shell:rect('.app-shell'),sidebar:rect('.sidebar'),main:rect('main'),player:rect('.player-area'),primary:rect('.primary-navigation'),settings:rect('.sidebar-settings'),playlists:rect('.sidebar-playlist-scroll'),horizontalOverflow:document.documentElement.scrollWidth>innerWidth,visibleRows:document.querySelectorAll('.track-row').length};});
 assert(!g.horizontalOverflow,name+' no horizontal overflow');assert(g.main.bottom<=g.player.y+1,name+' content clear of player');assert(g.settings.bottom<=g.sidebar.bottom+1,name+' settings visible');assert(g.primary.y>=0&&g.primary.bottom<=g.sidebar.bottom,name+' primary visible');assert(g.main.width>300,name+' practical main width');assert(g.playlists.height>10,name+' playlist scroll available');results.push({name,...g});await page.screenshot({path:`qa-output/phase2-shell/${name}.png`});return g;}
 for(const [w,h] of [[1280,720],[1920,1080],[2560,1440]]){await page.setViewportSize({width:w,height:h});await page.locator('[data-nav-id=library]').click();await page.locator('[aria-label="Развернуть боковую панель"]').count().then(async n=>{if(n)await page.locator('[aria-label="Развернуть боковую панель"]').click()});await geometry(`${w}x${h}-expanded`);
 await page.locator('[aria-label="Свернуть боковую панель"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.app-shell').getAttribute('data-sidebar-collapsed'),'true');await geometry(`${w}x${h}-collapsed`);
 await page.locator('[data-nav-id=library]').click();assert(await page.getByRole('button',{name:'Новый плейлист',exact:true}).isVisible());const nav=page.locator('[data-nav-id=albums]');assert.equal(await nav.locator('.nav-text').isVisible(),false);assert(await nav.getAttribute('aria-label'));await nav.focus();await page.getByRole('tooltip',{name:'Альбомы',exact:true}).waitFor();await page.keyboard.press('Escape');
 await page.reload();await page.locator('.track-row').first().waitFor();assert.equal(await page.locator('.app-shell').getAttribute('data-sidebar-collapsed'),'true');assert.equal(await page.evaluate(()=>localStorage.getItem('undertone.shell.sidebarCollapsed')),'true');
 }
 await page.setViewportSize({width:1280,height:720});
  for(const id of ['home','search','playlists','albums','liked','library','history','queue','lyrics']){if(['history','queue','lyrics'].includes(id))await page.locator('.sidebar-tools-disclosure > summary').click();await page.locator(`[data-nav-id=${id}]`).click();assert.equal(await page.locator('main').getAttribute('data-page'),id);assert.equal(await page.locator(`[data-nav-id=${id}]`).getAttribute('aria-current'),'page');if(['history','queue','lyrics'].includes(id))assert(await page.locator('.sidebar-tools-disclosure').evaluate(e=>e.classList.contains('selected')));}
 await page.locator('[data-nav-id=settings]').click();await page.locator('.settings-dialog[open]').waitFor();await page.getByRole('button',{name:'Закрыть настройки',exact:true}).click();
 await page.locator('[data-nav-id=library]').click();const rows=await page.locator('.track-row').count();assert(rows<100);await page.locator('.library-content:not(.unified-search-page) .track-scroll').evaluate(e=>e.scrollTop=e.scrollHeight);await page.waitForFunction(()=>Array.from(document.querySelectorAll('.track-row')).some(e=>e.dataset.trackId==='1500'));assert((await page.locator('.track-row').count())<100);
 await page.locator('.sidebar-playlist-scroll').evaluate(e=>e.scrollTop=e.scrollHeight);assert(await page.locator('.sidebar-playlist-scroll').evaluate(e=>e.scrollTop>0));assert(await page.locator('[data-nav-id=home]').isVisible());
 await page.locator('.playlist-link').last().click();assert.equal(await page.locator('main').getAttribute('data-page'),'playlist');await page.locator('[aria-label=Назад]').click();assert.equal(await page.locator('main').getAttribute('data-page'),'library');
 // Scaling is approximated with CSS viewport dimensions; this is not an OS DPI acceptance test.
 for(const scale of [1,1.25,1.5]){await page.setViewportSize({width:Math.round(1920/scale),height:Math.round(1080/scale)});await geometry(`1920-scale-${scale}`);}
 await page.setViewportSize({width:1920,height:1080});await page.locator('[aria-label="Развернуть боковую панель"]').click();
 const handle=await page.locator('.sidebar-resize').boundingBox();await page.mouse.move(handle.x+3,handle.y+100);await page.mouse.down();await page.mouse.move(handle.x+63,handle.y+100,{steps:5});await page.mouse.up();assert(await page.locator('.sidebar').evaluate(e=>e.getBoundingClientRect().width>224));await page.locator('.sidebar-resize').dblclick();
 const playerHandle=await page.locator('.player-resize').boundingBox();await page.mouse.move(500,playerHandle.y+3);await page.mouse.down();await page.mouse.move(500,playerHandle.y-40,{steps:5});await page.mouse.up();await geometry('player-resized');await page.locator('.player-resize').dblclick();
 await page.locator('.now-playing').click();await page.locator('.listening-dialog[open]').waitFor();await page.keyboard.press('Escape');await page.locator('.listening-dialog').waitFor({state:'detached'});
 await page.locator('[aria-label="Свернуть боковую панель"]').click();
 await page.setViewportSize({width:1000,height:640});await geometry('minimum-1000x640');
 await page.locator('[data-nav-id=home]').click();await page.locator('.home-content').evaluate(e=>e.scrollTop=e.scrollHeight);assert(await page.locator('.home-content').evaluate(e=>e.scrollTop>0));
 // Check the normal transition separately from the reduced-motion QA context.
 await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('[aria-label="Развернуть боковую панель"]').click();await page.waitForFunction(()=>Math.abs(document.querySelector('.sidebar').getBoundingClientRect().width-200)<1);
 assert.equal(await page.locator('.app-shell').evaluate(e=>getComputedStyle(e).transitionDuration),'0.17s');
 await page.locator('[aria-label="Свернуть боковую панель"]').click();await page.waitForFunction(()=>Math.abs(document.querySelector('.sidebar').getBoundingClientRect().width-64)<1);
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.app-shell').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 await page.locator('.sidebar-tools-disclosure > summary').focus();await page.keyboard.press('Enter');await page.keyboard.press('Escape');assert.equal(await page.locator('.sidebar-tools-disclosure').getAttribute('open'),null);assert(await page.locator('.sidebar-tools-disclosure > summary').evaluate(e=>e===document.activeElement));
 await page.setViewportSize({width:2560,height:1440});await page.locator('[data-nav-id=home]').click();const card=await page.locator('.home-content').boundingBox(),breadcrumb=await page.locator('.topbar').boundingBox();assert.equal(card.width,1400);assert.equal(card.x,breadcrumb.x);assert.equal(card.width,breadcrumb.width);
 await page.locator('[data-nav-id=library]').click();assert(await page.locator('.library-content:not(.unified-search-page)').evaluate(e=>e.getBoundingClientRect().width>2000));
 assert.deepEqual(errors,[]);await fs.writeFile('qa-output/phase2-shell/geometry.json',JSON.stringify(results,null,2));console.log('PASS shell geometry, expanded/collapsed persistence, navigation, settings, independent playlist scroll, TrackList virtualization/end row, Home scroll, keyboard collapse/tooltip, scaling approximations and minimum viewport; no page errors');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
