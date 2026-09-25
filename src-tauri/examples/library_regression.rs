use std::{
    collections::BTreeMap,
    path::Path,
    sync::{Arc, Mutex},
};
use undertone::{
    database::Database,
    scanner::{scan, Progress},
};
fn main() {
    let args: Vec<_> = std::env::args().collect();
    let expected: Vec<(i64, String)> =
        serde_json::from_slice(&std::fs::read(&args[2]).unwrap()).unwrap();
    let expected: BTreeMap<_, _> = expected.into_iter().collect();
    assert_eq!(expected.len(), 912);
    let db = Database::open(Path::new(&args[1])).unwrap();
    let state = Arc::new(Mutex::new(Progress::default()));
    let identities = |db: &Database| {
        let conn = db.connect().unwrap();
        let mut s = conn
            .prepare("SELECT track_id,sync_id FROM track_identities ORDER BY track_id")
            .unwrap();
        s.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
    };
    let original_sync = identities(&db);
    for pass in 0..3 {
        if pass > 0 {
            *state.lock().unwrap() = Progress::default();
            scan(&db, vec!["F:\\Music".into()], &state).unwrap();
        }
        let library = db.library().unwrap();
        let actual: BTreeMap<_, _> = library.tracks.into_iter().map(|t| (t.id, t.path)).collect();
        assert!(
            actual == expected,
            "all original IDs and paths must survive migration and imports"
        );
        assert_eq!(identities(&db), original_sync);
        let conn = db.connect().unwrap();
        assert_eq!(
            conn.query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "ok"
        );
        assert_eq!(
            conn.query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| r
                .get::<_, i64>(
                0
            ))
            .unwrap(),
            0
        );
        println!("pass={pass}: tracks=912, original IDs unchanged, sync IDs unchanged, integrity=ok, foreign_keys=0; {:?}",state.lock().unwrap());
    }
}
