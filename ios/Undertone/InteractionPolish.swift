import SwiftUI

struct PressFeedbackStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? 0.72 : 1)
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
            .animation(.easeOut(duration:0.12),value:configuration.isPressed)
            .sensoryFeedback(.selection,trigger:configuration.isPressed)
    }
}
struct SoftScrollEdges: ViewModifier {
    func body(content: Content) -> some View {
        content.mask { VStack(spacing:0) {
            LinearGradient(colors:[.clear,.black],startPoint:.top,endPoint:.bottom).frame(height:12)
            Rectangle().fill(.black)
            LinearGradient(colors:[.black,.clear],startPoint:.top,endPoint:.bottom).frame(height:18)
        }.allowsHitTesting(false) }
    }
}

struct SoftScrollItem: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func body(content: Content) -> some View {
        content.scrollTransition(.interactive,axis:.vertical) { view,phase in
            view.opacity(phase.isIdentity ? 1 : 0.85)
                .scaleEffect(phase.isIdentity || reduceMotion ? 1 : 0.985)
        }
    }
}
