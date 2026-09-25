use crate::{
    ai::{
        cosine_similarity, is_embedding_current, is_semantic_analysis_current, load_embedding,
        load_semantic_analysis, store_embedding, store_semantic_analysis, AnalysisVersion,
        EmbeddingVector, EmbeddingVersion, SemanticAnalysis, SemanticAnalysisContent,
        SemanticInput, TrackEmbedding,
    },
    database::Database,
};
use rusqlite::params;
use std::path::PathBuf;

fn database(name: &str) -> (PathBuf, Database, i64) {
    let root = std::env::temp_dir().join(format!(
        "undertone-ai-{name}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let db = Database::open(&root).unwrap();
    let conn = db.connect().unwrap();
    conn.execute("INSERT INTO artists(name) VALUES('Björk')", [])
        .unwrap();
    let artist_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO albums(title,artist_id) VALUES(' Homogenic ',?1)",
        [artist_id],
    )
    .unwrap();
    let album_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO tracks(path,title,artist_id,album_id,album_artist,year,duration,format,size,modified) VALUES('track.flac','  Jóga ',?1,?2,'Björk',1997,1.0,'flac',1,'not-semantic')",
        params![artist_id, album_id],
    )
    .unwrap();
    let track_id = conn.last_insert_rowid();
    drop(conn);
    (root, db, track_id)
}

fn embedding(track_id: i64, version: &str, fingerprint: &str) -> TrackEmbedding {
    TrackEmbedding {
        track_id,
        provider_id: "local".into(),
        model_id: "multilingual-test".into(),
        model_version: version.into(),
        vector: EmbeddingVector::new(vec![0.25, -0.5, 1.0]).unwrap(),
        input_fingerprint: fingerprint.into(),
        created_at: "2026-09-14T00:00:00.000Z".into(),
    }
}

#[test]
fn semantic_input_is_deterministic_and_normalizes_metadata() {
    let a = SemanticInput::build(
        "  Jóga\r\n ",
        "Björk\t",
        " Homogenic ",
        Some("Electronic   Rock"),
        Some(1997),
        None,
    );
    let b = SemanticInput::build(
        "Jóga",
        " Björk ",
        "Homogenic",
        Some("Electronic Rock"),
        Some(1997),
        None,
    );
    assert_eq!(a, b);
    assert_eq!(
        a.text,
        "title: Jóga\nartist: Björk\nalbum: Homogenic\ngenre: Electronic Rock\nyear: 1997\nlyrics: "
    );

    let changed = SemanticInput::build(
        "Jóga (Live)",
        "Björk",
        "Homogenic",
        Some("Electronic Rock"),
        Some(1997),
        None,
    );
    assert_ne!(a.fingerprint, changed.fingerprint);
}

