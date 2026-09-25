import {memo} from 'react';
import {Tooltip} from './Tooltip';
import {VISUALIZER_BAR_COUNT} from './visualizerModel';
import {useVisualizerBars} from './useVisualizerBars';
import './MusicVisualizer.css';

function EqualizerIcon(){
  return <svg className="visualizer-icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
    <defs><linearGradient id="compact-gradient" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#62dce0"/><stop offset="1" stopColor="#e76ac8"/></linearGradient></defs>
    <path d="M4 8v4M8 5v10M12 7v6M16 4v12"/>
  </svg>;
}

export const MusicVisualizer=memo(function MusicVisualizer({playing,hasTrack,open,onToggle}:{playing:boolean;hasTrack:boolean;open:boolean;onToggle:()=>void}){
  const bars=useVisualizerBars(playing,hasTrack,VISUALIZER_BAR_COUNT);
  return <Tooltip content={open?'Закрыть визуализатор':'Открыть визуализатор'} className="visualizer-tooltip">
    <button className={`music-visualizer ${playing&&hasTrack?'is-playing':'is-idle'}`} type="button" aria-label={open?'Закрыть визуализатор':'Открыть визуализатор'} aria-pressed={open} data-testid="music-visualizer" onClick={onToggle}>
      <EqualizerIcon/>
      <span className="visualizer-bars" aria-hidden="true">
        {bars.map((height,index)=><i key={index} style={{height:`${Math.round(height*100)}%`}}/>)}
      </span>
    </button>
  </Tooltip>;
});
