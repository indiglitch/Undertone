export type MenuPoint={x:number;y:number};
export type ContextMenuEvent={clientX:number;clientY:number;preventDefault:()=>void;stopPropagation:()=>void};
export function openContextMenu(event:ContextMenuEvent,open:(point:MenuPoint)=>void){event.preventDefault();event.stopPropagation();open({x:event.clientX,y:event.clientY});}
export const homeAlbumContextTarget=<T>(id:number,title:string,tracks:T[])=>({kind:'album' as const,id,title,tracks});
export type MenuSize={width:number;height:number};
export type ViewportSize={width:number;height:number};
export type MenuAnchorRect={left:number;top:number;right:number;bottom:number};
export type SubmenuPlacement=MenuPoint&{side:'left'|'right'};

export const MENU_MARGIN=8;

export function fitMenuToViewport(point:MenuPoint,size:MenuSize,viewport:ViewportSize,margin=MENU_MARGIN):MenuPoint{
  return {
    x:Math.max(margin,Math.min(point.x,viewport.width-size.width-margin)),
    y:Math.max(margin,Math.min(point.y,viewport.height-size.height-margin)),
  };
}

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(value,Math.max(min,max)));

export function placeContextMenu(point:MenuPoint,size:MenuSize,viewport:ViewportSize,safeBottom=viewport.height,margin=MENU_MARGIN):MenuPoint{
  const rightEdge=viewport.width-margin;
  const bottomEdge=Math.min(viewport.height,safeBottom)-margin;
  const x=point.x+size.width<=rightEdge?point.x:point.x-size.width;
  const belowFits=point.y+size.height<=bottomEdge;
  const aboveFits=point.y-size.height>=margin;
  const y=belowFits?point.y:aboveFits?point.y-size.height:clamp(point.y,margin,bottomEdge-size.height);
  return {x:clamp(x,margin,rightEdge-size.width),y};
}

export function placeSubmenu(anchor:MenuAnchorRect,size:MenuSize,viewport:ViewportSize,safeBottom=viewport.height,margin=MENU_MARGIN):SubmenuPlacement{
  const roomRight=viewport.width-margin-anchor.right;
  const roomLeft=anchor.left-margin;
  const side:SubmenuPlacement['side']=roomRight>=size.width||roomRight>=roomLeft?'right':'left';
  const candidateX=side==='right'?anchor.right:anchor.left-size.width;
  const bottomEdge=Math.min(viewport.height,safeBottom)-margin;
  return {
    x:clamp(candidateX,margin,viewport.width-margin-size.width),
    y:clamp(anchor.top,margin,bottomEdge-size.height),
    side,
  };
}

export type TrackContextSource={kind:'local';path:string;cover:string|null}|{kind:'remote';remotePath:string};

export function localFileActions(source:TrackContextSource){
  return source.kind==='local'?{copyPath:source.path,showInExplorer:source.path,copyCover:source.cover}:null;
}

export const dismissesMenu=(key:string)=>key==='Escape';
export const outsideMenu=(menuContainsTarget:boolean)=>!menuContainsTarget;

export function once<T extends unknown[]>(action:(...args:T)=>void|Promise<unknown>){
  let called=false;
  return (...args:T)=>{if(called)return;called=true;return action(...args);};
}

export type CollectionMenuKind='album'|'artist'|'playlist';
export function collectionActionLabels(kind:CollectionMenuKind){
  return kind==='playlist'?['Play','Play Next','Add to Queue','Rename','Delete']:['Play','Play Next','Add to Queue','Add to Playlist'];
}

export const playlistTrackIds=<T extends {id:number}>(tracks:T[])=>tracks.map(track=>track.id);
export const playlistAddAction=<T extends {id:number}>(playlistId:number,tracks:T[])=>({type:'add_tracks' as const,id:playlistId,track_ids:playlistTrackIds(tracks)});

export function enqueueGroup<T>(tracks:T[],playNext:boolean,enqueue:(track:T,playNext:boolean)=>void){
  const ordered=playNext?[...tracks].reverse():tracks;
  for(const track of ordered)enqueue(track,playNext);
}
