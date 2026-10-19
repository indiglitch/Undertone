# iOS Simulator Checks

Отдельный ручной workflow: `.github/workflows/ios-tests.yml`.
Существующие `ios.yml` (IPA для SideStore), `ios-resignable.yml` и подпись IPA не изменены.

## Что запускается

- Нативный SwiftUI/iOS 26+ проект генерируется XcodeGen из `ios/project.yml` в `ios/Undertone.xcodeproj`. Workspace не используется.
- Схема `Undertone`: приложение, unit target `UndertoneTests`, UI target `UndertoneUITests`.
- Runner `macos-26`; выбирается старшая установленная стабильная Xcode 26. Выбор и SDK записываются в артефакт. Новые Xcode/Simulator runtime не скачиваются.
- Из установленных доступных iOS runtime выбирается старший версии 26+ не новее Simulator SDK выбранного Xcode. Два iPhone выбираются из существующих device types: сначала 16e/16/15/14, второй — 16/15/14 Pro Max. Это два размера, а не обещание конкретной модели. Если совместимых ресурсов нет, job падает с пояснением.
- `build-for-testing` компилирует приложение и оба test targets. На первом размере выполняется полный доступный unit/UI набор; на втором — `SimulatorSmokeTests`. Параллельные тестовые workers отключены, чтобы общая тестовая библиотека не менялась конкурентно. Ошибки не повторяются автоматически и не скрываются.
- Smoke проходит Home → collection → Back, Search и последний элемент длинного списка над dock, Library, мини-плеер, Now Playing → Queue → закрытие и возврат нижних панелей. В контрольных точках сохраняются screenshots как XCTest attachments с `keepAlways`; при провале — последний экран. Это функциональные проверки и снимки, не автоматическая оценка визуального качества.

## Ограничение сети

`LibraryTests.testDownloadQueueTransfersPinnedOriginal` явно исключён: этому тесту нужен реальный локальный сервис ПК и `network-pairing.json`. Новый workflow не создаёт сертификаты, токены или сетевую фикстуру. Остальные persistence/install/queue tests используют существующие временные синтетические данные. UI — через `--ui-fixture`; smoke работает офлайн. Пропущенный сетевой тест нельзя считать пройденным. В исходном IPA workflow его подготовка сохранена.

## Как запустить из Windows

1. Включить новый workflow, helper, smoke-тест и остальные нужные исходники в свою ветку и отправить её на GitHub обычным процессом разработки. Локальные незакоммиченные файлы runner не видит. Эта задача не выполняет commit/push.
2. Новый `workflow_dispatch` должен присутствовать в default branch, чтобы GitHub показал ручной запуск; после этого можно выбрать другую ветку с этим workflow для проверки.
3. В репозитории открыть **Actions → iOS Simulator Checks → Run workflow**, выбрать нужную ветку и нажать **Run workflow**. Push, PR и schedule триггеров у нового workflow нет.
4. Открыть run. В Summary указаны результаты compilation, основного набора и второго размера. Второй smoke запускается после провала основного набора, если компиляция успешна и run не отменён. Провал первого набора всё равно оставляет run красным.

## Где скачать результаты

Внизу Summary run → **Artifacts → ios-simulator-results** (срок хранения 7 дней). Внутри:

- `xcode-version.txt`, `sdks.txt`, `project-targets.txt`, `devices.json` и `simulator-inventory.json` — фактическая среда;
- `build.log`, `primary-tests.log`, `secondary-tests.log` — существующие этапы, включая ошибки;
- `Build.xcresult`, `Primary.xcresult`, `Secondary.xcresult` — созданные Xcode result bundles. На Mac открыть двойным нажатием в Xcode;
- `Primary-summary.json` / `Secondary-summary.json` — экспортированные результаты, если формат поддерживается выбранным Xcode;
- `Primary-attachments/` / `Secondary-attachments/` — скриншоты, другие тестовые attachments и `manifest.json` с соответствием именам тестов/устройств. PNG доступны и на Windows.

Сбор результатов и upload выполняются с `always()`, включая провал компиляции/тестов. Файл появляется только если соответствующий этап успел его создать. При ошибке экспорта исходный `.xcresult` остаётся в артефакте; смотри `*-export.log`. Отмена runner или общий timeout могут прервать upload — сохранение в таких случаях не гарантируется.

## Границы данных и проверки

Job имеет только `contents: read`, checkout не сохраняет Git credentials. Signing отключён; secrets, сертификаты и provisioning profiles не подключаются. Upload ограничен `ios/ci-output/`; DerivedData, app sandbox, Keychain, IPA и pairing-файлы не собираются. Нельзя добавлять реальные коды подключения в тестовые данные или диагностические вложения.

Локально на Windows проверяются YAML, shell syntax и логика выбора runtime/devices. Компиляция Swift и UI считаются проверенными только после реально завершённого GitHub Actions run и анализа результатов. Список тестов в исходниках и этот документ не подтверждают их прохождение.

Контракты: [GitHub — manual workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow), [образ macOS 26](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md).
