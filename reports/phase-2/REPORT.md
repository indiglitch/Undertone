# Undertone 0.2.0 — Phase 2

Реализованы Artists, Albums, Liked Songs, Playlists, Queue, локальный Search, Sorting и Recently Played. Phase 2.5 / Soulseek, lyrics и AI не начинались.

Коллекции добавлены миграцией 003. Лайки, записи плейлистов и история ссылаются на прежние track IDs. Повтор трека в плейлисте и очереди имеет отдельный ID записи. Importer/scanner не дублировались; audio worker, PCM/SRC и MP3 patch Phase 1.5 сохранены.

## DnD

В проверенном Windows release нативный HTML5 drag выдавал dragstart и dragend с dropEffect=none, без dragover/drop; custom MIME и text/plain не решили проблему. Внутренний перенос переведён на pointer events. После порога 6 px захватывается указатель; цель определяется при отпускании. Жест поглощается до запроса, а добавление вызывает тот же collection_action / add_tracks, что и меню. Нативного второго обработчика нет. Escape, pointercancel и потеря capture отменяют жест.

В release проверены разные треки, повтор, ровно +1 за жест, неверная цель без добавления, две разные цели, порядок и перенос во время playback. После перезапуска записи, их ID и порядок совпали со снимком SQLite. Автоматический тест проверяет порог, владение указателем, однократное завершение и отмену.

## Проверки

| Проверка | Результат / свидетельство |
|---|---|
| Play Next, финальное закрытие 2026-09-09 | PASS: actual usePlayer с IPC spy; вставка после cursor, прежний prefix/tail, unchanged current/status/position, ноль audio IPC при добавлении; последовательный Next, повторы и пустая очередь. `queue-tests.log`, `scripts/queue-regression.mjs` |
| Collections, финальное закрытие | PASS: targeted Rust test, остальные тесты отфильтрованы. `collections-targeted-tests.log` |
| Production | TypeScript, Vite, Rust release и NSIS; `release-build.log` |
| Финальная сохранность базы | 912 исходных track IDs и paths без изменений; integrity_check=ok, foreign_key_check=[]; `closure-data-checks.json` |
| Прежние проверки этой Phase 2 | 9 Rust tests passed; отдельно live audio smoke MP3 и FLAC 44.1/48/96 kHz; `rust-tests.log`, `live-audio.log` |
| Миграция и повторный импорт | Копия и реальная база: 912 IDs и sync IDs сохранены, два прохода 912 skipped / 0 imported; `migration-copy.log`, `migration-real.log` |
| UI release без Vite | Artists/Albums и artwork, like/unlike, playlist create/rename/description/add/remove/reorder/delete, queue add/remove/reorder/duplicates/Next и редактирование во время playback, search и sorting проверены в ходе Phase 2 |
| История и persistence | Успешный Play добавил одно событие, pause/seek/resume — ноль. Коллекции и история совпали после restart; `collections-before-restart.json`, `history-ui.txt` |

При финальном закрытии общий regression suite и пройденные UI-тесты повторно не запускались. Производственный код на этом шаге не менялся: добавлен только целевой тест очереди. Проверка с IPC spy доказывает отсутствие команд, способных прервать текущий playback; проверку реального аудиоустройства покрывает ранее пройденный smoke.

## Поставка и границы

Portable: `releases/Undertone-0.2.0-win64/undertone.exe`; ZIP: `releases/Undertone-0.2.0-win64.zip`; installer: `src-tauri/target/release/bundle/nsis/Undertone_0.2.0_x64-setup.exe`.

Рядом с portable сохранены notices, SPDX SBOM, MPL license, точные source URLs и изменённый MPL-файл. Новые внешние зависимости для Phase 2 не добавлялись. Proprietary source не включён в пакет MPL.

Очередь относится к текущему сеансу и очищается при перезапуске. История хранит успешные запуски, а не фактические миллисекунды прослушивания; UI показывает последние 200 событий, база сохраняет все. Search работает только по локальной библиотеке; результаты имеют source и localTrackId для последующего подключения отдельного источника. Клиента slskd нет.
