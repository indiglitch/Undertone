import SwiftUI

// Menu and long-press content share native sections and system scrolling.
enum MusicMenuGroup: String {
    case playback = "Playback / Queue"
    case library = "Library / Playlists"
    case related = "Artist / Album"
    case file = "File / Additional"
    case destructive = "Destructive actions"
}

struct MusicMenuSection<Content: View>: View {
    let group: MusicMenuGroup
    let content: Content
    init(group: MusicMenuGroup, @ViewBuilder content: () -> Content) {
        self.group = group; self.content = content()
    }
    var body: some View { Section(group.rawValue) { content } }
}

struct MusicMenuLabel: View {
    var body: some View {
        Image(systemName: "ellipsis").frame(width: MobileLayout.minimumTarget, height: MobileLayout.minimumTarget).contentShape(Rectangle())
    }
}

// A stable screen owns confirmations, rather than transient Menu content.
// Each request captures the target and action before the menu is dismissed.
@MainActor final class MenuConfirmationCoordinator: ObservableObject {
    struct Request: Identifiable {
        let id = UUID()
        let title: String
        let message: String
        let actionTitle: String
        let action: () -> Void
    }
    @Published var pending: Request?
    func confirm(_ title: String, message: String, actionTitle: String, action: @escaping () -> Void) {
        pending = Request(title: title, message: message, actionTitle: actionTitle, action: action)
    }
}

struct MenuConfirmationScope: ViewModifier {
    @StateObject private var confirmation = MenuConfirmationCoordinator()
    func body(content: Content) -> some View {
        content.environmentObject(confirmation)
            .alert(confirmation.pending?.title ?? "", isPresented: Binding(
                get: { confirmation.pending != nil },
                set: { if !$0 { confirmation.pending = nil } }
            ), presenting: confirmation.pending) { request in
                Button(request.actionTitle, role: .destructive, action: request.action)
                Button("CANCEL", role: .cancel) { }
            } message: { request in Text(request.message) }
    }
}
