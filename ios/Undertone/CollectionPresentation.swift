import SwiftUI

private struct CompactCollectionRowsKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    var compactCollectionRows: Bool {
        get { self[CompactCollectionRowsKey.self] }
        set { self[CompactCollectionRowsKey.self] = newValue }
    }
}

enum CollectionLayout {
    static let artwork: CGFloat = 44
    static let summaryArtwork: CGFloat = 48
    static let rowHeight: CGFloat = 56
    static let insets = EdgeInsets(top: 2, leading: 12, bottom: 2, trailing: 12)
}

struct CollectionListStyle: ViewModifier {
    func body(content: Content) -> some View {
        content.listStyle(.plain).scrollContentBackground(.hidden)
            .listSectionSpacing(8)
            .contentMargins(.bottom, 8, for: .scrollContent)
            .modifier(SoftScrollEdges())
            .environment(\.defaultMinListRowHeight, CollectionLayout.rowHeight)
            .environment(\.defaultMinListHeaderHeight, 28)
            .environment(\.compactCollectionRows, true)
    }
}

struct CollectionRowStyle: ViewModifier {
    func body(content: Content) -> some View {
        content.listRowInsets(CollectionLayout.insets).listRowBackground(Color.clear)
    }
}

struct CollectionRowLabel: View {
    let title: String
    let icon: String
    var artworkID: String?
    var remote: PCTrack?
    var showsArtwork = false
    var body: some View {
        HStack(spacing: 12) {
            if showsArtwork { CoverArtwork(id: artworkID, size: CollectionLayout.artwork, remote: remote) }
            else {
                Image(systemName: icon).font(.system(size: 20)).foregroundStyle(Color.undertone)
                    .frame(width: CollectionLayout.artwork, height: CollectionLayout.artwork)
                    .background(Color.undertone.opacity(0.10), in: RoundedRectangle(cornerRadius: 12))
            }
            Text(title).font(.subheadline.weight(.medium)).lineLimit(2).multilineTextAlignment(.leading)
            Spacer(minLength: 0)
        }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle())
    }
}

struct CollectionEmptyView: View {
    let title: String
    let detail: String
    var icon = "music.note"
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon).font(.system(size: 24)).foregroundStyle(Color.undertone)
            Text(title).font(.headline).multilineTextAlignment(.center)
            Text(detail).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }.padding(.vertical, 16).frame(maxWidth: .infinity, minHeight: 112)
            .listRowSeparator(.hidden)
    }
}

enum CollectionOrderPresentation: String {
    case sortable = "SORT", playlist = "PLAYLIST ORDER", album = "TRACK ORDER", recent = "LATEST FIRST", fixed = "COLLECTION ORDER"
    static func mode(playlist: Bool, album: Bool, ordered: Bool, recent: Bool) -> Self {
        if recent { return .recent }
        if playlist { return .playlist }
        if ordered { return .fixed }
        return album ? .album : .sortable
    }
}
