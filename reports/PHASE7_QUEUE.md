# Undertone — Phase 7: Queue

Выполнена только Phase 7. Исходное состояние сохранено в `qa-output/phase7-before`; сторонние изменения dirty checkout сохранены. Последнее уточнение пользователя ограничивает QA компонентами TrackList, Queue и playback integration. Exhaustive cross-app QA и Phase 8 не выполнялись.

## Аудит модели

1. **Queue data model.** Существующий `usePlayer` хранит `{items: QueueEntry[], cursor}`. Entry — `{key:number, track:Track}` с отдельным serial key каждого occurrence. Это абсолютный список: prefix до cursor, current на cursor, upcoming после cursor. Prefix не является подтверждённой историей прослушивания: jump/shuffle могут менять его значение. Recently Played остаётся отдельным event storage.
2. **Presentation.** `QueuePage.tsx` / `QueuePage.css` — композиция существующей страницы CollectionView, PageHeader, Cover, TrackList, ContextMenu и dialog. Второй QueueTrackRow, TrackList, playback engine, queue model, toast system и drag architecture не созданы. Player controls/CSS не переделаны.
3. **Business-level корректировки.** В существующий hook добавлен `removeMany(keys)` с одним линейным фильтрованием и update/persistence вместо тысячи последовательных remove. `remove(key)` делегирует ему. Reorder canonical order исправлен по occurrence anchor целевой строки вместо числового индекса shuffled списка. Регрессионный тест сначала воспроизвёл ошибку. `sourceIntact` — только transient достоверность origin label; repeat context и playlist snapshot сохраняют прежнюю семантику. Схема persistence/backend не менялась.

## Что изменено

| Before | After |
| --- | --- |
| Общий toolbar и queue-current с несколькими legacy оформителями | QueuePage с компактным action menu и одним QueuePage.css |
| Current похож на случайную карточку с повторным playback button | «Сейчас играет»: Cover 64 px, title/artist, состояние, время; управление остаётся в Player |
| Upcoming без самостоятельного заголовка, технические колонки | «Далее»: канонический TrackList 44 px, order/art/title/artist/album/duration/actions |
| Одно сообщение empty queue для разных ситуаций | Отдельные «Очередь пуста» / «Дальше ничего нет» и переход в Search |
| Reorder только через ActionDialog | Существующие drag handle/source/target/insertion preview/autoscroll; ActionDialog Выше/Ниже сохранён |
| Drag мог терять source при autoscroll | Source становится active occurrence и удерживается существующим focus pin; virtualizer internals не менялись |
| После drag/dialog focus мог потеряться | Grid focus после reorder/ActionDialog; queue action button после закрытия confirmation |
| Удаление одной строки по сохранённому индексу | Occurrence key в ActionDialog, прямой пункт меню и Delete для выбранных upcoming |
| Selection payload содержал только tracks | Дополнительные selectionKeys для точного multi-remove дубликатов |
| Повторное удаление тысяч элементов | removeMany: один update, current/prefix защищены |
| Canonical move использовал shuffled numeric index | Move использует occurrence key целевого соседа; current/cursor/audio остаются прежними |
| Нет достоверного source label | Реальный playlist context с навигацией, скрывается после ручной модификации |
| Нет Queue save flow | Current + upcoming в effective order через прежний PlaylistEditor и create_playlist/add_tracks |
| Immediate clear в page toolbar | «Очистить далее» в menu с confirmation; без нового Undo/toast |
| Старый source assertion требовал удалённый empty text | uiPolish test проверяет новые empty/only-current тексты и Search action; browser проверяет реальный DOM |

