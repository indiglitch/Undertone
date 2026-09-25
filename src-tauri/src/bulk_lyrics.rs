use crate::{
    database::Database,
    external_lyrics::{self, ExternalLyricsCachePolicy, ExternalLyricsStatus},
    providers::{LyricsOrigin, LyricsProvider, SongContext},
};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BulkLyricsPhase {
    Idle,
    Running,
    Cancelling,
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize)]
pub struct BulkLyricsTrack {
    pub track_id: i64,
    pub title: String,
    pub artist: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BulkLyricsScope {
    AllLibrary,
    RecentDownloads,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct BulkLyricsSelection {
    pub scope: BulkLyricsScope,
    pub limit: Option<usize>,
}

impl BulkLyricsSelection {
    fn validated(self) -> Result<Self, String> {
        if self
            .limit
            .map_or(true, |limit| matches!(limit, 10 | 25 | 50 | 100 | 250))
        {
            Ok(self)
        } else {
            Err("invalid bulk lyrics track limit".into())
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct BulkLyricsEligibility {
    pub eligible: usize,
    pub selected: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct BulkLyricsProgress {
    pub phase: BulkLyricsPhase,
    pub total: usize,
    pub processed: usize,
    pub found: usize,
    pub local_existing: usize,
    pub skipped: usize,
    pub not_found: usize,
    pub ambiguous: usize,
    pub temporary_errors: usize,
    pub permanent_errors: usize,
    pub remaining: usize,
    pub current: Option<BulkLyricsTrack>,
    pub last_error: Option<String>,
}

impl Default for BulkLyricsProgress {
    fn default() -> Self {
        Self {
            phase: BulkLyricsPhase::Idle,
            total: 0,
            processed: 0,
            found: 0,
            local_existing: 0,
            skipped: 0,
            not_found: 0,
            ambiguous: 0,
            temporary_errors: 0,
            permanent_errors: 0,
            remaining: 0,
            current: None,
            last_error: None,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct BulkLyricsPolicy {
    pub cache: ExternalLyricsCachePolicy,
    pub request_interval: Duration,
}

impl Default for BulkLyricsPolicy {
    fn default() -> Self {
        Self {
            cache: ExternalLyricsCachePolicy::default(),
            request_interval: Duration::from_millis(1100),
        }
    }
}

#[derive(Clone, Default)]
pub struct BulkLyricsJob {
    state: Arc<Mutex<BulkLyricsProgress>>,
    cancel: Arc<AtomicBool>,
}

impl BulkLyricsJob {
    pub fn status(&self) -> BulkLyricsProgress {
        self.state.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn cancel(&self) -> BulkLyricsProgress {
        self.cancel.store(true, Ordering::Release);
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if state.phase == BulkLyricsPhase::Running {
            state.phase = BulkLyricsPhase::Cancelling;
        }
        state.clone()
    }

    pub fn start(
        &self,
        db: Database,
        provider: Arc<dyn LyricsProvider>,
    ) -> Result<BulkLyricsProgress, String> {
        self.start_with_policy(db, provider, BulkLyricsPolicy::default())
    }

    pub fn start_selected(
        &self,
        db: Database,
        provider: Arc<dyn LyricsProvider>,
        selection: BulkLyricsSelection,
    ) -> Result<BulkLyricsProgress, String> {
        self.start_selected_with_policy(db, provider, selection, BulkLyricsPolicy::default())
    }

    pub(crate) fn start_with_policy(
        &self,
        db: Database,
        provider: Arc<dyn LyricsProvider>,
        policy: BulkLyricsPolicy,
    ) -> Result<BulkLyricsProgress, String> {
        self.start_selected_with_policy(
            db,
            provider,
            BulkLyricsSelection {
                scope: BulkLyricsScope::AllLibrary,
                limit: None,
            },
            policy,
        )
    }

    pub(crate) fn start_selected_with_policy(
        &self,
        db: Database,
        provider: Arc<dyn LyricsProvider>,
        selection: BulkLyricsSelection,
        policy: BulkLyricsPolicy,
    ) -> Result<BulkLyricsProgress, String> {
        let tracks = selected_worklist(&db, provider.name(), selection, &policy.cache)?;
        {
            let mut state = self.state.lock().map_err(|e| e.to_string())?;
            if matches!(
                state.phase,
                BulkLyricsPhase::Running | BulkLyricsPhase::Cancelling
            ) {
                return Err("bulk lyrics indexing is already running".into());
            }
            *state = BulkLyricsProgress {
                phase: BulkLyricsPhase::Running,
                total: tracks.len(),
                remaining: tracks.len(),
                ..BulkLyricsProgress::default()
            };
        }
        self.cancel.store(false, Ordering::Release);
        let worker = self.clone();
        thread::Builder::new()
            .name("undertone-bulk-lyrics".into())
            .spawn(move || worker.run(db, provider, policy, tracks))
            .map_err(|e| {
                let mut state = self.state.lock().unwrap_or_else(|p| p.into_inner());
                state.phase = BulkLyricsPhase::Completed;
                state.permanent_errors = 1;
                state.last_error = Some(e.to_string());
                e.to_string()
            })?;
        Ok(self.status())
    }

    fn run(
        &self,
        db: Database,
        provider: Arc<dyn LyricsProvider>,
        policy: BulkLyricsPolicy,
        tracks: Vec<BulkLyricsTrack>,
    ) {
        let mut next_request_at: Option<Instant> = None;
        for track in tracks {
            if self.cancel.load(Ordering::Acquire) {
                self.finish_cancelled();
                return;
            }
            self.update(|state| state.current = Some(track.clone()));
            if let Some(deadline) = next_request_at {
                if !self.wait_until(deadline) {
                    self.finish_cancelled();
                    return;
                }
            }

            let now = unix_now();
            let outcome = external_lyrics::fetch_at_with_policy(
                &db,
                track.track_id,
                provider.as_ref(),
                now,
                &policy.cache,
            );
            self.update(|state| {
                state.processed += 1;
                state.remaining = state.total.saturating_sub(state.processed);
                match &outcome {
                    Ok(result) => {
                        let is_local = result.status == ExternalLyricsStatus::Found
                            && result.lyrics.as_ref().is_some_and(|lyrics| {
                                !matches!(lyrics.origin, LyricsOrigin::External(_))
                            });
                        if is_local {
                            state.local_existing += 1;
                        } else if result.cached {
                            state.skipped += 1;
                        } else {
                            match result.status {
                                ExternalLyricsStatus::Found => state.found += 1,
                                ExternalLyricsStatus::NotFound => state.not_found += 1,
                                ExternalLyricsStatus::Ambiguous => state.ambiguous += 1,
                                ExternalLyricsStatus::TemporaryError => state.temporary_errors += 1,
                            }
                        }
                    }
                    Err(error) => {
                        state.permanent_errors += 1;
                        state.last_error = Some(error.clone());
                    }
                }
            });

            match outcome {
                Ok(result) if !result.cached => {
                    let mut delay = policy.request_interval;
                    if result.rate_limited {
                        if let Some(retry_after) = result.retry_after {
                            let seconds = retry_after.saturating_sub(unix_now()).max(0) as u64;
                            delay = delay.max(Duration::from_secs(seconds));
                        }
                    }
                    next_request_at = Some(Instant::now() + delay);
                }
                Err(_) => next_request_at = Some(Instant::now() + policy.request_interval),
                _ => {}
            }
        }
        self.update(|state| {
            state.phase = BulkLyricsPhase::Completed;
            state.current = None;
            state.remaining = 0;
        });
    }

    fn wait_until(&self, deadline: Instant) -> bool {
        while Instant::now() < deadline {
            if self.cancel.load(Ordering::Acquire) {
                return false;
            }
            let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
                break;
            };
            thread::sleep(remaining.min(Duration::from_millis(50)));
        }
        true
    }

    fn finish_cancelled(&self) {
        self.update(|state| {
            state.phase = BulkLyricsPhase::Cancelled;
            state.current = None;
            state.remaining = state.total.saturating_sub(state.processed);
        });
    }

    fn update(&self, change: impl FnOnce(&mut BulkLyricsProgress)) {
        change(&mut self.state.lock().unwrap_or_else(|e| e.into_inner()));
    }
}

pub fn eligibility(
    db: &Database,
    provider_name: &str,
    selection: BulkLyricsSelection,
) -> Result<BulkLyricsEligibility, String> {
    let selection = selection.validated()?;
    let tracks = eligible_worklist(
        db,
        provider_name,
        selection.scope,
        &ExternalLyricsCachePolicy::default(),
    )?;
    Ok(BulkLyricsEligibility {
        eligible: tracks.len(),
        selected: selection
            .limit
            .map_or(tracks.len(), |limit| limit.min(tracks.len())),
    })
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

struct ScopeTrack {
    display: BulkLyricsTrack,
    song: SongContext,
    fingerprint: String,
}

fn scope_tracks(db: &Database, scope: BulkLyricsScope) -> Result<Vec<ScopeTrack>, String> {
    let conn = db.connect()?;
    let sql = match scope {
        BulkLyricsScope::AllLibrary => "SELECT t.id,t.path,t.title,a.name,b.title,t.duration,t.size,t.modified FROM tracks t JOIN artists a ON a.id=t.artist_id JOIN albums b ON b.id=t.album_id ORDER BY t.id",
        BulkLyricsScope::RecentDownloads => "SELECT t.id,t.path,t.title,a.name,b.title,t.duration,t.size,t.modified FROM (SELECT track_id,MAX(finalized_at) newest_at,MAX(rowid) newest_row FROM slskd_download_finalizations WHERE track_id IS NOT NULL AND status IN ('imported','already_in_library') GROUP BY track_id) d JOIN tracks t ON t.id=d.track_id JOIN artists a ON a.id=t.artist_id JOIN albums b ON b.id=t.album_id ORDER BY d.newest_at DESC,d.newest_row DESC",
    };
    let mut statement = conn.prepare(sql).map_err(|e| e.to_string())?;
    let tracks = statement
        .query_map([], |row| {
            let track_id: i64 = row.get(0)?;
            let path = PathBuf::from(row.get::<_, String>(1)?);
            let title: String = row.get(2)?;
            let artist: String = row.get(3)?;
            let album: String = row.get(4)?;
            let duration: f64 = row.get(5)?;
            let size: i64 = row.get(6)?;
            let modified: String = row.get(7)?;
            Ok(ScopeTrack {
                display: BulkLyricsTrack {
                    track_id,
                    title: title.clone(),
                    artist: artist.clone(),
                },
                song: SongContext {
                    id: track_id,
                    path,
                    title,
                    artist,
                    album,
                    duration,
                },
                fingerprint: format!("{size}:{modified}"),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(tracks)
}

fn eligible_worklist(
    db: &Database,
    provider_name: &str,
    scope: BulkLyricsScope,
    cache: &ExternalLyricsCachePolicy,
) -> Result<Vec<BulkLyricsTrack>, String> {
    let now = unix_now();
    let mut eligible = Vec::new();
    for track in scope_tracks(db, scope)? {
        crate::lyrics::refresh_track(db, &track.song, &track.fingerprint)?;
        if external_lyrics::needs_lookup_at_with_policy(
            db,
            track.display.track_id,
            provider_name,
            now,
            cache,
        )? {
            eligible.push(track.display);
        }
    }
    Ok(eligible)
}

fn selected_worklist(
    db: &Database,
    provider_name: &str,
    selection: BulkLyricsSelection,
    cache: &ExternalLyricsCachePolicy,
) -> Result<Vec<BulkLyricsTrack>, String> {
    let selection = selection.validated()?;
    let mut tracks = eligible_worklist(db, provider_name, selection.scope, cache)?;
    if let Some(limit) = selection.limit {
        tracks.truncate(limit);
    }
    Ok(tracks)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::{LyricsDocument, LyricsLookup, SongContext};
    use rusqlite::params;
    use std::{collections::HashSet, path::PathBuf, sync::atomic::AtomicUsize};

    struct Fixture {
        root: PathBuf,
        db: Database,
        paths: Vec<PathBuf>,
    }

    impl Fixture {
        fn new(name: &str, count: usize) -> Self {
            let root = std::env::temp_dir().join(format!(
                "undertone-bulk-lyrics-{name}-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            std::fs::create_dir_all(root.join("music")).unwrap();
            let db = Database::open(&root.join("db")).unwrap();
            let conn = db.connect().unwrap();
            conn.execute("INSERT INTO artists(id,name) VALUES(1,'Artist')", [])
                .unwrap();
            conn.execute(
                "INSERT INTO albums(id,title,artist_id) VALUES(1,'Album',1)",
                [],
            )
            .unwrap();
            let mut paths = Vec::new();
            for id in 1..=count as i64 {
                let path = root.join("music").join(format!("Song {id}.wav"));
                std::fs::write(&path, b"x").unwrap();
                conn.execute(
                    "INSERT INTO tracks(id,path,title,artist_id,album_id,album_artist,duration,format,size,modified) VALUES(?1,?2,?3,1,1,'Artist',180.0,'wav',1,'stable')",
                    params![id, path.to_string_lossy(), format!("Song {id}")],
                )
                .unwrap();
                conn.execute(
                    "INSERT INTO lyrics_scan_state(track_id,audio_fingerprint) VALUES(?1,'1:stable')",
                    [id],
                )
                .unwrap();
                paths.push(path);
            }
            drop(conn);
            Self { root, db, paths }
        }

        fn state(&self, id: i64, status: &str, attempted: i64, retry_after: Option<i64>) {
            self.db
                .connect()
                .unwrap()
                .execute(
                    "UPDATE lyrics_scan_state SET external_status=?2,external_provider='mock',external_attempted_at=?3,external_retry_after=?4 WHERE track_id=?1",
                    params![id, status, attempted, retry_after],
                )
                .unwrap();
        }

        fn manual(&self, id: i64) {
            self.db.connect().unwrap().execute(
                "INSERT INTO lyrics(track_id,source,kind,plain_text,source_fingerprint,manual_override) VALUES(?1,'manual','plain','manual','manual',1)",
                [id],
            ).unwrap();
        }

        fn external_success(&self, id: i64, attempted: i64) {
            self.db.connect().unwrap().execute(
                "INSERT INTO lyrics(track_id,source,kind,plain_text,source_fingerprint,manual_override) VALUES(?1,'external','plain','cached','mock:cached',0)",
                [id],
            ).unwrap();
            self.state(id, "success", attempted, None);
        }

        fn finalized_download(&self, operation: &str, id: i64) {
            self.db.connect().unwrap().execute(
                "INSERT INTO slskd_download_finalizations(operation_id,status,track_id) VALUES(?1,'imported',?2)",
                params![operation,id],
            ).unwrap();
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    struct MockProvider {
        calls: Mutex<Vec<(i64, Instant)>>,
        active: AtomicUsize,
        max_active: AtomicUsize,
        handler: Box<dyn Fn(&SongContext) -> Result<LyricsLookup, String> + Send + Sync>,
    }

    impl MockProvider {
        fn new(
            handler: impl Fn(&SongContext) -> Result<LyricsLookup, String> + Send + Sync + 'static,
        ) -> Self {
            Self {
                calls: Mutex::new(Vec::new()),
                active: AtomicUsize::new(0),
                max_active: AtomicUsize::new(0),
                handler: Box::new(handler),
            }
        }

        fn ids(&self) -> Vec<i64> {
            self.calls
                .lock()
                .unwrap()
                .iter()
                .map(|(id, _)| *id)
                .collect()
        }
    }

    impl LyricsProvider for MockProvider {
        fn name(&self) -> &str {
            "mock"
        }

        fn find(&self, song: &SongContext) -> Result<LyricsLookup, String> {
            self.calls.lock().unwrap().push((song.id, Instant::now()));
            let active = self.active.fetch_add(1, Ordering::SeqCst) + 1;
            self.max_active.fetch_max(active, Ordering::SeqCst);
            let result = (self.handler)(song);
            self.active.fetch_sub(1, Ordering::SeqCst);
            result
        }
    }

    fn found(id: i64) -> LyricsLookup {
        LyricsLookup::Found(LyricsDocument {
            plain: Some(format!("lyrics {id}")),
            synced: Vec::new(),
            origin: LyricsOrigin::External("mock".into()),
            manually_edited: false,
            revision: format!("mock:{id}"),
        })
    }

    fn test_policy() -> BulkLyricsPolicy {
        BulkLyricsPolicy {
            cache: ExternalLyricsCachePolicy {
                not_found_retry: Duration::from_secs(10),
                ambiguous_retry: Duration::from_secs(10),
                temporary_error_retry: Duration::from_secs(10),
                max_retry_after: Duration::from_secs(2),
            },
            request_interval: Duration::ZERO,
        }
    }

    fn wait(job: &BulkLyricsJob) -> BulkLyricsProgress {
        let deadline = Instant::now() + Duration::from_secs(8);
        loop {
            let status = job.status();
            if matches!(
                status.phase,
                BulkLyricsPhase::Completed | BulkLyricsPhase::Cancelled
            ) {
                return status;
            }
            assert!(Instant::now() < deadline, "bulk job timed out: {status:?}");
            thread::sleep(Duration::from_millis(10));
        }
    }

    #[test]
    fn one_hundred_mixed_tracks_skip_local_manual_and_fresh_cache() {
        let fixture = Fixture::new("mixed", 100);
        let now = unix_now();
        for id in 1..=20 {
            fixture.manual(id);
        }
        for id in 21..=40 {
            std::fs::write(
                fixture.paths[(id - 1) as usize].with_extension("lrc"),
                "[00:01.00]локальный текст",
            )
            .unwrap();
        }
        for id in 41..=50 {
            fixture.external_success(id, now);
        }
        for id in 51..=60 {
            fixture.state(id, "not_found", now, None);
        }
        for id in 61..=70 {
            fixture.state(id, "temporary_error", now, Some(now + 60));
        }

        let provider = Arc::new(MockProvider::new(|song| Ok(found(song.id))));
        let job = BulkLyricsJob::default();
        job.start_with_policy(fixture.db.clone(), provider.clone(), test_policy())
            .unwrap();
        let status = wait(&job);
        assert_eq!(status.phase, BulkLyricsPhase::Completed);
        assert_eq!(
            (status.total, status.processed, status.remaining),
            (30, 30, 0)
        );
        assert_eq!(provider.ids().len(), 30);
        assert_eq!(provider.max_active.load(Ordering::SeqCst), 1);
        assert_eq!(status.local_existing, 0);
        assert_eq!(status.found, 30);
        assert_eq!(status.not_found, 0);
        assert_eq!(status.temporary_errors, 0);
        assert_eq!(status.skipped, 0);
        assert_eq!(outcome_total(&status), status.processed);
    }

    #[test]
    fn centralized_miss_and_retry_after_policy_selects_only_expired_entries() {
        let fixture = Fixture::new("expiry", 6);
        let now = unix_now();
        fixture.state(1, "not_found", now, None);
        fixture.state(2, "not_found", now - 20, None);
        fixture.state(3, "ambiguous", now, None);
        fixture.state(4, "ambiguous", now - 20, None);
        fixture.state(5, "temporary_error", now, Some(now + 60));
        fixture.state(6, "temporary_error", now - 20, Some(now - 1));
        let provider = Arc::new(MockProvider::new(|_| Ok(LyricsLookup::NotFound)));
        let job = BulkLyricsJob::default();
        job.start_with_policy(fixture.db.clone(), provider.clone(), test_policy())
            .unwrap();
        let status = wait(&job);
        assert_eq!(provider.ids(), vec![2, 4, 6]);
        assert_eq!(status.not_found, 3);
        assert_eq!(status.skipped, 0);
        assert_eq!(outcome_total(&status), status.processed);
    }

    #[test]
    fn rate_limit_pauses_subsequent_requests_and_keeps_concurrency_one() {
        let fixture = Fixture::new("rate-limit", 3);
        let provider = Arc::new(MockProvider::new(|song| {
            if song.id == 1 {
                Ok(LyricsLookup::TemporaryError {
                    retry_after_seconds: Some(1),
                    rate_limited: true,
                })
            } else {
                Ok(found(song.id))
            }
        }));
        let job = BulkLyricsJob::default();
        job.start_with_policy(fixture.db.clone(), provider.clone(), test_policy())
            .unwrap();
        let status = wait(&job);
        let calls = provider.calls.lock().unwrap();
        assert_eq!(status.temporary_errors, 1);
        assert!(calls[1].1.duration_since(calls[0].1) >= Duration::from_millis(900));
        assert_eq!(provider.max_active.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn cancellation_resumes_from_database_and_completed_rerun_makes_no_http() {
        let fixture = Fixture::new("cancel-resume", 20);
        let first = Arc::new(MockProvider::new(|song| {
            thread::sleep(Duration::from_millis(25));
            Ok(found(song.id))
        }));
        let job = BulkLyricsJob::default();
        job.start_with_policy(fixture.db.clone(), first.clone(), test_policy())
            .unwrap();
        while first.ids().len() < 2 {
            thread::sleep(Duration::from_millis(5));
        }
        job.cancel();
        let cancelled = wait(&job);
        assert_eq!(cancelled.phase, BulkLyricsPhase::Cancelled);
        assert!(cancelled.processed < 20);

        let resumed = Arc::new(MockProvider::new(|song| Ok(found(song.id))));
        job.start_with_policy(fixture.db.clone(), resumed.clone(), test_policy())
            .unwrap();
        let completed = wait(&job);
        assert_eq!(completed.phase, BulkLyricsPhase::Completed);
        assert_eq!(resumed.ids().len(), 20 - cancelled.processed);

        let rerun = Arc::new(MockProvider::new(|song| Ok(found(song.id))));
        job.start_with_policy(fixture.db.clone(), rerun.clone(), test_policy())
            .unwrap();
        wait(&job);
        assert!(rerun.ids().is_empty());
    }

    #[test]
    fn track_error_does_not_stop_job_and_new_local_lyrics_win_before_lookup() {
        let fixture = Fixture::new("race", 4);
        let local_path = fixture.paths[1].with_extension("lrc");
        let provider = Arc::new(MockProvider::new(move |song| match song.id {
            1 => {
                std::fs::write(&local_path, "[00:01.00]appeared locally").unwrap();
                Ok(found(song.id))
            }
            3 => Err("isolated provider failure".into()),
            _ => Ok(found(song.id)),
        }));
        let job = BulkLyricsJob::default();
        job.start_with_policy(fixture.db.clone(), provider.clone(), test_policy())
            .unwrap();
        let status = wait(&job);
        assert_eq!(status.phase, BulkLyricsPhase::Completed);
        assert_eq!(provider.ids(), vec![1, 3, 4]);
        assert_eq!(status.local_existing, 1);
        assert_eq!(status.permanent_errors, 1);
        assert_eq!(status.found, 2);
        assert_eq!(
            provider.ids().into_iter().collect::<HashSet<_>>(),
            HashSet::from([1, 3, 4])
        );
    }

    fn outcome_total(status: &BulkLyricsProgress) -> usize {
        status.found
            + status.local_existing
            + status.skipped
            + status.not_found
            + status.ambiguous
            + status.temporary_errors
            + status.permanent_errors
    }

    #[test]
    fn every_processed_track_has_exactly_one_run_outcome() {
        let fixture = Fixture::new("exclusive-outcomes", 7);
        fixture.manual(1);
        fixture.external_success(2, unix_now());
        let provider = Arc::new(MockProvider::new(|song| match song.id {
            3 => Ok(found(song.id)),
            4 => Ok(LyricsLookup::NotFound),
            5 => Ok(LyricsLookup::Ambiguous),
            6 => Ok(LyricsLookup::TemporaryError {
                retry_after_seconds: Some(1),
                rate_limited: false,
            }),
            7 => Err("one track failed".into()),
            _ => panic!("cached/local track called provider"),
        }));
        let job = BulkLyricsJob::default();
        job.start_with_policy(fixture.db.clone(), provider, test_policy())
            .unwrap();
        let status = wait(&job);
        assert_eq!(status.processed, 5);
        assert_eq!(status.local_existing, 0);
        assert_eq!(status.skipped, 0);
        assert_eq!(status.found, 1);
        assert_eq!(status.not_found, 1);
        assert_eq!(status.ambiguous, 1);
        assert_eq!(status.temporary_errors, 1);
        assert_eq!(status.permanent_errors, 1);
        assert_eq!(outcome_total(&status), status.processed);
    }

    #[test]
    fn running_to_completed_does_not_reclassify_outcomes() {
        let running = BulkLyricsProgress {
            phase: BulkLyricsPhase::Running,
            processed: 6,
            found: 1,
            local_existing: 1,
            skipped: 1,
            not_found: 1,
            ambiguous: 1,
            temporary_errors: 1,
            ..BulkLyricsProgress::default()
        };
        let mut completed = running.clone();
        completed.phase = BulkLyricsPhase::Completed;
        assert_eq!(outcome_total(&running), running.processed);
        assert_eq!(outcome_total(&completed), completed.processed);
        assert_eq!(
            (
                running.found,
                running.local_existing,
                running.skipped,
                running.not_found,
                running.ambiguous,
                running.temporary_errors,
                running.permanent_errors,
            ),
            (
                completed.found,
                completed.local_existing,
                completed.skipped,
                completed.not_found,
                completed.ambiguous,
                completed.temporary_errors,
                completed.permanent_errors,
            )
        );
    }

    #[test]
    fn phase_3d_10_all_library_limits_the_eligible_worklist_not_library_rows() {
        let fixture = Fixture::new("scope-all", 70);
        let now = unix_now();
        for id in 1..=10 {
            fixture.manual(id);
        }
        for id in 11..=20 {
            fixture.external_success(id, now);
        }
        let selection = BulkLyricsSelection {
            scope: BulkLyricsScope::AllLibrary,
            limit: Some(10),
        };
        let preview = eligibility(&fixture.db, "mock", selection).unwrap();
        assert_eq!((preview.eligible, preview.selected), (50, 10));
        let provider = Arc::new(MockProvider::new(|song| Ok(found(song.id))));
        let job = BulkLyricsJob::default();
        let started = job
            .start_selected_with_policy(
                fixture.db.clone(),
                provider.clone(),
                selection,
                test_policy(),
            )
            .unwrap();
        assert_eq!((started.total, started.remaining), (10, 10));
        let completed = wait(&job);
        assert_eq!((completed.total, completed.processed), (10, 10));
        assert_eq!(provider.ids(), (21..=30).collect::<Vec<_>>());
    }

    #[test]
    fn phase_3d_10_recent_downloads_are_newest_first_and_deduplicated_by_track_id() {
        let fixture = Fixture::new("scope-recent", 5);
        fixture.finalized_download("old-track-2", 2);
        fixture.finalized_download("track-4", 4);
        fixture.finalized_download("newer-track-2", 2);
        fixture.finalized_download("newest-track-3", 3);
        let tracks = selected_worklist(
            &fixture.db,
            "mock",
            BulkLyricsSelection {
                scope: BulkLyricsScope::RecentDownloads,
                limit: None,
            },
            &test_policy().cache,
        )
        .unwrap();
        assert_eq!(
            tracks
                .iter()
                .map(|track| track.track_id)
                .collect::<Vec<_>>(),
            vec![3, 2, 4]
        );
    }

    #[test]
    fn phase_3d_10_allowed_limits_and_smaller_worklists_report_actual_total() {
        for limit in [10, 25, 50, 100, 250] {
            assert!(BulkLyricsSelection {
                scope: BulkLyricsScope::AllLibrary,
                limit: Some(limit)
            }
            .validated()
            .is_ok());
        }
        assert!(BulkLyricsSelection {
            scope: BulkLyricsScope::AllLibrary,
            limit: None
        }
        .validated()
        .is_ok());
        assert!(BulkLyricsSelection {
            scope: BulkLyricsScope::AllLibrary,
            limit: Some(11)
        }
        .validated()
        .is_err());
        let fixture = Fixture::new("small-limit", 3);
        let selection = BulkLyricsSelection {
            scope: BulkLyricsScope::AllLibrary,
            limit: Some(250),
        };
        assert_eq!(
            eligibility(&fixture.db, "mock", selection)
                .unwrap()
                .selected,
            3
        );
        let provider = Arc::new(MockProvider::new(|song| Ok(found(song.id))));
        let job = BulkLyricsJob::default();
        let started = job
            .start_selected_with_policy(fixture.db.clone(), provider, selection, test_policy())
            .unwrap();
        assert_eq!(started.total, 3);
        assert_eq!(wait(&job).processed, 3);
    }
}
