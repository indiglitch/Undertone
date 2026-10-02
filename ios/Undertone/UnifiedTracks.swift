import SwiftUI

struct UnifiedTrack: Identifiable, Sendable {
    let id: String
    let local: Song?
    let remote: PCTrack?
    init(_ song: Song) {
        id = song.syncID ?? song.id
        if song.filename.isEmpty {
            local = nil
            remote = PCTrack(sync_id:id,title:song.title,artist:song.artist,album:song.album,duration:song.duration,format:song.format,size:song.size,track_number:song.trackNumber,year:song.year)
        } else { local = song; remote = nil }
    }
    init(_ track: PCTrack, local: Song?) { id = track.id; self.local = local; remote = track }
    var song: Song {
        if var local { if remote != nil { local.syncID = id }; return local }
        let track = remote!
        return Song(id: track.id, syncID: track.id, filename: "", title: track.title, artist: track.artist, album: track.album, duration: track.duration, size: track.size, format: track.format, addedAt: .distantPast, trackNumber: track.track_number, year: track.year)
    }
    var aliases: Set<String> { (local?.sourceIDs ?? []).union([id, song.id]) }
}

enum TrackCatalog {
    static func merged(local: [Song], remote: [PCTrack], order: [String]? = nil, sort: LibrarySort = .title, albumOrder: Bool = false) -> [UnifiedTrack] {
        let installed = Dictionary(local.flatMap { song in song.sourceIDs.union([song.id]).map { ($0, song) } }, uniquingKeysWith: { a,_ in a })
        let remoteIDs = Set(remote.map(\.id))
        var items = remote.map { UnifiedTrack($0, local: installed[$0.id]) }
        items += local.filter { $0.sourceIDs.isDisjoint(with: remoteIDs) }.map(UnifiedTrack.init)
        if let order {
            let map = Dictionary(items.flatMap { item in item.aliases.map { ($0,item) } }, uniquingKeysWith: { a,_ in a })
            var seen = Set<String>()
            return order.compactMap { map[$0] }.filter { seen.insert($0.id).inserted }
        }
        let ordered = albumOrder ? items.map(\.song).sorted { a,b in
            if a.trackNumber != b.trackNumber { return (a.trackNumber ?? Int.max) < (b.trackNumber ?? Int.max) }
            return a.title.localizedStandardCompare(b.title) == .orderedAscending
        } : sort.sorted(items.map(\.song))
        let positions = Dictionary(ordered.enumerated().map { ($0.element.syncID ?? $0.element.id, $0.offset) }, uniquingKeysWith: { a,_ in a })
        return items.sorted { (positions[$0.id] ?? Int.max) < (positions[$1.id] ?? Int.max) }
    }
    static func current(_ track: UnifiedTrack, song: Song?) -> Bool {
        guard let song else { return false }
        return !track.aliases.isDisjoint(with: song.sourceIDs.union([song.id]))
    }
}

struct UnifiedTrackRow: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var personal: PersonalLibrary
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var downloads: BackgroundDownloads
    let track: UnifiedTrack
    var queue: [Song] = []
    var playlistID: String?
    var action: (() -> Void)?
    private var current: Bool { TrackCatalog.current(track, song: player.current) }
    private var record: DownloadRecord? { downloads.records.first { track.aliases.contains($0.id) } }
    private var status: String {
        if let record { return ["queued":"В очереди", "downloading":"Скачивается…", "installing":"Проверка файла…", "paused":"Приостановлено", "failed":"Ошибка загрузки"][record.state] ?? record.state }
        return track.local != nil ? "На iPhone" : "Скачать и слушать"
    }
    var body: some View {
        HStack(spacing: 10) {
            Button {
                if let action { action() }
                else { Task { await player.play(track.song, queue: queue.isEmpty ? [track.song] : queue, repository: library.repository) } }
            } label: {
                HStack(spacing: 12) {
                    CoverArtwork(id: track.id, size: 44, remote: track.remote)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(track.song.title).font(.subheadline.weight(.semibold)).lineLimit(1).foregroundStyle(current ? Color.undertone : .primary)
                        Text(track.song.artist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        Text(status).font(.caption2).foregroundStyle(record?.state == "failed" ? Color.red : .secondary).lineLimit(1)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                    if current { Image(systemName: player.playing ? "waveform" : "pause.fill").foregroundStyle(Color.undertone).font(.caption) }
                    else if record != nil && record?.state != "failed" && record?.state != "paused" { ProgressView().controlSize(.small) }
                    else if track.local != nil { Image(systemName:"checkmark.circle.fill").font(.caption).foregroundStyle(.secondary) }
                    else { Image(systemName:"arrow.down.circle").font(.caption).foregroundStyle(.secondary) }
                }.contentShape(Rectangle())
            }.buttonStyle(PressFeedbackStyle())
            Menu { TrackContextMenu(track: track, playlistID: playlistID) } label: { Image(systemName:"ellipsis").frame(width:44,height:44).contentShape(Rectangle()) }
                .accessibilityLabel("Меню " + track.song.title)
        }.padding(.vertical, 5).padding(.horizontal, 6)
            .background(current ? Color.undertone.opacity(0.10) : .clear, in: RoundedRectangle(cornerRadius:12))
            .contextMenu { TrackContextMenu(track: track, playlistID: playlistID) }
            .modifier(SoftScrollItem())
    }
}

