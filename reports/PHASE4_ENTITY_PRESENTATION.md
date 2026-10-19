# Phase 4 — Entity presentation system

Выполнена только Phase 4. За основу взят текущий checkout после Phase 1–3; существующие изменения backend/player не менялись. TrackList.tsx, TrackList.css, trackListModel.ts и trackAvailability.ts совпадают с сохранённым состоянием до Phase 4 побайтово.

## Presentation: Before / After

| Before | After |
|---|---|
| EntityGrid находился внутри CollectionView | Та же реализация row virtualization выделена в канонический EntityGrid.tsx; локальная копия удалена |
| Один button-card с различиями legacy CSS | EntityCard: общий open button, sibling context/Play controls, album/artist/playlist variants |
| Grid рассчитывал колонки по 176 px, одновременно несколько CSS card heights | Фиксированная карточка 224×300, gap 24, virtual row 324, overscan 2 |
| Artwork на разных entity pages имел разные размеры/формы | EntityArtwork: square ratio, общие radius/border tokens; card artwork 224, detail identity 144/112 |
| Cover без отдельного entity loading state | Lazy local Cover внутри заранее зарезервированной геометрии; loading/error/empty/ready states без layout shift |
| Artist использовал album cover как фото | Локальный системный artist fallback с Users и initials; внешних фото нет |
| Playlist card использовал первую обложку, header — отдельную mixtape identity | Единый EntityArtwork: unique local covers mosaic либо cover/fallback, playlist badge |
| Hover не имел отдельного Play/context hit area | Phase 1 IconButton/Tooltip, 40 px controls; действия видны также при keyboard focus и hover:none |
| Entity menu открывался только right click | Right click, contextual button, Shift+F10/ContextMenu; focus первого menu item и возврат к вызывавшему control |
| Focused card могла исчезнуть после recycling/reflow | Сохраняется максимум одна focused virtual row; при изменении columns восстанавливаются control focus и видимый scroll anchor |
| Detail header имел отдельные album/artist/playlist размеры | Развит существующий PageHeader: entity-header variant, eyebrow, inline actions; одна геометрия для всех detail pages |
| Header/TrackList на широком экране имели разный usable width | Общий существующий --track-list-width; detail left/right alignment совпадает |
| Album повторял собственный album column | Integration prop columns={album:false}; внутренности TrackList не изменены |
| Artist detail был только списком треков | Phase 1 Tabs: Albums через EntityGrid и Tracks через TrackList |
| Detail имел только общий Play toolbar | Primary Play/Shuffle через существующие player.play/toggleShuffle; sorting и playlist edit/context сохранены |
| Длинные title/description могли увеличивать header без ограничений | Title до двух строк с полным accessible text/title; description до 60 px со scroll; actions wrap |
| Старые entity card/detail CSS конкурировали между слоями | 57 групп заменённых селекторов удалены; один scoped EntityPresentation.css; нового !important нет |
| Ветка старой playlist identity оставалась рядом с новой системой | Playlist branch CollectionSignature и её CSS удалены; Library catalog identity сохранена |

1. **Канонические entity components.**

   EntityGrid и его EntityCard в `src/EntityGrid.tsx`, общий `src/EntityArtwork.tsx`, существующий `src/PageHeader.tsx` с entity-header variant. Их стили имеют одного владельца — `src/EntityPresentation.css`. CollectionView остаётся единственным orchestration layer для collection/detail views.

2. **Переиспользованные реализации.**

   Существующие TanStack row virtualization / entity-scroll, local grouping maps albums/artists, CollectionView, PageHeader, Cover, Phase 1 Button/IconButton/Tooltip/Tabs/SearchInput, canonical TrackList, CollectionContextMenu и player callbacks. ContextMenu design и backend/library/Soulseek/playback implementation не менялись. Для Shuffle presentation выбирает начальный индекс и вызывает существующий shuffle mode + player.play; отдельный playback path не добавлен.

3. **Удалённые дубли.**

   Удалена inline EntityGrid implementation из CollectionView после её выделения, заменено старое card JSX, удалены старые detail branches в общем legacy PageHeader вызове и playlist-only CollectionSignature presentation. Система Library catalog остаётся прежней. Отдельные AlbumTrackRow, ArtistTrackRow, PlaylistTrackRow и второй detail header не создавались. Home album/playlist cards намеренно не мигрированы в этой фазе.

4. **EntityGrid.**

   Card width 224 px, card height 300 px, gap 24 px, fixed virtual row estimate 324 px, overscan 2. ResizeObserver рассчитывает число колонок из доступной ширины. Коллекции используют прежний --page-width:1400px: на 1280×720 — четыре колонки, на 1920/2560 — пять. На широком окне размер artwork не уменьшается ради большего числа колонок. Artist Albums использует тот же grid. Page switching использует отдельный grid key, который не конфликтует с PageHeader key.

5. **Общий Entity Header.**

   Развит PageHeader, а не создан параллельный header. Entity variant показывает artwork/identity слева; справа — type, title, secondary metadata, description при наличии и actions. Background прозрачный, без отдельной giant rounded/glass card. Title использует Page title, card title — Row title 14 px, metadata — Secondary 13 px / Metadata 12 px. Все detail headers и TrackList используют существующий --track-list-width:1440px; нового max-width token нет.

