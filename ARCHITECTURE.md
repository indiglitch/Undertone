# Undertone: локальная библиотека

## Реализовано

Tauri shell (`main.rs`) вызывает платформонезависимые database/scanner/metadata и отдельный audio worker. Provider traits находятся в `providers.rs`: MetadataProvider, LyricsProvider, AIAnalysisProvider, EmbeddingProvider, RecommendationEngine. MetadataProvider уже используется: LocalMetadata вызывает прежний Lofty importer. Остальные traits — контракты без клиентов, модели или фоновых расходов. Обязательных cloud SDK нет.

Единый вход `scanner::import_files(db, paths, state, provider)` принимает законченные локальные файлы. Обнаружение папок в `scan` передаёт файлы туда же. Канонизация пути, проверка файла/расширения/размера, чтение метаданных и единственный transactional upsert общие. `ON CONFLICT(path) DO UPDATE` сохраняет track ID. Повреждённые файлы изолируются в scan_errors. Импорт проверяет читаемость локального аудио.

Migration 002 переименовывает music_folders в library_folders и добавляет track_identities. Существующие tracks не пересоздаются. У каждой строки есть прежний INTEGER ID и отдельный случайный 128-bit sync_id (32 hex), заполненный миграцией/INSERT trigger. Sync ID не зависит от абсолютного пути и не является акустическим fingerprint. Два независимо импортированных экземпляра песни на разных устройствах пока получают разные sync_id: будущее сопоставление должно явно объединять идентичности, не подменять локальные ID.

Migration 003 добавляет likes, playlists, playlist_tracks и listening_history. Все ссылки ведут на прежние tracks(id); playlist entry имеет свой ID, поэтому повтор одного трека перемещается независимо. Коллекции изменяются транзакционно в collections.rs. История записывает только успешный Play после ответа audio worker; ошибка сохранения истории показывается отдельно и не маскирует запущенное аудио. UI читает последние 200 событий, база сохраняет все.

React-контроллер держит очередь текущего сеанса с отдельными ключами записей и курсором. Изменять можно только следующие записи. Навигация не пересоздаёт player. Поиск использует SearchSource из libraryModel.ts и единственный локальный адаптер; результаты содержат source и необязательный localTrackId. Search ищет только треки, альбомы, исполнителей и плейлисты локальной библиотеки.

## Дальнейшие migrations

Все локальные связи используют `REFERENCES tracks(id)`; открытие каждого соединения включает foreign_keys. Для sync сериализуется sync_id, абсолютные пути остаются локальными. Удаление/merge требует отдельной миграции и политики, текущие 912 строк не удаляются.

| Будущая таблица | Ключи и ограничения |
|---|---|
| likes (уже есть) | track_id PK/FK, liked_at; sync revision/tombstone позже |
| playlists (уже есть) | local id, unique sync_id, name, description, updated_at; revision позже |
| playlist_tracks (уже есть) | entry id PK, playlist_id FK, track_id FK, UNIQUE(playlist_id,position); повтор песни допустим |
| listening_history (уже есть) | unique event sync_id, track_id FK, played_at; listened_ms позже |
| lyrics | track_id FK, plain/LRC, origin, provider/version, manual flag, revision/content hash |
| track_analysis | track_id FK, input_hash, model/version, prompt/schema version, themes/summary/vibe, валидированные scores |
| embeddings | track_id FK, model/version, dimensions, input_hash, vector; размер вектора проверяется до записи |
| library_folders (уже есть) | canonical path PK; enabled/watch mode добавить при реализации watcher |

LyricsProvider возвращает embedded/plain/synchronized local LRC или результат заменяемого external provider. `accepts_automatic_update()` запрещает замену manual lyrics. В Phase 3 запись обязана повторно проверять manual flag/origin и ожидаемую revision в одном SQL UPDATE, чтобы сетевой ответ не затёр пользовательскую правку. Приоритет: manual → local LRC → embedded synced → embedded plain → optional external. External lookup запускается только явно для одного трека и кеширует success/not_found/ambiguous/temporary_error; feature `external-lyrics` выключен по умолчанию и исключён из mobile builds.

External lyrics provider rights/licensing must be verified per distribution target.

AIAnalysisProvider и EmbeddingProvider сообщают Local по умолчанию; CloudOptIn требует отдельного явного выбора в будущих настройках. Ключ кеша: hash нормализованных lyrics + используемых metadata + модели/version + prompt/schema version. Анализ запускается после изменения входа и сохраняется; при старте читается кеш. Scores включают energy, positivity, negativity, melancholic, nostalgic, romantic, aggressive, relaxing, dreamy, uplifting. Диапазоны и модельные версии проверяет будущая persistence-служба.

Будущий RecommendationEngine будет читать сохранённые embeddings, scores, themes, genres, likes/history. Свободный запрос кодируется локальным embedding provider; Daily Vibe использует локальное ранжирование и дневной seed, без LLM-вызова на каждый плейлист. Модели и ранжирование сейчас не реализованы.

## Local-library-first

Пользователь добавляет собственные папки в Library. Search не обращается к сетевому музыкальному каталогу. Общие scanner/import_files/metadata остаются единственным intake локальных файлов.

Версии миграций 4/5 зарезервированы как retired no-op. Старые неиспользуемые preference tables не читаются; автоматическое удаление credentials или пользовательских файлов не выполняется. Обновления приложения, внешние lyrics и перенос собственных файлов PC↔phone — независимые системы.

## Audio

Decoder → float32 PCM → bypass или bandlimited device-rate SRC → явное channel mapping → одна очередь Sink → volume один раз → один Mixer/OutputStream → CPAL/Windows. Одинаковая частота обходит SRC. MP3 и FLAC используют тот же последующий путь. Нет ReplayGain, normalization, EQ, limiter/compressor, скрытого gain или параллельного HTML audio.

Поддерживаемые source channels сейчас mono/stereo. Mono дублируется, stereo→mono усредняется; многоканальный output заполняется front L/R, остальные каналы нулевые. Многоканальный исходник отклоняется явно. Устройство открывается один раз на audio worker; переключение системного устройства/ASIO/exclusive mode — отдельная будущая работа. Параллельные отдельно запущенные экземпляры приложения имеют собственные audio workers.
