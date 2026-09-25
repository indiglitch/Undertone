export type MoveConfirmation={
  cancel:()=>void;
  confirm:()=>Promise<void>;
};

export function createMoveConfirmation(onClose:()=>void,onMove:()=>void|Promise<unknown>):MoveConfirmation{
  let settled=false;
  return {
    cancel:()=>{if(settled)return;settled=true;onClose();},
    confirm:async()=>{if(settled)return;settled=true;await onMove();onClose();},
  };
}

export const deletedTrackQueue=<T extends {track:{id:number}}>(items:T[],trackId:number)=>items.filter(item=>item.track.id!==trackId);

export function planDeletedTrack<T extends {key:number;track:{id:number}}>(items:T[],cursor:number,trackId:number,currentId:number|null){
  const wasCurrent=currentId===trackId;
  const nextKey=wasCurrent?items.slice(cursor+1).find(item=>item.track.id!==trackId)?.key:undefined;
  const removedBefore=items.slice(0,Math.max(0,cursor)).filter(item=>item.track.id===trackId).length;
  const remaining=deletedTrackQueue(items,trackId);
  const nextIndex=nextKey===undefined?-1:remaining.findIndex(item=>item.key===nextKey);
  return {items:remaining,wasCurrent,nextIndex,cursor:wasCurrent?Math.min(cursor-1,remaining.length-1):Math.max(-1,cursor-removedBefore)};
}
