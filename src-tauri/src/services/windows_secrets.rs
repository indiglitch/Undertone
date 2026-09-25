use crate::providers::{SecretRef, SecretStore};
use windows_sys::Win32::{
    Foundation::{GetLastError, ERROR_NOT_FOUND},
    Security::Credentials::*,
};

pub struct WindowsSecretStore;
fn target(key: &SecretRef) -> Result<Vec<u16>, String> {
    if !key.0.starts_with("Undertone/slskd/") || key.0.contains('\0') || key.0.len() > 200 {
        return Err("Некорректная ссылка на credential".into());
    }
    Ok(key.0.encode_utf16().chain(Some(0)).collect())
}
impl SecretStore for WindowsSecretStore {
    fn get(&self, key: &SecretRef) -> Result<Option<Vec<u8>>, String> {
        let name = target(key)?;
        let mut credential = std::ptr::null_mut();
        unsafe {
            if CredReadW(name.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) == 0 {
                return if GetLastError() == ERROR_NOT_FOUND {
                    Ok(None)
                } else {
                    Err("Windows Credential Manager: чтение недоступно".into())
                };
            }
            let c = &*credential;
            let value = if c.CredentialBlobSize == 0 {
                Vec::new()
            } else {
                std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize).to_vec()
            };
            CredFree(credential.cast());
            Ok(Some(value))
        }
    }
    fn put(&self, key: &SecretRef, value: &[u8]) -> Result<(), String> {
        let mut name = target(key)?;
        if value.is_empty() || value.len() > 2560 {
            return Err("API key: допустимо 1–2560 байт".into());
        }
        let credential = CREDENTIALW {
            Type: CRED_TYPE_GENERIC,
            TargetName: name.as_mut_ptr(),
            CredentialBlobSize: value.len() as u32,
            CredentialBlob: value.as_ptr() as *mut u8,
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            ..Default::default()
        };
        if unsafe { CredWriteW(&credential, 0) } == 0 {
            return Err("Windows Credential Manager: сохранение недоступно".into());
        }
        Ok(())
    }
    fn remove(&self, key: &SecretRef) -> Result<(), String> {
        let name = target(key)?;
        if unsafe { CredDeleteW(name.as_ptr(), CRED_TYPE_GENERIC, 0) } == 0
            && unsafe { GetLastError() } != ERROR_NOT_FOUND
        {
            return Err("Windows Credential Manager: удаление недоступно".into());
        }
        Ok(())
    }
}
