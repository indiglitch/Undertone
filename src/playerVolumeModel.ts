export const clampVolume=(value:number)=>Math.min(1,Math.max(0,value));
export const volumeAction=(value:number)=>({type:'volume' as const,value:clampVolume(value)});
export const volumeFromWheel=(current:number,deltaY:number,step=0.01)=>clampVolume((Math.round(current*100)+(deltaY<0?1:deltaY>0?-1:0)*Math.round(step*100))/100);
export const volumePercent=(value:number)=>`${Math.round(clampVolume(value)*100)}%`;
