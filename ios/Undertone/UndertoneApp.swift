import SwiftUI

@main
struct UndertoneApp: App {
    @UIApplicationDelegateAdaptor(UndertoneAppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var downloads = BackgroundDownloads.shared
    @StateObject private var library = LibraryStore()
    @StateObject private var player = MusicPlayer()
    @StateObject private var pc = PCConnection()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(library)
                .environmentObject(player)
                .environmentObject(pc)
                .environmentObject(downloads)
                .preferredColorScheme(.dark)
                .tint(.undertone)
                .task {
                    downloads.onInstall = { await library.load() }
                    await library.load(); await pc.initialize(); await downloads.initialize(); pc.activate()
                }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { pc.activate(); Task { await library.load() } }
                    else { pc.deactivate() }
                }
        }
    }
}
