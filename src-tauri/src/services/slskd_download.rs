use super::{validate_key, SlskdConfig, SlskdProvider};
use crate::{
    database::Database,
    providers::{
        DownloadProvider, DownloadState, DownloadStatus, SecretRef, SecretStore,
        SoulseekDownloadRequest,
    },
};
use reqwest::blocking::Client;
use reqwest::{Method, StatusCode, Url};
use serde::Deserialize;
use std::{io::Read, time::Duration};

const MAX_RESPONSE: u64 = 2 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchResponse {
    batch: Batch,
}
#[derive(Deserialize)]
#[serde(untagged)]
enum BatchPayload {
    Enqueue(BatchResponse),
    Status(Batch),
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Batch {
    id: String,
    username: String,
    transfers: Option<Vec<Transfer>>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Transfer {
    id: String,
    username: String,
    filename: String,
    size: i64,
    state: String,
    bytes_transferred: i64,
    average_speed: f64,
}

fn guid() -> String {
    use sha2::{Digest, Sha256};
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let seed = format!(
        "{:?}-{}-{}",
        std::time::SystemTime::now(),
        std::process::id(),
        NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    );
    let hex = format!("{:x}", Sha256::digest(seed.as_bytes()));
    format!(
        "{}-{}-{}-{}-{}",
        &hex[..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    )
}
fn valid_guid(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
}
fn validate_request(request: &SoulseekDownloadRequest) -> Result<(), String> {
    if request.username.trim().is_empty()
        || request.username.len() > 500
        || request.username.chars().any(char::is_control)
    {
        return Err("slskd: invalid download username".into());
    }
    if request.remote_path.is_empty()
        || request.remote_path.len() > 4096
        || request.remote_path.chars().any(char::is_control)
    {
        return Err("slskd: invalid remote path".into());
    }
    if request
        .remote_path
        .split(['\\', '/'])
        .any(|part| part == "..")
    {
        return Err("slskd: unsafe remote path".into());
    }
    if request.size_bytes > i64::MAX as u64 {
        return Err("slskd: invalid download size".into());
    }
    Ok(())
}
fn endpoint(config: &SlskdConfig, segments: &[&str]) -> Result<Url, String> {
    let mut url = config.endpoint().clone();
    url.set_query(None);
    url.set_fragment(None);
    let mut path = url
        .path_segments_mut()
        .map_err(|_| "slskd: invalid endpoint")?;
    path.pop_if_empty();
    for segment in segments {
        path.push(segment);
    }
    drop(path);
    Ok(url)
}
fn client() -> Result<Client, String> {
    Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|_| "slskd: client unavailable".into())
}
fn call(
    provider: &SlskdProvider<'_>,
    method: Method,
    url: Url,
    body: Option<String>,
) -> Result<(StatusCode, Vec<u8>), String> {
    let key = provider
        .secrets
        .get(&provider.config.api_key)
        .map_err(|_| "slskd: credential unavailable")?
        .ok_or("slskd: API key not configured")?;
    validate_key(&key).map_err(|_| "slskd: invalid API key")?;
    let mut header =
        reqwest::header::HeaderValue::from_bytes(&key).map_err(|_| "slskd: invalid API key")?;
    header.set_sensitive(true);
    let mut request = client()?
        .request(method, url)
        .header("X-API-Key", header)
        .header("Accept", "application/json");
    if let Some(body) = body {
        request = request
            .header("Content-Type", "application/json")
            .body(body);
    }
    let response = request.send().map_err(|error| {
        if error.is_connect() {
            "slskd: unreachable"
        } else if error.is_timeout() {
            "slskd: download timeout"
        } else {
            "slskd: unreachable"
        }
    })?;
    let status = response.status();
    if matches!(status.as_u16(), 401 | 403) {
        return Err("slskd: authentication failed".into());
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE)
    {
        return Err("slskd: download response too large".into());
    }
    let mut bytes = Vec::new();
    response
        .take(MAX_RESPONSE + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "slskd: download response read failed")?;
    if bytes.len() as u64 > MAX_RESPONSE {
        return Err("slskd: download response too large".into());
    }
    Ok((status, bytes))
}
fn batch(bytes: &[u8]) -> Result<Batch, String> {
    serde_json::from_slice::<BatchPayload>(bytes)
        .map(|response| match response {
            BatchPayload::Enqueue(response) => response.batch,
            BatchPayload::Status(batch) => batch,
        })
        .map_err(|_| "slskd: malformed download response".into())
}
fn state(value: &str) -> Result<DownloadState, String> {
    let value = value.to_ascii_lowercase();
    if value.contains("succeeded") {
        Ok(DownloadState::Completed)
    } else if value.contains("cancelled") {
        Ok(DownloadState::Cancelled)
    } else if value.contains("completed")
        || value.contains("errored")
        || value.contains("timedout")
        || value.contains("rejected")
        || value.contains("aborted")
    {
        Ok(DownloadState::Failed)
    } else if value.contains("inprogress") || value.contains("initializing") {
        Ok(DownloadState::Downloading)
    } else if value == "none" || value.contains("requested") || value.contains("queued") {
        Ok(DownloadState::Queued)
    } else {
        Err("slskd: unknown download state".into())
    }
}
fn normalize(operation_id: &str, batch: Batch) -> Result<DownloadStatus, String> {
    if batch.id != operation_id || batch.username.trim().is_empty() {
        return Err("slskd: mismatched download response".into());
    }
    let mut transfers = batch
        .transfers
        .ok_or("slskd: malformed download response")?;
    if transfers.len() != 1 {
        return Err("slskd: download was not enqueued".into());
    }
    let transfer = transfers.remove(0);
    if !valid_guid(&transfer.id)
        || transfer.username != batch.username
        || transfer.size < 0
        || transfer.bytes_transferred < 0
        || !transfer.average_speed.is_finite()
        || transfer.average_speed < 0.0
    {
        return Err("slskd: malformed download response".into());
    }
    let total = transfer.size as u64;
    let downloaded = transfer.bytes_transferred as u64;
    let remaining = total.saturating_sub(downloaded);
    let speed = transfer.average_speed;
    Ok(DownloadStatus {
        operation_id: operation_id.into(),
        transfer_id: transfer.id,
        state: state(&transfer.state)?,
        downloaded_bytes: downloaded,
        total_bytes: total,
        progress: if total == 0 {
            0.0
        } else {
            (downloaded as f64 / total as f64).clamp(0.0, 1.0)
        },
        speed_bytes_per_second: speed,
        eta_seconds: (speed > 0.0).then(|| (remaining as f64 / speed).ceil() as u64),
        source_username: transfer.username,
        remote_path: transfer.filename,
        local_path: None,
    })
}

impl DownloadProvider for SlskdProvider<'_> {
    fn start_download(&self, request: SoulseekDownloadRequest) -> Result<DownloadStatus, String> {
        validate_request(&request)?;
        let operation_id = guid();
        let body=serde_json::json!({"id":operation_id,"username":&request.username,"files":[{"filename":&request.remote_path,"size":request.size_bytes}]}).to_string();
        let url = endpoint(
            &self.config,
            &["api", "v0", "transfers", "downloads", "batches"],
        )?;
        let (status, bytes) = call(self, Method::POST, url, Some(body))?;
        if !matches!(status.as_u16(), 200 | 201 | 207) {
            return Err("slskd: download start failed".into());
        }
        let status = normalize(&operation_id, batch(&bytes)?)?;
        if status.source_username != request.username
            || status.remote_path != request.remote_path
            || status.total_bytes != request.size_bytes
        {
            return Err("slskd: mismatched download response".into());
        }
        Ok(status)
    }
    fn download_status(&self, operation_id: &str) -> Result<DownloadStatus, String> {
        if !valid_guid(operation_id) {
            return Err("slskd: invalid download operation ID".into());
        }
        let url = endpoint(
            &self.config,
            &[
                "api",
                "v0",
                "transfers",
                "downloads",
                "batches",
                operation_id,
            ],
        )?;
        let (status, bytes) = call(self, Method::GET, url, None)?;
        if status == StatusCode::NOT_FOUND {
            return Err("slskd: download not found".into());
        }
        if !status.is_success() {
            return Err("slskd: download status failed".into());
        }
        normalize(operation_id, batch(&bytes)?)
    }
    fn cancel_download(&self, operation_id: &str) -> Result<DownloadStatus, String> {
        let current = self.download_status(operation_id)?;
        let url = endpoint(
            &self.config,
            &[
                "api",
                "v0",
                "transfers",
                "downloads",
                &current.source_username,
                &current.transfer_id,
            ],
        )?;
        let (status, _) = call(self, Method::DELETE, url, None)?;
        if !status.is_success() {
            return Err("slskd: download cancel failed".into());
        }
        self.download_status(operation_id)
    }
}

fn provider<'a>(db: &Database, store: &'a dyn SecretStore) -> Result<SlskdProvider<'a>, String> {
    let connection = db.connect().map_err(|_| "slskd: settings unavailable")?;
    let (url, key) = connection
        .query_row(
            "SELECT server_url,secret_ref FROM slskd_settings WHERE id=1",
            [],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|_| "slskd: connection not configured")?;
    Ok(SlskdProvider::new(
        SlskdConfig::new(&url, SecretRef(key))?,
        store,
    ))
}
pub fn start_download_saved(
    db: &Database,
    store: &dyn SecretStore,
    request: SoulseekDownloadRequest,
) -> Result<DownloadStatus, String> {
    provider(db, store)?.start_download(request)
}
pub fn download_status_saved(
    db: &Database,
    store: &dyn SecretStore,
    operation_id: &str,
) -> Result<DownloadStatus, String> {
    provider(db, store)?.download_status(operation_id)
}
pub fn cancel_download_saved(
    db: &Database,
    store: &dyn SecretStore,
    operation_id: &str,
) -> Result<DownloadStatus, String> {
    provider(db, store)?.cancel_download(operation_id)
}

#[cfg(test)]
#[path = "slskd_download_tests.rs"]
mod tests;
