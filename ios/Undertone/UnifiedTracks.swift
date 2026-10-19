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
    @Environment(\.compactCollectionRows) private var compact
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var personal: PersonalLibrary
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var downloads: BackgroundDownloads
    let track: UnifiedTrack
    var queue: [Song] = []
    var playlistID: String?
    var selectionMode = false
    var action: (() -> Void)?
    private var current: Bool { TrackCatalog.current(track, song: player.current) }
    private var record: DownloadRecord? { downloads.records.first { track.aliases.contains($0.id) } }
    private var status: String {
        if let record { return DownloadRecordPresentation(record: record).title }
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
                    VStack(alignment: .leading, spacing: compact ? 2 : 4) {
                        Text(track.song.title).font(.subheadline.weight(.semibold)).lineLimit(compact ? 2 : 1).foregroundStyle(current ? Color.undertone : .primary)
                        Text(track.song.artist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        if !compact || record != nil {
                            Group {
                                if let record { DownloadStateLabel(record: record) }
                                else { Text(status) }
                            }.font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                    if current { Image(systemName: player.playing ? "waveform" : "pause.fill").foregroundStyle(Color.undertone).font(.caption) }
                    else if let record { Image(systemName: DownloadRecordPresentation(record: record).icon).font(.caption).foregroundStyle(record.state == "failed" ? Color.red : .secondary).accessibilityHidden(true) }
                    else if track.local != nil { Image(systemName:"checkmark.circle.fill").font(.caption).foregroundStyle(.secondary) }
                    else { Image(systemName:"arrow.down.circle").font(.caption).foregroundStyle(.secondary) }
                }.contentShape(Rectangle())
            }.buttonStyle(PressFeedbackStyle())
                .accessibilityValue(compact ? (current ? (player.playing ? "PLAYING, " : "PAUSED, ") : "") + status : "")
            Menu { TrackContextMenu(track: track, playlistID: playlistID) } label: { MusicMenuLabel() }
                .buttonStyle(.borderless).accessibilityLabel("Меню " + track.song.title).disabled(selectionMode)
        }.padding(.vertical, compact ? 2 : 5).padding(.horizontal, 6)
            .background(current ? Color.undertone.opacity(compact ? 0.04 : 0.10) : .clear, in: RoundedRectangle(cornerRadius:12))
            .contextMenu { if !selectionMode { TrackContextMenu(track: track, playlistID: playlistID) } }
            .contentShape(.contextMenuPreview,RoundedRectangle(cornerRadius:12)).menuOrder(.fixed)
    }
}

struct TrackContextMenu: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var personal: PersonalLibrary
    @EnvironmentObject private var sharing: ShareCoordinator
    @EnvironmentObject private var routes: RouteCoordinator
    @EnvironmentObject private var confirmation: MenuConfirmationCoordinator
    @AppStorage("hiddenTrackIDs") private var hidden = ""
    @AppStorage("offlineMode") private var offline = false
    let track: UnifiedTrack
    var playlistID: String?
    private var syncID: String { track.remote?.id ?? track.local?.syncID ?? track.id }
    private var liked: Bool { pc.likedIDs.contains(syncID) || personal.state.likes.contains(track.song.id) }
    private var isHidden: Bool { !HiddenTrackPolicy.ids(hidden).isDisjoint(with: track.aliases) }
    var body: some View {
        MusicMenuSection(group: .playback) {
            Button("PLAY NEXT",systemImage:"text.line.first.and.arrowtriangle.forward") { Task { await player.enqueue(track.song,next:true,repository:library.repository) } }
            Button("ADD TO QUEUE",systemImage:"text.append") { Task { await player.enqueue(track.song,next:false,repository:library.repository) } }
        }
        MusicMenuSection(group: .library) {
            Button(liked ? "UNLIKE" : "LIKE", systemImage: liked ? "heart.slash" : "heart") {
                if syncID.count == 32 { pc.edit(PCEdit(kind:"like",track:syncID,liked:!liked)) }
                else { personal.toggleLike(track.song.id) }
            }
            Menu("ADD TO PLAYLIST",systemImage:"text.badge.plus") {
                ForEach(pc.collections.playlists) { playlist in Button(playlist.name) { pc.edit(PCEdit(kind:"add_tracks",playlist:playlist.id,tracks:[syncID])) } }
                if pc.collections.playlists.isEmpty { Text("Создай плейлист в Library или Create") }
            }
        }
        if !track.song.artist.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !track.song.album.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            MusicMenuSection(group: .related) {
                if !track.song.artist.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    NavigationLink { MusicLibraryView(artist:track.song.artist).navigationTitle(track.song.artist) } label: { Label("GO TO ARTIST",systemImage:"person") }
                }
                if !track.song.album.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    NavigationLink { MusicLibraryView(album:track.song.artist + " — " + track.song.album).navigationTitle(track.song.album) } label: { Label("GO TO ALBUM",systemImage:"square.stack") }
                }
            }
        }
        MusicMenuSection(group: .file) {
            if let remote = track.remote, track.local == nil {
                Button("DOWNLOAD ORIGINAL",systemImage:"arrow.down.circle") { pc.download([remote],library:library) }.disabled(offline)
                if offline { Text("Для доступа к оригиналу выключи офлайн-режим и подключи ПК.") }
            }
            Button("SHARE ORIGINAL",systemImage:"square.and.arrow.up") { Task {
                do { let song = try await pc.resolve(track.song,library:library); sharing.payload = SharePayload(items:[try await library.repository.fileURL(song)]) }
                catch { player.error = "Не удалось открыть оригинал." }
            } }.disabled(track.local == nil && offline)
            NavigationLink { TrackInformation(track:track) } label: { Label("FILE INFO",systemImage:"info.circle") }
            Button("TRACK CODE",systemImage:"qrcode") { routes.code = CodeRoute(url:MusicLinks.make("track",syncID)) }
            Button(isHidden ? "SHOW TRACK" : "HIDE FROM QUEUE",systemImage:isHidden ? "eye" : "eye.slash") { hidden = HiddenTrackPolicy.toggled(hidden,aliases:track.aliases) }
        }
        if playlistID != nil || track.local != nil {
            MusicMenuSection(group: .destructive) {
                if let playlistID {
                    Button("REMOVE FROM PLAYLIST",systemImage:"minus.circle",role:.destructive) {
                        let id = syncID
                        confirmation.confirm("Убрать трек из плейлиста?", message: track.song.title + "\nИзменится только состав этого плейлиста. Файлы и другие коллекции сохранятся.", actionTitle: "REMOVE FROM PLAYLIST") {
                            pc.edit(PCEdit(kind:"remove_track",track:id,playlist:playlistID))
                        }
                    }
                }
                if let song = track.local {
                    Button("REMOVE PHONE COPY",systemImage:"trash",role:.destructive) {
                        confirmation.confirm("Убрать копию с iPhone?", message: song.title + "\nФайл будет перенесён в корзину iPhone. Доступна UNDO DELETE до очистки корзины. Файлы на ПК не изменятся; воспроизведение этой копии остановится.", actionTitle: "REMOVE PHONE COPY") {
                            Task { await library.removeCopies([song]); player.forgetFiles([song.id]) }
                        }
                    }
                }
            }
        }
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
        }.modifier(SoftScrollEdges()).navigationTitle("FILE INFO")
    }
}
