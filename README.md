# Undertone — Phase 2 / 0.2.2

Локальный музыкальный проигрыватель для Windows. Tauri 2, React, TypeScript, Rust и SQLite. Начальная папка — `F:\Music`; в интерфейсе можно добавить другие папки.

## Запуск

```powershell
npm ci
npm run desktop
```

Нужны Node.js, Rust MSVC, Visual Studio C++ Build Tools и WebView2. [Требования Tauri](https://v2.tauri.app/start/prerequisites/).

```powershell
npm run build
npm test
npm run package
```

## GitHub releases and in-app updates

The source repository is [indiglitch/Undertone](https://github.com/indiglitch/Undertone). In Undertone, open **Настройки → Обновление приложения → Проверить обновления** to check the latest published Windows release and install it.

To publish an update, increase the app version in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`, commit the changes, then push a matching version tag such as `v0.2.3`. The GitHub Actions workflow builds the Windows installer, signs the updater bundle, and publishes the GitHub Release and `latest.json` used by the app.

Before the first release, add the repository Actions secret `TAURI_SIGNING_PRIVATE_KEY` using the private key created for this app. The key is stored outside the project at `%USERPROFILE%\.tauri\undertone-updater.key`; keep it backed up and never commit or share it. The matching public key is embedded in `src-tauri/tauri.conf.json`.

После сборки: `src-tauri/target/release/undertone.exe`. Установщик: `src-tauri/target/release/bundle/nsis/`.

Portable-поставка: `releases/Undertone-0.2.0-win64/undertone.exe`. При распространении сохраняйте рядом каталог `third-party`: notices, MPL license, точные ссылки на corresponding source и наш изменённый MPL-файл. Полный архив Symphonia в installer не требуется. [Отчёт Phase 2](reports/phase-2/REPORT.md), [исторический отчёт Phase 1.5](reports/phase-1.5/REPORT.md), [архитектура](ARCHITECTURE.md).

## Что работает

- Рекурсивный импорт MP3, FLAC, M4A, AAC, OGG и WAV, включая пути с кириллицей.
- Title, artist, album, album artist, track number, year, genre, duration, embedded cover art. При отсутствии тегов используются имя файла и понятные значения по умолчанию.
- SQLite с транзакционными нумерованными миграциями, связями, индексами, WAL. Библиотека сохраняется между запусками.
- Фоновое сканирование, прогресс, журнал ошибок и повторное сканирование. Неизменённые файлы пропускаются по пути, размеру и времени изменения. Повторный импорт сохраняет ID.
- Обложки дедуплицируются SHA-256 и кешируются до 480 px, без передачи исходного изображения через IPC.
- Главная, медиатека, поиск по тегам, сортировка, виртуализированный список и панель метаданных.
- Нативное воспроизведение, play/pause, предыдущий/следующий, автоматический переход по текущему списку, seek, volume, mute. Переход между страницами не прерывает музыку.
- Выбор нескольких источников через системный диалог или ввод пути.
- Исполнители и альбомы с отдельными страницами, любимые треки, создание и редактирование плейлистов. Меню ⋯ добавляет треки и меняет порядок; трек можно перетащить на плейлист в боковой панели. Повторы допустимы.
- Очередь текущего сеанса: слушать следующим, добавить в конец, переместить, убрать, очистить следующие. Перезапуск приложения очищает очередь.
- Локальный поиск по словам в тегах, сортировка названия/исполнителя/альбома/длительности/года/даты импорта в обоих направлениях. Плейлисты сохраняют ручной порядок.
- История успешных запусков хранится в SQLite; интерфейс показывает последние 200. Пауза, продолжение и перемотка не создают новых событий. Продолжительность фактического прослушивания пока не учитывается.

Оригинальные музыкальные файлы не изменяются. Проверка и загрузка обновлений выполняется только по кнопке в настройках. Данные находятся в `%APPDATA%\local.undertone.desktop\`: `library.sqlite3`, `covers/`.

## Структура

```text
src/
  App.tsx              Навигация, главная, импорт
  TrackList.tsx        Виртуальная таблица
  player.tsx           Контроллер и панель проигрывателя
  ui.tsx, types.ts      Обложки и типы IPC
  styles.css           Тёмный адаптивный интерфейс
src-tauri/
  src/main.rs          Tauri-команды и состояние приложения
  src/database.rs      SQLite, миграции, чтение библиотеки
  src/scanner.rs       Фоновая индексация и повторный импорт
  src/metadata.rs      Lofty и кеш обложек
  src/audio.rs         Один OutputStream и Sink на отдельном потоке
  src/audio_source.rs  Прозрачный bypass / bandlimited SRC, channel mapping
  src/providers.rs     Контракты metadata, lyrics, AI, embeddings, recommendations, downloads
  src/services/        Optional desktop-only slskd config (без клиента)
  src/tests.rs         Проверки импорта и аудио
  migrations/          Версионируемая SQL-схема
```

Метаданные читаются через [Lofty](https://docs.rs/lofty/0.25.1/lofty/). Звук декодируется [Rodio/Symphonia](https://docs.rs/rodio/0.21.1/rodio/), включая M4A/AAC. Каждый сбой чтения отдельного трека записывается и не останавливает импорт остальных.

## Проверка на настоящей музыке

```powershell
cargo test --manifest-path src-tauri/Cargo.toml real_library_and_audio_smoke -- --ignored --nocapture
```

Этот явный тест импортирует `F:\Music` в отдельную БД `%TEMP%\undertone-live-smoke`, кратко воспроизводит FLAC и MP3 каждой найденной частоты при 100/80/50%, проверяет паузу, seek, resume, stop и отсутствие дублей при повторном сканировании. Обычный `npm test` не требует аудиоустройства и не трогает `F:\Music`.

Phase 1.5 устраняет наложение очередей при переключении, ранний MP3 clamp и неправильное преобразование начала трека. Несовпадающие sample rates преобразуются Rubato; совпадающие проходят без SRC. Громкость применяется один раз, без EQ, ReplayGain, нормализации или limiter. На 100% корректные восстановленные пики некоторых записей могут превышать full scale; результаты PCM и границы аппаратной проверки указаны в отчёте.

## Границы Phase 1

Фаза 2: отдельные страницы исполнителей и альбомов, лайки, плейлисты, редактируемая очередь. Фаза 3: lyrics. Фаза 4: смысловой анализ и embeddings. Фаза 5: vibe-поиск и Daily Vibe. Фаза 6: дальнейшая оптимизация и полировка.

Пока нет наблюдения за изменениями файлов в реальном времени — используйте «Обновить библиотеку». Пропавшие файлы сохраняются в библиотеке; при попытке воспроизведения показывается ошибка. Дедупликация Phase 1 предотвращает повторную запись одного пути; объединение разных файлов по звучанию/метаданным остаётся последующей работе. Shuffle, repeat, Windows media controls, запись тегов и сохранение позиции/громкости между перезапусками ещё не реализованы. Метаданные передаются одним компактным снимком, а DOM виртуализирован; при существенно больших объёмах можно перейти к постраничному IPC.
