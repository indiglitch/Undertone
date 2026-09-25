import {useEffect,useMemo,useState} from 'react';
import {makeVisualizerIdle,settleVisualizer,visualizerSpectrumFrame} from './visualizerModel';
import {useVisualizerMeter} from './visualizerMeter';

export function useVisualizerBars(playing:boolean,hasTrack:boolean,count:number){
  const active=playing&&hasTrack;
  const idle=useMemo(()=>makeVisualizerIdle(count),[count]);
  const meter=useVisualizerMeter(active);
  const [bars,setBars]=useState<number[]>(idle);
  useEffect(()=>setBars(idle),[idle]);
  useEffect(()=>{if(active&&meter.revision)setBars(value=>visualizerSpectrumFrame(value,meter.levels.bins,meter.levels.energy));},[active,meter]);
  useEffect(()=>{
    if(active)return;
    const timer=window.setInterval(()=>setBars(settleVisualizer),40);
    return()=>window.clearInterval(timer);
  },[active]);
  return bars;
}
