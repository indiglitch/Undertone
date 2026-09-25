use std::{
    collections::{BTreeMap, HashSet},
    path::Path,
    time::Instant,
};
use undertone::{
    ai::{
        cosine_similarity,
        evaluation::{
            combine_metadata_lyrics, evaluation_query_text, mean_embedding, mean_similarity,
            score_chunks, sort_scores, ChunkScoring, EvaluationScore, QueryRepresentation,
            SplitWeights,
        },
        providers::local_e5::LocalE5Provider,
        LocalModelConfig, SemanticInput,
    },
    database::Database,
};

const QUERIES: [&str; 6] = [
    "ночная поездка по городу, немного грустно и спокойно",
    "агрессивная энергичная музыка",
    "что-нибудь спокойное и меланхоличное",
    "весёлая бодрая музыка",
    "мрачная тяжёлая атмосфера",
    "расслабленная музыка для сна",
];

// Temporary evaluation-only selection. Labels document corpus coverage and are never persisted.
const CORPUS: [(i64, &str); 40] = [
    (251, "rap"),
    (89, "rap"),
    (666, "rap"),
    (99, "rap"),
    (378, "rap"),
    (79, "rap"),
    (148, "rap"),
    (624, "rap"),
    (157, "electronic"),
    (13, "electronic_upbeat"),
    (61, "instrumental"),
    (63, "instrumental"),
    (82, "electronic_aggressive"),
    (214, "electronic"),
    (288, "electronic_calm"),
    (102, "instrumental"),
    (31, "upbeat"),
    (75, "upbeat"),
    (87, "upbeat"),
    (149, "upbeat"),
    (218, "pop"),
    (275, "upbeat"),
    (465, "upbeat"),
    (326, "upbeat"),
    (81, "melancholic"),
    (84, "calm"),
    (247, "melancholic"),
    (154, "calm"),
    (126, "calm"),
    (435, "melancholic"),
    (462, "melancholic"),
    (201, "calm"),
    (252, "heavy"),
    (284, "aggressive"),
    (269, "aggressive"),
    (420, "heavy"),
    (463, "aggressive"),
    (282, "aggressive"),
    (315, "aggressive"),
    (330, "dark"),
];

const WEIGHTS: [(&str, SplitWeights); 3] = [
    (
        "split_m75_l25",
        SplitWeights {
            metadata: 0.75,
            lyrics: 0.25,
        },
    ),
    (
        "split_m50_l50",
        SplitWeights {
            metadata: 0.5,
            lyrics: 0.5,
        },
    ),
    (
        "split_m25_l75",
        SplitWeights {
            metadata: 0.25,
            lyrics: 0.75,
        },
    ),
];

struct EvalTrack {
    id: i64,
    bucket: &'static str,
    artist: String,
    title: String,
    has_lyrics: bool,
    full_chunks: Vec<undertone::ai::EmbeddingVector>,
    mean: undertone::ai::EmbeddingVector,
    metadata: undertone::ai::EmbeddingVector,
    lyrics_chunks: Option<Vec<undertone::ai::EmbeddingVector>>,
}

#[derive(Clone)]
struct RankedTrack {
    track_id: i64,
    score: f32,
}

fn split_input(input: &str) -> Result<(String, Option<String>), String> {
    let (metadata, lyrics) = input
        .split_once("\nlyrics: ")
        .ok_or_else(|| "semantic input has no lyrics field".to_owned())?;
    let metadata_input = format!("{metadata}\nlyrics: ");
    let lyrics_input = (!lyrics.is_empty())
        .then(|| format!("title: \nartist: \nalbum: \ngenre: \nyear: \nlyrics: {lyrics}"));
    Ok((metadata_input, lyrics_input))
}

fn distribution(scores: &[RankedTrack]) -> (f32, f32, f32, f32, f32, f32, f32) {
    let mut values = scores.iter().map(|row| row.score).collect::<Vec<_>>();
    values.sort_by(f32::total_cmp);
    let mean = values.iter().map(|&value| f64::from(value)).sum::<f64>() / values.len() as f64;
    let variance = values
        .iter()
        .map(|&value| (f64::from(value) - mean).powi(2))
        .sum::<f64>()
        / values.len() as f64;
    let percentile =
        |fraction: f32| values[((values.len() - 1) as f32 * fraction).round() as usize];
    (
        values[0],
        percentile(0.25),
        percentile(0.5),
        percentile(0.75),
        values[values.len() - 1],
        mean as f32,
        variance.sqrt() as f32,
    )
}

