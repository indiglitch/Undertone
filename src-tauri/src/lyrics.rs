use crate::{
    database::Database,
    providers::{
        LyricsDocument, LyricsLookup, LyricsOrigin, LyricsProvider, SongContext, SyncedLine,
    },
};
use lofty::{
    config::ParseOptions,
    file::{AudioFile, TaggedFileExt},
    id3::v2::{Frame, Id3v2Tag, SyncTextContentType, SynchronizedTextFrame, TimestampFormat},
    prelude::ItemKey,
};
use rusqlite::{params, OptionalExtension};
use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

pub const MAX_LRC_BYTES: u64 = 1024 * 1024;

pub struct LocalLyrics;

impl LocalLyrics {
    pub fn find_sync(&self, song: &SongContext) -> Result<Option<LyricsDocument>, String> {
        if let Some(path) = lrc_path(&song.path) {
            if let Ok(document) = read_lrc(&path) {
                if document.is_some() {
                    return Ok(document);
                }
            }
        }
        read_embedded(&song.path)
    }
}

impl LyricsProvider for LocalLyrics {
    fn name(&self) -> &str {
        "local"
    }

    fn find(&self, song: &SongContext) -> Result<LyricsLookup, String> {
        Ok(match self.find_sync(song)? {
            Some(document) => LyricsLookup::Found(document),
            None => LyricsLookup::NotFound,
        })
    }
}

pub fn lrc_path(audio: &Path) -> Option<PathBuf> {
    let candidate = audio.with_extension("lrc");
    candidate.is_file().then_some(candidate)
}

fn file_fingerprint(path: &Path) -> Result<String, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    let modified = metadata
        .modified()
        .map_err(|e| e.to_string())?
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    Ok(format!("{}:{modified}", metadata.len()))
}

pub fn read_lrc(path: &Path) -> Result<Option<LyricsDocument>, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_LRC_BYTES {
        return Err("LRC file is empty or exceeds the 1 MiB limit".into());
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let content = std::str::from_utf8(&bytes).map_err(|_| "LRC file is not valid UTF-8")?;
    let mut parsed = parse_lrc(content);
    if parsed.plain.is_none() && parsed.synced.is_empty() {
        return Ok(None);
    }
    parsed.origin = LyricsOrigin::LocalLrc;
    parsed.revision = file_fingerprint(path)?;
    Ok(Some(parsed))
}

pub fn parse_lrc(input: &str) -> LyricsDocument {
    let mut offset_ms = 0i64;
    for raw in input.lines() {
        let line = raw.trim_start_matches('\u{feff}').trim();
        if let Some(value) = metadata_value(line, "offset") {
            if let Ok(value) = value.trim().parse::<i64>() {
                offset_ms = value;
            }
        }
    }

    let mut entries: Vec<(u64, String, usize)> = Vec::new();
    let mut plain = Vec::new();
    let mut sequence = 0usize;
    for raw in input.lines() {
        let line = raw.trim_start_matches('\u{feff}').trim_end_matches('\r');
        if is_metadata_line(line) {
            continue;
        }
        let mut rest = line;
        let mut timestamps = Vec::new();
        while let Some((timestamp, tail)) = take_timestamp(rest) {
            timestamps.push(timestamp);
            rest = tail;
        }
        if timestamps.is_empty() {
            if !line.trim().is_empty() && !line.trim_start().starts_with('[') {
                plain.push(line.to_string());
            }
            continue;
        }
        for timestamp in timestamps {
            let adjusted = (i128::from(timestamp) + i128::from(offset_ms))
                .clamp(0, i128::from(i64::MAX)) as u64;
            entries.push((adjusted, rest.to_string(), sequence));
            sequence += 1;
        }
    }
    entries.sort_by_key(|(timestamp, _, original)| (*timestamp, *original));
    let synced = entries
        .into_iter()
        .enumerate()
        .map(|(order, (timestamp_ms, text, _))| SyncedLine {
            timestamp_ms,
            text,
            order: order as u32,
        })
        .collect::<Vec<_>>();
    LyricsDocument {
        plain: synced
            .is_empty()
            .then(|| plain.join("\n"))
            .filter(|text| !text.trim().is_empty()),
        synced,
        origin: LyricsOrigin::LocalLrc,
        manually_edited: false,
        revision: String::new(),
    }
}

fn metadata_value<'a>(line: &'a str, name: &str) -> Option<&'a str> {
    let body = line.strip_prefix('[')?.strip_suffix(']')?;
    let (key, value) = body.split_once(':')?;
    key.eq_ignore_ascii_case(name).then_some(value)
}

fn is_metadata_line(line: &str) -> bool {
    ["ar", "ti", "al", "by", "offset"]
        .iter()
        .any(|key| metadata_value(line, key).is_some())
}

