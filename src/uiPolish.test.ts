import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hiddenTooltipState,placeTooltip,tooltipTransition} from './tooltipModel.ts';

const source=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');

test('tooltip appears after delay from hover or focus and closes cleanly',()=>{
  const hover=tooltipTransition(hiddenTooltipState,'hover');
  assert.equal(hover.pending,true);assert.equal(hover.visible,false);
  assert.equal(tooltipTransition(hover,'delay').visible,true);
  assert.equal(tooltipTransition(tooltipTransition(hover,'delay'),'leave').visible,false);
  const focus=tooltipTransition(hiddenTooltipState,'focus');
  assert.equal(tooltipTransition(focus,'delay').visible,true);
  assert.equal(tooltipTransition(tooltipTransition(focus,'delay'),'blur').visible,false);
  assert.equal(tooltipTransition(tooltipTransition(focus,'delay'),'escape').visible,false);
});

test('tooltip placement stays inside every viewport edge',()=>{
  const viewport={width:800,height:600},size={width:180,height:48};
  for(const anchor of [
    {left:0,top:0,right:20,bottom:20,width:20,height:20},
    {left:780,top:0,right:800,bottom:20,width:20,height:20},
    {left:0,top:580,right:20,bottom:600,width:20,height:20},
    {left:780,top:580,right:800,bottom:600,width:20,height:20},
  ]){
    const point=placeTooltip(anchor,size,viewport);
    assert.ok(point.left>=8&&point.left+size.width<=viewport.width-8);
    assert.ok(point.top>=8&&point.top+size.height<=viewport.height-8);
  }
});

test('tooltip wrappers preserve existing button activation handlers',()=>{
  const tooltip=source('./Tooltip.tsx'),player=source('./player.tsx');
  assert.doesNotMatch(tooltip,/onClick=/);
  assert.match(player,/content="Следующий трек"[\s\S]*onClick=\{\(\)=>void player\.next\(1\)\}/);
  assert.match(player,/content="Очередь"[\s\S]*onClick=\{onQueue\}/);
});

test('requested contextual help is present in empty states',()=>{
  assert.match(source('./SoulseekSearchView.tsx'),/Введите запрос для поиска в Soulseek/);
  assert.match(source('./SoulseekSearchView.tsx'),/Попробуйте сократить запрос/);
  assert.match(source('./BulkLyricsIndexer.tsx'),/Локальные.+кэшированные.+ошибки/);
  assert.match(source('./DownloadManager.tsx'),/только загрузки текущего сеанса/);
  assert.match(source('./CollectionView.tsx'),/Очередь пуста.+контекстное меню.+Слушать следующим/);
});

test('key screens share tokens without changing structural layout rules',()=>{
  const css=source('./uiPolish.css'),app=source('./App.tsx'),tracks=source('./TrackList.tsx');
  assert.match(css,/--space-1:/);assert.match(css,/--radius-md:/);assert.match(css,/--surface-panel:/);assert.match(css,/--border-subtle:/);
  assert.match(css,/\.player\{/);assert.match(css,/\.details-panel\{/);assert.match(css,/\.lyrics-indexer-counters div\{/);
  assert.match(app,/ResizeHandle axis="horizontal"/);assert.match(tracks,/useVirtualizer/);
});

test('minimum tooltip coverage is wired through shared primitive',()=>{
  const app=source('./App.tsx'),player=source('./player.tsx'),menu=source('./TrackContextMenu.tsx'),tracks=source('./TrackList.tsx');
  for(const label of ['Поиск музыки','Локальная медиатека','Недавно добавленные треки','Недавно прослушано','Загрузки текущего сеанса','Тексты песен и индексация','Плейлисты','Альбомы','Исполнители'])assert.ok(app.includes(label),label);
  for(const label of ['Предыдущий трек','Следующий трек','Очередь','Текст песни','Громкость'])assert.ok(player.includes(`content="${label}"`),label);
  for(const label of ['Воспроизвести сразу после текущего трека','Добавить в конец очереди','Выбрать плейлист','Переместить файл в папку удалённых песен','Открыть папку с файлом'])assert.ok((menu+source('./ContextMenu.tsx')).includes(label),label);
  assert.match(tracks,/content="Есть текст песни"/);
});
