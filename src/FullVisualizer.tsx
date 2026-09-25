import {memo,useState} from 'react';
import {ArrowLeft,AudioLines} from 'lucide-react';
import type {Track} from './types';
import {Cover} from './ui';
import {VisualizerCanvas} from './VisualizerCanvas';
import {VISUALIZER_INTENSITIES,VISUALIZER_MODES,type VisualizerIntensity,type VisualizerMode} from './visualizerRenderer';
import './FullVisualizer.css';

const labels:Record<VisualizerMode|VisualizerIntensity,string>={cosmos:'Космос',kaleidoscope:'Калейдоскоп',psychedelic:'Психоделика',low:'Низкая',normal:'Средняя',high:'Высокая'};
export const FullVisualizer=memo(function FullVisualizer({track,playing,onClose}:{track:Track|null;playing:boolean;onClose:()=>void}){
  const [mode,setMode]=useState<VisualizerMode>('cosmos');
  const [intensity,setIntensity]=useState<VisualizerIntensity>('normal');
  return <section className={`full-visualizer mode-${mode} ${playing&&track?'is-playing':'is-idle'}`} aria-label="Визуализатор">
    <header className="full-visualizer-header">
      <div><span><AudioLines size={15}/> Визуализатор</span><h1>{track?.title||'Сейчас ничего не играет'}</h1><p>{track?`${track.artist}${track.album?` · ${track.album}`:''}`:'Выберите трек, чтобы запустить визуализатор.'}</p></div>
      <button className="subtle-button" aria-label="Закрыть визуализатор" onClick={onClose}><ArrowLeft size={16}/> Назад</button>
    </header>
    <div className="visualizer-controls">
      <div className="visualizer-mode-switch" role="group" aria-label="Режим визуализатора">{VISUALIZER_MODES.map(value=><button key={value} className={mode===value?'selected':''} aria-pressed={mode===value} onClick={()=>setMode(value)}>{labels[value]}</button>)}</div>
      <div className="visualizer-intensity-switch" role="group" aria-label="Интенсивность визуализатора">{VISUALIZER_INTENSITIES.map(value=><button key={value} className={intensity===value?'selected':''} aria-pressed={intensity===value} onClick={()=>setIntensity(value)}>{labels[value]}</button>)}</div>
    </div>
    <div className="full-visualizer-stage">
      <VisualizerCanvas mode={mode} intensity={intensity} playing={playing} hasTrack={track!==null}/>
      {!track&&<div className="full-visualizer-empty"><AudioLines size={28}/><strong>Сейчас ничего не играет</strong><small>Выберите трек для начала воспроизведения.</small></div>}
    </div>
    <footer className="full-visualizer-track">
      <Cover track={track} size="small"/>
      <div><strong>{track?.title||'Undertone'}</strong><small>{track?.artist||'Трек не выбран'}</small></div>
      <span className="full-visualizer-state">{playing&&track?'ИГРАЕТ':track?'ПАУЗА':'ОЖИДАНИЕ'}</span>
    </footer>
  </section>;
});
