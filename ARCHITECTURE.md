# Undertone: границы после Phase 2

## Реализовано

Tauri shell (`main.rs`) вызывает платформонезависимые database/scanner/metadata и отдельный audio worker. Provider traits находятся в `providers.rs`: MetadataProvider, LyricsProvider, AIAnalysisProvider, EmbeddingProvider, RecommendationEngine, desktop-only DownloadProvider. MetadataProvider уже используется: LocalMetadata вызывает прежний Lofty importer. Остальные traits — контракты без клиентов, модели или фоновых расходов. Обязательных cloud SDK нет.

Единый вход `scanner::import_files(db, paths, state, provider)` принимает законченные локальные файлы. Обнаружение папок в `scan` передаёт файлы туда же. Канонизация пути, проверка файла/расширения/размера, чтение метаданных и единственный transactional upsert общие. `ON CONFLICT(path) DO UPDATE` сохраняет track ID. Повреждённые файлы изолируются в scan_errors. Это проверка читаемого локального аудио, не антивирус и не доказательство полноты скачивания.

Migration 002 переименовывает music_folders в library_folders и добавляет track_identities. Существующие tracks не пересоздаются. У каждой строки есть прежний INTEGER ID и отдельный случайный 128-bit sync_id (32 hex), заполненный миграцией/INSERT trigger. Sync ID не зависит от абсолютного пути и не является акустическим fingerprint. Два независимо импортированных экземпляра песни на разных устройствах пока получают разные sync_id: будущее сопоставление должно явно объединять идентичности, не подменять локальные ID.

Migration 003 добавляет likes, playlists, playlist_tracks и listening_history. Все ссылки ведут на прежние tracks(id); playlist entry имеет свой ID, поэтому повтор одного трека перемещается независимо. Коллекции изменяются транзакционно в collections.rs. История записывает только успешный Play после ответа audio worker; ошибка сохранения истории показывается отдельно и не маскирует запущенное аудио. UI читает последние 200 событий, база сохраняет все.

React-контроллер держит очередь текущего сеанса с отдельными ключами записей и курсором. Изменять можно только следующие записи. Навигация не пересоздаёт player. Поиск использует SearchSource из libraryModel.ts и единственный локальный адаптер; результаты содержат source и необязательный localTrackId. Будущий внешний источник не сможет передать внешний ID как локальный без импорта. Клиент slskd не добавлен, importer и provider contracts Phase 1.5 используются без дублирования.

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
| downloads (desktop only) | job id, external job id, status, temporary path; nullable track_id FK после успешного импорта |
| library_folders (уже есть) | canonical path PK; enabled/watch mode добавить при реализации watcher |

LyricsProvider возвращает embedded/plain/synchronized local LRC или результат заменяемого external provider. `accepts_automatic_update()` запрещает замену manual lyrics. В Phase 3 запись обязана повторно проверять manual flag/origin и ожидаемую revision в одном SQL UPDATE, чтобы сетевой ответ не затёр пользовательскую правку. Приоритет: manual → local LRC → embedded synced → embedded plain → optional external. External lookup запускается только явно для одного трека и кеширует success/not_found/ambiguous/temporary_error; feature `external-lyrics` выключен по умолчанию и исключён из mobile builds.

External lyrics provider rights/licensing must be verified per distribution target.

AIAnalysisProvider и EmbeddingProvider сообщают Local по умолчанию; CloudOptIn требует отдельного явного выбора в будущих настройках. Ключ кеша: hash нормализованных lyrics + используемых metadata + модели/version + prompt/schema version. Анализ запускается после изменения входа и сохраняется; при старте читается кеш. Scores включают energy, positivity, negativity, melancholic, nostalgic, romantic, aggressive, relaxing, dreamy, uplifting. Диапазоны и модельные версии проверяет будущая persistence-служба.

Будущий RecommendationEngine будет читать сохранённые embeddings, scores, themes, genres, likes/history. Свободный запрос кодируется локальным embedding provider; Daily Vibe использует локальное ранжирование и дневной seed, без LLM-вызова на каждый плейлист. Модели и ранжирование сейчас не реализованы.

## slskd, платформы и секреты

`services/slskd.rs` доступен только при feature `slskd` и не на ios/android. По умолчанию feature выключена. DownloadProvider отсутствует на мобильных target, в том числе контракт удалённого запуска скачивания на PC. slskd.exe, его исходники, HTTP-клиент и Soulseek protocol в поставке отсутствуют.

Будущий desktop flow: UI поиска → localhost HTTP API отдельно установленного slskd → завершённое скачивание → проверка завершения/пути/файла → существующий `import_files` → SQLite → lyrics → cached local analysis. Все ручные файлы, watched folders и полученные sync-файлы используют этот же importer. `.part` и незавершённые файлы не передаются. Контроллер скачивания должен проверить, что canonical path находится в согласованной download-папке, не доверяя пути из API. Несколько library_folders уже поддерживаются; filesystem watcher будет лишь источником путей с debounce/проверкой стабильности файла.

SlskdConfig валидирует HTTP(S) URL: только localhost/loopback IP, без userinfo, query, fragment; API key хранится как SecretRef. Будущий HTTP-клиент дополнительно фиксирует loopback-адрес соединения, запрещает redirect наружу и не пишет ключ в URL/логи. Внешний slskd отдельно управляет Soulseek credentials; приложение не получает пароль без необходимости.

SecretStore — контракт get/put/remove с непрозрачным SecretRef. Windows-реализация позже использует Credential Manager, iOS Keychain, Android Keystore-backed storage. Адаптер ещё не реализован, секреты сейчас не принимаются и не сохраняются. SQLite/config смогут содержать только ссылки, не API keys/passwords/tokens. Этот контракт не является заявлением об уже реализованном шифровании.

Будущие mobile shells переиспользуют библиотеку/метаданные/lyrics/analysis/recommendation и отделяют свой audio/device adapter. Текущий Windows shell не является готовым mobile build; сборки iOS/Android не выполнялись. В sync DTO не экспортируются download jobs, slskd URL/ключи или источник Soulseek. После импорта файл — обычный локальный track. Телефон может работать самостоятельно. PC↔phone sync предполагает собственные файлы/metadata/settings с revision/tombstone и сопоставлением sync_id; публичный cloud-каталог не создаётся.

Обложки сейчас извлекаются из embedded art с нейтральным fallback. Будущий порядок: embedded → user-selected → placeholder; внешняя загрузка заменяемая и необязательная. Запись тегов и user-selected artwork ещё не добавлялись.

## Audio

Decoder → float32 PCM → bypass или bandlimited device-rate SRC → явное channel mapping → одна очередь Sink → volume один раз → один Mixer/OutputStream → CPAL/Windows. Одинаковая частота обходит SRC. MP3 и FLAC используют тот же последующий путь. Нет ReplayGain, normalization, EQ, limiter/compressor, скрытого gain или параллельного HTML audio.

Поддерживаемые source channels сейчас mono/stereo. Mono дублируется, stereo→mono усредняется; многоканальный output заполняется front L/R, остальные каналы нулевые. Многоканальный исходник отклоняется явно. Устройство открывается один раз на audio worker; переключение системного устройства/ASIO/exclusive mode — отдельная будущая работа. Параллельные отдельно запущенные экземпляры приложения имеют собственные audio workers.
