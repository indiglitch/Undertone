import Foundation
import Combine

struct PersonalPlaylist: Codable, Identifiable, Equatable {
    var id = UUID().uuidString
    var name: String
    var tracks: [String] = []
    var description = ""
}
struct LibraryFolder: Codable, Identifiable, Equatable {
    var id = UUID().uuidString
    var name: String
    var parent: String?
}
struct PersonalState: Codable {
    var likes: Set<String> = []
    var albums: Set<String> = []
    var artists: Set<String> = []
    var pins: Set<String> = []
    var playlists: [PersonalPlaylist] = []
    var folders: [LibraryFolder] = []
    var playlistFolders: [String:String] = [:]
    var recents: [String] = []
    var searches: [String] = []
    mutating func moveFolder(_ id: String, to parent: String?) -> Bool {
        guard let index = folders.firstIndex(where: { $0.id == id }) else { return false }
        if let parent {
            guard folders.contains(where: { $0.id == parent }) else { return false }
            var cursor: String? = parent; var seen = Set<String>()
            while let value = cursor {
                guard value != id, seen.insert(value).inserted else { return false }
                cursor = folders.first(where: { $0.id == value })?.parent
            }
        }
        folders[index].parent = parent; return true
    }
    mutating func deleteFolder(_ id: String) {
        let parent = folders.first(where: { $0.id == id })?.parent
        for index in folders.indices where folders[index].parent == id { folders[index].parent = parent }
        for key in Array(playlistFolders.keys) where playlistFolders[key] == id { playlistFolders[key] = parent }
        folders.removeAll { $0.id == id }; pins.remove("folder:" + id)
    }
}
actor PersonalStorage {
    private let path: URL
    init(root: URL = LibraryRepository.defaultRoot()) { path = root.appendingPathComponent("personal-library.json") }
    func read() throws -> PersonalState {
        guard FileManager.default.fileExists(atPath: path.path) else { return PersonalState() }
        return try JSONDecoder().decode(PersonalState.self, from: Data(contentsOf: path))
    }
    func save(_ state: PersonalState) throws {
        try FileManager.default.createDirectory(at: path.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(state).write(to: path, options: .atomic)
    }
}
@MainActor final class PersonalLibrary: ObservableObject {
    @Published private(set) var state = PersonalState()
    @Published var error: String?
    @Published private(set) var revision = 0
    private let storage = PersonalStorage()
    private var saveTask: Task<Void,Never>?
    func load() async { do { state = try await storage.read() } catch { self.error = "Не удалось прочитать личную библиотеку: " + error.localizedDescription } }
    func update(_ action: (inout PersonalState) -> Void) {
        action(&state); revision += 1; let snapshot = state, previous = saveTask
        saveTask = Task { await previous?.value; do { try await storage.save(snapshot) } catch { self.error = error.localizedDescription } }
    }
    func record(_ id: String) { update { $0.recents.removeAll { $0 == id }; $0.recents.insert(id, at: 0); $0.recents = Array($0.recents.prefix(200)) } }
    func rememberSearch(_ text: String) { let query = text.trimmingCharacters(in: .whitespacesAndNewlines); guard !query.isEmpty else { return }; update { $0.searches.removeAll { $0 == query }; $0.searches.insert(query, at: 0); $0.searches = Array($0.searches.prefix(20)) } }
    func toggleLike(_ id: String) { update { if !$0.likes.insert(id).inserted { $0.likes.remove(id) } } }
    func togglePin(_ id: String) { update { if !$0.pins.insert(id).inserted { $0.pins.remove(id) } } }
}

struct PlayerSnapshot: Codable {
    var ids: [String]
    var currentID: String
    var repeatMode: String
    var position: Double
}
actor PlayerStorage {
    private let path: URL
    init(root: URL = LibraryRepository.defaultRoot()) { path = root.appendingPathComponent("player-session.json") }
    func read() throws -> PlayerSnapshot? {
        guard FileManager.default.fileExists(atPath: path.path) else { return nil }
        return try JSONDecoder().decode(PlayerSnapshot.self, from: Data(contentsOf: path))
    }
    func save(_ state: PlayerSnapshot) throws {
        try FileManager.default.createDirectory(at: path.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(state).write(to: path, options: .atomic)
    }
}
