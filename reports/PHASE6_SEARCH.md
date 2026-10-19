# Undertone — Phase 6: Search

Выполнена только Phase 6. Baseline начала фазы: `qa-output/phase6-before`. Предыдущие Phase 1–5 и сторонние незавершённые изменения сохранены. Нет новой базы, search engine, TrackList, EntityCard, ContextMenu, backend или download lifecycle.

## Аудит текущего состояния

До изменений App уже держал один persistent Search host и navigation snapshots с query. CollectionView использовал localSearchSource → SearchHit → localTracksForHits → TrackList; Source ID не смешивался с Soulseek. In-memory поиск выполнялся синхронно, но нормализовал metadata заново для каждого query, не ранжировал совпадения и возвращал только tracks. Enter главного native input запускал Soulseek. Remote pipeline имел request IDs/stale-response guard, фильтры качества, сортировку и действующий DownloadSession; row label «Добавлено» означал запуск download, а не успешный импорт. Ctrl+K и recent queries отсутствовали. Presentation одновременно управляли шесть legacy CSS-файлов.

Albums/artists доступны через существующие album_id/artist_id и Track metadata; playlists — через Collections. Новая persisted индексация не нужна. Backend предоставляет `slskd_search`, но публичной команды отмены Search нет. Settings и Download Manager уже имеют нужные handlers, поэтому используются без редизайна.

| До | После |
| --- | --- |
| Persistent CollectionView host, native search composition | Тот же host, SearchPage как единственный presentation branch |
| Native input и shared remote submit | SearchInput, clear, Ctrl+K hint, Enter переводит фокус к local results |
| Нет global shortcut | Ctrl+K открывает существующий Search и фокусирует input без дублирования history/host |
| Empty-query artist suggestion tiles | Компактная подсказка и до десяти committed recent queries |
| Tracks-only, substring order | Четыре категории на том же source; exact/prefix/word/substring ranking |
| Повторная нормализация metadata на каждом query | Memoized normalized records и entity groups; cached ID map для hit resolution |
| Независимые технические Search columns | Канонический TrackList 44 px без size/format/year/genre/number |
| Нет grouped entity results | Bounded previews через настоящие EntityCard/EntityArtwork |
| Нет полных entity category results | Существующий EntityGrid, полный virtualized result set |
| Текущий query визуально мог обозначать старые remote results | Всегда отображается query конкретного сетевого request |
| Remote cards без bounded DOM | RemoteSearchResult, 64 px, virtualized desktop data list |
| «Добавлено» после начала download | queued/downloading/downloaded/importing/imported presentation из настоящих session snapshots |
| Не различался search timeout | Отдельное понятное timeout сообщение; auth/config/network/error, retry/clear/settings |
| Асинхронное состояние могло менять высоту сетевой панели | Высота активной network panel резервируется между searching/result/error |
| Entity category могла терять scroll при hidden host / Back | Search composition сохраняет offsets и восстанавливает после layout; EntityGrid internals не изменены |
| Search-specific legacy CSS по разным слоям | SearchPage.css — composition и remote presentation owner |
| Source-text тесты требовали старую форму/labels | Актуализирован integration contract; добавлены behavioral ranking/normalization/category/preferences/size tests |

## 1. Итоговая архитектура Search

App продолжает владеть navigation, query, explicit Soulseek request IDs и DownloadSession. Persistent `search-page-host` сохраняет CollectionView. Он расширяет существующий localSearchSource, разрешает hits через localTracksForHits и предоставляет SearchPage прежние track/entity/menu actions. SearchPage владеет category, recent UI preference и composition scroll snapshots. SoulseekSearchView сохраняет существующие performSoulseekSearch/filter/sort/API и развивает remote presentation.

PageHeader → один SearchInput → category Tabs → local results → отдельная network section. Канонические TrackList, EntityGrid, EntityCard/EntityArtwork, PageHeader, primitives и tokens не изменялись. Sort и matchesQuery для существующих collection/detail filters сохранены; library metadata не переписывается.

## 2. Local categories

Tracks, Albums, Artists, Playlists. Derived records используют исходные Track/Playlist references и реальные normalized IDs. Album/artist group строится один раз на library snapshot, playlist membership сохраняет duplicate entries и порядок; недоступные IDs не превращаются в fake tracks. Entity categories ищут реальные entity names; album также учитывает album artist. Нет жанровой discovery category или рекомендаций.

