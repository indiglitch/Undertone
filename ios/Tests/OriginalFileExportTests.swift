import XCTest
@testable import Undertone

final class OriginalFileExportTests: XCTestCase {
    private func song(title: String = "Ночная музыка", artist: String = "Demo Artist", filename: String = "hash.mp3") -> Song {
        Song(id: "test", syncID: nil, filename: filename, title: title, artist: artist, album: "Album", duration: 1, size: 0, format: "MP3", addedAt: Date())
    }
    private func repository() throws -> LibraryRepository {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root.appendingPathComponent("Music"), withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        return LibraryRepository(root: root)
    }
    // Synthetic ID3 text frames plus opaque audio bytes. No decoder/tag writer is
    // involved in sharing; equality must cover tags AND payload, including unknown tags.
    private func taggedBytes() -> Data {
        var frames = Data()
        for (key, value) in [("TIT2", "Night song"), ("TPE1", "Artist"), ("TALB", "Album")] {
            let text = Data([0]) + Data(value.utf8)
            frames.append(Data(key.utf8))
            var size = UInt32(text.count).bigEndian
            withUnsafeBytes(of: &size) { frames.append(contentsOf: $0) }
            frames.append(contentsOf: [0, 0]); frames.append(text)
        }
        let size = frames.count
        return Data([0x49, 0x44, 0x33, 3, 0, 0, UInt8((size >> 21) & 127), UInt8((size >> 14) & 127), UInt8((size >> 7) & 127), UInt8(size & 127)])
            + frames + Data([0xff, 0xfb, 0x90, 0x64]) + Data(repeating: 0xa5, count: 1024)
    }
    func testExportPreservesAllOriginalBytesAndReadableFilename() async throws {
        let repository = try repository(), song = song()
        let source = try await repository.fileURL(song), bytes = taggedBytes()
        try bytes.write(to: source)
        let export = try await repository.exportOriginal(song)
        XCTAssertEqual(export.url.lastPathComponent, "Demo Artist — Ночная музыка.mp3")
        XCTAssertEqual(try Data(contentsOf: export.url), bytes)
        XCTAssertEqual(try LibraryRepository.sha256(export.url), try LibraryRepository.sha256(source))
        XCTAssertEqual(try Data(contentsOf: source), bytes)
        XCTAssertNotEqual(export.url.deletingLastPathComponent(), source.deletingLastPathComponent())
    }
    func testRepeatedExportsDoNotOverwriteAndLeaseCleanupKeepsOriginal() async throws {
        let repository = try repository(), song = song()
        let source = try await repository.fileURL(song)
        try taggedBytes().write(to: source)
        var first: OriginalFileExport? = try await repository.exportOriginal(song)
        let firstURL = try XCTUnwrap(first).url
        let second = try await repository.exportOriginal(song)
        XCTAssertEqual(firstURL.lastPathComponent, second.url.lastPathComponent)
        XCTAssertNotEqual(firstURL, second.url)
        first = nil
        XCTAssertFalse(FileManager.default.fileExists(atPath: firstURL.deletingLastPathComponent().path))
        XCTAssertEqual(try Data(contentsOf: second.url), try Data(contentsOf: source))
    }
    func testNamesAreSafePortableAndKeepUnicodeAndExtension() {
        let unsafe = OriginalFileExport.filename(for: song(title: "../夜: Song\n?", artist: "A/B\\C", filename: "hash.FLAC"))
        XCTAssertEqual(unsafe, "A_B_C — .._夜_ Song__.FLAC")
        XCTAssertEqual((unsafe as NSString).lastPathComponent, unsafe)
        XCTAssertEqual(OriginalFileExport.filename(for: song(title: "CON", artist: "")), "_CON.mp3")
        XCTAssertEqual(OriginalFileExport.filename(for: song(title: "", artist: "", filename: "original.ogg")), "original.ogg")
        XCTAssertEqual(OriginalFileExport.filename(for: song(title: "...", artist: "")), "Track.mp3")
        let long = OriginalFileExport.filename(for: song(title: String(repeating: "夜🎵", count: 300)))
        XCTAssertLessThanOrEqual(long.utf8.count, 254)
        XCTAssertTrue(long.hasSuffix(".mp3"))
    }
    func testMissingOriginalFailsWithoutChangingLibrary() async throws {
        let repository = try repository(), song = song()
        do { _ = try await repository.exportOriginal(song); XCTFail("Missing original must fail") }
        catch { XCTAssertEqual((error as NSError).domain, NSCocoaErrorDomain) }
        let source = try await repository.fileURL(song)
        XCTAssertFalse(FileManager.default.fileExists(atPath: source.path))
        let records = try await repository.read()
        XCTAssertTrue(records.isEmpty)
    }
    func testInvalidLibraryPathCannotBeExported() async throws {
        let repository = try repository()
        do { _ = try await repository.exportOriginal(song(filename: "../outside.mp3")); XCTFail("Traversal must fail") }
        catch { XCTAssertTrue(error is LibraryError) }
    }
}
