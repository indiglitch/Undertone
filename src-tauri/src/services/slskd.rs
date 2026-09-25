//! Optional desktop-only slskd adapter.
#[path = "slskd_search.rs"]
mod search;
pub use search::search_saved;
#[path = "slskd_download.rs"]
mod download;
pub use download::{cancel_download_saved, download_status_saved, start_download_saved};
#[path = "slskd_finalize.rs"]
mod finalize;
use crate::{
    database::Database,
    providers::{SecretRef, SecretStore},
};
pub use finalize::finalize_download_saved;
use serde::{Deserialize, Serialize};
use std::{
    io::Read,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    time::Duration,
};
use url::{Host, Url};
pub struct SlskdConfig {
    endpoint: Url,
    pub api_key: SecretRef,
}
impl SlskdConfig {
    pub fn new(endpoint: &str, api_key: SecretRef) -> Result<Self, String> {
        let url = Url::parse(endpoint).map_err(|_| "Некорректный URL slskd".to_string())?;
        let local = match url.host() {
            Some(Host::Domain("localhost")) => true,
            Some(Host::Ipv4(ip)) => ip.is_loopback(),
            Some(Host::Ipv6(ip)) => ip.is_loopback(),
            _ => false,
        };
        if !local
            || !matches!(url.scheme(), "http" | "https")
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err("slskd: разрешён только localhost HTTP(S), без секретов в URL".into());
        }
        Ok(Self {
            endpoint: url,
            api_key,
        })
    }
    pub fn endpoint(&self) -> &Url {
        &self.endpoint
    }
}

pub const DEFAULT_ENDPOINT: &str = "http://127.0.0.1:5030/";
#[derive(Serialize)]
pub struct Settings {
    pub server_url: String,
    pub has_api_key: bool,
    pub download_root: Option<String>,
}
pub fn settings(db: &Database, store: &dyn SecretStore) -> Result<Settings, String> {
    let c = db.connect()?;
    let row = c.query_row(
        "SELECT server_url,secret_ref,download_root FROM slskd_settings WHERE id=1",
        [],
        |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
            ))
        },
    );
    match row {
        Ok((server_url, key, download_root)) => Ok(Settings {
            server_url,
            has_api_key: store.get(&SecretRef(key))?.is_some(),
            download_root,
        }),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(Settings {
            server_url: DEFAULT_ENDPOINT.into(),
            has_api_key: false,
            download_root: None,
        }),
        Err(_) => Err("Не удалось прочитать настройки slskd".into()),
    }
}
pub fn save(
    db: &Database,
    store: &dyn SecretStore,
    endpoint: &str,
    key: Option<&str>,
) -> Result<Settings, String> {
    let validated = SlskdConfig::new(endpoint, SecretRef(String::new()))?;
    if let Some(k) = key {
        validate_key(k.as_bytes())
            .map_err(|_| "API key должен содержать 1–2560 печатных ASCII-символов".to_string())?;
    }
    let mut c = db.connect()?;
    let tx = c
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|_| "Настройки заняты")?;
    let old = tx.query_row(
        "SELECT secret_ref FROM slskd_settings WHERE id=1",
        [],
        |r| r.get::<_, String>(0),
    );
    let old = match old {
        Ok(v) => Some(v),
        Err(rusqlite::Error::QueryReturnedNoRows) => None,
        Err(_) => return Err("Не удалось прочитать настройки".into()),
    };
    let reference = if let Some(key) = key {
        let id: String = tx
            .query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))
            .map_err(|_| "Не удалось создать SecretRef")?;
        let reference = format!("Undertone/slskd/{id}");
        store.put(&SecretRef(reference.clone()), key.as_bytes())?;
        reference
    } else {
        old.clone().ok_or("Укажите API key")?
    };
    let persisted=tx.execute("INSERT INTO slskd_settings(id,server_url,secret_ref) VALUES(1,?1,?2) ON CONFLICT(id) DO UPDATE SET server_url=excluded.server_url,secret_ref=excluded.secret_ref",rusqlite::params![validated.endpoint().as_str(),reference])
        .and_then(|_|tx.commit());
    if persisted.is_err() {
        if key.is_some() {
            let _ = store.remove(&SecretRef(reference));
        }
        return Err("Не удалось сохранить настройки slskd".into());
    }
    if key.is_some() {
        if let Some(old) = old {
            store.remove(&SecretRef(old))?;
        }
    }
    settings(db, store)
}

