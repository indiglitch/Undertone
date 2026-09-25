use crate::ai::{
    cosine_similarity,
    evaluation::{
        combine_metadata_lyrics, evaluation_query_text, mean_embedding, score_chunks, sort_scores,
        ChunkScoring, EvaluationScore, QueryRepresentation, SplitWeights,
    },
    EmbeddingVector,
};

fn vector(values: &[f32]) -> EmbeddingVector {
    EmbeddingVector::new(values.to_vec()).unwrap()
}

#[test]
fn max_and_top_k_chunk_scoring_are_deterministic() {
    let query = vector(&[1.0, 0.0]);
    let chunks = [
        vector(&[0.0, 1.0]),
        vector(&[1.0, 0.0]),
        vector(&[0.6, 0.8]),
    ];
    assert_eq!(
        score_chunks(&query, &chunks, ChunkScoring::Max).unwrap(),
        1.0
    );
    let first = score_chunks(&query, &chunks, ChunkScoring::TopKMean(2)).unwrap();
    let second = score_chunks(&query, &chunks, ChunkScoring::TopKMean(2)).unwrap();
    assert!((first - 0.8).abs() < 1e-6);
    assert_eq!(first, second);
}

#[test]
fn scoring_order_is_descending_with_stable_track_tie_break() {
    let mut scores = [
        EvaluationScore {
            track_id: 3,
            score: 0.2,
        },
        EvaluationScore {
            track_id: 2,
            score: 0.8,
        },
        EvaluationScore {
            track_id: 1,
            score: 0.8,
        },
    ];
    sort_scores(&mut scores);
    assert_eq!(scores.map(|score| score.track_id), [1, 2, 3]);
}

#[test]
fn chunk_scoring_rejects_dimension_mismatch_and_invalid_k() {
    let query = vector(&[1.0, 0.0]);
    assert!(score_chunks(&query, &[vector(&[1.0])], ChunkScoring::Max).is_err());
    assert!(score_chunks(&query, &[vector(&[1.0, 0.0])], ChunkScoring::TopKMean(0)).is_err());
}

#[test]
fn metadata_lyrics_combination_is_deterministic_and_finite() {
    let weights = SplitWeights {
        metadata: 1.0,
        lyrics: 3.0,
    };
    let first = combine_metadata_lyrics(0.4, Some(0.8), weights).unwrap();
    let second = combine_metadata_lyrics(0.4, Some(0.8), weights).unwrap();
    assert!((first - 0.7).abs() < 1e-6);
    assert_eq!(first, second);
    assert_eq!(combine_metadata_lyrics(0.4, None, weights).unwrap(), 0.4);
    assert!(combine_metadata_lyrics(f32::NAN, Some(0.8), weights).is_err());
    assert!(combine_metadata_lyrics(0.4, Some(f32::INFINITY), weights).is_err());
}

#[test]
fn mean_embedding_is_normalized_and_never_returns_nan() {
    let mean = mean_embedding(&[vector(&[1.0, 0.0]), vector(&[0.0, 1.0])]).unwrap();
    assert!(mean.values().iter().all(|value| value.is_finite()));
    assert!((cosine_similarity(&mean, &mean).unwrap() - 1.0).abs() < 1e-6);
    assert!(mean_embedding(&[vector(&[1.0, 0.0]), vector(&[1.0])]).is_err());
    assert!(mean_embedding(&[vector(&[1.0, 0.0]), vector(&[-1.0, 0.0])]).is_err());
}

#[test]
fn raw_and_contextual_query_paths_preserve_the_user_query() {
    let query = "  агрессивная   энергичная музыка ";
    assert_eq!(
        evaluation_query_text(query, QueryRepresentation::Raw).unwrap(),
        "агрессивная энергичная музыка"
    );
    assert_eq!(
        evaluation_query_text(query, QueryRepresentation::MusicContext).unwrap(),
        "music mood and atmosphere: агрессивная энергичная музыка"
    );
}
