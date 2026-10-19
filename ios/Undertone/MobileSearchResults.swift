import Foundation

enum MobileSearchFilter: String, CaseIterable, Identifiable, Sendable {
    case songs = "SONGS", albums = "ALBUMS", artists = "ARTISTS", playlists = "PLAYLISTS"
    var id: String { rawValue }
}

struct MobileSearchRequest: Hashable, Sendable {
    let query: String
    let filter: MobileSearchFilter
    let libraryRevision: Int
    let catalogRevision: Int
    let collectionsRevision: Int
    let sort: String

    var isEmpty: Bool { query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
}

struct MobileSearchResults: Sendable {
    let request: MobileSearchRequest
    var songs: [UnifiedTrack] = []
    var albums: [String] = []
    var artists: [String] = []
    var playlists: [PCPlaylist] = []

    var count: Int {
        switch request.filter {
        case .songs: return songs.count
        case .albums: return albums.count
        case .artists: return artists.count
        case .playlists: return playlists.count
        }
    }

    // Same cached sources, identity merge, sort preference and localized
    // case-insensitive substring matching as the original mobile search.
    static func find(_ request: MobileSearchRequest, local: [Song], remote: [PCTrack],
                     albumNames: Set<String>, playlists: [PCPlaylist]) -> MobileSearchResults {
        var result = MobileSearchResults(request: request)
        guard !request.isEmpty else { return result }
        let query = request.query
        switch request.filter {
        case .songs:
            result.songs = TrackCatalog.merged(local: local, remote: remote, sort: LibrarySort(rawValue: request.sort) ?? .title).filter {
                let song = $0.song
                return (song.title + " " + song.artist + " " + song.album).localizedCaseInsensitiveContains(query)
            }
        case .albums:
            result.albums = albumNames.filter { $0.localizedCaseInsensitiveContains(query) }.sorted()
        case .artists:
            result.artists = Set(remote.map(\.artist)).union(local.map(\.artist))
                .filter { $0.localizedCaseInsensitiveContains(query) }.sorted()
        case .playlists:
            result.playlists = playlists.filter { $0.name.localizedCaseInsensitiveContains(query) }
        }
        return result
    }
}
