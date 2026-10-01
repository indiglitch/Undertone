import SwiftUI

@main
struct UndertoneApp: App {
    @StateObject private var library = LibraryStore()
    @StateObject private var player = MusicPlayer()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(library)
                .environmentObject(player)
                .preferredColorScheme(.dark)
                .tint(.undertone)
                .task { await library.load() }
        }
    }
}
