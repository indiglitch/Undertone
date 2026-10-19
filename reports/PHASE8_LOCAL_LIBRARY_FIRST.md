# Undertone — Phase 8: local-library-first

Phase 8 завершена. Следующая фаза не начата. Работа продолжена из текущего dirty checkout; изменения предыдущих фаз и сторонние изменения сохранены. До удаления составлена dependency map: `reports/PHASE8_DEPENDENCY_MAP.md`. Baseline: `qa-output/phase8-before`.

## Удаление и сохранённые системы

1. **UI features.** Удалены сетевой музыкальный поиск, remote results/filters/loading/errors/query labels/download actions, Downloads page/route/sidebar counter, Soulseek Settings section/credentials/server URL/download destination. Search zero-results: «В библиотеке ничего не найдено». Нет hidden/experimental режима, пустой Downloads-заглушки или отключённых controls «на будущее». В компактном sidebar tools осталось три колонки для History/Queue/Lyrics.
2. **Frontend components.** Удалены DownloadManager, SoulseekSearchView, RemoteSearchResult. SoulseekSettings удалён как файл; его независимые General/Appearance/Player/Library/updater/PhoneSync части сохранены в AppSettings.tsx с прежним Settings layout. Отдельного DownloadRow не было. App/CollectionView/SearchPage больше не передают remote props.
3. **State/models.** Удалены useDownloadSession/DownloadSession, downloadModel, soulseekSearch и remote DTO/filter/sort/error helpers. App больше не держит remote request/query IDs, download snapshots/progress/import mapping и remote callbacks. Удалён downloadPageEntries и downloads из Page/SidebarId. Из Lyrics убран только scope RecentDownloads и связанный SQL/test; AllLibrary indexing не переделывался. Single-option scope picker заменён статической подписью.
4. **IPC/backend.** Удалены slskd_enabled/settings/save/check/save_download_root/search/download_start/status/cancel/finalize, soulseek_commands и дублирующая feature-dependent регистрация handlers. Удалены services/slskd*.rs, windows_secrets.rs, portable_secrets.rs и пустой services module; удалены remote SearchProvider/DownloadProvider/DTO и unused SecretStore/SecretRef. Cargo feature slskd, его direct windows-sys credentials dependency и remote-only direct url dependency удалены. reqwest остаётся для external lyrics. Desktop/package/backend/portable npm scripts и release workflow больше не включают slskd.
5. **Persisted settings.** Старые remote SQLite preferences/finalizations и credentials перестали читаться. Версии schema_migrations 4/5 сохранены как retired no-op в 004_retired.sql / 005_retired.sql; новые БД не создают remote-таблицы. Существующие старые таблицы/credential files/vault entries автоматически не удаляются. Это сохранение неиспользуемых данных для безопасного обновления, не сохранение работающей feature. Старый sidebar order фильтрует удалённый downloads ID существующей нормализацией. Unknown localStorage preferences игнорируются; отдельная migration для их очистки не создана. Native test открывает свежую БД, добавляет legacy tables с invalid settings, повторно открывает и выполняет настоящий локальный scan.
6. **Legacy CSS.** Удалены 145 feature-only selector occurrences из SearchPage.css, styles.css, glassRedesign.css, settingsPolish.css, uiPolish.css, desktopLayout.css и identity styles. Mixed rules для local source cards/messages, generic settings/errors и updater сохранены. Network panel height reservations удалены; local results используют освободившуюся площадь. Нет compatibility stylesheet или нового global override. Аудит: `qa-output/phase8-css-removed.json`.
7. **Search сохранён.** Persistent host и прежний localSearchSource, четыре категории, exact/prefix/word/substring ranking, Unicode/case/diacritics/punctuation normalization, Ctrl+K, Enter/Escape/IME, recent queries, grouped limits, Tabs, canonical TrackList/EntityGrid и Back/scroll restoration. Ranking/normalization/recent Search tests сохранены; добавлены negative guards против возвращения removed frontend/native entry points. Phase 6 browser script очищен от remote-only сценариев, локальные сценарии сохранены.
8. **Generic функции сохранены.** scanner::scan/import_files, MetadataProvider/LocalMetadata, локальные папки и import/upsert, playback/Queue, lyrics providers, filesystem/metadata/trash/clipboard/Explorer, экспорт локального плейлиста с файлами. App updater/downloadAndInstall и GitHub manifest/artifact acquisition относятся к обновлению приложения; model/source/license asset download не является скачиванием музыки. PhoneSync/phone-sync и отдельный iOS companion передают собственную библиотеку с paired PC, а не ищут музыку в интернете; их local file transfer/import не удалялся. Исторические reports сохранены как доказательства прошлых фаз, а не текущая product copy.

