# Undertone — final Phase 14

Дата проверки: 2026-10-06. Версия: **0.2.6**, Windows x86_64.

## 1. Release readiness summary

**READY FOR RELEASE — Windows desktop release candidate.** Открытых подтверждённых **BLOCKER: 0, HIGH: 0**. Остаточные MEDIUM/LOW и границы проверки перечислены в разделе 12.

Проверен текущий checkout со всеми существующими изменениями Phase 1–13. Они сохранены; работа над iOS и прочие изменения не откатывались. Commit/tag/publication/install не выполнялись. Phase 15 не начиналась.

Первичный аудит: [PHASE14_RELEASE_AUDIT.md](PHASE14_RELEASE_AUDIT.md). В native QA дополнительно обнаружены и устранены сжатая ширина Player, встроенные developer paths и падение portable native check без готового `dist`. Последнее воспроизведено настоящим compiler error, затем проверено исправленной командой из состояния без `dist`.

## 2. Изменения Phase 14

### Layout и единые компоненты

| Before | After |
| --- | --- |
| Player height менялся вертикальным resize handle и pointer logic | Handle, vertical pointer logic, height reset и применение сохранённой высоты удалены из App/ResizeHandle/layout model/hooks |
| Layout model поддерживал неиспользуемые right/player параметры | Осталась регулировка ширины Sidebar; старые height/right preferences игнорируются |
| Shell применял переменную пользовательскую высоту footer | `--shell-player-height: 104px`; строка shell учитывает Player и существующий padding |
| Settings объясняли свободный resize Player | Удалён соответствующий hint; настройка расположения кнопок сохранена |
| На native maximized client width 2560 Player имел width ≈1248 | `.player` получил `flex:1; width:100%`; итоговая ширина 2528 с штатными отступами по 16 |
| Collection toolbar использовал `round-play` и `primary-button` | Две кнопки переведены на canonical Button; удалены недостижимые ветки этого toolbar |

### Preferences и устойчивость интерфейса

| Before | After |
| --- | --- |
| Volume всегда начинался с 0.65 | `volumePreferences.ts`: lightweight localStorage preference `undertone.player.volume.v1` |
| Изменение громкости не сохранялось | Запись после успешного актуального native ACK, coalescing 180 ms, flush на pagehide/unload |
| Не сохранялся последний audible level | JSON `{volume,lastAudible}`; mute/restart/unmute восстанавливает прежнее положительное значение |
| Повреждённый preference не имел отдельного контракта | Finite numeric validation, clamp 0..1, безопасный default 0.65, обработка недоступного storage |
| Ошибка React render могла оставить пустой UI | Root AppErrorBoundary вокруг App/ToastHost: «Undertone столкнулся с ошибкой», pause перед reload, без stack trace в пользовательском UI |

### Native integration и release pipeline

| Before | After |
| --- | --- |
| Window size/position/maximized не сохранялись | `tauri-plugin-window-state`, только SIZE/POSITION/MAXIMIZED; visible monitor fallback; отдельный файл portable profile |
| Windows SMTC отсутствовал | `media_controls.rs`/souvlaki: WinRT MTA thread, title/artist/album/duration/artwork, transport events в существующий player |
| Metadata могла требовать синхронную native инициализацию на UI startup | Адаптер запускается вне UI startup; синхронизация ограничена изменением track/state/целой секунды, bounded readiness retry |
| Package metadata было 0.2.5 без publisher | package/Cargo/Tauri согласованы на 0.2.6; publisher Undertone; LRCLIB User-Agent использует Cargo package version |
| Release executable содержал абсолютные пути разработчика | `build-windows-release.ps1` и CI remap project/user prefixes; проверка ASCII и UTF-16 в итоговом executable |
| `npm run package` обходил этот build path | Команда вызывает единый Windows release helper; `--ci` исключает интерактивное ожидание signing password, в том числе в Windows PowerShell |
| Portable tests в clean checkout падали: `frontendDist ... doesn't exist` | `test:portable` сначала выполняет production frontend build; проверен запуск без заранее созданного `dist` |

### Cleanup, notices и проверяемость

