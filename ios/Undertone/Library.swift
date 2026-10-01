import Foundation
import AVFoundation
import CryptoKit
import Combine

struct Song: Codable, Identifiable, Equatable, Sendable {
    let id: String // SHA-256 of the original bytes; PC sync identity is separate.
    var syncID: String?
    let filename: String
    let title: String
    let artist: String
    let album: String
    let duration: Double
    let size: Int64
    let format: String
    let addedAt: Date
    var syncIDs: [String]? = nil
    var sourceIDs: Set<String> { Set(syncIDs ?? []).union(syncID.map { [$0] } ?? []) }
}

struct LibraryManifest: Codable {
    var version = 1
    var songs: [Song] = []
}

enum LibraryError: LocalizedError {
    case unsupportedVersion, invalidFilename
    var errorDescription: String? {
        switch self {
        case .unsupportedVersion: return "Эта библиотека создана более новой версией Undertone."
        case .invalidFilename: return "Некорректное имя музыкального файла."
        }
    }
}

actor LibraryRepository {
    let root: URL
    init(root: URL) { self.root = root }

    static func defaultRoot() -> URL {
        URL.applicationSupportDirectory.appendingPathComponent("Undertone", isDirectory: true)
    }

    func prepare() throws {
        try FileManager.default.createDirectory(at: root.appendingPathComponent("Music"), withIntermediateDirectories: true)
    }

    func read() throws -> [Song] {
        try prepare()
        let url = root.appendingPathComponent("library.json")
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }
        let manifest = try JSONDecoder().decode(LibraryManifest.self, from: Data(contentsOf: url))
        guard manifest.version == 1 else { throw LibraryError.unsupportedVersion }
        return manifest.songs
    }

    func write(_ songs: [Song]) throws {
        try prepare()
        let data = try JSONEncoder().encode(LibraryManifest(songs: songs))
        try data.write(to: root.appendingPathComponent("library.json"), options: .atomic)
    }

    func fileURL(_ song: Song) throws -> URL {
        guard song.filename == (song.filename as NSString).lastPathComponent,
              !song.filename.isEmpty, song.filename != ".", song.filename != ".." else {
            throw LibraryError.invalidFilename
        }
        return root.appendingPathComponent("Music").appendingPathComponent(song.filename)
    }

    // Chunked hashing keeps large lossless files out of RAM. No tag rewriting or transcoding.
    static func sha256(_ url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hash = SHA256()
        while let bytes = try handle.read(upToCount: 1024 * 1024), !bytes.isEmpty { hash.update(data: bytes) }
        return hash.finalize().map { String(format: "%02x", $0) }.joined()
    }

    func importFile(_ source: URL) async throws -> Song {
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }
        try prepare()
        // Stage one immutable copy before hashing, so a changing source cannot invalidate identity.
        let temporary = root.appendingPathComponent("Music").appendingPathComponent(".import-\(UUID().uuidString).\(source.pathExtension)")
        defer { try? FileManager.default.removeItem(at: temporary) }
        try FileManager.default.copyItem(at: source, to: temporary)
        let hash = try Self.sha256(temporary)
        var songs = try read()
        if let existing = songs.first(where: { $0.id == hash }),
           FileManager.default.fileExists(atPath: try fileURL(existing).path) { return existing }
        let ext = source.pathExtension.lowercased()
        let filename = ext.isEmpty ? hash : "\(hash).\(ext)"
        let destination = root.appendingPathComponent("Music").appendingPathComponent(filename)
        // Metadata is read from the stable staged file, with the source extension as a hint.
        let asset = AVURLAsset(url: temporary)
        let metadata = (try? await asset.load(.commonMetadata)) ?? []
        var title = source.deletingPathExtension().lastPathComponent
        var artist = "Неизвестный исполнитель"
        var album = "Без альбома"
        for item in metadata {
            guard let value = try? await item.load(.stringValue), !value.isEmpty else { continue }
            switch item.commonKey {
            case .commonKeyTitle: title = value
            case .commonKeyArtist: artist = value
            case .commonKeyAlbumName: album = value
            default: break
            }
        }
        let loadedDuration = try? await asset.load(.duration)
        let duration = loadedDuration?.seconds ?? 0
        let size = (try temporary.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        let song = Song(id: hash, syncID: nil, filename: filename, title: title, artist: artist,
                        album: album, duration: duration.isFinite ? max(0, duration) : 0,
                        size: Int64(size), format: ext.uppercased(), addedAt: Date())
        if !FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.moveItem(at: temporary, to: destination)
        }
        await CoverStore.shared.extract(destination, id: hash)
        songs = try read()
        songs.removeAll { $0.id == hash }
        songs.append(song)
        try write(songs)
        return song
    }

    func installDownload(_ file: URL, track: PCTrack, expectedHash: String) async throws {
        try prepare()
        let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard Int64(size) == track.size, try Self.sha256(file) == expectedHash.lowercased(),
              !track.format.isEmpty, track.format.count <= 8, track.format.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }) else { throw PCError.corruptDownload }
        let filename = "\(expectedHash.lowercased()).\(track.format.lowercased())"
        let destination = root.appendingPathComponent("Music").appendingPathComponent(filename)
        var songs = try read()
        if !FileManager.default.fileExists(atPath: destination.path) { try FileManager.default.moveItem(at: file, to: destination) }
        await CoverStore.shared.extract(destination, id: track.id)
        songs = try read()
        let aliases = (songs.first(where: { $0.id == expectedHash.lowercased() })?.sourceIDs ?? []).union([track.id])
        let song = Song(id: expectedHash.lowercased(), syncID: track.id, filename: filename, title: track.title, artist: track.artist,
                        album: track.album, duration: track.duration.isFinite ? max(0, track.duration) : 0, size: track.size, format: track.format.uppercased(), addedAt: Date(), syncIDs: aliases.sorted())
        songs.removeAll { $0.id == song.id || $0.syncID == track.id }; songs.append(song)
        try write(songs)
    }
}

