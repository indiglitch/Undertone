# Undertone — Phase 9: Lyrics

Выполнена только Phase 9. Phase 10 не начата. Исходное состояние: `qa-output/phase9-before`; сторонние изменения и Phase 1–8 сохранены.

## Архитектура и изменения

1. **Текущая architecture.** App загружает текст текущего трека через прежний `track_lyrics`, а explicit lookup — через `fetch_track_lyrics`. Native `lyrics.rs` читает sidecar LRC/embedded text, хранит plain или timestamped lines в существующих lyrics/lyric_lines, защищает manual overrides. `external_lyrics.rs` отвечает за cache и сохранение результата; единственный действующий external provider — LRCLIB. BulkLyricsJob выбирает существующий AllLibrary worklist, работает на worker, хранит counters/current/cancel state в RAM. Новая database/provider/download system не создана.
2. **Канонический LyricsView.** Единственный public presentation component — default LyricsView; отдельный exported LyricsRenderer заменён прямым использованием LyricsView в существующем NowPlayingPanel. API: track, lyrics, loading, position в секундах, optional onSeek, status/error, lookupAvailable/onLookup, retryAfter, compact, showHeader, optional controlled following/onFollowingChange. Без header можно использовать обычную readable typography внутри будущего overlay; compact служит текущей панели. Сам полноразмерный Now Playing не реализован. Layout/navigation/controls текущего NowPlayingPanel не переделывались.
3. **Synced behavior.** Один active line определяется timestamp_ms относительно playback position, marked aria-current. Active — restrained purple; adjacent — secondary, остальные muted. Без row cards/word karaoke. Auto-follow центрирует строку только внутри lyrics-scroll, не двигает страницу/родителей. Native smooth scroll при обычной motion, instant positioning при reduced motion. Wheel/touch/scrollbar/scroll keys приостанавливают follow на 4 секунды и прерывают текущий smooth scroll; компактное «К текущей строке» возвращает follow/focus. Click вызывает один seek в timestamp_ms / 1000. Без seek callback текст остаётся readable, а action return фокусирует scroll container.
4. **Plain behavior.** Полный preformatted text, pre-wrap/overflow-wrap, 20 px / 1.65, max width 720 px; compact — 16 px. Нет fake timestamps/active line. Обычный независимый scroll.
5. **Empty/error behavior.** Compact loading, explicit searching, no current, «Текст не найден», ambiguous и error states. Find/Retry только при доступном existing lookup; retry_after блокирует преждевременное повторение и показывается понятное время. Network/provider unavailable/malformed response/rate limit/local read-write ошибки имеют безопасный copy; stack trace не выводится. Unknown cached temporary errors показываются как generic provider error, не как no match. При existing document ошибка не скрывает сохранённый текст. App сохраняет существующую stale-request protection; успешный lookup обновляет has_lyrics availability в library snapshot и cached reopen остаётся доступным после закрытия страницы. После bulk completion/cancel refresh локального library snapshot отражает сохранённые тексты.
6. **Provider behavior.** LRCLIB сохранён: HTTPS, redirect disabled, connect timeout 3 s, request timeout 6 s, max attempts 2, response limit 1 MiB, existing metadata/duration matching и ambiguity policy. Новые сервисы/fallback не добавлялись. Fresh temporary replies теперь передают error_kind; malformed JSON/oversized response отличаются от transport failure, HTTP unavailable — от no match, rate-limited replies имеют отдельный safe UI. Чтение response body с ошибкой остаётся network failure.

В этой фазе выявлен реальный rate-limit timing defect: bulk вычитало Unix seconds из retry_after, и после медленного ответа/пересечения секундной границы delay мог исчезнуть. Детерминированный test с 1100 ms provider delay + Retry-After 1 s воспроизвёл проблему до исправления. Теперь fresh result передаёт retry_delay_seconds, bulk ждёт через Instant relative delay, а runtime cache записывает retry window после receipt ответа с безопасным округлением seconds. Test clock остаётся injectable в том же implementation для deterministic cache tests. До/после: `qa-output/phase9-rate-before.log`, `phase9-rate-after.log`.

