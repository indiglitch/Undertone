use crate::{
    database::Database,
    lyrics,
    providers::{LyricsDocument, LyricsLookup, LyricsOrigin, LyricsProvider, SongContext},
};
use rusqlite::{params, OptionalExtension, Transaction};
use serde::Serialize;
use std::{
    path::PathBuf,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Clone, Copy)]
pub struct ExternalLyricsCachePolicy {
    pub not_found_retry: Duration,
    pub ambiguous_retry: Duration,
    pub temporary_error_retry: Duration,
    pub max_retry_after: Duration,
}

impl Default for ExternalLyricsCachePolicy {
    fn default() -> Self {
        Self {
            not_found_retry: Duration::from_secs(7 * 24 * 60 * 60),
            ambiguous_retry: Duration::from_secs(2 * 24 * 60 * 60),
            temporary_error_retry: Duration::from_secs(5 * 60),
            max_retry_after: Duration::from_secs(60 * 60),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ExternalLyricsStatus {
    Found,
    NotFound,
    Ambiguous,
    TemporaryError,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExternalLyricsResult {
    pub status: ExternalLyricsStatus,
    pub lyrics: Option<LyricsDocument>,
    pub cached: bool,
    pub retry_after: Option<i64>,
    pub rate_limited: bool,
}

pub fn fetch(
    db: &Database,
    track_id: i64,
    provider: &dyn LyricsProvider,
) -> Result<ExternalLyricsResult, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as i64;
    fetch_at(db, track_id, provider, now)
}

pub(crate) fn fetch_at(
    db: &Database,
    track_id: i64,
    provider: &dyn LyricsProvider,
    now: i64,
) -> Result<ExternalLyricsResult, String> {
    fetch_at_with_policy(
        db,
        track_id,
        provider,
        now,
        &ExternalLyricsCachePolicy::default(),
    )
}

pub(crate) fn fetch_at_with_policy(
    db: &Database,
    track_id: i64,
    provider: &dyn LyricsProvider,
    now: i64,
    policy: &ExternalLyricsCachePolicy,
) -> Result<ExternalLyricsResult, String> {
    let (song, audio_fingerprint) = song_context(db, track_id)?;
    lyrics::refresh_track(db, &song, &audio_fingerprint)?;

    if let Some(cached) = cached_at_with_policy(db, track_id, provider.name(), now, policy)? {
        return Ok(cached);
    }

    let lookup = provider.find(&song)?;
    persist(db, track_id, provider.name(), lookup, now, policy)
}

pub(crate) fn needs_lookup_at_with_policy(
    db: &Database,
    track_id: i64,
    provider_name: &str,
    now: i64,
    policy: &ExternalLyricsCachePolicy,
) -> Result<bool, String> {
    Ok(cached_at_with_policy(db, track_id, provider_name, now, policy)?.is_none())
}

fn cached_at_with_policy(
    db: &Database,
    track_id: i64,
    provider_name: &str,
    now: i64,
    policy: &ExternalLyricsCachePolicy,
) -> Result<Option<ExternalLyricsResult>, String> {
    let conn = db.connect()?;
    let source: Option<String> = conn
        .query_row(
            "SELECT source FROM lyrics WHERE track_id=?1",
            [track_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if source.as_deref().is_some_and(|source| source != "external") {
        return Ok(Some(ExternalLyricsResult {
            status: ExternalLyricsStatus::Found,
            lyrics: lyrics::get(db, track_id)?,
            cached: true,
            retry_after: None,
            rate_limited: false,
        }));
    }

    let cached: Option<(String, Option<String>, Option<i64>, Option<i64>)> = conn
        .query_row(
            "SELECT external_status,external_provider,external_attempted_at,external_retry_after FROM lyrics_scan_state WHERE track_id=?1 AND external_status IS NOT NULL",
            [track_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some((status, cached_provider, attempted_at, retry_after)) = cached {
        if cached_provider.as_deref() == Some(provider_name) {
            match status.as_str() {
                "success" if source.as_deref() == Some("external") => {
                    return Ok(Some(ExternalLyricsResult {
                        status: ExternalLyricsStatus::Found,
                        lyrics: lyrics::get(db, track_id)?,
                        cached: true,
                        retry_after: None,
                        rate_limited: false,
                    }));
                }
                "not_found" if cache_is_fresh(attempted_at, policy.not_found_retry, now) => {
                    return Ok(Some(cached_result(ExternalLyricsStatus::NotFound, None)));
                }
                "ambiguous" if cache_is_fresh(attempted_at, policy.ambiguous_retry, now) => {
                    return Ok(Some(cached_result(ExternalLyricsStatus::Ambiguous, None)));
                }
                "temporary_error" if retry_after.is_some_and(|retry_after| now < retry_after) => {
                    return Ok(Some(cached_result(
                        ExternalLyricsStatus::TemporaryError,
                        retry_after,
                    )));
                }
                "temporary_error"
                    if retry_after.is_none()
                        && cache_is_fresh(attempted_at, policy.temporary_error_retry, now) =>
                {
                    return Ok(Some(cached_result(
                        ExternalLyricsStatus::TemporaryError,
                        attempted_at.map(|attempted| {
                            attempted + policy.temporary_error_retry.as_secs() as i64
                        }),
                    )));
                }
                _ => {}
            }
        }
    }
    Ok(None)
}

fn cache_is_fresh(attempted_at: Option<i64>, interval: Duration, now: i64) -> bool {
    attempted_at.is_some_and(|attempted| now < attempted.saturating_add(interval.as_secs() as i64))
}

fn cached_result(status: ExternalLyricsStatus, retry_after: Option<i64>) -> ExternalLyricsResult {
    ExternalLyricsResult {
        status,
        lyrics: None,
        cached: true,
        retry_after,
        rate_limited: false,
    }
}

fn persist(
    db: &Database,
    track_id: i64,
    provider: &str,
    lookup: LyricsLookup,
    now: i64,
    policy: &ExternalLyricsCachePolicy,
) -> Result<ExternalLyricsResult, String> {
    if provider.is_empty() || provider.len() > 64 {
        return Err("invalid external lyrics provider name".into());
    }
    let mut conn = db.connect()?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let result = match lookup {
        LyricsLookup::Found(mut document) => {
            if document
                .plain
                .as_deref()
                .is_none_or(|text| text.trim().is_empty())
                && document.synced.is_empty()
            {
                set_state(
                    &tx,
                    track_id,
                    provider,
                    "temporary_error",
                    now,
                    Some(now + policy.temporary_error_retry.as_secs() as i64),
                )?;
                ExternalLyricsResult {
                    status: ExternalLyricsStatus::TemporaryError,
                    lyrics: None,
                    cached: false,
                    retry_after: Some(now + policy.temporary_error_retry.as_secs() as i64),
                    rate_limited: false,
                }
            } else {
                document.origin = LyricsOrigin::External(provider.to_string());
                document.manually_edited = false;
                if !document.synced.is_empty() {
                    document.plain = None;
                }
                let kind = if document.synced.is_empty() {
                    "plain"
                } else {
                    "synced"
                };
                let changed = tx.execute(
                    "INSERT INTO lyrics(track_id,source,kind,plain_text,source_fingerprint,manual_override) VALUES(?1,'external',?2,?3,?4,0) ON CONFLICT(track_id) DO UPDATE SET source='external',kind=excluded.kind,plain_text=excluded.plain_text,source_fingerprint=excluded.source_fingerprint,manual_override=0,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lyrics.source='external' AND lyrics.manual_override=0",
                    params![track_id, kind, document.plain, document.revision],
                ).map_err(|e| e.to_string())?;
                if changed == 0 {
                    tx.commit().map_err(|e| e.to_string())?;
                    return Ok(ExternalLyricsResult {
                        status: ExternalLyricsStatus::Found,
                        lyrics: lyrics::get(db, track_id)?,
                        cached: true,
                        retry_after: None,
                        rate_limited: false,
                    });
                }
                tx.execute("DELETE FROM lyric_lines WHERE track_id=?1", [track_id])
                    .map_err(|e| e.to_string())?;
                for line in &document.synced {
                    let timestamp = i64::try_from(line.timestamp_ms)
                        .map_err(|_| "lyrics timestamp exceeds SQLite range")?;
                    tx.execute("INSERT INTO lyric_lines(track_id,order_index,timestamp_ms,text) VALUES(?1,?2,?3,?4)",
                        params![track_id, line.order, timestamp, line.text]).map_err(|e| e.to_string())?;
                }
                set_state(&tx, track_id, provider, "success", now, None)?;
                ExternalLyricsResult {
                    status: ExternalLyricsStatus::Found,
                    lyrics: Some(document),
                    cached: false,
                    retry_after: None,
                    rate_limited: false,
                }
            }
        }
        LyricsLookup::NotFound => {
            set_state(&tx, track_id, provider, "not_found", now, None)?;
            ExternalLyricsResult {
                status: ExternalLyricsStatus::NotFound,
                lyrics: None,
                cached: false,
                retry_after: None,
                rate_limited: false,
            }
        }
        LyricsLookup::Ambiguous => {
            set_state(&tx, track_id, provider, "ambiguous", now, None)?;
            ExternalLyricsResult {
                status: ExternalLyricsStatus::Ambiguous,
                lyrics: None,
                cached: false,
                retry_after: None,
                rate_limited: false,
            }
        }
        LyricsLookup::TemporaryError {
            retry_after_seconds,
            rate_limited,
        } => {
            let delay = retry_after_seconds
                .unwrap_or(policy.temporary_error_retry.as_secs())
                .clamp(1, policy.max_retry_after.as_secs().max(1)) as i64;
            set_state(
                &tx,
                track_id,
                provider,
                "temporary_error",
                now,
                Some(now + delay),
            )?;
            ExternalLyricsResult {
                status: ExternalLyricsStatus::TemporaryError,
                lyrics: None,
                cached: false,
                retry_after: Some(now + delay),
                rate_limited,
            }
        }
    };
    tx.commit().map_err(|e| e.to_string())?;
    Ok(result)
}

fn set_state(
    tx: &Transaction<'_>,
    track_id: i64,
    provider: &str,
    status: &str,
    attempted_at: i64,
    retry_after: Option<i64>,
) -> Result<(), String> {
    tx.execute(
        "UPDATE lyrics_scan_state SET external_status=?2,external_provider=?3,external_attempted_at=?4,external_retry_after=?5 WHERE track_id=?1",
        params![track_id, status, provider, attempted_at, retry_after],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

fn song_context(db: &Database, track_id: i64) -> Result<(SongContext, String), String> {
    db.connect()?.query_row(
        "SELECT t.path,t.title,a.name,b.title,t.duration,t.size,t.modified FROM tracks t JOIN artists a ON a.id=t.artist_id JOIN albums b ON b.id=t.album_id WHERE t.id=?1",
        [track_id],
        |row| {
            let size: i64 = row.get(5)?;
            let modified: String = row.get(6)?;
            Ok((SongContext {
                id: track_id,
                path: PathBuf::from(row.get::<_, String>(0)?),
                title: row.get(1)?, artist: row.get(2)?, album: row.get(3)?, duration: row.get(4)?,
            }, format!("{size}:{modified}")))
        },
    ).map_err(|e| e.to_string())
}