## 3. Ranking / normalization

Exact normalized field match → starts-with → word-prefix match → substring; token matches могут охватывать title/artist/album/album_artist/genre. При равенстве остаётся порядок исходного snapshot, с небольшим приоритетом первичных fields. Нормализация NFKD, removal of combining marks, lowercase, Unicode letters/numbers, punctuation → spaces, collapsed whitespace. Cyrillic/Latin сохраняются, transliteration и fuzzy/ML не добавлены. Исходные metadata неизменны.

## 4. Grouped «Все»

Стабильный порядок Tracks → Albums → Artists → Playlists. До шести tracks и до трёх entities каждой категории; пустые sections не отображаются. Section heading содержит count и action «Все…». Full 224×300 EntityCard пригодны для ограниченного preview; новый compact variant не понадобился. Grouped область прокручивается, не рендерит тысячи элементов.

## 5. Category presentation

Tabs переключают настоящий result panel и сохраняют query. Tracks — полный virtualized TrackList, rowHeight 44, полезные artwork/title/artist/album/duration/favorite/context. Entities — полный существующий EntityGrid. Play/current/selection/keyboard/context и playlist/entity action semantics сохранены. Пустая категория сообщает об отсутствии совпадений без большого empty box. Category и query сохраняются при entity navigation/Back; scroll проверен у grouped, TrackList и EntityGrid.

## 6. Ctrl+K / input

Shortcut из основной страницы использует visit/navigation history и один host. Повторный Ctrl+K фокусирует тот же input. Dialogs, native editing inputs вне Home/Search, contenteditable и IME не перехватываются. Tooltip/sidebar hint показывает Ctrl+K. Escape в input сначала очищает query; затем command-like вход возвращает Back и фокус к сохранённому connected anchor либо соответствующему sidebar action. Обычный прямой Search не закрывается без такой command navigation. Enter сохраняет query и фокусирует local grid/card; не запускает Soulseek. Clear возвращает input focus. Paste и composition проверены в Chrome. Открытые Search context menus закрываются при shortcut через integration state.

## 7. Recent searches

`undertone.search.recent.v1` в localStorage; до 10, newest first, normalized deduplication, без пустых/односимвольных запросов. Сохранение при Enter, category/result consumption и explicit remote action — не на каждом keystroke. Есть click-to-reuse, individual remove и clear all. Ошибки/недоступность storage не ломают Search. Это UI preference, не library data.

## 8. Local zero results

Короткое «В библиотеке ничего не найдено» и видимая отдельная кнопка «Искать в Soulseek» с текущим query. Network section располагается сразу после компактной note; нет большой пустоты между ними. Remote query отправляется только после explicit action, local input остаётся доступным.

## 9. Soulseek separation

Отдельный labelled region «Искать в сети · Soulseek», border divider, подпись «Внешний источник · файлы нужно скачать». Local rows не смешиваются с remote. Старый remote query отображается явно даже после изменения local input. Quality/sort filters остаются прежними, не создают новых requests. Remote result имеет только Download/lifecycle state, без fake Play/streaming.

## 10. Remote result component

Развит старый Result в RemoteSearchResult: raw filename, Soulseek user, raw path в title, реально предоставленные format/bitrate/size/duration/sample rate/bit depth/slot/queue/speed/locked facts. Filename не разбирается в якобы verified artist/title. Row 64 px, scoped responsive columns, secondary facts скрываются при ограниченной ширине; virtualized DOM. Малые sizes/speeds больше не округляются в 0 MB. DownloadStatus snapshot показывает queued/progress/downloaded/importing/imported; added callback сам по себе не объявляет файл локальным. Failed/cancelled operations ведут в существующие Downloads для дальнейшего действия, lifecycle не менялся.

## 11. Stale / cancellation

Remote запускается существующим `slskd_search` и performSoulseekSearch. Request identity и effect cleanup/disposed guard не дают старому response перезаписать новый; dismiss/unmount/config changes инвалидируют presentation. Другой query можно явно отправить во время pending request, старый response будет проигнорирован. Persistent host сохраняет запущенный request при page navigation. Backend cancellation отсутствует: не добавлена вводящая в заблуждение Cancel search. Это suppression stale UI updates, а не отмена сетевой работы. Retry использует query ошибочного request; clear и settings доступны. Stack traces не выводятся пользователю.

