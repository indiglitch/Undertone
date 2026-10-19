# Phase 13 — Interaction feedback

Phase 13 завершена. Scope: feedback, безопасный transient Queue Undo, presentation существующих drag gestures, loading/focus/microstates. Phase 14 не начата. Начальный аудит: [PHASE13_FEEDBACK_AUDIT.md](PHASE13_FEEDBACK_AUDIT.md).

## 1. Canonical feedback architecture

- `src/feedback.ts`: одна typed store/API `notify`, `feedbackError`, `dismissFeedback`; `info / success / warning / error`. Максимум 3 карточки, одинаковые сообщения coalesce, без persistent history/database.
- `src/ToastHost.tsx` + `src/Feedback.css`: один host из `main.tsx`, компактный near-black surface, одинаковая геометрия и restrained semantic icon.
- Обычные info/success 3500ms, error 7000ms, Undo 10000ms. Hover и keyboard focus приостанавливают remaining lifetime. У action есть synchronous pending guard; старый Undo disabled с keyboard-accessible объяснением.
- Все сообщения polite `role=status`, `aria-atomic=true`; assertive не используется, поскольку интегрированные ошибки не требуют экстренного прерывания. Progress updates scan/bulk/updater не озвучиваются непрерывно.
- Desktop: справа снизу выше фактического `getBoundingClientRect()` Player; нет hardcoded116px. ResizeObserver/viewport resize и shell style changes обновляют placement.
- Стабильный portal node переносится в последний open native dialog: существующие Toast и их remaining timers сохраняются. Now Playing использует нижний правый край видимого client area. В generic dialogs placement ищет свободную боковую/верхнюю полосу; для большого Settings на1280 использует область под header, без перекрытия close/footer controls.

## 2. Где Toast используется

Подтверждённые create/edit/add/remove/delete playlist mutations; существующие Play Next/Add to Queue notices; Queue remove/clear+Undo; clipboard/copy cover; Explorer success; file move/remove success и operation failures; scan completion/trigger failure; ContextMenu transient errors; существующий export feedback через тот же canonical API.

Успех collection mutation появляется только после resolve результата. `MenuRun` не превращает exception в success, не сообщает success при явном false. `enqueue`/`enqueueGroup` возвращают факт принятия действия, сохраняя порядок группы и прежние busy guards.

Намеренно НЕ используются Toast: Play/Pause/Next, Favorite с видимым toggled state; Settings validation/updater inline status/progress; PhoneSync inline error/state; LyricsView provider/cache/error/найденный текст; bulk progress/results; folder-specific inline messages/error. Хорошие inline сообщения сохранены. Ошибка видимой playlist/action формы остаётся в форме.

## 3. Undo-supported actions

Queue upcoming remove, multi-remove, clear upcoming. До действия сохраняются displayed queue/cursor, canonical occurrence sequence и sourceIntact. После Undo восстанавливаются те же occurrence keys, duplicates, порядок и положение относительно current. Audio command/history/current/position не изменяются.

Каждый `updateQueue` увеличивает revision. Undo возможен только на той же revision и без pending playback command. Enqueue/reorder/jump/new playback/shuffle/order change/deleted-track reconciliation отключают старый snapshot. Повторный Undo одного snapshot невозможен. Seek/pause busy временно блокируют действие. Любое изменение очереди консервативно инвалидирует Undo; попыток угадывать merge нет. Queue clear больше не требует confirmation, поскольку имеет проверяемый Undo.

## 4. Где Undo отсутствует

- Playlist RemoveEntry удаляет исходный entry ID. AddTracks создаёт новые IDs в конце; MoveEntry не восстанавливает удалённую occurrence. Backend не предоставляет exact restore-entry API. Fake Undo не добавлен, прежняя semantics сохранена.
- Trash move сообщает destination, но не имеет достоверного restore API с path/collision reconciliation. Confirmation сохранён.
- Remove from library удаляет связи playlist/history/likes; точного восстановления API нет. Confirmation сохранён.
- Delete playlist не имеет exact восстановление плейлиста/entries: confirmation сохранён.
- Folder source removal остаётся существующей операцией с явным inline результатом. Новая история/restore schema не добавлена.