fn take_timestamp(input: &str) -> Option<(u64, &str)> {
    let close = input.find(']')?;
    input.strip_prefix('[')?;
    let body = input.get(1..close)?;
    let (minutes, seconds) = body.split_once(':')?;
    if minutes.is_empty() || !minutes.bytes().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let (seconds, fraction) = seconds.split_once('.')?;
    if seconds.len() != 2
        || !seconds.bytes().all(|c| c.is_ascii_digit())
        || !matches!(fraction.len(), 2 | 3)
        || !fraction.bytes().all(|c| c.is_ascii_digit())
    {
        return None;
    }
    let minutes = minutes.parse::<u64>().ok()?;
    let seconds = seconds.parse::<u64>().ok()?;
    if seconds >= 60 {
        return None;
    }
    let fraction = fraction.parse::<u64>().ok()? * if fraction.len() == 2 { 10 } else { 1 };
    let timestamp = minutes
        .checked_mul(60)?
        .checked_add(seconds)?
        .checked_mul(1000)?
        .checked_add(fraction)?;
    Some((timestamp, &input[close + 1..]))
}

pub fn read_embedded(path: &Path) -> Result<Option<LyricsDocument>, String> {
    if let Some(synced) = read_embedded_synced(path) {
        return Ok(Some(LyricsDocument {
            plain: None,
            synced,
            origin: LyricsOrigin::EmbeddedSynced,
            manually_edited: false,
            revision: String::new(),
        }));
    }
    let Ok(file) = lofty::read_from_path(path) else {
        return Ok(None);
    };
    let tag = file.primary_tag().or_else(|| file.first_tag());
    if let Some(value) = tag.and_then(|tag| tag.get_string(ItemKey::Lyrics)) {
        let parsed = parse_lrc(value);
        if !parsed.synced.is_empty() {
            return Ok(Some(LyricsDocument {
                plain: None,
                synced: parsed.synced,
                origin: LyricsOrigin::EmbeddedSynced,
                manually_edited: false,
                revision: String::new(),
            }));
        }
    }
    let plain = tag
        .and_then(|tag| {
            tag.get_string(ItemKey::UnsyncLyrics)
                .or_else(|| tag.get_string(ItemKey::Lyrics))
        })
        .map(str::to_owned)
        .filter(|text| !text.trim().is_empty());
    Ok(plain.map(|plain| LyricsDocument {
        plain: Some(plain),
        synced: Vec::new(),
        origin: LyricsOrigin::EmbeddedPlain,
        manually_edited: false,
        revision: String::new(),
    }))
}

fn read_embedded_synced(path: &Path) -> Option<Vec<SyncedLine>> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    let options = ParseOptions::new().read_properties(false);
    let mut file = fs::File::open(path).ok()?;
    let tag = match extension.as_str() {
        "mp3" => lofty::mpeg::MpegFile::read_from(&mut file, options)
            .ok()?
            .id3v2()
            .cloned(),
        "wav" => lofty::iff::wav::WavFile::read_from(&mut file, options)
            .ok()?
            .id3v2()
            .cloned(),
        "aac" => lofty::aac::AacFile::read_from(&mut file, options)
            .ok()?
            .id3v2()
            .cloned(),
        "flac" => lofty::flac::FlacFile::read_from(&mut file, options)
            .ok()?
            .id3v2()
            .cloned(),
        _ => None,
    }?;
    synced_from_id3(&tag)
}

fn synced_from_id3(tag: &Id3v2Tag) -> Option<Vec<SyncedLine>> {
    let mut entries = Vec::new();
    let mut sequence = 0usize;
    for frame in tag {
        let Frame::Binary(binary) = frame else {
            continue;
        };
        if binary.id().as_str() != "SYLT" {
            continue;
        }
        let Ok(frame) = SynchronizedTextFrame::parse(&binary.data, binary.flags()) else {
            continue;
        };
        if frame.timestamp_format != TimestampFormat::MS
            || frame.content_type != SyncTextContentType::Lyrics
        {
            continue;
        }
        for (timestamp_ms, text) in frame.content {
            entries.push((u64::from(timestamp_ms), text, sequence));
            sequence += 1;
        }
    }
    entries.sort_by_key(|(timestamp, _, original)| (*timestamp, *original));
    (!entries.is_empty()).then(|| {
        entries
            .into_iter()
            .enumerate()
            .map(|(order, (timestamp_ms, text, _))| SyncedLine {
                timestamp_ms,
                text,
                order: order as u32,
            })
            .collect()
    })
}

