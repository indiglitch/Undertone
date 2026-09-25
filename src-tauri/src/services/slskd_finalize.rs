use super::download_status_saved;
use crate::{
    database::Database,
    metadata,
    providers::{
        DownloadFinalizeResult, DownloadFinalizeState, DownloadState, DownloadStatus,
        MetadataProvider, SecretStore,
    },
    scanner::{self, IntakeOutcome},
};
use rusqlite::OptionalExtension;
use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};
use walkdir::WalkDir;

static FINALIZE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn state_text(state: &DownloadFinalizeState) -> &'static str {
    match state {
        DownloadFinalizeState::Imported => "imported",
        DownloadFinalizeState::AlreadyInLibrary => "already_in_library",
        DownloadFinalizeState::FileNotFound => "file_not_found",
        DownloadFinalizeState::Ambiguous => "ambiguous",
        DownloadFinalizeState::InvalidFile => "invalid_file",
        DownloadFinalizeState::ImportFailed => "import_failed",
    }
}
fn parse_state(value: &str) -> Result<DownloadFinalizeState, String> {
    match value {
        "imported" => Ok(DownloadFinalizeState::Imported),
        "already_in_library" => Ok(DownloadFinalizeState::AlreadyInLibrary),
        "file_not_found" => Ok(DownloadFinalizeState::FileNotFound),
        "ambiguous" => Ok(DownloadFinalizeState::Ambiguous),
        "invalid_file" => Ok(DownloadFinalizeState::InvalidFile),
        "import_failed" => Ok(DownloadFinalizeState::ImportFailed),
        _ => Err("slskd: invalid saved finalization".into()),
    }
}
fn cached(db: &Database, operation_id: &str) -> Result<Option<DownloadFinalizeResult>, String> {
    db.connect()?
        .query_row(
            "SELECT status,track_id,local_path FROM slskd_download_finalizations WHERE operation_id=?1",
            [operation_id],
            |row| Ok((row.get::<_, String>(0)?,row.get::<_, Option<i64>>(1)?,row.get::<_, Option<String>>(2)?)),
        )
        .optional()
        .map_err(|_| "slskd: finalization unavailable".to_string())?
        .map(|(status,track_id,local_path)| Ok(DownloadFinalizeResult {operation_id:operation_id.into(),status:parse_state(&status)?,track_id,local_path}))
        .transpose()
}
fn persist(db: &Database, result: &DownloadFinalizeResult) -> Result<(), String> {
    db.connect()?.execute(
        "INSERT OR IGNORE INTO slskd_download_finalizations(operation_id,status,track_id,local_path) VALUES(?1,?2,?3,?4)",
        rusqlite::params![result.operation_id,state_text(&result.status),result.track_id,result.local_path],
    ).map_err(|_| "slskd: failed to save finalization")?;
    Ok(())
}
fn result(
    operation_id: &str,
    status: DownloadFinalizeState,
    track_id: Option<i64>,
    path: Option<&Path>,
) -> DownloadFinalizeResult {
    DownloadFinalizeResult {
        operation_id: operation_id.into(),
        status,
        track_id,
        local_path: path.map(|value| value.to_string_lossy().into_owned()),
    }
}

fn remote_basename(remote_path: &str) -> Option<&OsStr> {
    remote_path
        .split(['/', '\\'])
        .filter(|part| !part.is_empty())
        .next_back()
        .filter(|part| *part != "." && *part != "..")
        .map(OsStr::new)
}

fn safe_candidate(root: &Path, candidate: &Path, expected_size: u64) -> Option<PathBuf> {
    let root = root.canonicalize().ok()?;
    let link_info = candidate.symlink_metadata().ok()?;
    if !link_info.file_type().is_file() {
        return None;
    }
    let candidate = candidate.canonicalize().ok()?;
    if !candidate.starts_with(&root) {
        return None;
    }
    let info = candidate.metadata().ok()?;
    if !info.is_file() || (expected_size > 0 && info.len() != expected_size) {
        return None;
    }
    Some(candidate)
}

fn candidates(root: &Path, status: &DownloadStatus) -> Result<Vec<PathBuf>, String> {
    let root = root
        .canonicalize()
        .map_err(|_| "slskd: download root unavailable")?;
    if !root.is_dir() {
        return Err("slskd: download root unavailable".into());
    }
    let Some(filename) = remote_basename(&status.remote_path) else {
        return Ok(Vec::new());
    };
    let mut found = Vec::new();
    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() || entry.file_name() != filename {
            continue;
        }
        if let Some(candidate) = safe_candidate(&root, entry.path(), status.total_bytes) {
            found.push(candidate);
        }
    }
    found.sort();
    found.dedup();
    Ok(found)
}

fn finalize_completed(
    db: &Database,
    operation: &DownloadStatus,
    root: &Path,
    provider: &dyn MetadataProvider,
) -> Result<DownloadFinalizeResult, String> {
    if operation.state != DownloadState::Completed {
        return Err("slskd: download is not completed".into());
    }
    let found = candidates(root, operation)?;
    let resolved = match found.as_slice() {
        [] => result(
            &operation.operation_id,
            DownloadFinalizeState::FileNotFound,
            None,
            None,
        ),
        [candidate] => {
            if !metadata::supported(candidate) || metadata::read(candidate, &db.covers).is_err() {
                result(
                    &operation.operation_id,
                    DownloadFinalizeState::InvalidFile,
                    None,
                    Some(candidate),
                )
            } else {
                match scanner::import_file(db, candidate, provider) {
                    Ok(IntakeOutcome::Imported(track_id)) => result(
                        &operation.operation_id,
                        DownloadFinalizeState::Imported,
                        Some(track_id),
                        Some(candidate),
                    ),
                    Ok(IntakeOutcome::AlreadyInLibrary(track_id)) => result(
                        &operation.operation_id,
                        DownloadFinalizeState::AlreadyInLibrary,
                        Some(track_id),
                        Some(candidate),
                    ),
                    Err(_) => result(
                        &operation.operation_id,
                        DownloadFinalizeState::ImportFailed,
                        None,
                        Some(candidate),
                    ),
                }
            }
        }
        _ => result(
            &operation.operation_id,
            DownloadFinalizeState::Ambiguous,
            None,
            None,
        ),
    };
    persist(db, &resolved)?;
    Ok(resolved)
}

pub fn finalize_download_saved(
    db: &Database,
    store: &dyn SecretStore,
    operation_id: &str,
) -> Result<DownloadFinalizeResult, String> {
    let _guard = FINALIZE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "slskd: finalization unavailable")?;
    if let Some(result) = cached(db, operation_id)? {
        return Ok(result);
    }
    let root = db
        .connect()?
        .query_row(
            "SELECT download_root FROM slskd_settings WHERE id=1",
            [],
            |row| row.get::<_, Option<String>>(0),
        )
        .map_err(|_| "slskd: download root not configured")?
        .ok_or("slskd: download root not configured")?;
    let status = download_status_saved(db, store, operation_id)?;
    finalize_completed(db, &status, Path::new(&root), &metadata::LocalMetadata)
}

#[cfg(test)]
fn finalize_known_status(
    db: &Database,
    status: &DownloadStatus,
    root: &Path,
    provider: &dyn MetadataProvider,
) -> Result<DownloadFinalizeResult, String> {
    let _guard = FINALIZE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "slskd: finalization unavailable")?;
    if let Some(result) = cached(db, &status.operation_id)? {
        return Ok(result);
    }
    finalize_completed(db, status, root, provider)
}

#[cfg(test)]
#[path = "slskd_finalize_tests.rs"]
mod tests;
