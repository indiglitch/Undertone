import SwiftUI

// Each presented music screen owns the sheets triggered by its common menus.
// This keeps sharing and codes above the player, queue or playlist editor.
struct MusicModalScope: ViewModifier {
    @StateObject private var sharing = ShareCoordinator()
    @StateObject private var routes = RouteCoordinator()
    var showErrors = true
    func body(content: Content) -> some View {
        content.environmentObject(sharing).environmentObject(routes)
            .overlay(alignment:.top) { if showErrors && routes.route == nil && routes.code == nil { AppErrorToast().environmentObject(routes).padding(.horizontal,16).padding(.top,8) } }
            .sheet(item:$sharing.payload) { SystemShareSheet(items:$0.items) }
            .sheet(item:$routes.route) { MusicRouteView(route:$0).environmentObject(routes).environmentObject(sharing) }
            .sheet(item:$routes.code) { MusicCodeView(url:$0.url) }
    }
}
