import SwiftUI

@main
struct UndertoneApp: App {
    @StateObject private var library = LibraryStore()
    @StateObject private var player = MusicPlayer()
    @StateObject private var pc = PCConnection()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(library)
                .environmentObject(player)
                .environmentObject(pc)
                .preferredColorScheme(.dark)
                .tint(.undertone)
                .task { await library.load() }
        }
    }
}
