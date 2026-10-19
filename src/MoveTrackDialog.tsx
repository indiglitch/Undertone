import type {Track} from './types';
import {ConfirmationDialog} from './Dialog';
export default function MoveTrackDialog({track,destination,mode,busy,onCancel,onConfirm}:{track:Track;destination:string|null;mode:'move'|'remove';busy:boolean;onCancel:()=>void;onConfirm:()=>void}){
 return <ConfirmationDialog title={mode==='move'?'Переместить в удалённые':'Убрать из медиатеки'} description={mode==='move'?`Переместить «${track.title}» в папку удалённых песен?`:'Локальный файл не найден. Убрать этот трек из медиатеки Undertone?'} busy={busy} onClose={onCancel} onConfirm={onConfirm} destructive confirmLabel={busy?(mode==='move'?'Перемещение…':'Удаление…'):mode==='move'?'Переместить':'Убрать из медиатеки'}>{mode==='move'&&<div className="dialog-destination">{destination}</div>}</ConfirmationDialog>;
}
