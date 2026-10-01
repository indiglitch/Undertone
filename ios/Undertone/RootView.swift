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

struct RootView: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var personal: PersonalLibrary
    @EnvironmentObject private var sharing: ShareCoordinator
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
            TabView(selection: $tab) {
                ForEach(MobileTab.allCases.filter { createVisible || $0 != .create }, id: \.self) { item in
                    NavigationStack {
                        Group {
                            if item == .library { LibraryHubView() }
                            else if item == .search { MobileSearchView() }
                            else if item == .create { VStack(spacing:24) { Image(systemName:"plus.circle.fill").font(.system(size:60)).foregroundStyle(Color.undertone); Text("Твоя коллекция").font(.title.bold()); Button("Плейлист или папка") { creating = true }.buttonStyle(.glassProminent); Button("Импортировать файлы") { importer = true }.buttonStyle(.glass) }.frame(maxWidth:.infinity,maxHeight:.infinity) }
                            else {
                                ScrollView {
                                    LazyVStack(alignment: .leading, spacing: 28) {
                                        home
                                    }.padding(.horizontal, 22).padding(.top, 12).padding(.bottom, 28)
                                }.scrollContentBackground(.hidden)
                            }
                        }
                        .navigationTitle(item.rawValue)
                        .toolbar {
                            if item == .home {
                                ToolbarItem(placement: .topBarTrailing) {
                                    Button("Добавить файлы", systemImage: "plus") { importer = true }
                                        .disabled(library.importing || pc.downloading != nil)
                                }
                            }
                        }
                        .toolbar {
                            if item == .home {
                                ToolbarItem(placement:.topBarLeading) { Menu("Личная библиотека",systemImage:"person.crop.circle") {
                                    NavigationLink { MobileSettingsView() } label: { Label("Настройки",systemImage:"gearshape") }
                                    NavigationLink { RecentListeningView() } label: { Label("Недавно слушали",systemImage:"clock") }
                                    Button("Компьютер",systemImage:"desktopcomputer") { devicePresented = true }
                                } }
                            }
                        }
                        .safeAreaInset(edge: .bottom, spacing: 12) {
                            if let song = player.current { miniPlayer(song).padding(.horizontal, 16).padding(.bottom, 8) }
                        }
                    }
                    .tabItem { Label(item.rawValue, systemImage: item.icon) }.tag(item)
                }
            }
        }
        .background { DownloadErrorAlerts() }
        .onChange(of:createVisible) { _, value in if !value && tab == .create { tab = .home } }
        .sheet(isPresented:$creating) { CreateMusicView() }
        .sheet(isPresented:$devicePresented) { NavigationStack { ScrollView { PCDeviceView().padding(22) }.navigationTitle("Компьютер").toolbar { ToolbarItem(placement:.topBarTrailing) { Button("Закрыть") { devicePresented = false } } } } }
        .sheet(item:$sharing.payload) { SystemShareSheet(items:$0.items) }
        .fileImporter(isPresented: $importer, allowedContentTypes: [.audio], allowsMultipleSelection: true) { result in
            switch result {
            case .success(let urls): Task { await library.importFiles(urls) }
            case .failure(let error): library.error = error.localizedDescription
            }
        }
        .sheet(isPresented: $expandedPlayer) { PlayerView().environmentObject(player).environmentObject(player.clock) }
        .alert("Не удалось завершить действие", isPresented: Binding(
            get: { library.error != nil || player.error != nil || pc.error != nil || personal.error != nil },
            set: { if !$0 { library.error = nil; player.error = nil; pc.error = nil; personal.error = nil } }
        )) {
            Button("Понятно", role: .cancel) { library.error = nil; player.error = nil; pc.error = nil; personal.error = nil }
        } message: { Text(library.error ?? player.error ?? pc.error ?? personal.error ?? "") }
    }

    private var home: some View {
        VStack(alignment: .leading, spacing: 28) {
            VStack(alignment: .leading, spacing: 16) {
                HStack { Label("UNDERTONE", systemImage: "waveform").font(.caption.weight(.semibold)).tracking(2); Spacer(); Image(systemName: "sparkle").foregroundStyle(Color.undertone) }
                Text("Твоя музыка.\nВсегда рядом.").font(.system(.largeTitle, design: .rounded).bold()).tracking(-1)
                Text("Оригинальные файлы. Твоя библиотека.\nБез интернета, когда музыка уже на iPhone.")
                    .font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                Button { importer = true } label: {
                    Label(library.importing ? "Импортируем…" : "Добавить музыку", systemImage: library.importing ? "arrow.down" : "plus")
                        .font(.subheadline.weight(.semibold)).frame(minHeight: 44).padding(.horizontal, 12)
                }
                .buttonStyle(.glassProminent).disabled(library.importing || pc.downloading != nil)
            }
            .padding(24)
            .background(LinearGradient(colors: [.undertone.opacity(0.20), .white.opacity(0.035)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 32))

            HStack(spacing: 12) {
                stat("На iPhone", value: "\(library.songs.count)", icon: "music.note")
                stat("Оригиналы", value: ByteCountFormatter.string(fromByteCount: library.bytes, countStyle: .file), icon: "externaldrive")
            }
            if library.songs.isEmpty {
                emptyLibrary
            } else {
                sectionHeading("Недавно добавлено", detail: "На устройстве")
                songList(library.recentSongs)
                sectionHeading("Альбомы", detail: "\(library.albums.count)")
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(alignment: .top, spacing: 18) {
                        ForEach(library.albums.keys.sorted(), id: \.self) { key in
                            if let songs = library.albums[key], let first = songs.first {
                                NavigationLink { MusicLibraryView(album:key).navigationTitle(first.album) } label: {
                                    VStack(alignment: .leading, spacing: 10) {
                                        CoverArtwork(id: first.syncID ?? first.id, size: 144)
                                        Text(first.album).font(.subheadline.weight(.semibold)).lineLimit(2)
                                        Text(first.artist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                    }.frame(width: 144, alignment: .leading)
                                }.buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            Button { devicePresented = true } label: {
                HStack(spacing: 14) {
                    Image(systemName: "desktopcomputer").font(.title2).foregroundStyle(Color.undertone)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Библиотека с компьютера").font(.subheadline.weight(.semibold))
                        Text(pc.address.isEmpty ? "Подключить по Wi-Fi" : "\(pc.tracks.count) треков на ПК").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
                }.padding(20).modifier(GlassSurface())
            }.buttonStyle(.plain)
        }
    }

    private var emptyLibrary: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Начни с любимого альбома").font(.title3.weight(.semibold))
            Text("Добавь аудиофайлы из приложения «Файлы». Undertone сохранит оригиналы и сможет играть их офлайн.")
                .font(.subheadline).foregroundStyle(.secondary)
        }.padding(.vertical, 6)
    }

    private func stat(_ title: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: icon).foregroundStyle(Color.undertone)
            Text(value).font(.title2.weight(.semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
            Text(title).font(.caption).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(20)
            .background(.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 24))
    }
    private func sectionHeading(_ title: String, detail: String) -> some View {
        HStack { Text(title).font(.title2.bold()); Spacer(); Text(detail).font(.caption).foregroundStyle(.secondary) }
    }
    private func songList(_ songs: [Song]) -> some View {
        LazyVStack(spacing: 8) {
            ForEach(songs) { song in
                Button { start(song, queue: songs) } label: {
                    HStack(spacing: 13) {
                        CoverArtwork(id: song.syncID ?? song.id, size: 52)
                        VStack(alignment: .leading, spacing: 5) {
                            Text(song.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                            Text(song.artist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                        Spacer(minLength: 4)
                        VStack(alignment: .trailing, spacing: 5) {
                            Text(song.format).font(.system(size: 10, weight: .semibold)).foregroundStyle(Color.undertone)
                            Image(systemName: player.current?.id == song.id && player.playing ? "waveform" : "checkmark.circle.fill")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }.padding(.vertical, 6).contentShape(Rectangle())
                }.buttonStyle(.plain).accessibilityLabel("Воспроизвести \(song.title), \(song.artist)")
            }
        }
    }
    private func start(_ song: Song, queue: [Song]) {
        Task { await player.play(song, queue: queue, repository: library.repository) }
    }
    private func miniPlayer(_ song: Song) -> some View {
        HStack(spacing: 12) {
            Button { expandedPlayer = true } label: {
                HStack(spacing: 12) {
                    CoverArtwork(id: song.syncID ?? song.id, size: 44)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(song.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                        Text(song.artist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }.contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityLabel("Открыть плеер")
            Button(player.playing ? "Пауза" : "Воспроизвести", systemImage: player.playing ? "pause.fill" : "play.fill") { player.toggle() }
                .labelStyle(.iconOnly).frame(width: 44, height: 44)
            Button("Следующий трек", systemImage: "forward.end.fill") { Task { await player.advance(1) } }
                .labelStyle(.iconOnly).frame(width: 44, height: 44)
        }.padding(12).modifier(GlassSurface())
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
                    VStack(spacing: 30) {
                        CoverArtwork(id: player.current.map { $0.syncID ?? $0.id }, size: min(geometry.size.width - 52, 350)).padding(.top, 24)
                        VStack(spacing: 8) {
                            Text(player.current?.title ?? "Нет выбранного трека").font(.title2.bold()).multilineTextAlignment(.center)
                            Text(player.current?.artist ?? "").foregroundStyle(.secondary)
                            Text("\(player.current?.format ?? "") · Оригинальный файл").font(.caption).foregroundStyle(Color.undertone)
                        }
                        VStack(spacing: 6) {
                            Slider(value: Binding(get: { seeking ? seekPosition : playbackClock.position }, set: { seekPosition = $0 }), in: 0...max(1, player.duration)) { editing in
                                if editing { seekPosition = playbackClock.position; seeking = true }
                                else { player.seek(seekPosition); seeking = false }
                            }.accessibilityLabel("Позиция воспроизведения")
                            HStack { Text(clock(seeking ? seekPosition : playbackClock.position)); Spacer(); Text(clock(player.duration)) }
                                .font(.caption).monospacedDigit().foregroundStyle(.secondary)
                        }
                        GlassEffectContainer(spacing: 20) {
                            HStack(spacing: 24) {
                                Button("Предыдущий трек", systemImage: "backward.end.fill") { Task { await player.advance(-1) } }
                                    .frame(width: 56, height: 56).buttonStyle(.glass)
                                Button(player.playing ? "Пауза" : "Воспроизвести", systemImage: player.playing ? "pause.fill" : "play.fill") { player.toggle() }
                                    .font(.title).frame(width: 76, height: 76).buttonStyle(.glassProminent)
                                Button("Следующий трек", systemImage: "forward.end.fill") { Task { await player.advance(1) } }
                                    .frame(width: 56, height: 56).buttonStyle(.glass)
                            }.labelStyle(.iconOnly)
                        }
                        HStack(spacing: 24) {
                            Button("Очередь", systemImage: "text.line.first.and.arrowtriangle.forward") { queuePresented = true }
                            Button(player.repeatMode.title, systemImage: player.repeatMode.icon) { player.cycleRepeat() }
                                .tint(player.repeatMode == .off ? .secondary : Color.undertone)
                        }.buttonStyle(.glass).controlSize(.large)
                        if let song = player.current {
                            HStack {
                                Button("В любимые",systemImage:(song.syncID.map { pc.likedIDs.contains($0) } ?? personal.state.likes.contains(song.id)) ? "heart.fill" : "heart") { if let id = song.syncID { pc.edit(PCEdit(kind:"like",track:id,liked:!pc.likedIDs.contains(id))) } else { personal.toggleLike(song.id) } }
                                ShareOriginalButton(song:song)
                            }.buttonStyle(.glass)
                            SongLyricsView()
                        }
                        Label("Доступно офлайн", systemImage: "checkmark.circle.fill").font(.caption).foregroundStyle(.secondary)
                    }.padding(.horizontal, 26).padding(.bottom, 30).frame(maxWidth: .infinity)
                }
            }
            .background(Color.canvas)
            .navigationTitle("Сейчас играет").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Закрыть", systemImage: "xmark") { dismiss() }.labelStyle(.iconOnly) } }
        }.presentationDragIndicator(.visible)
            .sheet(isPresented: $queuePresented) { QueueView() }
    }
}
