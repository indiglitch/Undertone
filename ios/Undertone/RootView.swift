import SwiftUI
import UniformTypeIdentifiers
import UIKit

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
    case home = "HOME", search = "SEARCH", library = "LIBRARY", create = "CREATE"
    var icon: String { switch self { case .home: return "house"; case .search: return "magnifyingglass"; case .library: return "square.stack"; case .create: return "plus" } }
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
    @State private var keyboardVisible = false
    @State private var tabPaths: [MobileTab: NavigationPath] = [:]
    @Environment(\.accessibilityReduceMotion) private var reduceMotion


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
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { notification in
            updateKeyboard(true, notification: notification)
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { notification in
            updateKeyboard(false, notification: notification)
        }
        .sheet(isPresented:$creating) { CreateMusicView() }
        .sheet(isPresented:$devicePresented) { NavigationStack { ScrollView { PCDeviceView().padding(MobileLayout.contentInset) }.modifier(SoftScrollEdges()).navigationTitle("COMPUTER").toolbar { ToolbarItem(placement:.topBarTrailing) { Button("CLOSE") { devicePresented = false } } } } }
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
        .modifier(MenuConfirmationScope())

    }

    private var tabs: some View {
        TabView(selection: $tab) {
            ForEach(MobileTab.allCases.filter { createVisible || $0 != .create }, id: \.self) { item in
                tabScreen(item).tabItem { Label(item.rawValue, systemImage: item.icon) }.tag(item)
            }
        }.modifier(MobilePlayerAccessory(enabled: playerAccessoryVisible, accessory: playerAccessory))
    }
    private var playerAccessoryVisible: Bool { player.current != nil && !keyboardVisible }
    private var playerAccessory: some View {
        Group { if let song = player.current { MobileMiniPlayer(song: song) { expandedPlayer = true } } }
    }
    private func updateKeyboard(_ visible: Bool, notification: Notification) {
        let duration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double ?? 0.25
        withAnimation(reduceMotion ? nil : .easeInOut(duration: duration)) { keyboardVisible = visible }
    }
    private func tabScreen(_ item: MobileTab) -> some View {
NavigationStack(path: path(for: item)) {
                        tabPage(item)
                        .navigationTitle(item.rawValue)
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            if item == .home {
                                ToolbarItem(placement:.topBarTrailing) {
                                    HStack(spacing:12) {
                                        NavigationLink { DownloadsView() } label: { Label("DOWNLOADS",systemImage:"arrow.down.circle") }.frame(width:44,height:44).accessibilityIdentifier("openDownloads")
                                        Button("SYNC",systemImage:"arrow.triangle.2.circlepath") {
                                            if pc.address.isEmpty { devicePresented = true }
                                            else { Task { await pc.migratePlaylists(personal,library:library); await pc.refresh() } }
                                        }.frame(width:44,height:44).disabled(pc.refreshing).accessibilityIdentifier("syncLibrary")
                                    }.labelStyle(.iconOnly).buttonStyle(PressFeedbackStyle()).fixedSize(horizontal:true,vertical:false)
                                }.sharedBackgroundVisibility(.hidden)
                            } else {
                                ToolbarItem(placement:.topBarTrailing) { NavigationLink { DownloadsView() } label: { Label("DOWNLOADS",systemImage:"arrow.down.circle") }.accessibilityIdentifier("openDownloads") }.sharedBackgroundVisibility(.hidden)
                            }
                        }
                        .toolbar {
                            if item == .home {
                                ToolbarItem(placement:.topBarLeading) { Menu("SETTINGS AND TOOLS",systemImage:"gearshape") {
                                    NavigationLink { MobileSettingsView() } label: { Label("SETTINGS",systemImage:"gearshape") }
                                    Button("ADD FILES", systemImage: "document.badge.plus") { importer = true }
                                        .disabled(library.importing || pc.downloading != nil).accessibilityIdentifier("addHomeFiles")
                                    Button("COMPUTER",systemImage:"desktopcomputer") { devicePresented = true }
                                }.accessibilityIdentifier("homeTools").accessibilityHint("Настройки, импорт файлов и подключение компьютера") }
                            }
                        }
                    }
                    .toolbar(keyboardVisible ? .hidden : .automatic, for: .tabBar)
                    .modifier(MobilePlayerInset(enabled: playerAccessoryVisible, accessory: playerAccessory))
    }
    private func tabPage(_ item: MobileTab) -> some View {
Group {
                            if item == .library { LibraryHubView() }
                            else if item == .search { MobileSearchView() }
                            else if item == .create { VStack(spacing:24) { Image(systemName:"plus.circle.fill").font(.system(size:60)).foregroundStyle(Color.undertone); Text("Твоя коллекция").font(.title.bold()); Button("CREATE PLAYLIST") { creating = true }.buttonStyle(.glassProminent); Button("IMPORT FILES") { importer = true }.buttonStyle(.glass) }.frame(maxWidth:.infinity,maxHeight:.infinity) }
                            else { MobileHomeView(active: tab == .home && (tabPaths[.home]?.isEmpty ?? true)) { devicePresented = true } }
                        }
    }

    // Each stable tab identity owns an independent history. Switching a tab or
    // hiding optional Create never resets another tab's Back stack.
    private func path(for item: MobileTab) -> Binding<NavigationPath> {
        Binding(get: { tabPaths[item] ?? NavigationPath() }, set: { tabPaths[item] = $0 })
    }
}