4. **Current / Upcoming.** Summary использует элемент существующей queue на cursor. Он не повторяется в upcoming. Каждый повторяющийся track с иным key остаётся отдельной строкой. Если current отсутствует, заранее добавленные entries остаются upcoming и начинают играть только после явного действия. Empty/current-only не занимают огромную карточку.
5. **Reorder.** Относительные индексы TrackList преобразуются в абсолютные через cursor + 1. Existing player.move запрещает current/prefix/out-of-range. Drag preview, Escape cancellation, autoscroll и доступные handle labels взяты из прежнего TrackList. Перенос не вызывает audio IPC. Keyboard alternative: Shift+F10 → Порядок / убрать из списка → Выше/Ниже.
6. **Duplicates.** rowKeys — serial queue entry keys; context selectionKeys, remove, jump, drag и fallback dialog обращаются к occurrence. track ID остаётся metadata identity, а не единственным ключом строки. Удаление одного duplicate не удаляет другие и не затрагивает одноимённый current.
7. **Play Next / Add to end.** Прежние enqueue/enqueueGroup и обычный TrackContextMenu. Play Next вставляет после cursor без немедленного запуска; multi-selection разворачивается только для последовательных insert, сохраняя логический порядок. Add добавляет в конец. Дубликаты сохраняются. Проверены точечные context integrations Library/Search/Album/Artist/Playlist/Favorites/History и Home recent → Queue.
8. **Clear upcoming.** В menu вызывается прежний clearUpcoming после confirmation. Current и prefix остаются, playback/position не сбрасываются. Undo infrastructure не создана. Существующий sidebar clear shortcut сохраняет прежний безопасный player action.
9. **Save as playlist.** Сохраняется snapshot current + upcoming, без старого prefix; порядок берётся из реального effective queue. Backend add_tracks сохраняет повторные track_ids; лимит существующего API 10000. Создание и заполнение — два существующих вызова, не новая транзакция. Если заполнение временно падает, dialog остаётся и retry использует созданный playlist ID, не создавая второй плейлист. При закрытии после такого сбоя созданный пустой плейлист остаётся; новая rollback-логика не добавлена.
10. **Source behavior.** PlaybackContext знает только queue/playlist; Album/Search labels не угадываются. Реальный playlist origin кликабелен. Ручные enqueue/remove/reorder/clear/deleted-track modification скрывают неоднозначную подпись. Context для repeat не подменяется.
11. **Shuffle / Repeat.** Shuffle физически переставляет upcoming; Queue показывает queue.items, без второго shuffle. Выключение восстанавливает canonical order с тем же current key. Move сохраняет относительное перемещение occurrence и в canonical order. Repeat track удерживает current; repeat queue переходит к началу конечного списка. Repeat playlist использует прежний playlistRef snapshot: ручное изменение очереди не редактирует исходный плейлист и его repeat snapshot. Infinite rows не создаются; режим остаётся в Player.
12. **Persistence.** Прежние playbackSessionSnapshot/restorePlaybackSession и coalesced save_playback_session: entry keys/order, current entry/track, cursor, position. Reload восстанавливает paused session, Play загружает current и seek. Shuffle/repeat/source context ранее не сохранялись, в Phase 7 persistence не расширялась. Hover, selection, drag, sourceIntact не пишутся в storage.
13. **Keyboard / Accessibility.** Headings current/upcoming, current status/time, grid label «Далее в очереди», позиции строк aria-rowindex, handles/menu/remove labels. Enter/Space jump, arrows/Home/End, Ctrl focus movement, Shift ranges, Ctrl-click, Ctrl+A, Delete upcoming selection, Shift+F10, Escape, Tab/Shift+Tab проверены. Delete срабатывает только на Queue grid, не на current summary или произвольных кнопках. Focus остаётся валидным после удаления и переносов. После modal close focus возвращается после unmount.
14. **Legacy CSS cleanup.** Удалены 9 queue-current selector occurrences из styles.css, glassRedesign.css, uiPolish.css; mixed selectors остальных экранов сохранены. Аудит: `qa-output/phase7-css-removed.json`. Новый QueuePage.css использует Phase 1 typography/color/spacing/radius tokens; нет !important, global override, gradient/glass/waveform. TrackList.css и Player/Downloads/Lyrics/Settings/NowPlaying CSS не менялись.

## QA и границы доказательств

15. **Performance / virtualization.** `scripts/phase7-queue-qa.cjs` запускает настоящий App/usePlayer/TrackList в Chrome с synthetic Tauri IPC. Viewports 1280×720, 1920×1080, 2560×1440. На каждом — empty, only current, 10/100/1000/5000 upcoming. Проверены row height 44 px, width ≤1440 px, отсутствие horizontal overflow и bounded DOM. На 5000 upcoming в 2560×1440 смонтировано 30 строк, а не 5000. Drag autoscroll 1000 entries удерживает source, focus и bounded rows. Линейный bulk-remove 5000 occurrences проверен actual hook regression. Это проверка ограниченности DOM/операций; числовой FPS или input latency не заявляются.

| Fixture | Проверка |
| --- | --- |
| A–E empty/current/10/1000/5000 | Все три viewport, screenshot, geometry/DOM assertions |
| F duplicates | Unique row keys, independent selection/remove/jump, ordered group insert, save duplicate IDs |
| G reorder boundary | Actual drag, insertion preview, cancel, autoscroll; hook запрещает prefix/current |
| H–I remove single/multiple | Menu и Delete, zero audio calls, current protected, focus valid |
| J–L Play Next/Add/group | Actual context actions и hook IPC spy, order/tail/current preserved |
| M clear | Confirmation, current-only outcome, zero audio calls, button focus |
| N jump | Enter/Space, exact occurrence/cursor, queue order preserved |
| O shuffle | Physical effective order matches displayed rows; off restores canonical keys; anchored move regression |
| P repeat | Natural repeat track and complete repeat queue wrap; finite rows |
| Q restart | Reload through existing session IPC adapter, keys/current/cursor/position, no autoplay |
| R unavailable | Missing upcoming indicator and blocked Enter; existing player regression skips unavailable next on manual/natural advance |
| S playlist origin | Real source link, duplicate queue entries, manual remove hides source |
| T album origin | Actual Album → Add to Queue; no invented album source |
| U manual queue | Source cleared, inserts/remove/reorder/current protected |

Recently Played: только интеграционная проверка двух duplicate listening events, timestamps и independent row IDs. Существующий backend ограничивает History последними 200 событиями; storage/layout не менялись. Полные проверки History/прочих экранов перенесены в финальную production QA согласно последнему уточнению пользователя.

Выполнены `npm run test:frontend` (178/178), `npm run test:regression`, `npm run build`, `git diff --check`. Расширенный queue-regression исполняет настоящий usePlayer с hook storage и audio IPC spy. Production build проверен отдельно от browser development runtime. Browser result: `qa-output/phase7-queue/results.json`; screenshots там же. Logs: `qa-output/phase7-frontend.log`, `phase7-regression.log`, `phase7-build.log`, `phase7-browser.log`.

Synthetic IPC подтверждает UI handlers, queue/player contracts и restore integration; не подтверждает реальный SQLite restart, установленный executable или физическое аудиоустройство. Native backend, пользовательская БД и музыка не изменялись. Полная Phase 3/4/5/6 cross-app regression suite не запускалась: scope ограничен затронутыми компонентами и их playback entry points.

16. **Phase 8+.** Downloads/Lyrics/Full Now Playing не переделывались. Внешний вид Settings/Dialogs/ContextMenu оставлен Phase 11; global drag visuals/Undo — Phase 12. Persisted origin/modes и расширенный save transaction требуют отдельного решения, а не неявного backend redesign этой фазы. Exhaustive production QA остаётся финальной фазе. К Phase 8 не переходил.
