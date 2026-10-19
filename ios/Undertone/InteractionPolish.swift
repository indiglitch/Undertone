import SwiftUI
import UIKit

// Existing native spacing, shared by utility screens without a new UI framework.
enum MobileLayout {
    static let minimumTarget: CGFloat = 44
    static let contentInset: CGFloat = 16
    static let sectionSpacing: CGFloat = 8
}

struct SettingsLabel: View {
    let title: LocalizedStringKey
    let icon: String
    var iconColor: Color = .undertone
    var body: some View {
        Label { Text(title, tableName: "Settings").fixedSize(horizontal: false, vertical: true) } icon: {
            Image(systemName: icon).foregroundStyle(iconColor).frame(width: 24).accessibilityHidden(true)
        }.frame(minHeight: MobileLayout.minimumTarget)
    }
}

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
