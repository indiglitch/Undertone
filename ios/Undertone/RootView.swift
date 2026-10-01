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
    case home = "Главная", library = "Музыка", downloads = "На iPhone", device = "Устройства"
    var icon: String {
        switch self {
        case .home: return "house"
        case .library: return "square.stack"
        case .downloads: return "arrow.down.circle"
        case .device: return "desktopcomputer"
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var player: MusicPlayer
    @State private var tab: MobileTab = .home
    @State private var importer = false
    @State private var expandedPlayer = false
    @State private var query = ""

    var body: some View {
        ZStack {
            Color.canvas.ignoresSafeArea()
            RadialGradient(colors: [.undertone.opacity(0.19), .clear], center: .topTrailing, startRadius: 0, endRadius: 420).ignoresSafeArea()
            TabView(selection: $tab) {
                ForEach(MobileTab.allCases, id: \.self) { item in
                    NavigationStack {
                        ScrollView {
                            VStack(alignment: .leading, spacing: 28) {
                                if item == .home { home }
                                else if item == .device { devices }
                                else { collection(downloads: item == .downloads) }
                            }
                            .padding(.horizontal, 22).padding(.top, 12).padding(.bottom, 28)
                        }
                        .scrollContentBackground(.hidden)
                        .navigationTitle(item.rawValue)
                        .toolbar {
                            if item != .device {
                                ToolbarItem(placement: .topBarTrailing) {
                                    Button("Добавить файлы", systemImage: "plus") { importer = true }
                                        .disabled(library.importing)
                                }
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
        .fileImporter(isPresented: $importer, allowedContentTypes: [.audio], allowsMultipleSelection: true) { result in
            switch result {
            case .success(let urls): Task { await library.importFiles(urls) }
            case .failure(let error): library.error = error.localizedDescription
            }
        }
        .sheet(isPresented: $expandedPlayer) { PlayerView().environmentObject(player) }
        .alert("Не удалось завершить действие", isPresented: Binding(
            get: { library.error != nil || player.error != nil },
            set: { if !$0 { library.error = nil; player.error = nil } }
        )) {
            Button("Понятно", role: .cancel) { library.error = nil; player.error = nil }
        } message: { Text(library.error ?? player.error ?? "") }
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
                .buttonStyle(.glassProminent).disabled(library.importing)
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
                songList(Array(library.songs.sorted { $0.addedAt > $1.addedAt }.prefix(8)))
                sectionHeading("Альбомы", detail: "\(library.albums.count)")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 18) {
                        ForEach(library.albums.keys.sorted(), id: \.self) { key in
                            if let songs = library.albums[key], let first = songs.first {
                                Button { start(first, queue: songs) } label: {
                                    VStack(alignment: .leading, spacing: 10) {
                                        Artwork(size: 144)
                                        Text(first.album).font(.subheadline.weight(.semibold)).lineLimit(2)
                                        Text(first.artist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                    }.frame(width: 144, alignment: .leading)
                                }.buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            Button { tab = .device } label: {
                HStack(spacing: 14) {
                    Image(systemName: "desktopcomputer").font(.title2).foregroundStyle(Color.undertone)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Библиотека с компьютера").font(.subheadline.weight(.semibold))
                        Text("Следующий этап — подключение к ПК").font(.caption).foregroundStyle(.secondary)
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

    private func collection(downloads: Bool) -> some View {
        VStack(alignment: .leading, spacing: 22) {
            if downloads {
                HStack(spacing: 12) {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.undertone)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Доступно без интернета").font(.headline)
                        Text("\(library.songs.count) файлов · \(ByteCountFormatter.string(fromByteCount: library.bytes, countStyle: .file))").font(.caption).foregroundStyle(.secondary)
                    }
                }.padding(20).modifier(GlassSurface())
            }
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Песня, исполнитель, альбом", text: $query).autocorrectionDisabled()
                if !query.isEmpty {
                    Button("Очистить поиск", systemImage: "xmark.circle.fill") { query = "" }.labelStyle(.iconOnly).frame(minWidth: 44, minHeight: 44)
                }
            }.padding(.horizontal, 16).frame(minHeight: 52).modifier(GlassSurface(radius: 26))
            let songs = library.songs.filter { query.isEmpty || "\($0.title) \($0.artist) \($0.album)".localizedCaseInsensitiveContains(query) }
                .sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
            if library.songs.isEmpty { emptyLibrary }
            else if songs.isEmpty { ContentUnavailableView.search(text: query) }
            else { songList(songs) }
        }
    }

    private var devices: some View {
        VStack(alignment: .leading, spacing: 24) {
            ZStack {
                Circle().fill(Color.undertone.opacity(0.12)).frame(width: 132, height: 132)
                Image(systemName: "desktopcomputer.and.arrow.down").font(.system(size: 52)).foregroundStyle(Color.undertone)
            }.frame(maxWidth: .infinity).padding(.vertical, 20)
            Text("Музыка с твоего ПК").font(.largeTitle.bold())
            Text("Здесь появится подключение к Undertone на компьютере: каталог, плейлисты и загрузка оригинальных файлов по Wi-Fi.")
                .foregroundStyle(.secondary)
            Label("Подключение к ПК ещё в разработке", systemImage: "hammer").font(.subheadline).padding(20).frame(maxWidth: .infinity, alignment: .leading).modifier(GlassSurface())
            VStack(alignment: .leading, spacing: 12) {
                Label("Оригинальные файлы без перекодирования", systemImage: "waveform")
                Label("Скачанная музыка остаётся на iPhone", systemImage: "iphone")
                Label("Сейчас можно импортировать из «Файлов»", systemImage: "folder")
            }.font(.subheadline).foregroundStyle(.secondary)
            Button("Добавить локальные файлы", systemImage: "plus") { importer = true }
                .buttonStyle(.glassProminent).disabled(library.importing)
        }
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
                        Artwork(size: 52)
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
                    Artwork(size: 44)
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
    @Environment(\.dismiss) private var dismiss
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
                        Artwork(size: min(geometry.size.width - 52, 350)).padding(.top, 24)
                        VStack(spacing: 8) {
                            Text(player.current?.title ?? "Нет выбранного трека").font(.title2.bold()).multilineTextAlignment(.center)
                            Text(player.current?.artist ?? "").foregroundStyle(.secondary)
                            Text("\(player.current?.format ?? "") · Оригинальный файл").font(.caption).foregroundStyle(Color.undertone)
                        }
                        VStack(spacing: 6) {
                            Slider(value: Binding(get: { seeking ? seekPosition : player.position }, set: { seekPosition = $0 }), in: 0...max(1, player.duration)) { editing in
                                if editing { seekPosition = player.position; seeking = true }
                                else { player.seek(seekPosition); seeking = false }
                            }.accessibilityLabel("Позиция воспроизведения")
                            HStack { Text(clock(seeking ? seekPosition : player.position)); Spacer(); Text(clock(player.duration)) }
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
                        Label("Доступно офлайн", systemImage: "checkmark.circle.fill").font(.caption).foregroundStyle(.secondary)
                    }.padding(.horizontal, 26).padding(.bottom, 30).frame(maxWidth: .infinity)
                }
            }
            .background(Color.canvas)
            .navigationTitle("Сейчас играет").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Закрыть", systemImage: "xmark") { dismiss() }.labelStyle(.iconOnly) } }
        }.presentationDragIndicator(.visible)
    }
}
