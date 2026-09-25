import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Download, X } from 'lucide-react';
import { DownloadSession, formatDownloadBytes, formatEta, formatProgress, type DownloadFinalizeResult, type DownloadRequest, type DownloadStatus } from './downloadModel';
import { remoteFilename } from './soulseekSearch';

const api={
  start:(request:DownloadRequest)=>invoke<DownloadStatus>('slskd_download_start',{request}),
  status:(operationId:string)=>invoke<DownloadStatus>('slskd_download_status',{operationId}),
  cancel:(operationId:string)=>invoke<DownloadStatus>('slskd_download_cancel',{operationId}),
  finalize:(operationId:string)=>invoke<DownloadFinalizeResult>('slskd_download_finalize',{operationId}),
};
const stateLabels={queued:'В очереди',downloading:'Загружается',completed:'Завершено',failed:'Ошибка передачи',cancelled:'Отменено'} as const;

export function useDownloadSession(onFinalized?:(result:DownloadFinalizeResult)=>void|Promise<void>){
  const finalizedRef=useRef(onFinalized);finalizedRef.current=onFinalized;
  const [session]=useState(()=>new DownloadSession(api,result=>finalizedRef.current?.(result)));
  const [items,setItems]=useState<DownloadStatus[]>(()=>session.snapshot());
  const [error,setError]=useState('');
  useEffect(()=>session.subscribe(()=>{setItems(session.snapshot());setError(session.error);}),[session]);
  useEffect(()=>{const timer=setInterval(()=>void session.poll(),2500);return()=>clearInterval(timer);},[session]);
  return {session,items,error};
}

export default function DownloadManager({items,error,onCancel,onDismissError,onClose,embedded=false}:{items:DownloadStatus[];error:string;onCancel:(operationId:string)=>void;onDismissError:()=>void;onClose?:()=>void;embedded?:boolean}){
  return <aside className={embedded?'downloads-page':'downloads-panel'} aria-label="Загрузки"><div className="section-heading"><div><h2>Загрузки</h2><p>{items.length?`В этом сеансе: ${items.length}`:'Здесь отображаются загрузки текущего сеанса.'}</p></div>{onClose&&<button className="icon-button" aria-label="Закрыть загрузки" onClick={onClose}><X size={20}/></button>}</div>
    {error&&<div className="download-error" role="alert"><span>{error}</span><button className="icon-button" aria-label="Закрыть ошибку загрузки" onClick={onDismissError}><X size={16}/></button></div>}
    {!items.length?<div className="download-empty"><Download size={30}/><p>Найдите файл через Soulseek и начните загрузку. Здесь видны только загрузки текущего сеанса.</p></div>:<div className="download-list">{items.map(item=>{
      const running=item.state==='queued'||item.state==='downloading';
      return <article className={`download-item ${item.state}`} key={item.operation_id}><div className="download-title"><strong title={item.remote_path}>{remoteFilename(item.remote_path)}</strong><span>{stateLabels[item.state]}</span></div><small>{item.source_username}</small><div className="download-progress"><progress max={1} value={item.progress}/><span>{formatProgress(item.progress)}</span></div><div className="download-stats"><span>{formatDownloadBytes(item.downloaded_bytes)} / {formatDownloadBytes(item.total_bytes)}</span>{item.speed_bytes_per_second>0&&<span>{formatDownloadBytes(item.speed_bytes_per_second)}/с</span>}{item.eta_seconds!=null&&running&&<span>Осталось: {formatEta(item.eta_seconds)}</span>}</div>{running&&<button className="subtle-button" onClick={()=>onCancel(item.operation_id)}>Отменить</button>}</article>;
    })}</div>}
  </aside>;
}
