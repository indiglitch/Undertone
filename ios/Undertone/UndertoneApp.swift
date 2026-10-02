import SwiftUI

@main
struct UndertoneApp: App {
    @UIApplicationDelegateAdaptor(UndertoneAppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var downloads = BackgroundDownloads.shared
    @StateObject private var library = LibraryStore()
    @StateObject private var player = MusicPlayer()
    @StateObject private var pc = PCConnection()
    @StateObject private var personal = PersonalLibrary()
    @StateObject private var sharing = ShareCoordinator()
    @StateObject private var routes = RouteCoordinator()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(library)
                .environmentObject(player)
                .environmentObject(pc)
                .environmentObject(downloads)
                .environmentObject(personal)
                .environmentObject(sharing)
                .environmentObject(routes)
                .onOpenURL { url in routes.open(url) }
                .preferredColorScheme(.dark)
                .tint(.undertone)
                .task {
                    #if DEBUG
                    if ProcessInfo.processInfo.arguments.contains("--ui-fixture") { try? await NativeUITestFixture.prepare() }
                    #endif
                    downloads.onInstall = { await library.load(); await pc.migratePlaylists(personal,library:library); await pc.syncCollections(quiet:true) }
                    await library.load(); await personal.load(); await pc.initialize()
                    player.onTrack = { personal.record($0.id) }
                    player.resolveSong = { [weak pc, weak library] song in guard let pc, let library else { throw PCError.disconnected }; return try await pc.resolve(song,library:library) }
                    await pc.migratePlaylists(personal,library:library)
                    await player.restore(TrackCatalog.merged(local:library.songs,remote:pc.tracks).map(\.song), repository: library.repository)
                    await downloads.initialize(); pc.activate()
                }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { pc.activate(); Task { await library.load() } }
                    else { player.checkpoint(); pc.deactivate() }
                }
        }
    }
}
