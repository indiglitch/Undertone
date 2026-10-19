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
