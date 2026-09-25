use super::*;
use crate::providers::DownloadProvider;
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    thread,
};

const KEY: &str = "download-test-secret-never-expose";
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
static VAULT: Vault = Vault;
struct Request {
    method: String,
    path: String,
    headers: String,
    body: serde_json::Value,
}
fn read_request(mut stream: &TcpStream) -> Request {
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    let mut bytes = Vec::new();
    let mut buffer = [0; 4096];
    let header_end = loop {
        let count = stream.read(&mut buffer).unwrap();
        assert!(count > 0);
        bytes.extend_from_slice(&buffer[..count]);
        if let Some(index) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
            break index + 4;
        }
    };
    let headers = String::from_utf8(bytes[..header_end].to_vec()).unwrap();
    let length = headers
        .lines()
        .find_map(|line| {
            line.to_ascii_lowercase()
                .strip_prefix("content-length: ")
                .and_then(|value| value.parse::<usize>().ok())
        })
        .unwrap_or(0);
    while bytes.len() < header_end + length {
        let count = stream.read(&mut buffer).unwrap();
        assert!(count > 0);
        bytes.extend_from_slice(&buffer[..count]);
    }
    let first = headers
        .lines()
        .next()
        .unwrap()
        .split_whitespace()
        .collect::<Vec<_>>();
    Request {
        method: first[0].into(),
        path: first[1].into(),
        headers,
        body: if length == 0 {
            serde_json::Value::Null
        } else {
            serde_json::from_slice(&bytes[header_end..header_end + length]).unwrap()
        },
    }
}
fn respond(mut stream: TcpStream, status: u16, body: serde_json::Value) {
    let text = if body.is_null() {
        String::new()
    } else {
        body.to_string()
    };
    write!(
        stream,
        "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{text}",
        text.len()
    )
    .unwrap();
    stream.flush().unwrap();
}
fn listener() -> (TcpListener, String) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!(
        "http://127.0.0.1:{}/",
        listener.local_addr().unwrap().port()
    );
    (listener, url)
}
fn provider(url: &str) -> SlskdProvider<'static> {
    SlskdProvider::new(
        SlskdConfig::new(url, SecretRef("Undertone/slskd/test".into())).unwrap(),
        &VAULT,
    )
}
fn input(path: &str) -> SoulseekDownloadRequest {
    SoulseekDownloadRequest {
        username: "alice".into(),
        remote_path: path.into(),
        size_bytes: 1000,
    }
}
fn transfer(operation: &str, state: &str, downloaded: u64) -> serde_json::Value {
    serde_json::json!({"batch":{"id":operation,"username":"alice","transfers":[{"id":"11111111-1111-1111-1111-111111111111","username":"alice","filename":"music\\track.flac","size":1000,"state":state,"bytesTransferred":downloaded,"averageSpeed":100.0}]},"failures":[]})
}
fn status(operation: &str, state: &str, downloaded: u64) -> serde_json::Value {
    transfer(operation, state, downloaded)["batch"].clone()
}

#[test]
fn successful_start_uses_batch_without_destination() {
    let (listener, url) = listener();
    let worker = thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        let request = read_request(&stream);
        assert_eq!(request.method, "POST");
        assert_eq!(request.path, "/api/v0/transfers/downloads/batches");
        assert!(request
            .headers
            .lines()
            .any(|line| line.eq_ignore_ascii_case(&format!("x-api-key: {KEY}"))));
        assert_eq!(request.body["username"], "alice");
        assert_eq!(
            request.body["files"][0],
            serde_json::json!({"filename":"music\\track.flac","size":1000})
        );
        assert!(request.body.get("destination").is_none() && request.body.get("options").is_none());
        let id = request.body["id"].as_str().unwrap();
        respond(stream, 201, transfer(id, "Requested", 0));
    });
    let status = provider(&url)
        .start_download(input("music\\track.flac"))
        .unwrap();
    worker.join().unwrap();
    assert_eq!(status.state, DownloadState::Queued);
    assert!(valid_guid(&status.operation_id));
    assert_eq!(status.transfer_id, "11111111-1111-1111-1111-111111111111");
    assert!(status.local_path.is_none());
}

#[test]
fn queued_downloading_completed_status() {
    let operation = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    let (listener, url) = listener();
    let worker = thread::spawn(move || {
        for (state, bytes) in [
            ("Queued, Remotely", 0),
            ("InProgress", 400),
            ("Completed, Succeeded", 1000),
        ] {
            let (stream, _) = listener.accept().unwrap();
            let request = read_request(&stream);
            assert_eq!(
                request.path,
                format!("/api/v0/transfers/downloads/batches/{operation}")
            );
            respond(stream, 200, status(operation, state, bytes));
        }
    });
    let provider = provider(&url);
    let queued = provider.download_status(operation).unwrap();
    let active = provider.download_status(operation).unwrap();
    let done = provider.download_status(operation).unwrap();
    worker.join().unwrap();
    assert_eq!(queued.state, DownloadState::Queued);
    assert_eq!(active.state, DownloadState::Downloading);
    assert_eq!(active.downloaded_bytes, 400);
    assert_eq!(active.progress, 0.4);
    assert_eq!(active.eta_seconds, Some(6));
    assert_eq!(done.state, DownloadState::Completed);
    assert_eq!(done.progress, 1.0);
}

