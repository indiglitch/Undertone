# Phase 8 dependency map (before removal)

- App -> useDownloadSession/DownloadManager -> DownloadSession/downloadModel -> slskd_download_start/status/cancel/finalize.
- App -> persistent CollectionView -> SearchPage -> SoulseekSearchView -> RemoteSearchResult/soulseekSearch -> slskd_search/settings; remote requests/filter/query/status state.
- App -> SoulseekSettings: contains both remote credentials/server/download root and independent general/appearance/player/library/update/PhoneSync settings. Keep independent settings as AppSettings.
- navigationModel/libraryModel/App sidebar -> downloads route, counters, helper and tooltip. Old sidebar order normalization already filters unknown IDs.
- main.rs -> soulseek_commands -> services/slskd search/download/finalize adapters -> providers remote DTO/contracts -> Windows/portable credential stores.
- Cargo slskd feature -> reqwest + windows-sys; reqwest is independently required by external lyrics. windows-sys credential dependency is remote-only. services module has no independent children.
- migrations 4/5 -> remote settings/finalizations. Keep schema version slots as retired no-ops; existing installed DB tables become unread, never drop user music or credentials automatically.
- bulk_lyrics RecentDownloads scope queries remote finalizations. Remove this scope/option/test only; preserve AllLibrary indexing and Lyrics providers.
- scanner import_audio_file_with_provider/intake -> folder scan and metadata upsert. Preserve generic import and scanner tests.
- CSS across SearchPage/styles/glass/uiPolish/desktop/mobile/identity: remove remote/download-only selector portions, preserve mixed generic settings/error/update selectors.
- Tests/scripts: remove remote-only tests, retain local Search ranking/normalization/recent/category and queue/player tests; strip removed fake IPC/UI assertions.
- Independent download words: app updater, CI artifacts, model asset acquisition, iOS/phone-sync transfer of the user's own local library. Preserve these; historical reports remain historical evidence.

Removal is code cleanup; no installed app/database/music files are modified.
