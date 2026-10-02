import SwiftUI
import UniformTypeIdentifiers

extension Color {
    static let undertone = Color(red: 0.68, green: 0.49, blue: 1)
    static let canvas = Color(red: 0.035, green: 0.035, blue: 0.065)
}

struct GlassSurface: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    var radius: CGFloat = 28
    func body(content: Content) -> some View {
        if reduceTransparency {
            content.background(Color(red: 0.14, green: 0.12, blue: 0.20), in: RoundedRectangle(cornerRadius: radius))
        } else {
            content.glassEffect(.regular, in: RoundedRectangle(cornerRadius: radius))
        }
    }
}

struct Artwork: View {
    var size: CGFloat = 64
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.22)
                .fill(LinearGradient(colors: [.undertone.opacity(0.55), Color(red: 0.12, green: 0.08, blue: 0.25)], startPoint: .topLeading, endPoint: .bottomTrailing))
            HStack(spacing: size * 0.065) {
                ForEach(Array([0.28, 0.52, 0.76, 0.42, 0.60, 0.26].enumerated()), id: \.offset) { _, height in
                    Capsule().fill(.white.opacity(0.85)).frame(width: size * 0.045, height: size * height)
                }
            }
        }
        .frame(width: size, height: size)
        .overlay(RoundedRectangle(cornerRadius: size * 0.22).stroke(.white.opacity(0.1), lineWidth: 1))
        .accessibilityHidden(true)
    }
}

enum MobileTab: String, CaseIterable {
    case home = "Главная", search = "Поиск", library = "Библиотека", create = "Создать"
    var icon: String { switch self { case .home: return "house"; case .search: return "magnifyingglass"; case .library: return "square.stack"; case .create: return "plus" } }
}

