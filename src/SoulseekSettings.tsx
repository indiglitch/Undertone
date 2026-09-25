import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-dialog';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { Check, CircleHelp, Download, Folder, Headphones, Palette, RefreshCw, RotateCcw, Settings2, X } from 'lucide-react';
import { COLOR_PALETTES, formatRgbColor, parseRgbColor, rgbColorToHex, type ColorPaletteId, type RgbColor } from './colorPalette';

type Settings={server_url:string;has_api_key:boolean;download_root:string|null};
type Connection={status:'not_configured'|'connected'|'authentication_failed'|'unreachable';message:string;server_connected:boolean|null};
const labels={not_configured:'Не настроено',connecting:'Подключение…',connected:'Подключено',authentication_failed:'Ошибка авторизации',unreachable:'slskd недоступен'};
export default function SoulseekSettings({onClose,soulseekEnabled,deletedSongsFolder,onDeletedSongsFolder,onResetPlayerLayout,colorPalette,onColorPaletteChange,customColor,onCustomColorChange}:{onClose:()=>void;soulseekEnabled:boolean;deletedSongsFolder:string|null;onDeletedSongsFolder:(folder:string)=>void;onResetPlayerLayout:()=>void;colorPalette:ColorPaletteId;onColorPaletteChange:(palette:ColorPaletteId)=>void;customColor:RgbColor;onCustomColorChange:(color:RgbColor)=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  const updater=useRef<Update|null>(null);
  const [server,setServer]=useState('http://127.0.0.1:5030'),[key,setKey]=useState(''),[saved,setSaved]=useState(false),[busy,setBusy]=useState(true);
  const [downloadRoot,setDownloadRoot]=useState('');
  const [customColorText,setCustomColorText]=useState(()=>formatRgbColor(customColor));
  const [status,setStatus]=useState<keyof typeof labels|null>(null),[message,setMessage]=useState(''),[trashMessage,setTrashMessage]=useState('');
  const [appVersion,setAppVersion]=useState(''),[update,setUpdate]=useState<Update|null>(null),[updateStatus,setUpdateStatus]=useState<'idle'|'checking'|'current'|'available'|'downloading'|'installed'|'error'>('idle'),[updateProgress,setUpdateProgress]=useState(0),[updateMessage,setUpdateMessage]=useState('');
  const updateBusy=updateStatus==='checking'||updateStatus==='downloading';
  useEffect(()=>{
    dialog.current?.showModal();let alive=true;
    if(!soulseekEnabled){setBusy(false);return()=>{alive=false;};}
    void invoke<Settings>('slskd_settings').then(settings=>{if(alive){setServer(settings.server_url);setSaved(settings.has_api_key);setDownloadRoot(settings.download_root||'');setStatus(settings.has_api_key?null:'not_configured');}})
      .catch(()=>{if(alive)setMessage('Не удалось прочитать настройки или сохранённый ключ доступа.');}).finally(()=>{if(alive)setBusy(false);});
    return()=>{alive=false;};
  },[soulseekEnabled]);
  useEffect(()=>{let alive=true;void getVersion().then(version=>{if(alive)setAppVersion(version);}).catch(()=>{});return()=>{alive=false;const pending=updater.current;updater.current=null;if(pending)void pending.close().catch(()=>{});};},[]);
  async function checkForUpdates(){
    setUpdateStatus('checking');setUpdateMessage('');setUpdateProgress(0);
    const previous=updater.current;updater.current=null;setUpdate(null);
    if(previous)await previous.close().catch(()=>{});
    try{const found=await check({timeout:20000});updater.current=found;setUpdate(found);setUpdateStatus(found?'available':'current');}
    catch{setUpdateStatus('error');setUpdateMessage('Не удалось проверить GitHub Releases. Проверьте подключение к интернету.');}
  }
  async function installUpdate(){
    const pending=updater.current;if(!pending)return;
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
    finally{updater.current=null;await pending.close().catch(()=>{});}
  }
  async function chooseDeletedSongsFolder(){
    setTrashMessage('');
    try{
      const selected=await open({directory:true,multiple:false,title:'Выбрать папку для удалённых песен'});
      if(typeof selected!=='string')return;
      const result=await invoke<{folder:string|null}>('save_deleted_songs_folder',{path:selected});
      if(result.folder)onDeletedSongsFolder(result.folder);
    }catch(error){setTrashMessage(String(error));}
  }
  async function test(){
    setBusy(true);setStatus('connecting');setMessage('');
    try{
      const settings=await invoke<Settings>('slskd_save',{serverUrl:server,apiKey:key||null});
      await invoke('slskd_save_download_root',{downloadRoot:downloadRoot.trim()||null});
      setSaved(settings.has_api_key);setServer(settings.server_url);setKey('');
      const result=await invoke<Connection>('slskd_check');setStatus(result.status);
      setMessage(result.message+(result.status==='connected'?` · Сервер Soulseek: ${result.server_connected?'подключён':'не подключён'}`:''));
    }catch{setStatus('not_configured');setMessage('Не удалось сохранить настройки. Проверьте локальный адрес, API-ключ и доступ к хранилищу ключа.');}
    finally{setBusy(false);}
  }
  return <dialog ref={dialog} className="folder-dialog settings-dialog" aria-label="Настройки Undertone" onCancel={event=>{if(busy||updateBusy)event.preventDefault();else onClose();}} onClick={event=>{if(event.target===dialog.current&&!busy&&!updateBusy)onClose();}}>
    <form className="settings-shell" onSubmit={event=>{event.preventDefault();if(soulseekEnabled)void test();}}>
      <header className="settings-header"><div><span className="settings-eyebrow"><Settings2 size={15}/> UNDERTONE</span><h2>Настройки</h2><p>Плеер, локальные файлы и подключение Soulseek</p></div><button type="button" className="icon-button" aria-label="Закрыть настройки" disabled={busy||updateBusy} onClick={onClose}><X size={20}/></button></header>
      <div className="settings-content">
        <section className="settings-card settings-updates"><div className="settings-card-heading"><span className="settings-card-icon"><Download size={19}/></span><div><h3>Обновление приложения</h3><p>{appVersion?`Текущая версия ${appVersion}.`:'Проверяйте и устанавливайте новые версии Undertone.'} Обновления загружаются из GitHub.</p></div></div><div className="settings-update-footer"><span className={`settings-update-status ${updateStatus}`} role="status" aria-live="polite">{updateStatus==='checking'?'Проверяем обновления…':updateStatus==='current'?'Установлена последняя версия.':updateStatus==='available'?`Доступна версия ${update?.version}.`:updateStatus==='downloading'?`Загружаем обновление… ${updateProgress}%`:updateStatus==='installed'?updateMessage:updateStatus==='error'?updateMessage:'Автоматическое обновление подписано и проверяется перед установкой.'}</span><button type="button" className={update?'primary-button':'subtle-button'} disabled={updateBusy} onClick={()=>update?void installUpdate():void checkForUpdates()}>{updateStatus==='checking'?'Проверяем…':updateStatus==='downloading'?'Устанавливаем…':update?'Установить':'Проверить обновления'}</button></div>{updateStatus==='downloading'&&<progress className="settings-update-progress" max="100" value={updateProgress} aria-label="Загрузка обновления"/>}</section>
        <section className="settings-card color-palette-card"><div className="settings-card-heading"><span className="settings-card-icon"><Palette size={19}/></span><div><h3>Цветовая гамма</h3><p>Выберите готовую гамму или задайте свой цвет всему приложению.</p></div></div><div className="color-palette-options" role="group" aria-label="Готовые цветовые гаммы">{COLOR_PALETTES.map(palette=><button type="button" key={palette.id} className={`color-palette-option ${colorPalette===palette.id?'selected':''}`} aria-pressed={colorPalette===palette.id} onClick={()=>onColorPaletteChange(palette.id)}><span className="color-palette-swatches" aria-hidden="true">{palette.swatches.map(swatch=><i key={swatch} style={{backgroundColor:swatch}}/>)}</span><span className="color-palette-copy"><strong>{palette.name}</strong><small>{palette.description}</small></span>{colorPalette===palette.id&&<Check className="color-palette-check" size={16}/>}</button>)}</div><div className={`custom-color-editor ${colorPalette==='custom'?'selected':''}`}><div className="custom-color-heading"><span className="custom-color-preview" style={{backgroundColor:rgbColorToHex(customColor)}}/><span><strong>Свой цвет</strong><small>Подберём к нему оттенки фона и акцентов</small></span></div><div className="custom-color-controls"><label className="custom-color-picker">Выбрать цвет<input type="color" aria-label="Выбрать любой цвет" value={rgbColorToHex(customColor)} onFocus={()=>onColorPaletteChange('custom')} onChange={event=>{const color=parseRgbColor(event.target.value);if(color)onCustomColorChange(color);}}/></label><label className="custom-rgb-input">RGB или HEX<input type="text" spellCheck={false} value={customColorText} placeholder="rgb(154, 104, 255) или #9a68ff" aria-label="Введите RGB или HEX цвет" onFocus={()=>onColorPaletteChange('custom')} onChange={event=>{const value=event.target.value;setCustomColorText(value);const color=parseRgbColor(value);if(color){setCustomColorText(formatRgbColor(color));onCustomColorChange(color);}}} onBlur={()=>setCustomColorText(formatRgbColor(customColor))} onKeyDown={event=>{if(event.key==='Enter')event.preventDefault();}}/></label></div></div></section>
        <section className="settings-card"><div className="settings-card-heading"><span className="settings-card-icon"><Headphones size={19}/></span><div><h3>Плеер и интерфейс</h3><p>Перетаскивайте кнопки нижней панели, чтобы изменить их порядок.</p></div></div><button type="button" className="subtle-button" onClick={onResetPlayerLayout}><RotateCcw size={15}/>Сбросить расположение кнопок</button></section>
        <section className="settings-card"><div className="settings-card-heading"><span className="settings-card-icon"><Folder size={19}/></span><div><h3>Папка удалённых песен</h3><p>При удалении локальный файл безопасно перемещается сюда.</p></div></div><div className="deleted-folder-value"><Folder size={17}/><span title={deletedSongsFolder||''}>{deletedSongsFolder||'Папка не выбрана'}</span></div><button type="button" className="subtle-button" disabled={busy} onClick={()=>void chooseDeletedSongsFolder()}>{deletedSongsFolder?'Изменить папку':'Выбрать папку'}</button>{trashMessage&&<p className="settings-error" role="alert">{trashMessage}</p>}</section>
        <section className="settings-card settings-soulseek"><div className="settings-card-heading"><span className="settings-card-icon"><CircleHelp size={19}/></span><div><h3>Soulseek через slskd</h3><p>slskd устанавливается отдельно. Undertone подключается только к локальному адресу.</p></div></div>
          <details className="settings-guide"><summary>Как подключить Soulseek</summary><ol><li>Установите и запустите <strong>slskd</strong>. В его веб-интерфейсе настройте учётную запись Soulseek.</li><li>Скопируйте API-ключ из настроек slskd и вставьте его ниже. Обычно адрес сервера — <code>http://127.0.0.1:5030</code>.</li><li>Укажите существующую папку, совпадающую с <code>directories.downloads</code> в конфигурации slskd.</li><li>Нажмите «Сохранить и проверить». После подключения поиск Soulseek появится на странице поиска.</li></ol><p>Undertone не изменяет настройки slskd и не хранит пароль от Soulseek.</p></details>
          {soulseekEnabled?<><div className="settings-fields"><label htmlFor="slskd-server">Адрес slskd<input id="slskd-server" type="url" required value={server} disabled={busy} onChange={event=>{setServer(event.target.value);setStatus(null);}} autoComplete="off" spellCheck={false}/></label><label htmlFor="slskd-key">API-ключ<input id="slskd-key" type="password" value={key} disabled={busy} required={!saved} maxLength={2560} placeholder={saved?'Ключ сохранён — оставьте пустым, чтобы не менять':'Вставьте API-ключ из slskd'} autoComplete="new-password" spellCheck={false} onChange={event=>{setKey(event.target.value);setStatus(null);}}/></label><label htmlFor="slskd-download-root" className="settings-wide-field">Папка загрузок slskd<input id="slskd-download-root" value={downloadRoot} disabled={busy} placeholder="Полный путь к directories.downloads" autoComplete="off" spellCheck={false} onChange={event=>setDownloadRoot(event.target.value)}/></label></div><p className="settings-hint">Пустое поле ключа сохраняет прежний ключ. В portable-версии он хранится в <code>data/secrets</code>; в обычной установке — в диспетчере учётных данных Windows.</p><div className="settings-connection"><span className={`settings-status ${status||'unchecked'}`}>{status?labels[status]:'Соединение не проверено'}</span>{message&&<span>{message}</span>}</div><button className="primary-button settings-submit" disabled={busy||(!saved&&!key)}>{busy?'Подключаемся…':'Сохранить и проверить'}</button></>:<p className="settings-hint" role="status">Поддержка slskd отключена в этой сборке.</p>}
        </section>
      </div>
    </form>
  </dialog>;
}