pub fn refresh_track(
    db: &Database,
    song: &SongContext,
    audio_fingerprint: &str,
) -> Result<(), String> {
    let mut conn = db.connect()?;
    let manual: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM lyrics WHERE track_id=?1 AND (manual_override=1 OR source='manual'))",
        [song.id], |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    if manual {
        return Ok(());
    }

    let current_lrc = lrc_path(&song.path);
    let lrc_fingerprint = current_lrc
        .as_deref()
        .and_then(|path| file_fingerprint(path).ok());
    let previous: Option<(String, Option<String>)> = conn
        .query_row(
            "SELECT audio_fingerprint,lrc_fingerprint FROM lyrics_scan_state WHERE track_id=?1",
            [song.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let audio_changed = previous
        .as_ref()
        .is_some_and(|(audio, _)| audio != audio_fingerprint);
    if previous
        .as_ref()
        .is_some_and(|(audio, lrc)| audio == audio_fingerprint && lrc == &lrc_fingerprint)
    {
        return Ok(());
    }

    let mut document = LocalLyrics.find_sync(song)?;
    if let Some(value) = document.as_mut() {
        if !matches!(value.origin, LyricsOrigin::LocalLrc) {
            value.revision = audio_fingerprint.to_string();
        }
    }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let still_manual: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM lyrics WHERE track_id=?1 AND (manual_override=1 OR source='manual'))",
        [song.id], |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    if still_manual {
        return Ok(());
    }
    if audio_changed {
        tx.execute(
            "UPDATE lyrics_scan_state SET external_status=NULL,external_provider=NULL,external_attempted_at=NULL,external_retry_after=NULL WHERE track_id=?1",
            [song.id],
        ).map_err(|e| e.to_string())?;
    }

    if let Some(document) = document {
        let (source, kind) = match document.origin {
            LyricsOrigin::LocalLrc => (
                "local_lrc",
                if document.synced.is_empty() {
                    "plain"
                } else {
                    "synced"
                },
            ),
            LyricsOrigin::EmbeddedSynced => ("embedded_synced", "synced"),
            LyricsOrigin::EmbeddedPlain => ("embedded_plain", "plain"),
            LyricsOrigin::Manual | LyricsOrigin::External(_) => {
                return Err("automatic local provider returned an invalid origin".into())
            }
        };
        let updated = tx.execute(
            "INSERT INTO lyrics(track_id,source,kind,plain_text,source_fingerprint,manual_override) VALUES(?1,?2,?3,?4,?5,0) ON CONFLICT(track_id) DO UPDATE SET source=excluded.source,kind=excluded.kind,plain_text=excluded.plain_text,source_fingerprint=excluded.source_fingerprint,manual_override=0,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lyrics.manual_override=0 AND lyrics.source<>'manual'",
            params![song.id, source, kind, document.plain, document.revision],
        ).map_err(|e| e.to_string())?;
        if updated == 0 {
            return Ok(());
        }
        tx.execute("DELETE FROM lyric_lines WHERE track_id=?1", [song.id])
            .map_err(|e| e.to_string())?;
        for line in document.synced {
            let timestamp_ms = i64::try_from(line.timestamp_ms)
                .map_err(|_| "lyrics timestamp exceeds SQLite range")?;
            tx.execute("INSERT INTO lyric_lines(track_id,order_index,timestamp_ms,text) VALUES(?1,?2,?3,?4)",
                params![song.id, line.order, timestamp_ms, line.text]).map_err(|e| e.to_string())?;
        }
    } else {
        let sql = if audio_changed {
            "DELETE FROM lyrics WHERE track_id=?1 AND manual_override=0 AND source<>'manual'"
        } else {
            "DELETE FROM lyrics WHERE track_id=?1 AND manual_override=0 AND source NOT IN ('manual','external')"
        };
        tx.execute(sql, [song.id]).map_err(|e| e.to_string())?;
    }
    tx.execute(
        "INSERT INTO lyrics_scan_state(track_id,audio_fingerprint,lrc_fingerprint) VALUES(?1,?2,?3) ON CONFLICT(track_id) DO UPDATE SET audio_fingerprint=excluded.audio_fingerprint,lrc_fingerprint=excluded.lrc_fingerprint",
        params![song.id, audio_fingerprint, lrc_fingerprint],
    ).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

pub fn get(db: &Database, track_id: i64) -> Result<Option<LyricsDocument>, String> {
    let conn = db.connect()?;
    let row: Option<(String, String, Option<String>, String, bool, Option<String>)> = conn.query_row(
        "SELECT l.source,l.kind,l.plain_text,l.source_fingerprint,l.manual_override,s.external_provider FROM lyrics l LEFT JOIN lyrics_scan_state s ON s.track_id=l.track_id WHERE l.track_id=?1",
        [track_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
    ).optional().map_err(|e| e.to_string())?;
    let Some((source, kind, plain, revision, manual, external_provider)) = row else {
        return Ok(None);
    };
    let origin = match source.as_str() {
        "manual" => LyricsOrigin::Manual,
        "local_lrc" => LyricsOrigin::LocalLrc,
        "embedded_synced" => LyricsOrigin::EmbeddedSynced,
        "embedded_plain" => LyricsOrigin::EmbeddedPlain,
        "external" => {
            LyricsOrigin::External(external_provider.unwrap_or_else(|| "external".into()))
        }
        _ => return Err("unknown lyrics source in database".into()),
    };
    let synced = if kind == "synced" {
        let mut statement = conn.prepare("SELECT timestamp_ms,text,order_index FROM lyric_lines WHERE track_id=?1 ORDER BY order_index").map_err(|e| e.to_string())?;
        let lines = statement
            .query_map([track_id], |row| {
                let timestamp_ms: i64 = row.get(0)?;
                Ok(SyncedLine {
                    timestamp_ms: timestamp_ms as u64,
                    text: row.get(1)?,
                    order: row.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        lines
    } else {
        Vec::new()
    };
    Ok(Some(LyricsDocument {
        plain,
        synced,
        origin,
        manually_edited: manual,
        revision,
    }))
}
