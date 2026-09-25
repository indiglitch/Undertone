import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { clampLayout, loadLayout, persistLayout, resetPane, resizeLayout, type LayoutPane, type LayoutSizes } from './resizableLayoutModel';

const viewport=()=>({width:window.innerWidth,height:window.innerHeight});
const apply=(element:HTMLElement|null,value:LayoutSizes)=>{
  if(!element)return;
  element.style.setProperty('--sidebar-width',`${value.left}px`);
  element.style.setProperty('--right-panel-width',`${value.right}px`);
  element.style.setProperty('--player-height',`${value.player}px`);
};

export function useResizableLayout(detailsOpen:boolean){
  const initial=useMemo(()=>loadLayout(typeof localStorage==='undefined'?null:localStorage,viewport(),detailsOpen),[]);
  const root=useRef<HTMLDivElement>(null),value=useRef(initial),start=useRef(initial);
  const update=(next:LayoutSizes)=>{value.current=next;apply(root.current,next);};
  const handle=(pane:LayoutPane)=>({
    onStart:()=>{start.current=value.current;},
    onResize:(delta:number)=>update(resizeLayout(start.current,pane,delta,viewport(),detailsOpen)),
    onCommit:(delta:number)=>{const next=resizeLayout(start.current,pane,delta,viewport(),detailsOpen);update(next);persistLayout(typeof localStorage==='undefined'?null:localStorage,next);},
    onReset:()=>{const next=resetPane(value.current,pane,viewport(),detailsOpen);update(next);persistLayout(typeof localStorage==='undefined'?null:localStorage,next);},
  });
  useEffect(()=>{apply(root.current,value.current);},[]);
  useEffect(()=>{
    const resize=()=>{const next=clampLayout(value.current,viewport(),detailsOpen);update(next);};
    resize();window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);
  },[detailsOpen]);
  const style={'--sidebar-width':`${initial.left}px`,'--right-panel-width':`${initial.right}px`,'--player-height':`${initial.player}px`} as CSSProperties;
  return {root,style,handle};
}
