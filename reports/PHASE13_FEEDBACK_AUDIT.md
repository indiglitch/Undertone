# Phase 13: аудит feedback до изменений

| Область | Текущее состояние | Решение |
| --- | --- | --- |
| Playlists | MenuRun сообщает успех даже при undefined после failed mutate; editor inline validation; RemoveEntry удаляет ID, AddTracks создаёт новый ID в конце | единый success после подтверждённого mutate; inline editor error сохранить; точный Undo невозможен без backend restore-entry |
| Queue | remove/multi-remove молча, clear confirmation; occurrence keys сохранены | transient exact snapshot displayed/canonical queue, Undo до следующей queue revision; current не трогать |
| Favorite / player | видимый toggled state, menu дополнительно сообщает favorite | убрать лишний favorite Toast; transport без Toast; player error сохранить |
| Files / Explorer / copy | ContextMenu errors выглядят как success; trash confirmation; restore API отсутствует | canonical error; короткий copy/Explorer success; confirmation и отсутствие fake Undo сохранить |
| Folders / rescan | local folderNotice/error; scan progress, ошибка наверху страницы; completion молча | inline folder errors/progress сохранить; completion Toast; синхронный guard на trigger |
| Lyrics | canonical LyricsView status/error; lookup state guard; bulk state guard | inline presentation сохранить; добавить synchronous pending guards, никаких progress Toast |
| Settings / updater / phone | inline busy labels/errors; повторный click до rerender возможен | guards и устойчивые loading widths; validation/progress inline |
| Drag | источник opacity .4; valid success green, invalid warning yellow; whole-row reorder outline; Player violet/red; Track → Playlist hint Toast без ghost | единые accent/danger/source/ghost/insertion tokens; сохранить algorithms/portal/autoscroll; убрать hint Toast |
| Tooltip | canonical delay420, nearest dialog portal, viewport fit | сохранить; проверить clipping/disabled wrapper/reduced motion |
| Existing toast | один string, центр снизу115px, 2600ms; legacy3 owners; под native dialog | canonical bounded store, typed compact cards, action/pause/timeout, top-layer-aware host, computed Player rect |
| Focus | grid active descendant; deleted active row falls back first; menu/dialog return | nearest surviving occurrence; Undo origin grid fallback; no auto-focus Toast |

Scope: только Phase 13. Native schema/backend/playback transport/new pages не меняются.
