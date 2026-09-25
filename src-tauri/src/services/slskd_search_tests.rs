use super::*;
use std::{io::Write, net::TcpListener, thread};
const KEY: &str = "test-secret-never-expose-123456";
struct Vault;
impl SecretStore for Vault {
    fn get(&self, _: &SecretRef) -> Result<Option<Vec<u8>>, String> {
        Ok(Some(KEY.as_bytes().to_vec()))
    }
    fn put(&self, _: &SecretRef, _: &[u8]) -> Result<(), String> {
        unreachable!()
    }
    fn remove(&self, _: &SecretRef) -> Result<(), String> {
        unreachable!()
    }
}
fn run(
    code: u16,
    snapshots: Vec<serde_json::Value>,
    raw: Option<String>,
    duration: Duration,
) -> Result<SoulseekSearchResults, String> {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!(
        "http://localhost:{}/prefix",
        listener.local_addr().unwrap().port()
    );
    let worker = thread::spawn(move || {
        listener.set_nonblocking(true).unwrap();
        let deadline = Instant::now() + Duration::from_secs(8);
        let mut id = String::new();
        let mut polls = 0;
        let mut cancelled = false;
        loop {
            let (mut stream, _) = match listener.accept() {
                Ok(s) => s,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    assert!(Instant::now() < deadline, "mock deadline");
                    thread::sleep(Duration::from_millis(1));
                    continue;
                }
                Err(_) => panic!("mock accept"),
            };
            stream.set_nonblocking(false).unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut bytes = Vec::new();
            let mut buf = [0; 4096];
            let header_end = loop {
                let n = stream.read(&mut buf).unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&buf[..n]);
                if let Some(p) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                    break p + 4;
                }
            };
            let headers = String::from_utf8(bytes[..header_end].to_vec()).unwrap();
            assert!(headers
                .lines()
                .any(|s| s.eq_ignore_ascii_case(&format!("x-api-key: {KEY}"))));
            let len: usize = headers
                .lines()
                .find_map(|s| {
                    s.to_lowercase()
                        .strip_prefix("content-length: ")
                        .and_then(|s| s.parse().ok())
                })
                .unwrap_or(0);
            while bytes.len() < header_end + len {
                let n = stream.read(&mut buf).unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&buf[..n]);
            }
            let (status, body) = if headers.starts_with("POST ") {
                assert!(headers.starts_with("POST /prefix/api/v0/searches HTTP/1.1"));
                let body: serde_json::Value = serde_json::from_slice(&bytes[header_end..]).unwrap();
                id = body["id"].as_str().unwrap().to_owned();
                assert_eq!(body["searchText"], "artist title");
                assert_eq!(body["fileLimit"], MAX_RESULTS);
                assert_eq!(body["searchTimeout"], 8000);
                (
                    200,
                    serde_json::json!({"id":id,"isComplete":false,"responses":[]}).to_string(),
                )
            } else if headers.starts_with("GET ") {
                assert!(headers.starts_with(&format!(
                    "GET /prefix/api/v0/searches/{id}?includeResponses=true HTTP/1.1"
                )));
                let mut state = snapshots[polls.min(snapshots.len() - 1)].clone();
                state["id"] = id.clone().into();
                polls += 1;
                (code, raw.clone().unwrap_or_else(|| state.to_string()))
            } else if headers.starts_with("PUT ") {
                assert!(headers.starts_with(&format!("PUT /prefix/api/v0/searches/{id} HTTP/1.1")));
                cancelled = true;
                (200, String::new())
            } else {
                assert!(
                    headers.starts_with(&format!("DELETE /prefix/api/v0/searches/{id} HTTP/1.1"))
                );
                assert!(cancelled);
                let _ = stream.write_all(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n");
                break;
            };
            let reply = if body.len() as u64 > MAX_RESPONSE {
                format!("HTTP/1.1 {status} Test\r\nConnection: close\r\n\r\n{body}")
            } else {
                format!(
                "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            )
            };
            let _ = stream.write_all(reply.as_bytes());
        }
        assert!(polls > 0 && polls < 2000);
    });
    let result = SlskdProvider::new(
        SlskdConfig::new(&url, SecretRef("ref".into())).unwrap(),
        &Vault,
    )
    .search_bounded("artist title", duration, Duration::from_millis(5));
    worker.join().unwrap();
    assert!(!format!("{result:?}").contains(KEY));
    if let Ok(value) = &result {
        assert!(!serde_json::to_string(value).unwrap().contains(KEY));
        assert!(value.cleanup_succeeded);
    }
    result
}
fn state(complete: bool, peers: serde_json::Value) -> serde_json::Value {
    serde_json::json!({"isComplete":complete,"responses":peers})
}
fn file(name: &str) -> serde_json::Value {
    serde_json::json!({"filename":name,"size":5000000000u64,"extension":"flac","bitRate":900,"sampleRate":96000,"bitDepth":24,"length":241})
}
fn peer(name: &str, files: Vec<serde_json::Value>) -> serde_json::Value {
    serde_json::json!({"username":name,"files":files,"hasFreeUploadSlot":true,"queueLength":3,"uploadSpeed":123456})
}
#[test]
fn successful_multiple_peers_metadata_and_duplicates() {
    let p = peer(
        "alice",
        vec![
            file("dir\\one.flac"),
            file("dir\\one.flac"),
            file("dir\\two.flac"),
        ],
    );
    let r = run(
        200,
        vec![
            state(false, serde_json::json!([p])),
            state(
                true,
                serde_json::json!([p, peer("bob", vec![file("dir\\one.flac")])]),
            ),
        ],
        None,
        Duration::from_secs(1),
    )
    .unwrap();
    assert_eq!(r.completion, SearchCompletion::Complete);
    assert_eq!(r.results.len(), 3);
    let f = &r.results[0];
    assert_eq!(f.size_bytes, 5000000000);
    assert_eq!(f.bitrate_kbps, Some(900));
    assert_eq!(f.sample_rate_hz, Some(96000));
    assert_eq!(f.bit_depth, Some(24));
    assert_eq!(f.duration_seconds, Some(241));
    assert_eq!(f.queue_length, Some(3));
    assert_eq!(f.upload_speed_bytes_per_second, Some(123456));
    assert_eq!(f.has_free_upload_slot, Some(true));
    assert_eq!(f.remote_path, "dir\\one.flac");
    assert_eq!(f.extension.as_deref(), Some("flac"));
}
#[test]
fn empty_result() {
    let r = run(
        200,
        vec![state(true, serde_json::json!([]))],
        None,
        Duration::from_secs(1),
    )
    .unwrap();
    assert!(r.results.is_empty());
    assert_eq!(r.completion, SearchCompletion::Complete);
}
#[test]
fn timeout_retains_partial_results_and_cleans_up() {
    let start = Instant::now();
    let r = run(
        200,
        vec![state(
            false,
            serde_json::json!([peer("a", vec![file("x")])]),
        )],
        None,
        Duration::from_millis(100),
    )
    .unwrap();
    assert_eq!(r.completion, SearchCompletion::TimedOut);
    assert_eq!(r.results.len(), 1);
    assert!(start.elapsed() < Duration::from_secs(3));
}
#[test]
fn malformed_response() {
    for raw in ["not json", "{}", "{\"isComplete\":true}"] {
        assert!(run(
            200,
            vec![state(true, serde_json::json!([]))],
            Some(raw.into()),
            Duration::from_secs(1)
        )
        .unwrap_err()
        .contains("malformed"));
    }
}
#[test]
fn oversized_response() {
    assert!(run(
        200,
        vec![state(true, serde_json::json!([]))],
        Some("x".repeat(MAX_RESPONSE as usize + 1)),
        Duration::from_secs(1)
    )
    .unwrap_err()
    .contains("too large"));
}
#[test]
fn authentication_and_http_errors_do_not_expose_body() {
    for code in [401, 403, 500, 302] {
        let e = run(
            code,
            vec![state(true, serde_json::json!([]))],
            Some(KEY.into()),
            Duration::from_secs(1),
        )
        .unwrap_err();
        assert!(!e.contains(KEY));
    }
}
#[test]
fn result_limit() {
    let files = (0..510).map(|i| file(&format!("{i}.flac"))).collect();
    let r = run(
        200,
        vec![state(false, serde_json::json!([peer("a", files)]))],
        None,
        Duration::from_secs(1),
    )
    .unwrap();
    assert_eq!(r.results.len(), MAX_RESULTS);
    assert_eq!(r.completion, SearchCompletion::ResultLimit);
}
#[test]
fn untrusted_strings_and_reflected_secret() {
    for name in [KEY, "bad\npath"] {
        assert!(run(
            200,
            vec![state(
                true,
                serde_json::json!([peer("a", vec![file(name)])])
            )],
            None,
            Duration::from_secs(1)
        )
        .is_err());
    }
}
#[test]
fn optional_metadata_and_locked_files() {
    let r=run(200,vec![state(true,serde_json::json!([{"username":"a","files":[],"lockedFiles":[{"filename":"../opaque/path","size":0}]}]))],None,Duration::from_secs(1)).unwrap();
    let f = &r.results[0];
    assert!(f.is_locked);
    assert_eq!(f.bitrate_kbps, None);
    assert_eq!(f.duration_seconds, None);
    assert_eq!(f.remote_path, "../opaque/path");
}
#[test]
fn real_slskd_shape_uses_file_lock_and_path_extension_fallback() {
    let r=run(200,vec![state(true,serde_json::json!([{"username":"peer","files":[{"filename":"music\\album\\track.FLAC","size":148955042,"extension":"","sampleRate":96000,"bitDepth":24,"length":422,"code":1,"isLocked":true}],"hasFreeUploadSlot":false,"queueLength":4,"uploadSpeed":1639262,"token":14}]))],None,Duration::from_secs(1)).unwrap();
    let f = &r.results[0];
    assert_eq!(f.extension.as_deref(), Some("flac"));
    assert_eq!(f.sample_rate_hz, Some(96000));
    assert_eq!(f.bit_depth, Some(24));
    assert!(f.is_locked);
}
#[test]
fn query_validation_before_http() {
    let p = SlskdProvider::new(
        SlskdConfig::new(DEFAULT_ENDPOINT, SecretRef("ref".into())).unwrap(),
        &Vault,
    );
    for q in [
        String::new(),
        " ".into(),
        "a".repeat(MAX_QUERY + 1),
        "a\nb".into(),
        KEY.into(),
    ] {
        assert!(p.search(&q).is_err());
    }
}

#[test]
fn malformed_numeric_metadata() {
    for (field, value) in [
        ("size", serde_json::json!(-1)),
        ("bitRate", serde_json::json!("320")),
        ("sampleRate", serde_json::json!(-1)),
        ("length", serde_json::json!(1.5)),
    ] {
        let mut f = file("track");
        f[field] = value;
        assert!(run(
            200,
            vec![state(true, serde_json::json!([peer("a", vec![f])]))],
            None,
            Duration::from_secs(1)
        )
        .unwrap_err()
        .contains("malformed"));
    }
}

#[test]
fn search_backend_has_no_logging_calls() {
    let implementation = include_str!("slskd_search.rs");
    for logging in ["println!", "eprintln!", "dbg!", "log::", "tracing::"] {
        assert!(!implementation.contains(logging));
    }
}
