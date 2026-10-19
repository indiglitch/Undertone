import {useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {Check,Info,TriangleAlert,X} from 'lucide-react';
import {Button,IconButton} from './primitives';
import {Tooltip} from './Tooltip';
import {dismissFeedback,feedbackError,feedbackStore,type Feedback} from './feedback';
import './Feedback.css';

function Toast({item}:{item:Feedback}){
  const [paused,setPaused]=useState(false),[busy,setBusy]=useState(false),[available,setAvailable]=useState(()=>item.action?.available?.()??true);
  const actionPending=useRef(false),hover=useRef(false),focus=useRef(false),remaining=useRef(item.duration),started=useRef(0),returnFocus=useRef<HTMLElement|null>(null),node=useRef<HTMLDivElement>(null);
  const reconcile=()=>setPaused(hover.current||focus.current);
  useEffect(()=>{if(paused||busy)return;started.current=performance.now();const timer=window.setTimeout(()=>dismissFeedback(item.id),remaining.current);return()=>{clearTimeout(timer);remaining.current=Math.max(0,remaining.current-(performance.now()-started.current));};},[paused,busy,item.id]);
  useEffect(()=>{if(!item.action?.available)return;const timer=window.setInterval(()=>setAvailable(item.action!.available!()),150);return()=>clearInterval(timer);},[item]);
  function restoreFocus(){
    const modal=[...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1);
    if(returnFocus.current?.isConnected&&returnFocus.current.getClientRects().length&&(!modal||modal.contains(returnFocus.current)))return returnFocus.current.focus({preventScroll:true});
    [...(modal??document).querySelectorAll<HTMLElement>('.track-table,button:not(:disabled),[tabindex="0"]')].find(element=>element.getClientRects().length&&!element.closest('.feedback-host'))?.focus({preventScroll:true});
  }
  useLayoutEffect(()=>()=>{if(node.current?.contains(document.activeElement))queueMicrotask(()=>{if(document.activeElement===document.body)restoreFocus();});},[]);
  async function act(){if(actionPending.current||!available||item.action?.available?.()===false)return;actionPending.current=true;setBusy(true);try{const result=await item.action?.run();if(result===false){setAvailable(false);return;}restoreFocus();dismissFeedback(item.id);}catch(error){feedbackError(error);}finally{actionPending.current=false;setBusy(false);}}
  const Icon=item.kind==='success'?Check:item.kind==='info'?Info:TriangleAlert;
  return <div ref={node} className="feedback-toast" data-kind={item.kind} onPointerEnter={()=>{hover.current=true;reconcile();}} onPointerLeave={()=>{hover.current=false;reconcile();}} onFocusCapture={event=>{if(!node.current?.contains(event.relatedTarget as Node))returnFocus.current=event.relatedTarget as HTMLElement|null;focus.current=true;reconcile();}} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node)){focus.current=false;reconcile();}}}>
    <Icon aria-hidden="true" className="feedback-icon"/><span role="status" aria-live="polite" aria-atomic="true" className="feedback-message">{item.message}</span>
    {item.action&&<Tooltip content={!available?'Отмена сейчас недоступна: очередь изменилась или выполняется действие.':item.action.label}><Button size="sm" variant="ghost" busy={busy} busyLabel="Отменяем…" disabled={!available} onClick={()=>void act()}>{item.action.label}</Button></Tooltip>}
    <IconButton aria-label="Закрыть уведомление" onClick={()=>{if(node.current?.contains(document.activeElement))restoreFocus();dismissFeedback(item.id);}}><X aria-hidden="true"/></IconButton>
  </div>;
}

/** One stable portal node moves with native dialog top-layer changes without resetting timers. */
export default function FeedbackHost(){
  const items=useSyncExternalStore(feedbackStore.subscribe,feedbackStore.snapshot),[host]=useState(()=>document.createElement('div'));
  const region=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    host.className='feedback-host';document.body.append(host);
    let frame=0;const place=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
      const dialogs=[...document.querySelectorAll<HTMLDialogElement>('dialog[open]')],top=dialogs.at(-1),parent=top??document.body;
      if(host.parentElement!==parent)parent.append(host);
      const full=top?.matches('.now-playing-overlay'),player=document.querySelector<HTMLElement>('.player'),rect=player?.getBoundingClientRect();
      const gap=16,bottom=top?gap:rect&&rect.height?window.innerHeight-rect.top+gap:gap;
      host.style.bottom=`${bottom}px`;host.style.top='auto';host.style.right=`${gap}px`;
      host.style.width=`${Math.min(380,window.innerWidth-2*gap)}px`;
      if(top&&!full&&region.current){const d=top.getBoundingClientRect(),r=region.current.getBoundingClientRect();if(r.left<d.right&&r.right>d.left&&r.top<d.bottom&&r.bottom>d.top){
        // Keep footer/header controls free. Use a free side first, otherwise a viewport band.
        if(window.innerWidth-d.right>=220+2*gap){host.style.width=`${Math.min(380,window.innerWidth-d.right-2*gap)}px`;}
        else if(d.top>=r.height+2*gap){host.style.bottom='auto';host.style.top=`${Math.max(gap,d.top-r.height-gap)}px`;}
        else if(window.innerHeight-d.bottom>=r.height+2*gap){host.style.bottom=`${gap}px`;}
        else {host.style.bottom='auto';host.style.top=`${Math.max(gap,d.top+80)}px`;host.style.right=`${Math.max(gap,window.innerWidth-d.right+gap)}px`;}
      }}
    });};
    const observer=new MutationObserver(records=>{if(records.some(record=>!host.contains(record.target)&&!(record.type==='childList'&&[...record.addedNodes,...record.removedNodes].every(node=>node===host||host.contains(node)))))place();});observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','style']});
    const resize=new ResizeObserver(place);const shell=document.querySelector('.app-shell');if(shell)resize.observe(shell);if(region.current)resize.observe(region.current);
    window.addEventListener('resize',place);place();
    return()=>{observer.disconnect();resize.disconnect();window.removeEventListener('resize',place);cancelAnimationFrame(frame);host.remove();};
  },[host]);
  return createPortal(<div ref={region} className="feedback-region" aria-label="Уведомления">{items.map(item=><Toast key={item.id} item={item}/>)}</div>,host);
}
