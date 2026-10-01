import XCTest
@testable import Undertone

final class PersonalLibraryTests: XCTestCase {
    private func root() throws -> URL { let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString); try FileManager.default.createDirectory(at:url,withIntermediateDirectories:true); return url }
    func testNestedFolderMovesRejectCyclesAndMissingParent() {
        var state = PersonalState(); state.folders = [LibraryFolder(id:"a",name:"A"),LibraryFolder(id:"b",name:"B",parent:"a"),LibraryFolder(id:"c",name:"C",parent:"b")]
        XCTAssertFalse(state.moveFolder("a",to:"c")); XCTAssertFalse(state.moveFolder("b",to:"missing")); XCTAssertTrue(state.moveFolder("c",to:nil))
        XCTAssertEqual(state.folders.first(where:{$0.id == "b"})?.parent,"a")
    }
    func testDeleteFolderPromotesContentsWithoutDeletingPlaylists() {
        var state = PersonalState(); state.folders = [LibraryFolder(id:"a",name:"A"),LibraryFolder(id:"b",name:"B",parent:"a"),LibraryFolder(id:"c",name:"C",parent:"b")]; state.playlists = [PersonalPlaylist(id:"p",name:"Keep",tracks:["song"])]; state.playlistFolders["p"] = "b"
        state.deleteFolder("b"); XCTAssertEqual(state.folders.first(where:{$0.id == "c"})?.parent,"a"); XCTAssertEqual(state.playlistFolders["p"],"a"); XCTAssertEqual(state.playlists.first?.tracks,["song"])
    }
    func testPersonalStorageRoundTrip() async throws {
        let directory = try root(); defer { try? FileManager.default.removeItem(at:directory) }; let storage = PersonalStorage(root:directory)
        var state = PersonalState(); state.likes = ["local"]; state.albums = ["Artist — Album"]; state.artists = ["Artist"]; state.pins = ["folder:a"]; state.searches = ["query"]; state.recents = ["song"]; state.folders = [LibraryFolder(id:"a",name:"Folder")]; state.playlists = [PersonalPlaylist(id:"p",name:"Playlist",tracks:["song"])]; state.playlistFolders["p"] = "a"
        try await storage.save(state); let restored = try await PersonalStorage(root:directory).read(); XCTAssertEqual(restored.likes,state.likes); XCTAssertEqual(restored.playlists,state.playlists); XCTAssertEqual(restored.folders,state.folders); XCTAssertEqual(restored.playlistFolders,state.playlistFolders); XCTAssertEqual(restored.recents,state.recents)
    }
    func testPlaybackSnapshotKeepsOrderRepeatAndPosition() async throws {
        let directory = try root(); defer { try? FileManager.default.removeItem(at:directory) }; let storage = PlayerStorage(root:directory)
        try await storage.save(PlayerSnapshot(ids:["a","c","b"],currentID:"c",repeatMode:"one",position:52.5)); let restored = try await PlayerStorage(root:directory).read(); XCTAssertEqual(restored?.ids,["a","c","b"]); XCTAssertEqual(restored?.currentID,"c"); XCTAssertEqual(restored?.repeatMode,"one"); XCTAssertEqual(restored?.position,52.5)
    }
    func testLRCMultipleTimesFractionsAndPlainFallback() {
        let doc = LyricsDocument.parse("[00:01.5][00:04.250]Line one\n[00:02]Line two\n[ar:Artist]\n[00:99]Invalid")
        XCTAssertEqual(doc.lines.map(\.timestamp_ms),[1500,2000,4250]); XCTAssertEqual(doc.lines.map(\.text),["Line one","Line two","Line one"]); XCTAssertEqual(LyricsDocument.parse("Plain lyrics").plain,"Plain lyrics")
    }
    func testOriginalRemovalCanBeUndoneWithoutChangingBytes() async throws {
        let directory = try root(); defer { try? FileManager.default.removeItem(at:directory) }; let repo = LibraryRepository(root:directory); try await repo.prepare()
        let song = Song(id:String(repeating:"a",count:64),syncID:nil,filename:"a.wav",title:"Original",artist:"Artist",album:"Album",duration:1,size:4,format:"WAV",addedAt:Date()); let original = Data([1,2,3,4]); let file = try await repo.fileURL(song); try original.write(to:file); try await repo.write([song])
        let removed = try await repo.removePhoneCopies([song]); let empty = try await repo.read(); XCTAssertTrue(empty.isEmpty); XCTAssertFalse(FileManager.default.fileExists(atPath:file.path)); let bytes = try await repo.trashSize(); XCTAssertEqual(bytes,4)
        try await repo.restorePhoneCopies(removed); XCTAssertEqual(try Data(contentsOf:file),original); let restored = try await repo.read(); XCTAssertEqual(restored,[song])
    }
}