## 5. Drag presentation system

`src/interactionFeedback.css`: canonical `--drag-source-opacity:.55`, `--drag-valid:var(--accent-violet)`, `--drag-invalid:var(--danger)`, `--drag-insertion-width:2px`.

Source узнаваем и приглушён; valid accent, invalid subtle danger/not-allowed; локальная конкретная insertion line вместо whole-row outline. Queue и Playlist используют одну CSS/markup presentation. Track → Playlist имеет компактный single-track ghost с названием, без group count: существующий gesture переносит один track. Valid feedback выбирает локальную row/header/card/sidebar target, не обводит всю страницу. Player customization использует те же tokens.

Ghost: nearest-open-dialog portal сохранён, body fallback применяется только вне native dialog. Существующие threshold/pointer ownership/capture/escape/cancel/reorder/edge autoscroll algorithms не переписаны. Grab/grabbing ограничены affordances/active gestures, not-allowed только фактически invalid target.

## 6. Loading / busy

Canonical Button принимает `busy`/`busyLabel`, автоматически disabled/aria-busy и резервирует обе label widths в одной grid cell. Переход idle→pending не меняет размеры.

Synchronous ref guards поверх существующего pending state: PlaylistEditor submit, action form submit, manual scan trigger, folder picker/remove, Lyrics lookup, bulk start/cancel, updater check/install, deleted-folder picker, PhoneSync toggle. Не добавлен transaction engine; native/RPC contracts прежние. ScanStarting сразу блокирует связанные rescan controls, позже виден существующий scan progress. Создание плейлиста с partial add retry сохраняет созданный ID.

## 7. Focus / microstates / Tooltip

Toast не получает focus автоматически. Action доступен через Tab; hover/focus паузят timeout. Action/dismiss возвращают connected visible origin или видимую grid/control внутри активного dialog. Focus cleanup при вытеснении карточки не перехватывает новую navigation. Disabled Undo имеет explanation через canonical Tooltip wrapper.

TrackList после удаления active occurrence выбирает ближайшую surviving occurrence вместо первого track; виртуализированный active descendant остаётся mounted. Dialog/menu focus-return contracts Phase12 сохранены. Reorder по-прежнему возвращает focus grid с тем же occurrence key.

Button/IconButton: restrained hover/pressed/focus/aria-pressed/disabled; pressed background без scale bounce. Точечные transitions используют существующий motion-fast, 100–180ms contract; reduced motion отключает Toast animation, Button transition и reorder-neighbor transition. Tooltip delay420ms/viewport-fit/nearest-dialog portal сохранены; disabled wrapper получает keyboard focus и объяснение, disabled button не становится clickable.

## 8. Legacy cleanup и Before / After

Удалены только заменённые old `.toast` rules из styles/glassRedesign/mobileIdentity, old string/timer/render из App, заменённые drag outlines/ghost surface/source-opacity из TrackList и Player owners, лишний drag-hint/favorite success Toast, clear upcoming confirmation. Не добавлены `!important`/global CSS rewrite/new pages.

### Feedback / operations

| Before | After |
| --- | --- |
| `App.tsx`: string Toast,2600ms,центральный bottom115px,legacy3 owners | `feedback.ts`/`ToastHost.tsx`/`Feedback.css` и `main.tsx`: typed bounded host, lifetimes/pause/actions/top-layer/computed Player placement |
| `ContextMenu.tsx`: ошибки через success onNotice; submenu success при undefined после failed mutation | canonical error; confirmed collection success в App; false outcome не получает success |
| `TrackContextMenu.tsx`: favorite notices, разные copy labels, Explorer без feedback | Favorite остаётся видимым state; copy «Скопировано»; Explorer success |
| `App.tsx`: collection success вне unified mutation result; file error в глобальном banner | confirmed mutation notices, transient file error Toast; form errors inline |
| `App.tsx`: rescan/lookup/folder guard только state, completion scan молча | immediate ref guards/scanStarting, один completion/error Toast, progress live off |
| `CollectionView.tsx`: editor/action submit guard только busy; ActionDialog error неявен | synchronous guards; inline operation error; прежний partial-create retry ID сохранён |

