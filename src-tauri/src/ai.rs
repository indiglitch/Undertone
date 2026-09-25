//! Local-first semantic AI domain and persistence. This module contains no model runtime.
use crate::database::Database;
use rusqlite::{params, OptionalExtension};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

pub mod evaluation;
pub mod providers;
pub mod semantic;

#[derive(Clone, Debug, PartialEq)]
pub struct SemanticInput {
    pub text: String,
    pub fingerprint: String,
}

impl SemanticInput {
    pub fn build(
        title: &str,
        artist: &str,
        album: &str,
        genre: Option<&str>,
        year: Option<u32>,
        lyrics: Option<&str>,
    ) -> Self {
        let text = format!(
            "title: {}\nartist: {}\nalbum: {}\ngenre: {}\nyear: {}\nlyrics: {}",
            normalize(title),
            normalize(artist),
            normalize(album),
            genre.map(normalize).unwrap_or_default(),
            year.map(|value| value.to_string()).unwrap_or_default(),
            lyrics.map(normalize).unwrap_or_default(),
        );
        let fingerprint = format!("{:x}", Sha256::digest(text.as_bytes()));
        Self { text, fingerprint }
    }

    /// Loads only semantic metadata and lyrics, in deterministic order.
    pub fn for_track(db: &Database, track_id: i64) -> Result<Self, String> {
        let conn = db.connect()?;
        let (title, artist, album, genre, year) = conn
            .query_row(
                "SELECT t.title,a.name,b.title,COALESCE((SELECT group_concat(name, ', ') FROM (SELECT g.name AS name FROM track_genres tg JOIN genres g ON g.id=tg.genre_id WHERE tg.track_id=t.id ORDER BY g.name COLLATE NOCASE,g.name)),''),t.year FROM tracks t JOIN artists a ON a.id=t.artist_id JOIN albums b ON b.id=t.album_id WHERE t.id=?1",
                [track_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, Option<u32>>(4)?,
                    ))
                },
            )
            .map_err(|e| e.to_string())?;
        let lyrics_kind: Option<(String, Option<String>)> = conn
            .query_row(
                "SELECT kind,plain_text FROM lyrics WHERE track_id=?1",
                [track_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let lyrics = match lyrics_kind {
            Some((kind, plain)) if kind == "plain" => plain,
            Some((kind, _)) if kind == "synced" => {
                let mut statement = conn
                    .prepare("SELECT text FROM lyric_lines WHERE track_id=?1 ORDER BY order_index")
                    .map_err(|e| e.to_string())?;
                let lines = statement
                    .query_map([track_id], |row| row.get::<_, String>(0))
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;
                Some(lines.join("\n"))
            }
            Some(_) => return Err("unknown lyrics kind in database".into()),
            None => None,
        };
        Ok(Self::build(
            &title,
            &artist,
            &album,
            (!genre.is_empty()).then_some(genre.as_str()),
            year,
            lyrics.as_deref(),
        ))
    }
}

