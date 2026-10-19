import {normalizeSearch} from './libraryModel.ts';
export const recentSearchKey='undertone.search.recent.v1';
export function recentSearches(values:unknown):string[]{if(!Array.isArray(values))return [];const seen=new Set<string>();return values.filter((value):value is string=>typeof value==='string').map(value=>value.trim().replace(/\s+/g,' ')).filter(value=>{const key=normalizeSearch(value);if(Array.from(key).length<2||seen.has(key))return false;seen.add(key);return true;}).slice(0,10);}
export function rememberSearch(previous:string[],query:string):string[]{return recentSearches([query,...previous]);}
