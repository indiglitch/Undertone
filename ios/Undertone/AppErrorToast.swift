import SwiftUI

struct AppErrorToast: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var personal: PersonalLibrary
    @EnvironmentObject private var routes: RouteCoordinator
    @EnvironmentObject private var downloads: BackgroundDownloads
    @State private var message: String?
    @State private var dismissal: Task<Void,Never>?
    private var error: String? { player.error ?? downloads.error ?? pc.error ?? library.error ?? personal.error ?? routes.error }
    var body: some View {
        Group {
            if let message {
                HStack(spacing:10) {
                    Image(systemName:"exclamationmark.circle.fill").foregroundStyle(Color.undertone)
                    Text(message).font(.subheadline).lineLimit(2).frame(maxWidth:.infinity,alignment:.leading)
                    Button("CLOSE",systemImage:"xmark") { self.message = nil }.labelStyle(.iconOnly).frame(width:44,height:44)
                }.padding(.horizontal,14).padding(.vertical,4)
                    .background(Color(red:0.16,green:0.13,blue:0.20),in:RoundedRectangle(cornerRadius:18))
                    .shadow(color:.black.opacity(0.3),radius:12,y:4)
                    .accessibilityIdentifier("appErrorToast")
            }
        }.onChange(of:error) { _, value in if let value { show(value) } }
            .onAppear { if let error { show(error) } }
    }
    private func show(_ text: String) {
        ActionFeedback.failed()
        message = String(text.prefix(140))
        player.error = nil; downloads.error = nil; pc.error = nil; library.error = nil; personal.error = nil; routes.error = nil
        dismissal?.cancel()
        dismissal = Task { try? await Task.sleep(for:.seconds(4)); if !Task.isCancelled { message = nil } }
    }
}
