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
        reason: &'static str,
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
