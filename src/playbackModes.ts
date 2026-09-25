export type RepeatMode='off'|'track'|'queue'|'playlist';
export type PlaybackModes={shuffle:boolean;repeatMode:RepeatMode;autoplay:boolean};
export type PlaybackContext={kind:'queue'}|{kind:'playlist';playlistId:number};
export type AdvanceDecision={kind:'index';index:number}|{kind:'repeat_track'}|{kind:'restart'}|{kind:'autoplay'}|{kind:'stop'};
export type PrimaryPlayDecision={kind:'toggle_current'}|{kind:'queue_index';index:number}|{kind:'nothing'};

export function decidePrimaryPlay(hasCurrent:boolean,queueLength:number):PrimaryPlayDecision{
  if(hasCurrent)return {kind:'toggle_current'};
  return queueLength>0?{kind:'queue_index',index:0}:{kind:'nothing'};
}

export function shuffled<T>(items:T[],random:()=>number=Math.random):T[]{
  const result=[...items];for(let index=result.length-1;index>0;index--){const target=Math.floor(random()*(index+1));[result[index],result[target]]=[result[target],result[index]];}return result;
}
export function shuffleFrom<T>(items:T[],selected:number,random:()=>number=Math.random):{items:T[];cursor:number}{
  const current=items[selected];if(!current)return {items:[...items],cursor:selected};return {items:[current,...shuffled(items.filter((_,index)=>index!==selected),random)],cursor:0};
}
export function shuffleUpcoming<T>(items:T[],cursor:number,random:()=>number=Math.random):T[]{return [...items.slice(0,cursor+1),...shuffled(items.slice(cursor+1),random)];}

export function decideAdvance({length,cursor,natural,context,modes}:{length:number;cursor:number;natural:boolean;context:PlaybackContext;modes:PlaybackModes}):AdvanceDecision{
  if(!length||cursor<0)return modes.autoplay?{kind:'autoplay'}:{kind:'stop'};
  if(natural&&modes.repeatMode==='track')return {kind:'repeat_track'};
  if(cursor+1<length)return {kind:'index',index:cursor+1};
  const repeats=(modes.repeatMode==='queue'&&context.kind==='queue')||(modes.repeatMode==='playlist'&&context.kind==='playlist');
  if(repeats)return {kind:'restart'};
  return modes.autoplay?{kind:'autoplay'}:{kind:'stop'};
}

export function cycleRepeat(mode:RepeatMode,context:PlaybackContext):RepeatMode{
  const contextual=context.kind==='playlist'?'playlist':'queue';const order:RepeatMode[]=['off','track',contextual];const index=order.indexOf(mode);return order[(index<0?0:index+1)%order.length];
}

export function chooseAutoplay<T extends {id:number;path:string}>(library:T[],currentId:number|null,random:()=>number=Math.random):T|null{
  const playable=library.filter(track=>Number.isInteger(track.id)&&track.id>0&&track.path.trim()&&track.id!==currentId);
  return playable.length?playable[Math.floor(random()*playable.length)]:null;
}
