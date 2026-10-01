import XCTest
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
}
