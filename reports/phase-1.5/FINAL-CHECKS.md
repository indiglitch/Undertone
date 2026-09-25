# Финальная проверка Phase 1.5 — 2026-09-08

Проверена окончательная **0.1.5**, без временной artwork diagnostic IPC-команды. Phase 2 не начата.

| Проверка | Результат / доказательство |
|---|---|
| TypeScript + Vite production | PASS; `release-build-final.log` |
| Rust release + NSIS bundle | PASS; `release-build-final.log` |
| Rust tests, slskd feature | **8 passed, 0 failed**, один live test excluded по умолчанию; `unit-tests-final.log` |
| Live audio Phase 1.5 | PASS FLAC 44.1/48/96 kHz + MP3, 100/80/50%, play/pause/seek/resume/stop; ранее завершённый `playback-final.log`, аудиоядро после него не менялось |
| Audio quality | Результаты `audio-after` сохранены; новые scope/UI-изменения не затрагивают PCM; DSP regressions повторно прошли в final unit tests |
| Реальная база после финальных изменений | **912**, exact original `(id,path)` и sync IDs сохранены; `migration-final.log` |
| Два повторных импорта F:\Music | Оба: **912 skipped, 0 imported, 0 errors**; `migration-final.log` |
| SQLite | integrity_check **ok**, foreign_key_check **0** на каждом проходе |
| Final portable launch | Запущен `releases/Undertone-0.1.5-final-win64/undertone.exe`; TCP 1420 не слушается, dev server не нужен |
| Release artwork | Главная: 6 настоящих обложек; обложки также видны в медиатеке, MP3 search и now-playing |
| Artwork safety test | PASS nominal/canonical path, кириллица/пробелы/[]/#, новая обложка; соседний файл и .txt запрещены |
| Финальный UI smoke | 912/441/271 tracks/albums/artists; FLAC playback; поиск FFM → 3 результата, MP3 найден и играет; seek → 2:01; переход на Главную → 2:11 с продолжающимся playback; pause → 2:26 |
| Итоговое окно | Оставлено открытым на паузе; `release-ui-final.png`, `release-ui-final.txt` |
| Notices / SBOM | 519 Cargo + 136 npm; manifest hashes проверены, package IDs/relationships валидированы генератором |
| MPL source access | **21 exact-version source downloads**: SHA-256 совпали; patched MP3 точно реконструирован; `mpl-source-verification.log` |
| Installer resources | Generated NSIS script содержит notices, SPDX SBOM, MPL license/access notice и только modified synthesis.rs; MPL-SOURCES.zip отсутствует |

Полная свежая установка поверх пользовательской установки не выполнялась: проверены сборка installer, его generated resource manifest и запуск того же release EXE в отдельной portable-папке. Dev/release URL-путь сопоставлен по коду и runtime production-диагностике; отдельный Vite dev run повторно не запускался.

## Поставка

- Portable executable: `F:\Spotify-Like\releases\Undertone-0.1.5-final-win64\undertone.exe` (16,459,264 bytes).
- Installer: `F:\Spotify-Like\releases\Undertone_0.1.5_x64-setup.exe` (4,338,537 bytes).
- Portable ZIP: `F:\Spotify-Like\releases\Undertone-0.1.5-final-win64.zip`.
- Каталог third-party рядом с portable EXE является частью поставки. Source-access комплект не содержит proprietary source приложения.
- Старый каталог `releases/Undertone-0.1.5-win64` относится к промежуточной сборке до исправления artwork; используйте **final-win64**.

SHA-256 portable EXE: `2ace2e66140801d4057eecbd679fe9c556cda5101e3a9421ac1df5af911fcf6e`.

SHA-256 installer: `775997cdc298063219100697b539f66c0c290cc736b865464cb4487fa0c0bbf0`.

Ограничения audio measurements и оставшиеся commercial-distribution вопросы (realfft attribution text, AAC patents, WebView2/mobile platform terms) перечислены в [полном отчёте](REPORT.md), без заявления о полном юридическом clearance.
