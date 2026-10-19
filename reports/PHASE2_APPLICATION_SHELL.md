# Undertone — Phase 2: application shell

5 октября 2026. Phase 2 завершена; Phase 3 не начата. Реализован desktop shell поверх компонентов Phase 1. Содержимое Home, Search, коллекций, очереди, Downloads, Lyrics, Settings, Now Playing и ContextMenu не переделывалось. Playback, library, Soulseek, IPC и backend не менялись в этой фазе. В checkout до начала работы уже были другие изменения; этот отчёт относится только к shell.

## Компоненты и изменения

| До | После |
|---|---|
| App содержал shell-разметку вместе с состоянием приложения. | `src/AppShell.tsx`: AppShell, Sidebar, MainContent, PlayerArea. App сохраняет прежние обработчики, drag/drop, навигацию, Search host и модальные окна; компоненты shell получают существующие children/slots. |
| Sidebar имел один большой scroll-content, разные selected/hover и прямые native buttons. | Sidebar разделён на постоянную primary navigation, Tools, playlist-scroll, Sources и нижний Settings. Используются существующие Button/IconButton/Tooltip/Divider, токены типографики, размеров, состояний и focus. Navigation остаётся nav, активные маршруты имеют aria-current=page. Settings открывает dialog. |
| Компактность sidebar задавалась старыми media overrides, состояние не сохранялось. | `useSidebarCollapse`: localStorage `undertone.shell.sidebarCollapsed`; 64 px collapsed, сохранённая пользовательская ширина expanded. При первом запуске без сохранённой настройки ширина окна <1100 CSS px выбирает collapsed. Ручной выбор сохраняется, resize не сбрасывает его. |
| В collapsed старые стили скрывали подписи без полноценного контракта controls. | Labels/counts скрываются полностью; accessible name задаётся aria-label, Tooltip дополняет его. Плейлисты остаются доступными как icons с подсказками. Tools раскрывается рядом с sidebar; Escape, клик снаружи и выбор раздела закрывают группу. Активный Tools-маршрут подсвечивает кнопку группы даже после закрытия. |
| Collapse мог резко перестраивать ширины. | Grid columns меняются за существующий motion-normal=170 ms; reduced motion отключает transition. Плеер занимает отдельную строку и при collapse не смещается. |
| Shell/sidebar/page padding были объявлены повторно в нескольких stylesheet. | Единственный владелец shell layout — существующий `src/desktopLayout.css`. Старые объявления удалены; нового глобального stylesheet overrides нет. |
| Размеры Player и положение content зависели от разрозненных grid/margin rules. | PlayerArea занимает третью grid-строку. Высота: max(сохранённый player-height, 104 px) + 12 px нижнего отступа; по умолчанию 116 px. Перед ним отдельная строка resize handle 6 px. Основной content получает оставшуюся высоту автоматически. Внутренний дизайн и раскладка controls Player сохранены. |
| Breadcrumb и content containers имели разные padding/max-width. | Базовый page contract: breadcrumb/back → имеющийся PageHeader → optional navigation/filters/actions → content. Horizontal padding 24 px, при узком окне 16 px; top content padding 16 px; gap 12/16 px. Header actions могут переноситься без пустой зоны для отсутствующих actions. |
| На широких экранах старые identity CSS отменяли max-width и увеличивали отступы. | Data-heavy library/history/queue/playlist/search используют доступную ширину. Home/card/entity/download/lyrics containers ограничены page-width=1400 px; соответствующий breadcrumb получает ту же ширину. Глобального max-width на shell нет. |
| Несколько source-text тестов проверяли старые grid rules в styles.css. | Проверки Phase 2 перенесены на фактического владельца layout и modal Now Playing. `scripts/phase2-shell-qa.cjs` проверяет реальный браузер. Phase 1 QA обновлён только для новых sidebar selectors; компоненты Phase 1 сохранены. |

В `designTokens.css` добавлены только shell dimensions: sidebar-collapsed 64 px, sidebar-default 224 px, splitter 6 px, player-min-height 104 px. Page-width 1400 px и совместимый table-width 1600 px также принадлежат tokens; table-width не ограничивает текущие data-heavy страницы.

## Удалённые старые правила

Машинный список: `reports/PHASE2_REMOVED_RULES.json`. Записи относятся к selector/property, а не к числу UI-ошибок; line numbers относятся к файлам перед миграцией.

- `styles.css`: прежние app-shell grids, details-open grid variant, sidebar/main/topbar, generic sidebar navigation/brand/source rules, дубли page padding/max-width, внешний grid placement Player и player-resize, settings-nav-item states.
- `glassRedesign.css`: sidebar geometry/glass/navigation/selected/hover; full-sidebar scrolling, playlist animation/translation; main/topbar surfaces и media geometry; повторные app-shell background/grid и outer page container rules; внешний margin Player. Внутренние стили страниц и Player сохранены.
- `phase3d16.css`, `uiPolish.css`: sidebar groups, dimensions, text/icon/hover/selected styles; outer Home padding.
- `desktopLayout.css`: старые topbar/sidebar/page dimensions и конфликтующие container padding. Вместо них один блок shell contract в этом же файле.
- `mobileIdentity.css`, `listeningExperience.css`, `referenceIdentity.css`: sidebar/main shell identity overrides, outer page padding/width, повторные PageHeader geometry rules, внешние margin Player; удалён selected !important sidebar. Динамические palette declarations сохранены.
- `freakIdentity.css`: outer library/Home geometry, конфликтующие header margin/min-height и actions flex-basis/margin. Artwork и декоративные стили содержимого сохранены.
- `playerPolish.css`: ненужное объявление sidebar width. `ResizeHandle.css`: sidebar/player grid placement перенесён к shell owner. `FullVisualizer.css`: прежний display:contents у preserved-page заменён явным flex host; сам visualizer не менялся.

