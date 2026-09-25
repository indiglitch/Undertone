use crate::{
    audio::{Action, Audio, Message},
    database::Database,
    metadata,
    scanner::{scan, Progress},
};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

fn fixture() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "undertone-test-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(root.join("music/nested")).unwrap();
    let data_len = 44100u32 * 2 * 2;
    let mut bytes = Vec::new();
    bytes.extend(b"RIFF");
    bytes.extend((36 + data_len).to_le_bytes());
    bytes.extend(b"WAVEfmt ");
    bytes.extend(16u32.to_le_bytes());
    bytes.extend(1u16.to_le_bytes());
    bytes.extend(1u16.to_le_bytes());
    bytes.extend(44100u32.to_le_bytes());
    bytes.extend(88200u32.to_le_bytes());
    bytes.extend(2u16.to_le_bytes());
    bytes.extend(16u16.to_le_bytes());
    bytes.extend(b"data");
    bytes.extend(data_len.to_le_bytes());
    bytes.resize(44 + data_len as usize, 0);
    std::fs::write(root.join("music/nested/без тегов.WAV"), bytes).unwrap();
    std::fs::write(root.join("music/broken.mp3"), b"not audio").unwrap();
    std::fs::write(root.join("music/readme.txt"), b"ignored").unwrap();
    root
}

