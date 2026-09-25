import { ListMusic, Pencil, Play, Trash2 } from 'lucide-react';
import type { Playlist, Track } from './types';
import { ContextMenu, MenuItem, MenuSection, PlaylistSubmenu } from './ContextMenu';
import type { MenuPoint } from './trackContextMenuModel';

export type CollectionMenuTarget={kind:'album'|'artist';id:number;title:string;tracks:Track[]}|{kind:'playlist';id:number;title:string;tracks:Track[];playlist:Playlist};
type Props={target:CollectionMenuTarget;point:MenuPoint;busy:boolean;playlists:Playlist[];onPlay:()=>void|Promise<unknown>;onPlayNext:()=>void;onAddToQueue:()=>void;onAddToPlaylist:(playlist:Playlist)=>void|Promise<unknown>;onRename:()=>void;onDelete:()=>void;onClose:()=>void;onNotice:(message:string)=>void};

export default function CollectionContextMenu({target,point,busy,playlists,onPlay,onPlayNext,onAddToQueue,onAddToPlaylist,onRename,onDelete,onClose,onNotice}:Props){
  const empty=!target.tracks.length;
  return <ContextMenu point={point} label={`Действия: ${target.title}`} onClose={onClose} onNotice={onNotice}>{run=><>
    <MenuSection label="ВОСПРОИЗВЕДЕНИЕ"><MenuItem icon={<Play size={16}/>} disabled={busy||empty} onClick={()=>void run(onPlay)}>Воспроизвести</MenuItem><MenuItem icon={<Play size={16}/>} disabled={busy||empty} onClick={()=>void run(onPlayNext,'Добавлено следующим')}>Играть следующим</MenuItem><MenuItem icon={<ListMusic size={16}/>} disabled={busy||empty} onClick={()=>void run(onAddToQueue,'Добавлено в очередь')}>Добавить в очередь</MenuItem>{target.kind!=='playlist'&&<PlaylistSubmenu playlists={playlists} disabled={busy||empty} run={run} onSelect={onAddToPlaylist}/>}</MenuSection>
    {target.kind==='playlist'&&<><MenuSection label="ПЛЕЙЛИСТ"><MenuItem icon={<Pencil size={16}/>} disabled={busy} onClick={()=>void run(onRename)}>Переименовать</MenuItem></MenuSection><MenuSection separated><MenuItem destructive icon={<Trash2 size={16}/>} disabled={busy} onClick={()=>void run(onDelete)}>Удалить</MenuItem></MenuSection></>}
  </>}</ContextMenu>;
}