private struct CompactPlayerAccessory<Accessory: View>: ViewModifier {
    let enabled: Bool
    let accessory: Accessory
    @ViewBuilder func body(content: Content) -> some View {
        if #available(iOS 26.1, *) {
            content.tabViewBottomAccessory(isEnabled: enabled) { accessory }
        } else {
            content.tabViewBottomAccessory { if enabled { accessory } }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var personal: PersonalLibrary
    @EnvironmentObject private var sharing: ShareCoordinator
    @EnvironmentObject private var routes: RouteCoordinator
    @AppStorage("createTabVisible") private var createVisible = true
    @AppStorage("offlineMode") private var offline = false
    @State private var devicePresented = false
    @State private var creating = false
    @State private var tab: MobileTab = .home
    @State private var importer = false
    @State private var expandedPlayer = false

    var body: some View {
        ZStack {
            Color.canvas.ignoresSafeArea()
            RadialGradient(colors: [.undertone.opacity(0.19), .clear], center: .topTrailing, startRadius: 0, endRadius: 420).ignoresSafeArea()
            tabs
        }
        .overlay(alignment:.top) { if !expandedPlayer && routes.route == nil { AppErrorToast().padding(.horizontal,16).padding(.top,8) } }
        .task {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--preview-search") { tab = .search }
            #endif
        }
        .onChange(of: player.current?.id) { _, id in
            #if DEBUG
            if id != nil && ProcessInfo.processInfo.arguments.contains("--preview-player") { expandedPlayer = true }
            #endif
        }
        .onChange(of:createVisible) { _, value in if !value && tab == .create { tab = .home } }
        .sheet(isPresented:$creating) { CreateMusicView() }
        .sheet(isPresented:$devicePresented) { NavigationStack { ScrollView { PCDeviceView().padding(22) }.navigationTitle("COMPUTER").toolbar { ToolbarItem(placement:.topBarTrailing) { Button("CLOSE") { devicePresented = false } } } } }
        .sheet(item:$sharing.payload) { SystemShareSheet(items:$0.items) }
        .sheet(item:$routes.route) { MusicRouteView(route:$0) }
        .sheet(item:$routes.code) { MusicCodeView(url:$0.url) }
        .fileImporter(isPresented: $importer, allowedContentTypes: [.audio], allowsMultipleSelection: true) { result in
            switch result {
            case .success(let urls): Task { await library.importFiles(urls) }
            case .failure(let error): library.error = error.localizedDescription
            }
        }
        .sheet(isPresented: $expandedPlayer) { PlayerView().environmentObject(player).environmentObject(player.clock) }

    }

    private var tabs: some View {
        TabView(selection: $tab) {
            ForEach(MobileTab.allCases.filter { createVisible || $0 != .create }, id: \.self) { item in
                tabScreen(item).tabItem { Label(item.rawValue, systemImage: item.icon) }.tag(item)
            }
        }.modifier(CompactPlayerAccessory(enabled: player.current != nil, accessory: playerAccessory))
    }
    private var playerAccessory: some View {
        Group { if let song = player.current { miniPlayer(song) } }
    }
    private func tabScreen(_ item: MobileTab) -> some View {
NavigationStack {
                        tabPage(item)
                        .navigationTitle(item.rawValue)
                        .navigationBarTitleDisplayMode(item == .home || item == .search ? .inline : .large)
                        .toolbar {
                            if item == .home {
                                ToolbarItem(placement: .topBarTrailing) {
                                    Button("SYNC", systemImage:"arrow.triangle.2.circlepath") {
                                        if pc.address.isEmpty { devicePresented = true }
                                        else { Task { await pc.migratePlaylists(personal,library:library); await pc.refresh() } }
                                    }.disabled(pc.refreshing).accessibilityIdentifier("syncLibrary").buttonStyle(PressFeedbackStyle())
                                    .padding(.trailing, 12)
                                }.sharedBackgroundVisibility(.hidden)
                                ToolbarItem(placement: .topBarTrailing) {
                                    Button("ADD FILES", systemImage: "plus") { importer = true }
                                        .disabled(library.importing || pc.downloading != nil)
                                }.sharedBackgroundVisibility(.hidden)
                            }
                        }
                        .toolbar {
                            if item == .home {
                                ToolbarItem(placement:.topBarLeading) { Menu("PERSONAL LIBRARY",systemImage:"person.crop.circle") {
                                    NavigationLink { MobileSettingsView() } label: { Label("SETTINGS",systemImage:"gearshape") }
                                    NavigationLink { RecentListeningView() } label: { Label("RECENTLY PLAYED",systemImage:"clock") }
                                    Button("COMPUTER",systemImage:"desktopcomputer") { devicePresented = true }
                                } }
                            }
                        }
                    }
    }
    private func tabPage(_ item: MobileTab) -> some View {
Group {
                            if item == .library { LibraryHubView() }
                            else if item == .search { MobileSearchView() }
                            else if item == .create { VStack(spacing:24) { Image(systemName:"plus.circle.fill").font(.system(size:60)).foregroundStyle(Color.undertone); Text("Твоя коллекция").font(.title.bold()); Button("CREATE PLAYLIST") { creating = true }.buttonStyle(.glassProminent); Button("IMPORT FILES") { importer = true }.buttonStyle(.glass) }.frame(maxWidth:.infinity,maxHeight:.infinity) }
                            else {
                                ScrollView {
                                    LazyVStack(alignment: .leading, spacing: 28) {
                                        home
                                    }.padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 20)
                                }.modifier(SoftScrollEdges()).scrollContentBackground(.hidden)
                            }
                        }
    }

