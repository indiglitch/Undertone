import {useCallback,useSyncExternalStore} from 'react';
import {invoke,isTauri} from '@tauri-apps/api/core';

export type VisualizerLevels={energy:number;bass:number;mids:number;highs:number;bins:number[]};
export type VisualizerMeterSnapshot={levels:VisualizerLevels;revision:number};
type Listener=()=>void;
export const emptyVisualizerLevels=():VisualizerLevels=>({energy:0,bass:0,mids:0,highs:0,bins:Array(8).fill(0)});
let snapshot:VisualizerMeterSnapshot={levels:emptyVisualizerLevels(),revision:0};
let timer:number|null=null,busy=false;
const listeners=new Set<Listener>();

async function poll(){
  if(busy||!isTauri())return;
  busy=true;
  try{
    const levels=await invoke<VisualizerLevels>('audio_meter');
    snapshot={levels,revision:snapshot.revision+1};
    listeners.forEach(listener=>listener());
  }catch{/* Playback status owns user-facing audio errors. */}
  finally{busy=false;}
}
export function subscribeVisualizerMeter(listener:Listener){
  listeners.add(listener);
  if(timer===null){void poll();timer=window.setInterval(poll,40);}
  return()=>{
    listeners.delete(listener);
    if(!listeners.size&&timer!==null){window.clearInterval(timer);timer=null;}
  };
}
const getSnapshot=()=>snapshot;
export const getVisualizerMeterSnapshot=getSnapshot;

export function useVisualizerMeter(active:boolean){
  const activeSubscribe=useCallback((listener:Listener)=>active?subscribeVisualizerMeter(listener):()=>{},[active]);
  return useSyncExternalStore(activeSubscribe,getSnapshot,getSnapshot);
}
