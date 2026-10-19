import {Heart,ListMusic,MicVocal,MoreHorizontal,Play,Repeat2,Shuffle,SkipBack,SkipForward,Volume2} from 'lucide-react';
import PlayerControlStrip from './PlayerControlStrip';
import type {PlayerControlId,PlayerControlPositions} from './playerControlLayout';
import type {Track} from './types';
import {Cover,IconButton,Tooltip} from './ui';
const icons={shuffle:Shuffle,previous:SkipBack,play:Play,next:SkipForward,repeat:Repeat2,queue:ListMusic,lyrics:MicVocal};
const labels={shuffle:'Перемешивание',previous:'Предыдущий',play:'Воспроизведение',next:'Следующий',repeat:'Повтор',queue:'Очередь',lyrics:'Текст песни'};
export default function PlayerLayoutPreview({order,positions,onChange,track}:{order:PlayerControlId[];positions:PlayerControlPositions;onChange:(positions:PlayerControlPositions)=>void;track:Track|null}){
 const supported=order.filter((id):id is keyof typeof icons=>id in icons);
 const controls=Object.fromEntries(supported.map(id=>{const Icon=icons[id];return [id,<Tooltip key={id} content={`Перетащить: ${labels[id]}`}><IconButton className={id==='play'?'preview-play':''} aria-label={`Переместить: ${labels[id]}`} title={`Перетащить: ${labels[id]}`}><Icon/></IconButton></Tooltip>];})) as Parameters<typeof PlayerControlStrip>[0]['controls'];
 const zone=(ids:PlayerControlId[])=>supported.filter(id=>ids.includes(id)),update=(next:PlayerControlPositions)=>onChange({...positions,...next});
 return <div className="settings-player-preview" role="group" aria-label="Предпросмотр расположения плеера">
  <div className="preview-now-playing"><Cover track={track} size="small"/><span><strong>{track?.title||'Название трека'}</strong><small>{track?.artist||'Исполнитель'}</small></span><Heart size={18} aria-hidden="true"/><MoreHorizontal size={18} aria-hidden="true"/></div>
  <div className="preview-transport"><PlayerControlStrip order={zone(['shuffle','previous','play','next','repeat'])} positions={positions} controls={controls} onPositionsChange={update} locked={false}/><div className="preview-progress" aria-hidden="true"><span>0:42</span><i/><span>3:24</span></div></div>
  <div className="preview-utilities"><PlayerControlStrip order={zone(['queue','lyrics'])} positions={positions} controls={controls} onPositionsChange={update} locked={false}/><div className="preview-fixed" role="img" aria-label="Закреплённые действия: меню и громкость"><MoreHorizontal size={20}/><Volume2 size={20}/><i/></div></div>
 </div>;
}
