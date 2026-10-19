import Foundation

// The share item retains this lease until the activity controller releases it.
// Only the private temporary directory is removed; library files are never moved.
final class OriginalFileExport: Sendable {
    let url: URL
    fileprivate init(url: URL) { self.url = url }
    deinit { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }

    static func filename(for song: Song) -> String {
        let trim = CharacterSet.whitespacesAndNewlines
        let title = song.title.trimmingCharacters(in: trim)
        let artist = song.artist.trimmingCharacters(in: trim)
        let fallback = (song.filename as NSString).deletingPathExtension
        let name = title.isEmpty ? fallback : artist.isEmpty ? title : "\(artist) — \(title)"
        let forbidden = CharacterSet.controlCharacters.union(CharacterSet(charactersIn: "<>:\"/\\|?*"))
        let underscore: Unicode.Scalar = "_"
        var stem = String(String.UnicodeScalarView(name.unicodeScalars.map { forbidden.contains($0) ? underscore : $0 }))
        let edges = trim.union(CharacterSet(charactersIn: "."))
        stem = stem.trimmingCharacters(in: edges)
        if stem.isEmpty { stem = "Track" }
        // Keep names portable when Save to Files is followed by copying to Windows.
        let first = stem.components(separatedBy: ".")[0].uppercased()
        let reserved = ["CON", "PRN", "AUX", "NUL"] + (1...9).flatMap { ["COM\($0)", "LPT\($0)"] }
        if reserved.contains(first) { stem = "_" + stem }
        let ext = (song.filename as NSString).pathExtension
        let suffix = ext.isEmpty ? "" : "." + ext
        let budget = min(200, max(1, 254 - suffix.utf8.count))
        while stem.utf8.count > budget { stem.removeLast() }
        stem = stem.trimmingCharacters(in: edges)
        return (stem.isEmpty ? "_" : stem) + suffix
    }
}

extension LibraryRepository {
    func exportOriginal(_ song: Song) throws -> OriginalFileExport {
        let source = try fileURL(song)
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("Undertone-original-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
        do {
            let destination = directory.appendingPathComponent(OriginalFileExport.filename(for: song))
            // Exact copy: preserves every embedded tag, cover and audio byte.
            try FileManager.default.copyItem(at: source, to: destination)
            return OriginalFileExport(url: destination)
        } catch {
            try? FileManager.default.removeItem(at: directory)
            throw error
        }
    }
}
