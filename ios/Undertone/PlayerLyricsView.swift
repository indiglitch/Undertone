import SwiftUI
import UniformTypeIdentifiers

enum LyricsPresentation {
    static func hasText(_ document: LyricsDocument) -> Bool {
        !document.plain.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || document.lines.contains { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }
    static func active(_ document: LyricsDocument?, position: Double) -> Int64? {
        guard position.isFinite else { return nil }
        return document?.lines.last { Double($0.timestamp_ms) <= max(0, position) * 1000 }?.timestamp_ms
    }
}

struct SongLyricsView: View {
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var clock: PlaybackClock
    @AppStorage("lyricsPreview") private var preview = true
    @State private var document: LyricsDocument?
    @State private var loadedSongID: String?
    @State private var reload = 0
    @State private var importing = false
    @State private var importSongID: String?
    @State private var expanded = false
    @State private var loading = false
    @State private var error: String?
    private var currentDocument: LyricsDocument? {
        guard loadedSongID == player.current?.id, let document, LyricsPresentation.hasText(document) else { return nil }
        return document
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Текст песни").font(.headline)
                Spacer()
                Menu {
                    Button("REFRESH LYRICS", systemImage: "arrow.clockwise") { reload += 1 }.disabled(!pc.online)
                    Button("IMPORT LRC / TXT") { beginImport() }
                    Toggle("PREVIEW", isOn: $preview)
                    if let currentDocument { ShareLink(item: currentDocument.plain) { Label("SHARE LYRICS", systemImage: "square.and.arrow.up") } }
                } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44).contentShape(Rectangle()) }
                    .accessibilityLabel("LYRICS").accessibilityIdentifier("lyricsActions")
            }
            if let currentDocument {
                if preview {
                    Text(currentDocument.lines.first { $0.timestamp_ms == LyricsPresentation.active(currentDocument, position: clock.position) }?.text ?? String(currentDocument.plain.prefix(240)))
                        .font(.title3.weight(.semibold)).lineLimit(4).accessibilityIdentifier("lyricsPreview")
                }
                Button { expanded = true } label: {
                    Label("FULL LYRICS", systemImage: "arrow.up.left.and.arrow.down.right")
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle())
                }.buttonStyle(PressFeedbackStyle()).accessibilityIdentifier("openFullLyrics")
            } else if loading {
                ProgressView("Загрузка текста…").frame(minHeight: 44)
            } else {
                Text("Текст пока не загружен. Обнови его через меню при подключении к ПК или импортируй LRC / TXT.")
                    .font(.subheadline).foregroundStyle(.secondary)
                Button { beginImport() } label: {
                    Label("IMPORT LRC / TXT", systemImage: "doc.badge.plus").frame(minHeight: 44).contentShape(Rectangle())
                }.buttonStyle(PressFeedbackStyle())
            }
        }.padding(16).background(.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 24))
        .task(id: "\(player.current?.id ?? ""):\(pc.online):\(pc.catalogRevision):\(reload)") { await load() }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.plainText, UTType(filenameExtension: "lrc") ?? .plainText]) { result in
            let id = importSongID
            Task {
                do {
                    guard let id else { return }
                    try await LyricsStorage.shared.importFile(result.get(), id: id)
                    let loaded = try await LyricsStorage.shared.read(id)
                    guard player.current?.id == id else { return }
                    loadedSongID = id; document = loaded; reload += 1
                } catch {
                    if (error as? CocoaError)?.code != .userCancelled { self.error = error.localizedDescription }
                }
            }
        }
        .sheet(isPresented: $expanded) { ExpandedLyricsView(document: currentDocument) }
        .alert("Текст песни", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "") }
    }
    private func beginImport() { importSongID = player.current?.id; importing = true }
    private func load() async {
        guard let song = player.current else { document = nil; loadedSongID = nil; loading = false; return }
        let generation = reload
        if loadedSongID != song.id { document = nil; loadedSongID = song.id }
        loading = true
        let cached = try? await LyricsStorage.shared.read(song.id)
        guard !Task.isCancelled, player.current?.id == song.id, reload == generation else { return }
        if let cached, LyricsPresentation.hasText(cached) { document = cached }
        let fetched = await pc.cacheLyrics(song)
        guard !Task.isCancelled, player.current?.id == song.id, reload == generation else { return }
        if let fetched { document = fetched }
        loading = false
    }
}

private struct ExpandedLyricsView: View {
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var clock: PlaybackClock
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let document: LyricsDocument?
    @State private var following = true
    private var active: Int64? { LyricsPresentation.active(document, position: clock.position) }
    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        if let document, document.lines.isEmpty { Text(document.plain).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }
                        else if let document {
                            ForEach(document.lines) { line in
                                Button { player.seek(Double(line.timestamp_ms) / 1000) } label: {
                                    Text(line.text).font(.title2.bold()).multilineTextAlignment(.leading)
                                        .foregroundStyle(active == line.timestamp_ms ? Color.undertone : .secondary)
                                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle())
                                }.buttonStyle(PressFeedbackStyle()).id(line.id)
                                    .accessibilityValue(PlayerTimePresentation.clock(Double(line.timestamp_ms) / 1000))
                                    .accessibilityAddTraits(active == line.timestamp_ms ? .isSelected : [])
                            }
                        } else { CollectionEmptyView(title: "Текст недоступен", detail: "Вернись в плеер, чтобы обновить или импортировать текст.", icon: "text.alignleft") }
                    }.padding(24)
                }.modifier(SoftScrollEdges())
                    .onScrollPhaseChange { _, phase in if phase == .interacting { following = false } }
                    .onAppear { if let active { proxy.scrollTo(active, anchor: .center) } }
                    .onChange(of: active) { _, value in
                        if following, let value { withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { proxy.scrollTo(value, anchor: .center) } }
                    }
                    .onChange(of: player.current?.id) { _, _ in following = true }
                    .safeAreaInset(edge: .bottom, spacing: 0) {
                        if let document, !document.lines.isEmpty {
                            Button {
                                following.toggle()
                                if following, let active { withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { proxy.scrollTo(active, anchor: .center) } }
                            } label: {
                                Label(following ? "FOLLOWING" : "FOLLOW", systemImage: "text.line.first.and.arrowtriangle.forward")
                                    .frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
                            }.buttonStyle(PressFeedbackStyle()).accessibilityValue(following ? "ON" : "OFF")
                                .accessibilityIdentifier("lyricsFollow").padding(.horizontal, 24).padding(.vertical, 4).background(Color.canvas)
                        }
                    }
            }
            .background(Color.canvas).navigationTitle("Текст песни").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("CLOSE") { dismiss() }.accessibilityIdentifier("closeFullLyrics") } }
        }.modifier(MusicModalScope()).presentationDragIndicator(.visible)
    }
}
