# iPhone companion: first verified build

Branch: `codex/ios-companion`, commit `31dcc9d066518d94858f36749acff479a946584a`.
GitHub macOS run: https://github.com/indiglitch/Undertone/actions/runs/36905079187 (success).

## Delivered

Native SwiftUI iPhone app with system Liquid Glass tab/navigation controls, custom glass search/device surfaces and mini-player, expanded playback screen, and Undertone icon. Real local import through Files; no seeded/demo music. Original-byte copying, chunked SHA-256, duplicate suppression, versioned atomic manifest in Application Support. AVAudioPlayer with queue/seek, Now Playing commands, background audio configuration, interruption/headphone-disconnect handling. XcodeGen project, five XCTest cases, unsigned IPA packaging for SideStore, native simulator screenshot.

Local IPA: `F:\Spotify-Like\releases\ios\Undertone-SideStore.ipa` (267383 bytes).
Native preview: `F:\Spotify-Like\qa-output\ios\Undertone-iPhone.png`.
Bundle: `local.undertone.ios`; app version `0.1.0`; minimum iOS `26.0`.

## Verification

- Xcode generation, simulator compilation, device Release build, and IPA packaging passed on GitHub macOS.
- 5/5 XCTest cases passed: original-byte preservation / duplicate import / reopen; known SHA-256; malformed manifest preservation; future manifest version rejection; filename traversal rejection.
- Screenshot from the launched native iPhone simulator inspected: native floating tab bar, toolbar button, purple Undertone hero and statistics render correctly; no horizontal clipping in captured home state.
- Downloaded IPA inspected as a ZIP: expected executable and Info.plist present, bundle ID and background-audio mode confirmed.
- Working checkout remains `main` at `fc5a49b`; pre-existing desktop changes were not included in the iOS commits.

## Not verified or not implemented

- Not installed on the user's iPhone / iOS 27.0.1. SideStore signing, refresh/update data preservation, physical lock-screen audio and headphones need device verification.
- No PC pairing, HTTPS transfer service, background network downloads, or two-way collection sync yet. Device screen explicitly says connection is under development.
- Native decoding varies by source format/container. No claim that all desktop formats play; unsupported playback reports an error. No automatic transcoding.
- Embedded cover extraction, local-file deletion UI, persistent playback queue, and advanced playlist management remain follow-up work.

Next milestone: secure QR pairing and PC library manifest API, then original-file transfers and device acceptance tests.
