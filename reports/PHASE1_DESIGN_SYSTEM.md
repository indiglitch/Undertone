# Undertone — Phase 1: аудит UI и design system

Дата: 5 октября 2026. Область: desktop React/Vite UI. Native iOS, backend, IPC-контракты и бизнес-логика не изменены. Страницы целиком не переделывались; Phase 2 не начата.

## Архитектура и вывод аудита

`App.tsx` управляет навигацией, библиотекой, коллекциями, настройками и раскрытым плеером. `CollectionView.tsx` объединяет коллекции, виртуализированную сетку EntityGrid и редактор плейлиста. `TrackList.tsx` уже является общим виртуализированным списком. `ContextMenu.tsx` уже разделяет позиционирование, секции, пункты и подменю. Их не требуется дублировать.

Порядок CSS в `main.tsx`: styles → uiPolish → phase3d16 → playerControlLayout → playerPolish → settingsPolish → glassRedesign → playerFreeLayout → desktopLayout → mobileIdentity → listeningExperience → freakIdentity → referenceIdentity. Стили отдельных компонентов добавляются через их импорты. Значительный объём правил остаётся в каскаде, включая `!important`. Новые токены загружаются перед этими файлами, scoped-стили примитивов — после них. Общие объявления токенов удалены из четырёх старых `:root`; файлы продолжают отвечать за существующие layout и оформление страниц.

| Категория | Найденные повторения и расхождения | Решение Phase 1 / оставшаяся работа |
|---|---|---|
| Кнопки | Native buttons повторяют primary/subtle/text/icon стили в App, CollectionView, DesktopHome, NowPlayingPanel, SoulseekSettings. `desktopLayout.css` задаёт 40 px, а `referenceIdentity.css` уменьшает Home actions до 32 px и Settings/PhoneSync до 34–36 px. | Button и IconButton заменяют контролы редактора плейлиста. Остальные вызовы мигрировать отдельно. |
| Input / search | Home `.reference-search`, unified-search form, `.playlist-filter`, `.settings-fields input`, `.path-input`, `.custom-color-controls`; высоты 34/36/40/44 px, разные рамки и focus. | Input в редакторе; SearchInput в фильтре плейлиста. Формы поиска и настройки остаются в очереди. |
| Tabs / navigation | NowPlayingPanel имеет tablist; LibraryNavigation — nav с aria-current; SoulseekSettings — вертикальная навигация разделов; palette options — group с aria-pressed. | NowPlayingPanel использует Tabs. Навигацию библиотеки и настроек нельзя механически превращать в ARIA tabs: у них другой контракт. |
| Rows | TrackList; `.panel-queue-track` в NowPlayingPanel; `.recent-list-row` в DesktopHome; `.download-item` в DownloadManager; Soulseek result rows. | TrackList сохранить как базу для треков. Queue/recent/download/remote требуют общей визуальной основы с сохранением различий поведения. |
| Cards | EntityGrid в CollectionView, album cards/shortcut cards/feature в DesktopHome, settings cards, collection signature, download cards. | Использовать общие surface/radius/border/shadow tokens при будущей миграции; новый Card в Phase 1 не добавлен. |
| Modal | PlaylistEditor и ActionDialog в CollectionView; folder dialog в App; ListeningDialog; TrackMetadataDialog; MoveTrackDialog; SoulseekSettings. Различаются заголовки, padding, закрытие по backdrop и размеры. | Подготовлены токены и контролы. Общий Modal shell ещё предстоит выделить, сохранив focus, Escape, backdrop и формы. |
| Typography | `.track-titles`, `.panel-queue-track strong`, `.recent-list-row strong`, album card titles повторяют 13–14 px; подписи разбросаны между 9–14 px. Home сохраняет декоративные serif headings из identity CSS. | Семь ролей типографики; PageHeader уже использует Page title и Secondary. Декоративные заголовки остаются явным предметом будущей миграции. |
| Hardcoded colors | `#c18cf5` повторяется в referenceIdentity; backgrounds `#050506`, `#09070d`, `#100d15`; цвета focus заданы отдельно в styles/uiPolish/glass. Цвета swatches в SoulseekSettings и palette generation в colorPalette — данные тем, а не случайный UI-стиль. | Базовые роли принадлежат designTokens.css. Локальные правила страниц пока остаются, включая global focus старых контролов. Динамические палитры сохранены. |
| Spacing / radius | `--space-5` ранее был 24 px в uiPolish и 20 px в glass. Radii sm/md/lg: 7/10/14 → 9/14/20 → 8/12/16. Локальные gaps 7/9/10/11/14/18, радиусы 6/7/9/10/11/13/14/17. | Единственный общий spacing/radius источник. Локальные значения страниц мигрировать по участкам; размеры artwork, виртуализации, progress bars не округлять автоматически. |

