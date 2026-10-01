# Undertone for iPhone — native companion

Native SwiftUI client, deployment target iOS 26+. Uses the system Liquid Glass APIs rather than a web/CSS imitation. The requested iOS 27.0.1 device must be tested separately; no device compatibility result is implied by the deployment target.

## Version 0.3

- QR pairing over pinned HTTPS; Keychain on iPhone and DPAPI-protected identity on Windows. Access stays enabled across restarts.
- Automatic rediscovery of the already paired PC using Bonjour. The service advertises its public certificate fingerprint, never its bearer token. Windows advertises only the chosen LAN interface.
- Cached catalog, native searchable List, songs/albums/all-library/playlist downloads of original bytes with SHA-256 and byte-size verification.
- Persistent background URLSession queue, two concurrent transfers, pause/resume checkpoints and HTTP Range/ETag. iOS schedules background execution; force-quitting the app cancels system transfers until the app is reopened. PC must remain running and reachable on the same Wi-Fi.
- Bidirectional favorite and playlist edits. Offline operations are persisted and sent idempotently when the PC returns. Conflicting edits remain available in the Synchronization screen, where the user can cancel them.
- Embedded/imported artwork plus authenticated PC artwork, bounded thumbnail disk/memory caches and at most three cover requests.
- AVAudioPlayer for native formats (including verified FLAC), plus a bounded streaming Ogg Vorbis decoder. Original files are preserved; Ogg Opus and other unsupported variants produce an error rather than silent transcoding.
- Playback queue, seeking, lock-screen metadata/artwork/commands, background audio, headphone disconnect and interruption handling.
- Atomic library manifest remains backward compatible with 0.1/0.2. Identical bytes can retain multiple desktop identities without duplicate storage.

Performance changes isolate the playback clock from the full library view, move catalog decode/search/sort/grouping off the UI thread, debounce search, reuse native rows and decode thumbnail images off the main thread. Actual scroll smoothness must be verified on the user iPhone.

## Build

On macOS with Xcode 26+, install XcodeGen, then:

```sh
cd ios
xcodegen generate
xcodebuild build -project Undertone.xcodeproj -scheme Undertone -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath build CODE_SIGNING_ALLOWED=NO
```

The GitHub workflow runs on pushes to `codex/ios-companion`, or by manual dispatch after the workflow exists on the default branch. It requires no Apple account secrets. It does not publish a release or send the app to Apple.

## SideStore installation

1. Download the `Undertone-SideStore` Actions artifact; unpack the ZIP to obtain the IPA.
2. Install the IPA through iLoader, which successfully installed version 0.1 on the user device. SideStore signing remains a device-specific alternative.
3. Refresh the app before its free provisioning profile expires.
4. Keep the same signing account and bundle identity (`local.undertone.ios`). Do not uninstall the app to update it: uninstalling deletes local music.

Actual refresh/update preservation needs a device test with SideStore; it is not guaranteed merely by keeping a bundle identifier.

## Current limits

- PC connectivity still requires the same LAN; access over the internet is not implemented.
- Background transfer scheduling, app-update/signing preservation and real-device playback interruptions require iPhone acceptance testing.
- Ogg Opus and arbitrary exotic codecs are not covered by the Vorbis decoder.

## Acceptance on the real iPhone

- Import representative MP3/FLAC/AAC/M4A/WAV/OGG files; record which variants play. Unsupported formats must produce an error, not be transcoded silently.
- Play in airplane mode and with the PC switched off.
- Lock screen and use headphone / lock-screen controls; interrupt with a call.
- Relaunch; verify file identities and library persistence.
- Refresh signing / install a new IPA through SideStore; verify downloaded bytes survive.
- Check small-screen layout, Dynamic Type, VoiceOver, Reduce Transparency, and long titles.

References: [Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass), [background audio](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/playback), [GitHub macOS runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

## 0.4 playback convenience

Queue sheet: play next, append, reorder/remove upcoming tracks, clear upcoming, shuffle remaining tracks, repeat track/all. Queue is session-local; repeated additions move the existing entry rather than duplicate it. Manual Next bypasses repeat-one. Library sorting persists in UserDefaults; playlists retain their PC order. Recently added sorts local downloads/imports by added-at; the PC catalog has no timestamp and keeps its supplied order. Deferred physical-device checks are recorded in reports/IOS_DEVICE_CHECKS_LATER.md.
