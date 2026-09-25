# Phase 1.5 — Undertone 0.1.5

Даты проверки: 2026-09-07–08. Phase 2 не начата. Исходная библиотека `F:\Music`: 912 треков. Итоговые логи и машинные измерения находятся рядом с этим отчётом.

## Release artwork — исправленная регрессия

Причина установлена на работающем release EXE: все JPEG существовали, URL `http://asset.localhost/C%3A%5C...` правильно кодировали абсолютный Windows путь, CSP violations отсутствовали. Но Tauri `scope.is_allowed()` возвращал false. При запуске дочернего процесса из MSIX-контекста Codex Windows виртуализировал отдельные AppData-файлы в `AppData\Local\Packages\OpenAI.Codex_...\LocalCache\Roaming\...`. При этом canonicalize родительской папки возвращал обычный `AppData\Roaming\...`. Разрешение `allow_directory` не совпадало с canonical path конкретного JPEG, поэтому asset protocol отказывал в доступе.

Исправлено в общем Tauri `library` command: перед выдачей данных выдаются `allow_file` разрешения только существующим обычным JPEG-файлам собственного cover cache. Tauri учитывает исходный и canonical path каждого файла; полный AppData, исходная музыкальная папка и посторонние файлы не открываются. При обновлении библиотеки новые cache entries получают разрешения тем же путём. Кеш и 912 track IDs не пересоздаются. В UI ошибка изображения теперь показывает нейтральную иконку вместо пустого прямоугольника.

После исправления все 6 изображений главной имеют `naturalWidth=480`, complete=true, allowed=true. App origin — `http://tauri.localhost`; src не зависит от Vite, cwd или каталога установки. Dev использует тот же `convertFileSrc`/asset protocol, но документ приходит с `127.0.0.1:1420`; production содержит embedded Vite assets. Финальный EXE дополнительно проверен отдельно без слушающего Vite-порта. Временная диагностическая IPC-команда удалена из финального кода.

Доказательства: `artwork-diagnostic.json`, `artwork-diagnostic-2.json`, `path-probe.rs`, `artwork-fixed.json`, `unit-tests-final.log`, `FINAL-CHECKS.md`. Новый regression test проверяет nominal/canonical paths, кириллицу, пробелы, `[]/#`, новые обложки после импорта и запрет доступа к соседнему JPEG/не-JPEG файлу. Неизвестные произвольные каталоги приложениям не разрешаются.

## Audio

Обнаружены воспроизводимые проблемы, исправлены причины:

1. В Phase 1 каждый Load создавал новый Sink; stop старого применялся асинхронно. Детерминированный Mixer-тест двух сигналов 0.75 получил peak **1.5**, 958/960 samples >1. Теперь используется одна постоянная очередь с ожиданием удаления старого источника: regression peak **0.75**, наложения нет. OutputStream и прежде был один на worker; дефект был в одновременных Sink, а не в двойном volume.
2. Symphonia MP3 0.5.5 обрезал synthesis PCM до [-1,1] ещё до пользовательской громкости. У реального `FFM FREESTYLE.mp3` независимый FFmpeg даёт peak **1.023084879**, 4 samples >1. Старая версия теряла их. Единственное изменение vendor decoder — удаление clamp, MPL source сохранён. Max PCM error против FFmpeg: **0.023084879 → 0.000002831221**; RMS после исправления **1.99975e-7**, смещение 0 frames. FLAC decoder не менялся.
3. Родной SRC Rodio использует линейную интерполяцию без требуемого low-pass при downsampling. На этом устройстве 48/96 kHz FLAC преобразуются в 44.1 kHz. Добавлен Rubato FftFixedIn с предвыделенными buffers, flush хвоста и reset после seek; совпадающие rates обходят SRC. Тест 30 kHz при 96→44.1 kHz: остаточный alias RMS **2.02366e-8, -153.88 dBFS**; 1 kHz passband gain сохранён. Это результат конкретного тестового тона, не общая паспортная динамика тракта.
4. Пустая очередь Rodio сообщает mono/48 kHz (а silent queue mono/44.1 kHz), что провоцировало дополнительное преобразование начала трека. Постоянная оболочка сообщает действительный device format. Регрессия короткого PCM проверяет точный onset, каналы и gain. Stop немедленно возвращает корректный stopped status даже до асинхронного drain.

