import SwiftUI

private enum HomeDestination: Hashable {
    case liked, tracks, playlists, recent, albums
}

// Presentation ordering only; playlist contents, recents and playback stay in
// their existing stores and use the existing collection links / track rows.
enum MobileHomeOrder {
    static func playlists(_ items: [PCPlaylist], pins: Set<String>) -> [PCPlaylist] {
        items.sorted { a, b in
            let first = pins.contains(a.id), second = pins.contains(b.id)
            if first != second { return first }
            let comparison = a.name.localizedStandardCompare(b.name)
            return comparison == .orderedSame ? a.id < b.id : comparison == .orderedAscending
        }
    }

    static func albums(_ names: Set<String>, pins: Set<String>) -> [String] {
        names.sorted { a, b in
            let first = pins.contains("album:" + a), second = pins.contains("album:" + b)
            if first != second { return first }
            let comparison = a.localizedStandardCompare(b)
            return comparison == .orderedSame ? a < b : comparison == .orderedAscending
        }
    }
}

// Keep scroll state local to this scroll view, rather than publishing every
// scroll update through RootView and its TabView / player accessory.
private struct HomeScrollMemory: ViewModifier {
    var active: Bool
    var horizontal = false
    @State private var position = ScrollPosition(edge: .top)
    @State private var offset: CGFloat?
    @State private var userScrolling = false

    func body(content: Content) -> some View {
        content.scrollPosition($position)
            .onScrollPhaseChange { _, phase in
                userScrolling = phase == .interacting || phase == .decelerating
            }
            .onScrollGeometryChange(for: CGFloat.self) { geometry in
                horizontal ? max(0, geometry.contentOffset.x + geometry.contentInsets.leading)
                    : max(0, geometry.contentOffset.y + geometry.contentInsets.top)
            } action: { _, value in
                // Ignore temporary layout changes while pushing / switching tabs.
                if active && userScrolling { offset = value }
            }
            .onAppear { restore() }
            .onChange(of: active) { _, value in if value { restore() } }
    }

    private func restore() {
        guard let offset else { return }
        if horizontal { position.scrollTo(x: offset) }
        else { position.scrollTo(y: offset) }
    }
}

