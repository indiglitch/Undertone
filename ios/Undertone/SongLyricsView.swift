import SwiftUI
import UniformTypeIdentifiers

struct LyricLine: Codable, Identifiable, Equatable, Sendable {
    var timestamp_ms: Int64
    var text: String
    var id: Int64 { timestamp_ms }
}
struct LyricsDocument: Codable, Sendable {
    var plain: String
    var lines: [LyricLine]
    static func parse(_ text: String) -> LyricsDocument {
        let pattern = try! NSRegularExpression(pattern: "\\[(\\d+):(\\d{2})(?:[.:](\\d{1,3}))?\\]")
        var lines: [LyricLine] = []
        for raw in text.components(separatedBy:.newlines) {
            let range = NSRange(raw.startIndex...,in:raw), matches = pattern.matches(in:raw,range:range)
            guard let last = matches.last, let end = Range(last.range,in:raw) else { continue }
            let content = String(raw[end.upperBound...]).trimmingCharacters(in:.whitespaces)
            for match in matches {
                func capture(_ index: Int) -> String { Range(match.range(at:index),in:raw).map { String(raw[$0]) } ?? "" }
                let minute = Int64(capture(1)) ?? 0, second = Int64(capture(2)) ?? 0, fraction = capture(3)
                guard second < 60, minute <= 1000000 else { continue }
                let millis = Int64((fraction + "000").prefix(3)) ?? 0
                lines.append(LyricLine(timestamp_ms:(minute*60+second)*1000+millis,text:content))
            }
        }
        lines.sort { $0.timestamp_ms < $1.timestamp_ms }
        var seen = Set<Int64>(); lines = lines.filter { seen.insert($0.timestamp_ms).inserted }
        return LyricsDocument(plain:lines.isEmpty ? text : lines.map(\.text).joined(separator:"\n"),lines:lines)
    }
}
actor LyricsStorage {
    static let shared = LyricsStorage()
    private let root = LibraryRepository.defaultRoot().appendingPathComponent("Lyrics",isDirectory:true)
    private func path(_ id: String) throws -> URL {
        guard (id.count == 32 || id.count == 64), id.allSatisfy(\.isHexDigit) else { throw PCError.rejected }
        return root.appendingPathComponent(id + ".json")
    }
    func read(_ id: String) throws -> LyricsDocument? {
        let file = try path(id); guard FileManager.default.fileExists(atPath:file.path) else { return nil }
        return try JSONDecoder().decode(LyricsDocument.self,from:Data(contentsOf:file))
    }
    func save(_ doc: LyricsDocument,id: String) throws { try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true); try JSONEncoder().encode(doc).write(to:try path(id),options:.atomic) }
    func importFile(_ url: URL,id: String) throws {
        let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
        let size = try url.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? 0
        guard size <= 1024*1024 else { throw PCError.rejected }
        let text = try String(contentsOf:url,encoding:.utf8); try save(LyricsDocument.parse(text),id:id)
    }
}
struct SongLyricsView: View {
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var clock: PlaybackClock
    @AppStorage("lyricsPreview") private var preview = true
    @State private var document: LyricsDocument?
    @State private var reload = 0
    @State private var importing = false
    @State private var expanded = false
    @State private var error: String?
    private var active: Int64? { document?.lines.last(where: { Double($0.timestamp_ms) <= clock.position*1000 })?.timestamp_ms }
    var body: some View {
        VStack(alignment:.leading,spacing:12) {
            HStack { Text("Текст песни").font(.headline); Spacer(); Menu("LYRICS",systemImage:"ellipsis") {
                Button("REFRESH LYRICS",systemImage:"arrow.clockwise") { reload += 1 }.disabled(!pc.online)
                Button("IMPORT LRC / TXT") { importing = true }
                Toggle("PREVIEW",isOn:$preview)
                if let document { ShareLink(item:document.plain) { Label("SHARE LYRICS",systemImage:"square.and.arrow.up") } }
            } }
            if let document {
                if preview { Text(document.lines.first(where: { $0.timestamp_ms == active })?.text ?? String(document.plain.prefix(240))).font(.title3.weight(.semibold)).lineLimit(4) }
                Button("FULL LYRICS",systemImage:"arrow.up.left.and.arrow.down.right") { expanded = true }
            } else { Text("Текст пока не загружен. Подключи ПК и обнови текст через меню; можно также импортировать LRC или TXT.").font(.caption).foregroundStyle(.secondary) }
        }.padding(20).background(.white.opacity(0.055),in:RoundedRectangle(cornerRadius:24))
        .task(id:"\(player.current?.id ?? ""):\(pc.online):\(pc.catalogRevision):\(reload)") {
            document = nil; guard let song = player.current else { return }
            document = try? await LyricsStorage.shared.read(song.id)
            if let doc = await pc.cacheLyrics(song) {
                guard !Task.isCancelled, player.current?.id == song.id else { return }; document = doc
            }
        }
        .fileImporter(isPresented:$importing,allowedContentTypes:[.plainText,UTType(filenameExtension:"lrc") ?? .plainText]) { result in
            Task { do { guard let id = player.current?.id else { return }; let url = try result.get(); try await LyricsStorage.shared.importFile(url,id:id); document = try await LyricsStorage.shared.read(id) } catch { self.error = error.localizedDescription } }
        }
        .sheet(isPresented:$expanded) { NavigationStack {
            ScrollViewReader { proxy in ScrollView { LazyVStack(alignment:.leading,spacing:22) {
                if let document, document.lines.isEmpty { Text(document.plain).textSelection(.enabled) }
                else { ForEach(document?.lines ?? []) { line in Button { player.seek(Double(line.timestamp_ms)/1000) } label: { Text(line.text).font(.title2.bold()).foregroundStyle(active == line.timestamp_ms ? Color.undertone : Color.secondary).frame(maxWidth:.infinity,alignment:.leading) }.id(line.id) } }
            }.padding(24) }.modifier(SoftScrollEdges()).onChange(of:active) { _, value in if let value { withAnimation(.easeOut(duration:0.2)) { proxy.scrollTo(value,anchor:.center) } } } }
            .navigationTitle("Текст песни").toolbar { ToolbarItem(placement:.topBarTrailing) { Button("CLOSE") { expanded = false } } }
        } }
        .alert("Текст песни",isPresented:Binding(get:{error != nil},set:{if !$0 {error = nil}})) { Button("OK") { error = nil } } message: { Text(error ?? "") }
    }
}
