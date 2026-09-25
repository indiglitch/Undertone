//! Contracts only. No network clients or model runtimes are registered by default.
#[cfg(feature = "ai")]
use crate::ai::{EmbeddingVector, SemanticAnalysisContent};
use crate::metadata::Metadata;
use std::{
    path::{Path, PathBuf},
};
#[cfg(feature = "ai")]
use std::{future::Future, pin::Pin};
pub type TrackId = i64;
#[cfg(feature = "ai")]
pub type ProviderFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, String>> + Send + 'a>>;

/// Blocking backend contract; desktop callers must use spawn_blocking.
pub trait SearchProvider: Send + Sync {
    fn search(&self, query: &str) -> Result<SoulseekSearchResults, String>;
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchSource {
    Soulseek,
}

/// Remote strings are untrusted opaque identifiers, never local filesystem paths or HTML.
#[derive(Debug, serde::Serialize)]
pub struct SoulseekSearchResult {
    pub source: SearchSource,
    pub search_id: String,
    pub username: String,
    pub remote_path: String,
    pub size_bytes: u64,
    pub extension: Option<String>,
    pub bitrate_kbps: Option<u32>,
    pub sample_rate_hz: Option<u32>,
    pub bit_depth: Option<u32>,
    pub duration_seconds: Option<u32>,
    pub has_free_upload_slot: Option<bool>,
    pub queue_length: Option<u64>,
    pub upload_speed_bytes_per_second: Option<u32>,
    pub is_locked: bool,
}

#[derive(Debug, serde::Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SearchCompletion {
    Complete,
    TimedOut,
    ResultLimit,
}

#[derive(Debug, serde::Serialize)]
pub struct SoulseekSearchResults {
    pub search_id: String,
    pub completion: SearchCompletion,
    pub results: Vec<SoulseekSearchResult>,
    /// Cleanup is bounded and best effort, including when slskd disconnects.
    pub cleanup_succeeded: bool,
}

#[derive(Debug, serde::Deserialize)]
pub struct SoulseekDownloadRequest {
    pub username: String,
    pub remote_path: String,
    pub size_bytes: u64,
}

#[derive(Debug, serde::Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadState {
    Queued,
    Downloading,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, serde::Serialize)]
pub struct DownloadStatus {
    pub operation_id: String,
    pub transfer_id: String,
    pub state: DownloadState,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub progress: f64,
    pub speed_bytes_per_second: f64,
    pub eta_seconds: Option<u64>,
    pub source_username: String,
    pub remote_path: String,
    pub local_path: Option<String>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, PartialEq, Clone)]
#[serde(rename_all = "snake_case")]
pub enum DownloadFinalizeState {
    Imported,
    AlreadyInLibrary,
    FileNotFound,
    Ambiguous,
    InvalidFile,
    ImportFailed,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, PartialEq, Clone)]
pub struct DownloadFinalizeResult {
    pub operation_id: String,
    pub status: DownloadFinalizeState,
    pub track_id: Option<TrackId>,
    pub local_path: Option<String>,
}