pub fn save_download_root(db: &Database, root: Option<&str>) -> Result<(), String> {
    let canonical = match root.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => {
            let path = std::path::Path::new(value);
            if !path.is_absolute() {
                return Err("slskd download root должен быть абсолютным путём".into());
            }
            let canonical = path
                .canonicalize()
                .map_err(|_| "slskd download root недоступен")?;
            if !canonical.is_dir() {
                return Err("slskd download root не является папкой".into());
            }
            Some(canonical.to_string_lossy().into_owned())
        }
        None => None,
    };
    let changed = db
        .connect()?
        .execute(
            "UPDATE slskd_settings SET download_root=?1 WHERE id=1",
            [canonical],
        )
        .map_err(|_| "Не удалось сохранить slskd download root")?;
    if changed != 1 {
        return Err("Сначала сохраните подключение slskd".into());
    }
    Ok(())
}
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    NotConfigured,
    Connected,
    AuthenticationFailed,
    Unreachable,
}
#[derive(Debug, Serialize)]
pub struct Connection {
    pub status: Status,
    pub message: &'static str,
    pub server_connected: Option<bool>,
}
impl Connection {
    fn new(status: Status, message: &'static str) -> Self {
        Self {
            status,
            message,
            server_connected: None,
        }
    }
}
fn validate_key(bytes: &[u8]) -> Result<(), ()> {
    if bytes.is_empty() || bytes.len() > 2560 || !bytes.iter().all(|b| (33..=126).contains(b)) {
        Err(())
    } else {
        Ok(())
    }
}
pub struct SlskdProvider<'a> {
    config: SlskdConfig,
    secrets: &'a dyn SecretStore,
}
impl<'a> SlskdProvider<'a> {
    pub fn new(config: SlskdConfig, secrets: &'a dyn SecretStore) -> Self {
        Self { config, secrets }
    }
    pub fn check(&self) -> Result<Connection, String> {
        let Some(key) = self.secrets.get(&self.config.api_key)? else {
            return Ok(Connection::new(
                Status::NotConfigured,
                "API key не сохранён",
            ));
        };
        if validate_key(&key).is_err() {
            return Ok(Connection::new(
                Status::AuthenticationFailed,
                "Некорректный API key",
            ));
        }
        let mut header =
            reqwest::header::HeaderValue::from_bytes(&key).map_err(|_| "Некорректный API key")?;
        header.set_sensitive(true);
        // Pin localhost without DNS, disable proxies and redirects (including loopback redirects).
        let client = reqwest::blocking::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .resolve(
                "localhost",
                SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 0),
            )
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(4))
            .build()
            .map_err(|_| "Не удалось создать локальный HTTP client")?;
        let mut url = self.config.endpoint().clone();
        let path = format!("{}/api/v0/application", url.path().trim_end_matches('/'));
        url.set_path(&path);
        let response = match client
            .get(url)
            .header("X-API-Key", header)
            .header("Accept", "application/json")
            .send()
        {
            Ok(r) => r,
            Err(_) => {
                return Ok(Connection::new(
                    Status::Unreachable,
                    "slskd недоступен или TLS не прошёл проверку",
                ))
            }
        };
        if matches!(response.status().as_u16(), 401 | 403) {
            return Ok(Connection::new(
                Status::AuthenticationFailed,
                "slskd отклонил API key",
            ));
        }
        if !response.status().is_success() {
            return Ok(Connection::new(
                Status::Unreachable,
                "slskd вернул ошибку HTTP или redirect",
            ));
        }
        let mut bytes = Vec::new();
        if response.take(65537).read_to_end(&mut bytes).is_err() || bytes.len() > 65536 {
            return Ok(Connection::new(
                Status::Unreachable,
                "Некорректный или слишком большой ответ slskd",
            ));
        }
        #[derive(Deserialize)]
        struct Application {
            version: Version,
            server: Server,
        }
        #[derive(Deserialize)]
        struct Version {
            current: String,
        }
        #[derive(Deserialize)]
        struct Server {
            #[serde(rename = "isConnected")]
            connected: bool,
        }
        match serde_json::from_slice::<Application>(&bytes) {
            Ok(state)
                if !state.version.current.is_empty() && state.version.current.len() <= 128 =>
            {
                Ok(Connection {
                    status: Status::Connected,
                    message: "slskd доступен; API key принят",
                    server_connected: Some(state.server.connected),
                })
            }
            _ => Ok(Connection::new(
                Status::Unreachable,
                "Ответ не соответствует API slskd",
            )),
        }
    }
}
pub fn check_saved(db: &Database, store: &dyn SecretStore) -> Result<Connection, String> {
    let c = db.connect()?;
    let row = c.query_row(
        "SELECT server_url,secret_ref FROM slskd_settings WHERE id=1",
        [],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
    );
    let (url, key) = match row {
        Ok(r) => r,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            return Ok(Connection::new(
                Status::NotConfigured,
                "Сначала сохраните подключение",
            ))
        }
        Err(_) => return Err("Не удалось прочитать настройки slskd".into()),
    };
    SlskdProvider::new(SlskdConfig::new(&url, SecretRef(key))?, store).check()
}

#[cfg(test)]
#[path = "slskd_tests.rs"]
mod connection_tests;
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn endpoint_is_local_and_contains_no_secret() {
        for url in [
            "http://localhost:5030/",
            "http://127.0.0.1:5030/",
            "http://[::1]:5030/",
        ] {
            assert!(SlskdConfig::new(url, SecretRef("slskd/api-key".into())).is_ok());
        }
        for url in [
            "https://example.com/",
            "http://localhost.evil/",
            "http://user:password@localhost/",
            "file:///tmp/",
            "http://localhost/?key=secret",
            "http://192.168.1.2/",
        ] {
            assert!(SlskdConfig::new(url, SecretRef("key".into())).is_err());
        }
    }
}
