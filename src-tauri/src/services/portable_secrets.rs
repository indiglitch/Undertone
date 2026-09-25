use crate::providers::{SecretRef, SecretStore};
use std::{fs, io::ErrorKind, path::PathBuf};

pub struct PortableSecretStore { directory: PathBuf }
impl PortableSecretStore {
    pub fn new(data_directory: PathBuf) -> Self { Self { directory: data_directory.join("secrets") } }
    fn path(&self, key: &SecretRef) -> Result<PathBuf, String> {
        let id=key.0.strip_prefix("Undertone/slskd/").ok_or("Invalid secret reference")?;
        if id.len()!=32 || !id.bytes().all(|byte|byte.is_ascii_hexdigit()) { return Err("Invalid secret reference".into()); }
        Ok(self.directory.join(format!("{id}.key")))
    }
}
impl SecretStore for PortableSecretStore {
    fn get(&self,key:&SecretRef)->Result<Option<Vec<u8>>,String>{
        match fs::read(self.path(key)?) {
            Ok(value)=>Ok(Some(value)),
            Err(error) if error.kind()==ErrorKind::NotFound=>Ok(None),
            Err(_)=>Err("Portable secret could not be read".into()),
        }
    }
    fn put(&self,key:&SecretRef,value:&[u8])->Result<(),String>{
        if value.is_empty()||value.len()>2560 { return Err("Invalid API key length".into()); }
        fs::create_dir_all(&self.directory).map_err(|_|"Portable secret directory is unavailable")?;
        let path=self.path(key)?;
        let mut file=fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|_|"Portable secret could not be created")?;
        use std::io::Write;
        if file.write_all(value).and_then(|_|file.sync_all()).is_err(){let _=fs::remove_file(path);return Err("Portable secret could not be saved".into());}
        Ok(())
    }
    fn remove(&self,key:&SecretRef)->Result<(),String>{
        match fs::remove_file(self.path(key)?) {
            Ok(())=>Ok(()),
            Err(error) if error.kind()==ErrorKind::NotFound=>Ok(()),
            Err(_)=>Err("Portable secret could not be removed".into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn secret_stays_under_portable_data_and_rejects_traversal(){
        let root=std::env::temp_dir().join(format!("undertone-portable-secret-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let store=PortableSecretStore::new(root.clone());
        let key=SecretRef("Undertone/slskd/0123456789abcdef0123456789abcdef".into());
        assert_eq!(store.get(&key).unwrap(),None);
        store.put(&key,b"test-key").unwrap();
        assert_eq!(store.get(&key).unwrap(),Some(b"test-key".to_vec()));
        assert!(store.put(&SecretRef("Undertone/slskd/../escape".into()),b"bad").is_err());
        store.remove(&key).unwrap();
        assert_eq!(store.get(&key).unwrap(),None);
        fs::remove_dir_all(root).unwrap();
    }
}
