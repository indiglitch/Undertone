use crate::{
    audio::{Action, Audio, Message},
    database::Database,
    lyrics,
    playback_session::{self, PlaybackSession, QueueEntry},
    scanner::{self, Progress, ScanState},
};
use std::{fs, path::Path, sync::{Arc, Mutex}};

fn write_wav(path: &Path) {
    let samples = 44_100u32;
    let mut bytes = Vec::with_capacity(44 + samples as usize * 4);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + samples * 4).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&2u16.to_le_bytes());
    bytes.extend_from_slice(&44_100u32.to_le_bytes());
    bytes.extend_from_slice(&176_400u32.to_le_bytes());
    bytes.extend_from_slice(&4u16.to_le_bytes());
    bytes.extend_from_slice(&16u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&(samples * 4).to_le_bytes());
    bytes.resize(44 + samples as usize * 4, 0);
    fs::write(path, bytes).unwrap();
}

#[test]
fn portable_library_import_lyrics_and_session_survive_reopen() {
    let root = std::env::temp_dir().join(format!(
        "undertone-portable-functional-{}-{}",
        std::process::id(),
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
    ));
    let music = root.join("music");
    fs::create_dir_all(&music).unwrap();
    let wav = music.join("Smoke Tone.wav");
    write_wav(&wav);
    fs::write(music.join("Smoke Tone.lrc"), "[00:00.00]Portable lyrics\n").unwrap();
    let data = root.join("data");
    let db = Database::open(&data).unwrap();
    let state: ScanState = Arc::new(Mutex::new(Progress::default()));
    scanner::scan(&db, vec![music.to_string_lossy().into_owned()], &state).unwrap();
    let library = db.library().unwrap();
    assert_eq!(library.folders.len(), 1);
    assert_eq!(library.tracks.len(), 1);
    let track = &library.tracks[0];
    assert!(track.has_lyrics);
    assert!(lyrics::get(&db, track.id).unwrap().is_some());
    let track_id = track.id;
    let session = PlaybackSession {
        entries: vec![QueueEntry { entry_id: 1, track_id }],
        current_entry_id: Some(1),
        current_track_id: Some(track_id),
        cursor: Some(0),
        position_seconds: 0.0,
    };
    playback_session::save(&db, session).unwrap();
    drop(db);
    let reopened = Database::open(&data).unwrap();
    assert_eq!(reopened.library().unwrap().tracks.len(), 1);
    assert_eq!(playback_session::load(&reopened).unwrap().current_track_id, Some(track_id));
    drop(reopened);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn portable_audio_can_load_local_file() {
    let root = std::env::temp_dir().join(format!("undertone-portable-audio-{}", std::process::id()));
    fs::create_dir_all(&root).unwrap();
    let wav = root.join("tone.wav");
    write_wav(&wav);
    let audio = Audio::new();
    let status = audio.request(Message::Load {
        id: 1,
        path: wav.to_string_lossy().into_owned(),
        duration: 1.0,
    }).unwrap();
    assert_eq!(status.id, Some(1));
    audio.request(Message::Control(Action::Stop)).unwrap();
    fs::remove_dir_all(root).unwrap();
}