| Before | After |
| --- | --- |
| Неиспользуемый MediaShelf | Удалён после reference check |
| Retired resize/shelf/legacy button CSS | Удалены подтверждённые неиспользуемые blocks/selectors, включая 23 retired selectors; responsive presentation сохранена |
| 18 unused imports/locals и unused braces warning | Удалены; `tsc --noUnusedLocals --noUnusedParameters` проходит |
| License inventory не учитывал новый native graph | Обновлены notices/SPDX/MPL corresponding source archive; собраны дополнительные upstream notices для asn1-rs-impl и clipboard-win |
| Генератор notices сохранял trailing whitespace | Нормализованы концы строк; `git diff --check` проходит |
| License helper был привязан к старому audit directory | Поддерживает явный output directory и Windows runtime subset; first-party path dependency не считается отсутствующим third-party source license |
| Старые structure assertions/VM mocks описывали height resize и прежние player imports | Обновлены layout assertions, regression imports и media event mocks; добавлены volume preference tests |
| Тест ожидал завершение 250-item bulk fixture за 8 s и давал flaky failure под параллельной сборкой | Только test helper deadline увеличен до 30 s; диагностическое сообщение ограничено счётчиками. Production logic не менялась |
| Не было final native/failure/crypto QA evidence | Добавлены isolated fixture builders, native UI/DPI/keyboard/audio/performance/startup helpers, controlled updater/fallback tests и Windows SMTC inspector example |
| Первые throwaway native inspectors закрывали debugger Browser | Заменены итоговыми helpers с disconnect без Browser.close; неиспользуемые ранние helpers удалены |

Бизнес-модель библиотеки и audio engine не менялись. Новых продуктовых страниц, EQ/crossfade/ReplayGain/output picker, telemetry или cloud service нет. QA HTML создаётся только в ignored `qa-output`.

## 3. Player resize

Постоянный Player имеет canonical height **104 CSS px**. MainContent учитывает фиксированную footer row. Старые persisted heights не удаляются из пользовательского storage, но не читаются и не применяются. Horizontal responsive layout и Sidebar resize сохранены.

## 4. Volume persistence

Единственный владелец значения — existing `usePlayer`/native audio status. Mini Player и Now Playing вызывают общий `changeVolume`; отдельного native volume subsystem нет.

Native проверки: 0.27 → mute 0 → сохранённое `{volume:0,lastAudible:0.27}` → restart с volume 0 → unmute 0.27. Обычный restart восстанавливал 0.27. В профиле без preference native/default остаётся 0.65. Keyboard arrows на slider меняют значение; malformed/clamp/storage failure покрыты frontend tests.

## 5. Native/Tauri build result

Успешно собраны production frontend, portable native executable и default production **x64 NSIS installer**. Финальный canonical build: `npm run package`, включая path remapping и updater signing.

Артефакты находятся в `releases/phase14/`: `Undertone.exe`, `Undertone_0.2.6_x64-setup.exe`, соответствующая `.sig` и third-party notices/resources. Итоговые SHA-256 и криптографическая проверка — `qa-output/phase14-release-verification.json`.

Updater signature проверена Ed25519/Minisign file signature против **настроенного production public key**; key ID совпадает. PE machine: x86_64. Private key/password не выводились и не попали в package. Проверки developer path prefixes в ASCII/UTF-16 и synthetic fixture names в executable прошли.

Настоящий default executable запускался из release directory, process path был проверен. Библиотека существующего профиля загрузилась без autoplay. Отдельные portable profiles использовались для всех мутаций данных/файлов. Installer и real updater install **не запускались**.

Последний packaged executable дополнительно подтверждён непосредственным Windows screenshot/accessibility state: Home, загруженная библиотека и Player на паузе. Повторная автоматическая CDP startup попытка дала locator timeout; она не отмечена PASS и заменена реальным GUI наблюдением этого же файла. Evidence: `qa-output/phase14-native/final-executable-gui.json`.

| Final check | Result |
| --- | --- |
| Frontend tests | 156 passed, 0 failed |
| Regression suite | 12 PASS groups: search/navigation, queue occurrences/Undo, playback restore/seek/skip/volume |
| Production frontend build | PASS; final JS 447.02 kB, CSS 104.08 kB |
| Default Rust, external-lyrics | 68 library + 6 binary passed; 1 intentionally ignored hardware fixture |
| Portable Rust, no AI, external-lyrics | 50 library + 6 binary passed; 1 intentionally ignored hardware fixture |
| Portable test command without existing dist | PASS, including its preceding frontend build |
| Rust check, default + portable | PASS |
| PhoneSync Rust tests | 2 passed |
| Strict TS unused checks | PASS |
| Production Tauri/NSIS + signature | PASS |
| git diff --check | PASS; only Git CRLF normalization notices |

## 6. Windows / DPI / window QA

