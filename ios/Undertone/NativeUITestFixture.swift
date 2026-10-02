#if DEBUG
import Foundation

// Explicit XCTest launch argument only; excluded from the SideStore Release executable.
enum NativeUITestFixture {
    static func prepare() async throws {
        UserDefaults.standard.set(ProcessInfo.processInfo.environment["UNDERTONE_UI_OFFLINE"] == "1",forKey:"offlineMode")
        let root = LibraryRepository.defaultRoot(), repository = LibraryRepository(root:root)
        try await repository.prepare()
        var wav = Data()
        func text(_ value:String) { wav.append(contentsOf:value.utf8) }
        func u16(_ value:UInt16) { var little = value.littleEndian; withUnsafeBytes(of:&little) { wav.append(contentsOf:$0) } }
        func u32(_ value:UInt32) { var little = value.littleEndian; withUnsafeBytes(of:&little) { wav.append(contentsOf:$0) } }
        text("RIFF"); u32(32036); text("WAVEfmt "); u32(16); u16(1); u16(1); u32(8000); u32(16000); u16(2); u16(16); text("data"); u32(32000); wav.append(Data(repeating:0,count:32000))
        let file = root.appendingPathComponent("Music/ui-fixture.wav"); try wav.write(to:file,options:.atomic)
        let hash = try LibraryRepository.sha256(file), a = String(repeating:"a",count:32), b = String(repeating:"b",count:32), c = String(repeating:"c",count:32)
        let song = Song(id:hash,syncID:a,filename:file.lastPathComponent,title:"Midnight city",artist:"Demo Artist",album:"Night drive",duration:2,size:Int64(wav.count),format:"WAV",addedAt:Date())
        try await repository.write([song])
        let tracks = [PCTrack(sync_id:a,title:song.title,artist:song.artist,album:song.album,duration:2,format:"WAV",size:song.size),PCTrack(sync_id:b,title:"Far away",artist:"Demo Artist",album:"Night drive",duration:2,format:"WAV",size:song.size),PCTrack(sync_id:c,title:"Morning light",artist:"Demo Artist",album:"Night drive",duration:2,format:"WAV",size:song.size)]
        let storage = PCStorage(root:root)
        _ = try await storage.catalog(JSONEncoder().encode(PCCatalog(version:1,tracks:tracks)))
        try await storage.save(PCStoredState(collections:PCCollections(likes:[a],playlists:[]),pending:[]))
        var personal = PersonalState(); personal.playlists = [PersonalPlaylist(id:"12345678-1234-1234-1234-123456789abc",name:"Вечером",tracks:[hash,b])]
        personal.albums = ["Demo Artist — Night drive"]
        try await PersonalStorage(root:root).save(personal)
        try await PlayerStorage(root:root).save(PlayerSnapshot(ids:[hash,b,c],currentID:hash,repeatMode:"off",position:0.5))
    }
}
#endif