/// Blocking backend contract; desktop callers must use spawn_blocking.
#[cfg(not(any(target_os = "ios", target_os = "android")))]
pub trait DownloadProvider: Send + Sync {
    fn start_download(&self, request: SoulseekDownloadRequest) -> Result<DownloadStatus, String>;
    fn download_status(&self, operation_id: &str) -> Result<DownloadStatus, String>;
    fn cancel_download(&self, operation_id: &str) -> Result<DownloadStatus, String>;
}
pub trait MetadataProvider: Send + Sync {
    fn read(&self, path: &Path, cover_cache: &Path) -> Result<Metadata, String>;
}
pub struct SongContext {
    pub id: TrackId,
    pub path: PathBuf,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: f64,
}
#[derive(Debug, serde::Serialize, serde::Deserialize, PartialEq, Clone)]
#[serde(rename_all = "snake_case")]
pub enum LyricsOrigin {
    EmbeddedPlain,
    EmbeddedSynced,
    LocalLrc,
    External(String),
    Manual,
}
#[derive(Debug, serde::Serialize, serde::Deserialize, PartialEq, Clone)]
pub struct SyncedLine {
    pub timestamp_ms: u64,
    pub text: String,
    pub order: u32,
}
#[derive(Debug, serde::Serialize, serde::Deserialize, PartialEq, Clone)]
pub struct LyricsDocument {
    pub plain: Option<String>,
    pub synced: Vec<SyncedLine>,
    pub origin: LyricsOrigin,
    pub manually_edited: bool,
    pub revision: String,
}
#[derive(Debug, PartialEq)]
pub enum LyricsLookup {
    Found(LyricsDocument),
    NotFound,
    Ambiguous,
    TemporaryError {
        retry_after_seconds: Option<u64>,
        rate_limited: bool,
    },
}
impl LyricsDocument {
    /// The persistence layer must enforce this again in its atomic UPDATE predicate.
    pub fn accepts_automatic_update(&self) -> bool {
        !self.manually_edited && !matches!(self.origin, LyricsOrigin::Manual)
    }
}
pub trait LyricsProvider: Send + Sync {
    fn name(&self) -> &str;
    /// Blocking contract. Desktop callers must use spawn_blocking.
    fn find(&self, song: &SongContext) -> Result<LyricsLookup, String>;
}
#[cfg(feature = "ai")]
pub enum ExecutionLocation {
    Local,
    CloudOptIn,
}
#[cfg(feature = "ai")]
pub trait AIAnalysisProvider: Send + Sync {
    fn location(&self) -> ExecutionLocation {
        ExecutionLocation::Local
    }
    fn provider_id(&self) -> &str;
    fn model_id(&self) -> &str;
    fn model_version(&self) -> &str;
    fn schema_version(&self) -> u32;
    fn analyze<'a>(
        &'a self,
        semantic_input: &'a str,
    ) -> ProviderFuture<'a, SemanticAnalysisContent>;
}
#[cfg(feature = "ai")]
pub struct Embedding {
    pub model: String,
    pub dimensions: usize,
    pub values: Vec<f32>,
}
#[cfg(feature = "ai")]
pub trait EmbeddingProvider: Send + Sync {
    fn location(&self) -> ExecutionLocation {
        ExecutionLocation::Local
    }
    fn provider_id(&self) -> &str;
    fn model_id(&self) -> &str;
    fn model_version(&self) -> &str;
    fn dimension(&self) -> usize;
    /// CPU-heavy provider futures must be polled from a worker, never the Tauri main thread.
    fn embed<'a>(&'a self, semantic_input: &'a str) -> ProviderFuture<'a, EmbeddingVector>;
    /// Queries and documents are distinct model inputs (for E5: `query:` vs `passage:`).
    fn embed_query<'a>(&'a self, query: &'a str) -> ProviderFuture<'a, EmbeddingVector>;
}
#[cfg(feature = "ai")]
pub struct RankedTrack {
    pub id: TrackId,
    pub score: f32,
}
#[cfg(feature = "ai")]
pub struct RecommendationQuery {
    pub embedding: Embedding,
    pub moods: Vec<(String, f32)>,
    pub limit: usize,
    pub daily_seed: Option<u64>,
}
#[cfg(feature = "ai")]
pub trait RecommendationEngine: Send + Sync {
    /// Reads persisted features/likes/history; does not invoke an LLM per playlist.
    fn rank(&self, query: &RecommendationQuery) -> Result<Vec<RankedTrack>, String>;
}
/// SQLite/config may hold this opaque reference; never the credential itself.
pub struct SecretRef(pub String);
pub trait SecretStore: Send + Sync {
    fn get(&self, key: &SecretRef) -> Result<Option<Vec<u8>>, String>;
    fn put(&self, key: &SecretRef, value: &[u8]) -> Result<(), String>;
    fn remove(&self, key: &SecretRef) -> Result<(), String>;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn manual_lyrics_are_protected() {
        let mut text = LyricsDocument {
            plain: Some("user edit".into()),
            synced: Vec::new(),
            origin: LyricsOrigin::Manual,
            manually_edited: false,
            revision: "1".into(),
        };
        assert!(!text.accepts_automatic_update());
        text.origin = LyricsOrigin::EmbeddedPlain;
        text.manually_edited = true;
        assert!(!text.accepts_automatic_update());
        text.manually_edited = false;
        assert!(text.accepts_automatic_update());
    }
}