Реальный Windows device: **Speakers (Focusrite USB Audio), stereo, F32, 44,100 Hz**; default и открытый stream совпадают. Всего 911 FLAC + 1 MP3. FLAC: 861×44.1k/16-bit, 11×44.1k/24-bit, 34×48k/24-bit, 5×96k/24-bit. Все исходники в библиотеке stereo.

Полные файлы прошли Decoder → prepare → фактический Sink/Mixer (offline capture до устройства), затем независимое сравнение FFmpeg original-rate float32. 4 FLAC, представляющие все rate/bit-depth группы, **побитно совпали** с FFmpeg float32. Для MP3 ожидается малая разница реализации синтеза. Ни NaN, ни Infinity не обнаружено.

| Файл | Source Hz | Peak decoded | Peak mixer 100% | 80% | 50% |
|---|---:|---:|---:|---:|---:|
| Kill Yourself (Part III), FLAC16 | 44100 | 1.000000 | 1.000000 | 0.800000 | 0.500000 |
| Воха и лёха, FLAC24 | 44100 | 0.971423 | 0.971423 | 0.777139 | 0.485712 |
| FFM FREESTYLE, MP3 | 44100 | 1.023085 | 1.023085 | 0.818468 | 0.511542 |
| Родная Душа, FLAC24 | 96000 | 0.988553 | 1.020067 | 0.816054 | 0.510034 |
| Для Насилия, FLAC24 | 48000 | 0.999900 | 1.023603 | 0.818882 | 0.511801 |

100% сохраняет единичный gain, 80/50% точно равны unity PCM ×0.8/0.5 (ошибка сравнения 0). Усиление >1 не применяется, volume не дублируется. На 80/50% samples >1 отсутствуют во всех пяти файлах. На 100% у MP3 их 4, у ресемплированных FLAC — 13 и 8931. Независимый libsoxr тоже восстанавливает overshoot: peaks **1.019925** и **1.026316**; 13 и 9127 samples >1. Разные low-pass filters не обязаны давать битовую идентичность; RMS difference с libsoxr 1.15165e-5 и 0.000263623.

Float PCM >1 может быть корректным результатом MP3 synthesis или реконструкции между отсчётами. Сохранять эти пики при gain=1 и одновременно гарантировать отсутствие clipping на конечном DAC невозможно. Они теперь сохраняются до volume, поэтому ручной запас громкости помогает без необратимого decoder clipping. Автоматического limiter/компрессора/нормализации не добавлено.

Float32 используется от Symphonia до Mixer/CPAL. 16/24-bit integer FLAC масштабируются decoder в float; обратной integer-конверсии на проверенном F32 output нет. На integer-устройствах конечная конверсия CPAL/Rodio ограничена диапазоном формата; такие устройства здесь не проверялись. Shared Windows mixer, system effects, физический DAC и аналоговый loopback не измерялись. Утверждение о полном устранении любого слышимого distortion на любой системе не делается. AAC/OGG/WAV не заменены, реальных AAC fixtures в этой библиотеке нет.

Доказательства: `audio-before/measurement.json`, `audio-before/reference-comparison.json`, `audio-after/measurement.json`, `audio-after/reference-comparison.json`, `unit-tests.log`, `playback-final.log`. Поле `phase1_stop_new_sink_overlap` в обоих measurement-файлах намеренно воспроизводит старый алгоритм; текущую замену проверяет `replacement_never_sums_two_tracks`. Baseline PCM снят до patch; повторный запуск текущего script с именем before не восстановит старый код.

## Architecture

