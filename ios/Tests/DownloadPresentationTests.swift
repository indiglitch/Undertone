import XCTest
@testable import Undertone

final class DownloadPresentationTests: XCTestCase {
    @MainActor func testFailureDetailsSurviveToastConsumptionUntilExplicitDismissal() {
        let downloads = BackgroundDownloads(pairingProvider: { nil }, sessionSuffix: UUID().uuidString, testConfiguration: .ephemeral)
        downloads.error = "Verification failed"
        // AppErrorToast consumes the transient channel immediately.
        downloads.error = nil
        XCTAssertEqual(downloads.lastFailureMessage, "Verification failed")
        downloads.dismissFailureMessage()
        XCTAssertNil(downloads.lastFailureMessage)
        downloads.error = "Retry failed"
        XCTAssertEqual(downloads.lastFailureMessage, "Retry failed")
    }
    private func track(_ id: String = "a", size: Int64 = 100) -> PCTrack {
        PCTrack(sync_id: id, title: "Long Название", artist: "Artist", album: "Album", duration: 1, format: "WAV", size: size)
    }
    func testActionsFollowExistingStatesAndTaskOwnership() {
        for state in ["queued", "downloading", "installing", "paused", "failed", "future"] {
            let value = DownloadRecordPresentation(record: DownloadRecord(track: track(), state: state))
            XCTAssertEqual(value.canResume, state == "paused")
            XCTAssertEqual(value.canRetry, state == "failed")
            XCTAssertEqual(value.canCancel, ["queued", "downloading", "paused", "failed"].contains(state))
        }
        XCTAssertFalse(DownloadRecordPresentation(record: DownloadRecord(track: track(), state: "paused", taskID: 42)).canResume)
        XCTAssertFalse(DownloadRecordPresentation.hasControls([DownloadRecord(track: track(), state: "installing")]))
    }
    func testProgressHasNoInventedTotalAndClampsInvalidByteCounts() {
        XCTAssertNil(DownloadProgressPresentation.fraction(nil, size: 0))
        XCTAssertNil(DownloadProgressPresentation.fraction(DownloadSample(bytes: 20, expected: -1), size: 0))
        XCTAssertEqual(DownloadProgressPresentation.fraction(DownloadSample(bytes: 35, expected: 100), size: 200), 0.35)
        XCTAssertEqual(DownloadProgressPresentation.fraction(DownloadSample(bytes: -10, expected: 100), size: 0), 0)
        XCTAssertEqual(DownloadProgressPresentation.fraction(DownloadSample(bytes: 300, expected: -1), size: 200), 1)
    }
    @MainActor func testWaitingPauseRetryResumeAndCancelUseRealQueue() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let downloads = BackgroundDownloads(root: root, pairingProvider: { nil }, sessionSuffix: UUID().uuidString, testConfiguration: .ephemeral)
        await downloads.enqueue([track()], installed: [])
        XCTAssertEqual(downloads.records.first?.state, "queued")
        await downloads.pause()
        XCTAssertEqual(downloads.records.first?.state, "paused")
        await downloads.retry("a")
        XCTAssertEqual(downloads.records.first?.state, "queued")
        await downloads.pause(); await downloads.resume()
        XCTAssertEqual(downloads.records.first?.state, "queued")
        await downloads.cancel("a")
        XCTAssertTrue(downloads.records.isEmpty)
        XCTAssertTrue(downloads.recentCompletions.isEmpty)
        XCTAssertEqual(downloads.completed, 0)
    }
    @MainActor func testVerifiedInstallCreatesSessionHistoryButQueueBecomesEmpty() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let file = root.appendingPathComponent("original.tmp")
        try wav().write(to: file)
        let hash = try LibraryRepository.sha256(file), song = track(size: Int64(wav().count))
        let downloads = BackgroundDownloads(root: root, pairingProvider: { nil }, sessionSuffix: UUID().uuidString, testConfiguration: .ephemeral)
        await downloads.enqueue([song], installed: [])
        let response = HTTPURLResponse(url: URL(string: "https://127.0.0.1/file")!, statusCode: 200, httpVersion: nil, headerFields: ["X-Content-SHA256": hash])!
        await downloads.finished(1, trackID: song.id, file: file, response: response)
        XCTAssertTrue(downloads.records.isEmpty)
        XCTAssertEqual(downloads.completed, 1)
        XCTAssertEqual(downloads.recentCompletions.map(\.track.id), [song.id])
        let repository = LibraryRepository(root: root)
        let installed = try await repository.read()
        XCTAssertEqual(installed.count, 1)
        let installedURL = try await repository.fileURL(XCTUnwrap(installed.first))
        XCTAssertEqual(try Data(contentsOf: installedURL), wav())
        // Removing a phone copy does not rewrite the successful operation history.
        _ = try await repository.removePhoneCopies(installed)
        XCTAssertEqual(downloads.recentCompletions.count, 1)
        let remaining = try await repository.read()
        XCTAssertTrue(remaining.isEmpty)
    }
    @MainActor func testInvalidInstallHasRetryAndNeverAppearsInCompletedHistory() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let file = root.appendingPathComponent("invalid.tmp")
        try Data([0, 1]).write(to: file)
        let downloads = BackgroundDownloads(root: root, pairingProvider: { nil }, sessionSuffix: UUID().uuidString, testConfiguration: .ephemeral)
        await downloads.enqueue([track()], installed: [])
        await downloads.finished(1, trackID: "a", file: file, response: nil)
        XCTAssertEqual(downloads.records.first?.state, "failed")
        XCTAssertNotNil(downloads.error)
        XCTAssertEqual(downloads.completed, 0)
        XCTAssertTrue(downloads.recentCompletions.isEmpty)
        await downloads.retry("a")
        XCTAssertEqual(downloads.records.first?.state, "queued")
    }
    @MainActor func testLateCallbackAfterCancellationDoesNotCreateCompletion() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let file = root.appendingPathComponent("late.tmp")
        try Data([0]).write(to: file)
        let downloads = BackgroundDownloads(root: root, pairingProvider: { nil }, sessionSuffix: UUID().uuidString, testConfiguration: .ephemeral)
        await downloads.enqueue([track()], installed: []); await downloads.cancel("a")
        await downloads.finished(1, trackID: "a", file: file, response: nil)
        XCTAssertTrue(downloads.records.isEmpty)
        XCTAssertTrue(downloads.recentCompletions.isEmpty)
    }
    private func wav() -> Data {
        var bytes = Data()
        func text(_ value: String) { bytes.append(contentsOf: value.utf8) }
        func u16(_ value: UInt16) { var value = value.littleEndian; withUnsafeBytes(of: &value) { bytes.append(contentsOf: $0) } }
        func u32(_ value: UInt32) { var value = value.littleEndian; withUnsafeBytes(of: &value) { bytes.append(contentsOf: $0) } }
        text("RIFF"); u32(1636); text("WAVEfmt "); u32(16); u16(1); u16(1); u32(8000); u32(16000); u16(2); u16(16)
        text("data"); u32(1600); bytes.append(Data(repeating: 0, count: 1600))
        return bytes
    }
}