@MainActor
final class LibraryStore: ObservableObject {
    @Published private(set) var songs: [Song] = []
    @Published private(set) var importing = false
    @Published var error: String?
    let repository = LibraryRepository(root: LibraryRepository.defaultRoot())

    @Published private(set) var bytes: Int64 = 0
    @Published private(set) var albums: [String: [Song]] = [:]
    @Published private(set) var sortedSongs: [Song] = []
    @Published private(set) var recentSongs: [Song] = []
    @Published private(set) var installedIDs: Set<String> = []
    @Published private(set) var revision = 0

    private var loadGeneration = 0
    func load() async {
        loadGeneration += 1; let operation = loadGeneration
        do {
            let records = try await repository.read()
            guard records != songs else { return }
            let index = await Task.detached(priority: .userInitiated) {
                (records.reduce(Int64(0)) { $0 + $1.size }, Dictionary(grouping: records, by: { "\($0.artist) — \($0.album)" }),
                 records.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending },
                 Array(records.sorted { $0.addedAt > $1.addedAt }.prefix(8)), Set(records.flatMap { $0.sourceIDs }))
            }.value
            guard operation == loadGeneration else { return }
            bytes = index.0; albums = index.1; sortedSongs = index.2; recentSongs = index.3; installedIDs = index.4
            songs = records; revision += 1
        }
        catch { self.error = error.localizedDescription }
    }

    func importFiles(_ urls: [URL]) async {
        guard !importing else { return }
        importing = true
        defer { importing = false }
        var failures: [String] = []
        for url in urls {
            do { _ = try await repository.importFile(url) }
            catch { failures.append("\(url.lastPathComponent): \(error.localizedDescription)") }
        }
        await load()
        if !failures.isEmpty { error = failures.joined(separator: "\n") }
    }
}
