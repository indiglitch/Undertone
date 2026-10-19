import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { clampLayout, loadLayout, persistLayout, resetPane, resizeLayout, type LayoutPane, type LayoutSizes } from './resizableLayoutModel';

const viewport=()=>({width:window.innerWidth,height:window.innerHeight});
const apply=(element:HTMLElement|null,value:LayoutSizes)=>{
  if(!element)return;
  element.style.setProperty('--sidebar-width',`${value.left}px`);
};

export function useResizableLayout(){
  const initial=useMemo(()=>loadLayout(typeof localStorage==='undefined'?null:localStorage,viewport()),[]);
  const root=useRef<HTMLDivElement>(null),value=useRef(initial),start=useRef(initial);
  const update=(next:LayoutSizes)=>{value.current=next;apply(root.current,next);};
  const handle=(pane:LayoutPane)=>({
    onStart:()=>{start.current=value.current;},
    onResize:(delta:number)=>update(resizeLayout(start.current,pane,delta,viewport())),
    onCommit:(delta:number)=>{const next=resizeLayout(start.current,pane,delta,viewport());update(next);persistLayout(typeof localStorage==='undefined'?null:localStorage,next);},
    onReset:()=>{const next=resetPane(value.current,pane,viewport());update(next);persistLayout(typeof localStorage==='undefined'?null:localStorage,next);},
  });
  useEffect(()=>{apply(root.current,value.current);},[]);
  useEffect(()=>{
    const resize=()=>{const next=clampLayout(value.current,viewport());update(next);};
    resize();window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);
  },[]);
  const style={'--sidebar-width':`${initial.left}px`} as CSSProperties;
  return {root,style,handle};
}