`PHASE1_UI_INVENTORY.json` содержит статический снимок оставшегося CSS: 1237 цветовых литералов, 38 разных записей border-radius, 274 записи spacing и 44 записи font-size. Это подсчёт строковых значений в CSS верхнего уровня `src/`, после изменений Phase 1, без designTokens/primitives. Он включает media queries, старые переопределения, градиенты, theme values, `0`, `inherit` и `var(...)`; это не число визуальных дефектов или уникальных вычисленных значений. Учитываются padding/margin/gap shorthand, height/min-height всех элементов, а не только контролов. Inline geometry в виртуализации и динамические theme colors требуют отдельной интерпретации.

## Изменения

| До | После |
|---|---|
| Токены распределены по uiPolish, glassRedesign, desktopLayout, referenceIdentity. | `src/designTokens.css` — один источник общих токенов; старые имена сохранены для постепенной замены. `src/main.tsx` подключает tokens и primitives. |
| Native buttons/input редактора повторяли локальную стилизацию. | `src/primitives.tsx`: Button, IconButton, Input; PlaylistEditor использует их с прежними обработчиками и submit payload. |
| Playlist filter вручную повторял search icon/input/clear. | SearchInput заменяет эту реализацию в CollectionView; query, фильтрация и счётчик сохранены. |
| NowPlayingPanel создавал отдельные tab buttons. | Tabs контролируется прежним selected/setTab, сохраняет panel IDs и disabled; добавлены roving tabindex, Left/Right/Home/End и пропуск disabled вкладок. |
| Tooltip имел собственные цвета, padding и shadow; перезаписывал aria-describedby. | Существующий `src/Tooltip.tsx` сохранён; `Tooltip.css` использует токены; доступное описание дополняется tooltip ID. |
| Sidebar divider был локальным div без семантики. | Divider в App использует общий border token и role=separator. |
| PageHeader имел локальные размеры title/subtitle. | PageHeader использует Page title и Secondary; страницы сохраняют свою структуру. |
| Общий ui.tsx экспортировал только Cover. | Тот же вход экспортирует примитивы и существующий Tooltip; второй Tooltip или Cover не создан. |
| UI-polish тест ожидал объявления токенов в старом CSS. | `src/uiPolish.test.ts` проверяет перенесённые объявления в designTokens.css; добавлен браузерный сценарий `scripts/phase1-ui-qa.cjs`. |

## Tokens

