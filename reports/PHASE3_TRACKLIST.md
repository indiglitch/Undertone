# Phase 3 — канонический local TrackList

Выполнена только Phase 3. Использован текущий checkout с результатами Phase 1/2; существующие изменения backend/player сохранены. Второй TrackList, новый scroll model и новый ContextMenu не создавались.

| Было | Стало |
|---|---|
| Конфликтующие row CSS в семи файлах | Один владелец: `src/TrackList.css` |
| Inline 52 px одновременно с CSS min-height 60 px | Измеряемые 48 px; Search 44 px |
| Одиночный click сразу воспроизводил трек | Click выбирает, double click воспроизводит; отдельный Play/Pause |
| Колонки с дробной шириной растягивались по странице | Title flexible, Album до 220 px, компактные технические колонки; список до 1440 px |
| Не было desktop multi-selection | Click/Ctrl/Shift/Ctrl+A/arrows/Enter/Space, устойчивые occurrence keys |

1. **Изменённые компоненты и интеграция.**

   `TrackList.tsx` остаётся единственным local TrackList и включает общую строку без PlaylistTrackRow-копии. Добавлены конфигурация `columns` поверх существующих `useTrackDisplay` preferences, optional index/artwork, `rowKeys`, `source`, `onToggleCurrent` и общий `TrackListContext` (track, selection, source, index, rowKey). `trackListModel.ts` содержит идентичности повторных записей и range selection; `trackAvailability.ts` — проверку видимых файлов через существующий `track_file_status` (четыре worker на список, дедупликация запросов, cache до 512 записей / 30 секунд). Неизвестное состояние не маркируется missing.

   Обновлены `CollectionView`, существующий TrackList внутри `DesktopHome`, вызовы в `App`, а также интеграция `TrackContextMenu`. Повторно использованы Phase 1 IconButton и Tooltip. Внешние стили ContextMenu не менялись. Queue/Playlist ordering/remove по-прежнему доступны через прежний ActionDialog из меню «Порядок / убрать из списка»; остальные прежние действия — через «Другие действия».

2. **Страницы, уже использующие канонический TrackList.**

   Library, Favorites, Recently Added, History, Playlist, Queue, локальные Search results, Album detail, Artist detail и embedded recent list на Home. Их композиция не переделана. Существующий поиск `localSearchSource → localTracksForHits → TrackList` сохранён. Queue сохраняет jump по очереди и отдельный current summary. Playlist сохраняет entry IDs, порядок, drag handle и remove semantics.

   History сохраняет повторные проигрывания как отдельные записи: row key равен history entry ID. Timestamp привязан к той же отфильтрованной записи, что и track; удалённая из библиотеки запись больше не сдвигает timestamps остальных строк. History business logic не менялась.

3. **Намеренно не мигрированные track-like rows.**

   Home feature/continue cards и малый custom recent list остаются для Phase 5. NowPlayingPanel `.panel-queue-track`, queue-current summary и Player now-playing summary имеют другое назначение и сохраняются для своих фаз. Downloads и Soulseek remote results сохраняют download/search lifecycle и собственные действия. Album/artist/playlist entity cards — коллекции, а не local track rows.

4. **Удалённые legacy CSS rules.**

   Удалены или разделены 146 групп селекторов: `desktopLayout.css` — 16, `freakIdentity.css` — 9, `glassRedesign.css` — 41, `mobileIdentity.css` — 12, `phase3d16.css` — 5, `referenceIdentity.css` — 27, `styles.css` — 36. В mixed selectors сохранены части, относящиеся к другим интерфейсам.

   Заменены старые grid templates и positional nth-child hiding, min-height 52/60, несколько размеров artwork, 9–10 px artist/note typography, разные hover/current fills, вращение cover/heart, скрытые декоративные Play, row-actions fading, row focus, drag ghost/neighbor/source styles и hardcoded зелёные global drag outlines. Существующий `cursor:grabbing!important` удалён; нового `!important` слоя нет. Общая `.cover.small` продолжает обслуживать другие интерфейсы, а канонический TrackList явно задаёт собственные width/min-width/height.

   Полный журнал заменённых селекторов/declarations: `reports/PHASE3_REMOVED_RULES.json`. CSS вне непосредственного TrackList не переделывался.

