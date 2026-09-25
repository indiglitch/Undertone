import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Info, X } from 'lucide-react';
import type { Track, TrackMetadataDetails } from './types';
import { metadataRows } from './trackMetadataModel';
import './TrackMetadataDialog.css';

export default function TrackMetadataDialog({track,onClose}:{track:Track;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [details,setDetails]=useState<TrackMetadataDetails|null>(null),[error,setError]=useState('');
  useEffect(()=>{dialog.current?.showModal();let active=true;void invoke<TrackMetadataDetails>('track_metadata_details',{trackId:track.id}).then(value=>{if(active)setDetails(value);}).catch(value=>{if(active)setError(String(value));});return()=>{active=false;};},[track.id]);
  return <dialog ref={dialog} className="track-metadata-dialog" aria-label={`Метаданные: ${track.title}`} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===dialog.current)onClose();}}>
    <div className="track-metadata-body"><header><div><small>ЛОКАЛЬНЫЙ ТРЕК</small><h2>Метаданные</h2></div><button className="icon-button" aria-label="Закрыть метаданные" onClick={onClose}><X size={20}/></button></header>
      {error&&<p className="track-metadata-error" role="alert"><Info size={16}/>{error}</p>}
      <dl>{metadataRows(track,details).map(row=><div key={row.label}><dt>{row.label}</dt><dd title={row.value}>{row.value}</dd></div>)}</dl>
      <footer><button className="subtle-button" onClick={onClose}>Закрыть</button></footer>
    </div>
  </dialog>;
}
