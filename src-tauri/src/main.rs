#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use undertone::{audio, database, lyrics, scanner};
#[cfg(target_os = "windows")]
mod system_actions;

use database::{Database, Library};
use scanner::{Progress, ScanState};
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

#[tauri::command]
async fn collections(
    db: State<'_, Database>,
) -> Result<undertone::collections::Collections, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || undertone::collections::snapshot(&db))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn collection_action(
    db: State<'_, Database>,
    action: undertone::collections::Action,
) -> Result<undertone::collections::Collections, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || undertone::collections::apply(&db, action))
        .await
        .map_err(|e| e.to_string())?
}
#[derive(serde::Serialize)]
struct PlaybackReply {
    #[serde(flatten)]
    status: audio::Status,
    warning: Option<String>,
}

#[tauri::command]
async fn library(db: State<'_, Database>, app: tauri::AppHandle) -> Result<Library, String> {
    let db = db.inner().clone();
    let scope = app.asset_protocol_scope();
    tauri::async_runtime::spawn_blocking(move || {
        allow_cached_artwork(&scope, &db.covers)?;
        db.library()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn track_metadata_details(track_id: i64, db: State<'_, Database>) -> Result<database::TrackMetadataDetails, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.track_metadata_details(track_id))
        .await
        .map_err(|_| "Track metadata could not be loaded".to_string())?
}

#[tauri::command]
async fn playback_session(
    db: State<'_, Database>,
) -> Result<undertone::playback_session::PlaybackSession, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || undertone::playback_session::load(&db))
        .await
        .map_err(|_| "Playback session is unavailable".to_string())?
}

#[tauri::command]
async fn playback_playable_track_ids(db: State<'_, Database>) -> Result<Vec<i64>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        undertone::playback_session::playable_track_ids(&db)
    })
    .await
    .map_err(|_| "Playback session is unavailable".to_string())?
}

#[tauri::command]
async fn save_playback_session(
    db: State<'_, Database>,
    session: undertone::playback_session::PlaybackSession,
) -> Result<undertone::playback_session::PlaybackSession, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || undertone::playback_session::save(&db, session))
        .await
        .map_err(|_| "Playback session could not be saved".to_string())?
}

#[tauri::command]
async fn deleted_songs_settings(
    db: State<'_, Database>,
) -> Result<undertone::trash::DeletedSongsSettings, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || undertone::trash::settings(&db))
        .await
        .map_err(|_| "Deleted songs settings are unavailable".to_string())?
}

#[tauri::command]
async fn save_deleted_songs_folder(
    db: State<'_, Database>,
    path: String,
) -> Result<undertone::trash::DeletedSongsSettings, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        undertone::trash::save_folder(&db, std::path::Path::new(&path))
    })
    .await
    .map_err(|_| "Deleted songs settings could not be saved".to_string())?
}

#[tauri::command]
async fn move_track_to_trash(
    track_id: i64,
    db: State<'_, Database>,
    engine: State<'_, Arc<audio::Audio>>,
) -> Result<undertone::trash::MoveTrackResult, String> {
    let db = db.inner().clone();
    let engine = engine.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let previous = engine.request(audio::Message::Control(audio::Action::Status))?;
        let stopped_current = previous.id == Some(track_id);
        if stopped_current {
            engine.request(audio::Message::Control(audio::Action::Stop))?;
        }
        match undertone::trash::move_track(&db, track_id) {
            Ok(result) => Ok(result),
            Err(error) => {
                if stopped_current {
                    if let Ok((path, duration)) = db.track(track_id) {
                        if engine
                            .request(audio::Message::Load {
                                id: track_id,
                                path,
                                duration,
                            })
                            .is_ok()
                        {
                            if previous.position > 0.0 {
                                let _ =
                                    engine.request(audio::Message::Control(audio::Action::Seek {
                                        seconds: previous.position.min(duration),
                                    }));
                            }
                            if !previous.playing {
                                let _ =
                                    engine.request(audio::Message::Control(audio::Action::Pause));
                            }
                        }
                    }
                }
                Err(error)
            }
        }
    })
    .await
    .map_err(|_| "Track move did not complete".to_string())?
}

