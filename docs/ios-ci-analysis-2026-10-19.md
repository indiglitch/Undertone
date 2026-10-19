# iOS Simulator Checks — предоставленный артефакт

Дата анализа: 19 октября 2026. Архив пользователя: `ios-simulator-results.zip`.
SHA-256: `a3538d362e6efd52c94b78b61e49dc14365b3ec23b63aec5b901055b8705e56e`.
Commit/run URL в архив не включены. Результаты относятся к этому архиву, не к исправленному рабочему дереву.

| Проверка | Подтверждённый результат |
| --- | --- |
| Compile | Успешно, Xcode 26.6 / 17F113, macOS 26.6.2; приложение и оба test targets |
| iPhone 16e / iOS 26.5 | 76 unit passed; UI 42 passed / 29 failed. Итого 118 passed / 29 failed / 0 skipped |
| iPhone 16 Pro Max / iOS 26.5 | 1 smoke failed по лимиту 120 секунд, 0 passed |
| Pinned-PC network | Исключён командой xcodebuild, не выполнялся; это не skipped test в summary |
| Скриншоты | Primary — 7 smoke checkpoints; Secondary — 5 до прерывания |

Прочитаны логи, summaries `xcresulttool`, экспортированные failure descriptions/UI hierarchies и screenshot manifest; осмотрены screenshots и кадры recordings. Метаданные Build/Primary/Secondary `.xcresult` имеют формат 3.58. Бинарный object store не декодировался повторно на Windows; исходные bundles сохранены в QA-папке вместе с экспортами.

## Все группы сбоев primary

| Suite | Failed/total | Вывод и исправление для повторного запуска |
| --- | --- | --- |
| ComputerInteractionTests | 5/6 | Неоднозначный COMPUTER: совпадают меню и Home tile. Добавлен homeToolsComputer, тест нажимает конкретное действие. Эти пять тестов не достигли проверяемых состояний ПК. |
| ContextMenuInteractionTests | 5/9 | File Info не открыл экран; Menu получает явный route/sheet. Меню трека в mini-player не содержит playlist membership — выбор ограничен foreground List. Bulk menu оформлено borderless. Saved-album removal требует повторного подтверждения после scoping, не объявляется успешным. |
| HomeNavigationTests | 1/4 | Restore позиции не выполнил predicate; нормализованы координаты с contentInsets, точность проверки сохранена. |
| LibraryCollectionsTests | 4/7 | CREATE PLAYLIST дублируется на фоне; отдельный submit ID. Длинный navigation title превысил лимит query 128 символов — используется NSPredicate. PLAY/track selection ограничены collection List, чтобы не выбирать mini-player. |
| MobileFoundationTests | 1/4 | Строгое menu+12 ≤ dock не прошло на 0.333 pt. Общий content margin увеличен на 4 pt; assertion сохранён. |
| NowPlayingInteractionTests | 5/8 | Clipped Lyrics targets требуют reveal внутри viewport. Queue lookup исключает фон Player; transport size учитывает только floating-point шум 0.001 pt. |
| SearchInteractionTests | 2/9 | Отрицательные проверки видели Midnight city в mini-player. Проверяется отсутствие результата в musicSearchList. |
| SettingsInteractionTests | 4/5 | Native slider midpoint доставил 7 s: проверяются endpoints. Switch ожидает реальное изменение value. Reveal проверяет положение относительно dock перед tap History/confirmation. |
| UnifiedInterfaceTests | 2/11 | 26 pt Downloads label исправлен внутри Button/NavigationLink. Select toolbar стал компактным, освобождая место заголовку коллекции. |
| DownloadsInteractionTests | 0/7 | Все семь прошли в предоставленном run. |
| SimulatorSmokeTests | 0/1 | Primary прошёл; Secondary с тем же сценарием превысил лимит. Теперь три независимых теста с теми же checkpoint/assertions, без увеличения лимита. |

76 unit-тестов прошли, включая модели Queue/Search/PlayerPresentation/ComputerPresentation, локализацию Settings и install/persistence. Это не доказывает отсутствующие сетевые или пользовательские сценарии.

Новые исправления **не запускались в GitHub Actions**. Точная проверка saved album, bulk membership, Lyrics и Settings confirmations остаётся открытой до нового run; успешная компиляция предыдущего run не доказывает компиляцию этих изменений.

## Повторить

Полный `iOS Simulator Checks` на исправленной ветке: compilation, unit/UI primary и все три smoke secondary. Скачать новый `ios-simulator-results`, проверить failures/skips, screenshots и source-commit.txt/workflow-run-url.txt. Успех фиксировать только по реальному run. Дополнительно остаются pinned-PC transfer, реальный QR/камера, iOS 26.0 fallback, Dynamic Type/VoiceOver и физический iPhone.

Бизнес-обработчики воспроизведения, файлов, коллекций и синхронизации не менялись. Предупреждения PCDiscovery/Swift 6, Vorbis и vendor stb_vorbis отмечены, но не исправлялись как несвязанные с текущими UI-сбоями.

## Подготовка изменений перед отправкой

19.10.2026 повторены 4 Python-теста и синтаксические проверки YAML/всех 9 Bash run-шагов; diff --check успешен. Сохранены остальные UI test methods и 7 smoke screenshot checkpoints. Дополнительно устранён глобальный поиск Midnight city в проверке playlist membership: ожидаемое отсутствие проверяется в списке коллекции, а сохранение mini-player — отдельно. Assertions не отключались; лимиты CI не увеличивались.

По дополнительному запросу пользователя добавлен общий iOS Share Original с читаемым именем и побайтовой временной копией, без изменения исходника/протокола. Пять OriginalFileExportTests добавлены, но не выполнялись. В следующем полном run проверить их наряду с исправлениями UI. Ни новый успешный build, ни новый успешный XCTest run пока не подтверждены. Commit/push ожидают подтверждения пользователя.
