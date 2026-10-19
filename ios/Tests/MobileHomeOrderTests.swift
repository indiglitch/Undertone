import XCTest
@testable import Undertone

final class MobileHomeOrderTests: XCTestCase {
    func testPinnedPlaylistsComeFirstAndInputOrderDoesNotAffectHome() {
        let items = [PCPlaylist(id: "b", name: "Playlist 10", tracks: []),
                     PCPlaylist(id: "a", name: "Playlist 2", tracks: []),
                     PCPlaylist(id: "pin", name: "Z pinned", tracks: [])]
        let expected = ["pin", "a", "b"]
        XCTAssertEqual(MobileHomeOrder.playlists(items, pins: ["pin"]).map(\.id), expected)
        XCTAssertEqual(MobileHomeOrder.playlists(Array(items.reversed()), pins: ["pin"]).map(\.id), expected)
        XCTAssertEqual(items.map(\.id), ["b", "a", "pin"])
    }

    func testIdenticallyNamedPlaylistsHaveStableIdentityOrder() {
        let items = [PCPlaylist(id: "b", name: "Mix", tracks: []), PCPlaylist(id: "a", name: "Mix", tracks: [])]
        XCTAssertEqual(MobileHomeOrder.playlists(items, pins: []).map(\.id), ["a", "b"])
    }

    func testAlbumsUseTheirOwnPinNamespaceAndNaturalOrder() {
        let names: Set<String> = ["Artist — Album 10", "Artist — Album 2", "Artist — Z"]
        XCTAssertEqual(MobileHomeOrder.albums(names, pins: ["album:Artist — Z"]),
                       ["Artist — Z", "Artist — Album 2", "Artist — Album 10"])
        XCTAssertEqual(MobileHomeOrder.albums(names, pins: ["Artist — Z"]),
                       ["Artist — Album 2", "Artist — Album 10", "Artist — Z"])
        XCTAssertTrue(MobileHomeOrder.albums([], pins: []).isEmpty)
    }
}
