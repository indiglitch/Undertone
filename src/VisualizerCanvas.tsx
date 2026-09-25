import {memo,useEffect,useRef} from 'react';
import {emptyVisualizerLevels,getVisualizerMeterSnapshot,subscribeVisualizerMeter} from './visualizerMeter';
import {renderVisualizerFrame,type VisualizerIntensity,type VisualizerMode} from './visualizerRenderer';

export const VisualizerCanvas=memo(function VisualizerCanvas({mode,intensity,playing,hasTrack}:{mode:VisualizerMode;intensity:VisualizerIntensity;playing:boolean;hasTrack:boolean}){
  const ref=useRef<HTMLCanvasElement>(null);
  const config=useRef({mode,intensity,playing,hasTrack});config.current={mode,intensity,playing,hasTrack};
  const target=useRef(emptyVisualizerLevels()),levels=useRef(emptyVisualizerLevels()),history=useRef(new Float32Array(96));
  useEffect(()=>{
    if(!playing||!hasTrack){target.current=emptyVisualizerLevels();return;}
    return subscribeVisualizerMeter(()=>{const next=getVisualizerMeterSnapshot().levels;target.current=next;history.current.copyWithin(0,1);history.current[history.current.length-1]=next.energy;});
  },[playing,hasTrack]);
  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;const context=canvas.getContext('2d');if(!context)return;
    let frameId=0,width=1,height=1,lastFrame=0;const silence=emptyVisualizerLevels();
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const resize=()=>{const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,1.5);width=Math.max(1,rect.width);height=Math.max(1,rect.height);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);context.setTransform(dpr,0,0,dpr,0,0);};
    const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
    const draw=(time:number)=>{frameId=requestAnimationFrame(draw);if(reduced&&time-lastFrame<50)return;lastFrame=time;const state=config.current,destination=state.playing&&state.hasTrack?target.current:silence,speed=state.playing?.12:.035,current=levels.current;current.energy+=(destination.energy-current.energy)*speed;current.bass+=(destination.bass-current.bass)*speed;current.mids+=(destination.mids-current.mids)*speed;current.highs+=(destination.highs-current.highs)*speed;for(let i=0;i<current.bins.length;i++)current.bins[i]+=(destination.bins[i]-current.bins[i])*speed;renderVisualizerFrame(context,{width,height,time,levels:current,history:history.current,...state});};
    frameId=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(frameId);observer.disconnect();};
  },[]);
  return <canvas ref={ref} className="visualizer-canvas" role="img" aria-label="Музыкальный визуализатор"/>;
});