#[tauri::command]
async fn track_file_status(track_id: i64, db: State<'_, Database>) -> Result<undertone::trash::TrackFileStatus, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || undertone::trash::track_file_status(&db, track_id))
        .await
        .map_err(|_| "Source track could not be checked".to_string())?
}

#[tauri::command]
async fn remove_missing_track(track_id: i64, db: State<'_, Database>, engine: State<'_, Arc<audio::Audio>>) -> Result<(), String> {
    let db = db.inner().clone();
    let engine = engine.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if undertone::trash::track_file_status(&db, track_id)? != undertone::trash::TrackFileStatus::Missing {
            return Err("The local file is still available".to_string());
        }
        let current = engine.request(audio::Message::Control(audio::Action::Status))?;
        if current.id == Some(track_id) {
            engine.request(audio::Message::Control(audio::Action::Stop))?;
        }
        undertone::trash::remove_missing_track(&db, track_id)
    })
    .await
    .map_err(|_| "Track removal did not complete".to_string())?
}

#[tauri::command]
async fn track_lyrics(
    db: State<'_, Database>,
    track_id: i64,
) -> Result<Option<undertone::providers::LyricsDocument>, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || lyrics::get(&db, track_id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn external_lyrics_enabled() -> bool {
    cfg!(all(
        feature = "external-lyrics",
        not(any(target_os = "ios", target_os = "android"))
    ))
}

#[tauri::command]
async fn fetch_track_lyrics(
    db: State<'_, Database>,
    app: tauri::AppHandle,
    track_id: i64,
) -> Result<undertone::external_lyrics::ExternalLyricsResult, String> {
    #[cfg(all(
        feature = "external-lyrics",
        not(any(target_os = "ios", target_os = "android"))
    ))]
    {
        let db = db.inner().clone();
        let provider = app
            .try_state::<Arc<undertone::lrclib::LrclibProvider>>()
            .ok_or_else(|| "External lyrics provider is unavailable".to_string())?
            .inner()
            .clone();
        return tauri::async_runtime::spawn_blocking(move || {
            undertone::external_lyrics::fetch(&db, track_id, provider.as_ref())
        })
        .await
        .map_err(|e| e.to_string())?;
    }
    #[cfg(not(all(
        feature = "external-lyrics",
        not(any(target_os = "ios", target_os = "android"))
    )))]
    {
        let _ = (db, app, track_id);
        Err("External lyrics provider is disabled in this build".into())
    }
}

#[tauri::command]
fn bulk_lyrics_indexing_status(
    job: State<'_, undertone::bulk_lyrics::BulkLyricsJob>,
) -> undertone::bulk_lyrics::BulkLyricsProgress {
    job.status()
}

#[tauri::command]
fn cancel_bulk_lyrics_indexing(
    job: State<'_, undertone::bulk_lyrics::BulkLyricsJob>,
) -> undertone::bulk_lyrics::BulkLyricsProgress {
    job.cancel()
}

