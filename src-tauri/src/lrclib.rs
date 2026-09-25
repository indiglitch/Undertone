use crate::{
    lyrics::parse_lrc,
    providers::{LyricsDocument, LyricsLookup, LyricsOrigin, LyricsProvider, SongContext},
};
use reqwest::{
    blocking::{Client, Response},
    header::{CONTENT_LENGTH, RETRY_AFTER},
    redirect::Policy,
    StatusCode, Url,
};
use serde::Deserialize;
use std::{io::Read, sync::Mutex, thread, time::Duration};

const MAX_RESPONSE_BYTES: u64 = 1024 * 1024;
const MAX_ATTEMPTS: usize = 2;

pub struct LrclibProvider {
    client: Client,
    endpoint: Url,
    request_gate: Mutex<()>,
}

impl LrclibProvider {
    pub fn new() -> Result<Self, String> {
        Self::build(
            Url::parse("https://lrclib.net/api/search").map_err(|e| e.to_string())?,
            Duration::from_secs(6),
        )
    }

    fn build(endpoint: Url, timeout: Duration) -> Result<Self, String> {
        if endpoint.scheme() != "https" {
            return Err("external lyrics endpoint must use HTTPS".into());
        }
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(3))
            .timeout(timeout)
            .redirect(Policy::none())
            .user_agent("Undertone/0.2 external-lyrics")
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            client,
            endpoint,
            request_gate: Mutex::new(()),
        })
    }

    #[cfg(test)]
    fn for_test(endpoint: Url, timeout: Duration) -> Result<Self, String> {
        let client = Client::builder()
            .connect_timeout(timeout)
            .timeout(timeout)
            .redirect(Policy::none())
            .user_agent("Undertone-test")
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            client,
            endpoint,
            request_gate: Mutex::new(()),
        })
    }

    fn request(&self, song: &SongContext) -> LyricsLookup {
        let _guard = match self.request_gate.lock() {
            Ok(guard) => guard,
            Err(_) => return temporary(30, false),
        };
        let mut url = self.endpoint.clone();
        url.query_pairs_mut()
            .append_pair("artist_name", &song.artist)
            .append_pair("track_name", &song.title)
            .append_pair("album_name", &song.album);

        for attempt in 0..MAX_ATTEMPTS {
            match self.client.get(url.clone()).send() {
                Ok(response) if response.status() == StatusCode::TOO_MANY_REQUESTS => {
                    let retry_after = response
                        .headers()
                        .get(RETRY_AFTER)
                        .and_then(|value| value.to_str().ok())
                        .and_then(|value| value.parse::<u64>().ok())
                        .unwrap_or(60)
                        .clamp(1, 3600);
                    return temporary(retry_after, true);
                }
                Ok(response) if response.status() == StatusCode::NOT_FOUND => {
                    return LyricsLookup::NotFound
                }
                Ok(response) if response.status().is_server_error() => {
                    if attempt + 1 < MAX_ATTEMPTS {
                        thread::sleep(Duration::from_millis(50));
                        continue;
                    }
                    return temporary(30, false);
                }
                Ok(response) if !response.status().is_success() => return temporary(60, false),
                Ok(response) => return decode_response(response, song),
                Err(error)
                    if (error.is_timeout() || error.is_connect() || error.is_request())
                        && attempt + 1 < MAX_ATTEMPTS =>
                {
                    thread::sleep(Duration::from_millis(50));
                }
                Err(_) => return temporary(30, false),
            }
        }
        temporary(30, false)
    }
}

impl LyricsProvider for LrclibProvider {
    fn name(&self) -> &str {
        "lrclib"
    }

    fn find(&self, song: &SongContext) -> Result<LyricsLookup, String> {
        Ok(self.request(song))
    }
}

fn temporary(seconds: u64, rate_limited: bool) -> LyricsLookup {
    LyricsLookup::TemporaryError {
        retry_after_seconds: Some(seconds),
        rate_limited,
    }
}

