export const VISUALIZER_BAR_COUNT=12;
export const VISUALIZER_IDLE=[0.18,0.26,0.2,0.32,0.23,0.29,0.19,0.27,0.22,0.31,0.2,0.25] as const;
const idleAt=(index:number)=>VISUALIZER_IDLE[index%VISUALIZER_IDLE.length];
export const makeVisualizerIdle=(count:number)=>Array.from({length:count},(_,index)=>idleAt(index));

export function visualizerFrame(previous:readonly number[],peak:number):number[]{
  const level=Math.min(1,Math.max(0,Number.isFinite(peak)?peak:0));
  const shaped=Math.max(0.12,Math.sqrt(level)*0.92);
  return [...previous.slice(1),shaped];
}

export function visualizerSpectrumFrame(previous:readonly number[],bins:readonly number[],energy:number):number[]{
  return previous.map((value,index)=>{
    const position=index/Math.max(1,previous.length-1)*Math.max(0,bins.length-1),left=Math.floor(position),mix=position-left;
    const band=(bins[left]||0)*(1-mix)+(bins[Math.min(left+1,bins.length-1)]||0)*mix;
    const target=Math.max(.12,Math.min(1,Math.sqrt(Math.max(0,band))*.88+energy*.1));
    return value*.42+target*.58;
  });
}

export function settleVisualizer(previous:readonly number[]):number[]{
  if(previous.every((value,index)=>Math.abs(value-idleAt(index))<0.01))return previous as number[];
  return previous.map((value,index)=>value+(idleAt(index)-value)*0.24);
}