7. **Cache/storage.** Прежние таблицы и persistence сохранены, schema migration не добавлена. Successful lookup/plain/synced/local/manual повторно используются; открытие страницы вызывает local read, а не external lookup. Negative cache policy сохранена: not-found 7 дней, ambiguous 2 дня, temporary default 5 минут с bounded retry-after. Runtime timestamp теперь привязан к ответу, не началу длительного запроса. Good local/manual text не перезаписывается молча. Forced refresh/replace API отсутствует, поэтому новый misleading Refresh/Replace action не создан. Error-kind не сохраняется отдельной migration; cached temporary error может быть менее детальным, чем fresh response.
8. **BulkLyrics presentation.** PageHeader, короткое описание, primary «Проверить библиотеку», existing maximum count selector, progress/current/processed/total/remaining, cooperative Stop. Удалён debug/guide двухколоночный layout, включая старую copy о recent downloads. Scope — только AllLibrary. Counters отражают текущий выбранный worklist, не полный inventory уже имеющихся текстов: total, local_existing, found (уже сохранено backend), skipped/cache, not_found, ambiguous, errors. Отдельного fake «скачано» counter нет. UI остаётся responsive через прежние async IPC/poller/worker. Cancel прекращает следующие requests; уже выполняющийся запрос завершается согласно existing backend semantics.
9. **Ambiguous/problem-track flow.** Existing progress DTO расширен real problem details {track id/title/artist, status}, без новой БД/history. Rows: not_found/ambiguous/failed, filters через canonical Tabs, virtualized compact utility list 64 px. Это не второй музыкальный TrackList. Native RAM ограничена 200 entries каждого статуса (до 600), omitted count остаётся видимым; большой not-found bucket не вытесняет ambiguous/failed. Native test проверяет сохранение minority status после заполнения cap. Action «Открыть альбом» использует реальный local album ID; не запускает playback. LRCLIB/backend возвращает ambiguous status без candidate DTO/selection API, поэтому fake candidate chooser/Resolve/подтверждение heuristic match не создано. Per-row forced retry также не изображает обход negative cache.
10. **Legacy CSS cleanup.** Sole owner body + management presentation: LyricsPresentation.css. Удалены **224 selector occurrences** старых lyrics-screen/scroll/synced/plain/indexer/guide/view rules и конфликтующих размеров/spacing/typefaces из legacy styles. Shared mixed rules остальных экранов сохранены. Player control .player-lyrics, TrackList lyrics availability и shell topbar route geometry остаются у своих owners. Нет !important, global override layer, gradient/glass/waveform в новой presentation. Используются существующие tokens/PageHeader/Button/Tabs/Tooltip; читаемый UI font вместо декоративного serif.

## Before / After

| Before | After |
| --- | --- |
| LyricsView page wrapper + отдельный public LyricsRenderer API | Один public LyricsView с compact/showHeader для прямого embed |
| scrollIntoView мог двигать родительские containers | scrollTo только собственного lyrics-scroll, current около центра |
| Manual suppression не имела return action/visible state | Four-second follow pause, return button, controlled follow API |
| Smooth scroll не прерывался явно manual input | Wheel/touch/keys прерывают текущий animation и suspend follow |
| No-lyrics без lookup/error presentation на странице | Loading/searching/empty/ambiguous/errors + existing explicit lookup |
| В panel был отдельный fetch button вне renderer | Lookup/status/error входят в canonical view |
| Read/fetch error мог попадать в generic raw App error | Lyrics-specific safe messages и stale-response guard |
| Closing newly fetched text мог снова отключить lyrics button | Saved has_lyrics учитывается через актуальный library snapshot |
| Bulk completion не обновлял library availability | Existing refresh вызывается после completion/cancel |
| Temporary errors не различали response/transport | Fresh typed error_kind и safe provider/network/malformed/rate/storage copy |
| Retry window начиналось до медленного provider call | Runtime receipt clock; deterministic injected clock для tests |
| Bulk delay зависел от округлённых epoch seconds | Relative retry_delay_seconds + monotonic Instant; before/after regression |
| Debug-style indexer main/guide surfaces | Compact desktop utility, canonical controls, реальный progress/counters |
| Только totals, без problem row данных | Existing progress содержит bounded per-status problem details |
| Не было фильтруемого problems list | Compact virtualized rows, status Tabs, реальная album navigation |
| Много legacy lyrics CSS owners, giant fonts/boxes | LyricsPresentation.css, readable widths/line-height, 224 retired selectors |
| HTTP mocks имели общий 500 ms budget | Ordinary mock budget 2 s/listener 10 s; dedicated timeout case явно сохраняет 500 ms |
| Source tests проверяли удалённые renderer/classes | Assertions обновлены на canonical component; behavior tests сохранены/расширены |

