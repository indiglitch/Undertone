# Undertone for iPhone — native companion

Native SwiftUI client, deployment target iOS 26+. Uses the system Liquid Glass APIs rather than a web/CSS imitation. The requested iOS 27.0.1 device must be tested separately; no device compatibility result is implied by the deployment target.

## Implemented first milestone

- Home, searchable local library, on-device storage view, honest PC-connection placeholder.
- System glass tab bar, toolbar, mini-player, glass player controls; Reduce Transparency fallback for custom glass surfaces.
- Multiple-file import through Apple's Files picker, byte-for-byte copies in Application Support, streaming SHA-256 identities, duplicate suppression.
- Atomic versioned JSON manifest, reopens without reimport. This is the local MVP store; PC sync will use a separately versioned contract and preserve desktop `sync_id`.
- AVAudioPlayer, local queue, seeking, background-audio declaration, lock-screen metadata/remote commands, pause on interruptions or headphone disconnect.
- XcodeGen project and GitHub Actions workflow: simulator persistence tests → unsigned device build → `Payload/Undertone.app` IPA → artifact.

Version 0.2 adds PC pairing by QR (or pasted pairing JSON), certificate-pinned HTTPS, Keychain credentials, cached PC catalog, individual/album/all-library downloads and SHA-256/size verification. Enable access in desktop Settings → Music on iPhone. Both devices must share a private IPv4 LAN. The server is off by default; stopping/restarting it invalidates the pairing. Downloaded originals are independent of PC availability.

Downloads currently require the iPhone app to remain in the foreground; interrupted downloads can be retried, but byte-range resume and persistent background URLSession jobs are not implemented yet. Two-way playlists/likes, embedded cover artwork, and non-native decoding remain follow-up work. The waveform artwork is the Undertone fallback, not extracted cover art.

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

## Remaining sync work

- Persistent background downloads and byte-range resume.
- Catalog revisions, deletion tombstones and two-way likes/playlists.
- Embedded artwork and additional audio decoders.

## Acceptance on the real iPhone

- Import representative MP3/FLAC/AAC/M4A/WAV/OGG files; record which variants play. Unsupported formats must produce an error, not be transcoded silently.
- Play in airplane mode and with the PC switched off.
- Lock screen and use headphone / lock-screen controls; interrupt with a call.
- Relaunch; verify file identities and library persistence.
- Refresh signing / install a new IPA through SideStore; verify downloaded bytes survive.
- Check small-screen layout, Dynamic Type, VoiceOver, Reduce Transparency, and long titles.

References: [Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass), [background audio](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/playback), [GitHub macOS runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