Общие typography rules Phase 1 в `primitives.css` сохранены. В Phase 2 нет второй реализации Button, Input, Tabs, Tooltip, PageHeader, TrackList или ContextMenu.

## Какие legacy rules остались

Для активного shell/sidebar/main/player placement альтернативных legacy grid/geometry правил не оставлено. Общий `[hidden] { display:none !important }` сохранён: это HTML visibility contract, не обход конфликта shell styles.

За пределами shell остаются внутренние Player layout overrides в playerFreeLayout/playerControlLayout/desktopLayout/referenceIdentity; декоративные entity header artwork rules и serif headings в freakIdentity/listeningExperience/referenceIdentity; page-specific toolbar/filter/row/card/modal styling; unused legacy details-panel grid declarations для старой правой панели. Now Playing фактически открывается в ListeningDialog и не резервирует колонку AppShell. Palette variables и некоторые общие root overrides в mobileIdentity относятся к текущим темам и предыдущим фазам; весь theme CSS в Phase 2 не очищался.

## Scroll model

AppShell и main не скроллятся: оба ограничены viewport/grid. Topbar, primary navigation и Settings остаются на своих местах.

- Sidebar: playlist-scroll занимает остаток высоты и использует overflow-y:auto. Scrollbar появляется только при переполнении. Sources имеет независимый небольшой overflow area при множестве папок; это соседняя область, не вложенный scroll внутри playlist-scroll. Весь sidebar не прокручивается.
- Home/Downloads: один page-level vertical scroll. Embedded TrackList на Home сохраняет существующее overflow-visible поведение.
- Library/Queue/History/Playlist: outer page — flex column без scroll; прокручивается существующий track-scroll. TrackList, rowHeight, overscan, callbacks и виртуализированная геометрия не менялись.
- Albums/Artists/Playlists grid: scroll остаётся в существующем EntityGrid.
- Search: persistent host сохранён. Его существующий local virtual list и expandable Soulseek section продолжают управлять своими scroll boundaries; Phase 2 не перестраивает содержимое Search.
- Lyrics/visualizer/settings/modals: сохраняют собственные scroll contracts внутри выделенного места или overlay.

## QA

Headless Chrome, реальные React/Vite modules и CSS, simulated Tauri IPC. Fixture: 1500 tracks, 120 playlists, 3 sources. Скриншоты и geometry: `qa-output/phase2-shell/`.

| CSS viewport | Expanded main | Collapsed main | Player area | Результат |
|---|---|---|---|---|
| 1280×720 | 1050×598 | 1210×598 | 116 px | PASS |
| 1920×1080 | 1690×958 | 1850×958 | 116 px | PASS |
| 2560×1440 | 2330×1318 | 2490×1318 | 116 px | PASS |
| 1000×640, практический компактный минимум | Проверен collapsed | 930×518 | 116 px | PASS |

Проверены: navigation Home/Search/Playlists/Albums/Liked/Library/History/Queue/Downloads/Lyrics; playlist detail и Back; Settings и Now Playing dialog; collapse через keyboard, сохранение после reload, Tooltip и accessible labels; активный Tools route; независимый scroll 120 playlists; переход виртуализированного списка к track 1500 при менее 100 DOM rows; Home scroll; отсутствие document horizontal overflow и overlap main/player; drag resize sidebar/player и reset; normal 170 ms transition и reduced motion; Escape/focus return Tools.

Windows scaling оценён через effective CSS viewport для физического 1920×1080: 100%=1920×1080, 125%=1536×864, 150%=1280×720. Все три PASS. Это моделирование логической геометрии, а не проверка OS DPI/Tauri WebView на физическом устройстве. Например, физическое 1280×720 при 150% даёт примерно 853×480 CSS px и находится ниже проверенного практического минимума; acceptance для такого размера не заявляется. Maximized geometry покрыта заданными viewport, реальный Windows maximize не проверялся.

`npm run test:frontend`: 170/170. `npm run test:regression`: PASS. `npm run build`: PASS. Phase 1 browser QA: PASS. `git diff --check`: PASS; присутствуют Git warnings о CRLF в старых файлах. Rust не менялся в этой фазе и заново не проверялся. Audio/network/реальные файлы fixture не используются; browser QA не подтверждает работу native playback или установленного executable.

## Следующие фазы

Внутренний redesign Player, страниц, rows/cards/modals; очистка соответствующих legacy CSS; отдельное принятие на установленном Windows/Tauri приложении при реальном DPI. Эти задачи не выполнялись в Phase 2. Phase 3 не начата.