struct PlayerView: View {
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var personal: PersonalLibrary
    @EnvironmentObject private var pc: PCConnection
    @Environment(\.dismiss) private var dismiss
    @State private var queuePresented = false
    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                ScrollView {
                    VStack(spacing: 16) {
                        CoverArtwork(id: player.current.map { $0.syncID ?? $0.id }, size: min(geometry.size.width - 48, geometry.size.height * 0.43, 350))
                            .padding(.top, 12)
                        trackHeading
                        if player.current != nil {
                            SongLyricsView()
                            LocalVisualView()
                        }
                    }.padding(.horizontal, 24).padding(.bottom, 16).frame(maxWidth: .infinity)
                }.modifier(SoftScrollEdges()).scrollIndicators(.hidden)
                    .safeAreaInset(edge: .bottom, spacing: 0) {
                        VStack(spacing: 8) {
                            PlayerTimeline(trackID: player.current?.id).id(player.current?.id)
                            transport
                            secondaryActions
                        }.padding(.horizontal, 24).padding(.top, 8).padding(.bottom, 4).background(Color.canvas)
                    }
            }
            .background(Color.canvas)
            .navigationTitle("Сейчас играет").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("CLOSE PLAYER", systemImage: "chevron.down") { dismiss() }.labelStyle(.iconOnly).accessibilityIdentifier("closePlayer")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if let song = player.current { TrackContextMenu(track:UnifiedTrack(song)) }
                    } label: { MusicMenuLabel() }.menuOrder(.fixed).accessibilityLabel("TRACK ACTIONS")
                }
            }
        }.modifier(MusicModalScope(showErrors:!queuePresented))
            .presentationDragIndicator(.visible)
            .sheet(isPresented: $queuePresented) { QueueView() }
    }
    private var trackHeading: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(player.current?.title ?? "Нет выбранного трека").font(.title2.bold()).lineLimit(2).accessibilityIdentifier("playerTrackTitle")
                Text(player.current?.artist ?? "").font(.subheadline).foregroundStyle(.secondary).lineLimit(2).accessibilityIdentifier("playerTrackArtist")
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
    private var transport: some View {
        HStack(spacing: 0) {
            playerButton("SHUFFLE UPCOMING", icon: "shuffle") { player.shuffleUpcoming() }
                .opacity(player.upcoming.count < 2 && !player.shuffled ? 0.45 : 1)
                .foregroundStyle(player.shuffled ? Color.undertone : .white)
                .background(player.shuffled ? Color.undertone.opacity(0.18) : .clear,in:Circle())
                .accessibilityValue(player.shuffled ? "ON" : "OFF")
            Spacer(minLength: 0)
            playerButton("PREVIOUS TRACK", icon: "backward.end.fill") { Task { await player.advance(-1) } }
            Spacer(minLength: 0)
            Button { player.toggle() } label: {
                Image(systemName: player.playing ? "pause.fill" : "play.fill").font(.system(size: 28, weight: .semibold))
                    .frame(width: 72, height: 72).background(Color.undertone, in: Circle()).foregroundStyle(.white).contentShape(Circle())
            }.buttonStyle(PressFeedbackStyle()).accessibilityLabel(player.playing ? "PAUSE" : "PLAY")
                .accessibilityIdentifier("playerToggle")
            Spacer(minLength: 0)
            playerButton("NEXT TRACK", icon: "forward.end.fill") { Task { await player.advance(1) } }
            Spacer(minLength: 0)
            playerButton(player.repeatMode.title, icon: player.repeatMode.icon) { player.cycleRepeat() }
                .foregroundStyle(player.repeatMode == .off ? Color.primary : Color.undertone)
                .background(player.repeatMode == .off ? .clear : Color.undertone.opacity(0.18),in:Circle())
                .accessibilityValue(player.repeatMode == .off ? "OFF" : "ON")
                .accessibilityIdentifier("playerRepeat")
        }.disabled(player.current == nil)
    }
    private func playerButton(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: icon).font(.system(size: 21, weight: .medium)).frame(width: 44, height: 44).contentShape(Rectangle()) }
            .buttonStyle(PressFeedbackStyle()).accessibilityLabel(title)
    }
    private var secondaryActions: some View {
        HStack {
            if player.current != nil { Label("На iPhone", systemImage: "checkmark.circle.fill").font(.caption).foregroundStyle(.secondary) }
            Spacer(minLength: 8)
            if let song = player.current { ShareOriginalButton(song: song).labelStyle(.iconOnly).frame(width: 44, height: 44) }
            Button { queuePresented = true } label: {
                Label("QUEUE · \(player.upcoming.count)", systemImage: "text.line.first.and.arrowtriangle.forward")
                    .font(.caption.weight(.semibold)).frame(minHeight: 44).contentShape(Rectangle())
            }.buttonStyle(PressFeedbackStyle()).accessibilityLabel("QUEUE").accessibilityIdentifier("openPlayerQueue")
        }
    }
}
