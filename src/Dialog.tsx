import {useEffect,useId,useRef,useState,type ReactNode,type RefObject,type KeyboardEvent} from 'react';
import {X} from 'lucide-react';
import {Button,IconButton} from './ui';
import './Dialog.css';
let menuOrigin:HTMLElement|null=null;
export function rememberMenuOrigin(node:HTMLElement|null){menuOrigin=node;}
export function focusOrigin(){const node=document.activeElement;return node instanceof HTMLElement&&node!==document.body&&!node.closest('.context-menu-layer')?node:menuOrigin?.isConnected?menuOrigin:null;}
export function useDialogLifecycle(ref:RefObject<HTMLDialogElement|null>,initialFocus?:RefObject<HTMLElement|null>){
 const [origin]=useState(focusOrigin);
 useEffect(()=>{const node=ref.current;node?.showModal();initialFocus?.current?.focus({preventScroll:true});return()=>{node?.close();queueMicrotask(()=>{if(!node?.open&&origin?.isConnected)origin.focus({preventScroll:true});});};},[]);
}
export function trapDialogTab(event:KeyboardEvent<HTMLDialogElement>){
 if(event.key!=='Tab'||event.defaultPrevented)return;
 const controls=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex]')].filter(node=>node.tabIndex>=0&&node.getClientRects().length>0);
 const first=controls[0],last=controls.at(-1);if(!first)return;
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
}
export default function Dialog({title,description,size='medium',children,footer,onClose,busy=false,className='',closeLabel='Закрыть',dialogRef,initialFocus}:{initialFocus?:RefObject<HTMLElement|null>;title:string;description?:ReactNode;size?:'small'|'medium'|'large';children?:ReactNode;footer?:ReactNode;onClose:()=>void;busy?:boolean;className?:string;closeLabel?:string;dialogRef?:RefObject<HTMLDialogElement|null>}){
 const local=useRef<HTMLDialogElement>(null),ref=dialogRef??local,id=useId(),backdropDown=useRef(false);useDialogLifecycle(ref,initialFocus);
 return <dialog ref={ref} className={`undertone-dialog undertone-dialog--${size} ${className}`} aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={description?`${id}-description`:undefined} onKeyDown={trapDialogTab} onCancel={event=>{event.preventDefault();if(!busy&&!ref.current?.querySelector('.context-menu-layer'))onClose();}} onPointerDown={event=>{const rect=event.currentTarget.getBoundingClientRect();backdropDown.current=event.target===event.currentTarget&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom);}} onClick={event=>{if(backdropDown.current&&event.target===event.currentTarget&&!busy)onClose();backdropDown.current=false;}}>
  <header className="dialog-header"><div><h2 id={`${id}-title`}>{title}</h2>{description&&<p id={`${id}-description`}>{description}</p>}</div><IconButton aria-label={closeLabel} disabled={busy} onClick={onClose}><X/></IconButton></header>
  <div className="dialog-content">{children}</div>{footer&&<footer className="dialog-footer">{footer}</footer>}
 </dialog>;
}
export function ConfirmationDialog({title,description,onClose,onConfirm,busy=false,confirmLabel='Подтвердить',destructive=false,children}:{title:string;description:ReactNode;onClose:()=>void;onConfirm:()=>void;busy?:boolean;confirmLabel?:string;destructive?:boolean;children?:ReactNode}){
 const cancel=useRef<HTMLButtonElement>(null);
 return <Dialog initialFocus={cancel} title={title} description={description} size="small" busy={busy} onClose={onClose} footer={<><Button ref={cancel} autoFocus disabled={busy} onClick={onClose}>Отмена</Button><Button variant={destructive?'destructive':'primary'} disabled={busy} onClick={onConfirm}>{confirmLabel}</Button></>}>{children}</Dialog>;
}
