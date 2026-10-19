import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {Info} from 'lucide-react';
import type {Track,TrackMetadataDetails} from './types';
import {metadataRows} from './trackMetadataModel';
import Dialog from './Dialog';
import {Button} from './ui';
import './TrackMetadataDialog.css';
export default function TrackMetadataDialog({track,onClose}:{track:Track;onClose:()=>void}){
 const [details,setDetails]=useState<TrackMetadataDetails|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;void invoke<TrackMetadataDetails>('track_metadata_details',{trackId:track.id}).then(value=>{if(active)setDetails(value);}).catch(value=>{if(active)setError(String(value));});return()=>{active=false;};},[track.id]);
 const rows=metadataRows(track,details),primary=new Set(['Название','Исполнитель','Альбом','Исполнитель альбома','Жанр','Год / дата','Номер трека','Длительность']);
 const secondary=rows.filter(row=>!primary.has(row.label)&&row.value!=='—');
 const list=(items:typeof rows)=><dl>{items.map(row=><div key={row.label}><dt>{row.label}</dt><dd title={row.value}>{row.value}</dd></div>)}</dl>;
 return <Dialog title={`Метаданные: ${track.title}`} size="large" className="track-metadata-dialog" onClose={onClose} closeLabel="Закрыть метаданные" footer={<Button onClick={onClose}>Закрыть</Button>}><section className="track-metadata-body">{error&&<p className="dialog-error" role="alert"><Info size={16}/>{error}</p>}{list(rows.filter(row=>primary.has(row.label)))}{!!secondary.length&&<details className="metadata-technical"><summary>Технические данные и путь</summary>{list(secondary)}</details>}</section></Dialog>;
}
