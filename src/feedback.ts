export type FeedbackKind='info'|'success'|'warning'|'error';
export type FeedbackAction={label:string;run:()=>void|boolean|Promise<void|boolean>;available?:()=>boolean};
export type Feedback={id:number;message:string;kind:FeedbackKind;duration:number;action?:FeedbackAction};
let serial=0;
let snapshot:readonly Feedback[]=[];
const listeners=new Set<()=>void>();
function publish(){for(const listener of listeners)listener();}
export const feedbackStore={subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},snapshot:()=>snapshot};
export function dismissFeedback(id:number){snapshot=snapshot.filter(item=>item.id!==id);publish();}
export function notify(message:string,kind:FeedbackKind='success',action?:FeedbackAction,duration=action?10000:kind==='error'?7000:3500){
  if(!message.trim())return 0;
  // Coalesce identical notices; a fresh occurrence still gets a fresh lifetime.
  const id=++serial;
  snapshot=[...snapshot.filter(item=>item.message!==message).slice(-2),{id,message,kind,action,duration}];publish();return id;
}
export function feedbackError(error:unknown){return notify(String(error),'error');}
