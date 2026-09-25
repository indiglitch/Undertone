use crate::{
    ai::{
        load_embedding,
        providers::local_e5::{
            artifact_version, artifact_version_cached, document_chunks, document_text,
            mean_pool_and_normalize, normalize_embedding, probe, query_text, SharedSession,
            Tokenization, EXPECTED_DIMENSION, MODEL_ID,
        },
        semantic::{
            embed_tracks, semantic_query, sort_matches, SemanticMatch, TrackEmbeddingStatus,
        },
        EmbeddingVector, LocalModelConfig, LocalModelStatus, TrackEmbedding,
    },
    database::Database,
    providers::{EmbeddingProvider, ProviderFuture},
};
use rusqlite::params;
use std::{
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

fn temporary_root(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "undertone-e5-{name}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&root).unwrap();
    root
}

fn test_database(name: &str, tracks: usize) -> (PathBuf, Database, Vec<i64>) {
    let root = temporary_root(name);
    let db = Database::open(&root).unwrap();
    let conn = db.connect().unwrap();
    conn.execute("INSERT INTO artists(name) VALUES('Test Artist')", [])
        .unwrap();
    let artist_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO albums(title,artist_id) VALUES('Test Album',?1)",
        [artist_id],
    )
    .unwrap();
    let album_id = conn.last_insert_rowid();
    let mut ids = Vec::new();
    for index in 0..tracks {
        conn.execute(
            "INSERT INTO tracks(path,title,artist_id,album_id,album_artist,duration,format,size,modified) VALUES(?1,?2,?3,?4,'Test Artist',1.0,'flac',1,'x')",
            params![format!("{index}.flac"), format!("Track {index}"), artist_id, album_id],
        ).unwrap();
        ids.push(conn.last_insert_rowid());
    }
    drop(conn);
    (root, db, ids)
}

fn unit_vector(index: usize) -> EmbeddingVector {
    let mut values = vec![0.0; EXPECTED_DIMENSION];
    values[index] = 1.0;
    EmbeddingVector::new(values).unwrap()
}

fn whitespace_tokenize(text: &str, special_tokens: bool) -> Tokenization {
    let mut offsets = Vec::new();
    let mut start = None;
    for (index, character) in text.char_indices() {
        if character.is_whitespace() {
            if let Some(word_start) = start.take() {
                offsets.push((word_start, index));
            }
        } else if start.is_none() {
            start = Some(index);
        }
    }
    if let Some(word_start) = start {
        offsets.push((word_start, text.len()));
    }
    Tokenization {
        token_count: offsets.len() + usize::from(special_tokens) * 2,
        offsets,
    }
}

struct FakeProvider {
    calls: AtomicUsize,
    query: EmbeddingVector,
}

impl FakeProvider {
    fn new(query: EmbeddingVector) -> Self {
        Self {
            calls: AtomicUsize::new(0),
            query,
        }
    }
}

impl EmbeddingProvider for FakeProvider {
    fn provider_id(&self) -> &str {
        "test-local"
    }
    fn model_id(&self) -> &str {
        MODEL_ID
    }
    fn model_version(&self) -> &str {
        "test-v1"
    }
    fn dimension(&self) -> usize {
        EXPECTED_DIMENSION
    }
    fn embed<'a>(&'a self, _: &'a str) -> ProviderFuture<'a, EmbeddingVector> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        Box::pin(async { Ok(unit_vector(0)) })
    }
    fn embed_query<'a>(&'a self, _: &'a str) -> ProviderFuture<'a, EmbeddingVector> {
        let vector = self.query.clone();
        Box::pin(async move { Ok(vector) })
    }
}

#[test]
fn e5_prefixes_are_explicit_and_distinct() {
    assert_eq!(document_text("title: Song"), "passage: title: Song");
    assert_eq!(
        query_text("  спокойная   музыка "),
        "query: спокойная музыка"
    );
}

#[test]
fn model_session_handle_is_reused_across_provider_clones() {
    let session = SharedSession::new(42_u8);
    let cloned = session.clone();
    assert_eq!(session.instance_id(), cloned.instance_id());
}

#[test]
fn deterministic_chunking_respects_budget_for_short_and_long_inputs() {
    let tokenize = |text: &str, special| Ok(whitespace_tokenize(text, special));
    let short = "title: One\nartist: Two\nalbum: Three\ngenre: \nyear: \nlyrics: short lyrics";
    let a = document_chunks(short, 20, tokenize).unwrap();
    let b = document_chunks(short, 20, tokenize).unwrap();
    assert_eq!(a, b);
    assert_eq!(a.len(), 1);

    let lyrics = (0..80)
        .map(|index| format!("word{index}"))
        .collect::<Vec<_>>()
        .join(" ");
    let long =
        format!("title: One\nartist: Two\nalbum: Three\ngenre: Rock\nyear: 2026\nlyrics: {lyrics}");
    let calls = AtomicUsize::new(0);
    let chunks = document_chunks(&long, 24, |text, special| {
        calls.fetch_add(1, Ordering::SeqCst);
        Ok(whitespace_tokenize(text, special))
    })
    .unwrap();
    assert!(chunks.len() > 1);
    assert!(chunks
        .iter()
        .all(|chunk| whitespace_tokenize(chunk, true).token_count <= 24));
    assert!(calls.load(Ordering::SeqCst) <= chunks.len() + 3);
    assert!(chunks.iter().all(|chunk| chunk.starts_with(
        "passage: title: One\nartist: Two\nalbum: Three\ngenre: Rock\nyear: 2026\nlyrics: "
    )));
}