Настоящие Windows actions подтвердили close/reopen, maximize, restore, minimize, native resize, fullscreen Now Playing, dialogs, context menu и открытие/отмену Windows folder picker. OS Ctrl+K/type и native WebView keyboard tests также выполнялись.

Minimum сохранён и проверен: **1000×700 logical client size**. Тестовые renderer viewports: 1000×700, 1280×720, 1920×1080, 2560×1440. Actual maximized window на мониторе 2560×1440 имело client 2560×1417 из-за Windows caption.

**100% — actual OS/WebView scaling. 125/150/200% — CDP deviceScaleFactor/viewport emulation в том же production WebView2.** Windows Display Settings не переключались; это максимально близкий renderer pass, а не доказательство физической смены OS DPI/rasterization.

240 geometry measurements покрыли Sidebar, Home, TrackList, EntityGrid/Albums, Search, Queue, Lyrics, три вкладки Now Playing, Settings, Metadata dialog, ContextMenu, inline playback error и Toast. Horizontal document overflow: 0. Dialog rectangles находятся внутри viewport. Now Playing primary controls дополнительно проверены по bounds на minimum 1000×700/200%.

Window state сохраняет size/position/maximized. При fixture position 999999×999999 окно открылось на видимой позиции 260×260. Maximized state и восстановление normal size 1440×940 подтверждены restart/Windows actions. Hidden/fullscreen state не восстанавливается.

