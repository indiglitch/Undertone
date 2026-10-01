import XCTest
import Combine
import AVFoundation
@testable import Undertone

final class LibraryTests: XCTestCase {
    private func root() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
    // Tiny PCM WAV is generated here, not a copyrighted fixture.
    private func wav() -> Data {
        var bytes = Data()
        func string(_ value: String) { bytes.append(contentsOf: value.utf8) }
        func u16(_ value: UInt16) { var v = value.littleEndian; withUnsafeBytes(of: &v) { bytes.append(contentsOf: $0) } }
        func u32(_ value: UInt32) { var v = value.littleEndian; withUnsafeBytes(of: &v) { bytes.append(contentsOf: $0) } }
        string("RIFF"); u32(36 + 1600); string("WAVEfmt "); u32(16)
        u16(1); u16(1); u32(8000); u32(16000); u16(2); u16(16)
        string("data"); u32(1600); bytes.append(Data(repeating: 0, count: 1600))
        return bytes
    }
    func testImportPreservesBytesDeduplicatesAndSurvivesReopen() async throws {
        let directory = try root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let source = directory.appendingPathComponent("original.wav")
        let original = wav()
        try original.write(to: source)
        let storage = directory.appendingPathComponent("app")
        let repository = LibraryRepository(root: storage)
        let song = try await repository.importFile(source)
        let second = try await repository.importFile(source)
        XCTAssertEqual(song.id, second.id)
        let copied = try await repository.fileURL(song)
        XCTAssertEqual(try Data(contentsOf: copied), original)
        XCTAssertEqual(song.size, Int64(original.count))
        let reopened = LibraryRepository(root: storage)
        let records = try await reopened.read()
        XCTAssertEqual(records, [song])
    }
    func testCorruptManifestIsNotSilentlyOverwritten() async throws {
        let directory = try root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let bad = Data("not json".utf8)
        let manifest = directory.appendingPathComponent("library.json")
        try bad.write(to: manifest)
        let repository = LibraryRepository(root: directory)
        do { _ = try await repository.read(); XCTFail("Expected corrupt manifest to fail") }
        catch { XCTAssertEqual(try Data(contentsOf: manifest), bad) }
    }
    func testPathTraversalIsRejected() async throws {
        let directory = try root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let repository = LibraryRepository(root: directory)
        let song = Song(id: "test", syncID: nil, filename: "../outside.mp3", title: "Test", artist: "", album: "", duration: 0, size: 0, format: "MP3", addedAt: Date())
        do { _ = try await repository.fileURL(song); XCTFail("Expected traversal rejection") }
        catch { XCTAssertTrue(error is LibraryError) }
    }
    func testHashMatchesKnownSHA256() throws {
        let directory = try root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let file = directory.appendingPathComponent("hash.bin")
        try Data("abc".utf8).write(to: file)
        XCTAssertEqual(try LibraryRepository.sha256(file), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }
    func testFutureManifestVersionIsRejectedWithoutDataLoss() async throws {
        let directory = try root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let data = Data("{\"version\":2,\"songs\":[]}".utf8)
        let file = directory.appendingPathComponent("library.json")
        try data.write(to: file)
        let repository = LibraryRepository(root: directory)
        do { _ = try await repository.read(); XCTFail("Expected future version rejection") }
        catch { XCTAssertTrue(error is LibraryError) }
        XCTAssertEqual(try Data(contentsOf: file), data)
    }
    func testPCDownloadVerifiesOriginalAndPersistsSyncIdentity() async throws {
        let directory = try root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let original = wav()
        let file = directory.appendingPathComponent("download.tmp")
        try original.write(to: file)
        let hash = try LibraryRepository.sha256(file)
        let track = PCTrack(sync_id: String(repeating: "a", count: 32), title: "PC song", artist: "Artist", album: "Album", duration: 0.1, format: "WAV", size: Int64(original.count))
        let repository = LibraryRepository(root: directory.appendingPathComponent("storage"))
        do { try await repository.installDownload(file, track: track, expectedHash: String(repeating: "0", count: 64)); XCTFail("Bad digest accepted") } catch { XCTAssertTrue(error is PCError) }
        try await repository.installDownload(file, track: track, expectedHash: hash)
        let songs = try await repository.read()
        XCTAssertEqual(songs.first?.syncID, track.id)
        let saved = try await repository.fileURL(XCTUnwrap(songs.first))
        XCTAssertEqual(try Data(contentsOf: saved), original)
    }
    func testPairingRejectsPublicHostsAndInvalidSecrets() throws {
        XCTAssertThrowsError(try PCPairing(version: 1, address: "https://example.com:443", token: String(repeating: "a", count: 64), fingerprint: String(repeating: "b", count: 64)).validate())
        XCTAssertNoThrow(try PCPairing(version: 1, address: "https://192.168.1.4:3210", token: String(repeating: "a", count: 64), fingerprint: String(repeating: "b", count: 64)).validate())
    }

    @MainActor func testPlaybackClockDoesNotInvalidateMusicLibrary() {
        let player = MusicPlayer(); var screenUpdates = 0; var clockUpdates = 0
        let screen = player.objectWillChange.sink { screenUpdates += 1 }
        let clock = player.clock.objectWillChange.sink { clockUpdates += 1 }
        player.position = 42
        XCTAssertEqual(screenUpdates, 0); XCTAssertEqual(clockUpdates, 1)
        withExtendedLifetime((screen, clock)) {}
    }
    func testOfflineEditsAndPlaylistsSurviveReopen() async throws {
        let directory = try root(); defer { try? FileManager.default.removeItem(at: directory) }
        let store = PCStorage(root: directory)
        let id = String(repeating: "a", count: 32), track = String(repeating: "b", count: 32)
        let create = PCEdit(kind: "create_playlist", playlist: id, name: "Offline")
        let add = PCEdit(kind: "add_tracks", playlist: id, tracks: [track])
        let like = PCEdit(kind: "like", track: track, liked: true)
        let state = PCStoredState(pending: [create, add, like])
        try await store.save(state)
        let restored = try await PCStorage(root: directory).read()
        var visible = restored.collections; restored.pending.forEach { visible.apply($0) }
        XCTAssertEqual(visible.playlists.first?.tracks, [track]); XCTAssertEqual(visible.likes, [track])
        XCTAssertEqual(restored.pending.map(\.id), state.pending.map(\.id))
    }
    func testPinnedDiscoveryHostValidation() throws {
        let token = String(repeating: "a", count: 64), fingerprint = String(repeating: "b", count: 64)
        XCTAssertNoThrow(try PCPairing(version: 1, address: "https://undertone-" + fingerprint.prefix(16) + ".local:3210", token: token, fingerprint: fingerprint).validate())
        XCTAssertThrowsError(try PCPairing(version: 1, address: "https://other.local:3210", token: token, fingerprint: fingerprint).validate())
    }

    func testVorbisStreamsBoundedPCMAndSeeksOriginalFile() async throws {
        let file = try XCTUnwrap(Bundle(for: LibraryTests.self).url(forResource: "tone", withExtension: "ogg"))
        let original = try Data(contentsOf: file)
        let reader = try VorbisReader(file: file)
        let duration = await reader.duration
        XCTAssertEqual(duration, 0.5, accuracy: 0.03)
        let first = await reader.read()
        let buffer = try XCTUnwrap(first?.buffer)
        XCTAssertLessThanOrEqual(buffer.frameLength, 8192)
        XCTAssertEqual(buffer.format.channelCount, 2)
        let channel = try XCTUnwrap(buffer.floatChannelData?[0])
        XCTAssertGreaterThan((0..<Int(buffer.frameLength)).map { abs(channel[$0]) }.reduce(0, +), 1)
        try await reader.seek(0.25)
        let second = await reader.read(); XCTAssertNotNil(second)
        XCTAssertEqual(try Data(contentsOf: file), original)
    }
    func testNativeFLACPreparationWithoutTranscoding() throws {
        let file = try XCTUnwrap(Bundle(for: LibraryTests.self).url(forResource: "tone", withExtension: "flac"))
        let original = try Data(contentsOf: file)
        let player = try AVAudioPlayer(contentsOf: file)
        XCTAssertTrue(player.prepareToPlay()); XCTAssertEqual(player.duration, 0.5, accuracy: 0.03)
        XCTAssertEqual(try Data(contentsOf: file), original)
    }

    func testDownloadQueueAndResumeCheckpointSurviveRelaunch() async throws {
        let directory = try root(); defer { try? FileManager.default.removeItem(at: directory) }
        let track = PCTrack(sync_id: String(repeating: "a", count: 32), title: "Original", artist: "Artist", album: "Album", duration: 12, format: "FLAC", size: 12000)
        let store = DownloadPersistence(root: directory)
        let queued = DownloadRecord(track: track, state: "paused", taskID: nil)
        try await store.save([queued]); try await store.setResume(track.id, data: Data("checkpoint".utf8))
        let reopened = DownloadPersistence(root: directory)
        let queue = try await reopened.read(); let resume = await reopened.resume(track.id)
        XCTAssertEqual(queue.first?.track, track); XCTAssertEqual(queue.first?.state, "paused")
        XCTAssertEqual(resume, Data("checkpoint".utf8))
    }

    @MainActor func testBackgroundURLSessionTransfersPinnedOriginal() async throws {
        guard let fixture = Bundle(for: LibraryTests.self).url(forResource: "network-pairing", withExtension: "json") else {
            throw XCTSkip("Network fixture is prepared by GitHub Actions")
        }
        let pairing = try JSONDecoder().decode(PCPairing.self, from: Data(contentsOf: fixture)); try pairing.validate()
        let session = URLSession(configuration: .ephemeral, delegate: PinnedPCSession(pairing), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        var request = URLRequest(url: URL(string: pairing.address + "/v1/library")!)
        request.setValue("Bearer " + pairing.token, forHTTPHeaderField: "Authorization")
        let (bytes, response) = try await session.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
        let catalog = try PCStorage.decodeCatalog(bytes), track = try XCTUnwrap(catalog.tracks.first)
        let repository = LibraryRepository(root: LibraryRepository.defaultRoot()), baseline = try await repository.read()
        let downloads = BackgroundDownloads.shared
        try PCKeychain.save(pairing)
        await downloads.initialize(); await downloads.cancelAll()
        await downloads.enqueue([track], installed: [])
        var downloaded: Song?
        for _ in 0..<300 {
            if let song = try await repository.read().first(where: { $0.syncID == track.id }) { downloaded = song; break }
            try await Task.sleep(for: .milliseconds(100))
        }
        await downloads.cancelAll(); PCKeychain.remove()
        guard let downloaded else { XCTFail("Background transfer failed: " + (downloads.error ?? "timeout")); return }
        let file = try await repository.fileURL(downloaded)
        XCTAssertEqual(downloaded.size, track.size)
        XCTAssertEqual(try LibraryRepository.sha256(file), downloaded.id)
        try FileManager.default.removeItem(at: file); try await repository.write(baseline)
    }

    func testIdenticalPCFilesRetainBothPlaylistIdentities() async throws {
        let directory = try root(); defer { try? FileManager.default.removeItem(at: directory) }
        let repository = LibraryRepository(root: directory.appendingPathComponent("store")), bytes = wav()
        let first = directory.appendingPathComponent("first.tmp"), second = directory.appendingPathComponent("second.tmp")
        try bytes.write(to: first); try bytes.write(to: second)
        let hash = try LibraryRepository.sha256(first)
        let a = PCTrack(sync_id: String(repeating: "a", count: 32), title: "Same audio", artist: "Artist", album: "Album", duration: 0.1, format: "WAV", size: Int64(bytes.count))
        let b = PCTrack(sync_id: String(repeating: "b", count: 32), title: "Same audio", artist: "Artist", album: "Album", duration: 0.1, format: "WAV", size: Int64(bytes.count))
        try await repository.installDownload(first, track: a, expectedHash: hash)
        try await repository.installDownload(second, track: b, expectedHash: hash)
        let songs = try await repository.read()
        XCTAssertEqual(songs.count, 1); XCTAssertEqual(songs.first?.sourceIDs, Set([a.id, b.id]))
    }
}
