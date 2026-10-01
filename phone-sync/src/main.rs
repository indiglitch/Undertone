use std::{path::PathBuf, time::Duration};
fn main() {
    let args: Vec<_> = std::env::args().collect();
    let server = undertone_phone_sync::Server::start(PathBuf::from(args.get(1).expect("database path"))).expect("start HTTPS server");
    if let Some(output) = args.get(2) { std::fs::write(output,serde_json::to_vec(&server.status()).unwrap()).unwrap(); }
    loop { std::thread::sleep(Duration::from_secs(1)); }
}
