import XCTest
@testable import Undertone

final class MobileSearchResultsTests: XCTestCase {
    private let shared = String(repeating: "a", count: 32)
    private func request(_ query: String, _ filter: MobileSearchFilter = .songs, sort: String = "title") -> MobileSearchRequest {
        MobileSearchRequest(query: query, filter: filter, libraryRevision: 1, catalogRevision: 2, collectionsRevision: 3, sort: sort)
    }
    private func song(_ id: String, title: String, artist: String = "Группа Artist", album: String = "Альбом NIGHT", sync: String? = nil) -> Song {
        Song(id: id, syncID: sync, filename: id + ".wav", title: title, artist: artist, album: album,
             duration: 10, size: 100, format: "WAV", addedAt: .distantPast)
    }
    private func track(_ id: String, title: String, artist: String = "Группа Artist", album: String = "Альбом NIGHT") -> PCTrack {
        PCTrack(sync_id: id, title: title, artist: artist, album: album, duration: 10, format: "WAV", size: 100)
    }
    private func find(_ query: String, filter: MobileSearchFilter = .songs, local: [Song] = [], remote: [PCTrack] = [],
                      albums: Set<String> = [], playlists: [PCPlaylist] = []) -> MobileSearchResults {
        MobileSearchResults.find(request(query, filter), local: local, remote: remote, albumNames: albums, playlists: playlists)
    }

    func testEmptyAndWhitespaceQueriesDoNotBecomeAllLibraryResults() {
        for filter in MobileSearchFilter.allCases {
            for query in ["", " \n\t "] {
                let result = find(query, filter: filter, local: [song("local", title: "Track")],
                                  albums: ["Album"], playlists: [PCPlaylist(id: "p", name: "Mix", tracks: [])])
                XCTAssertTrue(result.request.isEmpty)
                XCTAssertEqual(result.count, 0)
            }
        }
    }

    func testSongsKeepCaseInsensitiveMixedLanguageMatchingAcrossAllMetadata() {
        let local = [song("local", title: "Ночной Drive")]
        for query in ["ноЧНОЙ dRIVE", "гРУППА aRTIST", "альбом night"] {
            XCTAssertEqual(find(query, local: local).songs.map(\.id), ["local"])
        }
        XCTAssertEqual(find("not-present", local: local).count, 0)
        XCTAssertEqual(find("nochnoi", local: local).count, 0)
        // Nonempty input keeps the original substring semantics; no new fuzzy
        // matching or silent trimming of meaningful query text.
        XCTAssertEqual(find(" Ночной Drive ", local: local).count, 0)
    }

    func testOriginalIdentityMergeAndRemoteResultsArePreserved() {
        let installed = song("local-hash", title: "Night local", sync: shared)
        let remote = [track(shared, title: "Night local"), track("remote", title: "Night remote")]
        let result = find("night", local: [installed], remote: remote)
        XCTAssertEqual(Set(result.songs.map(\.id)), [shared, "remote"])
        XCTAssertEqual(result.songs.first { $0.id == shared }?.local?.id, installed.id)
        XCTAssertNil(result.songs.first { $0.id == "remote" }?.local)
    }

    func testAlbumsArtistsAndPlaylistsKeepTheirExistingScopesAndDeduplication() {
        let local = [song("local", title: "Song", artist: "Группа Artist")]
        let remote = [track("remote", title: "Other", artist: "Группа Artist")]
        XCTAssertEqual(find("артист", filter: .artists, local: local, remote: remote).count, 0)
        XCTAssertEqual(find("группа ARTIST", filter: .artists, local: local, remote: remote).artists, ["Группа Artist"])
        XCTAssertEqual(find("смешанный night", filter: .albums, albums: ["Artist — Смешанный NIGHT", "Other"]).albums, ["Artist — Смешанный NIGHT"])
        let playlists = [PCPlaylist(id: "1", name: "Вечерний Mix", tracks: []), PCPlaylist(id: "2", name: "Other", tracks: ["mix"])]
        XCTAssertEqual(find("ВЕЧЕРНИЙ mix", filter: .playlists, playlists: playlists).playlists.map(\.id), ["1"])
    }

    func testLongNamesAndQueriesAreNotTruncatedByTheSearch() {
        let long = String(repeating: "Длинное название Long Title · ", count: 24)
        let result = find(long.lowercased(), local: [song("local", title: long)])
        XCTAssertEqual(result.songs.first?.song.title, long)
        XCTAssertEqual(find("long title", filter: .playlists, playlists: [PCPlaylist(id: "p", name: long, tracks: [])]).playlists.first?.name, long)
    }

    func testSongSortPreferenceIsStillUsed() {
        let local = [song("1", title: "A", artist: "Z", album: "Match"), song("2", title: "Z", artist: "A", album: "Match")]
        let byArtist = MobileSearchResults.find(request("Match", sort: "artist"), local: local, remote: [], albumNames: [], playlists: [])
        XCTAssertEqual(find("Match", local: local).songs.map(\.id), ["1", "2"])
        XCTAssertEqual(byArtist.songs.map(\.id), ["2", "1"])
    }
}
