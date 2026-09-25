# MPL-2.0 corresponding source access

These components remain under the Mozilla Public License 2.0 (MPL-2.0.txt). You may obtain their original source from the exact-version URLs below. Undertone application files that contain no covered code are separate and are not offered under MPL by this notice.

## Modified symphonia-bundle-mp3 0.5.5

1. Download https://crates.io/api/v1/crates/symphonia-bundle-mp3/0.5.5/download and extract the .crate (gzip tar) archive.
2. Verify original archive SHA-256: 4872dd6bb56bf5eac799e3e957aa1981086c3e613b27e0ac23b176054f7c57ed.
3. Replace src/synthesis.rs with the accompanying MPL-MODIFICATIONS/symphonia-bundle-mp3-0.5.5/synthesis.rs. This is the complete modified file in preferred source form, under MPL-2.0. All other original source files are unchanged.

Modification: preserve float PCM synthesis overshoot instead of clamping to [-1,1] before volume. Original copyright/license headers are preserved. No application source is needed to obtain these covered sources.

## Exact unchanged upstream source versions

Modified file SHA-256: 5a78f9dee09a8e14aa2be73f49c8d2774906683e1839e6ad5cd73103ea13ee44

- cssparser 0.36.0: https://crates.io/api/v1/crates/cssparser/0.36.0/download; archive SHA-256 dae61cf9c0abb83bd659dab65b7e4e38d8236824c85f0f804f173567bda257d2
- cssparser-macros 0.6.1: https://crates.io/api/v1/crates/cssparser-macros/0.6.1/download; archive SHA-256 13b588ba4ac1a99f7f2964d24b3d896ddc6bf847ee3855dbd4366f058cfcd331
- dtoa-short 0.3.5: https://crates.io/api/v1/crates/dtoa-short/0.3.5/download; archive SHA-256 cd1511a7b6a56299bd043a9c167a6d2bfb37bf84a6dfceaba651168adfb43c87
- option-ext 0.2.0: https://crates.io/api/v1/crates/option-ext/0.2.0/download; archive SHA-256 04744f49eae99ab78e0d5c0b603ab218f515ea8cfe5a456d7629ad883a3b6e7d
- selectors 0.36.1: https://crates.io/api/v1/crates/selectors/0.36.1/download; archive SHA-256 c5d9c0c92a92d33f08817311cf3f2c29a3538a8240e94a6a3c622ce652d7e00c
- symphonia 0.5.5: https://crates.io/api/v1/crates/symphonia/0.5.5/download; archive SHA-256 5773a4c030a19d9bfaa090f49746ff35c75dfddfa700df7a5939d5e076a57039
- symphonia-bundle-flac 0.5.5: https://crates.io/api/v1/crates/symphonia-bundle-flac/0.5.5/download; archive SHA-256 c91565e180aea25d9b80a910c546802526ffd0072d0b8974e3ebe59b686c9976
- symphonia-codec-aac 0.5.5: https://crates.io/api/v1/crates/symphonia-codec-aac/0.5.5/download; archive SHA-256 4c263845aa86881416849c1729a54c7f55164f8b96111dba59de46849e73a790
- symphonia-codec-adpcm 0.5.5: https://crates.io/api/v1/crates/symphonia-codec-adpcm/0.5.5/download; archive SHA-256 2dddc50e2bbea4cfe027441eece77c46b9f319748605ab8f3443350129ddd07f
- symphonia-codec-alac 0.5.5: https://crates.io/api/v1/crates/symphonia-codec-alac/0.5.5/download; archive SHA-256 8413fa754942ac16a73634c9dfd1500ed5c61430956b33728567f667fdd393ab
- symphonia-codec-pcm 0.5.5: https://crates.io/api/v1/crates/symphonia-codec-pcm/0.5.5/download; archive SHA-256 4e89d716c01541ad3ebe7c91ce4c8d38a7cf266a3f7b2f090b108fb0cb031d95
- symphonia-codec-vorbis 0.5.5: https://crates.io/api/v1/crates/symphonia-codec-vorbis/0.5.5/download; archive SHA-256 f025837c309cd69ffef572750b4a2257b59552c5399a5e49707cc5b1b85d1c73
- symphonia-core 0.5.5: https://crates.io/api/v1/crates/symphonia-core/0.5.5/download; archive SHA-256 ea00cc4f79b7f6bb7ff87eddc065a1066f3a43fe1875979056672c9ef948c2af
- symphonia-format-caf 0.5.5: https://crates.io/api/v1/crates/symphonia-format-caf/0.5.5/download; archive SHA-256 b8faf379316b6b6e6bbc274d00e7a592e0d63ff1a7e182ce8ba25e24edd3d096
- symphonia-format-isomp4 0.5.5: https://crates.io/api/v1/crates/symphonia-format-isomp4/0.5.5/download; archive SHA-256 243739585d11f81daf8dac8d9f3d18cc7898f6c09a259675fc364b382c30e0a5
- symphonia-format-mkv 0.5.5: https://crates.io/api/v1/crates/symphonia-format-mkv/0.5.5/download; archive SHA-256 122d786d2c43a49beb6f397551b4a050d8229eaa54c7ddf9ee4b98899b8742d0
- symphonia-format-ogg 0.5.5: https://crates.io/api/v1/crates/symphonia-format-ogg/0.5.5/download; archive SHA-256 2b4955c67c1ed3aa8ae8428d04ca8397fbef6a19b2b051e73b5da8b1435639cb
- symphonia-format-riff 0.5.5: https://crates.io/api/v1/crates/symphonia-format-riff/0.5.5/download; archive SHA-256 c2d7c3df0e7d94efb68401d81906eae73c02b40d5ec1a141962c592d0f11a96f
- symphonia-metadata 0.5.5: https://crates.io/api/v1/crates/symphonia-metadata/0.5.5/download; archive SHA-256 36306ff42b9ffe6e5afc99d49e121e0bd62fe79b9db7b9681d48e29fa19e6b16
- symphonia-utils-xiph 0.5.5: https://crates.io/api/v1/crates/symphonia-utils-xiph/0.5.5/download; archive SHA-256 ee27c85ab799a338446b68eec77abf42e1a6f1bb490656e121c6e27bfbab9f16
