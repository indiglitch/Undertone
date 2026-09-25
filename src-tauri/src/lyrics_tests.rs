use crate::{
    database::Database,
    lyrics::{self, MAX_LRC_BYTES},
    scanner::{scan, Progress},
};
use lofty::{
    config::WriteOptions,
    id3::v2::{
        BinaryFrame, FrameId, Id3v2Tag, SyncTextContentType, SynchronizedTextFrame, TimestampFormat,
    },
    prelude::{ItemKey, TagExt},
    tag::{ItemValue, Tag, TagItem, TagType},
    TextEncoding,
};
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

fn root(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "undertone-lyrics-{name}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(root.join("music")).unwrap();
    root
}

fn wav(path: &Path) {
    let data_len = 44100u32 * 2;
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
    std::fs::write(path, bytes).unwrap();
}

fn embedded_plain(path: &Path, text: &str) {
    let mut tag = Tag::new(TagType::Id3v2);
    tag.insert(TagItem::new(
        ItemKey::UnsyncLyrics,
        ItemValue::Text(text.into()),
    ));
    tag.save_to_path(path, WriteOptions::default()).unwrap();
}

fn embedded_synced(path: &Path) {
    let mut tag = Id3v2Tag::new();
    let frame = SynchronizedTextFrame::new(
        TextEncoding::UTF8,
        *b"eng",
        TimestampFormat::MS,
        SyncTextContentType::Lyrics,
        None,
        vec![(500, "first".into()), (1250, "second".into())],
    );
    tag.insert(
        BinaryFrame::new(
            FrameId::new("SYLT").unwrap(),
            frame.as_bytes(WriteOptions::default()).unwrap(),
        )
        .into(),
    );
    tag.save_to_path(path, WriteOptions::default()).unwrap();
}

fn scan_one(root: &Path) -> (Database, i64) {
    let db = Database::open(&root.join("db")).unwrap();
    let state = Arc::new(Mutex::new(Progress::default()));
    scan(
        &db,
        vec![root.join("music").to_string_lossy().into_owned()],
        &state,
    )
    .unwrap();
    let id = db.library().unwrap().tracks[0].id;
    (db, id)
}

#[test]
fn lrc_parser_supports_timestamps_metadata_malformed_offset_and_utf8() {
    let parsed = lyrics::parse_lrc(
        "[ar:Artist]\n[ti:Title]\n[offset:-250]\n[00:01.50][00:02.125]Привет\n[bad]ignored\n[00:xx.00]broken\n[00:00.10]Начало",
    );
    assert_eq!(
        parsed
            .synced
            .iter()
            .map(|line| (line.timestamp_ms, line.text.as_str(), line.order))
            .collect::<Vec<_>>(),
        vec![(0, "Начало", 0), (1250, "Привет", 1), (1875, "Привет", 2)]
    );
    assert!(parsed.plain.is_none());
}

