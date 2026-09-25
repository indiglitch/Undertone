export const defaultPlayerControlOrder=['shuffle','previous','play','next','repeat','like','trash','autoplay','queue','lyrics','visualizer','volume'] as const;
export type PlayerControlId=typeof defaultPlayerControlOrder[number];
export const playerControlStorageKey='undertone.player.controls.order.v1';
type StorageLike={getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void;removeItem:(key:string)=>void};

export function normalizePlayerControlOrder(saved:unknown,defaults:readonly string[]=defaultPlayerControlOrder):string[]{
  const valid=new Set(defaults);
  const order=Array.isArray(saved)?[...new Set(saved.filter((id):id is string=>typeof id==='string'&&valid.has(id)))]:[];
  for(const id of defaults){
    if(order.includes(id))continue;
    const index=defaults.indexOf(id);
    const before=[...defaults.slice(0,index)].reverse().find(previous=>order.includes(previous));
    const after=defaults.slice(index+1).find(next=>order.includes(next));
    if(before)order.splice(order.indexOf(before)+1,0,id);
    else if(after)order.splice(order.indexOf(after),0,id);
    else order.push(id);
  }
  return order;
}
export function loadPlayerControlOrder(storage:StorageLike|null):PlayerControlId[]{
  if(!storage)return [...defaultPlayerControlOrder];
  try{return normalizePlayerControlOrder(JSON.parse(storage.getItem(playerControlStorageKey)||'null')) as PlayerControlId[];}
  catch{return [...defaultPlayerControlOrder];}
}
export function savePlayerControlOrder(storage:StorageLike|null,order:readonly PlayerControlId[]){
  try{storage?.setItem(playerControlStorageKey,JSON.stringify(normalizePlayerControlOrder(order)));}catch{/* localStorage can be unavailable */}
}
export function resetPlayerControlOrder(storage:StorageLike|null):PlayerControlId[]{
  try{storage?.removeItem(playerControlStorageKey);}catch{/* localStorage can be unavailable */}
  return [...defaultPlayerControlOrder];
}
export type DropSlot={target:PlayerControlId;side:'before'|'after'};
export function movePlayerControl(order:readonly PlayerControlId[],source:PlayerControlId,slot:DropSlot|null):PlayerControlId[]{
  if(!slot||source===slot.target||!order.includes(source)||!order.includes(slot.target))return [...order];
  const next=order.filter(id=>id!==source);
  const index=next.indexOf(slot.target)+(slot.side==='after'?1:0);
  next.splice(index,0,source);
  return next;
}
export function passedPlayerDragThreshold(dx:number,dy:number):boolean{return Math.hypot(dx,dy)>=6;}
export function finishPlayerControlDrag(order:readonly PlayerControlId[],source:PlayerControlId,slot:DropSlot|null,active:boolean,inside:boolean):PlayerControlId[]{
  return active&&inside?movePlayerControl(order,source,slot):[...order];
}
