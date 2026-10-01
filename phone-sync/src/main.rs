use std::{path::PathBuf, time::Duration};
fn main() {
    let args: Vec<_> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--discover") {
        let fingerprint = args.get(2).expect("fingerprint");
        let daemon = mdns_sd::ServiceDaemon::new().unwrap();
        let events = daemon.browse("_undertone._tcp.local.").unwrap();
        let until = std::time::Instant::now() + Duration::from_secs(10);
        while std::time::Instant::now() < until {
            if let Ok(mdns_sd::ServiceEvent::ServiceResolved(info)) =
                events.recv_timeout(Duration::from_millis(500))
            {
                if info.get_property_val_str("fingerprint") == Some(fingerprint.as_str()) {
                    assert!(info.get_property("token").is_none());
                    println!(
                        "{}",
                        serde_json::json!({"host":info.host,"port":info.port,"addresses":info.get_addresses_v4().iter().map(ToString::to_string).collect::<Vec<_>>()})
                    );
                    let _ = daemon.shutdown();
                    return;
                }
            }
        }
        let _ = daemon.shutdown();
        panic!("Paired PC not found by mDNS");
    }
    let server =
        undertone_phone_sync::Server::start(PathBuf::from(args.get(1).expect("database path")))
            .expect("start HTTPS server");
    if let Some(output) = args.get(2) {
        std::fs::write(output, serde_json::to_vec(&server.status()).unwrap()).unwrap();
    }
    loop {
        std::thread::sleep(Duration::from_secs(1));
    }
}