## 12. Performance

Memoized source records/grouping не перестраиваются на каждую клавишу; ненужные playlist cards и повторные entity groups в Search branch CollectionView не строятся. localTracksForHits использует существующий cached byId. Нет artificial debounce или Worker.

Измерение `node --experimental-strip-types scripts/phase6-search-performance.mjs`, 12 selector samples:

| Tracks | Index, ms | Selector p50, ms | Selector p95, ms |
| --- | ---: | ---: | ---: |
| 5000 | 20.6 | 2.0 | 7.6 |
| 25000 | 83.3 | 8.9 | 25.6 |

Это timings локального selector на текущем компьютере, не гарантия frame latency на другом hardware. Browser fixtures: 5000/25000 tracks, около 1000 albums/artists/playlists, 28 mounted rows и около 24 mounted entity cards у проверенного scroll position. End-to-end performance scenario включает переключение categories, scroll и две entity navigation/Back; его elapsed не трактуется как задержка ввода.

## 13. Legacy CSS

Удалены заменённые native `.search` rules, `.unified-search-*`, `.search-starters`, `.search-frequency`, `.search-play-results`, `.search-sort-controls`, `.soulseek-*`, `.remote-path` и Search host rule из identity layer. Mixed selector groups разделены с сохранением Settings/Downloads/Player/ContextMenu selectors. Shell host layout остаётся desktopLayout. Новых global override layers и `!important` нет.

- `freakIdentity.css`: 25 selector occurrences.
- `glassRedesign.css`: 63 selector occurrences.
- `listeningExperience.css`: 4 selector occurrences.
- `mobileIdentity.css`: 2 selector occurrences.
- `referenceIdentity.css`: 23 selector occurrences.
- `styles.css`: 43 selector occurrences.

Всего 160. Точный список: `qa-output/phase6-css-removed.json`.

## 14. Responsive / accessibility / QA

- 178/178 frontend tests; regression; TypeScript + production build; diff check — PASS.
- Targeted Chrome QA запускает настоящий App с synthetic Tauri IPC fixtures A–O: exact/partial/album/artist/playlist/mixed/zero/empty/large/Unicode, remote success/zero/unavailable/auth/network/timeout/stale/imported.
- 1280×720, 1920×1080, 2560×1440: local TrackList/grouped и remote screenshots; document horizontal overflow отсутствует, row/card geometry и bounded DOM проверены.
- Ctrl+K, repeated shortcut/single host, focus, Enter, Escape, clear, actual clipboard paste, IME, Tabs arrows, Tab/Shift+Tab, TrackList Home/Space, categories, query/category/scroll Back, Track Play/context, entity open, remote Download/import, retry/clear/settings, Settings dialog shortcut isolation и resize проверены.
- Remote searching/result panel height stability проверена. Async status имеет polite live region; accessible names есть у input, clear, tabs, sections, result counts, download buttons и context actions. Roving-focus systems поверх canonical компонентов не добавлены.
- Regression Phase 3 TrackList, Phase 4 entities и Phase 5 Home — PASS. Phase 3 script только адаптировал Search locator/category к новой presentation.
- Byte comparison с baseline: TrackList, EntityGrid/Artwork/Presentation, Home, PageHeader, designTokens, primitives, player, DownloadManager/downloadModel и SoulseekSettings неизменны.

Артефакты: `qa-output/phase6-search/results.json` и screenshots `grouped-*`, `tracks-*`, `remote-1280/1920/2560`, success/auth/network/timeout/unavailable/imported. QA script: `scripts/phase6-search-qa.cjs`, первый argument — установленный Playwright module path, второй optional — URL Vite. Selector benchmark результаты: `qa-output/phase6-performance.json`.

QA проверяет реальные UI/handlers с synthetic IPC. Live Soulseek network, реальные downloads/audio и установленный native executable не проверялись. User database/music не изменялись; native deployment не входил в Phase 6.

## 15. Намеренно оставлено

Phase 7 Queue и следующие Downloads/Lyrics/Now Playing/Settings/Dialogs/ContextMenu/global drag polish не выполнялись. Нет backend cancel API, transliteration, fuzzy/ML/Worker, URL routing, новой базы, full shortcut settings page или нового download lifecycle. К Phase 7 перехода нет.
