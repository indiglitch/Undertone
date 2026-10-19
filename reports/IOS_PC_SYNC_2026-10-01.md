# Undertone iOS 0.2 — PC library and original downloads

Implemented opt-in desktop HTTPS service, QR pairing with certificate pinning, Keychain credentials, cached catalog, original-file downloads with size/SHA-256 verification, local persistence and native Liquid Glass device controls.

Verification: frontend production build passed; desktop Rust check and default-feature Release build passed; standalone TLS smoke test passed authentication, catalog, byte/digest integrity and invalid IDs. Read-only smoke on the actual PC library exposed 904 tracks and transferred one 7,710,266-byte original with matching SHA-256. iOS simulator persistence/download/pairing tests passed; final workflow result and artifacts recorded below when available.

Before: iPhone could import only files already accessible through Files. After: pair with desktop QR, browse its catalog and download songs, albums or all available tracks.

PC executable: releases/ios/pc/Undertone-PhoneSync.exe. Start this build, open Settings → Музыка на iPhone → Подключить iPhone. On the same private IPv4 LAN, open iPhone Undertone → Устройства and scan QR. Permit camera and local-network access; permit Windows Firewall on the private network if prompted.

Keep iPhone app in the foreground during downloads. Restarting/stopping desktop service requires pairing again. Offline audio stays on the phone. Background resume, two-way playlists/likes, extracted cover art and additional decoders are follow-up work. Actual iPhone pairing, playback and update preservation have not been tested by the agent. User confirmed installation and launch of prior version using iLoader. Update using the same signing account and bundle identity; do not uninstall if preserving downloaded music.
Final iOS workflow 36911633522: success; 7 tests, zero failures; Release device build and strict ad-hoc signature verification succeeded. IPA metadata: version 0.2.0, local.undertone.ios. Native simulator Home screenshot inspected; Wi-Fi connection card and Liquid Glass tabs render correctly. Artifacts: releases/ios/0.2.0/Undertone-SideStore.ipa and qa-output/ios/0.2.0/Undertone-iPhone.png.

Persistent pairing fix: PC saves certificate/private key/token/port encrypted with current-user Windows DPAPI. Enabled access is remembered and started automatically at application setup; explicit disable pauses access without rotating identity. Verified original pairing and original-byte transfer across two standalone server process restarts; bearer-auth and enabled-preference tests passed. PC IP changes still require a new scan; no iOS update needed. Prior restart-invalidates instructions above are superseded. Source commit c0e2900.
