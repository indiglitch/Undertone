import XCTest
import Combine
@testable import Undertone

final class HomeAndProgressTests: XCTestCase {
    func testRotationWrapsWithoutDuplicateCards() {
        XCTAssertEqual(HomeRotation.page([1,2,3,4,5],offset:3),[4,5,1])
        XCTAssertEqual(HomeRotation.next(3,count:5),1)
        XCTAssertEqual(HomeRotation.page([1,2],offset:8),[1,2])
        XCTAssertEqual(HomeRotation.next(2,count:2),0)
        XCTAssertTrue(HomeRotation.page([Int](),offset:3).isEmpty)
    }
    @MainActor func testProgressDoesNotPublishWholeDownloadCoordinator() {
        let downloads = BackgroundDownloads(pairingProvider:{ nil },sessionSuffix:UUID().uuidString,testConfiguration:.ephemeral)
        var wholeAppUpdates = 0
        let observer = downloads.objectWillChange.sink { wholeAppUpdates += 1 }
        downloads.progressState.update("a",bytes:40,expected:100)
        downloads.progressState.update("b",bytes:70,expected:200)
        XCTAssertEqual(wholeAppUpdates,0)
        XCTAssertEqual(downloads.progressState.samples["a"],DownloadSample(bytes:40,expected:100))
        XCTAssertEqual(downloads.progressState.samples["b"],DownloadSample(bytes:70,expected:200))
        downloads.progressState.remove("a")
        XCTAssertNil(downloads.progressState.samples["a"])
        observer.cancel()
    }
    @MainActor func testUnavailableShuffleDoesNotEnableOrRewriteQueue() {
        let player = MusicPlayer()
        player.shuffleUpcoming()
        XCTAssertFalse(player.shuffled)
        XCTAssertTrue(player.upcoming.isEmpty)
    }
}