fn normalize(value: &str) -> String {
    value
        .trim_start_matches('\u{feff}')
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[derive(Clone, Debug, PartialEq)]
pub struct EmbeddingVector(Vec<f32>);

impl EmbeddingVector {
    pub fn new(values: Vec<f32>) -> Result<Self, String> {
        if values.is_empty() {
            return Err("embedding dimension must be greater than zero".into());
        }
        if values.iter().any(|value| !value.is_finite()) {
            return Err("embedding values must be finite".into());
        }
        Ok(Self(values))
    }

    pub fn dimension(&self) -> usize {
        self.0.len()
    }

    pub fn values(&self) -> &[f32] {
        &self.0
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(self.0.len() * 4);
        for value in &self.0 {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        bytes
    }

    pub fn decode(dimension: usize, bytes: &[u8]) -> Result<Self, String> {
        if dimension == 0 {
            return Err("embedding dimension must be greater than zero".into());
        }
        let expected = dimension
            .checked_mul(4)
            .ok_or_else(|| "embedding dimension is too large".to_string())?;
        if bytes.len() != expected {
            return Err("embedding blob length does not match its dimension".into());
        }
        let values = bytes
            .chunks_exact(4)
            .map(|chunk| f32::from_le_bytes(chunk.try_into().expect("four-byte chunk")))
            .collect();
        Self::new(values)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct TrackEmbedding {
    pub track_id: i64,
    pub provider_id: String,
    pub model_id: String,
    pub model_version: String,
    pub vector: EmbeddingVector,
    pub input_fingerprint: String,
    pub created_at: String,
}

impl TrackEmbedding {
    pub fn dimension(&self) -> usize {
        self.vector.dimension()
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct SemanticAnalysisContent {
    pub moods: Vec<String>,
    pub themes: Vec<String>,
    pub energy: Option<f32>,
    pub valence: Option<f32>,
    pub summary: Option<String>,
}

impl SemanticAnalysisContent {
    fn validate(&self) -> Result<(), String> {
        if self
            .energy
            .into_iter()
            .chain(self.valence)
            .any(|value| !value.is_finite())
        {
            return Err("semantic analysis scores must be finite".into());
        }
        if self
            .moods
            .iter()
            .chain(&self.themes)
            .any(|value| value.trim().is_empty())
        {
            return Err("semantic analysis labels must not be empty".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct SemanticAnalysis {
    pub track_id: i64,
    pub provider_id: String,
    pub model_id: String,
    pub model_version: String,
    pub schema_version: u32,
    pub content: SemanticAnalysisContent,
    pub input_fingerprint: String,
    pub analyzed_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EmbeddingVersion<'a> {
    pub provider_id: &'a str,
    pub model_id: &'a str,
    pub model_version: &'a str,
    pub input_fingerprint: &'a str,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AnalysisVersion<'a> {
    pub provider_id: &'a str,
    pub model_id: &'a str,
    pub model_version: &'a str,
    pub schema_version: u32,
    pub input_fingerprint: &'a str,
}

pub fn is_embedding_current(stored: &TrackEmbedding, expected: &EmbeddingVersion<'_>) -> bool {
    stored.provider_id == expected.provider_id
        && stored.model_id == expected.model_id
        && stored.model_version == expected.model_version
        && stored.input_fingerprint == expected.input_fingerprint
}

pub fn is_semantic_analysis_current(
    stored: &SemanticAnalysis,
    expected: &AnalysisVersion<'_>,
) -> bool {
    stored.provider_id == expected.provider_id
        && stored.model_id == expected.model_id
        && stored.model_version == expected.model_version
        && stored.schema_version == expected.schema_version
        && stored.input_fingerprint == expected.input_fingerprint
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LocalModelConfig {
    pub model_id: String,
    pub model_version: String,
    /// Resolved by the application layer, normally below `%LOCALAPPDATA%\\Undertone\\models`.
    pub path: PathBuf,
    /// Optional persisted artifact-identity cache outside the model directory.
    pub identity_cache_path: Option<PathBuf>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LocalModelStatus {
    Missing,
    Available,
    Invalid(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LocalModelState {
    pub config: LocalModelConfig,
    pub status: LocalModelStatus,
}

pub fn cosine_similarity(left: &EmbeddingVector, right: &EmbeddingVector) -> Result<f32, String> {
    if left.dimension() != right.dimension() {
        return Err("embedding dimensions do not match".into());
    }
    let mut dot = 0.0f64;
    let mut left_norm = 0.0f64;
    let mut right_norm = 0.0f64;
    for (&left, &right) in left.values().iter().zip(right.values()) {
        let left = f64::from(left);
        let right = f64::from(right);
        dot += left * right;
        left_norm += left * left;
        right_norm += right * right;
    }
    if left_norm == 0.0 || right_norm == 0.0 {
        return Ok(0.0);
    }
    Ok((dot / (left_norm.sqrt() * right_norm.sqrt())) as f32)
}

fn validate_identity(provider_id: &str, model_id: &str, model_version: &str) -> Result<(), String> {
    if [provider_id, model_id, model_version]
        .iter()
        .any(|value| value.trim().is_empty())
    {
        return Err("provider and model identifiers must not be empty".into());
    }
    Ok(())
}

pub fn store_embedding(db: &Database, embedding: &TrackEmbedding) -> Result<(), String> {
    validate_identity(
        &embedding.provider_id,
        &embedding.model_id,
        &embedding.model_version,
    )?;
    if embedding.input_fingerprint.is_empty() {
        return Err("input fingerprint must not be empty".into());
    }
    let dimension = i64::try_from(embedding.dimension()).map_err(|e| e.to_string())?;
    db.connect()?
        .execute(
            "INSERT INTO track_embeddings(track_id,provider_id,model_id,model_version,dimension,vector,input_fingerprint,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(track_id,provider_id,model_id,model_version) DO UPDATE SET dimension=excluded.dimension,vector=excluded.vector,input_fingerprint=excluded.input_fingerprint,created_at=excluded.created_at",
            params![embedding.track_id, embedding.provider_id, embedding.model_id, embedding.model_version, dimension, embedding.vector.encode(), embedding.input_fingerprint, embedding.created_at],
        )
        .map(|_| ())
        .map_err(|e| e.to_string())
}

pub fn load_embedding(
    db: &Database,
    track_id: i64,
    provider_id: &str,
    model_id: &str,
    model_version: &str,
) -> Result<Option<TrackEmbedding>, String> {
    let row = db
        .connect()?
        .query_row(
            "SELECT dimension,vector,input_fingerprint,created_at FROM track_embeddings WHERE track_id=?1 AND provider_id=?2 AND model_id=?3 AND model_version=?4",
            params![track_id, provider_id, model_id, model_version],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Vec<u8>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((dimension, bytes, input_fingerprint, created_at)) = row else {
        return Ok(None);
    };
    let dimension = usize::try_from(dimension).map_err(|_| "invalid embedding dimension")?;
    Ok(Some(TrackEmbedding {
        track_id,
        provider_id: provider_id.to_owned(),
        model_id: model_id.to_owned(),
        model_version: model_version.to_owned(),
        vector: EmbeddingVector::decode(dimension, &bytes)?,
        input_fingerprint,
        created_at,
    }))
}

pub fn store_semantic_analysis(db: &Database, analysis: &SemanticAnalysis) -> Result<(), String> {
    validate_identity(
        &analysis.provider_id,
        &analysis.model_id,
        &analysis.model_version,
    )?;
    if analysis.schema_version == 0 || analysis.input_fingerprint.is_empty() {
        return Err("schema version and input fingerprint must be present".into());
    }
    analysis.content.validate()?;
    let mut conn = db.connect()?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO semantic_analyses(track_id,provider_id,model_id,model_version,schema_version,energy,valence,summary,input_fingerprint,analyzed_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(track_id,provider_id,model_id,model_version,schema_version) DO UPDATE SET energy=excluded.energy,valence=excluded.valence,summary=excluded.summary,input_fingerprint=excluded.input_fingerprint,analyzed_at=excluded.analyzed_at",
        params![analysis.track_id, analysis.provider_id, analysis.model_id, analysis.model_version, analysis.schema_version, analysis.content.energy, analysis.content.valence, analysis.content.summary, analysis.input_fingerprint, analysis.analyzed_at],
    ).map_err(|e| e.to_string())?;
    let analysis_id: i64 = tx
        .query_row(
            "SELECT id FROM semantic_analyses WHERE track_id=?1 AND provider_id=?2 AND model_id=?3 AND model_version=?4 AND schema_version=?5",
            params![analysis.track_id, analysis.provider_id, analysis.model_id, analysis.model_version, analysis.schema_version],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM semantic_analysis_moods WHERE analysis_id=?1",
        [analysis_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM semantic_analysis_themes WHERE analysis_id=?1",
        [analysis_id],
    )
    .map_err(|e| e.to_string())?;
    for (index, mood) in analysis.content.moods.iter().enumerate() {
        tx.execute(
            "INSERT INTO semantic_analysis_moods(analysis_id,order_index,mood) VALUES(?1,?2,?3)",
            params![
                analysis_id,
                i64::try_from(index).map_err(|e| e.to_string())?,
                mood
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    for (index, theme) in analysis.content.themes.iter().enumerate() {
        tx.execute(
            "INSERT INTO semantic_analysis_themes(analysis_id,order_index,theme) VALUES(?1,?2,?3)",
            params![
                analysis_id,
                i64::try_from(index).map_err(|e| e.to_string())?,
                theme
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

pub fn load_semantic_analysis(
    db: &Database,
    track_id: i64,
    provider_id: &str,
    model_id: &str,
    model_version: &str,
    schema_version: u32,
) -> Result<Option<SemanticAnalysis>, String> {
    let conn = db.connect()?;
    let row = conn
        .query_row(
            "SELECT id,energy,valence,summary,input_fingerprint,analyzed_at FROM semantic_analyses WHERE track_id=?1 AND provider_id=?2 AND model_id=?3 AND model_version=?4 AND schema_version=?5",
            params![track_id, provider_id, model_id, model_version, schema_version],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<f32>>(1)?, row.get::<_, Option<f32>>(2)?, row.get::<_, Option<String>>(3)?, row.get::<_, String>(4)?, row.get::<_, String>(5)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((id, energy, valence, summary, input_fingerprint, analyzed_at)) = row else {
        return Ok(None);
    };
    let load_labels = |table: &str, column: &str| -> Result<Vec<String>, String> {
        let sql = format!("SELECT {column} FROM {table} WHERE analysis_id=?1 ORDER BY order_index");
        let mut statement = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let labels = statement
            .query_map([id], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(labels)
    };
    Ok(Some(SemanticAnalysis {
        track_id,
        provider_id: provider_id.to_owned(),
        model_id: model_id.to_owned(),
        model_version: model_version.to_owned(),
        schema_version,
        content: SemanticAnalysisContent {
            moods: load_labels("semantic_analysis_moods", "mood")?,
            themes: load_labels("semantic_analysis_themes", "theme")?,
            energy,
            valence,
            summary,
        },
        input_fingerprint,
        analyzed_at,
    }))
}
