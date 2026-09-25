export type LayoutPane='left'|'right'|'player';
export type LayoutSizes={left:number;right:number;player:number};
export type Viewport={width:number;height:number};
export type StorageLike={getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void};

export const layoutDefaults:LayoutSizes={left:260,right:335,player:96};
export const layoutLimits={left:{min:240,max:380},right:{min:280},player:{min:96,max:180},mainMin:320,splitter:6} as const;
export const layoutStorageKeys={left:'undertone.layout.leftWidth',right:'undertone.layout.rightWidth',player:'undertone.layout.playerHeight'} as const;

const clamp=(value:number,min:number,max:number)=>Math.min(Math.max(value,min),Math.max(min,max));
const finite=(value:string|null,fallback:number)=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback;};

export function clampLayout(value:LayoutSizes,viewport:Viewport,detailsOpen=true):LayoutSizes{
  const horizontalHandles=layoutLimits.splitter*(detailsOpen?2:1);
  const usableWidth=Math.max(1,viewport.width-horizontalHandles);
  const mainReserve=Math.min(layoutLimits.mainMin,Math.max(1,usableWidth*.4));
  const paneBudget=Math.max(0,usableWidth-mainReserve);
  const leftMin=Math.min(layoutLimits.left.min,detailsOpen?paneBudget*.4:paneBudget);
  const rightMin=detailsOpen?Math.min(layoutLimits.right.min,Math.max(0,paneBudget-leftMin)):layoutLimits.right.min;
  const rightMax=detailsOpen?Math.max(rightMin,Math.min(viewport.width*.45,paneBudget-leftMin)):Math.max(layoutLimits.right.min,viewport.width*.45);
  const right=clamp(value.right,rightMin,rightMax);
  const leftMax=Math.max(leftMin,Math.min(layoutLimits.left.max,paneBudget-(detailsOpen?right:0)));
  const left=clamp(value.left,leftMin,leftMax);
  const playerMin=Math.min(layoutLimits.player.min,Math.max(36,viewport.height-360-layoutLimits.splitter));
  const playerMax=Math.max(playerMin,Math.min(layoutLimits.player.max,viewport.height-240-layoutLimits.splitter));
  return {left,right,player:clamp(value.player,playerMin,playerMax)};
}

export function loadLayout(storage:StorageLike|null,viewport:Viewport,detailsOpen=true):LayoutSizes{
  if(!storage)return clampLayout(layoutDefaults,viewport,detailsOpen);
  return clampLayout({
    left:finite(storage.getItem(layoutStorageKeys.left),layoutDefaults.left),
    right:finite(storage.getItem(layoutStorageKeys.right),layoutDefaults.right),
    player:finite(storage.getItem(layoutStorageKeys.player),layoutDefaults.player),
  },viewport,detailsOpen);
}

export function persistLayout(storage:StorageLike|null,value:LayoutSizes){
  if(!storage)return;
  storage.setItem(layoutStorageKeys.left,String(Math.round(value.left)));
  storage.setItem(layoutStorageKeys.right,String(Math.round(value.right)));
  storage.setItem(layoutStorageKeys.player,String(Math.round(value.player)));
}

export function resizeLayout(start:LayoutSizes,pane:LayoutPane,delta:number,viewport:Viewport,detailsOpen=true):LayoutSizes{
  const candidate={...start};
  if(pane==='left')candidate.left+=delta;
  if(pane==='right')candidate.right-=delta;
  if(pane==='player')candidate.player-=delta;
  return clampLayout(candidate,viewport,detailsOpen);
}

export function resetPane(value:LayoutSizes,pane:LayoutPane,viewport:Viewport,detailsOpen=true):LayoutSizes{
  return clampLayout({...value,[pane]:layoutDefaults[pane]},viewport,detailsOpen);
}

export const shouldStartResize=(button:number,onHandle:boolean)=>button===0&&onHandle;
