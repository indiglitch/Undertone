#[cfg(feature = "ai")]
pub mod ai;
pub mod audio;
pub mod audio_source;
pub mod bulk_lyrics;
pub mod collections;
pub mod database;
pub mod external_lyrics;
pub mod lyrics;
pub mod metadata;
pub mod playback_session;
pub mod data_paths;
pub mod providers;
pub mod scanner;
pub mod services;
pub mod trash;

#[cfg(all(
    feature = "external-lyrics",
    not(any(target_os = "ios", target_os = "android"))
))]
pub mod lrclib;

#[cfg(all(test, feature = "ai"))]
mod ai_tests;
#[cfg(test)]
mod audio_tests;
#[cfg(all(test, feature = "ai"))]
mod evaluation_tests;
#[cfg(all(test, feature = "ai"))]
mod local_e5_tests;
#[cfg(all(test, feature = "portable", not(feature = "ai")))]
mod portable_smoke_tests;
#[cfg(test)]
mod lyrics_tests;
#[cfg(test)]
mod tests;
