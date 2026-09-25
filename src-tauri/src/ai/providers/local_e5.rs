//! CPU-only multilingual E5 provider implementation. ONNX details stay in this module.
use crate::{
    ai::{EmbeddingVector, LocalModelConfig, LocalModelState, LocalModelStatus},
    providers::{EmbeddingProvider, ExecutionLocation, ProviderFuture},
};
use ort::{
    session::{builder::GraphOptimizationLevel, Session},
    value::{Tensor, TensorElementType, ValueType},
};
use sha2::{Digest, Sha256};
use std::{
    fmt,
    fs::File,
    io::{BufReader, Read},
    path::{Path, PathBuf},
    sync::{Arc, LockResult, Mutex, MutexGuard},
    time::{Duration, Instant, UNIX_EPOCH},
};
use tokenizers::{Tokenizer, TruncationDirection};

pub const PROVIDER_ID: &str = "local-onnx";
pub const MODEL_ID: &str = "multilingual-e5-small";
pub const EXPECTED_DIMENSION: usize = 384;
pub const MODEL_MAX_TOKENS: usize = 512;
const MODEL_FILE: &str = "model.onnx";
const TOKENIZER_FILE: &str = "tokenizer.json";
const CONFIG_FILE: &str = "config.json";
const OUTPUT_NAME: &str = "last_hidden_state";

#[derive(Debug)]
pub enum LocalE5Error {
    ModelUnavailable { path: PathBuf, reason: String },
    InvalidConfig(String),
    Tokenizer(String),
    Runtime(String),
    ModelContract(String),
    Inference(String),
    InvalidOutput(String),
    IdentityCache(String),
}

impl fmt::Display for LocalE5Error {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ModelUnavailable { path, reason } => {
                write!(
                    formatter,
                    "model unavailable at {}: {reason}",
                    path.display()
                )
            }
            Self::InvalidConfig(message) => write!(formatter, "invalid model config: {message}"),
            Self::Tokenizer(message) => {
                write!(formatter, "tokenizer initialization failed: {message}")
            }
            Self::Runtime(message) => {
                write!(formatter, "ONNX Runtime initialization failed: {message}")
            }
            Self::ModelContract(message) => {
                write!(formatter, "unexpected ONNX model contract: {message}")
            }
            Self::Inference(message) => write!(formatter, "ONNX inference failed: {message}"),
            Self::InvalidOutput(message) => {
                write!(formatter, "invalid embedding output: {message}")
            }
            Self::IdentityCache(message) => {
                write!(formatter, "model identity cache failed: {message}")
            }
        }
    }
}

impl std::error::Error for LocalE5Error {}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TensorDescriptor {
    pub name: String,
    pub value_type: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LocalE5Metadata {
    pub provider_id: String,
    pub model_id: String,
    pub model_version: String,
    pub dimension: usize,
    pub max_tokens: usize,
    pub inputs: Vec<TensorDescriptor>,
    pub outputs: Vec<TensorDescriptor>,
}

#[derive(Clone, Debug)]
pub struct EmbeddingRun {
    pub embedding: EmbeddingVector,
    pub chunks: usize,
    pub elapsed: Duration,
    pub tokenization: Duration,
    pub chunk_construction: Duration,
    pub inference: Duration,
    pub pooling_aggregation: Duration,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocumentDiagnostics {
    pub tokens: usize,
    pub chunks: usize,
}

struct ChunkRun {
    embedding: EmbeddingVector,
    tokenization: Duration,
    inference: Duration,
    pooling: Duration,
}

pub(crate) struct SharedSession<T>(Arc<Mutex<T>>);

impl<T> Clone for SharedSession<T> {
    fn clone(&self) -> Self {
        Self(Arc::clone(&self.0))
    }
}

impl<T> SharedSession<T> {
    pub(crate) fn new(value: T) -> Self {
        Self(Arc::new(Mutex::new(value)))
    }

    fn lock(&self) -> LockResult<MutexGuard<'_, T>> {
        self.0.lock()
    }

