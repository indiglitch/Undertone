import {useEffect,useLayoutEffect,useRef,useState,type PointerEvent,type ReactNode} from 'react';
import {defaultPlayerControlOrder,layoutPlayerControls,nearestFreePlayerControlPosition,type PlayerControlId,type PlayerControlPositions} from './playerControlLayout';
import {Tooltip} from './Tooltip';

type Drag={id:PlayerControlId;pointerId:number;x:number;y:number;offsetX:number;active:boolean};
type Geometry={positions:Record<PlayerControlId,number>;contentWidth:number};
const emptyPositions={} as Record<PlayerControlId,number>;
const sameGeometry=(a:Geometry,b:Geometry)=>a.contentWidth===b.contentWidth&&defaultPlayerControlOrder.every(id=>a.positions[id]===b.positions[id]);

export default function PlayerControlStrip({order,positions,controls,onPositionsChange,locked}:{order:PlayerControlId[];positions:PlayerControlPositions;controls:Record<PlayerControlId,ReactNode>;onPositionsChange:(positions:PlayerControlPositions)=>void;locked:boolean}){
  const strip=useRef<HTMLDivElement>(null),canvas=useRef<HTMLDivElement>(null),drag=useRef<Drag|null>(null),suppressClick=useRef(false),previewRef=useRef<Record<PlayerControlId,number>|null>(null);
  const [geometry,setGeometry]=useState<Geometry>({positions:emptyPositions,contentWidth:0});
  const [previewPositions,setPreviewPositions]=useState<Record<PlayerControlId,number>|null>(null);

  useLayoutEffect(()=>{
    const container=strip.current,inner=canvas.current;if(!container||!inner)return;
    const measure=()=>{
      const widths={} as Record<PlayerControlId,number>;
      for(const id of defaultPlayerControlOrder)widths[id]=38;
      for(const item of inner.querySelectorAll<HTMLElement>('[data-player-control-id]')){
        const id=item.dataset.playerControlId as PlayerControlId;widths[id]=Math.max(38,item.getBoundingClientRect().width);
      }
      const next=layoutPlayerControls(order,positions,widths,container.clientWidth);
      setGeometry(previous=>sameGeometry(previous,next)?previous:next);
    };
    measure();
    if(typeof ResizeObserver==='undefined'){window.addEventListener('resize',measure);return()=>window.removeEventListener('resize',measure);}
    const observer=new ResizeObserver(measure);observer.observe(container);return()=>observer.disconnect();
  },[order,positions]);

  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&drag.current?.active){event.preventDefault();cancelDrag(true);}};
    window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
  },[]);
  function cancelDrag(suppress=false){
    if(suppress)suppressClick.current=true;
    drag.current=null;previewRef.current=null;setPreviewPositions(null);
  }
  function pointerDown(event:PointerEvent<HTMLDivElement>){
    if(locked||event.button!==0||(event.target as Element).closest('input[type=range],select,textarea'))return;
    const item=(event.target as Element).closest<HTMLElement>('[data-player-control-id]');
    if(!item||!event.currentTarget.contains(item))return;
    const rect=item.getBoundingClientRect();
    drag.current={id:item.dataset.playerControlId as PlayerControlId,pointerId:event.pointerId,x:event.clientX,y:event.clientY,offsetX:event.clientX-rect.left,active:false};
  }
  function pointerMove(event:PointerEvent<HTMLDivElement>){
    const current=drag.current,container=strip.current;if(!current||current.pointerId!==event.pointerId||!container||!geometry.contentWidth)return;
    if(!current.active){
      if(Math.hypot(event.clientX-current.x,event.clientY-current.y)<6)return;
      current.active=true;container.setPointerCapture(event.pointerId);suppressClick.current=true;
    }
    event.preventDefault();
    const bounds=container.getBoundingClientRect();
    if(event.clientX>bounds.right-28&&container.scrollLeft<container.scrollWidth-container.clientWidth)container.scrollLeft+=14;
    else if(event.clientX<bounds.left+28&&container.scrollLeft>0)container.scrollLeft-=14;
    const widths={} as Record<PlayerControlId,number>;
    for(const id of defaultPlayerControlOrder)widths[id]=canvas.current?.querySelector<HTMLElement>(`[data-player-control-id="${id}"]`)?.getBoundingClientRect().width||38;
    const base=previewRef.current||geometry.positions;
    const desired=event.clientX-bounds.left+container.scrollLeft-current.offsetX;
    const left=nearestFreePlayerControlPosition(order,base,widths,current.id,desired,geometry.contentWidth,0);
    const next={...base,[current.id]:left};previewRef.current=next;setPreviewPositions(next);
  }
  function pointerUp(event:PointerEvent<HTMLDivElement>){
    const current=drag.current,container=strip.current;
    if(current?.pointerId===event.pointerId){
      const bounds=container?.getBoundingClientRect(),inside=!!bounds&&event.clientY>=bounds.top&&event.clientY<=bounds.bottom&&event.clientX>=bounds.left&&event.clientX<=bounds.right;
      const final=previewRef.current;
      if(current.active&&inside&&final&&geometry.contentWidth){
        const normalized=Object.fromEntries(order.map(id=>[id,Math.max(0,Math.min(1,final[id]/geometry.contentWidth))])) as PlayerControlPositions;
        onPositionsChange(normalized);
      }
      cancelDrag(current.active);
    }
    if(suppressClick.current)window.setTimeout(()=>{suppressClick.current=false;},0);
  }
  const renderedPositions=previewPositions||geometry.positions;
  return <div className={`transport-buttons player-control-strip${previewPositions?' is-dragging':''}${locked?' is-locked':''}`} aria-label="Кнопки плеера">
    <div ref={strip} className="player-control-scroll" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{if(drag.current){const active=drag.current.active;cancelDrag(active);if(active)window.setTimeout(()=>{suppressClick.current=false;},0);}}} onLostPointerCapture={()=>{if(drag.current?.active){cancelDrag(true);window.setTimeout(()=>{suppressClick.current=false;},0);}}} onClickCapture={event=>{if(suppressClick.current){event.preventDefault();event.stopPropagation();}}}>
      <div ref={canvas} className="player-control-canvas" style={{width:geometry.contentWidth||'100%'}}>
        {order.map(id=><span key={id} data-player-control-id={id} className={`player-control-item player-control-${id}${previewPositions&&drag.current?.id===id?' is-source':''}`} style={{left:renderedPositions[id]??8}}>{controls[id]}</span>)}
      </div>
    </div>
  </div>;
}
