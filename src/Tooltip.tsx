import {cloneElement,isValidElement,useEffect,useId,useLayoutEffect,useRef,useState,type ReactElement,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {placeTooltip} from './tooltipModel';
import './Tooltip.css';

export function Tooltip({content,children,delay=420,className=''}:{content:ReactNode;children:ReactElement;delay?:number;className?:string}){
  const anchorRef=useRef<HTMLSpanElement>(null),tipRef=useRef<HTMLDivElement>(null),timer=useRef<number|null>(null);
  const hovered=useRef(false),focused=useRef(false);
  const [open,setOpen]=useState(false),[point,setPoint]=useState({left:0,top:0,ready:false});
  const id=useId();
  const clear=()=>{if(timer.current!==null){window.clearTimeout(timer.current);timer.current=null;}};
  const hide=()=>{clear();setOpen(false);setPoint(value=>({...value,ready:false}));};
  const schedule=()=>{clear();timer.current=window.setTimeout(()=>{timer.current=null;setOpen(true);},delay);};
  const reconcile=()=>{if(hovered.current||focused.current)schedule();else hide();};

  useEffect(()=>()=>clear(),[]);
  useEffect(()=>{
    if(!open)return;
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')hide();};
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[open]);
  useLayoutEffect(()=>{
    if(!open||!anchorRef.current||!tipRef.current)return;
    const update=()=>{
      const rect=anchorRef.current!.getBoundingClientRect(),size=tipRef.current!.getBoundingClientRect();
      const next=placeTooltip(rect,size,{width:window.innerWidth,height:window.innerHeight});
      setPoint({left:next.left,top:next.top,ready:true});
    };
    update();window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
    return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
  },[open,content]);

  const child=isValidElement(children)?cloneElement(children as ReactElement<Record<string,unknown>>,{['aria-describedby']:open?id:undefined}):children;
  return <span ref={anchorRef} className={`tooltip-anchor ${className}`.trim()}
    onPointerEnter={()=>{hovered.current=true;schedule();}}
    onPointerLeave={()=>{hovered.current=false;reconcile();}}
    onFocusCapture={()=>{focused.current=true;schedule();}}
    onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node)){focused.current=false;reconcile();}}}>
    {child}
    {open&&createPortal(<div ref={tipRef} id={id} role="tooltip" className="undertone-tooltip" style={{left:point.left,top:point.top,visibility:point.ready?'visible':'hidden'}}>{content}</div>,document.body)}
  </span>;
}
