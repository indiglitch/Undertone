# Phase 14 — initial release audit

Current checkout is the source of truth; prior Phase1–13 changes remain dirty/uncommitted. No publication/tag/commit requested.

| Severity | Confirmed finding | Action |
| --- | --- | --- |
| BLOCKER | None confirmed from static audit; native/runtime/build/signing checks still pending | Validate actual executable and package before verdict |
| HIGH | Player vertical resize handle + custom height storage contradict final product decision | Remove handle/height logic/storage application/copy; token height |
| HIGH | Native volume starts .65; frontend never persists/restores user volume | Lightweight existing preference storage; successful ACK only; safe default/clamp/mute |
| HIGH | No top-level React error boundary; unexpected render failure gives blank UI | Minimal restart fallback without raw stack |
| MEDIUM | No Windows media controls/SMTC integration found repository-wide | Standard Windows media bridge to existing player, no new engine |
| MEDIUM | Window size/position/maximized state not remembered | Small standard window-state integration with visible monitor fallback |
| LOW | MediaShelf module has no consumers | Delete after full reference check; retain historical reports |
| LOW | default_scan_folder has compiler unused-braces warning | Remove unnecessary braces |

Pending evidence (not yet diagnosed as defects): production signing/manifest, actual startup/close/reopen/audio/file picker/filesystem/LRCLIB/PhoneSync, native WebView DPI/keyboard/rendering,25000+ library performance, dead CSS/console/secrets.

User library/files remain untouched. Native testing uses a separate portable fixture directory/profile. No feature expansion/redesign/new pages.

## Native/build findings and closure

| Severity | Confirmed during QA | Closure |
| --- | --- | --- |
| HIGH | Maximized Player width ≈1248 despite 2560 client width | flex:1/width:100%; native width2528 with standard16px insets |
| HIGH | Release binary contained developer user/workspace panic paths | Local/CI path remapping; final ASCII/UTF-16 scan passes |
| HIGH | Clean portable check failed without dist; CI did not create it first | test:portable now builds frontend; real check/test without existing dist passes |
| HIGH | Canonical packaging under Windows PowerShell waited for password prompt | Release helper uses --ci; npm run package produces installer + signature without prompt |

All initial HIGH/MEDIUM implementation findings were addressed. Final open confirmed BLOCKER=0/HIGH=0. Full evidence and residual MEDIUM/LOW: [PHASE14_RELEASE_READINESS.md](PHASE14_RELEASE_READINESS.md).
