# Undertone 0.5.1 — compact mobile layout

Scope: the user's two browser annotations at http://127.0.0.1:1431/ — overlapping current-song UI and an oversized Home page. Applied to the browser counterpart and native iOS, preserving playback/library behavior.

References: [Spotify mobile screenshot](https://www.tryexponent.com/courses/app-critique/app-critique-spotify), [Spotify mobile Home screenshot](https://www.techloy.com/how-to-play-local-mp3-files-on-an-iphone/). Used compact quick-access tiles, music-first content and separated player/tabs as visual references; retained Undertone colors and Liquid Glass. Native placement uses Apple's [tabViewBottomAccessory](https://developer.apple.com/documentation/swiftui/view/tabviewbottomaccessory(isenabled:content:)).

| Before | After |
| --- | --- |
| Large promotional Home hero | Compact two-column quick-access tiles: favorites, downloads, local files, PC, up to two real personal playlists |
| Two oversized statistics cards | Small inline track count/original-quality information; storage remains in Settings |
| Duplicate PC connection block below music | PC access in the quick grid; import and settings remain available |
| Large Home title, wide spacing and album artwork | Inline native Home title, 24px web heading; narrower horizontal margins/section spacing; 116px album artwork and 44px native song artwork |
| Web mini-player and navigation independently absolutely positioned | One bottom dock in normal flex layout, explicit 8px unscaled gap, content flexes above it; no reserved empty player space when absent |
| Native mini-player inserted inside every NavigationStack | One system TabView bottom accessory across tabs; compact 36px artwork, 44px transport hit targets, system-provided surface |
| Tall developer sidebar pushed the phone below the browser viewport | Sticky phone stage fits the visible window; mobile-width layout retains ordinary flow |
| Existing version 0.5.0 | New iOS patch version 0.5.1; music and pairing identity unchanged |
| One large root SwiftUI expression | Separate tabScreen/tabPage/accessory components keep type checking bounded; iOS 26.0 uses the original accessory API and 26.1+ uses explicit enabled state |

Verification: browser production build passed. Live browser checks covered populated/empty Home, Library, pause/play and scroll. Geometry at the observed 720px browser height: phone top 32/bottom 688; player bottom 612.19, tabs top 618.34 (positive separation); content ends above player. Empty state has no mini-player and content ends above tabs. Screenshot: qa-output/ios-preview/0.5.1-compact-home.png.

Native source commit 50df99d: [GitHub run 36947991770](https://github.com/indiglitch/Undertone/actions/runs/36947991770) succeeded with 32/32 tests and zero failures, Release device build and IPA signature/package verification. Earlier compiler failures identified the API's iOS 26.1 availability and an overly complex expression; both fixed in the final source. Log: qa-output/ios/0.5.1-36947991770.log.

Artifact: releases/ios/0.5.1/Undertone-SideStore.ipa. Inspected version 0.5.1, bundle local.undertone.ios, minimum iOS 26.0, 1,144,151 bytes. SHA-256: 7ad7e4501368674a5ad1e06c6fd0c050aebe3ec8bfaf83118507c47d6a3738eb. Native empty-Home screenshot inspected at qa-output/ios/0.5.1/Undertone-iPhone.png; compact header/tiles are visible. Populated native accessory placement, large-font behavior and real iPhone audio remain separate device checks; browser demonstration is not an iOS simulator. Update through the existing iLoader path without uninstalling.
