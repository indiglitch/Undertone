import SwiftUI

private struct BrowserKey: Equatable {
    let query: String
    let library: Int
    let catalog: Int
    let collections: Int
    let sort: String
}
struct MusicLibraryView: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var pc: PCConnection
    var downloadsOnly = false
    var playlistID: String?
    var favoritesOnly = false
    var album: String?
    @AppStorage("librarySort") private var sortValue = LibrarySort.title.rawValue
    @State private var query = ""
    @State private var songs: [Song] = []
    @State private var remote: [PCTrack] = []
    @State private var newPlaylist = false
    @State private var renamePlaylist = false
    @State private var name = ""
    private var sort: LibrarySort { LibrarySort(rawValue: sortValue) ?? .title }
    private var playlist: PCPlaylist? { pc.collections.playlists.first { $0.id == playlistID } }
    private var isRoot: Bool { playlistID == nil && !favoritesOnly && album == nil }
    var body: some View {
        List {
            if isRoot && !downloadsOnly {
                Section {
                    NavigationLink { MusicLibraryView(favoritesOnly: true).navigationTitle("Любимые треки") } label: {
                        Label("Любимые треки · \(pc.collections.likes.count)", systemImage: "heart.fill").foregroundStyle(Color.undertone)
                    }
                    ForEach(pc.collections.playlists) { playlist in
                        NavigationLink { MusicLibraryView(playlistID: playlist.id).navigationTitle(playlist.name) } label: {
                            Label("\(playlist.name) · \(playlist.tracks.count)", systemImage: "music.note.list")
                        }
                    }
                    Button("Создать плейлист", systemImage: "plus") { name = ""; newPlaylist = true }
                        .disabled(pc.address.isEmpty)
                    if pc.pendingCount > 0 { NavigationLink { PendingEditsView() } label: { Label("Синхронизация · \(pc.pendingCount)", systemImage: "arrow.triangle.2.circlepath") } }
                }
            }
            if let playlistID, let playlist {
                Section {
                    Button("Скачать плейлист", systemImage: "arrow.down.circle") {
                        let ids = Set(playlist.tracks); pc.download(pc.tracks.filter { ids.contains($0.id) }, library: library)
                    }
                    Menu("Изменить плейлист", systemImage: "ellipsis") {
                        Button("Переименовать") { name = playlist.name; renamePlaylist = true }
                        Button("Удалить плейлист", role: .destructive) { pc.edit(PCEdit(kind: "delete_playlist", playlist: playlistID)) }
                    }
                }
            }
            if !songs.isEmpty {
                Section("На iPhone · \(songs.count)") {
                    ForEach(Array(songs.enumerated()), id: \.offset) { _, song in
                        Button { Task { await player.play(song, queue: songs, repository: library.repository) } } label: {
                            SongRow(song: song, liked: song.syncID.map { pc.likedIDs.contains($0) } ?? false)
                        }.buttonStyle(.plain).contextMenu {
                            Button("Играть следующим", systemImage: "text.line.first.and.arrowtriangle.forward") { Task { await player.enqueue(song, next: true, repository: library.repository) } }
                            Button("В конец очереди", systemImage: "text.append") { Task { await player.enqueue(song, next: false, repository: library.repository) } }
                            if let id = song.syncID { trackMenu(id) }
                        }
                    }
                }
            }
            if !remote.isEmpty && !downloadsOnly {
                Section("На компьютере · \(remote.count)") {
                    ForEach(Array(remote.enumerated()), id: \.offset) { _, track in
                        HStack(spacing: 12) {
                            CoverArtwork(id: track.id, remote: track)
                            TrackLabels(title: track.title, artist: track.artist, format: track.format)
                            Spacer(minLength: 4)
                            if pc.likedIDs.contains(track.id) { Image(systemName: "heart.fill").font(.caption).foregroundStyle(Color.undertone) }
                            Button("Скачать \(track.title)", systemImage: "arrow.down.circle") { pc.download([track], library: library) }
                                .labelStyle(.iconOnly).frame(width: 44, height: 44).disabled(library.importing)
                        }.contextMenu { trackMenu(track.id) }
                    }
                }
            }
            if songs.isEmpty && (remote.isEmpty || downloadsOnly) {
                ContentUnavailableView(query.isEmpty ? "Пока нет музыки" : "Ничего не найдено", systemImage: "music.note",
                    description: Text(query.isEmpty ? "Подключи ПК во вкладке «Устройства» или добавь файлы." : query))
            }
            if isRoot && !downloadsOnly && query.isEmpty {
                Section("Альбомы") {
                    ForEach(Array(Set(pc.albums.keys).union(library.albums.keys)).sorted(), id: \.self) { key in
                        NavigationLink { MusicLibraryView(album: key).navigationTitle(key) } label: { Text(key).lineLimit(2) }
                    }
                }
            }
            if album != nil && !remote.isEmpty {
                Button("Скачать альбом", systemImage: "arrow.down.circle") { pc.download(remote, library: library) }
            }
        }
        .listStyle(.plain).scrollContentBackground(.hidden)
        .searchable(text: $query, prompt: "Песня, исполнитель, альбом")
        .refreshable { await pc.refresh() }
        .toolbar {
            if playlistID == nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu("Сортировка", systemImage: "arrow.up.arrow.down") {
                        Picker("Сортировка", selection: $sortValue) { ForEach(LibrarySort.allCases) { Text($0.title).tag($0.rawValue) } }
                    }
                }
            }
        }
        .task(id: BrowserKey(query: query, library: library.revision, catalog: pc.catalogRevision, collections: pc.collectionsRevision, sort: sortValue)) {
            if !query.isEmpty { try? await Task.sleep(for: .milliseconds(180)); guard !Task.isCancelled else { return } }
            let local = library.sortedSongs, tracks = pc.tracks, installed = library.installedIDs
            let likes = Set(pc.collections.likes), playlistTracks = playlistID == nil ? nil : (playlist?.tracks ?? [])
            let album = album, query = query, favorites = favoritesOnly, sort = sort
            let result = await Task.detached(priority: .userInitiated) {
                func matches(_ title: String, _ artist: String, _ albumName: String) -> Bool {
                    (album == nil || album == "\(artist) — \(albumName)") && (query.isEmpty || "\(title) \(artist) \(albumName)".localizedCaseInsensitiveContains(query))
                }
                if let playlistTracks {
                    let localMap = Dictionary(local.flatMap { song in song.sourceIDs.map { id in var copy = song; copy.syncID = id; return (id, copy) } }, uniquingKeysWith: { first, _ in first })
                    let pcMap = Dictionary(tracks.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
                    return (playlistTracks.compactMap { localMap[$0] }.filter { matches($0.title, $0.artist, $0.album) },
                        playlistTracks.filter { !installed.contains($0) }.compactMap { pcMap[$0] }.filter { matches($0.title, $0.artist, $0.album) })
                }
                return (sort.sorted(local.filter { (!favorites || !$0.sourceIDs.isDisjoint(with: likes)) && matches($0.title, $0.artist, $0.album) }),
                    sort.sorted(tracks.filter { !installed.contains($0.id) && (!favorites || likes.contains($0.id)) && matches($0.title, $0.artist, $0.album) }))
            }.value
            guard !Task.isCancelled else { return }; songs = result.0; remote = result.1
        }
        .alert(renamePlaylist ? "Переименовать плейлист" : "Новый плейлист", isPresented: Binding(
            get: { newPlaylist || renamePlaylist }, set: { if !$0 { newPlaylist = false; renamePlaylist = false } })) {
            TextField("Название", text: $name)
            Button("Сохранить") {
                let value = name.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !value.isEmpty, value.count <= 120 else { return }
                if let id = playlistID { pc.edit(PCEdit(kind: "rename_playlist", playlist: id, name: value)) }
                else { pc.edit(PCEdit(kind: "create_playlist", playlist: UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased(), name: value)) }
                newPlaylist = false; renamePlaylist = false
            }
            Button("Отмена", role: .cancel) { newPlaylist = false; renamePlaylist = false }
        }
    }
    @ViewBuilder private func trackMenu(_ id: String) -> some View {
        Button(pc.likedIDs.contains(id) ? "Убрать из любимых" : "В любимые", systemImage: "heart") {
            pc.edit(PCEdit(kind: "like", track: id, liked: !pc.likedIDs.contains(id)))
        }
        Menu("В плейлист", systemImage: "text.badge.plus") {
            ForEach(pc.collections.playlists) { playlist in
                Button(playlist.name) { pc.edit(PCEdit(kind: "add_tracks", playlist: playlist.id, tracks: [id])) }
            }
        }
        if let playlistID { Button("Убрать из плейлиста", role: .destructive) { pc.edit(PCEdit(kind: "remove_track", track: id, playlist: playlistID)) } }
    }
}

