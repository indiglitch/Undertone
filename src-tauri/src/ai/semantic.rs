//! Bounded development paths for indexing selected tracks and checking semantic quality.
use crate::{
    ai::{
        cosine_similarity, is_embedding_current, load_embedding, store_embedding, EmbeddingVersion,
        SemanticInput, TrackEmbedding,
    },
    database::Database,
    providers::EmbeddingProvider,
};
use rusqlite::params;
use serde::Serialize;
use std::collections::HashSet;

pub const MAX_DEVELOPMENT_TRACKS: usize = 20;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TrackEmbeddingStatus {
    Stored,
    CurrentSkipped,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct TrackEmbeddingResult {
    pub track_id: i64,
    pub status: TrackEmbeddingStatus,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct SemanticMatch {
    pub track_id: i64,
    pub title: String,
    pub artist: String,
    pub score: f32,
}

fn bounded_unique_ids(track_ids: &[i64]) -> Result<Vec<i64>, String> {
    if track_ids.len() > MAX_DEVELOPMENT_TRACKS {
        return Err(format!(
            "at most {MAX_DEVELOPMENT_TRACKS} track ids are allowed"
        ));
    }
    let mut seen = HashSet::new();
    Ok(track_ids
        .iter()
        .copied()
        .filter(|track_id| seen.insert(*track_id))
        .collect())
}

/// Must be awaited from a blocking worker because local provider inference is CPU-heavy.
pub async fn embed_tracks(
    db: &Database,
    provider: &dyn EmbeddingProvider,
    track_ids: &[i64],
) -> Result<Vec<TrackEmbeddingResult>, String> {
    let track_ids = bounded_unique_ids(track_ids)?;
    let mut results = Vec::with_capacity(track_ids.len());
    for track_id in track_ids {
        let input = SemanticInput::for_track(db, track_id)?;
        let expected = EmbeddingVersion {
            provider_id: provider.provider_id(),
            model_id: provider.model_id(),
            model_version: provider.model_version(),
            input_fingerprint: &input.fingerprint,
        };
        if load_embedding(
            db,
            track_id,
            provider.provider_id(),
            provider.model_id(),
            provider.model_version(),
        )?
        .as_ref()
        .is_some_and(|stored| is_embedding_current(stored, &expected))
        {
            results.push(TrackEmbeddingResult {
                track_id,
                status: TrackEmbeddingStatus::CurrentSkipped,
            });
            continue;
        }
        let vector = provider.embed(&input.text).await?;
        if vector.dimension() != provider.dimension() {
            return Err(format!(
                "provider returned dimension {}, expected {}",
                vector.dimension(),
                provider.dimension()
            ));
        }
        let created_at = db
            .connect()?
            .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |row| {
                row.get(0)
            })
            .map_err(|error| error.to_string())?;
        store_embedding(
            db,
            &TrackEmbedding {
                track_id,
                provider_id: provider.provider_id().to_owned(),
                model_id: provider.model_id().to_owned(),
                model_version: provider.model_version().to_owned(),
                vector,
                input_fingerprint: input.fingerprint,
                created_at,
            },
        )?;
        results.push(TrackEmbeddingResult {
            track_id,
            status: TrackEmbeddingStatus::Stored,
        });
    }
    Ok(results)
}

/// Ranks only explicitly selected candidates that already have a current-model embedding.
pub async fn semantic_query(
    db: &Database,
    provider: &dyn EmbeddingProvider,
    text: &str,
    candidate_track_ids: &[i64],
) -> Result<Vec<SemanticMatch>, String> {
    if text.trim().is_empty() {
        return Err("semantic query must not be empty".into());
    }
    let candidate_track_ids = bounded_unique_ids(candidate_track_ids)?;
    let query = provider.embed_query(text).await?;
    if query.dimension() != provider.dimension() {
        return Err("query embedding dimension does not match provider metadata".into());
    }
    let conn = db.connect()?;
    let mut matches = Vec::new();
    for track_id in candidate_track_ids {
        let Some(embedding) = load_embedding(
            db,
            track_id,
            provider.provider_id(),
            provider.model_id(),
            provider.model_version(),
        )?
        else {
            continue;
        };
        let input = SemanticInput::for_track(db, track_id)?;
        let expected = EmbeddingVersion {
            provider_id: provider.provider_id(),
            model_id: provider.model_id(),
            model_version: provider.model_version(),
            input_fingerprint: &input.fingerprint,
        };
        if !is_embedding_current(&embedding, &expected) {
            continue;
        }
        let (title, artist) = conn
            .query_row(
                "SELECT t.title,a.name FROM tracks t JOIN artists a ON a.id=t.artist_id WHERE t.id=?1",
                params![track_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| error.to_string())?;
        matches.push(SemanticMatch {
            track_id,
            title,
            artist,
            score: cosine_similarity(&query, &embedding.vector)?,
        });
    }
    sort_matches(&mut matches);
    Ok(matches)
}

pub fn sort_matches(matches: &mut [SemanticMatch]) {
    matches.sort_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then_with(|| left.track_id.cmp(&right.track_id))
    });
}