#[test]
fn cancel_then_reports_cancelled() {
    let operation = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    let (listener, url) = listener();
    let worker = thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        read_request(&stream);
        respond(stream, 200, status(operation, "InProgress", 100));
        let (stream, _) = listener.accept().unwrap();
        let request = read_request(&stream);
        assert_eq!(request.method, "DELETE");
        assert_eq!(
            request.path,
            "/api/v0/transfers/downloads/alice/11111111-1111-1111-1111-111111111111"
        );
        respond(stream, 204, serde_json::Value::Null);
        let (stream, _) = listener.accept().unwrap();
        read_request(&stream);
        respond(stream, 200, status(operation, "Completed, Cancelled", 100));
    });
    let status = provider(&url).cancel_download(operation).unwrap();
    worker.join().unwrap();
    assert_eq!(status.state, DownloadState::Cancelled);
}

#[test]
fn transfer_failure_is_normalized() {
    let operation = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    let (listener, url) = listener();
    let worker = thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        read_request(&stream);
        respond(stream, 200, status(operation, "Completed, Errored", 200));
    });
    let status = provider(&url).download_status(operation).unwrap();
    worker.join().unwrap();
    assert_eq!(status.state, DownloadState::Failed);
}

#[test]
fn authentication_failure() {
    let (listener, url) = listener();
    let worker = thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        read_request(&stream);
        respond(stream, 401, serde_json::Value::Null);
    });
    let error = provider(&url)
        .start_download(input("track.flac"))
        .unwrap_err();
    worker.join().unwrap();
    assert_eq!(error, "slskd: authentication failed");
    assert!(!error.contains(KEY));
}

#[test]
fn unreachable_slskd() {
    let (listener, url) = listener();
    drop(listener);
    assert_eq!(
        provider(&url)
            .start_download(input("track.flac"))
            .unwrap_err(),
        "slskd: unreachable"
    );
}

#[test]
fn malformed_response() {
    let (listener, url) = listener();
    let worker = thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        read_request(&stream);
        respond(stream, 201, serde_json::json!({"unexpected":true}));
    });
    assert_eq!(
        provider(&url)
            .start_download(input("track.flac"))
            .unwrap_err(),
        "slskd: malformed download response"
    );
    worker.join().unwrap();
}

#[test]
fn remote_paths_never_become_local_destinations() {
    assert_eq!(
        provider("http://127.0.0.1:1/")
            .start_download(input("../escape.flac"))
            .unwrap_err(),
        "slskd: unsafe remote path"
    );
    let remote = "C:\\чужая музыка\\奇妙 ✨.flac";
    let (listener, url) = listener();
    let expected = remote.to_string();
    let worker = thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        let request = read_request(&stream);
        assert_eq!(request.body["files"][0]["filename"], expected);
        assert!(request
            .body
            .to_string()
            .to_ascii_lowercase()
            .find("destination")
            .is_none());
        let id = request.body["id"].as_str().unwrap();
        let mut response = transfer(id, "Requested", 0);
        response["batch"]["transfers"][0]["filename"] = expected.into();
        respond(stream, 201, response);
    });
    let status = provider(&url).start_download(input(remote)).unwrap();
    worker.join().unwrap();
    assert_eq!(status.remote_path, remote);
    assert!(status.local_path.is_none());
    assert!(!include_str!("slskd_download.rs").contains("std::fs"));
}

#[test]
fn concurrent_identical_actions_have_distinct_operation_ids() {
    let (listener, url) = listener();
    let worker = thread::spawn(move || {
        for _ in 0..2 {
            let (stream, _) = listener.accept().unwrap();
            let request = read_request(&stream);
            let id = request.body["id"].as_str().unwrap();
            let mut response = transfer(id, "Requested", 0);
            response["batch"]["transfers"][0]["filename"] =
                request.body["files"][0]["filename"].clone();
            respond(stream, 201, response);
        }
    });
    let a = url.clone();
    let b = url;
    let first = thread::spawn(move || provider(&a).start_download(input("same.flac")).unwrap());
    let second = thread::spawn(move || provider(&b).start_download(input("same.flac")).unwrap());
    let first = first.join().unwrap();
    let second = second.join().unwrap();
    worker.join().unwrap();
    assert_ne!(first.operation_id, second.operation_id);
}

#[test]
fn api_key_never_reaches_errors_or_logging() {
    let (listener, url) = listener();
    let worker = thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        read_request(&stream);
        respond(stream, 500, serde_json::json!({"secret":KEY}));
    });
    let error = provider(&url)
        .start_download(input("track.flac"))
        .unwrap_err();
    worker.join().unwrap();
    assert!(!error.contains(KEY));
    let source = include_str!("slskd_download.rs");
    for logging in ["println!", "eprintln!", "dbg!", "log::", "tracing::"] {
        assert!(!source.contains(logging));
    }
}
