// Focused browser checks for Phase 1 primitives, using the real Vite modules and CSS.
// node scripts/phase1-ui-qa.cjs <playwright-module> [base-url]
const {chromium}=require(process.argv[2]);
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
 const page=await browser.newPage({viewport:{width:1000,height:800},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.route('**/phase1-check',route=>route.fulfill({contentType:'text/html',body:`<html><head><style>body{padding:24px}#root{max-width:600px;height:auto;display:grid;gap:16px}</style></head><body><div id="root"></div><script type="module">
 import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
 const {default:React}=await import('/node_modules/.vite/deps/react.js');const {default:{createRoot}}=await import('/node_modules/.vite/deps/react-dom_client.js');
 const {Button,IconButton,Input,SearchInput,Tabs,Divider}=await import('/src/primitives.tsx');const {Tooltip}=await import('/src/Tooltip.tsx');
 await import('/src/designTokens.css');await import('/src/styles.css');await import('/src/uiPolish.css');await import('/src/glassRedesign.css');await import('/src/desktopLayout.css');await import('/src/referenceIdentity.css');await import('/src/primitives.css');
 const h=React.createElement;
 function Demo(){const [query,setQuery]=React.useState('track'),[tab,setTab]=React.useState('a');return h(React.Fragment,null,
 h(Button,{onClick:()=>window.clicks=(window.clicks||0)+1},'Action'),h(Button,{disabled:true},'Disabled'),h(Button,{type:'submit',variant:'primary'},'Submit'),
 h(Input,{'aria-label':'Name',value:query,onChange:e=>setQuery(e.target.value)}),h(SearchInput,{'aria-label':'Find',value:query,onChange:e=>setQuery(e.target.value),onClear:()=>setQuery('')}),
 h(Tabs,{label:'Example',value:tab,onValueChange:setTab,items:[{value:'a',id:'tab-a',panelId:'panel',label:'First'},{value:'b',id:'tab-b',panelId:'panel',label:'Unavailable',disabled:true},{value:'c',id:'tab-c',panelId:'panel',label:'Last'}]}),h('div',{id:'panel',role:'tabpanel','aria-labelledby':'tab-'+tab},tab),
 h(Tooltip,{content:'Help',delay:20},h(IconButton,{'aria-label':'Help','aria-describedby':'existing'},'?')),h('p',{id:'existing'},'Existing description'),h(Divider));}
 createRoot(document.getElementById('root')).render(h(Demo));
 </script></body></html>`}));
 await page.goto((process.argv[3]||'http://127.0.0.1:1431')+'/phase1-check');
 await page.getByRole('button',{name:'Action',exact:true}).click();assert.equal(await page.evaluate(()=>window.clicks),1);
 assert.equal(await page.getByRole('button',{name:'Action',exact:true}).getAttribute('type'),'button');
 assert.equal(await page.getByRole('button',{name:'Submit',exact:true}).getAttribute('type'),'submit');
 assert(await page.getByRole('button',{name:'Disabled',exact:true}).isDisabled());
 await page.getByRole('textbox',{name:'Find',exact:true}).fill('new');assert.equal(await page.getByRole('textbox',{name:'Name',exact:true}).inputValue(),'new');
 await page.getByRole('button',{name:'Очистить поиск'}).click();assert.equal(await page.getByRole('textbox',{name:'Find',exact:true}).inputValue(),'');
 await page.getByRole('tab',{name:'First',exact:true}).focus();await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'Last',exact:true}).getAttribute('aria-selected'),'true');assert(await page.getByRole('tab',{name:'Last',exact:true}).evaluate(e=>e===document.activeElement));
 await page.keyboard.press('Home');assert.equal(await page.getByRole('tab',{name:'First',exact:true}).getAttribute('tabindex'),'0');await page.keyboard.press('End');assert.equal(await page.getByRole('tabpanel').textContent(),'c');
 await page.getByRole('button',{name:'Help',exact:true}).focus();await page.getByRole('tooltip').waitFor();assert.match(await page.getByRole('button',{name:'Help',exact:true}).getAttribute('aria-describedby'),/^existing /);await page.keyboard.press('Escape');await page.getByRole('tooltip').waitFor({state:'hidden'});
 const sizes=await page.locator('.ds-button,.ds-input').evaluateAll(nodes=>nodes.map(e=>e.getBoundingClientRect().height));assert(sizes.every(size=>size>=40));
 assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--space-6').trim()),'32px');
 await page.evaluate(()=>document.documentElement.style.setProperty('--accent-violet','#00ff00'));assert.equal(await page.getByRole('button',{name:'Submit',exact:true}).evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(0, 255, 0)');
 await page.evaluate(()=>document.documentElement.style.removeProperty('--accent-violet'));assert.deepEqual(errors,[]);await page.screenshot({path:'qa-output/phase1-primitives.png',fullPage:true});
 const app=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const appErrors=[];app.on('pageerror',e=>appErrors.push(e.message));
 await app.addInitScript(()=>{
   window.__TAURI__={};window.isTauri=true;window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};const collections={likes:[],playlists:[{id:1,name:'Fixture playlist',description:'',entries:[]}],history:[]};let serial=1;
   window.__TAURI_INTERNALS__={transformCallback:()=>serial++,unregisterCallback:()=>{},convertFileSrc:path=>path,invoke:async(cmd,args={})=>{
     if(cmd==='library')return {tracks:[],folders:[],errors:[]};if(cmd==='collections')return collections;
     if(cmd==='collection_action'){window.phase1Action=args.action;collections.playlists.unshift({id:2,name:args.action.name,description:args.action.description,entries:[]});return collections;}
     if(cmd==='playback_session')return {entries:[],current_entry_id:null,current_track_id:null,cursor:null,position_seconds:0};
     if(cmd==='audio_status'||cmd==='audio_command')return {id:null,playing:false,position:0,duration:0,volume:.65,ended:false};
     if(cmd==='audio_meter')return {energy:0,bass:0,mids:0,highs:0,bins:[]};
     if(cmd==='external_lyrics_enabled')return false;
     if(cmd==='deleted_songs_settings')return {folder:null};if(cmd==='playback_playable_track_ids')return [];
     if(cmd==='plugin:event|listen')return serial++;if(cmd==='plugin:app|version')return '0.2.5';return null;
   }};
 });
 await app.goto(process.argv[3]||'http://127.0.0.1:1431');
 await app.getByRole('button',{name:'Новый плейлист',exact:true}).click();await app.getByLabel('Название',{exact:true}).fill('Phase 1');
 await app.getByRole('button',{name:'Создать',exact:true}).click();await app.getByLabel('Поиск в плейлисте',{exact:true}).waitFor();
 assert.deepEqual(await app.evaluate(()=>window.phase1Action),{type:'create_playlist',name:'Phase 1',description:''});
 await app.getByLabel('Поиск в плейлисте',{exact:true}).fill('filter');await app.getByRole('button',{name:'Очистить поиск',exact:true}).click();
 assert.equal(await app.getByLabel('Поиск в плейлисте',{exact:true}).inputValue(),'');assert.equal(await app.locator('.sidebar-sources [role=separator]').getAttribute('role'),'separator');
 assert.equal(await app.getByRole('heading',{name:'Phase 1',exact:true}).evaluate(e=>getComputedStyle(e).fontSize),'28px');
 await app.screenshot({path:'qa-output/phase1-app.png',fullPage:true});assert.deepEqual(appErrors,[]);
 console.log('PASS app integration with simulated IPC: playlist editor submit payload, navigation, playlist search/clear, shared header and divider; no page errors');
 console.log('PASS real browser: button activation/default type/disabled, controlled search and clear, tabs keyboard/disabled skip/focus/panel, tooltip descriptions and Escape, 40px controls, tokens and accent inheritance; no page errors');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

