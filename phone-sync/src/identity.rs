use serde::{Deserialize, Serialize};
use std::path::PathBuf;
#[derive(Serialize, Deserialize)]
pub struct Identity {
    pub port: u16,
    pub token: String,
    pub certificate: Vec<u8>,
    pub key: Vec<u8>,
}
fn path(db: &PathBuf) -> PathBuf {
    db.with_file_name("phone-sync-identity.bin")
}
pub fn load(db: &PathBuf) -> Result<Option<Identity>, String> {
    let data = match std::fs::read(path(db)) {
        Ok(data) => data,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    let saved: Identity =
        serde_json::from_slice(&crypt(&data, false)?).map_err(|e| e.to_string())?;
    if saved.port == 0
        || saved.token.len() != 64
        || !saved.token.bytes().all(|b| b.is_ascii_hexdigit())
        || saved.certificate.is_empty()
        || saved.key.is_empty()
    {
        return Err("Invalid saved PC identity".into());
    }
    Ok(Some(saved))
}
pub fn save(db: &PathBuf, saved: &Identity) -> Result<(), String> {
    let bytes = crypt(&serde_json::to_vec(saved).map_err(|e| e.to_string())?, true)?;
    let target = path(db);
    let temp = target.with_extension("new");
    std::fs::write(&temp, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(temp, target).map_err(|e| e.to_string())
}
#[cfg(windows)]
fn crypt(bytes: &[u8], protect: bool) -> Result<Vec<u8>, String> {
    #[repr(C)]
    struct Blob {
        len: u32,
        data: *mut u8,
    }
    #[link(name = "Crypt32")]
    unsafe extern "system" {
        fn CryptProtectData(
            input: *const Blob,
            description: *const u16,
            entropy: *const Blob,
            reserved: *mut std::ffi::c_void,
            prompt: *mut std::ffi::c_void,
            flags: u32,
            output: *mut Blob,
        ) -> i32;
        fn CryptUnprotectData(
            input: *const Blob,
            description: *mut *mut u16,
            entropy: *const Blob,
            reserved: *mut std::ffi::c_void,
            prompt: *mut std::ffi::c_void,
            flags: u32,
            output: *mut Blob,
        ) -> i32;
    }
    #[link(name = "Kernel32")]
    unsafe extern "system" {
        fn LocalFree(memory: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    }
    let input = Blob {
        len: bytes.len().try_into().map_err(|_| "Identity too large")?,
        data: bytes.as_ptr() as *mut u8,
    };
    let mut output = Blob {
        len: 0,
        data: std::ptr::null_mut(),
    };
    unsafe {
        let ok = if protect {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                1,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                1,
                &mut output,
            )
        };
        if ok == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        let result = std::slice::from_raw_parts(output.data, output.len as usize).to_vec();
        LocalFree(output.data.cast());
        Ok(result)
    }
}
#[cfg(not(windows))]
fn crypt(bytes: &[u8], _: bool) -> Result<Vec<u8>, String> {
    Ok(bytes.to_vec())
}
