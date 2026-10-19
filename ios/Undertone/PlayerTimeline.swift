import SwiftUI

enum PlayerTimePresentation {
    static func duration(_ value: Double) -> Double { value.isFinite ? max(0, value) : 0 }
    static func clamp(_ value: Double, duration: Double) -> Double {
        min(Self.duration(duration), value.isFinite ? max(0, value) : 0)
    }
    static func clock(_ value: Double) -> String {
        let seconds = Int(min(duration(value), Double(Int.max / 2)))
        if seconds >= 3600 { return "\(seconds / 3600):\(String(format: "%02d", (seconds / 60) % 60)):\(String(format: "%02d", seconds % 60))" }
        return "\(seconds / 60):\(String(format: "%02d", seconds % 60))"
    }
}

// Only this small view subscribes to the playback clock. Native Slider keeps
// its own gesture; there is no competing tap/drag recognizer on the scroll view.
struct PlayerTimeline: View {
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var clock: PlaybackClock
    let trackID: String?
    @State private var draft: Double?
    private var duration: Double { PlayerTimePresentation.duration(player.duration) }
    private var position: Double { PlayerTimePresentation.clamp(draft ?? clock.position, duration: duration) }

    var body: some View {
        VStack(spacing: 0) {
            Slider(value: Binding(get: { position }, set: { draft = PlayerTimePresentation.clamp($0, duration: duration) }),
                   in: 0...max(1, duration)) { editing in
                // Do not overwrite the first value delivered by the slider.
                if !editing {
                    if let draft, trackID == player.current?.id { player.seek(PlayerTimePresentation.clamp(draft, duration: duration)) }
                    draft = nil
                }
            }
            .frame(minHeight: 44).disabled(trackID == nil || duration == 0)
            .accessibilityLabel("Позиция воспроизведения")
            .accessibilityValue(PlayerTimePresentation.clock(position) + " из " + PlayerTimePresentation.clock(duration))
            .accessibilityIdentifier("playerTimeline")
            .accessibilityAdjustableAction { direction in
                guard duration > 0, trackID == player.current?.id else { return }
                let delta: Double
                switch direction { case .increment: delta = 5; case .decrement: delta = -5; @unknown default: return }
                player.seek(PlayerTimePresentation.clamp(position + delta, duration: duration)); draft = nil
            }
            HStack {
                Text(PlayerTimePresentation.clock(position)).accessibilityIdentifier("playerElapsed")
                Spacer()
                Text("−" + PlayerTimePresentation.clock(duration - position))
            }.font(.caption).monospacedDigit().foregroundStyle(.secondary)
        }
    }
}
