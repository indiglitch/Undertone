//! API contract: slskd/slskd src/slskd/Search/{API,Types} (2026-09-09).
use super::*;
use crate::providers::{
    SearchCompletion, SearchProvider, SearchSource, SoulseekSearchResult, SoulseekSearchResults,
};
use reqwest::{blocking::Client, Method};
use std::{collections::HashSet, time::Instant};

const MAX_QUERY: usize = 256;
const MAX_RESULTS: usize = 500;
const MAX_RESPONSE: u64 = 2 * 1024 * 1024;
const SEARCH_DURATION: Duration = Duration::from_secs(20);
const POLL_INTERVAL: Duration = Duration::from_millis(500);
const SLSKD_SEARCH_TIMEOUT_MS: u64 = 8_000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Search {
    id: String,
    is_complete: bool,
    responses: Vec<Peer>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Peer {
    username: String,
    files: Vec<File>,
    #[serde(default)]
    locked_files: Vec<File>,
    has_free_upload_slot: Option<bool>,
    queue_length: Option<u64>,
    upload_speed: Option<u32>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct File {
    filename: String,
    size: u64,
    extension: Option<String>,
    bit_rate: Option<u32>,
    sample_rate: Option<u32>,
    bit_depth: Option<u32>,
    length: Option<u32>,
    #[serde(default)]
    is_locked: bool,
}

fn extension(file: &File) -> Option<String> {
    file.extension
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_lowercase)
        .or_else(|| {
            file.filename
                .rsplit(['\\', '/'])
                .next()?
                .rsplit_once('.')
                .map(|(_, ext)| ext.to_lowercase())
                .filter(|ext| !ext.is_empty() && ext.len() <= 32)
        })
}

fn request(
    client: &Client,
    header: &reqwest::header::HeaderValue,
    method: Method,
    url: Url,
    body: Option<String>,
    deadline: Instant,
) -> Result<Vec<u8>, String> {
    let remaining = deadline
        .checked_duration_since(Instant::now())
        .ok_or("slskd: search timeout")?;
    let mut req = client
        .request(method, url)
        .header("X-API-Key", header.clone())
        .header("Accept", "application/json")
        .timeout(remaining.min(Duration::from_secs(4)));
    if let Some(body) = body {
        req = req.header("Content-Type", "application/json").body(body);
    }
    let response = req.send().map_err(|e| {
        if e.is_timeout() {
            "slskd: search timeout"
        } else {
            "slskd: request failed"
        }
    })?;
    if matches!(response.status().as_u16(), 401 | 403) {
        return Err("slskd: authentication failed".into());
    }
    if !response.status().is_success() {
        return Err("slskd: HTTP error or redirect".into());
    }
    if response.content_length().is_some_and(|n| n > MAX_RESPONSE) {
        return Err("slskd: response too large".into());
    }
    let mut bytes = Vec::new();
    response
        .take(MAX_RESPONSE + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "slskd: response read failed")?;
    if bytes.len() as u64 > MAX_RESPONSE {
        return Err("slskd: response too large".into());
    }
    Ok(bytes)
}
fn valid_text(text: &str, max: usize, key: &str) -> bool {
    !text.is_empty()
        && text.len() <= max
        && !text.chars().any(char::is_control)
        && !text.contains(key)
}
fn parse(bytes: &[u8], id: &str) -> Result<Search, String> {
    let state: Search =
        serde_json::from_slice(bytes).map_err(|_| "slskd: malformed search response")?;
    if state.id != id {
        return Err("slskd: mismatched search id".into());
    }
    Ok(state)
}
impl SearchProvider for SlskdProvider<'_> {
    fn search(&self, query: &str) -> Result<SoulseekSearchResults, String> {
        self.search_bounded(query, SEARCH_DURATION, POLL_INTERVAL)
    }
}
impl SlskdProvider<'_> {
    fn search_bounded(
        &self,
        query: &str,
        duration: Duration,
        interval: Duration,
    ) -> Result<SoulseekSearchResults, String> {
        if query.len() > MAX_QUERY || query.trim().is_empty() || query.chars().any(char::is_control)
        {
            return Err(
                "slskd: query must contain 1–256 UTF-8 bytes without control characters".into(),
            );
        }
        let key = self
            .secrets
            .get(&self.config.api_key)
            .map_err(|_| "slskd: credential unavailable")?
            .ok_or("slskd: API key not configured")?;
        validate_key(&key).map_err(|_| "slskd: invalid API key")?;
        let key_text = std::str::from_utf8(&key).map_err(|_| "slskd: invalid API key")?;
        if query.contains(key_text) {
            return Err("slskd: query contains credential".into());
        }
        let mut header =
            reqwest::header::HeaderValue::from_bytes(&key).map_err(|_| "slskd: invalid API key")?;
        header.set_sensitive(true);
        let client = Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .resolve(
                "localhost",
                SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 0),
            )
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(4))
            .build()
            .map_err(|_| "slskd: client unavailable")?;
        // Client-owned GUID allows cleanup even after a lost/malformed POST response.
        // Existing SHA-256 dependency avoids a UUID dependency; this ID is not a security token.
        use sha2::{Digest, Sha256};
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let seed = format!(
            "{:?}-{}-{}",
            std::time::SystemTime::now(),
            std::process::id(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        );
        let hex = format!("{:x}", Sha256::digest(seed.as_bytes()));
        let id = format!(
            "{}-{}-{}-{}-{}",
            &hex[..8],
            &hex[8..12],
            &hex[12..16],
            &hex[16..20],
            &hex[20..32]
        );
        let mut url = self.config.endpoint().clone();
        url.set_path(&format!(
            "{}/api/v0/searches",
            url.path().trim_end_matches('/')
        ));
        let mut item = url.clone();
        item.set_path(&format!("{}/{id}", url.path()));
        let deadline = Instant::now() + duration;
        let mut results = Vec::new();
        let mut seen = HashSet::new();
        let outcome: Result<SearchCompletion, String> = (|| {
            let body = serde_json::json!({"id": id, "searchText": query.trim(), "fileLimit": MAX_RESULTS, "responseLimit": MAX_RESULTS, "searchTimeout": SLSKD_SEARCH_TIMEOUT_MS}).to_string();
            let bytes = request(&client, &header, Method::POST, url, Some(body), deadline)?;
            // POST state does not necessarily include accumulated responses. Always GET once.
            parse(&bytes, &id)?;
            loop {
                if Instant::now() >= deadline {
                    return Ok(SearchCompletion::TimedOut);
                }
                let mut poll = item.clone();
                poll.set_query(Some("includeResponses=true"));
                let bytes = match request(&client, &header, Method::GET, poll, None, deadline) {
                    Err(_) if Instant::now() >= deadline => return Ok(SearchCompletion::TimedOut),
                    value => value?,
                };
                let state = parse(&bytes, &id)?;
                for peer in state.responses {
                    if !valid_text(&peer.username, 256, key_text) {
                        return Err("slskd: unsafe remote string".into());
                    }
                    for (file, locked) in peer
                        .files
                        .into_iter()
                        .map(|f| (f, false))
                        .chain(peer.locked_files.into_iter().map(|f| (f, true)))
                    {
                        if !valid_text(&file.filename, 4096, key_text)
                            || file
                                .extension
                                .as_ref()
                                .is_some_and(|s| !s.is_empty() && !valid_text(s, 32, key_text))
                        {
                            return Err("slskd: unsafe remote string".into());
                        }
                        if !seen.insert((peer.username.clone(), file.filename.clone())) {
                            continue;
                        }
                        let extension = extension(&file);
                        results.push(SoulseekSearchResult {
                            source: SearchSource::Soulseek,
                            search_id: id.clone(),
                            username: peer.username.clone(),
                            remote_path: file.filename,
                            size_bytes: file.size,
                            extension,
                            bitrate_kbps: file.bit_rate,
                            sample_rate_hz: file.sample_rate,
                            bit_depth: file.bit_depth,
                            duration_seconds: file.length,
                            has_free_upload_slot: peer.has_free_upload_slot,
                            queue_length: peer.queue_length,
                            upload_speed_bytes_per_second: peer.upload_speed,
                            is_locked: locked || file.is_locked,
                        });
                        if results.len() >= MAX_RESULTS {
                            return Ok(SearchCompletion::ResultLimit);
                        }
                    }
                }
                if state.is_complete {
                    return Ok(SearchCompletion::Complete);
                }
                std::thread::sleep(
                    interval.min(deadline.saturating_duration_since(Instant::now())),
                );
            }
        })();
        // At most two extra seconds for cleanup; never poll cleanup indefinitely.
        let cleanup_deadline = Instant::now() + Duration::from_secs(2);
        let cancel = request(
            &client,
            &header,
            Method::PUT,
            item.clone(),
            None,
            Instant::now() + Duration::from_secs(1),
        );
        let delete = request(
            &client,
            &header,
            Method::DELETE,
            item,
            None,
            cleanup_deadline,
        );
        let completion = outcome?;
        Ok(SoulseekSearchResults {
            search_id: id,
            completion,
            results,
            cleanup_succeeded: cancel.is_ok() && delete.is_ok(),
        })
    }
}

pub fn search_saved(
    db: &Database,
    store: &dyn SecretStore,
    query: &str,
) -> Result<SoulseekSearchResults, String> {
    let c = db.connect().map_err(|_| "slskd: settings unavailable")?;
    let (url, key): (String, String) = c
        .query_row(
            "SELECT server_url,secret_ref FROM slskd_settings WHERE id=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "slskd: connection not configured")?;
    SlskdProvider::new(SlskdConfig::new(&url, SecretRef(key))?, store).search(query)
}

#[cfg(test)]
#[path = "slskd_search_tests.rs"]
mod tests;