struct TrackContextMenu: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var personal: PersonalLibrary
    @EnvironmentObject private var sharing: ShareCoordinator
    @EnvironmentObject private var routes: RouteCoordinator
    @AppStorage("hiddenTrackIDs") private var hidden = ""
    let track: UnifiedTrack
    var playlistID: String?
    private var syncID: String { track.remote?.id ?? track.local?.syncID ?? track.id }
    private var liked: Bool { pc.likedIDs.contains(syncID) || personal.state.likes.contains(track.song.id) }
    var body: some View { primaryActions; libraryActions; fileActions }
    @ViewBuilder private var primaryActions: some View {
        Button(liked ? "UNLIKE" : "LIKE", systemImage: liked ? "heart.slash" : "heart") {
            if syncID.count == 32 { pc.edit(PCEdit(kind:"like",track:syncID,liked:!liked)) }
            else { personal.toggleLike(track.song.id) }
        }
        Button("PLAY NEXT",systemImage:"text.line.first.and.arrowtriangle.forward") { Task { await player.enqueue(track.song,next:true,repository:library.repository) } }
        Button("ADD TO QUEUE",systemImage:"text.append") { Task { await player.enqueue(track.song,next:false,repository:library.repository) } }
        Menu("ADD TO PLAYLIST",systemImage:"text.badge.plus") {
            ForEach(pc.collections.playlists) { playlist in Button(playlist.name) { pc.edit(PCEdit(kind:"add_tracks",playlist:playlist.id,tracks:[syncID])) } }
            if pc.collections.playlists.isEmpty { Text("Создай плейлист во вкладке «Создать»") }
        }
        if let playlistID { Button("REMOVE FROM PLAYLIST",systemImage:"minus.circle",role:.destructive) { pc.edit(PCEdit(kind:"remove_track",track:syncID,playlist:playlistID)) } }
        if let remote = track.remote, track.local == nil { Button("DOWNLOAD ORIGINAL",systemImage:"arrow.down.circle") { pc.download([remote],library:library) } }
    }
    @ViewBuilder private var libraryActions: some View {
        NavigationLink { MusicLibraryView(artist:track.song.artist).navigationTitle(track.song.artist) } label: { Label("GO TO ARTIST",systemImage:"person") }
        NavigationLink { MusicLibraryView(album:track.song.artist + " — " + track.song.album).navigationTitle(track.song.album) } label: { Label("GO TO ALBUM",systemImage:"square.stack") }
    }
    @ViewBuilder private var fileActions: some View {
        Button("SHARE ORIGINAL",systemImage:"square.and.arrow.up") { Task {
            do { let song = try await pc.resolve(track.song,library:library); sharing.payload = SharePayload(items:[try await library.repository.fileURL(song)]) }
            catch { player.error = "Не удалось открыть оригинал." }
        } }
        NavigationLink { TrackInformation(track:track) } label: { Label("FILE INFO",systemImage:"info.circle") }
        Button("TRACK CODE",systemImage:"qrcode") { routes.code = CodeRoute(url:MusicLinks.make("track",syncID)) }
        Button(HiddenTrackPolicy.ids(hidden).isDisjoint(with:track.aliases) ? "HIDE FROM QUEUE" : "SHOW TRACK",systemImage:"eye.slash") { hidden = HiddenTrackPolicy.toggled(hidden,aliases:track.aliases) }
        if let song = track.local { Button("REMOVE PHONE COPY",systemImage:"trash",role:.destructive) { Task { await library.removeCopies([song]); player.forgetFiles([song.id]) } } }
    }
}
struct TrackInformation: View {
    let track: UnifiedTrack
    var body: some View {
        Form {
            LabeledContent("Название",value:track.song.title)
            LabeledContent("Исполнитель",value:track.song.artist)
            LabeledContent("Альбом",value:track.song.album)
            LabeledContent("Формат",value:track.song.format)
            LabeledContent("Размер",value:ByteCountFormatter.string(fromByteCount:track.song.size,countStyle:.file))
            LabeledContent("Доступность",value:track.local == nil ? "На компьютере" : "На iPhone")
        }.navigationTitle("FILE INFO")
    }
}
