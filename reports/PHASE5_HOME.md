# Undertone — Phase 5: Home

Выполнена только Phase 5. Состояние checkout на начало этой фазы сохранено в `qa-output/phase5-before`; изменения предыдущих фаз и остальные незавершённые изменения сохранены.

## 1. Аудит и итоговая композиция

До миграции DesktopHome содержал native search, Random, два navigation shortcuts, embedded TrackList, отдельный Continue hero, второй список recent из custom rows, custom playlist shortcuts и custom album cards через MediaShelf. Часть этих блоков скрывалась CSS, но продолжала существовать в DOM. Home одновременно оформляли восемь таблиц стилей: менялись размеры controls, heading typography, artwork, borders, gradients и отступы; были конфликтующие `!important`.

Теперь порядок единственный: **Search → Слушать случайное → Плейлисты / Альбомы → Недавно слушали → Твоя коллекция**. Нет greeting, рекомендаций, баннеров или второго recent списка. Действия Добавить музыку, пересканировать, Любимые, Вся медиатека, Создать плейлист и Недавно добавлено собраны в разделе коллекции.

| До | После |
| --- | --- |
| Native search с локальными стилями | SearchInput и IconButton; Enter вызывает существующий global search flow |
| Random 80 px, исторические gradient/glow overrides | 64 px, на 20% ниже; selected surface, accent icon, общий Button |
| Navigation cards 76 px, разные исторические overrides | Одинаковая геометрия около 69 px, body/secondary roles, маленькая secondary arrow |
| Несколько владельцев margins/gaps | Один composition gap 16 px; spacing 4/8/12/16/24 из Phase 1 вместо исторических 18/20/22/26/28 |
| Два recent списка и Continue artwork hero | Один embedded TrackList на пять треков, без технических колонок |
| Current автоматически вставлялся впереди history preview | Preview берётся из history; изменение current не переставляет строки само по себе |
| Playlist buttons с собственными Cover styles | Два уникальных navigation shortcuts ведут в канонические коллекции |
| Custom album-card и горизонтальный MediaShelf | Четыре настоящих EntityCard с EntityArtwork |
| Разные section heading implementations | HomeSectionHeader: section title + secondary action |
| Большие empty boxes и декоративные layers | Короткие notes и действующая кнопка добавления музыки |
| Меню Home без переноса keyboard focus | Первый доступный menuitem получает фокус; Escape возвращает его к album card или TrackList |
| Распределённый legacy Home CSS | DesktopHome.css владеет только композицией; shell/track/entity/primitive owners сохранены |

## 2. Home-specific components

`DesktopHome` — композиция и wiring уже существующих действий. `HomeSectionHeader` — локальный heading pattern. Random и navigation shortcuts — композиционные классы поверх Button; самостоятельной новой card/button system нет. Старый MediaShelf больше не используется Home; файл сохранён как неиспользуемый legacy helper, не является частью нового presentation.

## 3. Переиспользованные canonical components и tokens

SearchInput, Button, IconButton, Tooltip, TrackList, EntityCard и его EntityArtwork; AppShell/MainContent/PlayerArea остаются Phase 2. Canonical tokens и API не расширялись. TrackList internals, EntityGrid virtualization, EntityArtwork, detail pages, player/backend, Settings и Now Playing не редактировались в этой фазе.

Используются spacing 4/8/12/16/24; typography Section title, Row title, Body, Secondary; surface secondary, selected, hover, text primary/secondary/muted, accent, border strong; radius/control heights/icon sizes/pressed/focus/reduced motion берутся из primitives. Единственный фиксированный размер в Home grid — существующая геометрия EntityCard 224 px, а не новый width contract.

## 4. Recently Played preview

До пяти доступных unique tracks из существующей history, в исходном порядке. Embedded TrackList со строками 48 px, artwork/title/artist, hover Play/Pause, current state, favorite и контекстным действием. Album, format, size, duration, year, genre, number выключены через существующий `columns` API. Header TrackList сохранён; отдельная универсальная row/list implementation не создана. «Все» открывает history. Queue/index и playback используют существующий player path; recent selection остаётся локальной UI presentation.

## 5. Collection preview

До четырёх albums из существующей Home album selection, с полным набором tracks каждого album. EntityCard 224×300, EntityArtwork 224×224; official compact variant не понадобился. Open, Play, context работают через прежние navigation/player/menu handlers. «Все альбомы» открывает Albums. Нет отдельного Home artwork loader, album card или playlist preview.