Добавлены шесть запрошенных provider traits, SecretStore/SecretRef, локальный AI default и защита manual lyrics; реализован только уже необходимый LocalMetadata. Scanner выделил один переиспользуемый importer. Migration 002 сохраняет tracks и добавляет независимую sync identity. Feature slskd выключена по умолчанию, модуль и DownloadProvider исключены из ios/android. Проверка URL разрешает только loopback/localhost и запрещает секреты в URL.

Схема будущих отношений, atomic manual-lyrics update, кеширование анализа, рекомендации без LLM на каждый playlist, много папок, будущий download intake, native secret storage, sync/mobile и artwork boundaries описаны в [ARCHITECTURE.md](../../ARCHITECTURE.md). Нет slskd client/protocol/EXE, поиска/скачиваний, filesystem watcher, моделей, lyrics indexing, embeddings, Daily Vibe, mobile или cloud sync. SecretStore пока контракт, не готовое хранилище credentials.

## Licenses

Проанализированы Cargo.toml/Cargo.lock и package.json/package-lock.json: **519 Cargo + 136 npm entries**, включая прямые, транзитивные, build и optional/other-platform. Windows Cargo graph: 333 dependencies (311 консервативно runtime-reachable и 22 build-only); прочие 186 для других targets/dev. Npm: 8 runtime, 68 installed build, 60 optional not installed. Reachability включает proc macros и не равна доказанному составу linked executable.

Полный список dependency/version/direct/license/scope/проблема: `license-inventory.csv`. `license-summary.json` содержит SPDX expressions, флаги и SHA-256 manifest/lockfile. Генератор `scripts/licenses.py` создаёт notices, SPDX 2.3 dependency SBOM (655 packages, checksums/relationships), source-access notice с точными ссылками и изменённым MPL-файлом. Полный Windows MPL archive сохраняется только как локальный аудиторский резерв и не включается в финальный installer. Это catalog из package managers, не полный binary/system-component SBOM.

Основные лицензии: MIT, Apache-2.0, BSD-2/3-Clause, ISC, Zlib, Unlicense, CC0-1.0, Unicode-3.0, MPL-2.0; отдельные build/other-target выражения CC-BY-4.0, Apache-2.0 WITH LLVM-exception и permissive OR LGPL. Полные точные expressions в inventory.

| Компонент | Лицензия / результат |
|---|---|
| Rodio 0.21.1, CPAL 0.16.0 | MIT OR Apache-2.0 / Apache-2.0; сохранить attribution |
| Symphonia 0.5.5, MP3/FLAC/AAC/ALAC/Vorbis decoders и containers | MPL-2.0, file-level copyleft; точные source URLs + наш полный изменённый MP3 synthesis.rs |
| Lofty 0.25.1, lofty_attr 0.13.0, ogg_pager 0.7.2 | MIT OR Apache-2.0; upstream license texts получены по packaged git revision |
| Rubato 0.16.2 / realfft 3.5.0 / rustfft 6.4.1 | MIT / MIT / MIT OR Apache-2.0; realfft upstream объявляет MIT, но standalone LICENSE отсутствует — attribution gap отмечен |
| Tauri 2 и plugins dialog/fs | MIT OR Apache-2.0; fs транзитивный от dialog; код slskd не добавлен |
| cssparser, selectors, option-ext, dtoa-short | MPL-2.0; exact-version corresponding source URLs и SHA-256 в notice |
| r-efi (не Windows MSVC graph) | MIT OR Apache-2.0 OR LGPL-2.1-or-later: можно выбрать permissive вариант, это не обязательная LGPL |
| caniuse-lite (build data) | CC-BY-4.0, сохранить attribution при распространении данных |
| LLVM exception / Unicode | допустимые отдельные условия, сохранить соответствующие notices; не считать их GPL |

