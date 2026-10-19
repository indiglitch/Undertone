import {Folder,FolderPlus,RefreshCw,Unplug} from 'lucide-react';
import type {Library} from './types';
import {displayFolderPath} from './librarySourcesModel';
import Dialog from './Dialog';
import {Button} from './ui';
export default function MusicFoldersDialog({library,scanning,busy,error,notice,onAdd,onRescan,onRemove,onClose}:{library:Library;scanning:boolean;busy:string|null;error:string;notice:string;onAdd:()=>void;onRescan:()=>void;onRemove:(folder:string)=>void;onClose:()=>void}){
 return <Dialog title="Папки с музыкой" description="Undertone сканирует добавленные папки и их вложенные каталоги." size="large" className="music-folders-dialog" closeLabel="Закрыть список папок" onClose={onClose} footer={<div className="music-folder-actions"><Button variant="primary" disabled={scanning||busy!==null} busy={busy==='__adding__'} busyLabel="Подождите…" onClick={onAdd}><FolderPlus size={18}/>Добавить папку с музыкой</Button><Button disabled={!library.folders.length||busy!==null} busy={scanning} busyLabel="Сканирование…" onClick={onRescan}><RefreshCw size={16}/>Пересканировать папки</Button></div>}>
  {error&&<p className="dialog-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {library.folders.length?<div className="music-folder-list">{library.folders.map(folder=><div className="music-folder-row" key={folder}><Folder size={20} aria-hidden="true"/><span><strong>{displayFolderPath(folder)}</strong><small>{scanning?'Сканирование…':'Подключено'}</small></span><Button variant="ghost" busy={busy===folder} busyLabel="Удаление…" disabled={busy!==null||scanning} onClick={()=>onRemove(folder)}><Unplug size={16}/>Убрать</Button></div>)}</div>:<div className="music-folder-empty"><h3>Папки с музыкой ещё не добавлены</h3><p>Добавьте папку, чтобы просканировать локальную медиатеку.</p></div>}

  {!!library.errors.length&&<details className="music-folder-errors"><summary>Ошибок файлов: {library.errors.length}</summary>{library.errors.map(e=><p key={e.path}><strong>{displayFolderPath(e.path)}</strong><br/>{e.message}</p>)}</details>}
  <p className="music-folder-note">Удаление источника не удаляет музыкальные файлы и уже добавленные треки.</p>
 </Dialog>;
}
