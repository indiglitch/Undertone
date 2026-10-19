import XCTest
@testable import Undertone

final class AutomaticDownloadsTests: XCTestCase {
    private func track(_ id: String) -> PCTrack {
        PCTrack(sync_id:id,title:id,artist:"Artist",album:"Album",duration:1,format:"FLAC",size:100)
    }
    func testLikedSelectionExcludesInstalledDeduplicatesAndPreservesCatalogOrder() {
        let tracks = [track("c"),track("a"),track("b"),track("a"),track("d")]
        XCTAssertEqual(DownloadSelection.missing(tracks,ids:["a","b","c"],installed:["b"]).map(\.id),["c","a"])
        XCTAssertTrue(DownloadSelection.missing(tracks,ids:[],installed:[]).isEmpty)
    }
    @MainActor func testAutomaticQueueRetriesOnlySelectedFailuresAndPreservesPause() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:root) }
        let store = DownloadPersistence(root:root.appendingPathComponent("Transfers"))
        try await store.save([
            DownloadRecord(track:track("a"),state:"failed"),
            DownloadRecord(track:track("b"),state:"paused"),
            DownloadRecord(track:track("c"),state:"failed")
        ])
        let downloads = BackgroundDownloads(root:root,pairingProvider:{ nil },sessionSuffix:UUID().uuidString,testConfiguration:.ephemeral)
        await downloads.enqueueAutomatic([track("a"),track("b"),track("d")],installed:[])
        await downloads.enqueueAutomatic([track("a"),track("b"),track("d")],installed:[])
        XCTAssertEqual(downloads.records.map(\.id),["a","b","c","d"])
        XCTAssertEqual(downloads.records.map(\.state),["queued","paused","failed","queued"])
        let saved = try await store.read()
        XCTAssertEqual(saved.map(\.state),["queued","paused","failed","queued"])
    }
}