Архитектура интеграции следует существующему [Tauri window-state plugin](https://v2.tauri.app/plugin/window-state/); пользовательская новая window subsystem не создавалась.

## 7. Audio / media integration QA

На настоящем Windows audio engine проверены Play, Pause, seek 12 s, Resume, Next/Previous, пять rapid track requests, native volume ACK, missing path и corrupt WAV. WAV fixtures декодировались с реальным audio output device; позиция двигалась. Короткий 2 s трек естественно завершался, frontend переходил к следующему треку. Corrupt decode отображает существующий inline alert; библиотека/интерфейс продолжали работать.

Restart: current/queue/position и volume восстанавливались без autoplay. При missing current native session безопасно очищает current/position и исключает отсутствующие queue occurrences; startup сохраняет рабочий UI без fatal failure.

Реальный Windows GlobalSystemMediaTransportControlsSessionManager находил Undertone session с title, artist и artwork. `TryPlay/TryPause/TrySkipNext/TrySkipPrevious` возвращали accepted=true; playback state/track менялись через existing frontend player. MediaControlEvent mapping покрыт Rust test.

Физические аппаратные media keys и субъективное прослушивание через конкретные speakers/headphones не сертифицировались. Это не mock audio test: native device/decoder/clock/transport работали. Старый ignored F:/Music hardware fixture не выдаётся за пройденный тест.

## 8. Library / filesystem QA

Синтетический metadata catalog: 25 000 initial tracks, 2 500 albums, 500 artists, playlists, history/likes и 1001 queue occurrences. После реального scanner smoke final catalog содержал 25 010 tracks. Воспроизводимые реальные WAV находятся только в isolated fixture directory; virtual tracks служат large catalog/availability test.

Измерение внутри WebView: full native library IPC 258–300 ms. После 24 переходов Home/Library/Albums/Playlist/Queue/Search JS heap после GC: 32 289 416 → 32 272 964 bytes. Максимальный измеренный navigation-to-two-frames interval ≈53 ms. Library DOM ≈1500 elements/30 virtual rows; final search DOM 339. Непомерного DOM или роста live heap в этом bounded pass нет. Старые ~3 s измеряли также передачу всего массива в DevTools и не используются как UI latency.

Actual filesystem smoke: add source/scan, rescan (0 imported, 4 skipped), corrupt file error, missing file status, unavailable folder rejection, remove source по native canonical path, safe trash move. Folder внутри music source был корректно отклонён как trash target; отдельная папка вне источников принята. Повторный импорт одного path не создаёт новых записей; byte-identical files с разными paths сохраняют принятую path identity model.

Пользовательские музыкальные файлы не перемещались/удалялись, пользовательская DB вручную не редактировалась. Изменения fixture DB выполнялись только после остановки точного QA executable.

## 9. Updater / PhoneSync / lyrics network

**Updater:** production HTTPS manifest был доступен, public version 0.2.5, платформы windows-x86_64/windows-x86_64-nsis, public GitHub download URLs. Реальный check в 0.2.6 показал «Установлена последняя версия». Подпись нового локального installer проверена production key. Available 0.2.7/failure/progress/interrupted-download состояния проверены isolated frontend fault injection; реальный download/install не выдаётся за пройденный. Публикация 0.2.6 оставлена вне этого задания.

**PhoneSync:** real local TLS smoke прошёл auth rejection, certificate pin, manifest, original byte/hash transfer, ranges/resume, lyrics, collections, idempotent retry/rollback и identity/restart. Native Settings корректно показывают disconnected optional feature. Физического iPhone runtime в этой проверке не было; pairing/transfer на устройстве не подтверждены. PhoneSync не переделывался.

**LRCLIB:** ограниченный live smoke: impossible metadata → not_found; корректные Rick Astley/album/duration metadata → found; repeated lookup и последующий native close/reopen → cached=true. Для timeout/network error/rate-limit/malformed/oversized response использованы actual local HTTP Rust fixtures; production provider имеет bounded HTTPS timeout. Internet outage не устраивался, mass live provider load не выполнялся. Тексты песен в отчёт не экспортированы.

## 10. Accessibility / fatal failure / selective states

Native keyboard pass: Home Enter, Search Ctrl+K/type, Library/Queue grid arrows и active descendant, Player volume arrows, Now Playing Tab trap/arrow tabs/Escape, ContextMenu Enter/arrows/Escape. Settings 20 Tab transitions остались внутри native dialog; Escape закрывает его. Visible unnamed buttons: 0. Focus outlines видны на финальных screenshots.

Toast dismiss проверен native keyboard; action button — isolated frontend keyboard test. Toggled states/slider names/dialog names используют существующие aria contracts. Физический screen reader smoke/WCAG certification не выполнялись.

Top-level render failure намеренно вызван в isolated test: показан fallback с правильным текстом, без raw stack; restart сначала вызывает pause и reload. Expected diagnostic console.error остаётся; фильтра console.error нет. Обычный native 15-screen/80-matrix pass: console warning/error/pageerror list пуст.

Selective states: actual native empty library/queue; empty playlist; Search zero results; missing artwork placeholders; missing current startup; corrupt playback inline error; network lyrics error/loading contracts в deterministic provider/fault tests. Полная permutation matrix не выполнялась.

## 11. Dead code / CSS / visual final pass

Удалены только подтверждённые remnants. Historical Phase 1–13 reports/QA files сохранены. Production Player/ResizeHandle имеют по одному presentation owner. Оставшиеся три `!important` относятся только к global prefers-reduced-motion contract; конкурирующий resize CSS удалён. Новый CSS redesign не выполнялся.

Финальные screenshots: `qa-output/phase14-native/` — home, search, library, albums, playlist, queue, lyrics, now-playing-lyrics/next/about, settings, context-menu; дополнительно artists, empty/error/minimum/fallback/focus states. Стабильные screenshots сняты после завершения transition. Просмотрены основные composition/layout states и minimum controls: единые controls/type/borders/radii, fixed footer, отсутствие нового явного clipping/misalignment.

Security quick check не обнаружил private key/token literals в активном source/config. Developer absolute paths и synthetic names отсутствуют в executable. Cargo metadata с локальными путями и personal fixture data остаются только в ignored qa-output; они не входят в production package. Release resources содержат notices/SPDX/MPL source access, не QA DB или profiles.

## 12. Remaining MEDIUM/LOW и границы проверки

| Level | Остаток | Release impact |
| --- | --- | --- |
| MEDIUM | Installer/executable не имеют Windows Authenticode certificate: NotSigned | Updater Minisign signature валидна; отсутствие отдельного Windows certificate не является невыполненным требованием этой private desktop release phase |
| LOW | Upstream realfft 3.5.0 публикует MIT declaration, но не standalone license file в exact revision | Authors, MIT declaration и exact source URL сохранены в notices; это отдельно отмечено inventory, не скрыто |

Границы, а не пройденные hardware/install tests: физический OS DPI 125/150/200%; конкретная аппаратная клавиатура/media keys; субъективная audibility/output device switching; screen reader; physical iPhone; реальная updater installation и clean-machine installer install. Для DPI выполнен разрешённый production WebView2 renderer equivalent; для audio/media/network использованы actual native APIs и собственные реальные файлы/серверы.

## 13. Verdict

**READY FOR RELEASE. BLOCKER = 0. HIGH = 0.** Windows desktop candidate собран, подписан для updater, запущен, проверен native/runtime и обязательными тестами. MEDIUM/LOW перечислены выше. Это готовность локального артефакта к распространению, а не утверждение, что он уже опубликован/установлен на чужом PC или проверен на физическом iPhone.

На этом Phase 14 завершена. Следующая feature phase не начиналась.