    private var home: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack {
                Text("\(library.songs.count) треков на iPhone")
                Spacer(minLength: 4)
                Text("Оригинальное качество")
            }.font(.caption2).foregroundStyle(.secondary)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                NavigationLink { MusicLibraryView(favoritesOnly:true).navigationTitle("LIKED TRACKS") } label: { homeShortcut("LIKED TRACKS",icon:"heart.fill") }
                NavigationLink { MusicLibraryView(showRoot:false).navigationTitle("ALL TRACKS") } label: { homeShortcut("ALL TRACKS",icon:"music.note") }
                Button { devicePresented = true } label: { homeShortcut(pc.address.isEmpty ? "CONNECT PC" : "PC LIBRARY",icon:"desktopcomputer") }
                ForEach(pc.collections.playlists.prefix(2)) { playlist in
                    SharedPlaylistLink(playlist:playlist).frame(maxWidth:.infinity,minHeight:44,alignment:.leading).padding(8).background(.white.opacity(0.06),in:RoundedRectangle(cornerRadius:12))
                }
            }.buttonStyle(PressFeedbackStyle())
            if library.songs.isEmpty && pc.tracks.isEmpty {
                emptyLibrary
            } else {
                sectionHeading(personal.state.recents.isEmpty ? "Недавно добавлено" : "RECENTLY PLAYED", detail: "Твоя библиотека")
                songList(homeTracks)
                sectionHeading("Альбомы", detail: "\(Set(library.albums.keys).union(pc.albums.keys).count)")
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(alignment: .top, spacing: 12) {
                        ForEach(Array(Set(library.albums.keys).union(pc.albums.keys)).sorted(),id: \.self) { AlbumTile(name:$0) }
                    }
                }
            }

        }
    }

    private var emptyLibrary: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Начни с любимого альбома").font(.title3.weight(.semibold))
            Text("Добавь аудиофайлы из приложения «Файлы». Undertone сохранит оригиналы и сможет играть их офлайн.")
                .font(.subheadline).foregroundStyle(.secondary)
        }.padding(.vertical, 6)
    }

    private func homeShortcut(_ title: String, icon: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName:icon).font(.title3).foregroundStyle(Color.undertone).frame(width:28)
            Text(title).font(.subheadline.weight(.semibold)).lineLimit(2)
            Spacer(minLength:0)
        }.frame(maxWidth:.infinity,alignment:.leading).frame(minHeight:44).padding(8)
            .background(.white.opacity(0.06),in:RoundedRectangle(cornerRadius:12))
    }
    private func sectionHeading(_ title: String, detail: String) -> some View {
        HStack { Text(title).font(.title3.bold()); Spacer(); Text(detail).font(.caption).foregroundStyle(.secondary) }
    }
    private var homeTracks: [UnifiedTrack] {
        let all = TrackCatalog.merged(local:library.songs,remote:pc.tracks,sort:.newest)
        return Array((personal.state.recents.isEmpty ? all : TrackCatalog.merged(local:library.songs,remote:pc.tracks,order:personal.state.recents)).prefix(8))
    }
    private func songList(_ tracks: [UnifiedTrack]) -> some View {
        LazyVStack(spacing:4) { ForEach(tracks) { track in UnifiedTrackRow(track:track,queue:tracks.map(\.song)) } }
    }
    private func start(_ song: Song, queue: [Song]) {
        Task { await player.play(song, queue: queue, repository: library.repository) }
    }
    private func miniPlayer(_ song: Song) -> some View {
        HStack(spacing: 12) {
            Button { expandedPlayer = true } label: {
                HStack(spacing: 12) {
                    CoverArtwork(id: song.syncID ?? song.id, size: 36)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(song.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                        Text(song.artist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }.contentShape(Rectangle())
            }.buttonStyle(PressFeedbackStyle()).accessibilityLabel("OPEN PLAYER")
            Button(player.playing ? "PAUSE" : "PLAY", systemImage: player.playing ? "pause.fill" : "play.fill") { player.toggle() }
                .labelStyle(.iconOnly).frame(width: 44, height: 44)
            Button("NEXT TRACK", systemImage: "forward.end.fill") { Task { await player.advance(1) } }
                .labelStyle(.iconOnly).frame(width: 44, height: 44)
            Menu { TrackContextMenu(track:UnifiedTrack(song)) } label: { Image(systemName:"ellipsis").frame(width:44,height:44) }.accessibilityLabel("Меню " + song.title)
        }.padding(.horizontal, 12).padding(.vertical, 4)
            .contextMenu { TrackContextMenu(track:UnifiedTrack(song)) }
    }
}

struct PlayerView: View {
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var playbackClock: PlaybackClock
    @EnvironmentObject private var personal: PersonalLibrary
    @EnvironmentObject private var pc: PCConnection
    @Environment(\.dismiss) private var dismiss
    @State private var queuePresented = false
    @State private var seeking = false
    @State private var seekPosition = 0.0
    private func clock(_ value: Double) -> String {
        let seconds = Int(max(0, value.isFinite ? value : 0))
        return "\(seconds / 60):\(String(format: "%02d", seconds % 60))"
    }
    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                ScrollView {
                    VStack(spacing: 20) {
                        CoverArtwork(id: player.current.map { $0.syncID ?? $0.id }, size: min(geometry.size.width - 48, geometry.size.height * 0.43, 350))
                            .padding(.top, 12)
                        trackHeading
                        timeline
                        transport
                        secondaryActions
                        if player.current != nil {
                            SongLyricsView()
                            LocalVisualView()
                        }
                    }.padding(.horizontal, 24).padding(.bottom, 32).frame(maxWidth: .infinity)
                }.modifier(SoftScrollEdges()).scrollIndicators(.hidden)
            }
            .background(Color.canvas)
            .navigationTitle("Сейчас играет").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("CLOSE PLAYER", systemImage: "chevron.down") { dismiss() }.labelStyle(.iconOnly)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu("TRACK ACTIONS", systemImage: "ellipsis") {
                        if let song = player.current { TrackContextMenu(track:UnifiedTrack(song)) }
                    }
                }
            }
        }.modifier(MusicModalScope(showErrors:!queuePresented))
            .presentationDragIndicator(.visible)
            .sheet(isPresented: $queuePresented) { QueueView() }
    }
    private var trackHeading: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(player.current?.title ?? "Нет выбранного трека").font(.title2.bold()).lineLimit(2)
                Text(player.current?.artist ?? "").font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                Text("\(player.current?.format ?? "") · Оригинальный файл").font(.caption2).foregroundStyle(Color.undertone)
            }.frame(maxWidth: .infinity, alignment: .leading)
            if let song = player.current {
                let liked = song.syncID.map { pc.likedIDs.contains($0) } ?? personal.state.likes.contains(song.id)
                Button(liked ? "UNLIKE" : "LIKE", systemImage: liked ? "heart.fill" : "heart") {
                    if let id = song.syncID { pc.edit(PCEdit(kind: "like", track: id, liked: !pc.likedIDs.contains(id))) }
                    else { personal.toggleLike(song.id) }
                }.labelStyle(.iconOnly).font(.title3).frame(width: 44, height: 44).tint(liked ? .undertone : .primary)
            }
        }
    }
    private var timeline: some View {
        VStack(spacing: 2) {
            Slider(value: Binding(get: { seeking ? seekPosition : playbackClock.position }, set: { seekPosition = $0 }), in: 0...max(1, player.duration)) { editing in
                if editing { seekPosition = playbackClock.position; seeking = true }
                else { player.seek(seekPosition); seeking = false }
            }.accessibilityLabel("Позиция воспроизведения")
            HStack { Text(clock(seeking ? seekPosition : playbackClock.position)); Spacer(); Text("−" + clock(max(0, player.duration - (seeking ? seekPosition : playbackClock.position)))) }
                .font(.caption2).monospacedDigit().foregroundStyle(.secondary)
        }
    }
    private var transport: some View {
        HStack(spacing: 0) {
            playerButton("SHUFFLE UPCOMING", icon: "shuffle") { player.shuffleUpcoming() }
                .disabled(player.upcoming.count < 2 && !player.shuffled)
                .foregroundStyle(player.shuffled ? Color.undertone : .white)
                .background(player.shuffled ? Color.undertone.opacity(0.18) : .clear,in:Circle())
                .accessibilityValue(player.shuffled ? "ON" : "OFF")
            Spacer(minLength: 0)
            playerButton("PREVIOUS TRACK", icon: "backward.end.fill") { Task { await player.advance(-1) } }
            Spacer(minLength: 0)
            Button(player.playing ? "PAUSE" : "PLAY", systemImage: player.playing ? "pause.fill" : "play.fill") { player.toggle() }
                .labelStyle(.iconOnly).font(.system(size: 28, weight: .semibold))
                .frame(width: 72, height: 72).background(Color.undertone, in: Circle()).foregroundStyle(.white)
                .buttonStyle(PressFeedbackStyle())
            Spacer(minLength: 0)
            playerButton("NEXT TRACK", icon: "forward.end.fill") { Task { await player.advance(1) } }
            Spacer(minLength: 0)
            playerButton(player.repeatMode.title, icon: player.repeatMode.icon) { player.cycleRepeat() }
                .foregroundStyle(player.repeatMode == .off ? Color.primary : Color.undertone)
        }
    }
    private func playerButton(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: icon).font(.system(size: 21, weight: .medium)).frame(width: 44, height: 44).contentShape(Rectangle()) }
            .buttonStyle(PressFeedbackStyle()).accessibilityLabel(title)
    }
    private var secondaryActions: some View {
        HStack {
            Label("На iPhone", systemImage: "checkmark.circle.fill").font(.caption).foregroundStyle(.secondary)
            Spacer(minLength: 8)
            if let song = player.current { ShareOriginalButton(song: song).labelStyle(.iconOnly).frame(width: 44, height: 44) }
            playerButton("QUEUE", icon: "text.line.first.and.arrowtriangle.forward") { queuePresented = true }
        }
    }
}