#[tauri::command]
async fn bulk_lyrics_indexing_eligibility(
    scope: undertone::bulk_lyrics::BulkLyricsScope,
    limit: Option<usize>,
    db: State<'_, Database>,
    app: tauri::AppHandle,
) -> Result<undertone::bulk_lyrics::BulkLyricsEligibility, String> {
    #[cfg(all(
        feature = "external-lyrics",
        not(any(target_os = "ios", target_os = "android"))
    ))]
    {
        let provider = app
            .try_state::<Arc<undertone::lrclib::LrclibProvider>>()
            .ok_or_else(|| "External lyrics provider is unavailable".to_string())?;
        let provider = provider.inner().clone();
        let provider_name = undertone::providers::LyricsProvider::name(provider.as_ref()).to_owned();
        let db = db.inner().clone();
        let selection = undertone::bulk_lyrics::BulkLyricsSelection { scope, limit };
        return tauri::async_runtime::spawn_blocking(move || {
            undertone::bulk_lyrics::eligibility(&db, &provider_name, selection)
        })
        .await
        .map_err(|e| e.to_string())?;
    }
    #[cfg(not(all(
        feature = "external-lyrics",
        not(any(target_os = "ios", target_os = "android"))
    )))]
    {
        let _ = (scope, limit, db, app);
        Err("External lyrics provider is disabled in this build".into())
    }
}

#[tauri::command]
async fn start_bulk_lyrics_indexing(
    scope: undertone::bulk_lyrics::BulkLyricsScope,
    limit: Option<usize>,
    db: State<'_, Database>,
    app: tauri::AppHandle,
    job: State<'_, undertone::bulk_lyrics::BulkLyricsJob>,
) -> Result<undertone::bulk_lyrics::BulkLyricsProgress, String> {
    #[cfg(all(
        feature = "external-lyrics",
        not(any(target_os = "ios", target_os = "android"))
    ))]
    {
        let provider = app
            .try_state::<Arc<undertone::lrclib::LrclibProvider>>()
            .ok_or_else(|| "External lyrics provider is unavailable".to_string())?
            .inner()
            .clone();
        let provider: Arc<dyn undertone::providers::LyricsProvider> = provider;
        let db = db.inner().clone();
        let job = job.inner().clone();
        let selection = undertone::bulk_lyrics::BulkLyricsSelection { scope, limit };
        return tauri::async_runtime::spawn_blocking(move || {
            job.start_selected(db, provider, selection)
        })
        .await
        .map_err(|e| e.to_string())?;
    }
    #[cfg(not(all(
        feature = "external-lyrics",
        not(any(target_os = "ios", target_os = "android"))
    )))]
    {
        let _ = (scope, limit, db, app, job);
        Err("External lyrics provider is disabled in this build".into())
    }
}