В текущем приложении не найдено обязательной GPL/AGPL/SSPL/non-commercial зависимости. Symphonia не заменён вслепую: MPL допускает larger work под другими условиями при выполнении обязанностей по covered source и notices ([Mozilla MPL 2.0 §§3.1–3.4](https://www.mozilla.org/en-US/MPL/2.0/), [FAQ Q8–Q11](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)).

**Физически включать весь Symphonia source в installer не требуется.** Нужно сделать соответствующие MPL sources доступными получателям и объяснить способ получения. Финальная поставка содержит Third Party Notices, текст MPL-2.0, точные versions/URLs/SHA-256 и только изменённый `synthesis.rs` (35,480 bytes). Получатель скачивает оригинальный symphonia-bundle-mp3 0.5.5 и заменяет этот файл; остальные `.rs` побайтно совпадают с upstream. Одной ссылки на неизменённый upstream для нашего patch было бы недостаточно. Для остальных MPL crates даются exact-version downloads. `verify_mpl_sources.py` скачал все 21 архива, сверил hashes и подтвердил точную реконструкцию изменённого компонента. Полный `MPL-SOURCES.zip` остаётся в рабочем проекте как резерв; final installer/portable его не содержат. Proprietary application source не включён и не перелицензирован. При дальнейшем публичном распространении нужно сохранять работоспособный доступ к указанным соответствующим sources, при необходимости разместив versioned mirror; неизвестный URL зеркала не выдуман.

AAC/M4A требует отдельной оценки codec patents для продукта и рынков: permissive/MPL copyright license сама по себе не подтверждает все патентные права. Существует [AAC licensing program Via LA](https://www.via-la.com/licensing-programs/aac/). Сейчас декодер сохранён; минимальный будущий вариант при необходимости — platform-native AAC adapter или отключаемая AAC feature после определения обязательств, а не замена всего audio pipeline.

Будущий [slskd](https://github.com/slskd/slskd) — отдельное AGPL-3.0 приложение. Его код/EXE не входит в core/installer; localhost API граница не является универсальным юридическим заключением о любом способе совместного распространения. FFmpeg GPLv3 build в `F:\youtube` использован только как независимый QA инструмент и не включён в поставку.

Оставшиеся отсутствующие standalone license texts явно перечислены в `license-summary.json`: в Windows Cargo graph только realfft; большая часть остальных относится к другим платформам. Четыре native npm build packages без собственного license-файла также отмечены, верхнеуровневые notices сохранены. Перед публичной коммерческой поставкой закрыть attribution gap realfft, отдельно проверить WebView2 redistribution, NSIS/native toolchain/system components, будущую mobile dependency closure и AAC patent applicability. Текущий аудит не выдаёт юридическое разрешение на коммерческое распространение.

## Regression

Миграция проверена сначала на SQLite backup исходной базы, затем на реальной базе. По каждому из 912 `(id,path)` выполнено точное сравнение с baseline; созданные sync IDs не меняются после двух повторных сканирований. Оба: 912 skipped, 0 imported, 0 errors. `integrity_check = ok`, `foreign_key_check = 0`. `migration-copy.log` и `migration-real.log` сохраняют результаты. Никакие исходные музыкальные файлы не изменялись.

Автотесты: **8 passed / 0 failed** с feature slskd (7 core + 1 artwork); hardware smoke по умолчанию ignored и запускается отдельно. Проверяются PCM/gain/channels/onset, alias rejection, EOF/seek, отсутствие наложения, invalid volume, recursive/idempotent/direct intake, повреждённый файл, manual lyrics, localhost URL и безопасный artwork scope. Окончательные build/playback/UI результаты см. `FINAL-CHECKS.md`.

Повторение проверок:

```powershell
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --features slskd -- --nocapture
cargo test --release --manifest-path src-tauri/Cargo.toml real_library_and_audio_smoke -- --ignored --nocapture
cargo run --release --manifest-path src-tauri/Cargo.toml --example library_regression -- "$env:APPDATA\local.undertone.desktop" reports/phase-1.5/track-ids-before.json
python scripts/audio_reference.py after
python scripts/licenses.py
python scripts/verify_mpl_sources.py
npm run package
```

`audio_reference.py` требует numpy и установленный QA FFmpeg; файлы `.f32`, копии БД и baseline с личными путями не предназначены для распространения. Raw PCM и DB snapshots не включаются в installer/portable.
