# iOS 0.6.2 — downloads

## Behavior

- Shared playlists expose DOWNLOAD PLAYLIST through the common context menu on Home and Library. The original-file queue skips existing phone copies.
- Likes enqueue missing originals when the PC is available, after startup, reconnection, catalog changes, or synchronized likes from the PC. Offline likes wait for connection.
- Automatic scheduling does not observe playback/download progress and does not add another polling loop. Existing concurrency limit remains two transfers.
- Selected failed transfers retry on a new scheduling trigger; manually paused transfers remain paused. Unliking preserves already downloaded copies.
- Delivery is the standalone Undertone-SideStore.ipa; the Actions transport ZIP stays under qa-output, outside the release folder.

## Verification

- Preview production build passed.
- Browser preview: playlist menu contains DOWNLOAD PLAYLIST; a previously remote Morning light changed to На iPhone after LIKE without selecting download.
- Native CI: passed, run 36983830645, source 5b37c91bf27ac0568321a7b15733b6a0dc8acae1. All 45 unit/integration and 8 UI tests passed (53 total, zero failures).
- Added tests for liked selection, duplicate prevention, persisted queue, selective failure retry, pause preservation, and native playlist menu action.
- Physical iPhone download and SideStore update remain unverified in this run.

## Artifact

- releases/ios/0.6.2/Undertone-SideStore.ipa
- Verified Info.plist: local.undertone.ios, version 0.6.2, minimum iOS 26.0.
- SHA256: e330ed1615cdec2b5b1725509b00c103994f1638c0b991f5795f3eede85a122e
- CI simulator Home capture inspected; preview menu and automatic liked download recorded under qa-output/ios/0.6.2.