#[test]
fn embedded_plain_is_ingested_and_local_lrc_has_priority() {
    let root = root("priority");
    let audio = root.join("music/Song.wav");
    wav(&audio);
    embedded_plain(&audio, "embedded words");
    std::fs::write(audio.with_extension("lrc"), "[00:01.00]локальный текст").unwrap();
    let (db, id) = scan_one(&root);
    let stored = lyrics::get(&db, id).unwrap().unwrap();
    assert_eq!(stored.origin, crate::providers::LyricsOrigin::LocalLrc);
    assert_eq!(stored.synced[0].text, "локальный текст");
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn embedded_synced_lyrics_are_kept_as_normalized_lines() {
    let root = root("embedded-synced");
    let audio = root.join("music/Song.wav");
    wav(&audio);
    embedded_synced(&audio);
    let (db, id) = scan_one(&root);
    let stored = lyrics::get(&db, id).unwrap().unwrap();
    assert_eq!(
        stored.origin,
        crate::providers::LyricsOrigin::EmbeddedSynced
    );
    assert_eq!(
        stored
            .synced
            .iter()
            .map(|line| (line.timestamp_ms, line.text.as_str(), line.order))
            .collect::<Vec<_>>(),
        vec![(500, "first", 0), (1250, "second", 1)]
    );
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn lrc_removal_falls_back_to_embedded_and_repeat_scan_is_idempotent() {
    let root = root("fallback");
    let audio = root.join("music/Song.wav");
    wav(&audio);
    embedded_plain(&audio, "embedded fallback");
    let lrc = audio.with_extension("lrc");
    std::fs::write(&lrc, "[00:01.00]temporary").unwrap();
    let (db, id) = scan_one(&root);
    let state = Arc::new(Mutex::new(Progress::default()));
    let before: String = db
        .connect()
        .unwrap()
        .query_row(
            "SELECT updated_at FROM lyrics WHERE track_id=?1",
            [id],
            |r| r.get(0),
        )
        .unwrap();
    scan(
        &db,
        vec![root.join("music").to_string_lossy().into_owned()],
        &state,
    )
    .unwrap();
    let after: String = db
        .connect()
        .unwrap()
        .query_row(
            "SELECT updated_at FROM lyrics WHERE track_id=?1",
            [id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(before, after);
    assert_eq!(
        db.connect()
            .unwrap()
            .query_row("SELECT count(*) FROM lyrics WHERE track_id=?1", [id], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        1
    );
    std::fs::write(&lrc, "[00:02.00]updated local line").unwrap();
    scan(
        &db,
        vec![root.join("music").to_string_lossy().into_owned()],
        &state,
    )
    .unwrap();
    let updated = lyrics::get(&db, id).unwrap().unwrap();
    assert_eq!(updated.origin, crate::providers::LyricsOrigin::LocalLrc);
    assert_eq!(updated.synced[0].text, "updated local line");
    std::fs::remove_file(lrc).unwrap();
    scan(
        &db,
        vec![root.join("music").to_string_lossy().into_owned()],
        &state,
    )
    .unwrap();
    let stored = lyrics::get(&db, id).unwrap().unwrap();
    assert_eq!(stored.origin, crate::providers::LyricsOrigin::EmbeddedPlain);
    assert_eq!(stored.plain.as_deref(), Some("embedded fallback"));
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn manual_override_is_never_replaced() {
    let root = root("manual");
    let audio = root.join("music/Song.wav");
    wav(&audio);
    std::fs::write(audio.with_extension("lrc"), "[00:01.00]automatic").unwrap();
    let (db, id) = scan_one(&root);
    db.connect().unwrap().execute(
        "UPDATE lyrics SET source='manual',kind='plain',plain_text='мой текст',source_fingerprint='manual:1',manual_override=1 WHERE track_id=?1",
        [id],
    ).unwrap();
    std::fs::write(audio.with_extension("lrc"), "[00:02.00]changed").unwrap();
    let state = Arc::new(Mutex::new(Progress::default()));
    scan(
        &db,
        vec![root.join("music").to_string_lossy().into_owned()],
        &state,
    )
    .unwrap();
    let stored = lyrics::get(&db, id).unwrap().unwrap();
    assert_eq!(stored.origin, crate::providers::LyricsOrigin::Manual);
    assert_eq!(stored.plain.as_deref(), Some("мой текст"));
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn oversized_and_invalid_utf8_lrc_are_rejected_safely() {
    let root = root("invalid");
    let audio = root.join("music/Song.wav");
    wav(&audio);
    let lrc = audio.with_extension("lrc");
    std::fs::write(&lrc, vec![b'x'; MAX_LRC_BYTES as usize + 1]).unwrap();
    let (db, id) = scan_one(&root);
    assert!(lyrics::get(&db, id).unwrap().is_none());
    std::fs::write(&lrc, [0xff, 0xfe, 0xfd]).unwrap();
    let state = Arc::new(Mutex::new(Progress::default()));
    scan(
        &db,
        vec![root.join("music").to_string_lossy().into_owned()],
        &state,
    )
    .unwrap();
    assert!(lyrics::get(&db, id).unwrap().is_none());
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}
