export const defaultPlayerControlOrder=['layoutLock','like','trash','shuffle','previous','play','next','repeat','autoplay','queue','lyrics','visualizer','volume'] as const;
export type PlayerControlId=typeof defaultPlayerControlOrder[number];
export const playerControlStorageKey='undertone.player.controls.order.v3';
export const playerControlPositionsStorageKey='undertone.player.controls.positions.v3';
export type PlayerControlPositions=Partial<Record<PlayerControlId,number>>;
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
export function normalizePlayerControlPositions(saved:unknown):PlayerControlPositions{
  if(!saved||typeof saved!=='object'||Array.isArray(saved))return {};
  const source=saved as Record<string,unknown>,positions:PlayerControlPositions={};
  for(const id of defaultPlayerControlOrder){const value=source[id];if(typeof value==='number'&&Number.isFinite(value))positions[id]=Math.max(0,Math.min(1,value));}
  return positions;
}
export function loadPlayerControlPositions(storage:StorageLike|null):PlayerControlPositions{
  if(!storage)return {};
  try{return normalizePlayerControlPositions(JSON.parse(storage.getItem(playerControlPositionsStorageKey)||'null'));}
  catch{return {};}
}
export function savePlayerControlPositions(storage:StorageLike|null,positions:PlayerControlPositions){
  try{storage?.setItem(playerControlPositionsStorageKey,JSON.stringify(normalizePlayerControlPositions(positions)));}catch{/* localStorage can be unavailable */}
}
export function resetPlayerControlPositions(storage:StorageLike|null):PlayerControlPositions{
  try{storage?.removeItem(playerControlPositionsStorageKey);}catch{/* localStorage can be unavailable */}
  return {};
}
export type PlayerControlGeometry={positions:Record<PlayerControlId,number>;contentWidth:number};
export function nearestFreePlayerControlPosition(order:readonly PlayerControlId[],positions:Partial<Record<PlayerControlId,number>>,widths:Record<PlayerControlId,number>,source:PlayerControlId,desired:number,contentWidth:number,lockWidth=40,gap=8,padding=8):number{
  const width=Math.max(1,widths[source]||38),min=lockWidth+gap,max=Math.max(min,contentWidth-padding-width);
  const obstacles=order.filter(id=>id!==source&&typeof positions[id]==='number').map(id=>({left:positions[id]!,right:positions[id]!+Math.max(1,widths[id]||38)})).sort((a,b)=>a.left-b.left);
  const intervals:Array<{left:number;right:number}>=[];let cursor=min;
  for(const obstacle of obstacles){const right=obstacle.left-gap-width;if(right>=cursor)intervals.push({left:cursor,right});cursor=Math.max(cursor,obstacle.right+gap);}
  if(max>=cursor)intervals.push({left:cursor,right:max});
  if(!intervals.length)return Math.max(min,Math.min(max,desired));
  return intervals.reduce((best,interval)=>{const candidate=Math.max(interval.left,Math.min(interval.right,desired));return Math.abs(candidate-desired)<Math.abs(best-desired)?candidate:best;},Math.max(intervals[0].left,Math.min(intervals[0].right,desired)));
}
export function layoutPlayerControls(order:readonly PlayerControlId[],saved:PlayerControlPositions,widths:Record<PlayerControlId,number>,viewportWidth:number,gap=8,padding=8):PlayerControlGeometry{
  // Keep track actions left, transport centered, and player utilities right by default.
  const zones:PlayerControlId[][]=[
    ['layoutLock','like','trash'],
    ['shuffle','previous','play','next','repeat'],
    ['autoplay','queue','lyrics','visualizer','volume'],
  ];
  const orderedZones=zones.map(zone=>order.filter(id=>zone.includes(id)));
  const itemGap=viewportWidth<760?3:viewportWidth<1100?5:gap;
  const zoneGap=viewportWidth<760?8:viewportWidth<1100?14:22;
  const zoneWidth=(ids:PlayerControlId[])=>ids.reduce((sum,id)=>sum+Math.max(1,widths[id]||38),0)+Math.max(0,ids.length-1)*itemGap;
  const [leftZone,transportZone,rightZone]=orderedZones;
  const leftWidth=zoneWidth(leftZone),transportWidth=zoneWidth(transportZone),rightWidth=zoneWidth(rightZone);
  const contentWidth=Math.max(viewportWidth,padding*2+leftWidth+transportWidth+rightWidth+zoneGap*2);
  const transportCenter=(contentWidth-transportWidth)/2;
  const transportMin=padding+leftWidth+zoneGap;
  const rightStart=contentWidth-padding-rightWidth;
  const transportMax=rightStart-zoneGap-transportWidth;
  const transportStart=Math.max(transportMin,Math.min(transportMax,transportCenter));
  const positions={} as Record<PlayerControlId,number>;
  const placeZone=(ids:PlayerControlId[],start:number)=>{
    let next=start;
    for(const id of ids){
      const desired=typeof saved[id]==='number'?saved[id]!*contentWidth:next;
      positions[id]=nearestFreePlayerControlPosition(order,positions,widths,id,desired,contentWidth,0,itemGap,padding);
      next=positions[id]+Math.max(1,widths[id]||38)+itemGap;
    }
  };
  placeZone(leftZone,padding);
  placeZone(transportZone,transportStart);
  placeZone(rightZone,rightStart);
  return {positions,contentWidth};
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
