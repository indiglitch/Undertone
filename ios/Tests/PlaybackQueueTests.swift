import XCTest
@testable import Undertone

final class PlaybackQueueTests: XCTestCase {
    private func song(_ id: String, title: String? = nil, artist: String = "Artist", album: String = "Album", added: Double = 0) -> Song {
        Song(id: id, syncID: nil, filename: id + ".wav", title: title ?? id, artist: artist, album: album, duration: 10, size: 100, format: "WAV", addedAt: Date(timeIntervalSince1970: added))
    }
    func testPlayNextMovesExistingTrackWithoutSkippingCurrent() {
        var queue = PlaybackQueue()
        queue.replace([song("a"), song("b"), song("c"), song("d")], selected: song("b"))
        queue.enqueue(song("a"), next: true)
        XCTAssertEqual(queue.current?.id, "b")
        XCTAssertEqual(queue.upcoming.map(\.id), ["a", "c", "d"])
        XCTAssertEqual(queue.advance(1, automatic: false)?.id, "a")
    }
    func testEditingTailKeepsCurrentAndHistory() {
        var queue = PlaybackQueue()
        queue.replace([song("a"), song("b"), song("c"), song("d"), song("e")], selected: song("b"))
        queue.moveUpcoming(IndexSet(integer: 0), to: 3)
        XCTAssertEqual(queue.upcoming.map(\.id), ["d", "e", "c"])
        queue.removeUpcoming(IndexSet(integer: 1))
        XCTAssertEqual(queue.upcoming.map(\.id), ["d", "c"])
        XCTAssertEqual(queue.current?.id, "b")
        queue.clearUpcoming()
        XCTAssertEqual(queue.songs.map(\.id), ["a", "b"])
        XCTAssertNil(queue.advance(1, automatic: true))
    }
    func testRepeatOneOnlyAffectsAutomaticCompletion() {
        var queue = PlaybackQueue()
        queue.replace([song("a"), song("b")], selected: song("a")); queue.mode = .one
        XCTAssertEqual(queue.advance(1, automatic: true)?.id, "a")
        XCTAssertEqual(queue.advance(1, automatic: false)?.id, "b")
        XCTAssertNil(queue.advance(1, automatic: false))
        queue.mode = .all
        XCTAssertEqual(queue.advance(1, automatic: true)?.id, "a")
        XCTAssertEqual(queue.advance(-1, automatic: false)?.id, "b")
    }
    func testShuffleAndDuplicateAddsPreserveMembership() {
        var queue = PlaybackQueue()
        queue.replace([song("a"), song("b"), song("b"), song("c")], selected: song("a"))
        queue.enqueue(song("b"), next: false)
        queue.enqueue(song("a"), next: true)
        queue.shuffleUpcoming()
        XCTAssertEqual(queue.current?.id, "a")
        XCTAssertEqual(Set(queue.upcoming.map(\.id)), Set(["b", "c"]))
        XCTAssertEqual(queue.upcoming.count, 2)
    }
    func testStableLibrarySortAndNewestDates() {
        let songs = [song("b", title: "Same", artist: "Z", added: 1), song("a", title: "Same", artist: "A", added: 3), song("c", title: "First", added: 2)]
        XCTAssertEqual(LibrarySort.title.sorted(songs).map(\.id), ["c", "a", "b"])
        XCTAssertEqual(LibrarySort.artist.sorted(songs).map(\.id), ["a", "c", "b"])
        XCTAssertEqual(LibrarySort.newest.sorted(songs).map(\.id), ["a", "c", "b"])
    }
    func testSelectedTrackMissingFromSourceCanStillAdvance() {
        var queue = PlaybackQueue()
        queue.replace([song("b")], selected: song("a"))
        XCTAssertEqual(queue.current?.id, "a")
        XCTAssertEqual(queue.advance(1, automatic: false)?.id, "b")
    }
    func testRemovingFilesPreservesSurvivingCurrentAndDropsDeletedQueueEntries() {
        var queue = PlaybackQueue()
        queue.replace([song("a"),song("b"),song("c"),song("d")],selected:song("b"))
        queue.removeFiles(["a","c"])
        XCTAssertEqual(queue.current?.id,"b")
        XCTAssertEqual(queue.upcoming.map(\.id),["d"])
        queue.removeFiles(["b","d"])
        XCTAssertNil(queue.current)
        XCTAssertTrue(queue.songs.isEmpty)
    }
}
