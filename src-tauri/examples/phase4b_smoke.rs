use std::{collections::HashSet, path::Path, time::Instant};
use undertone::ai::{
    providers::local_e5::{EmbeddingRun, LocalE5Provider},
    semantic::{embed_tracks, semantic_query},
    LocalModelConfig, SemanticInput,
};
use undertone::database::Database;

const QUERIES: [&str; 3] = [
    "ночная поездка по городу, немного грустно и спокойно",
    "агрессивная энергичная музыка",
    "что-нибудь спокойное и меланхоличное",
];

#[derive(Clone)]
struct Candidate {
    id: i64,
    artist: String,
    title: String,
    genre: String,
    has_lyrics: bool,
}

fn select_candidates(db: &Database) -> Result<Vec<Candidate>, Box<dyn std::error::Error>> {
    let connection = db.connect()?;
    let mut statement = connection.prepare("SELECT t.id,a.name,t.title,COALESCE((SELECT group_concat(g.name, ', ') FROM track_genres tg JOIN genres g ON g.id=tg.genre_id WHERE tg.track_id=t.id),''),l.track_id IS NOT NULL FROM tracks t JOIN artists a ON a.id=t.artist_id LEFT JOIN lyrics l ON l.track_id=t.id ORDER BY (l.track_id IS NOT NULL) DESC,COALESCE(length(l.plain_text),(SELECT sum(length(ll.text)) FROM lyric_lines ll WHERE ll.track_id=t.id),0) DESC,a.name COLLATE NOCASE,t.title COLLATE NOCASE")?;
    let all = statement
        .query_map([], |row| {
            Ok(Candidate {
                id: row.get(0)?,
                artist: row.get(1)?,
                title: row.get(2)?,
                genre: row.get(3)?,
                has_lyrics: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut candidates = Vec::new();
    let mut artists = HashSet::new();
    for track in all.iter().filter(|track| track.has_lyrics) {
        if artists.insert(track.artist.to_lowercase()) {
            candidates.push(track.clone());
        }
        if candidates.len() == 16 {
            break;
        }
    }
    for track in all.iter().filter(|track| !track.has_lyrics) {
        if artists.insert(track.artist.to_lowercase()) {
            candidates.push(track.clone());
        }
        if candidates.len() == 18 {
            break;
        }
    }
    Ok(candidates)
}

fn print_timing(label: &str, run: &EmbeddingRun) {
    println!(
        "{label}_ms={} chunks={} tokenization_ms={} chunk_construction_ms={} inference_ms={} pooling_aggregation_us={}",
        run.elapsed.as_millis(),
        run.chunks,
        run.tokenization.as_millis(),
        run.chunk_construction.as_millis(),
        run.inference.as_millis(),
        run.pooling_aggregation.as_micros(),
    );
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut arguments = std::env::args().skip(1);
    let model_dir = arguments
        .next()
        .ok_or("usage: phase4b_smoke <model-directory> <database-directory>")?;
    let database_dir = arguments
        .next()
        .ok_or("usage: phase4b_smoke <model-directory> <database-directory>")?;
    let db = Database::open(Path::new(&database_dir))?;
    let canonical_database = db.path.canonicalize()?;
    println!("database={}", canonical_database.display());
    let normalized_database = canonical_database.to_string_lossy().replace('/', "\\");
    if normalized_database.contains("\\Packages\\OpenAI.Codex_")
        && normalized_database.contains("\\LocalCache\\Roaming\\")
    {
        return Err("refusing Codex package-virtualized database; run the smoke from a normal user process so %APPDATA% resolves to Undertone's live database".into());
    }
    let counts = db.connect()?.query_row(
        "SELECT (SELECT count(*) FROM tracks),(SELECT count(*) FROM lyrics)",
        [],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
    )?;
    println!("library_tracks={} lyrics={}", counts.0, counts.1);

    let started = Instant::now();
    let provider = LocalE5Provider::initialize(LocalModelConfig {
        model_id: "multilingual-e5-small".into(),
        model_version: String::new(),
        path: model_dir.into(),
        identity_cache_path: Some(Path::new(&database_dir).join("local-e5.identity.json")),
    })?;
    println!("initialization_ms={}", started.elapsed().as_millis());
    println!("metadata={:?}", provider.metadata());
    let session_instance = provider.session_instance_id();

    let candidates = select_candidates(&db)?;
    let track_ids = candidates.iter().map(|track| track.id).collect::<Vec<_>>();
    println!("selected_tracks:");
    for track in &candidates {
        println!(
            "{}\t{}\t{}\t{}\tlyrics={}",
            track.id, track.artist, track.title, track.genre, track.has_lyrics
        );
    }

    println!("lyrics_diagnostics:");
    for track in candidates.iter().filter(|track| track.has_lyrics).take(5) {
        let (source, kind, lyric_chars) = db.connect()?.query_row(
            "SELECT source,kind,COALESCE(length(plain_text),(SELECT sum(length(text)) + max(count(*) - 1,0) FROM lyric_lines WHERE track_id=lyrics.track_id),0) FROM lyrics WHERE track_id=?1",
            [track.id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?)),
        )?;
        let input_started = Instant::now();
        let input = SemanticInput::for_track(&db, track.id)?;
        let input_elapsed = input_started.elapsed();
        let diagnostic = provider.document_diagnostics(&input.text)?;
        println!(
            "{}\t{}\tsource={}\ttype={}\tlyric_chars={}\tsemantic_chars={}\ttokens={}\tchunks={}\tinput_us={}",
            track.id,
            track.title,
            source,
            kind,
            lyric_chars,
            input.text.chars().count(),
            diagnostic.tokens,
            diagnostic.chunks,
            input_elapsed.as_micros(),
        );
    }

    let short_track = candidates
        .iter()
        .min_by_key(|track| {
            SemanticInput::for_track(&db, track.id)
                .map(|input| input.text.len())
                .unwrap_or(usize::MAX)
        })
        .ok_or("no smoke candidates")?;
    let input_started = Instant::now();
    let short_input = SemanticInput::for_track(&db, short_track.id)?;
    println!(
        "short_semantic_input_us={}",
        input_started.elapsed().as_micros()
    );
    let short = provider.embed_document_blocking(&short_input.text)?;
    println!("short_track_id={}", short_track.id);
    print_timing("short", &short);

    let long_construction = Instant::now();
    let long_lyrics = "melancholy city night ".repeat(900);
    let long_input = format!(
        "title: Long Drive\nartist: Test\nalbum: Test\ngenre: Electronic\nyear: 2026\nlyrics: {long_lyrics}"
    );
    println!(
        "synthetic_semantic_input_us={}",
        long_construction.elapsed().as_micros()
    );
    let long = provider.embed_document_blocking(&long_input)?;
    print_timing("synthetic_long", &long);

    let indexed = futures_lite::future::block_on(embed_tracks(&db, &provider, &track_ids))?;
    println!("index_results={indexed:?}");
    for query in QUERIES {
        let timing = provider.embed_query_blocking(query)?;
        println!("query={query:?}");
        print_timing("query", &timing);
        let ranked =
            futures_lite::future::block_on(semantic_query(&db, &provider, query, &track_ids))?;
        for item in ranked.iter().take(5) {
            let has_lyrics = candidates
                .iter()
                .find(|track| track.id == item.track_id)
                .is_some_and(|track| track.has_lyrics);
            println!(
                "  {} — {} — {:.6} — lyrics={has_lyrics}",
                item.artist, item.title, item.score
            );
        }
    }
    if provider.session_instance_id() != session_instance {
        return Err("ONNX session was unexpectedly replaced during smoke".into());
    }
    println!("session_reused=true");
    Ok(())
}
