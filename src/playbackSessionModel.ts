export type SessionEntry={entry_id:number;track_id:number};
export type PlaybackSession={entries:SessionEntry[];current_entry_id:number|null;current_track_id:number|null;cursor:number|null;position_seconds:number};
export type MainPlayDecision={kind:'toggle_current'}|{kind:'queue_index';index:number}|{kind:'current_track'}|{kind:'random_track'}|{kind:'nothing'};

export function playableLocalTracks<T extends {id:number;path:string}>(tracks:T[]):T[]{
  return tracks.filter(track=>track.id>0&&(/^[a-z]:[\\/]/i.test(track.path)||/^\\\\/.test(track.path)||track.path.startsWith('/')));
}

export function chooseRandomLocalTrack<T extends {id:number;path:string}>(tracks:T[],random=Math.random):T|null{
  const playable=playableLocalTracks(tracks);if(!playable.length)return null;
  return playable[Math.min(playable.length-1,Math.floor(Math.max(0,random())*playable.length))];
}

export function decideMainPlay({currentId,loadedId,queueLength,cursor,libraryLength}:{currentId:number|null;loadedId:number|null;queueLength:number;cursor:number;libraryLength:number}):MainPlayDecision{
  if(currentId!==null){
    if(loadedId===currentId)return {kind:'toggle_current'};
    if(cursor>=0&&cursor<queueLength)return {kind:'queue_index',index:cursor};
    return {kind:'current_track'};
  }
  if(cursor>=0&&cursor<queueLength)return {kind:'queue_index',index:cursor};
  if(queueLength>0)return {kind:'queue_index',index:0};
  return libraryLength>0?{kind:'random_track'}:{kind:'nothing'};
}

export function restorePlaybackSession<T extends {id:number;path:string}>(session:PlaybackSession,tracks:T[]){
  const byId=new Map(playableLocalTracks(tracks).map(track=>[track.id,track]));
  const entries=session.entries.flatMap(entry=>{const track=byId.get(entry.track_id);return track?[{key:entry.entry_id,track}]:[];});
  const current= session.current_track_id===null?null:byId.get(session.current_track_id)??null;
  const cursor=session.current_entry_id===null?-1:entries.findIndex(entry=>entry.key===session.current_entry_id&&entry.track.id===current?.id);
  return {entries,cursor,current,position:current?Math.min(Math.max(0,session.position_seconds),current.id===session.current_track_id&&'duration' in current?Number(current.duration):session.position_seconds):0,maxEntryId:entries.reduce((max,entry)=>Math.max(max,entry.key),0)};
}

export function playbackSessionSnapshot<T extends {id:number}>(entries:{key:number;track:T}[],cursor:number,current:T|null,position:number):PlaybackSession{
  const currentEntry=cursor>=0&&cursor<entries.length?entries[cursor]:null;
  const currentEntryMatches=currentEntry!==null&&currentEntry.track.id===current?.id;
  return {entries:entries.map(entry=>({entry_id:entry.key,track_id:entry.track.id})),current_entry_id:currentEntryMatches?currentEntry.key:null,current_track_id:current?.id??null,cursor:currentEntryMatches?cursor:null,position_seconds:Number.isFinite(position)&&position>0?position:0};
}