fn decode_response(mut response: Response, song: &SongContext) -> LyricsLookup {
    if response
        .headers()
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .is_some_and(|length| length > MAX_RESPONSE_BYTES)
    {
        return temporary(60, false);
    }
    let mut bytes = Vec::new();
    if response
        .by_ref()
        .take(MAX_RESPONSE_BYTES + 1)
        .read_to_end(&mut bytes)
        .is_err()
        || bytes.len() as u64 > MAX_RESPONSE_BYTES
    {
        return temporary(60, false);
    }
    let Ok(candidates) = serde_json::from_slice::<Vec<LrclibCandidate>>(&bytes) else {
        return temporary(60, false);
    };
    choose(candidates, song)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LrclibCandidate {
    id: i64,
    track_name: String,
    artist_name: String,
    #[serde(default)]
    album_name: String,
    duration: Option<f64>,
    synced_lyrics: Option<String>,
    plain_lyrics: Option<String>,
}

fn choose(candidates: Vec<LrclibCandidate>, song: &SongContext) -> LyricsLookup {
    let mut scored = candidates
        .into_iter()
        .filter_map(|candidate| {
            score(&candidate, song).map(|score| (score, candidate.id, candidate))
        })
        .collect::<Vec<_>>();
    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    let Some((best_score, _, best)) = scored.first() else {
        return LyricsLookup::NotFound;
    };
    if scored.get(1).is_some_and(|second| second.0 == *best_score) {
        return LyricsLookup::Ambiguous;
    }
    candidate_document(best)
        .map(LyricsLookup::Found)
        .unwrap_or_else(|| temporary(60, false))
}

fn score(candidate: &LrclibCandidate, song: &SongContext) -> Option<i32> {
    if normalize(&candidate.artist_name) != normalize(&song.artist)
        || normalize(&candidate.track_name) != normalize(&song.title)
    {
        return None;
    }
    let mut score = 100;
    let wanted_album = normalize(&song.album);
    let candidate_album = normalize(&candidate.album_name);
    if !wanted_album.is_empty() && wanted_album == candidate_album {
        score += 20;
    }
    if let Some(duration) = candidate
        .duration
        .filter(|duration| duration.is_finite() && *duration > 0.0)
    {
        let delta = (duration - song.duration).abs();
        if delta <= 2.0 {
            score += 20;
        } else if delta <= 5.0 {
            score += 10;
        } else if delta > 15.0 {
            return None;
        }
    }
    Some(score)
}

fn normalize(input: &str) -> String {
    input
        .chars()
        .flat_map(char::to_lowercase)
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn candidate_document(candidate: &LrclibCandidate) -> Option<LyricsDocument> {
    if let Some(synced) = candidate
        .synced_lyrics
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        let parsed = parse_lrc(synced);
        if !parsed.synced.is_empty() {
            return Some(LyricsDocument {
                plain: None,
                synced: parsed.synced,
                origin: LyricsOrigin::External("lrclib".into()),
                manually_edited: false,
                revision: format!("lrclib:{}", candidate.id),
            });
        }
    }
    candidate
        .plain_lyrics
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|plain| LyricsDocument {
            plain: Some(plain.to_string()),
            synced: Vec::new(),
            origin: LyricsOrigin::External("lrclib".into()),
            manually_edited: false,
            revision: format!("lrclib:{}", candidate.id),
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{database::Database, external_lyrics, providers::LyricsOrigin};
    use rusqlite::params;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        path::PathBuf,
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        },
        time::{Duration, Instant, SystemTime, UNIX_EPOCH},
    };

    #[derive(Clone)]
    struct Reply {
        status: u16,
        body: Vec<u8>,
        headers: Vec<(&'static str, String)>,
        delay: Duration,
        declared_length: Option<usize>,
    }

    impl Reply {
        fn json(body: &str) -> Self {
            Self {
                status: 200,
                body: body.as_bytes().to_vec(),
                headers: vec![],
                delay: Duration::ZERO,
                declared_length: None,
            }
        }
    }

    struct MockServer {
        endpoint: Url,
        requests: Arc<AtomicUsize>,
    }

    impl MockServer {
        fn start(replies: Vec<Reply>) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            listener.set_nonblocking(true).unwrap();
            let address = listener.local_addr().unwrap();
            let requests = Arc::new(AtomicUsize::new(0));
            let count = requests.clone();
            std::thread::spawn(move || {
                let deadline = Instant::now() + Duration::from_secs(3);
                let mut next = 0usize;
                while next < replies.len() && Instant::now() < deadline {
                    match listener.accept() {
                        Ok((mut stream, _)) => {
                            let reply = replies[next].clone();
                            next += 1;
                            count.fetch_add(1, Ordering::SeqCst);
                            std::thread::spawn(move || {
                                let mut request = [0u8; 2048];
                                let _ = stream.read(&mut request);
                                std::thread::sleep(reply.delay);
                                let reason = match reply.status {
                                    200 => "OK",
                                    429 => "Too Many Requests",
                                    500 => "Server Error",
                                    _ => "Error",
                                };
                                let length = reply.declared_length.unwrap_or(reply.body.len());
                                let mut head = format!(
                                    "HTTP/1.1 {} {}\r\nContent-Length: {}\r\nConnection: close\r\n",
                                    reply.status, reason, length
                                );
                                for (name, value) in reply.headers {
                                    head.push_str(&format!("{name}: {value}\r\n"));
                                }
                                head.push_str("\r\n");
                                let _ = stream.write_all(head.as_bytes());
                                let _ = stream.write_all(&reply.body);
                            });
                        }
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            std::thread::sleep(Duration::from_millis(5))
                        }
                        Err(_) => break,
                    }
                }
            });
            Self {
                endpoint: Url::parse(&format!("http://{address}/api/search")).unwrap(),
                requests,
            }
        }

        fn provider(&self) -> LrclibProvider {
            LrclibProvider::for_test(self.endpoint.clone(), Duration::from_millis(500)).unwrap()
        }
    }

    fn song() -> SongContext {
        SongContext {
            id: 1,
            path: PathBuf::from("Song.wav"),
            title: "The Song".into(),
            artist: "The Artist".into(),
            album: "The Album".into(),
            duration: 180.0,
        }
    }

    fn candidate(
        id: i64,
        title: &str,
        artist: &str,
        album: &str,
        duration: f64,
        synced: Option<&str>,
        plain: Option<&str>,
    ) -> String {
        serde_json::json!({"id":id,"trackName":title,"artistName":artist,"albumName":album,"duration":duration,"syncedLyrics":synced,"plainLyrics":plain}).to_string()
    }

    fn array(values: &[String]) -> String {
        format!("[{}]", values.join(","))
    }

    fn fixture() -> (Database, i64, PathBuf) {
        let root = std::env::temp_dir().join(format!(
            "undertone-external-lyrics-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let audio = root.join("Song.wav");
        std::fs::write(&audio, b"not decoded during external tests").unwrap();
        let db = Database::open(&root.join("db")).unwrap();
        let conn = db.connect().unwrap();
        conn.execute("INSERT INTO artists(name) VALUES('The Artist')", [])
            .unwrap();
        let artist = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO albums(title,artist_id) VALUES('The Album',?1)",
            [artist],
        )
        .unwrap();
        let album = conn.last_insert_rowid();
        conn.execute("INSERT INTO tracks(path,title,artist_id,album_id,album_artist,duration,format,size,modified) VALUES(?1,'The Song',?2,?3,'The Artist',180.0,'WAV',27,'fixture')", params![audio.to_string_lossy(), artist, album]).unwrap();
        let id = conn.last_insert_rowid();
        drop(conn);
        (db, id, root)
    }

    #[test]
    fn exact_match_returns_plain_and_wrong_song_is_not_accepted() {
        let body = array(&[
            candidate(
                1,
                "Other",
                "The Artist",
                "The Album",
                180.0,
                None,
                Some("wrong"),
            ),
            candidate(
                2,
                "the-song",
                "THE ARTIST",
                "Other",
                180.0,
                None,
                Some("plain words"),
            ),
        ]);
        let server = MockServer::start(vec![Reply::json(&body)]);
        let result = server.provider().find(&song()).unwrap();
        let LyricsLookup::Found(document) = result else {
            panic!("expected match")
        };
        assert_eq!(document.plain.as_deref(), Some("plain words"));

        let wrong = MockServer::start(vec![Reply::json(&array(&[candidate(
            3,
            "Wrong",
            "Someone",
            "",
            180.0,
            None,
            Some("bad"),
        )]))]);
        assert_eq!(
            wrong.provider().find(&song()).unwrap(),
            LyricsLookup::NotFound
        );
    }

    #[test]
    fn album_and_duration_select_synced_result_and_ties_are_ambiguous() {
        let selected = candidate(
            2,
            "The Song",
            "The Artist",
            "The Album",
            180.5,
            Some("[00:01.00]line"),
            Some("plain fallback"),
        );
        let weaker = candidate(
            1,
            "The Song",
            "The Artist",
            "Other",
            184.0,
            None,
            Some("wrong version"),
        );
        let server = MockServer::start(vec![Reply::json(&array(&[weaker, selected]))]);
        let LyricsLookup::Found(document) = server.provider().find(&song()).unwrap() else {
            panic!("expected match")
        };
        assert!(document.plain.is_none());
        assert_eq!(document.synced[0].text, "line");

        let same = candidate(
            3,
            "The Song",
            "The Artist",
            "The Album",
            180.0,
            None,
            Some("a"),
        );
        let tie = candidate(
            4,
            "The Song",
            "The Artist",
            "The Album",
            180.0,
            None,
            Some("b"),
        );
        let ambiguous = MockServer::start(vec![Reply::json(&array(&[same, tie]))]);
        assert_eq!(
            ambiguous.provider().find(&song()).unwrap(),
            LyricsLookup::Ambiguous
        );
    }

    #[test]
    fn not_found_timeout_rate_limit_and_bad_responses_are_safe() {
        let empty = MockServer::start(vec![Reply::json("[]")]);
        assert_eq!(
            empty.provider().find(&song()).unwrap(),
            LyricsLookup::NotFound
        );

        let timeout_reply = Reply {
            delay: Duration::from_millis(700),
            ..Reply::json("[]")
        };
        let timeout = MockServer::start(vec![timeout_reply.clone(), timeout_reply]);
        assert!(matches!(
            timeout.provider().find(&song()).unwrap(),
            LyricsLookup::TemporaryError { .. }
        ));

        let limited = MockServer::start(vec![Reply {
            status: 429,
            body: vec![],
            headers: vec![("Retry-After", "120".into())],
            delay: Duration::ZERO,
            declared_length: None,
        }]);
        assert_eq!(
            limited.provider().find(&song()).unwrap(),
            LyricsLookup::TemporaryError {
                retry_after_seconds: Some(120),
                rate_limited: true,
            }
        );

        let malformed = MockServer::start(vec![Reply::json("{bad")]);
        assert!(matches!(
            malformed.provider().find(&song()).unwrap(),
            LyricsLookup::TemporaryError { .. }
        ));
        let oversized = MockServer::start(vec![Reply {
            status: 200,
            body: vec![],
            headers: vec![],
            delay: Duration::ZERO,
            declared_length: Some(MAX_RESPONSE_BYTES as usize + 1),
        }]);
        assert!(matches!(
            oversized.provider().find(&song()).unwrap(),
            LyricsLookup::TemporaryError { .. }
        ));
    }

    #[test]
    fn successful_lookup_is_cached_and_local_or_manual_never_calls_http() {
        let (db, id, root) = fixture();
        let body = array(&[candidate(
            9,
            "The Song",
            "The Artist",
            "The Album",
            180.0,
            None,
            Some("cached words"),
        )]);
        let server = MockServer::start(vec![Reply::json(&body)]);
        let provider = server.provider();
        let first = external_lyrics::fetch_at(&db, id, &provider, 100).unwrap();
        assert_eq!(first.status, external_lyrics::ExternalLyricsStatus::Found);
        assert!(!first.cached);
        let state: (String, String, i64, Option<i64>) = db.connect().unwrap().query_row(
            "SELECT external_status,external_provider,external_attempted_at,external_retry_after FROM lyrics_scan_state WHERE track_id=?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        ).unwrap();
        assert_eq!(state, ("success".into(), "lrclib".into(), 100, None));
        let second = external_lyrics::fetch_at(&db, id, &provider, 101).unwrap();
        assert!(second.cached);
        assert_eq!(server.requests.load(Ordering::SeqCst), 1);
        drop(db);
        std::fs::remove_dir_all(root).unwrap();

        let (manual_db, manual_id, manual_root) = fixture();
        manual_db.connect().unwrap().execute("INSERT INTO lyrics(track_id,source,kind,plain_text,source_fingerprint,manual_override) VALUES(?1,'manual','plain','manual','m1',1)", [manual_id]).unwrap();
        let unused = MockServer::start(vec![Reply::json(&body)]);
        assert!(
            external_lyrics::fetch_at(&manual_db, manual_id, &unused.provider(), 100)
                .unwrap()
                .cached
        );
        assert_eq!(unused.requests.load(Ordering::SeqCst), 0);
        drop(manual_db);
        std::fs::remove_dir_all(manual_root).unwrap();

        let (local_db, local_id, local_root) = fixture();
        std::fs::write(local_root.join("Song.lrc"), "[00:01.00]local").unwrap();
        let unused_local = MockServer::start(vec![Reply::json(&body)]);
        let local =
            external_lyrics::fetch_at(&local_db, local_id, &unused_local.provider(), 100).unwrap();
        assert!(local.cached);
        assert_eq!(local.lyrics.unwrap().origin, LyricsOrigin::LocalLrc);
        assert_eq!(unused_local.requests.load(Ordering::SeqCst), 0);
        drop(local_db);
        std::fs::remove_dir_all(local_root).unwrap();
    }

    #[test]
    fn temporary_error_is_cached_until_retry_time_then_can_succeed() {
        let (db, id, root) = fixture();
        let success = array(&[candidate(
            5,
            "The Song",
            "The Artist",
            "The Album",
            180.0,
            None,
            Some("later"),
        )]);
        let server = MockServer::start(vec![
            Reply {
                status: 429,
                body: vec![],
                headers: vec![("Retry-After", "2".into())],
                delay: Duration::ZERO,
                declared_length: None,
            },
            Reply::json(&success),
        ]);
        let provider = server.provider();
        assert_eq!(
            external_lyrics::fetch_at(&db, id, &provider, 100)
                .unwrap()
                .status,
            external_lyrics::ExternalLyricsStatus::TemporaryError
        );
        assert!(
            external_lyrics::fetch_at(&db, id, &provider, 101)
                .unwrap()
                .cached
        );
        assert_eq!(server.requests.load(Ordering::SeqCst), 1);
        let retried = external_lyrics::fetch_at(&db, id, &provider, 103).unwrap();
        assert_eq!(
            retried.status,
            external_lyrics::ExternalLyricsStatus::Found,
            "requests={}",
            server.requests.load(Ordering::SeqCst)
        );
        assert_eq!(server.requests.load(Ordering::SeqCst), 2);
        drop(db);
        std::fs::remove_dir_all(root).unwrap();
    }
}