    pub(crate) fn instance_id(&self) -> usize {
        Arc::as_ptr(&self.0) as usize
    }
}

#[derive(Clone)]
pub struct LocalE5Provider {
    config: LocalModelConfig,
    tokenizer: Arc<Tokenizer>,
    session: SharedSession<Session>,
    metadata: LocalE5Metadata,
}

impl LocalE5Provider {
    pub fn initialize(config: LocalModelConfig) -> Result<Self, LocalE5Error> {
        validate_artifacts(&config.path)?;
        let parsed_config = read_config(&config.path.join(CONFIG_FILE))?;
        if parsed_config.hidden_size != EXPECTED_DIMENSION {
            return Err(LocalE5Error::InvalidConfig(format!(
                "hidden_size is {}, expected {EXPECTED_DIMENSION}",
                parsed_config.hidden_size
            )));
        }
        if parsed_config.max_position_embeddings != MODEL_MAX_TOKENS {
            return Err(LocalE5Error::InvalidConfig(format!(
                "max_position_embeddings is {}, expected {MODEL_MAX_TOKENS}",
                parsed_config.max_position_embeddings
            )));
        }
        let tokenizer = Tokenizer::from_file(config.path.join(TOKENIZER_FILE))
            .map_err(|error| LocalE5Error::Tokenizer(error.to_string()))?;
        let builder =
            Session::builder().map_err(|error| LocalE5Error::Runtime(error.to_string()))?;
        let mut builder = builder
            .with_optimization_level(GraphOptimizationLevel::Level3)
            .map_err(|error| LocalE5Error::Runtime(error.to_string()))?;
        let session = builder
            .commit_from_file(config.path.join(MODEL_FILE))
            .map_err(|error| LocalE5Error::Runtime(error.to_string()))?;
        validate_session_contract(&session)?;
        let model_version = match &config.identity_cache_path {
            Some(cache_path) => artifact_version_cached(&config.path, cache_path)?,
            None => artifact_version(&config.path)?,
        };
        if !config.model_id.is_empty() && config.model_id != MODEL_ID {
            return Err(LocalE5Error::InvalidConfig(format!(
                "model id is {}, expected {MODEL_ID}",
                config.model_id
            )));
        }
        if !config.model_version.is_empty() && config.model_version != model_version {
            return Err(LocalE5Error::InvalidConfig(format!(
                "configured version {} does not match {model_version}",
                config.model_version
            )));
        }
        let metadata = LocalE5Metadata {
            provider_id: PROVIDER_ID.into(),
            model_id: MODEL_ID.into(),
            model_version,
            dimension: EXPECTED_DIMENSION,
            max_tokens: MODEL_MAX_TOKENS,
            inputs: session
                .inputs()
                .iter()
                .map(|input| TensorDescriptor {
                    name: input.name().to_owned(),
                    value_type: format!("{:?}", input.dtype()),
                })
                .collect(),
            outputs: session
                .outputs()
                .iter()
                .map(|output| TensorDescriptor {
                    name: output.name().to_owned(),
                    value_type: format!("{:?}", output.dtype()),
                })
                .collect(),
        };
        Ok(Self {
            config,
            tokenizer: Arc::new(tokenizer),
            session: SharedSession::new(session),
            metadata,
        })
    }

    pub fn metadata(&self) -> &LocalE5Metadata {
        &self.metadata
    }

    pub fn session_instance_id(&self) -> usize {
        self.session.instance_id()
    }

    pub fn model_state(&self) -> LocalModelState {
        LocalModelState {
            config: LocalModelConfig {
                model_id: MODEL_ID.into(),
                model_version: self.metadata.model_version.clone(),
                path: self.config.path.clone(),
                identity_cache_path: self.config.identity_cache_path.clone(),
            },
            status: LocalModelStatus::Available,
        }
    }

    pub fn document_diagnostics(
        &self,
        semantic_input: &str,
    ) -> Result<DocumentDiagnostics, LocalE5Error> {
        let tokens = self
            .tokenize(&document_text(semantic_input), true)?
            .token_count;
        let chunks = document_chunks(semantic_input, MODEL_MAX_TOKENS, |text, special| {
            self.tokenize(text, special)
        })?;
        Ok(DocumentDiagnostics {
            tokens,
            chunks: chunks.len(),
        })
    }

