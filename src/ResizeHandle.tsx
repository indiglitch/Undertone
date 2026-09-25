import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { shouldStartResize } from './resizableLayoutModel';
import './ResizeHandle.css';

export default function ResizeHandle({axis,label,onStart,onResize,onCommit,onReset,className=''}:{axis:'horizontal'|'vertical';label:string;onStart:()=>void;onResize:(delta:number)=>void;onCommit:(delta:number)=>void;onReset:()=>void;className?:string}){
  const drag=useRef<{pointerId:number;start:number}|null>(null);
  const coordinate=(event:ReactPointerEvent)=>axis==='horizontal'?event.clientX:event.clientY;
  const finish=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const active=drag.current;if(!active||active.pointerId!==event.pointerId)return;
    const delta=coordinate(event)-active.start;drag.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    document.documentElement.classList.remove('layout-resizing');onCommit(delta);
  };
  return <div role="separator" aria-label={label} aria-orientation={axis==='horizontal'?'vertical':'horizontal'} className={`resize-handle resize-${axis} ${className}`}
    onPointerDown={event=>{if(!shouldStartResize(event.button,event.currentTarget===event.target))return;event.preventDefault();drag.current={pointerId:event.pointerId,start:coordinate(event)};event.currentTarget.setPointerCapture(event.pointerId);document.documentElement.classList.add('layout-resizing');onStart();}}
    onPointerMove={event=>{const active=drag.current;if(active?.pointerId===event.pointerId){event.preventDefault();onResize(coordinate(event)-active.start);}}}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={event=>{if(drag.current?.pointerId===event.pointerId){drag.current=null;document.documentElement.classList.remove('layout-resizing');}}}
    onDoubleClick={event=>{event.preventDefault();onReset();}}/>;
}
