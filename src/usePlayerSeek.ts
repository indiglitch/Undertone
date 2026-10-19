import {useEffect,useRef,useState,type ChangeEvent,type KeyboardEvent,type PointerEvent} from 'react';
/** Shared UI-only seek draft/commit. Audio commands remain with the existing player. */
export function usePlayerSeek({trackId,position,duration,onCommit}:{trackId:number|null;position:number;duration:number;onCommit:(seconds:number)=>void}){
 const [draft,setDraft]=useState<number|null>(null),pending=useRef<number|null>(null);
 useEffect(()=>{pending.current=null;setDraft(null);},[trackId]);
 const commit=(value:number)=>{if(pending.current===null)return;pending.current=null;setDraft(null);onCommit(Math.max(0,Math.min(duration,value)));};
 const cancel=()=>{pending.current=null;setDraft(null);};
 return {value:draft??Math.min(position,duration),handlers:{
  onChange:(event:ChangeEvent<HTMLInputElement>)=>{const value=Number(event.target.value);pending.current=value;setDraft(value);},
  onPointerUp:(event:PointerEvent<HTMLInputElement>)=>commit(Number(event.currentTarget.value)),
  onKeyUp:(event:KeyboardEvent<HTMLInputElement>)=>{if(event.key.startsWith('Arrow')||['Home','End','PageUp','PageDown'].includes(event.key))commit(Number(event.currentTarget.value));},
  onPointerCancel:cancel,onBlur:cancel,
 }};
}