## QA и границы

11. **Короткий QA.** `scripts/phase9-lyrics-qa.cjs` запускает настоящий App/usePlayer/LyricsView/BulkLyricsPoller в Chrome с synthetic Tauri IPC. Проверены synced active/center, plain full text, no lyrics, unavailable/network/malformed/local-storage/no-match/ambiguous, manual scroll + return, native smooth interruption/reduced motion, exact single seek, stale answer after track switch, cached reopen без нового external lookup, bulk run/problem filters/cancel и existing panel embed. Synced/plain/error states/Bulk проверены на **1280×720, 1920×1080, 2560×1440**, horizontal overflow/page errors отсутствуют. Screenshot examples просмотрены: synced-1280, bulk-1920; embed имеет transparent lyric rows и reuse canonical component.

- `npm run test:frontend`: **158 passed, 0 failed**.
- `npm run test:regression`: PASS.
- `npm run build`: PASS (TypeScript + production Vite).
- `git diff --check`: PASS.
- Native portable + external-lyrics final parallel run: **50 library + 5 binary tests passed, 1 hardware smoke ignored**.
- Default AI + external-lyrics `cargo check`: PASS.
- Native tests используют настоящий SQLite/local lyric storage и loopback HTTP provider mocks: cache reuse/manual protection, timeout/rate/bad response, bounded real job problems/counters/cancel. Live LRCLIB, physical audio и installed executable не проверялись.

При первом parallel native run ordinary HTTP cache mock с 500 ms budget один раз вернул temporary error. Targeted/serial проверки прошли; обычным mock responses увеличен тестовый запас, dedicated timeout test сохраняет прежний 500 ms threshold. Production timeout не менялся. Отдельный последующий rate-limit failure оказался реальным timing defect и был воспроизведён/исправлен. Финальный parallel suite проходит.

`qa-output/phase9-preserved-components.json` подтверждает byte-identical Home, Search, Queue, canonical TrackList/Entity system, player.tsx, AppSettings/ContextMenu, tokens/primitives. NowPlayingPanel менялся только для canonical embed/state props. Exhaustive QA предыдущих фаз не выполнялся. Пользовательская БД/музыка не изменялись.

Results/screenshots: `qa-output/phase9-lyrics/`. Logs: phase9-frontend.log, phase9-regression.log, phase9-build.log, phase9-browser.log, phase9-backend-final.log, phase9-default-check.log. CSS audit: phase9-css-removed.json.

12. **Намеренно оставленные backend/provider ограничения.** Нет exposed ambiguous candidates/selection; нет forced refresh/replace хорошего текста; cached error reason не имеет новой persisted schema; single lookup не имеет abort IPC (late UI responses отсекаются), bulk cancellation cooperative. Problem details относятся к последнему in-memory run, capped per status; persisted full job history не создана. Provider fallback и новые сервисы не добавлялись. Timing/timeout/cache проверки детерминированы fixtures, не являются доказательством доступности реального внешнего сервиса. Phase 10 fullscreen Now Playing не реализован.
