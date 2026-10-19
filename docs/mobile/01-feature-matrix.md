# Mobile specification coverage — Undertone 0.6

Source: user-supplied Spotify Mobile music-only specification dated 2026-10-02. User decision: personal player; social features excluded. Functional adaptation, not a pixel-perfect Spotify clone.

| Source sections | Implementation | Boundary / remaining work |
| --- | --- | --- |
| 1–3 shell/navigation | Liquid Glass Home/Search/Library/optional Create, mini-player, detail navigation, own URL scheme | No Spotify universal links/accounts |
| 4 search | Local + cached PC songs/albums/artists/playlists, filters, library search, history, own QR scanner | Genre browsing needs actual metadata; no Spotify Codes |
| 5–6 player | Mini/full player, seek/transport/favorite/queue, lyrics/video/sharing, originals | No recommendation autoplay |
| 7 gestures | Queue reorder/delete, library pin swipe, context menus | Leading song swipe adds next in queue |
| 8 actions | Queue next/end, favorites, playlists, entity navigation, file info, original export, QR, phone-copy removal | No invented credits/explicit flags/radio |
| 9 library | Bookmarks/favorites, unified PC/iPhone playlists, pins, mixed downloaded/remote tracks, search/sort | Grid applies to saved albums; unified entity grid remains |
| 10 folders | Removed by the user's updated requirements | Legacy fields decoded only for compatibility |
| 11 playlist | Header/description/play/shuffle/download, add/remove/reorder, bulk actions, copy, imported cover | PC order edits check baseline; whole-playlist deletion undo remains |
| 12 visibility | All playlists personal | Public/collaborative excluded |
| 13 cover | Real image import using Files | Crop/stickers/text/composition remain; cover device-local |
| 14 likes | Local + PC favorites, download, playlist from result | No Premium restrictions |
| 15 album | Art, real year/track number where provided, save/play/shuffle/download/share/code | No invented credits |
| 16 artist | Private bookmark, tracks, actual albums, play/shuffle/share | Popularity/biography/tours/merch absent from source |
| 17 hiding | Durable hide/unhide with PC aliases, dimmed local rows, automatic queue skips, reset in settings | Explicitly opening a hidden track can still play it; PC library unchanged |
| 18 queue | Next/end, reorder/remove/multi-select/clear/shuffle, repeat, persistence | Duplicate add moves existing entry |
| 19 recents | Actual playback/search history and clear confirmation | Device-local, max 200 tracks / 20 queries |
| 20 lyrics | Real PC text/timed lines, LRC/TXT import/cache, highlight/autoscroll/tap-seek, preview/share | Translation and selected-line share card remain |
| 21 Canvas | User-provided muted looped video, preference, background pause | No Spotify assets |
| 22 video | MP4/MOV/M4V import, position transfer between audio/video | Assumes aligned clip; correspondence metadata/landscape remain |
| 23 local files | Files import, local collection, metadata, playlists/queue/export | Android excluded |
| 24 downloads | Original bytes/SHA/size, persistent background queue, progress/pause/resume/retry/cancel | Force-quit scheduling OS-controlled; no completion notification |
| 25 offline | Explicit mode stops PC requests; downloaded audio/cached lyrics work | Hardware acceptance pending |
| 26 data | Same-LAN PC contract | No internet streaming; cellular/data-saver controls absent |
| 27 quality | Always original format/bytes | No re-encoding bitrate selector |
| 28 settings | Repeat/shuffle, paused restoration, system-decoder crossfade 0–12s, headphones/lock-screen | Gapless/normalization/Automix remain; Vorbis without overlap; Smart Shuffle inapplicable |
| 29 explicit | No invented flags | Needs actual source flags before filter |
| 30–31 display/menu | Create/lyrics/visual preferences, Home avatar settings/PC menu | Profile excluded |
| 32–35 social | Excluded by explicit user decision | No accounts/followers/blocking/publishing |
| 36 share | OS share, originals, Undertone links/QR | Only object identity, never bearer token; recipient needs object in own library |
| 37–39 chats/updates/push | Social functions excluded | In-app local download status; notifications remain |
| 40 external | Background audio, Now Playing art/metadata/commands | WidgetKit remains; Android excluded |
| 41 actions | Common song menus on Home/Search/collections/queue/player; album and playlist menus | No profiles/other-user playlists or folders |
| 42 dialogs | Create/import, phone-copy delete/undo, trash/history confirmation, sync conflicts | Whole-playlist deletion undo remains |
| 43 errors | Short nonblocking error popup; network/pairing/catalog/download/playback/import/lyrics/video errors and empties | Device permission/interruption checks deferred |
| 44–45 platform | Personal iOS player, standard share/Files/permissions | Free/Premium/Android distinctions inapplicable |
| 46–47 persistence | Atomic library/personal/player data, durable shared-playlist offline operations and legacy migration, sync/download queues, Keychain/DPAPI | Bookmarks/history remain device-local; phone-only originals need a PC identity before their playlist edits synchronize; player restores paused |
| 48 exclusions | No podcasts/audiobooks/service-only content | Preserved |
| 49 visual audit | Undertone adaptation, native/browser checks | Not a pixel-perfect Spotify clone; physical accessibility checks pending |
| 50 docs | Scope, matrix, report, device checklist | This matrix records outstanding requirements |
| 51 sources | Supplied document used as requirements | No Spotify APIs/content |

Next: playlist undo/entity grid; cover composition/lyrics sharing/video landscape; audio-engine gapless/normalization and WidgetKit/provisioning. Browser preview uses demonstration data and simulated playback/downloads. Hardware acceptance is separate from compilation and deterministic tests.
