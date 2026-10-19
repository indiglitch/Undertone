import {Component,type ErrorInfo,type ReactNode} from 'react';
import {Button} from './primitives';
import {invoke,isTauri} from '@tauri-apps/api/core';
import './AppErrorBoundary.css';
export default class AppErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:Error,info:ErrorInfo){console.error('Undertone interface failure',error,info.componentStack);}
  render(){return this.state.failed?<main className="fatal-fallback" role="alert"><div><h1>Undertone столкнулся с ошибкой</h1><p>Перезапустите интерфейс. Музыкальные файлы остаются на месте.</p><Button variant="primary" onClick={()=>{void (async()=>{if(isTauri())try{await invoke('audio_command',{action:{type:'pause'}});}catch{/* Reload remains available when IPC has failed. */}window.location.reload();})();}}>Перезапустить интерфейс</Button></div></main>:this.props.children;}
}
