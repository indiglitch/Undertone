#if DEBUG
import Foundation

// Explicit XCTest launch argument only; excluded from the SideStore Release executable.
enum NativeUITestFixture {
    @MainActor static func prepareDownloads(_ downloads: BackgroundDownloads) {
        guard ProcessInfo.processInfo.arguments.contains("--ui-fixture"), let mode = ProcessInfo.processInfo.environment["UNDERTONE_UI_DOWNLOADS"] else { return }
        func track(_ index: Int, _ title: String) -> PCTrack {
            PCTrack(sync_id: index == 13 ? String(repeating: "b", count: 32) : index == 14 ? String(repeating: "c", count: 32) : String(format: "%032x", 5000 + index), title: title, artist: "Тестовый Artist · Длинное имя исполнителя", album: "Fixture", duration: 60, format: "WAV", size: 100)
        }
        let completions = (0..<2).map { DownloadCompletion(track: track($0, "Completed \($0)"), finishedAt: Date()) }
        var records: [DownloadRecord] = []
        if mode == "mixed" {
            records = [DownloadRecord(track: track(10, "Waiting")),
                       DownloadRecord(track: track(11, "Transferring"), state: "downloading"),
                       DownloadRecord(track: track(12, "Saving"), state: "installing"),
                       DownloadRecord(track: track(13, "Paused"), state: "paused"),
                       DownloadRecord(track: track(14, "Failed"), state: "failed")]
        } else if mode == "long" {
            records = (0..<60).map { DownloadRecord(track: track(100 + $0, String(format: "Queue %02d · ", $0) + String(repeating: "Длинное название Long title ", count: 3))) }
        }
        downloads.seedDownloadsUI(records: records, completions: mode == "empty" ? [] : completions,
                                  error: mode == "mixed" ? "Fixture diagnostic: verification failed" : nil)
    }
    static func prepare() async throws {
        // Each explicit UI fixture starts from the same preferences; a failed
        // reversible-toggle test must not alter the next test's tab/layout.
        UserDefaults.standard.set(true, forKey: "createTabVisible")
        UserDefaults.standard.set(true, forKey: "canvasEnabled")
        UserDefaults.standard.set(true, forKey: "lyricsPreview")
        UserDefaults.standard.set(0.0, forKey: "crossfadeSeconds")
        UserDefaults.standard.set(ProcessInfo.processInfo.environment["UNDERTONE_UI_OFFLINE"] == "1",forKey:"offlineMode")
        let root = LibraryRepository.defaultRoot(), repository = LibraryRepository(root:root)
        try await repository.prepare()
        // Queue actions in a previous UI run must not leak into another fixture.
        try await DownloadPersistence(root: root.appendingPathComponent("Transfers", isDirectory: true)).save([])
        let playerUX = ProcessInfo.processInfo.environment["UNDERTONE_UI_PLAYER_UX"] == "1"
        let sampleBytes = playerUX ? 960000 : 32000
        let fixtureDuration = playerUX ? 60.0 : 2.0
        var wav = Data()
        func text(_ value:String) { wav.append(contentsOf:value.utf8) }
        func u16(_ value:UInt16) { var little = value.littleEndian; withUnsafeBytes(of:&little) { wav.append(contentsOf:$0) } }
        func u32(_ value:UInt32) { var little = value.littleEndian; withUnsafeBytes(of:&little) { wav.append(contentsOf:$0) } }
        text("RIFF"); u32(UInt32(sampleBytes + 36)); text("WAVEfmt "); u32(16); u16(1); u16(1); u32(8000); u32(16000); u16(2); u16(16); text("data"); u32(UInt32(sampleBytes)); wav.append(Data(repeating:0,count:sampleBytes))
        let file = root.appendingPathComponent("Music/ui-fixture.wav"); try wav.write(to:file,options:.atomic)
        let hash = try LibraryRepository.sha256(file), a = String(repeating:"a",count:32), b = String(repeating:"b",count:32), c = String(repeating:"c",count:32)
        let fixtureTitle = playerUX ? "Midnight city · " + String(repeating: "Очень длинное название Long Title ", count: 4) : "Midnight city"
        let fixtureArtist = playerUX ? "Demo Artist · " + String(repeating: "Длинное имя исполнителя Long Artist ", count: 3) : "Demo Artist"
        let song = Song(id:hash,syncID:a,filename:file.lastPathComponent,title:fixtureTitle,artist:fixtureArtist,album:"Night drive",duration:fixtureDuration,size:Int64(wav.count),format:"WAV",addedAt:Date())
        var installed = [song]
        if playerUX {
            for (index, sync) in [b,c].enumerated() {
                var bytes = wav; bytes[44] = UInt8(index + 1)
                let name = "player-fixture-\(index).wav", path = root.appendingPathComponent("Music").appendingPathComponent(name)
                try bytes.write(to: path, options: .atomic)
                let id = try LibraryRepository.sha256(path)
                installed.append(Song(id: id, syncID: sync, filename: name, title: index == 0 ? "Far away" : "Morning light", artist: "Demo Artist", album: "Night drive", duration: fixtureDuration, size: Int64(bytes.count), format: "WAV", addedAt: Date()))
            }
            UserDefaults.standard.set(true, forKey: "lyricsPreview")
            let mode = ProcessInfo.processInfo.environment["UNDERTONE_UI_PLAYER_LYRICS"] ?? "lrc"
            let lyrics = mode == "plain" ? "Plain TXT lyrics\nВторая строка без синхронизации" : mode == "none" ? "" : (0..<20).map { String(format: "[00:%02d]", $0 * 3) + "Line \($0) Ночная музыка" }.joined(separator: "\n")
            try await LyricsStorage.shared.save(LyricsDocument.parse(lyrics), id: hash)
        }
        try await repository.write(installed)
        var tracks = [PCTrack(sync_id:a,title:song.title,artist:song.artist,album:song.album,duration:fixtureDuration,format:"WAV",size:song.size),PCTrack(sync_id:b,title:"Far away",artist:"Demo Artist",album:"Night drive",duration:fixtureDuration,format:"WAV",size:song.size),PCTrack(sync_id:c,title:"Morning light",artist:"Demo Artist",album:"Night drive",duration:fixtureDuration,format:"WAV",size:song.size)]
        if ProcessInfo.processInfo.environment["UNDERTONE_UI_LONG_LIBRARY"] == "1" {
            tracks += (1...60).map { index in
                PCTrack(sync_id: String(format: "%032x", index), title: String(format: "ZZ Foundation %02d", index), artist: "Demo Artist", album: "Night drive", duration: fixtureDuration, format: "WAV", size: song.size)
            }
            UserDefaults.standard.set("title", forKey: "librarySort")
        }
        let homeNavigation = ProcessInfo.processInfo.environment["UNDERTONE_UI_HOME_NAVIGATION"] == "1"
        if homeNavigation {
            tracks += (1...24).map { index in
                PCTrack(sync_id: String(format: "%032x", 1000 + index), title: "Home fixture \(index)", artist: "Demo Artist", album: String(format: "Album %02d", index), duration: fixtureDuration, format: "WAV", size: song.size)
            }
        }
        let searchUX = ProcessInfo.processInfo.environment["UNDERTONE_UI_SEARCH_UX"] == "1"
        if searchUX {
            tracks.append(PCTrack(sync_id: String(repeating: "d", count: 32), title: "Ночной Drive · " + String(repeating: "Очень длинное название Long Title ", count: 8), artist: "Тестовый ARTIST", album: "Смешанный NIGHT", duration: fixtureDuration, format: "WAV", size: song.size))
        }
        let collectionsUX = ProcessInfo.processInfo.environment["UNDERTONE_UI_COLLECTIONS_UX"] == "1"
        if collectionsUX {
            UserDefaults.standard.set("title", forKey: "librarySort")
            tracks += [PCTrack(sync_id: String(repeating: "1", count: 32), title: "Zulu Track", artist: "AAA Artist", album: "Sort Album", duration: fixtureDuration, format: "WAV", size: song.size),
                       PCTrack(sync_id: String(repeating: "2", count: 32), title: "Alpha Track", artist: "ZZZ Artist", album: "Sort Album", duration: fixtureDuration, format: "WAV", size: song.size)]
        }
        if ProcessInfo.processInfo.environment["UNDERTONE_UI_CONTEXT_MENUS"] == "1" {
            tracks[2] = PCTrack(sync_id:c,title:"Morning light",artist:"",album:"",duration:fixtureDuration,format:"WAV",size:song.size)
            UserDefaults.standard.set("", forKey: "hiddenTrackIDs")
        }
        let storage = PCStorage(root:root)
        _ = try await storage.catalog(JSONEncoder().encode(PCCatalog(version:1,tracks:tracks)))
        var homePlaylists = homeNavigation ? (1...6).map { PCPlaylist(id: "home-playlist-\($0)", name: "Playlist \($0)", tracks: [a,b]) } : []
        if searchUX { homePlaylists.append(PCPlaylist(id: "search-playlist", name: "Demo вечерний Mix", tracks: [a,b])) }
        if collectionsUX {
            homePlaylists += [PCPlaylist(id: String(repeating: "e", count: 32), name: "Empty Collection", tracks: []),
                              PCPlaylist(id: String(repeating: "f", count: 32), name: "Long Collection — " + String(repeating: "Ночная музыка Long Title ", count: 6), tracks: [a,b,c])]
        }
        try await storage.save(PCStoredState(collections:PCCollections(likes:[a],playlists:homePlaylists),pending:[]))
        var personal = PersonalState(); personal.playlists = [PersonalPlaylist(id:"12345678-1234-1234-1234-123456789abc",name:"Вечером",tracks:[hash,b])]
        personal.recents = [hash,b,c]
        personal.albums = ["Demo Artist — Night drive"]
        if homeNavigation { personal.pins = ["home-playlist-6", "album:Demo Artist — Album 24"] }
        if searchUX { personal.searches = ["Midnight", "Ночной Drive", "Запрос " + String(repeating: "Long Название ", count: 12)] }
        if collectionsUX { personal.artists = ["Demo Artist"] }
        try await PersonalStorage(root:root).save(personal)
        try await PlayerStorage(root:root).save(PlayerSnapshot(ids:playerUX ? installed.map(\.id) : [hash,b,c],currentID:hash,repeatMode:"off",position:0.5))
    }
}
#endif
