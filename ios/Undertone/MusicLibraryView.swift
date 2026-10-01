import SwiftUI

private struct BrowserKey: Equatable {
    let query: String
    let library: Int
    let catalog: Int
    let collections: Int
    let sort: String
    let personal: Int
    let scope: String
    let order: [String]?
}
struct MusicLibraryView: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var personal: PersonalLibrary
    var downloadsOnly = false
    var playlistID: String?
    var favoritesOnly = false
    var album: String?
    var artist: String?
    var orderedIDs: [String]?
    var localFiles = false
    var showRoot = true
    var externalQuery: String?
    @State private var selecting = false
    @State private var selected = Set<String>()
    @State private var removing = false
    private var effectiveQuery: String { externalQuery ?? query }
    @AppStorage("librarySort") private var sortValue = LibrarySort.title.rawValue
    @State private var query = ""
    @State private var songs: [Song] = []
    @State private var remote: [PCTrack] = []
    @State private var newPlaylist = false
    @State private var renamePlaylist = false
    @State private var name = ""
    private var sort: LibrarySort { LibrarySort(rawValue: sortValue) ?? .title }
    private var playlist: PCPlaylist? { pc.collections.playlists.first { $0.id == playlistID } }
    private var isRoot: Bool { showRoot && playlistID == nil && !favoritesOnly && album == nil && artist == nil && orderedIDs == nil }
    var body: some View {
        List {
            if album != nil || artist != nil || orderedIDs != nil || favoritesOnly {
                Section {
                    if let first = songs.first {
                        HStack(spacing: 18) { CoverArtwork(id: first.syncID ?? first.id, size: 96); VStack(alignment: .leading, spacing: 8) { Text(album ?? artist ?? (favoritesOnly ? "Любимые треки" : "Музыка")).font(.headline).lineLimit(3); Text("\(songs.count) скачано · \(remote.count) на ПК").font(.caption).foregroundStyle(.secondary) } }.padding(.vertical, 12)
                    }
                    HStack {
                        Button("Слушать", systemImage: "play.fill") { if let first = songs.first { Task { await player.play(first, queue: songs, repository: library.repository) } } }.disabled(songs.isEmpty)
                        Button("Перемешать", systemImage: "shuffle") { let shuffled = songs.shuffled(); if let first = shuffled.first { Task { await player.play(first, queue: shuffled, repository: library.repository) } } }.disabled(songs.isEmpty)
                    }.buttonStyle(.glass)
                    if !remote.isEmpty && !downloadsOnly { Button("Скачать оригиналы", systemImage: "arrow.down.circle") { pc.download(remote, library: library) } }
                    if let album { Button(personal.state.albums.contains(album) ? "Удалить из библиотеки" : "Сохранить альбом", systemImage: "plus.circle") { personal.update { if !$0.albums.insert(album).inserted { $0.albums.remove(album) } } } }
                    if let artist { Button(personal.state.artists.contains(artist) ? "Убрать исполнителя" : "Сохранить исполнителя", systemImage: "person.badge.plus") { personal.update { if !$0.artists.insert(artist).inserted { $0.artists.remove(artist) } } } }
                }
            }
            if selecting { Section("Выбрано: \(selected.count)") {
                Menu("Действия с выбранными") {
                    Button("Скачать") { pc.download(pc.tracks.filter { selected.contains($0.id) }, library: library) }
                    Button("В любимые") { for song in songs where selected.contains(song.id) { if let id = song.syncID { pc.edit(PCEdit(kind: "like",track: id,liked: true)) } else { personal.update { $0.likes.insert(song.id) } } }; for track in remote where selected.contains(track.id) { pc.edit(PCEdit(kind:"like",track:track.id,liked:true)) } }
                    Menu("В личный плейлист") { ForEach(personal.state.playlists) { playlist in Button(playlist.name) { personal.update { if let index = $0.playlists.firstIndex(where: { $0.id == playlist.id }) { let present = Set($0.playlists[index].tracks); $0.playlists[index].tracks += (songs.map(\.id) + remote.map(\.id)).filter { selected.contains($0) && !present.contains($0) } } } } } }
                    Button("Удалить копии с iPhone",role: .destructive) { removing = true }
                }.disabled(selected.isEmpty)
            } }
            if !library.removed.isEmpty { Section { Button("Отменить удаление с iPhone", systemImage:"arrow.uturn.backward") { Task { await library.undoRemoval() } } } }
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
                        Button { if selecting { if !selected.insert(song.id).inserted { selected.remove(song.id) } } else { Task { await player.play(song, queue: songs, repository: library.repository) } } } label: {
                            HStack { if selecting { Image(systemName: selected.contains(song.id) ? "checkmark.circle.fill" : "circle").foregroundStyle(Color.undertone) }; SongRow(song: song, liked: (song.syncID.map { pc.likedIDs.contains($0) } ?? false) || personal.state.likes.contains(song.id)) }
                        }.buttonStyle(.plain).contextMenu {
                            Button("Играть следующим", systemImage: "text.line.first.and.arrowtriangle.forward") { Task { await player.enqueue(song, next: true, repository: library.repository) } }
                            Button("В конец очереди", systemImage: "text.append") { Task { await player.enqueue(song, next: false, repository: library.repository) } }
                            if let id = song.syncID { trackMenu(id) } else { Button(personal.state.likes.contains(song.id) ? "Убрать из любимых" : "В любимые",systemImage:"heart") { personal.toggleLike(song.id) } }
                            Menu("В личный плейлист") { ForEach(personal.state.playlists) { playlist in Button(playlist.name) { personal.update { if let index = $0.playlists.firstIndex(where: { $0.id == playlist.id }), !$0.playlists[index].tracks.contains(song.id) { $0.playlists[index].tracks.append(song.id) } } } } }
                            NavigationLink { MusicLibraryView(artist:song.artist).navigationTitle(song.artist) } label: { Label("К исполнителю",systemImage:"person") }
                            NavigationLink { MusicLibraryView(album:"\(song.artist) — \(song.album)").navigationTitle(song.album) } label: { Label("К альбому",systemImage:"square.stack") }
                            ShareOriginalButton(song:song)
                            Button("Удалить копию с iPhone", role:.destructive) { selected = [song.id]; removing = true }
                        }
                    }
                }
            }
            if !remote.isEmpty && !downloadsOnly {
                Section("На компьютере · \(remote.count)") {
                    ForEach(Array(remote.enumerated()), id: \.offset) { _, track in
                        HStack(spacing: 12) {
                            if selecting { Button { if !selected.insert(track.id).inserted { selected.remove(track.id) } } label: { Image(systemName:selected.contains(track.id) ? "checkmark.circle.fill" : "circle") } }
                            CoverArtwork(id: track.id, remote: track)
                            TrackLabels(title: track.title, artist: track.artist, format: track.format)
                            Spacer(minLength: 4)
                            if pc.likedIDs.contains(track.id) { Image(systemName: "heart.fill").font(.caption).foregroundStyle(Color.undertone) }
                            Button("Скачать \(track.title)", systemImage: "arrow.down.circle") { pc.download([track], library: library) }
                                .labelStyle(.iconOnly).frame(width: 44, height: 44).disabled(library.importing)
                        }.contextMenu {
                            trackMenu(track.id)
                            Menu("В личный плейлист") { ForEach(personal.state.playlists) { playlist in Button(playlist.name) { personal.update { if let index = $0.playlists.firstIndex(where: { $0.id == playlist.id }), !$0.playlists[index].tracks.contains(track.id) { $0.playlists[index].tracks.append(track.id) } } } } }
                            NavigationLink { MusicLibraryView(artist:track.artist).navigationTitle(track.artist) } label: { Label("К исполнителю",systemImage:"person") }
                            NavigationLink { MusicLibraryView(album:"\(track.artist) — \(track.album)").navigationTitle(track.album) } label: { Label("К альбому",systemImage:"square.stack") }
                        }
                    }
                }
            }
            if songs.isEmpty && (remote.isEmpty || downloadsOnly) {
                ContentUnavailableView(effectiveQuery.isEmpty ? "Пока нет музыки" : "Ничего не найдено", systemImage: "music.note",
                    description: Text(effectiveQuery.isEmpty ? "Подключи ПК во вкладке «Устройства» или добавь файлы." : effectiveQuery))
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
        .modifier(OptionalMusicSearch(query: $query, enabled: externalQuery == nil))
        .refreshable { await pc.refresh() }
        .confirmationDialog("Удалить выбранные копии с iPhone? Оригиналы на ПК останутся.",isPresented:$removing) { Button("Удалить с iPhone",role:.destructive) { let removing = songs.filter { selected.contains($0.id) }; if removing.contains(where: { $0.id == player.current?.id }) { player.pause() }; Task { await library.removeCopies(removing) }; selected = [] } }
        .toolbar {
            ToolbarItem(placement:.topBarTrailing) { Button(selecting ? "Готово" : "Выбрать") { selecting.toggle(); selected = [] } }
            if playlistID == nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu("Сортировка", systemImage: "arrow.up.arrow.down") {
                        Picker("Сортировка", selection: $sortValue) { ForEach(LibrarySort.allCases) { Text($0.title).tag($0.rawValue) } }
                    }
                }
            }
        }
        .task(id: BrowserKey(query: effectiveQuery, library: library.revision, catalog: pc.catalogRevision, collections: pc.collectionsRevision, sort: sortValue, personal: personal.revision, scope: "\(artist ?? "")|\(album ?? "")|\(localFiles)", order: orderedIDs)) {
            if !effectiveQuery.isEmpty { try? await Task.sleep(for: .milliseconds(180)); guard !Task.isCancelled else { return } }
            let local = library.sortedSongs, tracks = pc.tracks, installed = library.installedIDs
            let likes = Set(pc.collections.likes).union(personal.state.likes), playlistTracks = orderedIDs ?? (playlistID == nil ? nil : (playlist?.tracks ?? []))
            let album = album, artist = artist, localFiles = localFiles, query = effectiveQuery, favorites = favoritesOnly, sort = sort
            let result = await Task.detached(priority: .userInitiated) {
                func matches(_ title: String, _ performer: String, _ albumName: String) -> Bool {
                    (album == nil || album == "\(performer) — \(albumName)") && (artist == nil || artist == performer) && (query.isEmpty || "\(title) \(performer) \(albumName)".localizedCaseInsensitiveContains(query))
                }
                if let playlistTracks {
                    let localMap = Dictionary(local.flatMap { song in song.sourceIDs.union([song.id]).map { id in var copy = song; if song.sourceIDs.contains(id) { copy.syncID = id }; return (id, copy) } }, uniquingKeysWith: { first, _ in first })
                    let pcMap = Dictionary(tracks.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
                    return (playlistTracks.compactMap { localMap[$0] }.filter { matches($0.title, $0.artist, $0.album) },
                        playlistTracks.filter { !installed.contains($0) }.compactMap { pcMap[$0] }.filter { matches($0.title, $0.artist, $0.album) })
                }
                return (sort.sorted(local.filter { (!localFiles || $0.sourceIDs.isEmpty) && (!favorites || likes.contains($0.id) || !$0.sourceIDs.isDisjoint(with: likes)) && matches($0.title, $0.artist, $0.album) }),
                    sort.sorted(tracks.filter { !localFiles && !installed.contains($0.id) && (!favorites || likes.contains($0.id)) && matches($0.title, $0.artist, $0.album) }))
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

private struct OptionalMusicSearch: ViewModifier {
    @Binding var query: String
    var enabled: Bool
    @ViewBuilder func body(content: Content) -> some View { if enabled { content.searchable(text:$query,prompt:"Песня, исполнитель, альбом") } else { content } }
}
