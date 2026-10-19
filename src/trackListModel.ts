/** Stable occurrence identities keep repeated history/queue tracks independently selectable. */
export function occurrenceKeys(ids:readonly number[],explicit?:readonly (string|number)[]){
  const seen=new Map<number,number>();
  return ids.map((id,index)=>{const n=seen.get(id)??0;seen.set(id,n+1);return explicit?.[index]!=null?String(explicit[index]):`${id}:${n}`;});
}
export function selectRange(keys:readonly string[],anchor:string|null,target:string,previous:ReadonlySet<string>,additive=false){
  const b=keys.indexOf(target),anchorIndex=keys.indexOf(anchor??target),a=anchorIndex<0?b:anchorIndex;
  if(b<0)return new Set(previous);
  return new Set([...(additive?previous:[]),...keys.slice(Math.min(a,b),Math.max(a,b)+1)]);
}
export type TrackContextPayload<T>={track:T;selection:T[];source:string;index:number;rowKey:string;selectionKeys?:string[]};