## 6. Legacy CSS

Удалены заменённые Home selectors, включая `.reference-search`, `.reference-random`, `.reference-destinations`, `.reference-recent*`, `.home-overview`, `.home-stat*`, `.home-continue*`, `.home-recent*`, `.home-playlist*`, `.home-shortcuts`, `.listening-feature`, `.feature-*`, `.album-card`, `.album-art`, `.album-section` и старые hero/stats presentation. Mixed selector groups разделены: не относящиеся к Home selectors сохранены. Удалены пустые media blocks в затронутых файлах. Новых `!important`, global override layers или transitions all нет.

Удалённые selector occurrences по файлам:

- `desktopLayout.css`: 34.
- `freakIdentity.css`: 56.
- `glassRedesign.css`: 155.
- `listeningExperience.css`: 49.
- `mobileIdentity.css`: 40.
- `phase3d16.css`: 12.
- `referenceIdentity.css`: 103.
- `styles.css`: 38.

Всего 487 selector occurrences. Полный точный список: `qa-output/phase5-css-removed.json`. `.home-content` width/padding/scroll остаются у desktopLayout; новые композиционные правила только в DesktopHome.css. Общие Track/Entity styles сохранили своих владельцев.

## 7. Responsive desktop

1280×720: Home width 1050 px при expanded sidebar; equal shortcuts, читаемые recent rows, EntityCard сохраняют 224 px, нижняя коллекция доступна через Home scroll. 1920×1080 и 2560×1440: Home width ограничен прежними 1400 px; общий left/right alignment Search/Random/sections. На 1440p видны все верхние секции и коллекция. Preview использует grid auto-fit без уменьшения artwork. Player находится в отдельном shell row, не накрывает последнюю карточку при scroll до конца. Mobile redesign не выполнялся.

## 8. Empty / loading

0 tracks: Random disabled, короткое объяснение и «Добавить музыку» открывает существующий folder dialog. No history: короткая note без пустого table/hero. No playlists: shortcut сохраняется, count 0; создание доступно. No albums: короткая note либо общее предложение добавить музыку. EntityArtwork canonical loading/error/empty states сохраняют геометрию; broken image заменяется fallback. Playback updates сохраняют Home scroll.

## 9. QA

- `npm run test:frontend`: **172/172**, 0 failures.
- `npm run test:regression`: PASS.
- `npm run build`: PASS, TypeScript + production Vite build.
- `git diff --check`: PASS.
- `scripts/phase5-home-qa.cjs`: реальный App в Chrome с synthetic Tauri IPC fixtures: normal, 5000 tracks, empty, nohistory, noplaylists, delayed/broken artwork, playing. Проверены 1280×720 / 1920×1080 / 2560×1440, bounded previews, artwork geometry, отсутствие document horizontal scroll, Home end scroll, current/scroll stability, Search Enter, Random, shortcuts, History All, Albums All, album Open/Play/context, recent Play/context, focus/keyboard/resize. Без page errors, React key warnings и error alerts. Пустой fixture возвращает корректную пустую playback session; пользовательская session не затрагивается.
- Phase 3 browser regression: PASS, 1/20/1000/5000 tracks, geometry/actions/selection/drag/queue/playlist/Home/Search/details.
- Phase 4 browser regression: PASS, 10/100/1000/1500 entities, geometry/virtualization/actions/resize/menus/details.
- Сравнение с локальным baseline подтверждает неизменность TrackList.tsx/css, EntityGrid.tsx, EntityArtwork.tsx, EntityPresentation.css, designTokens и primitives.

Screenshots и машинные результаты: `qa-output/phase5-home/`: `home-1280.png`, `home-1920.png`, `home-2560.png`, empty/nohistory/noplaylists/large/artwork-loading/artwork/playing и `results.json`. Скрипт запускается с абсолютным путём к установленному Playwright и необязательным URL Vite.

Проверки playback относятся к UI callbacks и synthetic IPC, а не к реальному звуку/установленному executable. Native build/deploy не входили в фазу; пользовательская база и музыка не менялись.

## 10. Намеренно оставлено

Phase 6 Search results/Ctrl+K, затем Queue, Downloads, Lyrics, full Now Playing, Settings/Dialogs/ContextMenus и global drag polish остаются будущими фазами. Полная global EmptyState system, artist-photo sourcing и реальный native playback QA не добавлены. К Phase 6 перехода нет.
