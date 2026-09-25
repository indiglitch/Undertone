import { useEffect, useRef } from 'react';
import { Folder, Trash2, X } from 'lucide-react';
import type { Track } from './types';

export default function MoveTrackDialog({track,destination,mode,busy,onCancel,onConfirm}:{track:Track;destination:string|null;mode:'move'|'remove';busy:boolean;onCancel:()=>void;onConfirm:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} className="folder-dialog track-dialog" onCancel={event=>{event.preventDefault();if(!busy)onCancel();}} onClick={event=>{if(event.target===dialog.current&&!busy)onCancel();}}>
    <div className="dialog-body"><div className="section-heading"><h2>{mode==='move'?'Переместить в удалённые':'Убрать из медиатеки'}</h2><button className="icon-button" aria-label="Отмена" disabled={busy} onClick={onCancel}><X size={20}/></button></div>
      <p>{mode==='move'?`Переместить «${track.title}» в папку удалённых песен?`:'Локальный файл не найден. Убрать этот трек из медиатеки Undertone?'}</p>
      {mode==='move'&&<div className="deleted-folder-value"><Folder size={18}/><span>{destination}</span></div>}
      <div className="dialog-actions"><button className="subtle-button" disabled={busy} onClick={onCancel}>Отмена</button><button className="primary-button danger-button" disabled={busy} onClick={onConfirm}><Trash2 size={17}/>{busy?(mode==='move'?'Перемещение…':'Удаление…'):mode==='move'?'Переместить':'Убрать из медиатеки'}</button></div>
    </div>
  </dialog>;
}