### Undo / focus

| Before | After |
| --- | --- |
| `player.tsx`: remove/multi-remove/clear без restore snapshot | revision-checked occurrence/canonical Queue Undo; без audio changes |
| `QueuePage.tsx`: clear confirmation | immediate clear с безопасным Undo |
| `trackContextMenuModel.ts`/`player.tsx`: enqueue результата нет | acceptance boolean для truthful notices, прежние order/duplicates/pending semantics |
| `TrackList.tsx`: удалённый active key→первая row | ближайшая surviving occurrence, прежняя virtualization/selection |
| `Tooltip.tsx`/`Tooltip.css`: disabled button только mouse-hover wrapper | focusable accessible disabled explanation wrapper, disabled action не активируется |

### Drag / controls / pending

| Before | After |
| --- | --- |
| `TrackList.tsx`/`TrackList.css`: whole-row reorder outline, source .4, green/yellow drop feedback | specific before/after insertion, canonical source/accent/danger via interactionFeedback.css |
| `App.tsx`: drag-hint Toast без ghost, target мог обводить track area | компактный single-track ghost и локальный valid/invalid target; gesture contract прежний |
| `SettingsPresentation.css`/`playerControlLayout.css`: отдельные Player source/drop visual rules | общие drag tokens; geometry/persistence/autoscroll сохранены |
| `primitives.tsx`/`primitives.css`: меняющийся label width, scale(.96) pressed | busyLabel reserved geometry, restrained pressed background, typed transitions/toggled/disabled |
| `AppSettings.tsx`: updater/folder picker state-only pending, live download percentages | ref guards, stable pending Button, downloading live off; inline status сохранён |
| `MusicFoldersDialog.tsx`: pending labels без reserved width | canonical busy add/rescan/remove buttons |
| `BulkLyricsIndexer.tsx`: start/cancel state-only guard, status live с counters | synchronous guards, stable start Button, readable non-live continuous progress |
| `PhoneSync.tsx`: state-only toggle guard/label width | ref guard и canonical reserved busyLabel |

## 9. Короткий QA

- `npm run test:frontend`:158/158 pass.
- `npm run test:regression`:pass, включая новую Phase13 проверку exact duplicate/multi Undo, shuffled clear+canonical restore, zero extra audio IPC, invalidation enqueue/new playback, queue без current. Прежние queue5000/remove/group/mode и shared seek/volume regressions проходят.
- `npm run build`:TypeScript/Vite production pass.
- `git diff --check`:pass; только имеющиеся LF/CRLF conversion warnings.
- `scripts/phase13-feedback-qa.cjs`:Chrome/Playwright real App с synthetic Tauri IPC; только1280×720 и2560×1440. Success/error, action+timeout, hover/focus pause, Queue remove/clear+Undo с duplicates, stale action disabled, Queue/Playlist reorder/insertion, Track→Playlist valid/invalid/ghost/drop1request, Player valid/invalid drag, generic/fullscreen layering, actual Player resize placement, focus/no horizontal overflow, reduced-motion и100–180ms duration.
- Дополнительно: rapid CreatePlaylist двойной requestSubmit→1RPC; failed form inline без Toast; updater/rescan/bulk/lookup repeated clicks→1RPC; pending button width stability; scan completion; disabled Tooltip keyboard объяснение без activation.
- Evidence: `qa-output/phase13-feedback/results.json`, screenshot files в той же папке. Screenshot inspection: desktop Toast,1280 Settings placement,2560 fullscreen,Player invalid иQueue insertion.

Граница проверки: synthetic IPC не доказывает реальный Explorer/clipboard/file move/updater install/network provider/scanner/audio hardware. Реальные пользовательские файлы не перемещались; native backend/schema не менялись. Rust/native package/installed executable/physical screen reader QA и exhaustive previous phases не выполнялись. Production build здесь frontend; запущенный ранее Windows executable не обновлялся в рамках Phase13.

## 10. Оставлено Phase 14

Решение о необходимости Player resize; volume persistence при native restart/session schema; необходимость exact backend restore-entry/file-restore API; финальный production QA с native/real OS integration и screen reader. Эти решения и работы здесь не выполнялись.
