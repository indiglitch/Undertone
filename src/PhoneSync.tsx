import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
type Status={running:boolean;address:string;code:string;qr_svg:string};
export default function PhoneSync(){
  const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{void invoke<Status|null>('phone_sync_status').then(setStatus).catch(e=>setError(String(e)));},[]);
  async function toggle(){setBusy(true);setError('');try{if(status){await invoke('phone_sync_stop');setStatus(null);}else setStatus(await invoke<Status>('phone_sync_start'));}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <section className="settings-section phone-sync"><h3>Музыка на iPhone</h3><p>Подключите iPhone к той же сети Wi-Fi. Отсканируйте код в Undertone → Устройства.</p><button type="button" disabled={busy} onClick={()=>void toggle()}>{busy?'Подождите…':status?'Отключить доступ':'Подключить iPhone'}</button>{status&&<><div className="phone-sync-qr" aria-label="Код подключения iPhone" dangerouslySetInnerHTML={{__html:status.qr_svg}}/><p>{status.address}</p><p>Код открывает доступ к библиотеке. Показывайте его только своему телефону. Подключение сохраняется после перезапуска ПК. Отключение доступа приостанавливает передачу.</p><details><summary>Подключить вручную</summary><textarea readOnly value={status.code} aria-label="Код подключения" onFocus={e=>e.currentTarget.select()}/></details></>}{error&&<p role="alert">{error}</p>}</section>;
}