    pub fn embed_document_blocking(
        &self,
        semantic_input: &str,
    ) -> Result<EmbeddingRun, LocalE5Error> {
        let started = Instant::now();
        let chunk_started = Instant::now();
        let mut chunk_tokenization = Duration::ZERO;
        let chunks = document_chunks(semantic_input, MODEL_MAX_TOKENS, |text, special| {
            let token_started = Instant::now();
            let result = self.tokenize(text, special);
            chunk_tokenization += token_started.elapsed();
            result
        })?;
        let chunk_total = chunk_started.elapsed();
        let mut embeddings = Vec::with_capacity(chunks.len());
        let mut tokenization = chunk_tokenization;
        let mut inference = Duration::ZERO;
        let mut pooling = Duration::ZERO;
        for chunk in &chunks {
            let run = self.infer_prefixed(chunk, false)?;
            tokenization += run.tokenization;
            inference += run.inference;
            pooling += run.pooling;
            embeddings.push(run.embedding);
        }
        let aggregation_started = Instant::now();
        let embedding = aggregate_embeddings(&embeddings)?;
        pooling += aggregation_started.elapsed();
        Ok(EmbeddingRun {
            embedding,
            chunks: chunks.len(),
            elapsed: started.elapsed(),
            tokenization,
            chunk_construction: chunk_total.saturating_sub(chunk_tokenization),
            inference,
            pooling_aggregation: pooling,
        })
    }

    /// Development-quality evaluation path. Chunk vectors stay in memory and are not persisted.
    pub fn embed_document_chunks_blocking(
        &self,
        semantic_input: &str,
    ) -> Result<Vec<EmbeddingVector>, LocalE5Error> {
        let chunks = document_chunks(semantic_input, MODEL_MAX_TOKENS, |text, special| {
            self.tokenize(text, special)
        })?;
        chunks
            .iter()
            .map(|chunk| self.infer_prefixed(chunk, false).map(|run| run.embedding))
            .collect()
    }

    pub fn embed_query_blocking(&self, query: &str) -> Result<EmbeddingRun, LocalE5Error> {
        let started = Instant::now();
        let run = self.infer_prefixed(&query_text(query), true)?;
        Ok(EmbeddingRun {
            embedding: run.embedding,
            chunks: 1,
            elapsed: started.elapsed(),
            tokenization: run.tokenization,
            chunk_construction: Duration::ZERO,
            inference: run.inference,
            pooling_aggregation: run.pooling,
        })
    }

    fn tokenize(&self, text: &str, special_tokens: bool) -> Result<Tokenization, LocalE5Error> {
        self.tokenizer
            .encode(text, special_tokens)
            .map(|encoding| Tokenization {
                token_count: encoding.len(),
                offsets: encoding.get_offsets().to_vec(),
            })
            .map_err(|error| LocalE5Error::Tokenizer(error.to_string()))
    }