| Роль | CSS token / значение |
|---|---|
| Spacing | space-1…space-6: **4 / 8 / 12 / 16 / 24 / 32 px** |
| Page title | font-page-title: 550, 28 px, line-height 1.2 |
| Section title | font-section-title: 600, 20 px, 1.3 |
| Row title | font-row-title: 600, 14 px, 1.4 |
| Body | font-body: 400, 14 px, 1.5 |
| Secondary | font-secondary: 400, 13 px, 1.5 |
| Metadata | font-metadata: 400, 12 px, 1.4 |
| Caption | font-caption: 400, 11 px, 1.4 |
| UI font | font-ui: Segoe UI / system-ui / sans-serif |
| App background | bg-base: #050506 |
| Elevated surface | surface-raised: #202027 |
| Secondary surface | surface-secondary: #09070d; surface-panel: #100d15 — совместимое имя для существующих панелей |
| Hover / pressed | state-hover: white 7%; state-active: white 12% |
| Selected | state-selected: accent-violet 18% |
| Border subtle / strong | border-subtle: #303039; border-strong: #464657 |
| Text primary / secondary / muted | text-primary #eeeaf2 / text-secondary #ada5bb / text-muted #8e869e |
| Accent / text on accent | accent-violet #c18cf5 / text-on-accent #150b20 |
| Destructive / warning / success | danger #ff788e / warning #efc16c / success #7edbc1 |
| Focus | focus: var(--accent-violet), outline 2 px + offset 2 px |
| Radius | radius-sm/md/lg/xl: 8/12/16/24 px; radius-pill: 999 px |
| Border | border-width: 1 px; border-default: solid border-subtle |
| Shadows | shadow-card / shadow-card-hover / shadow-panel / shadow-popover; определения в designTokens.css |
| Control height | control-height-sm/md: 40 px; control-height-lg: 48 px. sm уменьшает текст, сохраняя hit area. |
| Icons | icon-sm/md/lg: 16/20/24 px |

CSS tokens используются напрямую через `var(...)`. Typography utility classes: `ds-text-page-title`, `ds-text-section-title`, `ds-text-row-title`, `ds-text-body`, `ds-text-secondary`, `ds-text-metadata`, `ds-text-caption`.

Button variants: primary/secondary/ghost/destructive; sizes: sm/md/lg. Button по умолчанию `type="button"`; формы явно задают submit. IconButton требует aria-label. Input передаёт native attributes, ref, label связи, aria-invalid, disabled и callbacks; предназначен для текстовых/числовых полей. Checkbox, color, range и select не мигрированы. SearchInput — контейнер поля, не form; onClear и trailing children опциональны. Label передаётся через aria-label. Tabs — controlled компонент для настоящего tablist; владелец создаёт panel с id/aria-labelledby, переданными через items. Tooltip остаётся существующим портальным компонентом. Divider поддерживает horizontal/vertical.

## Как продолжать миграцию

Мигрировать контрол или общий участок, сразу удаляя соответствующий локальный markup/CSS. Не добавлять ещё один stylesheet с глобальными переопределениями и не размножать компоненты для отдельных страниц. Нативные focus/disabled/submit/drag/context-menu contracts и виртуализированные размеры сохранять. Для modal/row/card сначала выделить общий визуальный shell из перечисленных текущих реализаций, затем переводить потребителей небольшими группами.

Осталось: кнопки плеера/Home/Settings/контекстных меню, Home и unified SearchInput, поля настроек и остальные типы форм, navigation styling, rows/cards/modal shells, повторяющийся текст, local colors/spacing/radii/shadows и устаревшие CSS identity overrides. Палитры и decorative/artwork/visualizer значения проверять отдельно от базовых UI roles.

## Проверка

- `npm run build`: TypeScript и production Vite build прошли.
- `npm run test:frontend`: 170/170.
- `npm run test:regression`: поиск, очередь, восстановление позиции, недоступные файлы и импорт прошли.
- `git diff --check`: прошёл; Git предупреждает о нормализации CRLF в ранее изменённых файлах.
- `scripts/phase1-ui-qa.cjs`: headless Chrome с реальными Vite модулями/CSS; проверены button type/click/disabled, controlled input/search clear, tab keyboard/focus/disabled/panel, Tooltip description/Escape, hit area ≥40 px, наследование accent. Затем в App с имитацией IPC проверены payload создания плейлиста, переход в плейлист, search clear, PageHeader и Divider. Page errors отсутствуют.
- Скриншоты `qa-output/phase1-primitives.png` и `qa-output/phase1-app.png` просмотрены. Проверка браузера с mock IPC не подтверждает работу native audio, сетевых загрузок или установленного Tauri-приложения. Rust не менялся и не проверялся заново.

Phase 1 завершена. Phase 2 не выполнялась.
