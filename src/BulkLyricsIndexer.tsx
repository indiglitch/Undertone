import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BookOpenCheck, ListChecks, RefreshCw, Search, X } from 'lucide-react';
import { BulkLyricsPoller, bulkLyricsAvailability, bulkLyricsCounters, bulkLyricsCurrent, bulkLyricsLimits, defaultBulkLyricsSelection, emptyBulkLyricsProgress, isBulkLyricsActive, type BulkLyricsLimit, type BulkLyricsProgress, type BulkLyricsScope } from './bulkLyricsModel';

export default function BulkLyricsIndexer({available,checked,visible}:{available:boolean;checked:boolean;visible:boolean}){
  const [progress,setProgress]=useState<BulkLyricsProgress>(emptyBulkLyricsProgress);
  const [notice,setNotice]=useState('');
  const [scope,setScope]=useState<BulkLyricsScope>(defaultBulkLyricsSelection.scope),[limit,setLimit]=useState<BulkLyricsLimit>(defaultBulkLyricsSelection.limit),[starting,setStarting]=useState(false),[statusLoading,setStatusLoading]=useState(false);
  const poller=useRef<BulkLyricsPoller|null>(null);
  useEffect(()=>{
    if(!checked||!available||!visible)return;
    let alive=true;setStatusLoading(true);
    const next=new BulkLyricsPoller(invoke,setProgress,()=>setNotice('Не удалось обновить состояние индексации.'));
    poller.current=next;
    void next.load().finally(()=>{if(alive)setStatusLoading(false);});
    return()=>{alive=false;next.dispose();if(poller.current===next)poller.current=null;};
  },[available,checked,visible]);
  const active=isBulkLyricsActive(progress.phase);
  const availability=bulkLyricsAvailability(checked,available),counters=bulkLyricsCounters(progress);
  const start=async()=>{if(starting||statusLoading||active||!poller.current)return;setNotice('');setStarting(true);try{await poller.current.start({scope,limit});}finally{setStarting(false);}};
  const cancel=()=>{setNotice('');void poller.current?.cancel();};
  return <section className="lyrics-indexer lyrics-management" aria-labelledby="lyrics-indexer-title" hidden={!visible}>
    <div className="section-heading"><div><h1 id="lyrics-indexer-title">Тексты песен</h1><p>Находите недостающие тексты для локальной библиотеки.</p></div><span className={`job-state ${active?'active':''}`}>{({idle:'Ожидание',running:'Выполняется',cancelling:'Отмена',completed:'Завершено',cancelled:'Отменено',failed:'Ошибка'} as Record<string,string>)[progress.phase]||progress.phase}</span></div>
    <p className="helper-text lyrics-indexer-help">Поиск текстов проверяет только треки без актуального текста. Локальные — уже есть в файле; кэшированные — сохранены после прошлой проверки; ошибки относятся к текущему запуску.</p>
    <div className="lyrics-indexer-layout"><div className="lyrics-indexer-main">
    {availability==='checking'?<p className="lyrics-indexer-note">Проверяем доступность внешнего поиска текстов…</p>:availability==='unavailable'?<p className="lyrics-indexer-note">Внешний поиск текстов недоступен в этой сборке.</p>:<>
      <div className="lyrics-indexer-options">
        <label>Область<select value={scope} disabled={active} onChange={event=>setScope(event.target.value as BulkLyricsScope)}><option value="all_library">Вся медиатека</option><option value="recent_downloads">Недавние загрузки</option></select></label>
        <label>Проверить треков<select value={limit} disabled={active} onChange={event=>setLimit(event.target.value==='all'?'all':Number(event.target.value) as BulkLyricsLimit)}>{bulkLyricsLimits.map(value=><option key={value} value={value}>{value==='all'?'Все':value}</option>)}</select></label>
      </div>
      <div className="lyrics-indexer-progress"><span><strong>{counters.processed}</strong> / {counters.total}</span><progress max={counters.total||1} value={counters.processed}/><small>Осталось: {counters.remaining}</small></div>
      <div className="lyrics-indexer-current"><span>Текущий трек</span><strong>{bulkLyricsCurrent(progress)}</strong></div>
      <section className="lyrics-run-stats" aria-labelledby="lyrics-run-stats-title"><h2 id="lyrics-run-stats-title">Текущий запуск</h2><dl className="lyrics-indexer-counters">
        <div><dt>Найдено</dt><dd>{counters.found}</dd></div><div><dt>Локальные</dt><dd>{counters.localExisting}</dd></div><div><dt>Кэш / пропущено</dt><dd>{counters.skipped}</dd></div><div><dt>Не найдено</dt><dd>{counters.notFound}</dd></div><div><dt>Неоднозначно</dt><dd>{counters.ambiguous}</dd></div><div><dt>Ошибки</dt><dd>{counters.temporaryErrors+counters.permanentErrors}</dd></div>
      </dl></section>
      <div className="lyrics-indexer-actions"><button className="subtle-button" disabled={active||starting||statusLoading} onClick={()=>void start()}><RefreshCw size={16}/>{starting?'Запуск…':'Найти недостающие тексты'}</button><button className="text-button" disabled={!active||progress.phase==='cancelling'||statusLoading} onClick={cancel}><X size={16}/>Отмена</button></div>
      {notice&&<p className="lyrics-indexer-note" role="status">{notice}</p>}
    </>}
    </div><aside className="lyrics-indexer-guide"><div className="lyrics-guide-icon"><BookOpenCheck size={21}/></div><h2>Проверка библиотеки</h2><p>Ищите тексты для треков, которым они ещё нужны. Выбранные папки с музыкой и сами файлы останутся без изменений.</p><ol><li><span><ListChecks size={15}/></span><div><strong>Выберите охват</strong><small>Вся медиатека или недавние загрузки</small></div></li><li><span><Search size={15}/></span><div><strong>Запустите поиск</strong><small>Результаты появятся в счётчиках запуска</small></div></li><li><span><BookOpenCheck size={15}/></span><div><strong>Следите за ходом</strong><small>Текущий трек и остаток видны рядом</small></div></li></ol></aside></div>
  </section>;
}