private struct TrackLabels: View {
    let title: String, artist: String, format: String
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.subheadline.weight(.semibold)).lineLimit(1)
            Text(artist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            Text(format.uppercased()).font(.system(size: 10, weight: .semibold)).foregroundStyle(Color.undertone)
        }
    }
}
private struct SongRow: View {
    let song: Song
    let liked: Bool
    var body: some View {
        HStack(spacing: 12) {
            CoverArtwork(id: song.syncID ?? song.id)
            TrackLabels(title: song.title, artist: song.artist, format: song.format)
            Spacer(minLength: 4)
            Image(systemName: liked ? "heart.fill" : "checkmark.circle.fill").font(.caption).foregroundStyle(liked ? Color.undertone : .secondary)
        }.padding(.vertical, 4).contentShape(Rectangle())
    }
}

struct DownloadStatus: View {
    @EnvironmentObject private var downloads: BackgroundDownloads
    var body: some View {
        if !downloads.records.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text(downloads.title ?? "Загрузки приостановлены").font(.headline).lineLimit(2)
                Text("Осталось: \(downloads.records.count) · Готово: \(downloads.completed)").font(.caption).foregroundStyle(.secondary)
                Text("Можно заблокировать iPhone. Для передачи ПК должен работать, а телефон — оставаться в Wi-Fi.").font(.caption).foregroundStyle(.secondary)
                HStack {
                    Button(downloads.active ? "Приостановить" : "Продолжить") { Task { if downloads.active { await downloads.pause() } else { await downloads.resume() } } }
                    Button("Очистить очередь", role: .destructive) { Task { await downloads.cancelAll() } }
                }.buttonStyle(.glass).disabled(downloads.pausing)
            }.padding(20).modifier(GlassSurface())
        }
    }
}

struct DownloadErrorAlerts: View {
    @EnvironmentObject private var downloads: BackgroundDownloads
    var body: some View {
        Color.clear.frame(width: 0, height: 0).alert("Загрузка", isPresented: Binding(get: { downloads.error != nil }, set: { if !$0 { downloads.error = nil } })) {
            Button("Понятно", role: .cancel) { downloads.error = nil }
        } message: { Text(downloads.error ?? "") }
    }
}
