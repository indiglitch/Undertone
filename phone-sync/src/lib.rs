use std::{fs::File, io::{Read, Write, Seek, SeekFrom}, net::{TcpListener, TcpStream, UdpSocket}, path::PathBuf, sync::{Arc, atomic::{AtomicBool, AtomicUsize, Ordering}}, thread, time::Duration};
use rand::RngCore;
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
mod identity;
mod collections;
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
pub struct Server { stop: Arc<AtomicBool>, status: Status, discovery: Option<mdns_sd::ServiceDaemon>, change: Arc<std::sync::Mutex<Option<Box<dyn Fn() + Send + Sync>>>> }
impl Drop for Server { fn drop(&mut self) { self.stop.store(true, Ordering::Relaxed); if let Some(d)=&self.discovery {let _=d.shutdown();} } }
impl Server {
    pub fn enabled(database: &PathBuf) -> bool { database.with_file_name("phone-sync-enabled").exists() }
    pub fn set_enabled(database: &PathBuf, enabled: bool) -> Result<(),String> {
        let path = database.with_file_name("phone-sync-enabled");
        if enabled { std::fs::write(path,b"1").map_err(|e|e.to_string()) } else { match std::fs::remove_file(path) { Ok(())=>Ok(()), Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Ok(()), Err(e)=>Err(e.to_string()) } }
    }
    pub fn on_collections_change(&self, callback: impl Fn() + Send + Sync + 'static) { *self.change.lock().unwrap()=Some(Box::new(callback)); }
    pub fn status(&self) -> Status { self.status.clone() }
    pub fn start(database: PathBuf) -> Result<Self, String> {
        let saved = identity::load(&database)?;
        let listener = TcpListener::bind(("0.0.0.0", saved.as_ref().map(|s|s.port).unwrap_or(0))).map_err(|e| format!("Не удалось открыть сохранённый порт подключения: {e}"))?;
        let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
        socket.connect("192.0.2.1:80").map_err(|e| e.to_string())?;
        let ip = socket.local_addr().map_err(|e| e.to_string())?.ip();
        let saved = match saved {
            Some(saved) => saved,
            None => {
                let certificate = rcgen::generate_simple_self_signed(vec![ip.to_string()]).map_err(|e| e.to_string())?;
                let mut secret = [0u8;32]; rand::rng().fill_bytes(&mut secret);
                let saved = identity::Identity { port: listener.local_addr().map_err(|e|e.to_string())?.port(), token: hex(&secret), certificate: certificate.cert.der().to_vec(), key: certificate.signing_key.serialize_der() };
                identity::save(&database, &saved)?;
                saved
            }
        };
        let fingerprint = hex(&Sha256::digest(&saved.certificate));
        let key = rustls::pki_types::PrivatePkcs8KeyDer::from(saved.key);
        let config = rustls::ServerConfig::builder().with_no_client_auth()
            .with_single_cert(vec![rustls::pki_types::CertificateDer::from(saved.certificate)], key.into()).map_err(|e| e.to_string())?;
        let pairing = Pairing { version: 1, address: format!("https://{}:{}", ip, saved.port), token: saved.token, fingerprint };
        let discovery = (|| -> Result<mdns_sd::ServiceDaemon,String> {
            let daemon=mdns_sd::ServiceDaemon::new().map_err(|e|e.to_string())?;
            let label=format!("undertone-{}",&pairing.fingerprint[..16]);
            let properties=[("fingerprint",pairing.fingerprint.as_str()),("version","1")];
            let info=mdns_sd::ServiceInfo::new("_undertone._tcp.local.",&label,&format!("{label}.local."),ip,saved.port,&properties[..]).map_err(|e|e.to_string())?.enable_addr_auto();
            daemon.register(info).map_err(|e|e.to_string())?;Ok(daemon)
        })().map_err(|e|eprintln!("PC discovery unavailable: {e}")).ok();
        let change: Arc<std::sync::Mutex<Option<Box<dyn Fn()+Send+Sync>>>>=Arc::new(std::sync::Mutex::new(None));
        let change_worker=change.clone();
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
                        let config = config.clone(); let db = database.clone(); let token = pairing.token.clone(); let active = active.clone(); let stop = stop_worker.clone(); let change=change_worker.clone();
                        thread::spawn(move || { if let Err(error) = serve(socket, config, db, &token, &stop, &change) { eprintln!("Phone transfer failed: {error}"); } active.fetch_sub(1, Ordering::Relaxed); });
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => thread::sleep(Duration::from_millis(30)),
                    Err(_) => break,
                }
            }
        });
        Ok(Self { stop, status, discovery, change })
    }
}
fn hex(bytes: &[u8]) -> String { bytes.iter().map(|b| format!("{b:02x}")).collect() }
fn database(path: &PathBuf) -> rusqlite::Result<Connection> { Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY) }
#[derive(Serialize)]
struct RemoteTrack { sync_id: String, title: String, artist: String, album: String, duration: f64, format: String, size: u64, has_cover: bool }
fn catalog(path: &PathBuf) -> Result<Vec<RemoteTrack>, String> {
    let db = database(path).map_err(|e| e.to_string())?;
    let mut statement = db.prepare("SELECT i.sync_id,t.title,a.name,b.title,t.duration,t.format,t.path,t.cover IS NOT NULL FROM tracks t JOIN track_identities i ON i.track_id=t.id JOIN artists a ON a.id=t.artist_id JOIN albums b ON b.id=t.album_id ORDER BY t.title").map_err(|e| e.to_string())?;
    let rows = statement.query_map([], |r| Ok((RemoteTrack {sync_id:r.get(0)?,title:r.get(1)?,artist:r.get(2)?,album:r.get(3)?,duration:r.get(4)?,format:r.get(5)?,size:0,has_cover:r.get(7)?}, r.get::<_,String>(6)?))).map_err(|e|e.to_string())?;
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
fn serve(socket: TcpStream, config: Arc<rustls::ServerConfig>, db_path: PathBuf, token: &str, stop: &AtomicBool, change: &std::sync::Mutex<Option<Box<dyn Fn()+Send+Sync>>>) -> Result<(), String> {
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
    if parts.len()==3 && parts[0]=="POST" && parts[1]=="/v1/collections" {
        let length=header.lines().filter_map(|l|l.split_once(':')).find(|(k,_)|k.eq_ignore_ascii_case("content-length")).and_then(|(_,v)|v.trim().parse::<usize>().ok());
        if length.is_none() || length.unwrap()>2*1024*1024 || header.lines().any(|l|l.to_ascii_lowercase().starts_with("transfer-encoding:")) {return reply(&mut stream,"413 Payload Too Large",b"{}").map_err(|e|e.to_string());}
        let mut body=vec![0u8;length.unwrap()];stream.read_exact(&mut body).map_err(|e|e.to_string())?;
        let edits:Vec<collections::Operation>=match serde_json::from_slice(&body){Ok(edits)=>edits,Err(_)=>return reply(&mut stream,"400 Bad Request",b"{}").map_err(|e|e.to_string())};
        match collections::apply(&db_path,edits) {
            Ok(snapshot)=>{ if let Some(callback)=change.lock().unwrap().as_ref(){callback();} let content=serde_json::to_vec(&snapshot).map_err(|e|e.to_string())?;return reply(&mut stream,"200 OK",&content).map_err(|e|e.to_string()); },
            Err(error)=>{let content=serde_json::to_vec(&serde_json::json!({"error":error})).unwrap();return reply(&mut stream,"409 Conflict",&content).map_err(|e|e.to_string());}
        }
    }
    if parts.len()!=3 || parts[0]!="GET" {return reply(&mut stream,"405 Method Not Allowed",b"{}").map_err(|e|e.to_string());}
    if parts[1]=="/v1/collections" { let result=collections::snapshot(&db_path)?;let data=serde_json::to_vec(&result).map_err(|e|e.to_string())?;return reply(&mut stream,"200 OK",&data).map_err(|e|e.to_string()); }
    if let Some(id)=parts[1].strip_prefix("/v1/artwork/").filter(|s|s.len()==32&&s.bytes().all(|b|b.is_ascii_hexdigit())) {
        let db=database(&db_path).map_err(|e|e.to_string())?;
        let path:Result<Option<String>,_>=db.query_row("SELECT t.cover FROM tracks t JOIN track_identities i ON i.track_id=t.id WHERE i.sync_id=?1",[id],|r|r.get(0));
        if let Ok(Some(path))=path {
            if let Ok(mut file)=File::open(path) { if file.metadata().map_err(|e|e.to_string())?.len()<=8*1024*1024 {
                let mut content=vec![];file.read_to_end(&mut content).map_err(|e|e.to_string())?;
                write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",content.len()).map_err(|e|e.to_string())?;
                stream.write_all(&content).map_err(|e|e.to_string())?;return stream.flush().map_err(|e|e.to_string());
            }}
        }
        return reply(&mut stream,"404 Not Found",b"{}").map_err(|e|e.to_string());
    }
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
    let digest=hex(&hash.finalize());let etag=format!("\"{digest}\"");
    let range=header.lines().filter_map(|l|l.split_once(':')).find(|(k,_)|k.eq_ignore_ascii_case("range")).map(|(_,v)|v.trim());
    let if_range=header.lines().filter_map(|l|l.split_once(':')).find(|(k,_)|k.eq_ignore_ascii_case("if-range")).map(|(_,v)|v.trim());
    let requested=if if_range.is_some() && if_range!=Some(etag.as_str()){None}else{range};
    let (offset,last,partial)=match requested {
        None=>(0,before.len().saturating_sub(1),false),
        Some(value)=>{
            let parsed=value.strip_prefix("bytes=").and_then(|s|s.split_once('-')).and_then(|(start,end)|Some((start.parse::<u64>().ok()?,if end.is_empty(){before.len().checked_sub(1)?}else{end.parse::<u64>().ok()?.min(before.len().checked_sub(1)?)})));
            match parsed {Some((start,end)) if start<=end && start<before.len()=>(start,end,true),_=>{write!(stream,"HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",before.len()).map_err(|e|e.to_string())?;return stream.flush().map_err(|e|e.to_string());}}
        }
    };
    file.seek(SeekFrom::Start(offset)).map_err(|e|e.to_string())?;
    let length=if before.len()==0{0}else{last-offset+1};
    write!(stream,"HTTP/1.1 {}\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nX-Content-SHA256: {}\r\nETag: {}\r\nAccept-Ranges: bytes\r\nConnection: close\r\nCache-Control: no-store\r\n",if partial{"206 Partial Content"}else{"200 OK"},length,digest,etag).map_err(|e|e.to_string())?;
    if partial {write!(stream,"Content-Range: bytes {offset}-{last}/{}\r\n",before.len()).map_err(|e|e.to_string())?;}
    write!(stream,"\r\n").map_err(|e|e.to_string())?;
    let mut remaining=length;
    while remaining>0 {if stop.load(Ordering::Relaxed){break;}let count=(remaining as usize).min(buffer.len());let n=file.read(&mut buffer[..count]).map_err(|e|e.to_string())?;if n==0{break;}stream.write_all(&buffer[..n]).map_err(|e|e.to_string())?;remaining-=n as u64;}
    stream.flush().map_err(|e|e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn access_preference_survives_restart() {
        let root=std::env::temp_dir().join(format!("undertone-access-{}",rand::random::<u64>()));
        std::fs::create_dir(&root).unwrap(); let db=root.join("library.sqlite3");
        assert!(!Server::enabled(&db)); Server::set_enabled(&db,true).unwrap();
        assert!(Server::enabled(&db)); Server::set_enabled(&db,false).unwrap();
        assert!(!Server::enabled(&db)); Server::set_enabled(&db,false).unwrap(); std::fs::remove_dir(root).unwrap();
    }
    #[test] fn bearer_token_is_required_exactly() {assert!(authorized("GET / HTTP/1.1\r\nAuthorization: Bearer abc\r\n","abc")); assert!(!authorized("Authorization: Bearer abcd","abc"));assert!(!authorized("","abc"));}
}
