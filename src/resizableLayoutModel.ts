export type LayoutPane='left';
export type LayoutSizes={left:number};
export type Viewport={width:number;height:number};
export type StorageLike={getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void};
export const layoutDefaults:LayoutSizes={left:224};
export const layoutLimits={left:{min:190,max:380},mainMin:320,splitter:6} as const;
export const layoutStorageKeys={left:'undertone.layout.leftWidth'} as const;
const clamp=(value:number,min:number,max:number)=>Math.min(Math.max(value,min),Math.max(min,max));
export function clampLayout(value:LayoutSizes,viewport:Viewport):LayoutSizes{
  const budget=Math.max(0,viewport.width-layoutLimits.splitter-Math.min(layoutLimits.mainMin,Math.max(1,viewport.width*.4)));
  return {left:clamp(value.left,Math.min(layoutLimits.left.min,budget),Math.min(layoutLimits.left.max,budget))};
}
export function loadLayout(storage:StorageLike|null,viewport:Viewport):LayoutSizes{
  try{const saved=storage?.getItem(layoutStorageKeys.left),parsed=saved?.trim()?Number(saved):NaN;
    return clampLayout({left:saved==='240'||!Number.isFinite(parsed)?layoutDefaults.left:parsed},viewport);
  }catch{return clampLayout(layoutDefaults,viewport);}
}
export function persistLayout(storage:StorageLike|null,value:LayoutSizes){try{storage?.setItem(layoutStorageKeys.left,String(Math.round(value.left)));}catch{/* Keep layout usable without storage. */}}
export function resizeLayout(start:LayoutSizes,_pane:LayoutPane,delta:number,viewport:Viewport):LayoutSizes{return clampLayout({left:start.left+delta},viewport);}
export function resetPane(_value:LayoutSizes,_pane:LayoutPane,viewport:Viewport):LayoutSizes{return clampLayout(layoutDefaults,viewport);}
export const shouldStartResize=(button:number,onHandle:boolean)=>button===0&&onHandle;
