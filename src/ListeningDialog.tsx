import {useEffect,useRef,type ReactNode} from 'react';
export default function ListeningDialog({children,onClose}:{children:ReactNode;onClose:()=>void}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const dialog=ref.current;
    const trigger=document.activeElement instanceof HTMLElement&&!dialog?.contains(document.activeElement)?document.activeElement:document.querySelector<HTMLElement>('.now-playing');
    dialog?.showModal();
    return ()=>{dialog?.close();queueMicrotask(()=>{if(trigger?.isConnected)trigger.focus();});};
  },[]);
  return <dialog ref={ref} className="now-playing-overlay" aria-modal="true" aria-label="Сейчас играет" onKeyDown={event=>{
    if(event.key!=='Tab'||event.defaultPrevented)return;
    const controls=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),summary,[tabindex]')].filter(node=>node.tabIndex>=0&&node.getClientRects().length>0);
    const first=controls[0],last=controls.at(-1);if(!first)return;
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }} onCancel={event=>{event.preventDefault();if(!ref.current?.querySelector('.context-menu-layer'))onClose();}}>{children}</dialog>;
}
