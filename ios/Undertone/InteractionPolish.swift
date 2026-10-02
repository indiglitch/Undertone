import SwiftUI
import UIKit

struct PressFeedbackStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? 0.72 : 1)
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.96 : 1)
            .animation(.easeOut(duration:0.12),value:configuration.isPressed)
            .sensoryFeedback(.selection,trigger:configuration.isPressed)
    }
}
struct SoftScrollEdges: ViewModifier {
    func body(content: Content) -> some View { content.scrollEdgeEffectStyle(.soft,for:.all) }
}

@MainActor enum ActionFeedback {
    static func failed() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
}
