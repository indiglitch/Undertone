import XCTest
@testable import Undertone

final class CollectionPresentationTests: XCTestCase {
    func testVisibleSortIsOnlyOfferedWhereTheExistingModelUsesIt() {
        XCTAssertEqual(CollectionOrderPresentation.mode(playlist: false, album: false, ordered: false, recent: false), .sortable)
        XCTAssertEqual(CollectionOrderPresentation.mode(playlist: true, album: false, ordered: false, recent: false), .playlist)
        XCTAssertEqual(CollectionOrderPresentation.mode(playlist: false, album: true, ordered: false, recent: false), .album)
        XCTAssertEqual(CollectionOrderPresentation.mode(playlist: false, album: false, ordered: true, recent: true), .recent)
        XCTAssertEqual(CollectionOrderPresentation.mode(playlist: false, album: false, ordered: true, recent: false), .fixed)
    }

    func testPlaylistAndRecentIdentityOrderStillOverridesGlobalSort() {
        let a = PCTrack(sync_id: "a", title: "Alpha", artist: "Artist", album: "Album", duration: 1, format: "WAV", size: 1)
        let z = PCTrack(sync_id: "z", title: "Zulu", artist: "Artist", album: "Album", duration: 1, format: "WAV", size: 1)
        for sort in LibrarySort.allCases {
            XCTAssertEqual(TrackCatalog.merged(local: [], remote: [a,z], order: ["z","a"], sort: sort).map(\.id), ["z","a"])
        }
    }
}
