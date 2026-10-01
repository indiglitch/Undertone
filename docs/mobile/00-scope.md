# Undertone mobile — adaptation of the supplied 2026-10-02 specification

Authority: user requested implementing the supplied specification in Undertone context and explicitly excluded social/account features. Original spec: C:/Users/nikita/Downloads/spotify_mobile_music_only_spec_2026-10-02.md.

Product contract: personal iOS music player; Windows PC is the paired catalog source; downloads preserve original bytes; no subscriptions, DRM expiration, mandatory online check, transcoding or recommendation feed. Single-track downloads stay available. Native Liquid Glass remains the presentation language.

## Implementation surface

- Shell: Home / Search / Library / optional Create. Settings and PC management accessible from Home toolbar. Persistent mini-player across navigation.
- Search: cached PC + local catalog; song/album/artist/playlist filters, history, entity detail navigation. Library search remains separate.
- Library: favorites, saved albums/artists, playlists, nested folders, pins, downloaded and local-file filters, list/grid presentation. Save/follow means a private library bookmark.
- Create: personal playlist/folder; imports use iOS Files. PC-origin playlists keep bidirectional durable operation sync; phone-only imports use local playlists. Folders/pins/bookmarks are device-local because Windows has no corresponding model.
- Entity actions: play/shuffle downloaded subset, download originals, artist/album navigation, favorites, add to playlist, queue, bulk selection, export originals via iOS share sheet. Metadata only from actual catalog/files; do not invent credits, explicit labels, releases or tour information.
- Player: persisted queue/track/position/repeat restored paused, context controls, history, offline lyrics where supplied, ordinary shuffle, lock-screen/Bluetooth controls. No recommendation autoplay or Spotify radio.
- Offline/storage: explicit offline mode stops PC requests/transfers, removes phone copies without deleting PC originals, reversible phone-file removal, queue retry/error states, bytes.
- Settings: Create visibility, offline, lyrics preview, local visuals and PC connection. Audio remains original quality; no bitrate selector. OS owns camera/share/media permission UI.
- Local extras: lyrics from paired PC database or imported LRC/TXT, original-file sharing, personal playlist export. Music videos/Canvas require actual user-provided assets, not fabricated Spotify media.

## Intentionally not applicable

Accounts/profiles/followers/blocking/messages/public playlists/collaboration/social updates/push/tickets/merch: excluded by user. Android, Spotify links/codes/service catalog/market restrictions/Premium entitlement: not an Undertone feature. QR scanner remains the actual paired-PC scanner. No Spotify service APIs or content are used.

Widget extensions, native gapless/crossfade/normalization, translated lyrics and video timestamp correspondence require separate actual platform/media support. A switch with no working implementation is unacceptable; these must remain explicit remaining work rather than fake controls.

## Verification boundary

Record implemented and remaining requirements in reports. Native compile and behavior tests plus live browser counterpart verification are required. Browser demo interactions are not proof of native audio, background scheduling or physical iPhone performance. Deferred device checks remain reports/IOS_DEVICE_CHECKS_LATER.md.
