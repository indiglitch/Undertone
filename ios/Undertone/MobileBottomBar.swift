import SwiftUI

// TabView owns the bar and home-indicator insets. Never add their heights to pages.
struct MobilePlayerAccessory<Accessory: View>: ViewModifier {
    let enabled: Bool
    let accessory: Accessory

    @ViewBuilder func body(content: Content) -> some View {
        if #available(iOS 26.1, *) {
            content.tabViewBottomAccessory(isEnabled: enabled) { accessory }
        } else {
            content
        }
    }
}

// iOS 26.0 has no isEnabled accessory API. A real safe-area inset avoids an
// empty accessory reserving space, without conditionally replacing the TabView.
struct MobilePlayerInset<Accessory: View>: ViewModifier {
    let enabled: Bool
    let accessory: Accessory

    @ViewBuilder func body(content: Content) -> some View {
        if #available(iOS 26.1, *) {
            content
        } else {
            content.safeAreaInset(edge: .bottom, spacing: 0) {
                if enabled {
                    accessory
                        .modifier(GlassSurface(radius: 24))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                }
            }
        }
    }
}

struct MobileMiniPlayer: View {
    @EnvironmentObject private var player: MusicPlayer
    @Environment(\.tabViewBottomAccessoryPlacement) private var placement
    @Environment(\.dynamicTypeSize) private var typeSize
    let song: Song
    let openPlayer: () -> Void

    private var compact: Bool { placement == .inline || typeSize.isAccessibilitySize }

    var body: some View {
        HStack(spacing: 0) {
            Button(action: openPlayer) {
                HStack(spacing: 8) {
                    CoverArtwork(id: song.syncID ?? song.id, size: 32)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(song.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                        if !compact { Text(song.artist).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                    }
                    Spacer(minLength: 0)
                }
                .frame(minWidth: 44, maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .layoutPriority(-1)
            .accessibilityLabel("OPEN PLAYER")
            .accessibilityValue(song.title + ", " + song.artist)
            .accessibilityIdentifier("miniPlayerOpen")

            Button { player.toggle() } label: {
                Image(systemName: player.playing ? "pause.fill" : "play.fill")
                    .frame(width: 44, height: 44).contentShape(Rectangle())
            }
            .accessibilityLabel(player.playing ? "PAUSE" : "PLAY")
            .accessibilityIdentifier("miniPlayerToggle")

            if !compact {
                Button { Task { await player.advance(1) } } label: {
                    Image(systemName: "forward.end.fill")
                        .frame(width: 44, height: 44).contentShape(Rectangle())
                }
                .accessibilityLabel("NEXT TRACK")
                .accessibilityIdentifier("miniPlayerNext")
                Menu { TrackContextMenu(track: UnifiedTrack(song)) } label: {
                    MusicMenuLabel()
                }
                .accessibilityLabel("Меню " + song.title)
                .accessibilityIdentifier("miniPlayerMenu")
            }
        }
        .buttonStyle(PressFeedbackStyle())
        .padding(.horizontal, 8).padding(.vertical, 4)
        .contextMenu { TrackContextMenu(track: UnifiedTrack(song)) }.menuOrder(.fixed)
    }
}
