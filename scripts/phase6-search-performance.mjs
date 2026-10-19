import fs from 'node:fs/promises';
import {localSearchSource} from '../src/libraryModel.ts';
const results=[5000,25000].map(count=>{
 const tracks=Array.from({length:count},(_,id)=>({id,title:`Fixture Song ${id}`,artist:`Fixture Artist ${id%1000}`,album:`Fixture Album ${id%1000}`,album_artist:'Artist',artist_id:id%1000,album_id:id%1000,genre:'Test'}));
 const start=performance.now(),source=localSearchSource(tracks),indexMs=performance.now()-start;
 const samples=Array.from({length:12},(_,i)=>{const before=performance.now();source.searchAllNow(i%2?'Fixture':'Song 12');return performance.now()-before;}).sort((a,b)=>a-b);
 return {tracks:count,indexMs,p50Ms:samples[6],p95Ms:samples[11]};
});
await fs.mkdir('qa-output',{recursive:true});await fs.writeFile('qa-output/phase6-performance.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