    fn infer_prefixed(&self, text: &str, truncate: bool) -> Result<ChunkRun, LocalE5Error> {
        let tokenization_started = Instant::now();
        let mut encoding = self
            .tokenizer
            .encode(text, true)
            .map_err(|error| LocalE5Error::Tokenizer(error.to_string()))?;
        if encoding.len() > MODEL_MAX_TOKENS {
            if !truncate {
                return Err(LocalE5Error::Inference(format!(
                    "document chunk has {} tokens, max is {MODEL_MAX_TOKENS}",
                    encoding.len()
                )));
            }
            encoding.truncate(MODEL_MAX_TOKENS, 0, TruncationDirection::Right);
        }
        let tokenization = tokenization_started.elapsed();
        let sequence_length = encoding.len();
        if sequence_length == 0 {
            return Err(LocalE5Error::Inference(
                "tokenizer produced no tokens".into(),
            ));
        }
        let input_ids = encoding
            .get_ids()
            .iter()
            .map(|&value| i64::from(value))
            .collect::<Vec<_>>();
        let attention_mask = encoding
            .get_attention_mask()
            .iter()
            .map(|&value| i64::from(value))
            .collect::<Vec<_>>();
        let token_type_ids = encoding
            .get_type_ids()
            .iter()
            .map(|&value| i64::from(value))
            .collect::<Vec<_>>();
        let input_ids = Tensor::from_array(([1, sequence_length], input_ids))
            .map_err(|error| LocalE5Error::Inference(error.to_string()))?;
        let attention = Tensor::from_array(([1, sequence_length], attention_mask.clone()))
            .map_err(|error| LocalE5Error::Inference(error.to_string()))?;
        let token_types = Tensor::from_array(([1, sequence_length], token_type_ids))
            .map_err(|error| LocalE5Error::Inference(error.to_string()))?;
        let mut session = self
            .session
            .lock()
            .map_err(|_| LocalE5Error::Runtime("session lock was poisoned".into()))?;
        let inference_started = Instant::now();
        let outputs = session
            .run(ort::inputs![
                "input_ids" => input_ids,
                "attention_mask" => attention,
                "token_type_ids" => token_types,
            ])
            .map_err(|error| LocalE5Error::Inference(error.to_string()))?;
        let inference = inference_started.elapsed();
        let output = outputs
            .get(OUTPUT_NAME)
            .ok_or_else(|| LocalE5Error::ModelContract(format!("missing output {OUTPUT_NAME}")))?;
        let (shape, hidden) = output
            .try_extract_tensor::<f32>()
            .map_err(|error| LocalE5Error::InvalidOutput(error.to_string()))?;
        let expected_shape = [1_i64, sequence_length as i64, EXPECTED_DIMENSION as i64];
        if shape.as_ref() != expected_shape {
            return Err(LocalE5Error::InvalidOutput(format!(
                "output shape is {shape:?}, expected {expected_shape:?}"
            )));
        }
        let mask = attention_mask
            .iter()
            .map(|&value| value as u32)
            .collect::<Vec<_>>();
        let pooling_started = Instant::now();
        let embedding = mean_pool_and_normalize(hidden, &mask, EXPECTED_DIMENSION)?;
        Ok(ChunkRun {
            embedding,
            tokenization,
            inference,
            pooling: pooling_started.elapsed(),
        })
    }
}

impl EmbeddingProvider for LocalE5Provider {
    fn location(&self) -> ExecutionLocation {
        ExecutionLocation::Local
    }
    fn provider_id(&self) -> &str {
        PROVIDER_ID
    }
    fn model_id(&self) -> &str {
        MODEL_ID
    }
    fn model_version(&self) -> &str {
        &self.metadata.model_version
    }
    fn dimension(&self) -> usize {
        EXPECTED_DIMENSION
    }
    fn embed<'a>(&'a self, semantic_input: &'a str) -> ProviderFuture<'a, EmbeddingVector> {
        let provider = self.clone();
        let semantic_input = semantic_input.to_owned();
        Box::pin(async move {
            tauri::async_runtime::spawn_blocking(move || {
                provider.embed_document_blocking(&semantic_input)
            })
            .await
            .map_err(|error| error.to_string())?
            .map(|run| run.embedding)
            .map_err(|error| error.to_string())
        })
    }
    fn embed_query<'a>(&'a self, query: &'a str) -> ProviderFuture<'a, EmbeddingVector> {
        let provider = self.clone();
        let query = query.to_owned();
        Box::pin(async move {
            tauri::async_runtime::spawn_blocking(move || provider.embed_query_blocking(&query))
                .await
                .map_err(|error| error.to_string())?
                .map(|run| run.embedding)
                .map_err(|error| error.to_string())
        })
    }
}

#[derive(serde::Deserialize)]
struct ParsedConfig {
    #[serde(rename = "_name_or_path")]
    name_or_path: String,
    hidden_size: usize,
    max_position_embeddings: usize,
}

fn read_config(path: &Path) -> Result<ParsedConfig, LocalE5Error> {
    let bytes = std::fs::read(path).map_err(|error| LocalE5Error::ModelUnavailable {
        path: path.to_owned(),
        reason: error.to_string(),
    })?;
    let config: ParsedConfig = serde_json::from_slice(&bytes)
        .map_err(|error| LocalE5Error::InvalidConfig(error.to_string()))?;
    if config.name_or_path != "intfloat/multilingual-e5-small" {
        return Err(LocalE5Error::InvalidConfig(format!(
            "_name_or_path is {}",
            config.name_or_path
        )));
    }
    Ok(config)
}

fn validate_artifacts(directory: &Path) -> Result<(), LocalE5Error> {
    if !directory.is_dir() {
        return Err(LocalE5Error::ModelUnavailable {
            path: directory.to_owned(),
            reason: "directory does not exist".into(),
        });
    }
    for name in [MODEL_FILE, TOKENIZER_FILE, CONFIG_FILE] {
        let path = directory.join(name);
        if !path.is_file() {
            return Err(LocalE5Error::ModelUnavailable {
                path,
                reason: "required artifact does not exist".into(),
            });
        }
    }
    Ok(())
}

pub fn probe(config: &LocalModelConfig) -> LocalModelState {
    let status = match validate_artifacts(&config.path)
        .and_then(|_| read_config(&config.path.join(CONFIG_FILE)).map(|_| ()))
    {
        Ok(()) => LocalModelStatus::Available,
        Err(LocalE5Error::ModelUnavailable { .. }) => LocalModelStatus::Missing,
        Err(error) => LocalModelStatus::Invalid(error.to_string()),
    };
    LocalModelState {
        config: config.clone(),
        status,
    }
}

fn validate_session_contract(session: &Session) -> Result<(), LocalE5Error> {
    for name in ["input_ids", "attention_mask", "token_type_ids"] {
        let input = session
            .inputs()
            .iter()
            .find(|input| input.name() == name)
            .ok_or_else(|| LocalE5Error::ModelContract(format!("missing input {name}")))?;
        match input.dtype() {
            ValueType::Tensor {
                ty: TensorElementType::Int64,
                shape,
                ..
            } if shape.len() == 2 => {}
            value_type => {
                return Err(LocalE5Error::ModelContract(format!(
                    "input {name} is {value_type:?}, expected rank-2 int64"
                )))
            }
        }
    }
    if session.inputs().len() != 3 {
        return Err(LocalE5Error::ModelContract(format!(
            "model has {} inputs, expected 3",
            session.inputs().len()
        )));
    }
    let output = session
        .outputs()
        .iter()
        .find(|output| output.name() == OUTPUT_NAME)
        .ok_or_else(|| LocalE5Error::ModelContract(format!("missing output {OUTPUT_NAME}")))?;
    match output.dtype() {
        ValueType::Tensor {
            ty: TensorElementType::Float32,
            shape,
            ..
        } if shape.len() == 3 && shape[2] == EXPECTED_DIMENSION as i64 => {}
        value_type => {
            return Err(LocalE5Error::ModelContract(format!(
                "output {OUTPUT_NAME} is {value_type:?}, expected [batch, sequence, {EXPECTED_DIMENSION}] float32"
            )))
        }
    }
    Ok(())
}

pub fn document_text(semantic_input: &str) -> String {
    format!("passage: {semantic_input}")
}

pub fn query_text(query: &str) -> String {
    format!(
        "query: {}",
        query.split_whitespace().collect::<Vec<_>>().join(" ")
    )
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Tokenization {
    pub token_count: usize,
    /// Byte offsets for non-special tokens. Offsets must be monotonic.
    pub offsets: Vec<(usize, usize)>,
}

pub fn document_chunks<F>(
    semantic_input: &str,
    max_tokens: usize,
    mut tokenize: F,
) -> Result<Vec<String>, LocalE5Error>
where
    F: FnMut(&str, bool) -> Result<Tokenization, LocalE5Error>,
{
    if max_tokens == 0 {
        return Err(LocalE5Error::InvalidConfig(
            "max token count is zero".into(),
        ));
    }
    let complete = document_text(semantic_input);
    if tokenize(&complete, true)?.token_count <= max_tokens {
        return Ok(vec![complete]);
    }
    let (metadata, lyrics) = semantic_input.split_once("\nlyrics: ").ok_or_else(|| {
        LocalE5Error::Inference("semantic input has no deterministic lyrics field".into())
    })?;
    let fixed = format!("passage: {metadata}\nlyrics: ");
    let fixed_tokens = tokenize(&fixed, true)?.token_count;
    if fixed_tokens >= max_tokens {
        return Err(LocalE5Error::Inference(
            "semantic metadata leaves no token budget for lyrics".into(),
        ));
    }
    let lyrics_tokens = tokenize(lyrics, false)?;
    if lyrics_tokens.token_count == 0 {
        return Ok(vec![fixed]);
    }
    if lyrics_tokens.offsets.len() != lyrics_tokens.token_count
        || lyrics_tokens
            .offsets
            .iter()
            .any(|&(start, end)| start > end || end > lyrics.len() || !lyrics.is_char_boundary(end))
    {
        return Err(LocalE5Error::Tokenizer(
            "token offsets are incomplete or invalid".into(),
        ));
    }

    let token_budget = max_tokens - fixed_tokens;
    let mut chunks = Vec::new();
    let mut token_start = 0;
    let mut byte_start = 0;
    while token_start < lyrics_tokens.token_count {
        let mut token_end = (token_start + token_budget).min(lyrics_tokens.token_count);
        let mut accepted = None;
        while token_end > token_start {
            let byte_end = if token_end == lyrics_tokens.token_count {
                lyrics.len()
            } else {
                lyrics_tokens.offsets[token_end - 1].1
            };
            if byte_end <= byte_start || !lyrics.is_char_boundary(byte_end) {
                token_end -= 1;
                continue;
            }
            let chunk = format!("{fixed}{}", &lyrics[byte_start..byte_end]);
            if tokenize(&chunk, true)?.token_count <= max_tokens {
                accepted = Some((chunk, byte_end));
                break;
            }
            token_end -= 1;
        }
        let Some((chunk, byte_end)) = accepted else {
            return Err(LocalE5Error::Inference(
                "token offsets could not produce a bounded chunk".into(),
            ));
        };
        chunks.push(chunk);
        token_start = token_end;
        byte_start = byte_end;
    }
    Ok(chunks)
}

pub fn mean_pool_and_normalize(
    hidden: &[f32],
    attention_mask: &[u32],
    dimension: usize,
) -> Result<EmbeddingVector, LocalE5Error> {
    if dimension == 0 || hidden.len() != attention_mask.len().saturating_mul(dimension) {
        return Err(LocalE5Error::InvalidOutput(
            "hidden state shape does not match attention mask and dimension".into(),
        ));
    }
    let active = attention_mask.iter().filter(|&&value| value != 0).count();
    if active == 0 {
        return Err(LocalE5Error::InvalidOutput(
            "attention mask contains no active tokens".into(),
        ));
    }
    let mut pooled = vec![0.0f32; dimension];
    for (token, &mask) in hidden.chunks_exact(dimension).zip(attention_mask) {
        if mask != 0 {
            for (sum, &value) in pooled.iter_mut().zip(token) {
                *sum += value;
            }
        }
    }
    for value in &mut pooled {
        *value /= active as f32;
    }
    normalize_embedding(pooled)
}

fn aggregate_embeddings(embeddings: &[EmbeddingVector]) -> Result<EmbeddingVector, LocalE5Error> {
    if embeddings.is_empty() {
        return Err(LocalE5Error::InvalidOutput("no chunk embeddings".into()));
    }
    if embeddings
        .iter()
        .any(|embedding| embedding.dimension() != EXPECTED_DIMENSION)
    {
        return Err(LocalE5Error::InvalidOutput(
            "chunk embedding dimension mismatch".into(),
        ));
    }
    let mut mean = vec![0.0f32; EXPECTED_DIMENSION];
    for embedding in embeddings {
        for (sum, &value) in mean.iter_mut().zip(embedding.values()) {
            *sum += value;
        }
    }
    for value in &mut mean {
        *value /= embeddings.len() as f32;
    }
    normalize_embedding(mean)
}

pub fn normalize_embedding(mut values: Vec<f32>) -> Result<EmbeddingVector, LocalE5Error> {
    if values.is_empty() || values.iter().any(|value| !value.is_finite()) {
        return Err(LocalE5Error::InvalidOutput(
            "embedding is empty or contains non-finite values".into(),
        ));
    }
    let norm = values
        .iter()
        .map(|&value| f64::from(value).powi(2))
        .sum::<f64>()
        .sqrt();
    if !norm.is_finite() || norm == 0.0 {
        return Err(LocalE5Error::InvalidOutput(
            "embedding has an invalid or zero norm".into(),
        ));
    }
    for value in &mut values {
        *value = (f64::from(*value) / norm) as f32;
    }
    EmbeddingVector::new(values).map_err(LocalE5Error::InvalidOutput)
}

pub fn artifact_version(directory: &Path) -> Result<String, LocalE5Error> {
    validate_artifacts(directory)?;
    let mut digest = Sha256::new();
    for name in [CONFIG_FILE, TOKENIZER_FILE, MODEL_FILE] {
        digest.update(name.as_bytes());
        let path = directory.join(name);
        let file = File::open(&path).map_err(|error| LocalE5Error::ModelUnavailable {
            path: path.clone(),
            reason: error.to_string(),
        })?;
        let mut reader = BufReader::with_capacity(1024 * 1024, file);
        let mut buffer = vec![0_u8; 1024 * 1024];
        loop {
            let read =
                reader
                    .read(&mut buffer)
                    .map_err(|error| LocalE5Error::ModelUnavailable {
                        path: path.clone(),
                        reason: error.to_string(),
                    })?;
            if read == 0 {
                break;
            }
            digest.update(&buffer[..read]);
        }
    }
    let hex = format!("{:x}", digest.finalize());
    Ok(format!("artifacts-sha256:{}", &hex[..16]))
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
struct ArtifactSignature {
    directory: String,
    files: Vec<ArtifactFileSignature>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
struct ArtifactFileSignature {
    name: String,
    size: u64,
    modified_nanos: u64,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct ArtifactIdentityCache {
    signature: ArtifactSignature,
    version: String,
}

fn artifact_signature(directory: &Path) -> Result<ArtifactSignature, LocalE5Error> {
    validate_artifacts(directory)?;
    let canonical = directory
        .canonicalize()
        .map_err(|error| LocalE5Error::ModelUnavailable {
            path: directory.to_owned(),
            reason: error.to_string(),
        })?;
    let mut files = Vec::new();
    for name in [CONFIG_FILE, TOKENIZER_FILE, MODEL_FILE] {
        let path = directory.join(name);
        let metadata = path
            .metadata()
            .map_err(|error| LocalE5Error::ModelUnavailable {
                path: path.clone(),
                reason: error.to_string(),
            })?;
        let modified_nanos = metadata
            .modified()
            .map_err(|error| LocalE5Error::ModelUnavailable {
                path: path.clone(),
                reason: error.to_string(),
            })?
            .duration_since(UNIX_EPOCH)
            .map_err(|error| LocalE5Error::ModelUnavailable {
                path: path.clone(),
                reason: error.to_string(),
            })?
            .as_nanos();
        files.push(ArtifactFileSignature {
            name: name.into(),
            size: metadata.len(),
            modified_nanos: u64::try_from(modified_nanos).map_err(|_| {
                LocalE5Error::IdentityCache("artifact timestamp exceeds cache range".into())
            })?,
        });
    }
    Ok(ArtifactSignature {
        directory: canonical.to_string_lossy().into_owned(),
        files,
    })
}

pub fn artifact_version_cached(
    directory: &Path,
    cache_path: &Path,
) -> Result<String, LocalE5Error> {
    let signature = artifact_signature(directory)?;
    if let Ok(bytes) = std::fs::read(cache_path) {
        if let Ok(cache) = serde_json::from_slice::<ArtifactIdentityCache>(&bytes) {
            if cache.signature == signature && cache.version.starts_with("artifacts-sha256:") {
                return Ok(cache.version);
            }
        }
    }
    let version = artifact_version(directory)?;
    let bytes = serde_json::to_vec(&ArtifactIdentityCache {
        signature,
        version: version.clone(),
    })
    .map_err(|error| LocalE5Error::IdentityCache(error.to_string()))?;
    if let Some(parent) = cache_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| LocalE5Error::IdentityCache(error.to_string()))?;
    }
    std::fs::write(cache_path, bytes)
        .map_err(|error| LocalE5Error::IdentityCache(error.to_string()))?;
    Ok(version)
}
