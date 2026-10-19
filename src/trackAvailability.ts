import {useEffect,useState} from 'react';
import {invoke,isTauri} from '@tauri-apps/api/core';
import type {Track,TrackFileStatus} from './types';
// Only visible rows are checked. Cache is bounded and short lived; unknown is never missing.
const cache=new Map<string,{status:TrackFileStatus;at:number}>();
const pending=new Map<string,Promise<TrackFileStatus|undefined>>();
const key=(track:Track)=>`${track.id}:${track.path}`;
async function check(track:Track){
  const id=key(track),hit=cache.get(id);
  if(hit&&Date.now()-hit.at<30000)return hit.status;
  let task=pending.get(id);
  if(!task){task=invoke<TrackFileStatus>('track_file_status',{trackId:track.id}).then(status=>{
    if(status==='present'||status==='missing'){cache.delete(id);cache.set(id,{status,at:Date.now()});if(cache.size>512)cache.delete(cache.keys().next().value!);return status;}
  }).catch(()=>undefined).finally(()=>pending.delete(id));pending.set(id,task);}
  return task;
}
export function useTrackAvailability(visible:Track[]){
  const signature=visible.map(key).join('|');
  const [statuses,setStatuses]=useState<ReadonlyMap<string,TrackFileStatus>>(new Map());
  useEffect(()=>{
    if(!isTauri())return;
    let disposed=false;
    const run=async()=>{let cursor=0;const result=new Map<string,TrackFileStatus>();await Promise.all(Array.from({length:Math.min(4,visible.length)},async()=>{
      while(!disposed&&cursor<visible.length){const track=visible[cursor++],status=await check(track);if(status)result.set(key(track),status);}
    }));if(!disposed)setStatuses(result);};
    void run();const refresh=()=>{visible.forEach(track=>cache.delete(key(track)));void run();};window.addEventListener('focus',refresh);
    return()=>{disposed=true;window.removeEventListener('focus',refresh);};
  // Track objects may be reconstructed by consumers; identity includes both ID and path.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[signature]);
  return (track:Track)=>statuses.get(key(track))??cache.get(key(track))?.status;
}
