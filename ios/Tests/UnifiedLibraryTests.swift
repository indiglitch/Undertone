import XCTest
@testable import Undertone

final class UnifiedLibraryTests: XCTestCase {
    func testShuffleCanBeDisabledWithoutMovingCurrentOrLosingQueueEdits() {
        let songs = (0..<8).map { local(String($0),title:String($0)) }
        var queue = PlaybackQueue(); queue.replace(songs,selected:songs[0])
        queue.shuffleUpcoming(); XCTAssertTrue(queue.shuffled)
        XCTAssertEqual(queue.current?.id,songs[0].id)
        XCTAssertEqual(Set(queue.upcoming.map(\.id)),Set(songs.dropFirst().map(\.id)))
        let added = local("new"); queue.enqueue(added,next:false)
        queue.shuffleUpcoming(); XCTAssertFalse(queue.shuffled)
        XCTAssertEqual(queue.upcoming.map(\.id),songs.dropFirst().map(\.id)+[added.id])
    }
    func testCollectionsEqualityDetectsRealChanges() {
        var a = PCCollections(); let b = a; XCTAssertEqual(a,b)
        a.playlists = [PCPlaylist(id:"a",name:"New",tracks:[])]; XCTAssertNotEqual(a,b)
    }
    func testShuffleRestorationAndMaterializedIdentityRetainOriginalOrder() {
        let pending = UnifiedTrack(remote(a,title:"Alpha"),local:nil).song
        let second = local("second"), third = local("third")
        var queue = PlaybackQueue(); queue.replace([pending,second,third],selected:pending)
        queue.shuffleUpcoming()
        let installed = local(String(repeating:"c",count:64),sync:a)
        queue.materialize(pending.id,with:installed)
        var restored = PlaybackQueue(); restored.replace(queue.songs,selected:installed)
        restored.restoreShuffle(queue.shuffled,originalIDs:queue.originalOrder)
        restored.shuffleUpcoming()
        XCTAssertEqual(restored.songs.map(\.id),[installed.id,second.id,third.id])
    }
    func testOlderPlayerSnapshotWithoutShuffleFieldsStillDecodes() throws {
        let bytes = Data(#"{"ids":["a"],"currentID":"a","repeatMode":"off","position":0}"#.utf8)
        let snapshot = try JSONDecoder().decode(PlayerSnapshot.self,from:bytes)
        XCTAssertNil(snapshot.shuffleEnabled); XCTAssertNil(snapshot.shuffleOriginalIDs)
    }
    private let a = String(repeating:"a",count:32), b = String(repeating:"b",count:32)
    private func local(_ id: String, sync: String? = nil, title: String = "Alpha") -> Song { Song(id:id,syncID:sync,filename:"file.wav",title:title,artist:"Artist",album:"Album",duration:10,size:100,format:"WAV",addedAt:Date()) }
    private func remote(_ id: String, title: String) -> PCTrack { PCTrack(sync_id:id,title:title,artist:"Artist",album:"Album",duration:10,format:"WAV",size:100) }
    func testMergedCatalogDoesNotGroupByDownloadedAndPreservesPlaylistOrder() {
        let song = local(String(repeating:"c",count:64),sync:a,title:"Zebra")
        let entries = TrackCatalog.merged(local:[song],remote:[remote(a,title:"Zebra"),remote(b,title:"Alpha")])
        XCTAssertEqual(entries.map(\.id),[b,a]); XCTAssertNil(entries[0].local); XCTAssertNotNil(entries[1].local)
        XCTAssertEqual(TrackCatalog.merged(local:[song],remote:[remote(a,title:"Zebra"),remote(b,title:"Alpha")],order:[a,b]).map(\.id),[a,b])
    }
    func testCurrentTrackMatchesDownloadedHashAndPCIdentity() {
        let song = local(String(repeating:"c",count:64),sync:a)
        XCTAssertTrue(TrackCatalog.current(UnifiedTrack(remote(a,title:"Alpha"),local:nil),song:song))
        XCTAssertFalse(TrackCatalog.current(UnifiedTrack(remote(b,title:"Beta"),local:nil),song:song))
    }
    func testRemoteQueueEntryKeepsDownloadStateWhenPresented() {
        let track = UnifiedTrack(remote(a,title:"Alpha"),local:nil)
        XCTAssertTrue(track.song.filename.isEmpty)
        XCTAssertNil(UnifiedTrack(track.song).local)
        XCTAssertEqual(UnifiedTrack(track.song).remote?.id,a)
    }
    func testMaterializationPreservesQueuePositionAndRepeat() {
        let pending = UnifiedTrack(remote(a,title:"Alpha"),local:nil).song
        let second = local("second")
        var queue = PlaybackQueue(); queue.replace([pending,second],selected:pending); queue.mode = .all
        let installed = local(String(repeating:"c",count:64),sync:a)
        queue.materialize(pending.id,with:installed)
        XCTAssertEqual(queue.current?.id,installed.id); XCTAssertEqual(queue.upcoming.map(\.id),[second.id]); XCTAssertEqual(queue.mode,.all)
    }
    func testLegacyPlaylistMigrationRetainsTracksAndIsIdempotent() {
        let song = local(String(repeating:"c",count:64),sync:a)
        let legacy = PersonalPlaylist(id:"12345678-1234-1234-1234-123456789abc",name:"Keep me",tracks:[song.id,b],description:"Description")
        let edits = SharedPlaylistMigration.plan([legacy],songs:[song],visible:PCCollections())
        var visible = PCCollections(); edits.forEach { visible.apply($0) }
        XCTAssertEqual(visible.playlists.first?.tracks,[a,b]); XCTAssertEqual(visible.playlists.first?.description,"Description")
        XCTAssertEqual(SharedPlaylistMigration.plan([legacy],songs:[song],visible:visible).count,0)
    }
    func testPendingPhoneOnlyTrackDoesNotBlockOtherPlaylistsAndResolvesLater() {
        let hash = String(repeating:"c",count:64)
        let waiting = PCEdit(kind:"add_tracks",playlist:a,tracks:[hash])
        let next = PCEdit(kind:"add_tracks",playlist:a,tracks:[b])
        let independent = PCEdit(kind:"create_playlist",playlist:b,name:"Another")
        XCTAssertEqual(SharedPlaylistMigration.ready([waiting,next,independent]).map(\.id),[independent.id])
        let mapped = SharedPlaylistMigration.remap([waiting,next,independent],songs:[local(hash,sync:a)])
        XCTAssertEqual(SharedPlaylistMigration.ready(mapped).count,3)
        XCTAssertEqual(mapped.first?.id,waiting.id)
    }
    func testSharedOfflinePlaylistOperationsPersistTogether() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:root) }
        var state = PCStoredState(); state.pending = [PCEdit(kind:"create_playlist",playlist:a,name:"Offline"),PCEdit(kind:"add_tracks",playlist:a,tracks:[b])]
        try await PCStorage(root:root).save(state)
        let restored = try await PCStorage(root:root).read()
        var visible = restored.collections; restored.pending.forEach { visible.apply($0) }
        XCTAssertEqual(visible.playlists.first?.tracks,[b]); XCTAssertEqual(restored.pending.map(\.id),state.pending.map(\.id))
    }
}
