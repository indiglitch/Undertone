import {LockKeyhole,LockKeyholeOpen} from 'lucide-react';
import {useEffect,useRef,useState,type PointerEvent,type ReactNode} from 'react';
import {finishPlayerControlDrag,passedPlayerDragThreshold,type DropSlot,type PlayerControlId} from './playerControlLayout';
import {Tooltip} from './Tooltip';

type Drag={id:PlayerControlId;pointerId:number;x:number;y:number;active:boolean;slot:DropSlot|null};
export default function PlayerControlStrip({order,controls,onOrderChange,locked,onToggleLocked,excluded=['volume','like','trash']}:{order:PlayerControlId[];controls:Record<PlayerControlId,ReactNode>;onOrderChange:(order:PlayerControlId[])=>void;locked:boolean;onToggleLocked:()=>void;excluded?:PlayerControlId[]}){
  const strip=useRef<HTMLDivElement>(null),drag=useRef<Drag|null>(null),suppressClick=useRef(false);
  const [preview,setPreview]=useState<{id:PlayerControlId;slot:DropSlot|null}|null>(null);
  const visibleOrder=order.filter(id=>!excluded.includes(id));
  function cancelDrag(suppress=false){
    if(suppress)suppressClick.current=true;
    drag.current=null;setPreview(null);
  }
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&drag.current?.active){event.preventDefault();cancelDrag(true);}};
    window.addEventListener('keydown',key,true);
    return()=>window.removeEventListener('keydown',key,true);
  },[]);
  function pointerDown(event:PointerEvent<HTMLDivElement>){
    if(locked||event.button!==0||(event.target as Element).closest('input[type=range],select,textarea'))return;
    const item=(event.target as Element).closest<HTMLElement>('[data-player-control-id]');
    if(!item||!event.currentTarget.contains(item))return;
    drag.current={id:item.dataset.playerControlId as PlayerControlId,pointerId:event.pointerId,x:event.clientX,y:event.clientY,active:false,slot:null};
  }
  function slotAt(x:number):DropSlot|null{
    const container=strip.current;if(!container)return null;
    const items=[...container.querySelectorAll<HTMLElement>('[data-player-control-id]')].filter(item=>item.getBoundingClientRect().width>0);
    if(!items.length)return null;
    const closest=items.reduce((best,item)=>{
      const rect=item.getBoundingClientRect(),center=rect.left+rect.width/2;
      return Math.abs(x-center)<Math.abs(x-(best.getBoundingClientRect().left+best.getBoundingClientRect().width/2))?item:best;
    });
    const rect=closest.getBoundingClientRect();
    return {target:closest.dataset.playerControlId as PlayerControlId,side:x<rect.left+rect.width/2?'before':'after'};
  }
  function pointerMove(event:PointerEvent<HTMLDivElement>){
    const current=drag.current,container=strip.current;
    if(!current||current.pointerId!==event.pointerId||!container)return;
    if(!current.active){
      if(!passedPlayerDragThreshold(event.clientX-current.x,event.clientY-current.y))return;
      current.active=true;container.setPointerCapture(event.pointerId);
      suppressClick.current=true;
    }
    event.preventDefault();
    const bounds=container.getBoundingClientRect();
    if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom){current.slot=null;setPreview({id:current.id,slot:null});return;}
    if(event.clientX>bounds.right-26)container.scrollLeft+=12;
    else if(event.clientX<bounds.left+26)container.scrollLeft-=12;
    current.slot=slotAt(event.clientX);
    setPreview({id:current.id,slot:current.slot});
  }
  function pointerUp(event:PointerEvent<HTMLDivElement>){
    const current=drag.current;
    if(current?.pointerId===event.pointerId){
      const bounds=strip.current?.getBoundingClientRect();
      const inside=!!bounds&&event.clientX>=bounds.left&&event.clientX<=bounds.right&&event.clientY>=bounds.top&&event.clientY<=bounds.bottom;
      const next=finishPlayerControlDrag(order,current.id,current.slot,current.active,inside);
      if(next.some((id,index)=>id!==order[index]))onOrderChange(next);
      cancelDrag(current.active);
    }
    if(suppressClick.current)window.setTimeout(()=>{suppressClick.current=false;},0);
  }
  return <div ref={strip} className={`transport-buttons player-control-strip${preview?' is-dragging':''}${locked?' is-locked':''}`} aria-label="Кнопки плеера" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{if(drag.current){const active=drag.current.active;cancelDrag(active);if(active)window.setTimeout(()=>{suppressClick.current=false;},0);}}} onLostPointerCapture={()=>{if(drag.current?.active){cancelDrag(true);window.setTimeout(()=>{suppressClick.current=false;},0);}}} onClickCapture={event=>{if(suppressClick.current){event.preventDefault();event.stopPropagation();}}}>
    <Tooltip content={locked?'Разблокировать расположение кнопок':'Закрепить расположение кнопок'}><button className={`icon-button player-layout-lock${locked?' is-locked':''}`} type="button" aria-label={locked?'Разблокировать расположение кнопок':'Закрепить расположение кнопок'} aria-pressed={locked} onClick={onToggleLocked}>{locked?<LockKeyhole size={15}/>:<LockKeyholeOpen size={15}/>}</button></Tooltip>
    {visibleOrder.map(id=><span key={id} data-player-control-id={id} className={`player-control-item player-control-${id}${preview?.id===id?' is-source':''}`}>
      {preview?.slot?.target===id&&preview.slot.side==='before'&&<span className="player-drop-indicator" aria-hidden="true"/>}
      {controls[id]}
      {preview?.slot?.target===id&&preview.slot.side==='after'&&<span className="player-drop-indicator" aria-hidden="true"/>}
    </span>)}
  </div>;
}