fn allow_cached_artwork(
    scope: &tauri::scope::fs::Scope,
    cache: &std::path::Path,
) -> Result<(), String> {
    // Windows package virtualization can redirect each file while canonicalizing its
    // parent to the unredirected directory. Authorize files, not a guessed root.
    for entry in std::fs::read_dir(cache).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map_err(|e| e.to_string())?.is_file()
            && entry.path().extension().is_some_and(|e| e == "jpg")
        {
            scope.allow_file(entry.path()).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
#[tauri::command]
fn scan_status(state: State<'_, ScanState>) -> Progress {
    state.lock().unwrap().clone()
}
#[tauri::command]
async fn remove_library_folder(folder: String, db: State<'_, Database>) -> Result<bool, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || db.remove_library_folder(&folder))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
fn scan_folders(
    folders: Vec<String>,
    db: State<'_, Database>,
    state: State<'_, ScanState>,
) -> Result<(), String> {
    if folders.is_empty() {
        return Err("Выберите папку с музыкой".into());
    }
    for folder in &folders {
        if !std::path::Path::new(folder).is_dir() {
            return Err(format!("Папка недоступна: {folder}"));
        }
    }
    {
        let mut s = state.lock().unwrap();
        if s.running {
            return Err("Сканирование уже выполняется".into());
        }
        *s = Progress {
            running: true,
            stage: "Поиск файлов".into(),
            ..Default::default()
        };
    }
    let db = db.inner().clone();
    let state = state.inner().clone();
    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            scanner::scan(&db, folders, &state)
        }));
        let mut s = state.lock().unwrap_or_else(|e| e.into_inner());
        s.running = false;
        match result {
            Ok(Ok(())) => s.stage = "Готово".into(),
            Ok(Err(e)) => {
                s.errors += 1;
                s.stage = e;
            }
            Err(_) => {
                s.errors += 1;
                s.stage = "Сканирование прервано. Повторите импорт.".into();
            }
        }
    });
    Ok(())
}
#[tauri::command]
async fn audio_command(
    action: audio::Action,
    db: State<'_, Database>,
    engine: State<'_, Arc<audio::Audio>>,
) -> Result<PlaybackReply, String> {
    let db = db.inner().clone();
    let engine = engine.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut started = None;
        let message = match action {
            audio::Action::Play { id } => {
                let (path, duration) = db.track(id)?;
                started = Some(id);
                audio::Message::Load { id, path, duration }
            }
            other => audio::Message::Control(other),
        };
        let status = engine.request(message)?;
        let warning = started
            .and_then(|id| undertone::collections::record_start(&db, id).err())
            .map(|e| format!("Музыка играет, но историю не удалось сохранить: {e}"));
        Ok(PlaybackReply { status, warning })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn audio_meter(engine: State<'_, Arc<audio::Audio>>) -> audio::VisualizerLevels {
    engine.take_levels()
}
#[tauri::command]
fn slskd_enabled() -> bool {
    cfg!(all(feature = "slskd", target_os = "windows"))
}
#[tauri::command]
fn default_scan_folder() -> Option<&'static str> {
    #[cfg(feature = "portable")]
    { None }
    #[cfg(not(feature = "portable"))]
    { Some("F:\\Music") }
}
#[cfg(all(feature = "slskd", target_os = "windows"))]
mod soulseek_commands {
    use super::*;
    use undertone::{providers::SecretStore, services::slskd};
    #[cfg(not(feature = "portable"))]
    use undertone::services::windows_secrets::WindowsSecretStore;
    #[cfg(feature = "portable")]
    use undertone::services::portable_secrets::PortableSecretStore;
    fn secret_store(db:&Database)->Box<dyn SecretStore>{
        #[cfg(feature = "portable")]
        { Box::new(PortableSecretStore::new(db.path.parent().unwrap().to_path_buf())) }
        #[cfg(not(feature = "portable"))]
        { let _=db; Box::new(WindowsSecretStore) }
    }
    #[tauri::command]
    pub async fn slskd_settings(db: tauri::State<'_, Database>) -> Result<slskd::Settings, String> {
        let db = db.inner().clone();
        tauri::async_runtime::spawn_blocking(move || slskd::settings(&db, secret_store(&db).as_ref()))
            .await
            .map_err(|_| "Не удалось прочитать настройки")?
    }
    #[tauri::command]
    pub async fn slskd_save(
        db: tauri::State<'_, Database>,
        server_url: String,
        api_key: Option<String>,
    ) -> Result<slskd::Settings, String> {
        let db = db.inner().clone();
        tauri::async_runtime::spawn_blocking(move || {
            slskd::save(&db, secret_store(&db).as_ref(), &server_url, api_key.as_deref())
        })
        .await
        .map_err(|_| "Не удалось сохранить настройки")?
    }
    #[tauri::command]
    pub async fn slskd_check(db: tauri::State<'_, Database>) -> Result<slskd::Connection, String> {
        let db = db.inner().clone();
        tauri::async_runtime::spawn_blocking(move || slskd::check_saved(&db, secret_store(&db).as_ref()))
            .await
            .map_err(|_| "Проверка соединения не завершилась")?
    }
    #[tauri::command]
    pub async fn slskd_save_download_root(
        db: tauri::State<'_, Database>,
        download_root: Option<String>,
    ) -> Result<(), String> {
        let db = db.inner().clone();
        tauri::async_runtime::spawn_blocking(move || {
            slskd::save_download_root(&db, download_root.as_deref())
        })
        .await
        .map_err(|_| "Не удалось сохранить download root")?
    }
    #[tauri::command]
    pub async fn slskd_search(
        db: tauri::State<'_, Database>,
        query: String,
    ) -> Result<undertone::providers::SoulseekSearchResults, String> {
        let db = db.inner().clone();
        tauri::async_runtime::spawn_blocking(move || {
            slskd::search_saved(&db, secret_store(&db).as_ref(), &query)
        })
        .await
        .map_err(|_| "slskd: search failed")?
    }
    #[tauri::command]
    pub async fn slskd_download_start(
        db: tauri::State<'_, Database>,
        request: undertone::providers::SoulseekDownloadRequest,
    ) -> Result<undertone::providers::DownloadStatus, String> {
        let db = db.inner().clone();
        tauri::async_runtime::spawn_blocking(move || {
            slskd::start_download_saved(&db, secret_store(&db).as_ref(), request)
        })
        .await
        .map_err(|_| "slskd: download start failed")?
    }
    #[tauri::command]
    pub async fn slskd_download_status(
        db: tauri::State<'_, Database>,
        operation_id: String,
    ) -> Result<undertone::providers::DownloadStatus, String> {
        let db = db.inner().clone();
        tauri::async_runtime::spawn_blocking(move || {
            slskd::download_status_saved(&db, secret_store(&db).as_ref(), &operation_id)
        })
        .await
        .map_err(|_| "slskd: download status failed")?
    }
    #[tauri::command]
    pub async fn slskd_download_cancel(
        db: tauri::State<'_, Database>,
        operation_id: String,
    ) -> Result<undertone::providers::DownloadStatus, String> {
        let db = db.inner().clone();
        tauri::async_runtime::spawn_blocking(move || {
            slskd::cancel_download_saved(&db, secret_store(&db).as_ref(), &operation_id)
        })
        .await
        .map_err(|_| "slskd: download cancel failed")?
    }
    #[tauri::command]
    pub async fn slskd_download_finalize(
        db: tauri::State<'_, Database>,
        operation_id: String,
    ) -> Result<undertone::providers::DownloadFinalizeResult, String> {
        let db = db.inner().clone();
        tauri::async_runtime::spawn_blocking(move || {
            slskd::finalize_download_saved(&db, secret_store(&db).as_ref(), &operation_id)
        })
        .await
        .map_err(|_| "slskd: finalize failed")?
    }
}
fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let data_dir = undertone::data_paths::application_data_dir(
                &app.path().app_data_dir()?,
                &std::env::current_exe()?,
            ).map_err(std::io::Error::other)?;
            let db = Database::open(&data_dir).map_err(std::io::Error::other)?;
            app.manage(db);
            app.manage(undertone::bulk_lyrics::BulkLyricsJob::default());
            #[cfg(all(
                feature = "external-lyrics",
                not(any(target_os = "ios", target_os = "android"))
            ))]
            app.manage(Arc::new(
                undertone::lrclib::LrclibProvider::new().map_err(std::io::Error::other)?,
            ));
            app.manage(Arc::new(Mutex::new(Progress::default())) as ScanState);
            app.manage(Arc::new(audio::Audio::new()));
            #[cfg(feature = "portable")]
            {
                let window = app.config().app.windows.first().ok_or("missing main window")?;
                tauri::WebviewWindowBuilder::from_config(app.handle(), window)?
                    .data_directory(data_dir.join("webview2"))
                    .build()?;
            }
            Ok(())
        });
    #[cfg(all(feature = "slskd", target_os = "windows"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        library,
        track_metadata_details,
        playback_session,
        playback_playable_track_ids,
        save_playback_session,
        deleted_songs_settings,
        save_deleted_songs_folder,
        move_track_to_trash,
        track_file_status,
        remove_missing_track,
        scan_status,
        remove_library_folder,
        scan_folders,
        audio_command,
        audio_meter,
        collections,
        collection_action,
        track_lyrics,
        external_lyrics_enabled,
        fetch_track_lyrics,
        start_bulk_lyrics_indexing,
        bulk_lyrics_indexing_status,
        bulk_lyrics_indexing_eligibility,
        cancel_bulk_lyrics_indexing,
        system_actions::copy_system_text,
        system_actions::copy_cover_image,
        system_actions::show_in_file_explorer,
        slskd_enabled,
        default_scan_folder,
        soulseek_commands::slskd_settings,
        soulseek_commands::slskd_save,
        soulseek_commands::slskd_save_download_root,
        soulseek_commands::slskd_check,
        soulseek_commands::slskd_search,
        soulseek_commands::slskd_download_start,
        soulseek_commands::slskd_download_status,
        soulseek_commands::slskd_download_cancel,
        soulseek_commands::slskd_download_finalize
    ]);
    #[cfg(not(all(feature = "slskd", target_os = "windows")))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        library,
        track_metadata_details,
        playback_session,
        playback_playable_track_ids,
        save_playback_session,
        deleted_songs_settings,
        save_deleted_songs_folder,
        move_track_to_trash,
        track_file_status,
        remove_missing_track,
        scan_status,
        remove_library_folder,
        scan_folders,
        audio_command,
        audio_meter,
        collections,
        collection_action,
        track_lyrics,
        external_lyrics_enabled,
        fetch_track_lyrics,
        start_bulk_lyrics_indexing,
        bulk_lyrics_indexing_status,
        bulk_lyrics_indexing_eligibility,
        cancel_bulk_lyrics_indexing,
        system_actions::copy_system_text,
        system_actions::copy_cover_image,
        system_actions::show_in_file_explorer,
        slskd_enabled,
        default_scan_folder
    ]);
    #[allow(unused_mut)]
    let mut context = tauri::generate_context!();
    #[cfg(feature = "portable")]
    for window in &mut context.config_mut().app.windows {
        window.create = false;
    }
    builder
        .run(context)
        .expect("Unable to start Undertone");
}

