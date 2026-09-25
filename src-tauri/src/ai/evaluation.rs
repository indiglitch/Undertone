//! Pure development scoring helpers for evaluating semantic retrieval quality.
//! No evaluation result is persisted and the production retrieval path is unchanged.
use crate::ai::{cosine_similarity, EmbeddingVector};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChunkScoring {
    Max,
    TopKMean(usize),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SplitWeights {
    pub metadata: f32,
    pub lyrics: f32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum QueryRepresentation {
    Raw,
    MusicContext,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EvaluationScore {
    pub track_id: i64,
    pub score: f32,
}

pub fn evaluation_query_text(
    query: &str,
    representation: QueryRepresentation,
) -> Result<String, String> {
    let normalized = query.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return Err("evaluation query must not be empty".into());
    }
    Ok(match representation {
        QueryRepresentation::Raw => normalized,
        QueryRepresentation::MusicContext => {
            format!("music mood and atmosphere: {normalized}")
        }
    })
}

pub fn score_chunks(
    query: &EmbeddingVector,
    chunks: &[EmbeddingVector],
    scoring: ChunkScoring,
) -> Result<f32, String> {
    if chunks.is_empty() {
        return Err("at least one chunk embedding is required".into());
    }
    let mut scores = chunks
        .iter()
        .map(|chunk| cosine_similarity(query, chunk))
        .collect::<Result<Vec<_>, _>>()?;
    scores.sort_by(|left, right| right.total_cmp(left));
    let score = match scoring {
        ChunkScoring::Max => scores[0],
        ChunkScoring::TopKMean(k) => {
            if k == 0 {
                return Err("top-k must be greater than zero".into());
            }
            let count = k.min(scores.len());
            scores[..count]
                .iter()
                .map(|&value| f64::from(value))
                .sum::<f64>() as f32
                / count as f32
        }
    };
    finite_score(score)
}

pub fn mean_embedding(chunks: &[EmbeddingVector]) -> Result<EmbeddingVector, String> {
    let first = chunks
        .first()
        .ok_or_else(|| "at least one chunk embedding is required".to_owned())?;
    let dimension = first.dimension();
    if chunks.iter().any(|chunk| chunk.dimension() != dimension) {
        return Err("chunk embedding dimensions do not match".into());
    }
    let mut mean = vec![0.0f64; dimension];
    for chunk in chunks {
        for (sum, &value) in mean.iter_mut().zip(chunk.values()) {
            *sum += f64::from(value);
        }
    }
    for value in &mut mean {
        *value /= chunks.len() as f64;
    }
    let norm = mean.iter().map(|value| value * value).sum::<f64>().sqrt();
    if !norm.is_finite() || norm == 0.0 {
        return Err("mean embedding has an invalid or zero norm".into());
    }
    EmbeddingVector::new(
        mean.into_iter()
            .map(|value| (value / norm) as f32)
            .collect(),
    )
}

pub fn combine_metadata_lyrics(
    metadata_score: f32,
    lyrics_score: Option<f32>,
    weights: SplitWeights,
) -> Result<f32, String> {
    finite_score(metadata_score)?;
    if !weights.metadata.is_finite()
        || !weights.lyrics.is_finite()
        || weights.metadata < 0.0
        || weights.lyrics < 0.0
    {
        return Err("split weights must be finite and non-negative".into());
    }
    let Some(lyrics_score) = lyrics_score else {
        return Ok(metadata_score);
    };
    finite_score(lyrics_score)?;
    let total = weights.metadata + weights.lyrics;
    if !total.is_finite() || total <= 0.0 {
        return Err("split weights must have a positive sum".into());
    }
    finite_score((metadata_score * weights.metadata + lyrics_score * weights.lyrics) / total)
}

pub fn mean_similarity(scores: &[f32]) -> Result<f32, String> {
    if scores.is_empty() {
        return Err("at least one similarity is required".into());
    }
    for &score in scores {
        finite_score(score)?;
    }
    finite_score(
        (scores.iter().map(|&value| f64::from(value)).sum::<f64>() / scores.len() as f64) as f32,
    )
}

pub fn sort_scores(scores: &mut [EvaluationScore]) {
    scores.sort_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then_with(|| left.track_id.cmp(&right.track_id))
    });
}

fn finite_score(score: f32) -> Result<f32, String> {
    if score.is_finite() {
        Ok(score)
    } else {
        Err("similarity score must be finite".into())
    }
}