struct MobileHomeView: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var personal: PersonalLibrary
    @Environment(\.dynamicTypeSize) private var typeSize
    var active: Bool
    let openComputer: () -> Void
    @State private var recents: [UnifiedTrack] = []

    private var playlists: [PCPlaylist] { MobileHomeOrder.playlists(pc.collections.playlists, pins: personal.state.pins) }
    private var albums: [String] {
        MobileHomeOrder.albums(Set(library.albums.keys).union(pc.albums.keys), pins: personal.state.pins)
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                shortcuts
                if !library.songs.isEmpty || !pc.tracks.isEmpty { continuation }
                if !playlists.isEmpty { frequentPlaylists }
                if !albums.isEmpty { albumShelf }
                if library.songs.isEmpty && pc.tracks.isEmpty { emptyLibrary }
            }
            .padding(.horizontal, 16).padding(.top, 8)
        }
        .modifier(SoftScrollEdges()).scrollContentBackground(.hidden)
        .modifier(HomeScrollMemory(active: active))
        .navigationDestination(for: HomeDestination.self) { destination in
            switch destination {
            case .liked: MusicLibraryView(favoritesOnly: true).navigationTitle("LIKED TRACKS")
            case .tracks: MusicLibraryView(showRoot: false).navigationTitle("ALL TRACKS")
            case .playlists: HomePlaylistsView().navigationTitle("PLAYLISTS")
            case .recent: RecentListeningView()
            case .albums: AllAlbumsView()
            }
        }
        .task(id: "\(library.revision)|\(pc.catalogRevision)|\(personal.revision)") {
            let local = library.songs, remote = pc.tracks, order = personal.state.recents
            let result = await Task.detached(priority: .userInitiated) {
                Array(TrackCatalog.merged(local: local, remote: remote, order: order).prefix(3))
            }.value
            if !Task.isCancelled { recents = result }
        }
    }

    private var columns: [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: 8), count: typeSize.isAccessibilitySize ? 1 : 2)
    }

    private var shortcuts: some View {
        LazyVGrid(columns: columns, spacing: 8) {
            NavigationLink(value: HomeDestination.liked) {
                shortcut("LIKED TRACKS", icon: "heart.fill")
            }.accessibilityIdentifier("homeLikedTracks")
            NavigationLink(value: HomeDestination.tracks) {
                shortcut("ALL TRACKS", icon: "music.note")
            }.accessibilityIdentifier("homeAllTracks")
            NavigationLink(value: HomeDestination.playlists) {
                shortcut("PLAYLISTS", icon: "music.note.list")
            }.accessibilityIdentifier("homePlaylists")
            Button(action: openComputer) {
                shortcut(pc.address.isEmpty ? "CONNECT PC" : "COMPUTER", icon: "desktopcomputer")
            }.accessibilityIdentifier("homeComputer")
        }.buttonStyle(PressFeedbackStyle())
    }

    private func shortcut(_ title: String, icon: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon).font(.system(size: 20)).foregroundStyle(Color.undertone).frame(width: 24)
            Text(title).font(.caption.weight(.semibold)).lineLimit(2)
            Spacer(minLength: 0)
        }
        .padding(12).frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
        .contentShape(RoundedRectangle(cornerRadius: 16))
    }

    private var continuation: some View {
        VStack(alignment: .leading, spacing: 8) {
            NavigationLink(value: HomeDestination.recent) {
                heading("RECENTLY PLAYED", detail: "VIEW ALL")
            }.accessibilityIdentifier("openRecentlyPlayed")
            if recents.isEmpty {
                Text("Слушай музыку — последние треки появятся здесь.")
                    .font(.subheadline).foregroundStyle(.secondary)
            } else {
                Text("Продолжи с недавних треков")
                    .font(.caption).foregroundStyle(.secondary)
                LazyVStack(spacing: 4) {
                    ForEach(recents) { track in
                        UnifiedTrackRow(track: track, queue: recents.map(\.song))
                    }
                }
            }
        }
    }

    private var frequentPlaylists: some View {
        VStack(alignment: .leading, spacing: 8) {
            NavigationLink(value: HomeDestination.playlists) {
                heading("PLAYLISTS", detail: "VIEW ALL")
            }.accessibilityIdentifier("openHomePlaylists")
            LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
                ForEach(playlists.prefix(4)) { playlist in
                    SharedPlaylistLink(playlist: playlist)
                        .font(.subheadline)
                        .padding(.leading, 12).padding(.trailing, 4).padding(.vertical, 6)
                        .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
                        .background(.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 16))
                }
            }
        }
    }

    private var albumShelf: some View {
        VStack(alignment: .leading, spacing: 8) {
            NavigationLink(value: HomeDestination.albums) {
                heading("ALBUMS", detail: "VIEW ALL")
            }.accessibilityIdentifier("openAllAlbums")
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 12) {
                    ForEach(albums, id: \.self) { AlbumTile(name: $0) }
                }
            }.modifier(HomeScrollMemory(active: active, horizontal: true))
        }
    }

    private func heading(_ title: String, detail: String) -> some View {
        HStack(spacing: 8) {
            Text(title).font(.headline)
            Spacer(minLength: 4)
            Text(detail).font(.caption).foregroundStyle(.secondary)
            Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.secondary)
        }
        .frame(minHeight: 44).contentShape(Rectangle())
    }

    private var emptyLibrary: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Начни с любимого альбома").font(.headline)
            Text("Подключи компьютер или добавь аудиофайлы через меню инструментов наверху.")
                .font(.subheadline).foregroundStyle(.secondary)
        }
    }
}

private struct HomePlaylistsView: View {
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var personal: PersonalLibrary

    var body: some View {
        List {
            ForEach(MobileHomeOrder.playlists(pc.collections.playlists, pins: personal.state.pins)) {
                SharedPlaylistLink(playlist: $0).modifier(CollectionRowStyle())
            }
            if pc.collections.playlists.isEmpty {
                CollectionEmptyView(title: "Нет плейлистов", detail: "Создай плейлист в Library или Create.", icon: "music.note.list")
            }
        }.modifier(CollectionListStyle())
    }
}
