// Compile-time boundary: no Soulseek adapter, API or remote-download commands on mobile.
#[cfg(all(feature = "slskd", not(any(target_os = "ios", target_os = "android"))))]
pub mod slskd;
#[cfg(all(feature = "slskd", target_os = "windows", not(feature = "portable")))]
pub mod windows_secrets;
#[cfg(all(feature = "portable", feature = "slskd", target_os = "windows"))]
pub mod portable_secrets;
