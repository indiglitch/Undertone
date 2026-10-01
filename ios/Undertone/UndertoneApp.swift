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
                    downloads.onInstall = { await library.load() }
                    await library.load(); await personal.load(); player.onTrack = { personal.record($0.id) }; await player.restore(library.songs, repository: library.repository); await pc.initialize(); await downloads.initialize(); pc.activate()
                }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { pc.activate(); Task { await library.load() } }
                    else { player.checkpoint(); pc.deactivate() }
                }
        }
    }
}
