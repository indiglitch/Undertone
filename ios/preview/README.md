# Live iPhone UI preview

Run from repository root: `npm run preview:ios`. Open http://127.0.0.1:1431/. The visible Codex browser pane can stay beside the chat. Vite reloads browser markup/styles automatically. Editing ios/Undertone/*.swift updates the source-change indicator; SwiftUI is not compiled or automatically translated. When developing native UI, update this web counterpart explicitly and verify the IPA separately.

Demo songs are synthetic UI data, with no actual media. Playback, pairing and downloads are simulated. Demo playlists, pins, favorites and preferences persist in browser localStorage. No real user library, token or filesystem writes are exposed. Device frame scales with window height. Native simulator/device testing remains required for actual Liquid Glass and audio/background behavior.
