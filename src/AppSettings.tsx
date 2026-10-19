import PlayerLayoutPreview from './PlayerLayoutPreview';
import type {PlayerControlId,PlayerControlPositions} from './playerControlLayout';
import type {Track} from './types';
import { TrackDisplaySettings } from './trackDisplay';
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-dialog';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { Check, Download, Folder, Headphones, Palette, RotateCcw, Settings2 } from 'lucide-react';
import { COLOR_PALETTES, formatRgbColor, parseRgbColor, rgbColorToHex, type ColorPaletteId, type RgbColor } from './colorPalette';
import PhoneSync from './PhoneSync';
import Dialog from './Dialog';
import {Button,Input} from './ui';
import './SettingsPresentation.css';

export default function AppSettings({onClose,deletedSongsFolder,onDeletedSongsFolder,onResetPlayerLayout,controlOrder,controlPositions,onControlPositionsChange,previewTrack,colorPalette,onColorPaletteChange,customColor,onCustomColorChange,musicFolders,onMusicFolders,scanning=false}:{scanning?:boolean;musicFolders:string[];onMusicFolders:()=>void;onClose:()=>void;deletedSongsFolder:string|null;onDeletedSongsFolder:(folder:string)=>void;onResetPlayerLayout:()=>void;controlOrder:PlayerControlId[];controlPositions:PlayerControlPositions;onControlPositionsChange:(positions:PlayerControlPositions)=>void;previewTrack:Track|null;colorPalette:ColorPaletteId;onColorPaletteChange:(palette:ColorPaletteId)=>void;customColor:RgbColor;onCustomColorChange:(color:RgbColor)=>void}){
  const [section,setSection]=useState<'general'|'appearance'|'player'|'library'>('general');
  const dialog=useRef<HTMLDialogElement>(null);
  const updater=useRef<Update|null>(null),updatePending=useRef(false),folderPending=useRef(false);
  const [folderChoosing,setFolderChoosing]=useState(false);
  const [customColorText,setCustomColorText]=useState(()=>formatRgbColor(customColor));
  const [trashMessage,setTrashMessage]=useState('');
  const [appVersion,setAppVersion]=useState(''),[update,setUpdate]=useState<Update|null>(null),[updateStatus,setUpdateStatus]=useState<'idle'|'checking'|'current'|'available'|'downloading'|'installed'|'error'>('idle'),[updateProgress,setUpdateProgress]=useState(0),[updateMessage,setUpdateMessage]=useState('');
  const updateBusy=updateStatus==='checking'||updateStatus==='downloading';
  useEffect(()=>{let alive=true;void getVersion().then(version=>{if(alive)setAppVersion(version);}).catch(()=>{});return()=>{alive=false;const pending=updater.current;updater.current=null;if(pending)void pending.close().catch(()=>{});};},[]);
  async function checkForUpdates(){
    if(updatePending.current)return;updatePending.current=true;
    setUpdateStatus('checking');setUpdateMessage('');setUpdateProgress(0);
    const previous=updater.current;updater.current=null;setUpdate(null);
    if(previous)await previous.close().catch(()=>{});
    try{const found=await check({timeout:20000});updater.current=found;setUpdate(found);setUpdateStatus(found?'available':'current');}
    catch{setUpdateStatus('error');setUpdateMessage('Не удалось проверить GitHub Releases. Проверьте подключение к интернету.');}finally{updatePending.current=false;}
  }
  async function installUpdate(){
    const pending=updater.current;if(!pending||updatePending.current)return;updatePending.current=true;
    setUpdateStatus('downloading');setUpdateMessage('');setUpdateProgress(0);
    let downloaded=0,total:number|undefined;
    try{
      await pending.downloadAndInstall(event=>{
        if(event.event==='Started'){total=event.data.contentLength;setUpdateProgress(0);}
        else if(event.event==='Progress'){downloaded+=event.data.chunkLength;if(total)setUpdateProgress(Math.min(100,Math.round(downloaded/total*100)));}
        else if(event.event==='Finished')setUpdateProgress(100);
      },{restartAfterInstall:true});
      setUpdate(null);setUpdateStatus('installed');setUpdateMessage('Установка завершена. Приложение перезапустится.');
    }catch{setUpdateStatus('error');setUpdateMessage('Не удалось установить обновление. Попробуйте ещё раз позже.');}
    finally{updatePending.current=false;updater.current=null;await pending.close().catch(()=>{});}
  }
  async function chooseDeletedSongsFolder(){
    if(folderPending.current)return;folderPending.current=true;setFolderChoosing(true);
    setTrashMessage('');
    try{
      const selected=await open({directory:true,multiple:false,title:'Выбрать папку для удалённых песен'});
      if(typeof selected!=='string')return;
      const result=await invoke<{folder:string|null}>('save_deleted_songs_folder',{path:selected});
      if(result.folder)onDeletedSongsFolder(result.folder);
    }catch(error){setTrashMessage(String(error));}finally{folderPending.current=false;setFolderChoosing(false);}
  }
  return <Dialog title="Настройки" size="large" className="settings-dialog" closeLabel="Закрыть настройки" busy={updateBusy} dialogRef={dialog} onClose={onClose}>
      <div className="settings-workspace"><nav className="settings-navigation" aria-label="Разделы настроек">{([['general','Общие',Settings2],['appearance','Внешний вид',Palette],['player','Плеер',Headphones],['library','Библиотека',Folder]] as const).map(([id,label,Icon])=><Button key={id} type="button" className={section===id?'selected':''} aria-current={section===id?'page':undefined} onKeyDown={event=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('button')],at=buttons.indexOf(event.currentTarget);const next=event.key==='Home'?buttons[0]:event.key==='End'?buttons.at(-1)!:buttons[(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length];next.click();next.focus();}} onClick={()=>{setSection(id);const content=dialog.current?.querySelector('.settings-content');if(content)content.scrollTop=0;}}><Icon size={19}/>{label}</Button>)}</nav>
      <div className="settings-content"><h2 className="settings-page-title">{{general:"Общие",appearance:"Внешний вид",player:"Плеер",library:"Библиотека"}[section]}</h2>
        <div hidden={section!=='general'}><PhoneSync/></div>
        <section className="settings-card settings-updates" hidden={section!=='general'}><div className="settings-card-heading"><span className="settings-card-icon"><Download size={19}/></span><div><h3>Обновление приложения</h3><p>{appVersion?`Текущая версия ${appVersion}.`:'Проверяйте и устанавливайте новые версии Undertone.'} Обновления загружаются из GitHub.</p></div></div><div className="settings-update-footer"><span className={`settings-update-status ${updateStatus}`} role="status" aria-live={updateStatus==='downloading'?'off':'polite'}>{updateStatus==='checking'?'Проверяем обновления…':updateStatus==='current'?'Установлена последняя версия.':updateStatus==='available'?`Доступна версия ${update?.version}.`:updateStatus==='downloading'?`Загружаем обновление… ${updateProgress}%`:updateStatus==='installed'?updateMessage:updateStatus==='error'?updateMessage:'Автоматическое обновление подписано и проверяется перед установкой.'}</span><Button type="button" variant={update?'primary':'secondary'} busy={updateBusy} busyLabel={updateStatus==='checking'?'Проверяем…':'Устанавливаем…'} onClick={()=>update?void installUpdate():void checkForUpdates()}>{update?'Установить':'Проверить обновления'}</Button></div>{updateStatus==='downloading'&&<progress className="settings-update-progress" max="100" value={updateProgress} aria-label="Загрузка обновления"/>}</section>
        <section className="settings-card color-palette-card" hidden={section!=='appearance'}><div className="settings-card-heading"><span className="settings-card-icon"><Palette size={19}/></span><div><h3>Цветовая гамма</h3><p>Выберите готовую гамму или задайте свой цвет всему приложению.</p></div></div><div className="color-palette-options" role="group" aria-label="Готовые цветовые гаммы">{COLOR_PALETTES.map(palette=><Button type="button" key={palette.id} className={`color-palette-option ${colorPalette===palette.id?'selected':''}`} aria-pressed={colorPalette===palette.id} onClick={()=>onColorPaletteChange(palette.id)}><span className="color-palette-swatches" aria-hidden="true">{palette.swatches.map(swatch=><i key={swatch} style={{backgroundColor:swatch}}/>)}</span><span className="color-palette-copy"><strong>{palette.name}</strong><small>{palette.description}</small></span>{colorPalette===palette.id&&<Check className="color-palette-check" size={16}/>}</Button>)}</div><div className={`custom-color-editor ${colorPalette==='custom'?'selected':''}`}><div className="custom-color-heading"><span className="custom-color-preview" style={{backgroundColor:rgbColorToHex(customColor)}}/><span><strong>Свой цвет</strong><small>Подберём к нему оттенки фона и акцентов</small></span></div><div className="custom-color-controls"><label className="custom-color-picker">Выбрать цвет<input type="color" aria-label="Выбрать любой цвет" value={rgbColorToHex(customColor)} onFocus={()=>onColorPaletteChange('custom')} onChange={event=>{const color=parseRgbColor(event.target.value);if(color)onCustomColorChange(color);}}/></label><label className="custom-rgb-input">RGB или HEX<Input type="text" spellCheck={false} value={customColorText} placeholder="rgb(154, 104, 255) или #9a68ff" aria-label="Введите RGB или HEX цвет" onFocus={()=>onColorPaletteChange('custom')} onChange={event=>{const value=event.target.value;setCustomColorText(value);const color=parseRgbColor(value);if(color){setCustomColorText(formatRgbColor(color));onCustomColorChange(color);}}} onBlur={()=>setCustomColorText(formatRgbColor(customColor))} onKeyDown={event=>{if(event.key==='Enter')event.preventDefault();}}/></label></div></div></section>
        <section className="settings-card" hidden={section!=='player'}><div className="settings-card-heading"><span className="settings-card-icon"><Headphones size={19}/></span><div><h3>Плеер и интерфейс</h3><p>Перемещайте пять кнопок воспроизведения и Очередь / Текст внутри своих групп. Остальные действия закреплены или находятся в меню плеера.</p></div></div><PlayerLayoutPreview order={controlOrder} positions={controlPositions} onChange={onControlPositionsChange} track={previewTrack}/><Button type="button" variant="secondary" onClick={onResetPlayerLayout}><RotateCcw size={15}/>Сбросить расположение</Button></section>
        <section className="settings-card" hidden={section!=='library'}><h3>Папки с музыкой</h3><ul className="settings-folder-summary">{musicFolders.map(folder=><li key={folder}><Folder size={16}/><span>{folder}</span><small>{scanning?'Сканирование…':'Подключено'}</small></li>)}</ul>{!musicFolders.length&&<p>Папки с музыкой ещё не добавлены.</p>}<Button onClick={onMusicFolders}>Управлять папками</Button></section><section className="settings-card" hidden={section!=='library'}><div className="settings-card-heading"><span className="settings-card-icon"><Folder size={19}/></span><div><h3>Папка удалённых песен</h3><p>При удалении локальный файл безопасно перемещается сюда.</p></div></div><div className="deleted-folder-row"><div className="deleted-folder-value"><Folder size={17}/><span title={deletedSongsFolder||''}>{deletedSongsFolder||'Папка не выбрана'}</span></div><Button type="button" variant="secondary" busy={folderChoosing} busyLabel="Подождите…" onClick={()=>void chooseDeletedSongsFolder()}>{deletedSongsFolder?'Изменить папку':'Выбрать папку'}</Button></div>{trashMessage&&<p className="settings-error" role="alert">{trashMessage}</p>}</section>
        <div hidden={section!=='appearance'}><TrackDisplaySettings/></div>
      </div></div>
  </Dialog>;
}
