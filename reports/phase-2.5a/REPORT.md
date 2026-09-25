# Phase 2.5a — slskd connection only (Undertone 0.2.1)

## Изменения

- `src-tauri/src/services/slskd.rs`: прежняя loopback URL validation, SlskdProvider, чтение/сохранение настроек и один авторизованный GET `/api/v0/application`.
- `src-tauri/src/services/windows_secrets.rs`: Windows backend существующего SecretStore через CredReadW/CredWriteW/CredDeleteW.
- `src-tauri/src/services/slskd_tests.rs`: mock HTTP tests и отдельный round-trip Windows Credential Manager.
- `src-tauri/migrations/004_slskd_settings.sql`, `src-tauri/src/database.rs`: таблица singleton settings с server_url и SecretRef; существующие tracks не изменяются.
- `src-tauri/src/services/mod.rs`, `src-tauri/src/main.rs`: feature/Windows gating, три IPC-команды settings/save/check и признак доступности feature. Работа с vault/HTTP вынесена в spawn_blocking.
- `src/SoulseekSettings.tsx`, `src/App.tsx`: небольшой Settings → Soulseek dialog; password input, сохранение и test connection, Connecting/Connected/Authentication failed/Unreachable/Not configured.
- Cargo/package manifests и lockfiles, Tauri config: версия 0.2.1; optional reqwest/windows-sys, desktop/package scripts явно включают slskd. Default Cargo features остаются пустыми.
- `scripts/licenses.py` и генерируемые third-party notices/SBOM: учёт явно выбранной feature при inventory.

## Границы

Клиент использует X-API-Key; ключ не возвращается в frontend при чтении настроек. Header помечен sensitive. Ошибки HTTP/TLS/JSON и тела ответов не логируются и не возвращаются как диагностический текст. Из ответа наружу передаётся только статус и boolean server.isConnected; версия проверяется как часть ожидаемой структуры, но не отображается как произвольный серверный текст.

URL допускает только loopback IPv4/IPv6 или localhost, без userinfo/query/fragment. localhost фиксируется на 127.0.0.1 без DNS; для IPv6 можно явно указать `[::1]`. Прокси и redirects отключены, TLS-сертификаты проверяются системным TLS. Connect timeout — 2 s, общий timeout — 4 s, ответ ограничен 64 KiB. Базовый path URL поддерживается.

Connected означает, что внешний slskd принял API key и вернул ожидаемое состояние. Соединение самого slskd с Soulseek отображается отдельно и может быть отключено.

Windows Credential Manager хранит generic credential текущего пользователя с локальной persistence, target `Undertone/slskd/<random-id>`. SQLite хранит только URL и эту ссылку. Новый ключ сначала записывается в vault, затем ссылка коммитится в SQLite; при отказе SQLite новый credential удаляется. После успешной замены прежний credential удаляется. Пустое поле API key сохраняет текущую ссылку. При недоступном vault нет plaintext fallback.

DownloadProvider переиспользован как существующий контракт, но `completed_files` явно возвращает unsupported; никаких HTTP download методов, поиска, процесса slskd или Soulseek protocol нет. Mobile backend не реализован.

## Проверки

`cargo test --manifest-path src-tauri/Cargo.toml --features slskd services::slskd -- --nocapture`: **5 passed** (группированные сценарии), остальные tests отфильтрованы.

- GET с правильным X-API-Key и ожидаемым path → Connected, в том числе при отключённом Soulseek server.
- 401 и 403 → Authentication failed; response body с тестовым секретом не попадает в результат.
- Закрытый локальный порт → Unreachable.
- Внешний URL, LAN, URL credentials/query, неправильный scheme → rejection до HTTP и сохранения секрета.
- Невалидный JSON, отсутствующие/неверные поля, большой ответ → Unreachable с фиксированным сообщением.
- Redirect не выполняется.
- SQLite/WAL и сериализованные settings не содержат тестовый ключ; замена и rollback оставляют ровно один credential.
- Реальный Windows vault write/read/delete прошёл; тестовый credential удалён.
- Test log отдельно проверен на отсутствие тестовых credentials.

Feature-on и feature-off `cargo check` прошли. Production build: `npm run package` (TypeScript/Vite + Rust release + NSIS) — **PASS**, см. `production-build.log`. Installer: `src-tauri/target/release/bundle/nsis/Undertone_0.2.1_x64-setup.exe` (4 788 211 bytes).

Computer Use и regression Phase 1–2 не запускались. Процесс slskd, стандартный `%LOCALAPPDATA%/slskd/slskd.yml` и слушатель 5030 не обнаружены; live integration не выполнялась. Автоматической установки не было.

## Источники API и дальнейшая работа

Контракт проверен только по официальным [ApplicationController](https://github.com/slskd/slskd/blob/master/src/slskd/Core/API/Controllers/ApplicationController.cs), [State](https://github.com/slskd/slskd/blob/master/src/slskd/Core/State.cs) и [API-key authentication](https://github.com/slskd/slskd/blob/master/src/slskd/Common/Authentication/ApiKeyAuthentication.cs). Код slskd не включён в Undertone.

Для Phase 2.5b остаются отдельные search API/provider и источник результатов поиска. Эта работа не начата; downloads/Download Manager, lyrics и AI также вне текущего scope.
