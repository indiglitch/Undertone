use super::*;
use std::{
    collections::HashMap,
    io::{Read, Write},
    net::TcpListener,
    sync::Mutex,
    thread,
};
const KEY: &str = "test-only-secret-do-not-log-0123456789";
#[derive(Default)]
struct Vault(Mutex<HashMap<String, Vec<u8>>>);
impl SecretStore for Vault {
    fn get(&self, k: &SecretRef) -> Result<Option<Vec<u8>>, String> {
        Ok(self.0.lock().unwrap().get(&k.0).cloned())
    }
    fn put(&self, k: &SecretRef, v: &[u8]) -> Result<(), String> {
        self.0.lock().unwrap().insert(k.0.clone(), v.to_vec());
        Ok(())
    }
    fn remove(&self, k: &SecretRef) -> Result<(), String> {
        self.0.lock().unwrap().remove(&k.0);
        Ok(())
    }
}
fn server(code: u16, body: &str, extra: &str) -> (String, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let response=format!("HTTP/1.1 {code} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n{extra}\r\n{body}",body.len());
    let thread = thread::spawn(move || {
        listener.set_nonblocking(true).unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(6);
        let mut stream = loop {
            match listener.accept() {
                Ok((s, _)) => break s,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    assert!(
                        std::time::Instant::now() < deadline,
                        "Client did not connect"
                    );
                    thread::sleep(Duration::from_millis(10));
                }
                Err(_) => panic!("Mock accept failed"),
            }
        };
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let mut bytes = Vec::new();
        let mut b = [0; 1024];
        while !bytes.windows(4).any(|w| w == b"\r\n\r\n") {
            let n = stream.read(&mut b).unwrap();
            assert!(n > 0 && bytes.len() < 8192);
            bytes.extend_from_slice(&b[..n]);
        }
        let request = String::from_utf8(bytes).unwrap();
        assert!(request.starts_with("GET /api/v0/application HTTP/1.1\r\n"));
        assert!(request
            .lines()
            .any(|s| s.eq_ignore_ascii_case(&format!("x-api-key: {KEY}"))));
        stream.write_all(response.as_bytes()).unwrap();
    });
    (format!("http://localhost:{port}"), thread)
}
fn check(url: &str) -> Connection {
    let vault = Vault::default();
    let reference = SecretRef("Undertone/slskd/test".into());
    vault.put(&reference, KEY.as_bytes()).unwrap();
    SlskdProvider::new(SlskdConfig::new(url, reference).unwrap(), &vault)
        .check()
        .unwrap()
}
#[test]
fn connection_success_and_authentication_failures() {
    let (url, t) = server(
        200,
        r#"{"version":{"current":"0.24.0"},"server":{"isConnected":false}}"#,
        " ".trim(),
    );
    let result = check(&url);
    assert_eq!(result.status, Status::Connected);
    assert_eq!(result.server_connected, Some(false));
    t.join().unwrap();
    for code in [401, 403] {
        let (url, t) = server(code, KEY, "");
        let result = check(&url);
        assert_eq!(result.status, Status::AuthenticationFailed);
        assert!(!serde_json::to_string(&result).unwrap().contains(KEY));
        t.join().unwrap();
    }
}
#[test]
fn unreachable_malformed_and_redirect_are_safe() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    drop(listener);
    assert_eq!(check(&url).status, Status::Unreachable);
    for body in [
        "not json",
        "{}",
        r#"{"version":{"current":"x"},"server":{"isConnected":"yes"}}"#,
        KEY,
    ] {
        let (url, t) = server(200, body, "");
        let result = check(&url);
        assert_eq!(result.status, Status::Unreachable);
        assert!(!format!("{result:?}").contains(KEY));
        t.join().unwrap();
    }
    let (url, t) = server(302, "", "Location: http://192.0.2.1/\r\n");
    assert_eq!(check(&url).status, Status::Unreachable);
    t.join().unwrap();
    let (url, t) = server(200, &"x".repeat(65537), "");
    assert_eq!(check(&url).status, Status::Unreachable);
    t.join().unwrap();
}
#[test]
fn settings_hold_only_reference_and_replace_credentials() {
    let root = std::env::temp_dir().join(format!(
        "undertone-slskd-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let db = Database::open(&root).unwrap();
    let vault = Vault::default();
    assert_eq!(
        check_saved(&db, &vault).unwrap().status,
        Status::NotConfigured
    );
    assert!(!settings(&db, &vault).unwrap().has_api_key);
    assert!(save(&db, &vault, "http://192.0.2.1", Some(KEY)).is_err());
    assert!(vault.0.lock().unwrap().is_empty());
    assert!(save(&db, &vault, DEFAULT_ENDPOINT, Some("bad\r\nkey")).is_err());
    let s = save(&db, &vault, DEFAULT_ENDPOINT, Some(KEY)).unwrap();
    assert!(s.has_api_key);
    assert!(!serde_json::to_string(&s).unwrap().contains(KEY));
    let c = db.connect().unwrap();
    let old: String = c
        .query_row("SELECT secret_ref FROM slskd_settings", [], |r| r.get(0))
        .unwrap();
    assert!(old.starts_with("Undertone/slskd/"));
    assert_ne!(old, KEY);
    save(&db, &vault, "http://localhost:5030", None).unwrap();
    assert_eq!(vault.0.lock().unwrap().len(), 1);
    save(&db, &vault, DEFAULT_ENDPOINT, Some("replacement-test-key")).unwrap();
    assert!(vault.get(&SecretRef(old)).unwrap().is_none());
    assert_eq!(vault.0.lock().unwrap().len(), 1);
    // No credentials in database or WAL; no response/request error text is logged by the client.
    for f in std::fs::read_dir(&root)
        .unwrap()
        .flatten()
        .filter(|f| f.path().is_file())
    {
        let bytes = std::fs::read(f.path()).unwrap();
        for secret in [KEY, "replacement-test-key"] {
            assert!(!bytes.windows(secret.len()).any(|w| w == secret.as_bytes()));
        }
    }
    c.execute_batch("CREATE TRIGGER reject_settings BEFORE UPDATE ON slskd_settings BEGIN SELECT RAISE(ABORT,'test'); END;").unwrap();
    assert!(save(&db, &vault, DEFAULT_ENDPOINT, Some("rejected-test-key")).is_err());
    assert_eq!(vault.0.lock().unwrap().len(), 1);
    drop(c);
    drop(db);
    std::fs::remove_file(root.join("library.sqlite3")).unwrap();
    for filename in ["library.sqlite3-shm", "library.sqlite3-wal"] {
        if root.join(filename).exists() {
            std::fs::remove_file(root.join(filename)).unwrap();
        }
    }
    std::fs::remove_dir(root.join("covers")).unwrap();
    std::fs::remove_dir(root).unwrap();
}
#[cfg(all(target_os = "windows", not(feature = "portable")))]
#[test]
fn windows_vault_round_trip() {
    let vault = crate::services::windows_secrets::WindowsSecretStore;
    let reference = SecretRef(format!(
        "Undertone/slskd/test-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    vault.put(&reference, KEY.as_bytes()).unwrap();
    let read = vault.get(&reference).unwrap();
    vault.remove(&reference).unwrap();
    assert!(read.as_deref() == Some(KEY.as_bytes()));
    assert!(vault.get(&reference).unwrap().is_none());
}