## Before / After

| Before | After |
| --- | --- |
| Search local results + Soulseek section | Только production local Search |
| Remote query/request/download lifecycle в App | Эти state и callbacks удалены |
| Downloads route, badges, empty state и sidebar tool | Route/component/style удалены; tools занимают три колонки |
| SoulseekSettings совмещал remote и generic preferences | AppSettings сохраняет generic sections, remote section отсутствует |
| Remote adapters/DTO/credential stores за optional feature | Код/feature/handlers удалены целиком |
| Fresh migrations создавали remote preference tables | Retired version slots; fresh DB без этих таблиц, old DB игнорирует их |
| Lyrics RecentDownloads зависел от finalizations | AllLibrary indexing; removed scope отсутствует |
| CSS резервировал network panel и оформлял download rows | Selector cleanup, полная local results area |
| Tests требовали удалённую functionality | Remote tests удалены; local tests/negative removal guards сохранены |
| Product architecture обещала future music downloads | Local folders/import/Search; stale future download table удалена из документа |

## Короткий QA

9. **Результаты.**

- `npm run test:frontend`: **157 passed, 0 failed**. Уменьшение количества относительно Phase 7 связано с удалением тестов удалённой functionality; added guards проверяют отсутствие frontend components/hidden entry points/native feature/handlers/DTO.
- `npm run test:regression`: PASS. Настоящий usePlayer сохраняет queue occurrence contracts, shuffle reorder, Play Next/Add, bulk remove и restore/seek. Remote-only DownloadSession regression удалён.
- `npm run build`: PASS (`tsc` + production Vite build).
- `git diff --check`: PASS. Git сообщает только прежние предупреждения LF/CRLF.
- Native portable + external-lyrics tests: **49 library + 5 binary tests passed, 1 hardware smoke ignored**. Включает новый legacy schema/local import test. Пользовательская БД/музыка не использовались.
- Default AI + external-lyrics `cargo check`: PASS. Существующее предупреждение о braces в default_scan_folder не связано с удалением feature.
- `scripts/phase8-local-only-qa.cjs`: PASS. Настоящий App в Chrome с synthetic Tauri IPC запускается без remote config; four-category Search/normalization/recent/zero/Ctrl+K работают; Downloads/Soulseek UI/IPC отсутствуют; Settings остаётся с четырьмя generic sections и updater; folder picker → scanner/refresh → новый local Search hit → playback → Queue проходит. Старые unused preference keys не читаются.
- Короткая проверка 1280×720, 1920×1080, 2560×1440: horizontal overflow отсутствует; screenshots zero-results и Settings просмотрены. Не выполнялся exhaustive cross-app QA.

Browser QA первоначально содержал неверный locator context menu у Library; исправлен на существующую кнопку добавления папки. Это исправление QA fixture, а не новый UI contract. Отдельно убрано пустое четвёртое место компактных sidebar tools.

Поиск `soulseek/slsk/slskd/download/RemoteSearch/DownloadSession/SoulseekSettings` выполнен по активным sources и repository. Остатки классифицированы в `qa-output/phase8-dead-code-audit.json`: negative assertions/legacy fixtures; historical reports; updater/config/CI; source/license URLs/transitive packages; собственный local file transfer iOS/phone-sync. Найденные три residual stale строки в ARCHITECTURE/scanner comment/старом QA success message удалены. В runtime frontend/native handlers/Cargo features Soulseek/download subsystem отсутствует.

Сравнение baseline подтвердило byte-identical Home, canonical TrackList/TrackList.css, Entity system, Queue, player.tsx, LyricsView, NowPlayingPanel, ContextMenu/TrackContextMenu, tokens/primitives. `qa-output/phase8-preserved-components.json` содержит результаты. BulkLyrics и общие CSS менялись только из-за удаляемой зависимости. Settings layout не редизайнился.

Логи: `qa-output/phase8-frontend.log`, `phase8-regression.log`, `phase8-build.log`, `phase8-backend-final.log`, `phase8-default-check.log`, `phase8-migration-test.log`, `phase8-browser-final.log`. Browser results/screenshots: `qa-output/phase8-local-only/`.

Граница доказательств: native fixtures подтверждают реальный SQLite open/migrations и локальный WAV intake; browser synthetic IPC подтверждает UI handlers/integration. Установленный executable, физическое аудиоустройство, updater network и iPhone runtime не проверялись. Deployment и изменение live user storage не выполнялись. Следующая фаза не начата.
