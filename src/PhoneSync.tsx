import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {Button} from './ui';
type Status={running:boolean;address:string;code:string;qr_svg:string};
export default function PhoneSync(){
  const pending=useRef(false);
 const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{void invoke<Status|null>('phone_sync_status').then(setStatus).catch(e=>setError(String(e)));},[]);
  async function toggle(){if(pending.current)return;pending.current=true;setBusy(true);setError('');try{if(status){await invoke('phone_sync_stop');setStatus(null);}else setStatus(await invoke<Status>('phone_sync_start'));}catch(e){setError(String(e));}finally{pending.current=false;setBusy(false);}}
  return <section className="settings-section phone-sync"><h3>Музыка на iPhone</h3><div className={`phone-sync-layout ${status?'connected':''}`}>{status&&<div className="phone-sync-qr" aria-label="Код подключения iPhone" dangerouslySetInnerHTML={{__html:status.qr_svg}}/>}<div className="phone-sync-info"><p className="phone-sync-state">{status?'Доступ включён':'Телефон не подключён'}</p><p>Подключите iPhone к той же сети Wi-Fi. Отсканируйте код в Undertone → Устройства.</p>{status&&<><p className="phone-sync-address">{status.address}</p><p>Код открывает доступ к библиотеке. Показывайте его только своему телефону. Подключение сохраняется после перезапуска ПК. Отключение доступа приостанавливает передачу.</p><details><summary>Подключить вручную</summary><textarea readOnly value={status.code} aria-label="Код подключения" onFocus={e=>e.currentTarget.select()}/></details></>}<Button variant={status?'destructive':'primary'} type="button" busy={busy} busyLabel="Подождите…" onClick={()=>void toggle()}>{status?'Отключить доступ':'Подключить iPhone'}</Button>{error&&<p role="alert">{error}</p>}</div></div></section>;
}