#[test]
fn attention_pooling_and_l2_normalization_reject_bad_output() {
    let pooled =
        mean_pool_and_normalize(&[1.0, 0.0, 100.0, 100.0, 3.0, 0.0], &[1, 0, 1], 2).unwrap();
    assert!((pooled.values()[0] - 1.0).abs() < 1e-6);
    assert!(pooled.values()[1].abs() < 1e-6);
    let normalized = normalize_embedding(vec![3.0, 4.0]).unwrap();
    assert!((normalized.values()[0] - 0.6).abs() < 1e-6);
    assert!((normalized.values()[1] - 0.8).abs() < 1e-6);
    assert!(normalize_embedding(vec![0.0, 0.0]).is_err());
    assert!(normalize_embedding(vec![f32::NAN]).is_err());
    assert!(normalize_embedding(vec![f32::INFINITY]).is_err());
    assert!(mean_pool_and_normalize(&[1.0, 2.0], &[0], 2).is_err());
    assert_eq!(EXPECTED_DIMENSION, 384);
}

#[test]
fn model_identity_is_content_stable_and_missing_model_is_reported() {
    let missing = temporary_root("missing").join("not-there");
    let config = LocalModelConfig {
        model_id: MODEL_ID.into(),
        model_version: String::new(),
        path: missing,
        identity_cache_path: None,
    };
    assert_eq!(probe(&config).status, LocalModelStatus::Missing);

    let root = temporary_root("identity");
    std::fs::write(
        root.join("config.json"),
        r#"{"_name_or_path":"intfloat/multilingual-e5-small","hidden_size":384,"max_position_embeddings":512}"#,
    )
    .unwrap();
    std::fs::write(root.join("tokenizer.json"), b"tokenizer-a").unwrap();
    std::fs::write(root.join("model.onnx"), b"model-a").unwrap();
    let first = artifact_version(&root).unwrap();
    assert_eq!(artifact_version(&root).unwrap(), first);
    let cache_path = root.join("identity-cache.json");
    assert_eq!(artifact_version_cached(&root, &cache_path).unwrap(), first);
    assert_eq!(artifact_version_cached(&root, &cache_path).unwrap(), first);
    std::fs::write(root.join("model.onnx"), b"model-artifact-changed").unwrap();
    assert_ne!(artifact_version_cached(&root, &cache_path).unwrap(), first);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn current_embedding_is_skipped_and_persisted_vector_reloads() {
    let (root, db, ids) = test_database("skip", 1);
    let provider = FakeProvider::new(unit_vector(0));
    let first = futures_lite::future::block_on(embed_tracks(&db, &provider, &ids)).unwrap();
    let second = futures_lite::future::block_on(embed_tracks(&db, &provider, &ids)).unwrap();
    assert_eq!(first[0].status, TrackEmbeddingStatus::Stored);
    assert_eq!(second[0].status, TrackEmbeddingStatus::CurrentSkipped);
    assert_eq!(provider.calls.load(Ordering::SeqCst), 1);
    let stored = load_embedding(&db, ids[0], "test-local", MODEL_ID, "test-v1")
        .unwrap()
        .unwrap();
    assert_eq!(stored.vector, unit_vector(0));
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn semantic_ranking_is_sorted_descending() {
    let (root, db, ids) = test_database("ranking", 3);
    let provider = FakeProvider::new(unit_vector(0));
    for (track_id, vector) in [(ids[0], unit_vector(1)), (ids[1], unit_vector(0)), {
        let mut values = vec![0.0; EXPECTED_DIMENSION];
        values[0] = -1.0;
        (ids[2], EmbeddingVector::new(values).unwrap())
    }] {
        let fingerprint = crate::ai::SemanticInput::for_track(&db, track_id)
            .unwrap()
            .fingerprint;
        crate::ai::store_embedding(
            &db,
            &TrackEmbedding {
                track_id,
                provider_id: "test-local".into(),
                model_id: MODEL_ID.into(),
                model_version: "test-v1".into(),
                vector,
                input_fingerprint: fingerprint,
                created_at: "2026-09-14T00:00:00.000Z".into(),
            },
        )
        .unwrap();
    }
    let ranked =
        futures_lite::future::block_on(semantic_query(&db, &provider, "query", &ids)).unwrap();
    assert_eq!(
        ranked.iter().map(|item| item.track_id).collect::<Vec<_>>(),
        vec![ids[1], ids[0], ids[2]]
    );

    let mut tied = vec![
        SemanticMatch {
            track_id: 2,
            title: String::new(),
            artist: String::new(),
            score: 0.5,
        },
        SemanticMatch {
            track_id: 1,
            title: String::new(),
            artist: String::new(),
            score: 0.5,
        },
    ];
    sort_matches(&mut tied);
    assert_eq!(tied[0].track_id, 1);
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}