#[cfg(test)]
mod artwork_tests {
    use super::*;
    #[cfg(feature = "portable")]
    #[test]
    fn portable_has_no_default_music_folder() {
        assert_eq!(default_scan_folder(), None);
    }
    #[cfg(not(feature = "portable"))]
    #[test]
    fn installed_build_keeps_default_music_folder() {
        assert_eq!(default_scan_folder(), Some("F:\\Music"));
    }
    #[test]
    fn cached_artwork_is_allowed_without_exposing_siblings() {
        let app = tauri::test::mock_app();
        let scope = app.asset_protocol_scope();
        let root = std::path::PathBuf::from(
            std::env::var("APPDATA")
                .unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().into_owned()),
        )
        .join(format!("undertone-artwork-test-{}", std::process::id()));
        let cache = root.join("обложки [тест]");
        std::fs::create_dir_all(&cache).unwrap();
        let cover = cache.join("альбом #1.jpg");
        let outside = root.join("private.jpg");
        std::fs::write(&cover, b"cache fixture").unwrap();
        std::fs::write(&outside, b"outside fixture").unwrap();
        std::fs::write(cache.join("private.txt"), b"not artwork").unwrap();
        allow_cached_artwork(&scope, &cache).unwrap();
        assert!(scope.is_allowed(&cover));
        assert!(scope.is_allowed(cover.canonicalize().unwrap()));
        assert!(!scope.is_allowed(&outside));
        assert!(!scope.is_allowed(cache.join("private.txt")));
        let later = cache.join("later.jpg");
        std::fs::write(&later, b"new import").unwrap();
        assert!(!scope.is_allowed(&later));
        allow_cached_artwork(&scope, &cache).unwrap();
        assert!(scope.is_allowed(&later));
        std::fs::remove_file(cover).unwrap();
        std::fs::remove_file(later).unwrap();
        std::fs::remove_file(outside).unwrap();
        std::fs::remove_file(cache.join("private.txt")).unwrap();
        std::fs::remove_dir(cache).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
}
