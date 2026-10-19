# Undertone — Final Visual Calibration Pass

Только визуальный масштаб и композиция desktop. Phase 15 не создавалась.

| Область | Before | After |
|---|---|---|
| Геометрия страниц | Page width 1400, TrackList 1440 | Page width 1840, таблицы до 2048; адаптивные боковые отступы 24–32 |
| Таблицы | Ограниченная область Title/Album | Расширяется Title/Album; технические колонки и высота строк сохранены |
| Иерархия | Один масштаб для desktop | Умеренно адаптивные заголовки 28–34, секции 20–23, body/rows 14–15; category tabs до15 |
| Контраст | Приглушённые данные и sidebar labels | Вторичные данные таблиц и sidebar labels читаемее |
| Favorite controls | Purple surface вокруг активного сердца | Акцентный glyph без постоянной заливки; спокойное неактивное состояние |
| Home | Search и random action отдельными широкими полосами | На wide desktop два соседних элемента, больше межсекционного воздуха |
| Search | Слабая empty-query композиция | Header/control scale, ограничение input до1280, существующие recents с разделителем и отступами |
| Playlists | Четыре карточки с обычным шагом | На wide desktop четыре карточки с gap32 и более весомыми названиями, слева; artwork224 |
| Entity cards | Высота300, title40 | Высота308 внутри прежней virtual row324, title42 для двух строк |
| Bulk Lyrics | Utility block, progress до900 | Header, controls band, progress/results до1440, более читаемый description |
| Bottom Player | Мелкая identity/seek metadata | Cover до52, transport до840, desktop icons22, контраст/типографика; высота104 |

## Измеренная ширина Library

| Viewport | Before | After |
|---|---:|---:|
| 2160x1440 | 1440 px | 1876 px |
| 1280x720 | 1002 px | 1002 px |
| 1920x1080 | 1440 px | 1642 px |
| 2560x1440 | 1440 px | 2048 px |

## Проверка

- 52 screenshots before +52 after: Home, Search, Playlists, Albums, Favorites, Library, History, Queue, Bulk Lyrics, Settings, Lyrics, Fullscreen Now Playing и его Next tab.
- Viewports 1280×720,1920×1080,2160×1440,2560×1440; основной просмотр2160×1440.
- Нет document horizontal overflow; Player104px на всех четырёх viewport.
- Frontend tests156/156, production frontend build PASS, git diff --check PASS (только обычные CRLF warnings).
- Settings geometry и Fullscreen Now Playing не редизайнились. Album artwork не увеличивался.
- TrackList/EntityGrid virtualization, бизнес-логика и архитектура не изменялись. Новых product components/CSS layers нет.
- Это production frontend assets с изолированным mocked native IPC, не новое native executable. Большой QA не запускался.

[Before/after gallery](../qa-output/visual-calibration/index.html) — шесть запрошенных страниц на всех четырёх viewport.