fn print_metrics(
    key: &str,
    query_rankings: &[Vec<RankedTrack>],
    tracks: &[EvalTrack],
) -> Result<(), String> {
    let mut overlaps = Vec::new();
    for left in 0..query_rankings.len() {
        for right in (left + 1)..query_rankings.len() {
            let left_ids = query_rankings[left]
                .iter()
                .take(5)
                .map(|row| row.track_id)
                .collect::<HashSet<_>>();
            let right_ids = query_rankings[right]
                .iter()
                .take(5)
                .map(|row| row.track_id)
                .collect::<HashSet<_>>();
            overlaps.push(left_ids.intersection(&right_ids).count() as f32 / 5.0);
        }
    }
    let distinct_top1 = query_rankings
        .iter()
        .filter_map(|ranking| ranking.first().map(|row| row.track_id))
        .collect::<HashSet<_>>()
        .len();
    println!(
        "SUMMARY\t{key}\tmean_top5_overlap={:.6}\tdistinct_top1={distinct_top1}",
        mean_similarity(&overlaps)?
    );

    let mut hubs = tracks
        .iter()
        .map(|track| {
            let scores = query_rankings
                .iter()
                .map(|ranking| {
                    ranking
                        .iter()
                        .find(|row| row.track_id == track.id)
                        .map(|row| row.score)
                        .ok_or_else(|| "missing hub score".to_owned())
                })
                .collect::<Result<Vec<_>, _>>()?;
            let appearances = query_rankings
                .iter()
                .filter(|ranking| ranking.iter().take(5).any(|row| row.track_id == track.id))
                .count();
            Ok((mean_similarity(&scores)?, appearances, track))
        })
        .collect::<Result<Vec<_>, String>>()?;
    hubs.sort_by(|left, right| {
        right
            .0
            .total_cmp(&left.0)
            .then_with(|| left.2.id.cmp(&right.2.id))
    });
    for (rank, (mean, appearances, track)) in hubs.iter().take(8).enumerate() {
        println!(
            "HUB\t{key}\t{}\t{}\t{}\t{}\tmean={mean:.6}\ttop5_count={appearances}",
            rank + 1,
            track.id,
            track.artist,
            track.title
        );
    }
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut arguments = std::env::args().skip(1);
    let model_dir = arguments.next().ok_or("model directory required")?;
    let database_dir = arguments.next().ok_or("database directory required")?;
    let db = Database::open(Path::new(&database_dir))?;
    let canonical = db.path.canonicalize()?;
    let normalized = canonical.to_string_lossy().replace('/', "\\");
    if normalized.contains("\\Packages\\OpenAI.Codex_") {
        return Err("refusing package-virtualized database".into());
    }
    println!("DATABASE\t{}", canonical.display());

    let provider = LocalE5Provider::initialize(LocalModelConfig {
        model_id: "multilingual-e5-small".into(),
        model_version: String::new(),
        path: model_dir.into(),
        identity_cache_path: Some(Path::new(&database_dir).join("local-e5.identity.json")),
    })?;
    let started = Instant::now();
    let connection = db.connect()?;
    let mut tracks = Vec::with_capacity(CORPUS.len());
    for (id, bucket) in CORPUS {
        let (artist, title, has_lyrics) = connection.query_row(
            "SELECT a.name,t.title,l.track_id IS NOT NULL FROM tracks t JOIN artists a ON a.id=t.artist_id LEFT JOIN lyrics l ON l.track_id=t.id WHERE t.id=?1",
            [id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, bool>(2)?)),
        )?;
        let input = SemanticInput::for_track(&db, id)?;
        let (metadata_input, lyrics_input) = split_input(&input.text)?;
        let full_chunks = provider.embed_document_chunks_blocking(&input.text)?;
        let mean = mean_embedding(&full_chunks)?;
        let metadata = mean_embedding(&provider.embed_document_chunks_blocking(&metadata_input)?)?;
        let lyrics_chunks = lyrics_input
            .as_deref()
            .map(|text| provider.embed_document_chunks_blocking(text))
            .transpose()?;
        println!(
            "CORPUS\t{id}\t{bucket}\t{artist}\t{title}\tlyrics={has_lyrics}\tchunks={}",
            full_chunks.len()
        );
        tracks.push(EvalTrack {
            id,
            bucket,
            artist,
            title,
            has_lyrics,
            full_chunks,
            mean,
            metadata,
            lyrics_chunks,
        });
    }
    println!("CORPUS_EMBED_MS\t{}", started.elapsed().as_millis());

    let mut all_rankings: BTreeMap<String, Vec<Vec<RankedTrack>>> = BTreeMap::new();
    for representation in [QueryRepresentation::Raw, QueryRepresentation::MusicContext] {
        let representation_name = match representation {
            QueryRepresentation::Raw => "raw",
            QueryRepresentation::MusicContext => "context",
        };
        for (query_index, query) in QUERIES.iter().enumerate() {
            let represented = evaluation_query_text(query, representation)?;
            println!(
                "QUERY\t{representation_name}\tq={}\tuser={query}\trepresented={represented}",
                query_index + 1
            );
            let query_embedding = provider.embed_query_blocking(&represented)?.embedding;
            let mut variant_scores: BTreeMap<&str, Vec<EvaluationScore>> = BTreeMap::new();
            for track in &tracks {
                let mean = cosine_similarity(&query_embedding, &track.mean)?;
                let max = score_chunks(&query_embedding, &track.full_chunks, ChunkScoring::Max)?;
                let top2 = score_chunks(
                    &query_embedding,
                    &track.full_chunks,
                    ChunkScoring::TopKMean(2),
                )?;
                let metadata_score = cosine_similarity(&query_embedding, &track.metadata)?;
                let lyrics_score = track
                    .lyrics_chunks
                    .as_deref()
                    .map(|chunks| score_chunks(&query_embedding, chunks, ChunkScoring::TopKMean(2)))
                    .transpose()?;
                for (name, score) in [("mean", mean), ("max", max), ("top2", top2)] {
                    variant_scores
                        .entry(name)
                        .or_default()
                        .push(EvaluationScore {
                            track_id: track.id,
                            score,
                        });
                }
                for (name, weights) in WEIGHTS {
                    variant_scores
                        .entry(name)
                        .or_default()
                        .push(EvaluationScore {
                            track_id: track.id,
                            score: combine_metadata_lyrics(metadata_score, lyrics_score, weights)?,
                        });
                }
            }
            for (variant, mut scores) in variant_scores {
                sort_scores(&mut scores);
                let rows = scores
                    .iter()
                    .map(|score| RankedTrack {
                        track_id: score.track_id,
                        score: score.score,
                    })
                    .collect::<Vec<_>>();
                let distribution = distribution(&rows);
                println!(
                    "DISTRIBUTION\t{representation_name}\tq={}\t{variant}\tmin={:.6}\tp25={:.6}\tmedian={:.6}\tp75={:.6}\tmax={:.6}\tmean={:.6}\tstddev={:.6}",
                    query_index + 1,
                    distribution.0,
                    distribution.1,
                    distribution.2,
                    distribution.3,
                    distribution.4,
                    distribution.5,
                    distribution.6,
                );
                for (rank, row) in rows.iter().take(5).enumerate() {
                    let track = tracks
                        .iter()
                        .find(|track| track.id == row.track_id)
                        .unwrap();
                    println!(
                        "RESULT\t{representation_name}\tq={}\t{variant}\t{}\t{}\t{}\t{}\tlyrics={}\tbucket={}\tscore={:.6}",
                        query_index + 1,
                        rank + 1,
                        track.id,
                        track.artist,
                        track.title,
                        track.has_lyrics,
                        track.bucket,
                        row.score,
                    );
                }
                all_rankings
                    .entry(format!("{representation_name}/{variant}"))
                    .or_default()
                    .push(rows);
            }
        }
    }
    for (key, rankings) in &all_rankings {
        print_metrics(key, rankings, &tracks)?;
    }
    Ok(())
}