6. **Album-specific.**

   Показываются локальная обложка/fallback, title, album artist, известный year, track count, total duration и реальные format values. Sample rate/bit depth в текущем Track нет, поэтому quality не выдумывается. Play, Shuffle, ContextMenu, прежняя sorting доступны. Отдельной album favorite model нет; track favorites остаются в TrackList. Album column отключён только через props.

7. **Artist-specific.**

   Текущая модель не содержит artist image, поэтому album cover не выдаётся за artist photo. Header и cards используют system fallback с initials. Показаны локальные track/album counts, Play/Shuffle/context, Albums и Tracks в tabs. Albums содержит локальные album groups, связанные с этим artist; открытие Album detail сохраняет существующую navigation model. Биография, recommendations, followers и внешние изображения не добавлялись.

8. **Playlist-specific.**

   Grid использует общую geometry, но playlist identity отличается mosaic/badge/fallback. Создание остаётся отдельным прежним действием и dialog не переделан. Detail показывает title, description, count/duration, Play/Shuffle/edit/context и прежний SearchInput. Playlist data, playlist IDs, entry IDs, duplicates, ordering, remove semantics, reorder callbacks/handle не менялись. Play/context используют полный playlist, а filter меняет только отображаемые rows.

9. **Responsive и accessibility.**

   Detail artwork 144 px, при main container <=900 px — 112 px; square ratio сохраняется. Actions wrap, title ограничен двумя строками, description имеет ограниченную высоту. Header и TrackList имеют одинаковые x/width: на 1280 — x254,width1002; на 1920/2560 — x254,width1440 в проверенной expanded sidebar fixture. Primary actions остаются внутри видимой области над Player, TrackList имеет доступную scroll height. Document horizontal scroll отсутствует. Card open — настоящий button, Enter открывает entity; contextual/Play buttons не вложены в него. Focus outline использует --focus. Card selection model раньше отсутствовала и не добавлена.

10. **Legacy CSS cleanup.**

   Заменены 57 групп селекторов: desktopLayout.css — 8, freakIdentity.css — 9, glassRedesign.css — 17, listeningExperience.css — 3, mobileIdentity.css — 10, styles.css — 10. Удалены entity-specific fractional/card dimensions, inconsistent cover shapes/sizes, 10–11 px metadata, layered shadows/gradients/hover transforms, entity-scroll padding variants, collection-detail min-height/margins с !important и старые playlist signature/mosaic styles. Mixed selectors разделены: правила Home, Settings, Player, Lyrics, Search, Downloads, NowPlaying и ContextMenu сохранены. Полный журнал — `reports/PHASE4_REMOVED_RULES.json`.

11. **Performance / QA.**

   `scripts/phase4-entity-qa.cjs` проверяет настоящий UI в Chrome с synthetic Tauri IPC: 10/100/1000/1500 entities (20/200/2000/3000 local tracks). На 1920×1080 начальный DOM содержит 10/25/25/25 cards; на 2560×1440 для 1500 — 30 cards. Проверены scroll до последней entity, pinned keyboard focus, изменения columns с сохранением visible anchor и focus, одинаковые card/artwork sizes, typography и no overflow.

   Проверены Albums/Artists/Playlists collection, Album/Artist/Playlist detail, keyboard Enter/open, Shift+F10/context button/right-click integration, focus return, card/header Play, Shuffle и возврат к normal play, back navigation, длинные album/artist/playlist titles, description, ready/broken/empty/delayed artwork, playlist mosaic, создание/редактирование через прежние dialogs, empty playlist и отдельные empty Album/Artist/Playlist fixtures, duplicate entries, filter/reorder callback. Viewports: 1280×720,1920×1080,2560×1440. Loading fixture сохраняет artwork bounding box до/после image response. Browser page errors и React key/DOM warnings отсутствуют; card/detail screenshots просмотрены визуально.

   Дополнительно проходит browser regression Phase 3; его Artist navigation expectation обновлено для нового Albums/Tracks presentation, TrackList source не менялся. Frontend 172/172, regression tests, production build и git diff --check проходят. Evidence — `qa-output/phase4-entity/results.json`, screenshots и `qa-output/phase4-*.log`. Native audio, реальные файлы/SQLite и установленный Tauri executable не проверялись этой synthetic browser fixture; backend не менялся.

12. **Намеренно оставленные задачи.**

   Home composition/cards — Phase 5; Search/remote presentation — Phase 6; расширенный Queue — Phase 7; ContextMenu/dialog design и полноценная menu navigation — Phase 11; полный global drag polish — Phase 12. Существующая drag architecture сохраняется. Независимой entity metadata для пустых Album/Artist в library model нет: такие stale detail views показывают нейтральные названия и disabled playback. Внешний artwork service, отдельные entity favorites и новая selection/business model не вводились. Новых TrackList regression bugs не обнаружено.

   Phase 5 не начата.
