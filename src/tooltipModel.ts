export type TooltipRect={left:number;top:number;right:number;bottom:number;width:number;height:number};
export type TooltipSize={width:number;height:number};
export type TooltipViewport={width:number;height:number};
export type TooltipPoint={left:number;top:number};

export function placeTooltip(anchor:TooltipRect,size:TooltipSize,viewport:TooltipViewport,margin=8,gap=8):TooltipPoint{
  const preferredTop=anchor.top-size.height-gap;
  const top=preferredTop>=margin?preferredTop:Math.min(anchor.bottom+gap,viewport.height-size.height-margin);
  const centered=anchor.left+(anchor.width-size.width)/2;
  return {
    left:Math.max(margin,Math.min(centered,viewport.width-size.width-margin)),
    top:Math.max(margin,top),
  };
}

export type TooltipState={hovered:boolean;focused:boolean;visible:boolean;pending:boolean};
export type TooltipEvent='hover'|'leave'|'focus'|'blur'|'delay'|'escape';
export const hiddenTooltipState:TooltipState={hovered:false,focused:false,visible:false,pending:false};

export function tooltipTransition(state:TooltipState,event:TooltipEvent):TooltipState{
  if(event==='escape')return {...state,visible:false,pending:false};
  const next={...state};
  if(event==='hover')next.hovered=true;
  if(event==='leave')next.hovered=false;
  if(event==='focus')next.focused=true;
  if(event==='blur')next.focused=false;
  const active=next.hovered||next.focused;
  if(event==='delay'){next.visible=active;next.pending=false;return next;}
  next.pending=active&&!next.visible;
  if(!active){next.visible=false;next.pending=false;}
  return next;
}