#[test]
fn stored_lyrics_change_the_semantic_fingerprint_and_missing_lyrics_are_supported() {
    let (root, db, track_id) = database("lyrics-fingerprint");
    let missing = SemanticInput::for_track(&db, track_id).unwrap();
    assert!(missing.text.ends_with("lyrics: "));

    db.connect().unwrap().execute(
        "INSERT INTO lyrics(track_id,source,kind,plain_text,source_fingerprint,manual_override) VALUES(?1,'manual','plain','State of emergency','manual:1',1)",
        [track_id],
    ).unwrap();
    let first = SemanticInput::for_track(&db, track_id).unwrap();
    assert!(first.text.ends_with("lyrics: State of emergency"));
    db.connect()
        .unwrap()
        .execute(
            "UPDATE lyrics SET plain_text='Emotional landscapes' WHERE track_id=?1",
            [track_id],
        )
        .unwrap();
    let second = SemanticInput::for_track(&db, track_id).unwrap();
    assert_ne!(missing.fingerprint, first.fingerprint);
    assert_ne!(first.fingerprint, second.fingerprint);

    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn synced_lyrics_are_loaded_in_original_order_without_timestamps() {
    let (root, db, track_id) = database("synced-semantic-input");
    let conn = db.connect().unwrap();
    conn.execute(
        "INSERT INTO lyrics(track_id,source,kind,plain_text,source_fingerprint,manual_override) VALUES(?1,'embedded_synced','synced',NULL,'synced:1',0)",
        [track_id],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO lyric_lines(track_id,order_index,timestamp_ms,text) VALUES(?1,1,10000,'second'),(?1,0,90000,'first')",
        [track_id],
    )
    .unwrap();
    drop(conn);
    let input = SemanticInput::for_track(&db, track_id).unwrap();
    assert!(input.text.ends_with("lyrics: first second"));
    assert!(!input.text.contains("90000"));
    assert!(!input.text.contains("10000"));
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn embedding_binary_roundtrip_and_validation_are_strict() {
    let vector = EmbeddingVector::new(vec![-1.25, 0.0, 3.5]).unwrap();
    assert_eq!(
        EmbeddingVector::decode(3, &vector.encode()).unwrap(),
        vector
    );
    assert!(EmbeddingVector::decode(2, &vector.encode()).is_err());
    assert!(EmbeddingVector::decode(0, &[]).is_err());
    assert!(EmbeddingVector::new(vec![f32::NAN]).is_err());
    assert!(EmbeddingVector::new(vec![f32::INFINITY]).is_err());
    assert!(EmbeddingVector::new(vec![f32::NEG_INFINITY]).is_err());
}

#[test]
fn multiple_model_versions_are_stored_and_corrupt_blobs_are_rejected() {
    let (root, db, track_id) = database("embedding-storage");
    store_embedding(&db, &embedding(track_id, "1", "fp")).unwrap();
    store_embedding(&db, &embedding(track_id, "2", "fp")).unwrap();
    assert!(
        load_embedding(&db, track_id, "local", "multilingual-test", "1")
            .unwrap()
            .is_some()
    );
    assert!(
        load_embedding(&db, track_id, "local", "multilingual-test", "2")
            .unwrap()
            .is_some()
    );
    assert_eq!(
        db.connect()
            .unwrap()
            .query_row(
                "SELECT count(*) FROM track_embeddings WHERE track_id=?1",
                [track_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap(),
        2
    );

    let conn = db.connect().unwrap();
    conn.pragma_update(None, "ignore_check_constraints", "ON")
        .unwrap();
    conn.execute(
        "UPDATE track_embeddings SET vector=x'0001' WHERE track_id=?1 AND model_version='1'",
        [track_id],
    )
    .unwrap();
    drop(conn);
    assert!(load_embedding(&db, track_id, "local", "multilingual-test", "1").is_err());

    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn embedding_and_analysis_version_changes_become_stale() {
    let stored_embedding = embedding(7, "1", "content-a");
    let current = EmbeddingVersion {
        provider_id: "local",
        model_id: "multilingual-test",
        model_version: "1",
        input_fingerprint: "content-a",
    };
    assert!(is_embedding_current(&stored_embedding, &current));
    assert!(!is_embedding_current(
        &stored_embedding,
        &EmbeddingVersion {
            model_version: "2",
            ..current.clone()
        }
    ));
    assert!(!is_embedding_current(
        &stored_embedding,
        &EmbeddingVersion {
            input_fingerprint: "content-b",
            ..current.clone()
        }
    ));
    assert!(!is_embedding_current(
        &stored_embedding,
        &EmbeddingVersion {
            provider_id: "another-local-provider",
            ..current.clone()
        }
    ));
    assert!(!is_embedding_current(
        &stored_embedding,
        &EmbeddingVersion {
            model_id: "another-model",
            ..current
        }
    ));

    let stored_analysis = SemanticAnalysis {
        track_id: 7,
        provider_id: "local".into(),
        model_id: "analysis-test".into(),
        model_version: "1".into(),
        schema_version: 3,
        content: SemanticAnalysisContent::default(),
        input_fingerprint: "content-a".into(),
        analyzed_at: "2026-09-14T00:00:00.000Z".into(),
    };
    let current = AnalysisVersion {
        provider_id: "local",
        model_id: "analysis-test",
        model_version: "1",
        schema_version: 3,
        input_fingerprint: "content-a",
    };
    assert!(is_semantic_analysis_current(&stored_analysis, &current));
    assert!(!is_semantic_analysis_current(
        &stored_analysis,
        &AnalysisVersion {
            model_version: "2",
            ..current.clone()
        }
    ));
    assert!(!is_semantic_analysis_current(
        &stored_analysis,
        &AnalysisVersion {
            schema_version: 4,
            ..current.clone()
        }
    ));
    assert!(!is_semantic_analysis_current(
        &stored_analysis,
        &AnalysisVersion {
            provider_id: "another-local-provider",
            ..current.clone()
        }
    ));
    assert!(!is_semantic_analysis_current(
        &stored_analysis,
        &AnalysisVersion {
            model_id: "another-model",
            ..current
        }
    ));
}

#[test]
fn semantic_analysis_roundtrips_with_optional_fields_and_cascades_on_track_delete() {
    let (root, db, track_id) = database("analysis-storage");
    let analysis = SemanticAnalysis {
        track_id,
        provider_id: "local".into(),
        model_id: "analysis-test".into(),
        model_version: "1".into(),
        schema_version: 1,
        content: SemanticAnalysisContent {
            moods: vec!["intense".into(), "dreamlike".into()],
            themes: vec!["nature".into()],
            energy: Some(0.8),
            valence: None,
            summary: None,
        },
        input_fingerprint: "fp".into(),
        analyzed_at: "2026-09-14T00:00:00.000Z".into(),
    };
    store_embedding(&db, &embedding(track_id, "1", "fp")).unwrap();
    store_semantic_analysis(&db, &analysis).unwrap();
    assert_eq!(
        load_semantic_analysis(&db, track_id, "local", "analysis-test", "1", 1)
            .unwrap()
            .unwrap(),
        analysis
    );

    let conn = db.connect().unwrap();
    conn.execute("DELETE FROM track_identities WHERE track_id=?1", [track_id])
        .unwrap();
    conn.execute("DELETE FROM tracks WHERE id=?1", [track_id])
        .unwrap();
    for table in [
        "track_embeddings",
        "semantic_analyses",
        "semantic_analysis_moods",
        "semantic_analysis_themes",
    ] {
        let count: i64 = conn
            .query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0, "orphan rows in {table}");
    }
    drop(conn);
    drop(db);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn cosine_similarity_handles_identity_orthogonality_zero_and_mismatch() {
    let x = EmbeddingVector::new(vec![1.0, 0.0]).unwrap();
    let y = EmbeddingVector::new(vec![0.0, 1.0]).unwrap();
    let zero = EmbeddingVector::new(vec![0.0, 0.0]).unwrap();
    let other_dimension = EmbeddingVector::new(vec![1.0]).unwrap();
    assert!((cosine_similarity(&x, &x).unwrap() - 1.0).abs() < 1e-6);
    assert!(cosine_similarity(&x, &y).unwrap().abs() < 1e-6);
    assert_eq!(cosine_similarity(&x, &zero).unwrap(), 0.0);
    assert!(cosine_similarity(&x, &other_dimension).is_err());
}
