# Local modification to Symphonia 0.5.5 (MPL-2.0)

2026-09-07: `src/synthesis.rs`: replace `s.clamp(-1.0, 1.0)` with `*s`.
Float PCM may legitimately exceed full scale after lossy decoding. Clamping in the
decoder irreversibly distorts samples even when subsequent playback volume is low.
This change preserves that headroom; it does not amplify, normalize or limit audio.
Measured against independent FFmpeg float decoding; see the project audio report.

Original source: https://crates.io/crates/symphonia-bundle-mp3/0.5.5
The modified files retain MPL-2.0. This full crate is included in Third Party Sources.
