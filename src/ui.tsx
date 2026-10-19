import { convertFileSrc } from '@tauri-apps/api/core';
import { useState } from 'react';
import { Disc3 } from 'lucide-react';
import { Track } from './types';
export function Cover({track,size='',className=''}:{track:Track|null;size?:string;className?:string}) {
  const [failed,setFailed]=useState<string|null>(null);
  return <span className={`cover ${size} ${className}`}>
    {track?.cover&&track.cover!==failed?<img draggable={false} src={convertFileSrc(track.cover)} alt={`Обложка ${track.album}`} loading="lazy" onError={()=>setFailed(track.cover)}/>:<Disc3 size={size==='small'?26:54} strokeWidth={1}/>}
  </span>;
}

export { Button, IconButton, Input, SearchInput, Tabs, Divider } from './primitives';
export { Tooltip } from './Tooltip';
