import Foundation

struct PCPlaylist: Codable, Identifiable, Sendable, Equatable {
    let id: String
    var name: String
    var tracks: [String]
    var description: String? = nil
}
struct PCCollections: Codable, Sendable {
    var likes: [String] = []
    var playlists: [PCPlaylist] = []
    mutating func apply(_ edit: PCEdit) {
        switch edit.kind {
        case "like":
            guard let track = edit.track else { return }
            likes.removeAll { $0 == track }; if edit.liked == true { likes.append(track) }
        case "create_playlist":
            guard let id = edit.playlist, let name = edit.name, !playlists.contains(where: { $0.id == id }) else { return }
            playlists.append(PCPlaylist(id: id, name: name, tracks: []))
        case "rename_playlist":
            if let index = playlists.firstIndex(where: { $0.id == edit.playlist }), let name = edit.name { playlists[index].name = name }
        case "delete_playlist": playlists.removeAll { $0.id == edit.playlist }
        case "add_tracks":
            if let index = playlists.firstIndex(where: { $0.id == edit.playlist }) { playlists[index].tracks += edit.tracks ?? [] }
        case "replace_tracks":
            if let index = playlists.firstIndex(where: { $0.id == edit.playlist }) { playlists[index].tracks = edit.tracks ?? [] }
        case "describe_playlist":
            if let index = playlists.firstIndex(where: { $0.id == edit.playlist }) { playlists[index].description = edit.description }
        case "remove_track":
            if let index = playlists.firstIndex(where: { $0.id == edit.playlist }) { playlists[index].tracks.removeAll { $0 == edit.track } }
        default: break
        }
    }
}
struct PCEdit: Codable, Sendable, Identifiable {
    var id = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    var kind: String
    var track: String?
    var liked: Bool?
    var playlist: String?
    var name: String?
    var tracks: [String]?
    var expected_tracks: [String]? = nil
    var description: String? = nil
}
struct PCStoredState: Codable, Sendable {
    var collections = PCCollections()
    var pending: [PCEdit] = []
}
actor PCStorage {
    private let root: URL
    init(root: URL = LibraryRepository.defaultRoot()) { self.root = root }
    func catalog(_ data: Data? = nil) throws -> PCCatalog? {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let path = root.appendingPathComponent("pc-catalog.json")
        if let data { try data.write(to: path, options: .atomic) }
        guard FileManager.default.fileExists(atPath: path.path) else { return nil }
        return try JSONDecoder().decode(PCCatalog.self, from: Data(contentsOf: path))
    }
    func read() throws -> PCStoredState {
        let path = root.appendingPathComponent("pc-collections.json")
        guard FileManager.default.fileExists(atPath: path.path) else { return PCStoredState() }
        return try JSONDecoder().decode(PCStoredState.self, from: Data(contentsOf: path))
    }
    func save(_ state: PCStoredState) throws {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try JSONEncoder().encode(state).write(to: root.appendingPathComponent("pc-collections.json"), options: .atomic)
    }
    func clear() throws {
        for file in ["pc-catalog.json", "pc-collections.json"] { try? FileManager.default.removeItem(at: root.appendingPathComponent(file)) }
    }
    static func decodeCatalog(_ data: Data) throws -> PCCatalog {
        let catalog = try JSONDecoder().decode(PCCatalog.self, from: data)
        guard catalog.version == 1, Set(catalog.tracks.map(\.id)).count == catalog.tracks.count,
              catalog.tracks.allSatisfy({ $0.sync_id.count == 32 && $0.sync_id.allSatisfy(\.isHexDigit) && $0.size >= 0 }) else { throw PCError.rejected }
        return catalog
    }
}
