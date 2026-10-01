use std::{fs::File, io::{Read, Write, Seek, SeekFrom}, net::{TcpListener, TcpStream, UdpSocket}, path::PathBuf, sync::{Arc, atomic::{AtomicBool, AtomicUsize, Ordering}}, thread, time::Duration};
use rand::RngCore;
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use sha2::{Digest, Sha256};

#[derive(Clone, Serialize)]
pub struct Pairing {
    pub version: u8,
    pub address: String,
    pub token: String,
    pub fingerprint: String,
}
#[derive(Clone, Serialize)]
pub struct Status { pub running: bool, pub address: String, pub code: String, pub qr_svg: String }
pub struct Server { stop: Arc<AtomicBool>, status: Status }
impl Drop for Server { fn drop(&mut self) { self.stop.store(true, Ordering::Relaxed); } }
impl Server {
    pub fn status(&self) -> Status { self.status.clone() }
    pub fn start(database: PathBuf) -> Result<Self, String> {
        let listener = TcpListener::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
        let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
        socket.connect("192.0.2.1:80").map_err(|e| e.to_string())?;
        let ip = socket.local_addr().map_err(|e| e.to_string())?.ip();
        let certificate = rcgen::generate_simple_self_signed(vec![ip.to_string()]).map_err(|e| e.to_string())?;
        let fingerprint = hex(&Sha256::digest(certificate.cert.der()));
        let key = rustls::pki_types::PrivatePkcs8KeyDer::from(certificate.signing_key.serialize_der());
        let config = rustls::ServerConfig::builder().with_no_client_auth()
            .with_single_cert(vec![certificate.cert.der().clone()], key.into()).map_err(|e| e.to_string())?;
        let mut secret = [0u8; 32]; rand::rng().fill_bytes(&mut secret);
        let pairing = Pairing { version: 1, address: format!("https://{}:{}", ip, listener.local_addr().unwrap().port()), token: hex(&secret), fingerprint };
        let code = serde_json::to_string(&pairing).map_err(|e| e.to_string())?;
        let qr = qrcode::QrCode::new(code.as_bytes()).map_err(|e| e.to_string())?;
        let qr_svg = qr.render::<qrcode::render::svg::Color>().min_dimensions(280, 280).build();
        let status = Status { running: true, address: pairing.address, code, qr_svg };
        let stop = Arc::new(AtomicBool::new(false));
        let stop_worker = stop.clone(); let config = Arc::new(config); let active = Arc::new(AtomicUsize::new(0));
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        thread::spawn(move || {
            while !stop_worker.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((socket, _)) => {
                        if active.fetch_add(1, Ordering::Relaxed) >= 8 { active.fetch_sub(1, Ordering::Relaxed); continue; }
                        let config = config.clone(); let db = database.clone(); let token = pairing.token.clone(); let active = active.clone(); let stop = stop_worker.clone();
                        thread::spawn(move || { if let Err(error) = serve(socket, config, db, &token, &stop) { eprintln!("Phone transfer failed: {error}"); } active.fetch_sub(1, Ordering::Relaxed); });
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => thread::sleep(Duration::from_millis(30)),
                    Err(_) => break,
                }
            }
        });
        Ok(Self { stop, status })
    }
}
fn hex(bytes: &[u8]) -> String { bytes.iter().map(|b| format!("{b:02x}")).collect() }
fn database(path: &PathBuf) -> rusqlite::Result<Connection> { Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY) }
#[derive(Serialize)]
struct RemoteTrack { sync_id: String, title: String, artist: String, album: String, duration: f64, format: String, size: u64 }
fn catalog(path: &PathBuf) -> Result<Vec<RemoteTrack>, String> {
    let db = database(path).map_err(|e| e.to_string())?;
    let mut statement = db.prepare("SELECT i.sync_id,t.title,a.name,b.title,t.duration,t.format,t.path FROM tracks t JOIN track_identities i ON i.track_id=t.id JOIN artists a ON a.id=t.artist_id JOIN albums b ON b.id=t.album_id ORDER BY t.title").map_err(|e| e.to_string())?;
    let rows = statement.query_map([], |r| Ok((RemoteTrack {sync_id:r.get(0)?,title:r.get(1)?,artist:r.get(2)?,album:r.get(3)?,duration:r.get(4)?,format:r.get(5)?,size:0}, r.get::<_,String>(6)?))).map_err(|e|e.to_string())?;
    let mut result = vec![];
    for row in rows { let (mut track, file) = row.map_err(|e|e.to_string())?; if let Ok(metadata) = std::fs::metadata(file) { if metadata.is_file() {track.size = metadata.len(); result.push(track);} } }
    Ok(result)
}
fn authorized(header: &str, token: &str) -> bool {
    let expected = format!("Bearer {token}");
    let value = header.lines().filter_map(|l| l.split_once(':')).find(|(k,_)|k.eq_ignore_ascii_case("authorization")).map(|(_,v)|v.trim()).unwrap_or("");
    if value.len() != expected.len() {return false;}
    value.bytes().zip(expected.bytes()).fold(0u8, |difference,(a,b)|difference | (a^b)) == 0
}
fn reply<W: Write>(stream: &mut W, status: &str, content: &[u8]) -> std::io::Result<()> {
    write!(stream,"HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n",content.len())?;
    stream.write_all(content)?;
    stream.flush()
}
fn serve(socket: TcpStream, config: Arc<rustls::ServerConfig>, db_path: PathBuf, token: &str, stop: &AtomicBool) -> Result<(), String> {
    socket.set_nonblocking(false).map_err(|e|e.to_string())?;
    socket.set_read_timeout(Some(Duration::from_secs(10))).map_err(|e|e.to_string())?;
    socket.set_write_timeout(Some(Duration::from_secs(30))).map_err(|e|e.to_string())?;
    let connection = rustls::ServerConnection::new(config).map_err(|e|e.to_string())?;
    let mut stream = rustls::StreamOwned::new(connection, socket);
    let mut bytes = Vec::new();
    while !bytes.ends_with(b"\r\n\r\n") {
        if bytes.len() >= 8192 || stop.load(Ordering::Relaxed) {return Err("Request rejected".into());}
        let mut byte = [0u8;1]; stream.read_exact(&mut byte).map_err(|e|e.to_string())?; bytes.push(byte[0]);
    }
    let header = std::str::from_utf8(&bytes).map_err(|e|e.to_string())?;
    if !authorized(header,token) {return reply(&mut stream,"401 Unauthorized",b"{}").map_err(|e|e.to_string());}
    let parts: Vec<_> = header.lines().next().unwrap_or("").split_whitespace().collect();
    if parts.len()!=3 || parts[0]!="GET" {return reply(&mut stream,"405 Method Not Allowed",b"{}").map_err(|e|e.to_string());}
    if parts[1]=="/v1/library" {
        let result = catalog(&db_path)?;
        let data = serde_json::to_vec(&serde_json::json!({"version":1,"tracks":result})).map_err(|e|e.to_string())?;
        return reply(&mut stream,"200 OK",&data).map_err(|e|e.to_string());
    }
    let Some(id) = parts[1].strip_prefix("/v1/file/").filter(|s|s.len()==32 && s.bytes().all(|b|b.is_ascii_hexdigit())) else {return reply(&mut stream,"404 Not Found",b"{}").map_err(|e|e.to_string());};
    let db = database(&db_path).map_err(|e|e.to_string())?;
    let path: Result<String,_> = db.query_row("SELECT t.path FROM tracks t JOIN track_identities i ON i.track_id=t.id WHERE i.sync_id=?1",[id],|row|row.get(0));
    let Ok(path) = path else {return reply(&mut stream,"404 Not Found",b"{}").map_err(|e|e.to_string());};
    // Files can only be selected by an existing database identity, never by a supplied path.
    let mut file = File::open(path).map_err(|e|e.to_string())?;
    let before = file.metadata().map_err(|e|e.to_string())?;
    if !before.is_file() {return Err("Not a regular file".into());}
    let mut hash = Sha256::new(); let mut buffer = [0u8;65536];
    loop {let n=file.read(&mut buffer).map_err(|e|e.to_string())?;if n==0{break;} hash.update(&buffer[..n]);if stop.load(Ordering::Relaxed){return Err("Server stopped".into());}}
    let after = file.metadata().map_err(|e|e.to_string())?;
    if before.len()!=after.len() || before.modified().ok()!=after.modified().ok() {return reply(&mut stream,"409 Conflict",b"{}").map_err(|e|e.to_string());}
    file.seek(SeekFrom::Start(0)).map_err(|e|e.to_string())?;
    write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nX-Content-SHA256: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n",before.len(),hex(&hash.finalize())).map_err(|e|e.to_string())?;
    loop {if stop.load(Ordering::Relaxed){break;}let n=file.read(&mut buffer).map_err(|e|e.to_string())?;if n==0{break;}stream.write_all(&buffer[..n]).map_err(|e|e.to_string())?;}
    stream.flush().map_err(|e|e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn bearer_token_is_required_exactly() {assert!(authorized("GET / HTTP/1.1\r\nAuthorization: Bearer abc\r\n","abc")); assert!(!authorized("Authorization: Bearer abcd","abc"));assert!(!authorized("","abc"));}
}