5. **Row height и column model.**

   Нормальная строка 48 px, Search 44 px, artwork 32×32, icon hit areas 40×40. Новые geometry tokens в существующем `designTokens.css`: `--track-artwork-size:32px`, `--track-list-width:1440px`. Цвета, radius, borders, spacing и typography взяты из Phase 1. Title — Row title 14 px; artist/technical metadata/timestamps — Metadata 12 px; album — Secondary 13 px.

   Grid: index/play 40 px (80 px с playlist handle), flexible Title, Album minmax(120px,220px), Format 64 px, Size 88 px, adjacent Favorite/Context 80 px, Duration 56 px. Row height задаёт единственный default TrackList / estimateSize, а не параллельный CSS min-height. Gap 8 px, padding 8 px. Header и row используют один рассчитанный grid. Existing display settings сохраняют возможность отключать колонки; duration доступна по умолчанию, её пользовательское отключение по-прежнему учитывается.

6. **Responsive behavior.**

   ResizeObserver отслеживает ширину самого TrackList, включая изменение sidebar. Ниже 1100 px скрывается Size; ниже 900 px — Format; ниже 700 px — Album и optional year/genre/track-number metadata. Title, artist и включённая Duration сохраняются. History timestamp остаётся secondary metadata с ellipsis/title. На широком экране ширина списка ограничена 1440 px; технические данные не уходят на тысячи пикселей. Horizontal document scroll отсутствует на 1280×720, 1920×1080, 2560×1440 и проверенном 1000×720.

7. **Virtualization QA.**

   Сохранены `useVirtualizer`, `.track-scroll`, absolute positioning и overscan 8. Estimate соответствует rowHeight; при изменении высоты вызывается measure. getItemKey использует occurrence identity. rangeExtractor сохраняет максимум одну дополнительную active row, поэтому aria-activedescendant остаётся в DOM после recycling; фокус row navigation принадлежит стабильному grid container. Focus capture также закрепляет строку с focused button, чтобы ручной скролл не удалял focused control; arrows возвращают navigation focus контейнеру.

   Synthetic browser fixtures: 1/20/1000/5000 tracks. На 1920×1080 в начальном DOM соответственно 1/20/23/23 rows; на 2560×1440 для 5000 — 30 rows. Для 1000 scrollHeight 48000 px; для 5000 — 240000 px. Проверены End/Home через scrollToIndex, физическая видимость последней строки, jump к track 2500 по scroll offset, начало/конец/resize, bounded DOM с учётом overscan и сохранение active descendant / focused favorite button при ручном скролле.

8. **Interaction и accessibility QA.**

   Browser QA проверяет single click без audio command; Ctrl toggle; Shift range; Ctrl+A; arrows/Shift+arrows; Enter play; Space/current pause/resume; double click; hover Play/Pause; favorite без row selection/playback; aria-pressed/selected/disabled и accessible icon labels. Missing track помечен и не запускается из строки. Current имеет restrained accent indicator/title, selection — отдельный background, keyboard focus — отдельный outline.

   Context payload общий для right click, ⋯ и Shift+F10. Первый enabled menu item получает focus; Escape возвращает focus в TrackList и сохраняет выбор. При multi-selection существующие enqueueGroup и playlistAddAction принимают выбранный набор, включая повторные occurrences; favorite/copy/file/ordering actions продолжают работать с anchor track. Новая multi-edit business logic не вводилась.

   Проверены existing track → playlist callback (один add_tracks, без playback), invalid/valid target, playlist source/ghost/drop target/reorder callback, disabled reorder при фильтре, Queue/Playlist remove actions, отдельные duplicate History/Playlist selections, правильные timestamps после отсутствующей history записи, Home/Search/Album/Artist integration и настройки отображения колонок. Global TrackDrag threshold/capture/cancellation архитектура сохранена; добавлены только source/target visual attributes и исключение Play button из drag initiation.

   `scripts/phase3-tracklist-qa.cjs` использует настоящий React UI в Chrome и synthetic Tauri IPC fixture. Скриншоты, geometry и логи — `qa-output/phase3-tracklist/` и `qa-output/phase3-*.log`. Результат: 172 frontend tests, regression tests, production build и diff check проходят; browser page errors отсутствуют. Скриншоты 1280/2560 просмотрены визуально. Native playback, реальные файлы/SQLite и запущенный Tauri executable этим browser fixture не проверены; backend не изменялся.

9. **Оставлено будущим фазам.**

   Композиция Home — Phase 5, Search/remote presentation — Phase 6, расширенный Queue UX — Phase 7, внешний дизайн/полная навигация ContextMenu — Phase 11, полноценный global drag polish и групповой drag — Phase 12. Group file operations/multi-edit не добавлены. Проверка файла отображает результат существующего IPC с коротким cache; удаление файла между check и playback продолжает обрабатываться прежним player/backend.

   Phase 4 не начата.