#[test]
fn scan_is_recursive_idempotent_and_isolates_bad_files() {
    let root = fixture();
    let db = Database::open(&root.join("db")).unwrap();
    let state = Arc::new(Mutex::new(Progress::default()));
    let folder = root.join("music").to_string_lossy().to_string();
    scan(&db, vec![folder.clone(), folder.clone()], &state).unwrap();
    let library = db.library().unwrap();
    assert_eq!(library.tracks.len(), 1);
    assert_eq!(library.errors.len(), 1);
    assert_eq!(library.folders.len(), 1);
    assert_eq!(state.lock().unwrap().total, 2);
    let track = &library.tracks[0];
    assert_eq!(track.title, "без тегов");
    assert!((track.duration - 2.0).abs() < 0.05);
    let id = track.id;
    *state.lock().unwrap() = Progress::default();
    scan(&db, vec![folder], &state).unwrap();
    assert_eq!(state.lock().unwrap().skipped, 1);
    assert_eq!(db.library().unwrap().tracks[0].id, id);
    let reopened = Database::open(&root.join("db")).unwrap();
    assert_eq!(reopened.library().unwrap().tracks.len(), 1);
    assert!(metadata::supported(std::path::Path::new("Song.M4A")));
    assert!(!metadata::supported(std::path::Path::new("cover.jpg")));
    assert!(db.track(999999).is_err());
    // Every intake route uses exactly the same upsert, including overlapping folders/files.
    let direct = root.join("music/nested/без тегов.WAV");
    crate::scanner::import_files(
        &db,
        vec![direct.clone(), direct],
        &state,
        &metadata::LocalMetadata,
    )
    .unwrap();
    assert_eq!(db.library().unwrap().tracks.len(), 1);
    assert_eq!(db.library().unwrap().tracks[0].id, id);
    assert_eq!(
        db.connect()
            .unwrap()
            .query_row("SELECT count(*) FROM track_identities", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        1
    );
    drop(reopened);
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn removing_library_folder_persists_without_deleting_tracks_or_files() {
    let root = fixture();
    let db_dir = root.join("db");
    let db = Database::open(&db_dir).unwrap();
    let state = Arc::new(Mutex::new(Progress::default()));
    let folder = root.join("music").to_string_lossy().to_string();
    let audio_file = root.join("music/nested/без тегов.WAV");
    scan(&db, vec![folder.clone()], &state).unwrap();
    let library = db.library().unwrap();
    let track_count = library.tracks.len();
    let persisted_folder = library.folders[0].clone();

    assert!(db.remove_library_folder(&persisted_folder).unwrap());
    assert!(!db.remove_library_folder(&persisted_folder).unwrap());
    assert!(audio_file.is_file());
    assert_eq!(db.library().unwrap().tracks.len(), track_count);

    let reopened = Database::open(&db_dir).unwrap();
    assert!(reopened.library().unwrap().folders.is_empty());
    assert_eq!(reopened.library().unwrap().tracks.len(), track_count);
    assert!(audio_file.is_file());
    drop(reopened);
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn library_snapshot_reports_lyrics_availability_without_loading_lyrics_text() {
    let root = fixture();
    let db = Database::open(&root.join("db")).unwrap();
    let state = Arc::new(Mutex::new(Progress::default()));
    scan(
        &db,
        vec![root.join("music").to_string_lossy().into_owned()],
        &state,
    )
    .unwrap();
    let track = db.library().unwrap().tracks.remove(0);
    assert!(!track.has_lyrics);
    db.connect().unwrap().execute(
        "INSERT INTO lyrics(track_id,source,kind,plain_text,source_fingerprint,manual_override) VALUES(?1,'manual','plain','secret text','manual:test',1)",
        [track.id],
    ).unwrap();
    let available = db.library().unwrap().tracks.remove(0);
    assert!(available.has_lyrics);
    assert_eq!(
        db.connect()
            .unwrap()
            .query_row(
                "SELECT plain_text FROM lyrics WHERE track_id=?1",
                [track.id],
                |row| row.get::<_, String>(0)
            )
            .unwrap(),
        "secret text"
    );
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn audio_rejects_invalid_volume_without_a_device() {
    let engine = Audio::new();
    assert!(engine
        .request(Message::Control(Action::Volume { value: 1.5 }))
        .is_err());
    assert!(engine
        .request(Message::Control(Action::Volume { value: f32::NAN }))
        .is_err());
    assert!(engine
        .request(Message::Control(Action::Seek { seconds: -1.0 }))
        .is_err());
    assert_eq!(
        engine
            .request(Message::Control(Action::Volume { value: 0.4 }))
            .unwrap()
            .volume,
        0.4
    );
}

#[test]
fn collections_preserve_tracks_and_roll_back_invalid_edits() {
    use crate::collections::{self, Action as Edit};
    let root = fixture();
    std::fs::copy(
        root.join("music/nested/без тегов.WAV"),
        root.join("music/второй.wav"),
    )
    .unwrap();
    let db = Database::open(&root.join("db")).unwrap();
    let state = Arc::new(Mutex::new(Progress::default()));
    scan(
        &db,
        vec![root.join("music").to_string_lossy().into_owned()],
        &state,
    )
    .unwrap();
    let tracks = db.library().unwrap().tracks;
    let (a, b) = (tracks[0].id, tracks[1].id);
    assert!(collections::apply(
        &db,
        Edit::Like {
            track_id: 999999,
            liked: true
        }
    )
    .is_err());
    collections::apply(
        &db,
        Edit::Like {
            track_id: a,
            liked: true,
        },
    )
    .unwrap();
    collections::apply(
        &db,
        Edit::Like {
            track_id: a,
            liked: true,
        },
    )
    .unwrap();
    assert_eq!(collections::snapshot(&db).unwrap().likes, vec![a]);
    collections::apply(
        &db,
        Edit::Like {
            track_id: a,
            liked: false,
        },
    )
    .unwrap();
    assert!(collections::snapshot(&db).unwrap().likes.is_empty());
    assert!(collections::apply(
        &db,
        Edit::CreatePlaylist {
            name: "  ".into(),
            description: "".into()
        }
    )
    .is_err());
    let s = collections::apply(
        &db,
        Edit::CreatePlaylist {
            name: " Ночная дорога ".into(),
            description: "тест".into(),
        },
    )
    .unwrap();
    let id = s.playlists[0].id;
    assert_eq!(s.playlists[0].name, "Ночная дорога");
    collections::apply(
        &db,
        Edit::EditPlaylist {
            id,
            name: "Обновлённый".into(),
            description: "описание".into(),
        },
    )
    .unwrap();
    assert!(collections::apply(
        &db,
        Edit::AddTracks {
            id,
            track_ids: vec![a, 999999]
        }
    )
    .is_err());
    assert!(
        collections::snapshot(&db).unwrap().playlists[0]
            .entries
            .is_empty(),
        "batch must roll back completely"
    );
    let s = collections::apply(
        &db,
        Edit::AddTracks {
            id,
            track_ids: vec![a, b, a],
        },
    )
    .unwrap();
    let duplicate = s.playlists[0].entries[2].id;
    let first = s.playlists[0].entries[0].id;
    assert_ne!(
        first, duplicate,
        "duplicate tracks are separate playlist entries"
    );
    let s = collections::apply(
        &db,
        Edit::MoveEntry {
            id,
            entry_id: duplicate,
            index: 0,
        },
    )
    .unwrap();
    assert_eq!(
        s.playlists[0]
            .entries
            .iter()
            .map(|e| e.id)
            .collect::<Vec<_>>(),
        vec![duplicate, first, s.playlists[0].entries[2].id]
    );
    assert!(collections::apply(
        &db,
        Edit::MoveEntry {
            id,
            entry_id: first,
            index: 20
        }
    )
    .is_err());
    assert!(collections::apply(
        &db,
        Edit::RemoveEntry {
            id: id + 1000,
            entry_id: first
        }
    )
    .is_err());
    let s = collections::apply(
        &db,
        Edit::RemoveEntry {
            id,
            entry_id: first,
        },
    )
    .unwrap();
    assert_eq!(
        s.playlists[0]
            .entries
            .iter()
            .map(|e| e.track_id)
            .collect::<Vec<_>>(),
        vec![a, b]
    );
    for _ in 0..205 {
        collections::record_start(&db, a).unwrap();
    }
    let reopened = Database::open(&root.join("db")).unwrap();
    let s = collections::snapshot(&reopened).unwrap();
    assert_eq!(s.history.len(), 200);
    assert!(s.history.windows(2).all(|pair| pair[0].id > pair[1].id));
    assert_eq!(
        reopened
            .connect()
            .unwrap()
            .query_row("SELECT count(*) FROM listening_history", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        205
    );
    assert_eq!(s.playlists[0].name, "Обновлённый");
    assert_eq!(s.playlists[0].description, "описание");
    collections::apply(&db, Edit::DeletePlaylist { id }).unwrap();
    assert!(collections::snapshot(&db).unwrap().playlists.is_empty());
    assert_eq!(
        db.library()
            .unwrap()
            .tracks
            .iter()
            .map(|t| t.id)
            .collect::<Vec<_>>(),
        vec![a, b]
    );
    let conn = db.connect().unwrap();
    assert_eq!(
        conn.query_row("SELECT count(*) FROM playlist_tracks", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert_eq!(
        conn.query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| r
            .get::<_, i64>(
            0
        ))
        .unwrap(),
        0
    );
    assert_eq!(
        conn.query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0))
            .unwrap(),
        "ok"
    );
    drop(conn);
    drop(reopened);
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
#[ignore = "Requires F:\\Music and a Windows audio output; run explicitly for live verification"]
fn real_library_and_audio_smoke() {
    let root = std::env::temp_dir().join("undertone-live-smoke");
    let db = Database::open(&root).unwrap();
    let state = Arc::new(Mutex::new(Progress::default()));
    scan(&db, vec!["F:\\Music".into()], &state).unwrap();
    let library = db.library().unwrap();
    println!(
        "SCAN {:?}; tracks={}; errors={}",
        state.lock().unwrap(),
        library.tracks.len(),
        library.errors.len()
    );
    assert!(library.tracks.len() > 0);
    let engine = Audio::new();
    use rodio::Source;
    let mut formats = std::collections::BTreeSet::new();
    for t in &library.tracks {
        let decoder = rodio::Decoder::try_from(std::fs::File::open(&t.path).unwrap()).unwrap();
        let rate = decoder.sample_rate();
        if !formats.insert((t.format.clone(), rate)) {
            continue;
        }
        let format = &t.format;
        engine
            .request(Message::Control(Action::Volume { value: 0.5 }))
            .unwrap();
        engine
            .request(Message::Load {
                id: t.id,
                path: t.path.clone(),
                duration: t.duration,
            })
            .unwrap();
        std::thread::sleep(Duration::from_millis(650));
        let playing = engine.request(Message::Control(Action::Status)).unwrap();
        assert!(playing.playing);
        assert!(playing.position > 0.2);
        for value in [1.0, 0.8, 0.5] {
            let s = engine
                .request(Message::Control(Action::Volume { value }))
                .unwrap();
            assert_eq!(s.volume, value);
            std::thread::sleep(Duration::from_millis(200));
            assert!(
                engine
                    .request(Message::Control(Action::Status))
                    .unwrap()
                    .playing
            );
        }
        engine.request(Message::Control(Action::Pause)).unwrap();
        std::thread::sleep(Duration::from_millis(80));
        let paused = engine.request(Message::Control(Action::Status)).unwrap();
        assert!(!paused.playing);
        std::thread::sleep(Duration::from_millis(150));
        let still = engine.request(Message::Control(Action::Status)).unwrap();
        assert!((still.position - paused.position).abs() < 0.06);
        let seek = engine
            .request(Message::Control(Action::Seek { seconds: 20.0 }))
            .unwrap();
        assert!((seek.position - 20.0).abs() < 0.2);
        engine.request(Message::Control(Action::Resume)).unwrap();
        std::thread::sleep(Duration::from_millis(350));
        let resumed = engine.request(Message::Control(Action::Status)).unwrap();
        assert!(resumed.playing);
        assert!(resumed.position > 20.1);
        let stopped = engine.request(Message::Control(Action::Stop)).unwrap();
        assert!(!stopped.playing && !stopped.ended && stopped.id.is_none());
        assert_eq!(stopped.position, 0.0);
        println!(
            "AUDIO {format} {rate}Hz: volume 100/80/50, play / pause / seek / resume / stop OK; {} — {}",
            t.artist, t.title
        );
    }
    assert!(formats.iter().any(|(f, _)| f == "MP3"));
    assert!(formats.iter().any(|(f, _)| f == "FLAC"));
    *state.lock().unwrap() = Progress::default();
    scan(&db, vec!["F:\\Music".into()], &state).unwrap();
    assert_eq!(state.lock().unwrap().skipped, library.tracks.len());
    assert_eq!(db.library().unwrap().tracks.len(), library.tracks.len());
    println!("RESCAN: {:?}", state.lock().unwrap());
}
