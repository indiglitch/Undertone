import SwiftUI

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
    var coverID: String?
    var personalPlaylistID: String?
    var displayTitle: String?
    @AppStorage("librarySort") private var sortValue = LibrarySort.title.rawValue
    @State private var query = ""
    @State private var entries: [UnifiedTrack] = []
    @State private var selecting = false
    @State private var selected = Set<String>()
    @State private var editing = false
    private var playlist: PCPlaylist? { pc.collections.playlists.first { $0.id == playlistID } }
    private var title: String { displayTitle ?? playlist?.name ?? album ?? artist ?? (favoritesOnly ? "LIKED TRACKS" : "Музыка") }
    private var hasHeader: Bool { playlistID != nil || album != nil || artist != nil || favoritesOnly }
    private var effectiveQuery: String { externalQuery ?? query }
    private var refreshKey: String { "\(library.revision)|\(pc.catalogRevision)|\(pc.collectionsRevision)|\(personal.revision)|\(effectiveQuery)|\(sortValue)" }
    var body: some View {
        List {
            if hasHeader { collectionHeader }
            if selecting { bulkActions }
            if !library.removed.isEmpty { Button("UNDO DELETE",systemImage:"arrow.uturn.backward") { Task { await library.undoRemoval() } } }
            ForEach(entries) { track in
                HStack(spacing: 4) {
                    if selecting { Button { if !selected.insert(track.id).inserted { selected.remove(track.id) } } label: { Image(systemName:selected.contains(track.id) ? "checkmark.circle.fill" : "circle").frame(width:32,height:44) }.buttonStyle(PressFeedbackStyle()) }
                    UnifiedTrackRow(track:track,queue:entries.map(\.song),playlistID:playlistID)
                }.listRowInsets(EdgeInsets(top:0,leading:10,bottom:0,trailing:10))
            }
            if entries.isEmpty { ContentUnavailableView(effectiveQuery.isEmpty ? "Пока нет музыки" : "Ничего не найдено",systemImage:"music.note",description:Text(effectiveQuery.isEmpty ? "Подключи ПК или добавь аудиофайлы." : effectiveQuery)) }
        }.listStyle(.plain).modifier(SoftScrollEdges()).scrollContentBackground(.hidden).scrollDismissesKeyboard(.interactively)
            .navigationBarTitleDisplayMode(.inline)
            .modifier(OptionalMusicSearch(query:$query,enabled:externalQuery == nil))
            .refreshable { await pc.migratePlaylists(personal,library:library); await pc.refresh() }
            .toolbar {
                if externalQuery == nil { ToolbarItem(placement:.topBarTrailing) { NavigationLink { DownloadsView() } label: { Label("DOWNLOADS",systemImage:"arrow.down.circle") } } }

                if externalQuery == nil { ToolbarItem(placement:.topBarTrailing) {
                    Menu("LIST ACTIONS",systemImage:"ellipsis") {
                        Button(selecting ? "DONE" : "SELECT TRACKS") { selecting.toggle(); selected = [] }
                        Picker("Сортировка",selection:$sortValue) { ForEach(LibrarySort.allCases) { Text($0.title).tag($0.rawValue) } }
                        if let playlist { PlaylistContextMenu(playlist:playlist) { editing = true } }
                        if let album { AlbumContextMenu(name:album) }
                    }
                } }
            }
            .sheet(isPresented:$editing) { PlaylistEditorView(id:playlistID ?? "",isPC:true) }
            .task(id:refreshKey) { await rebuild() }
    }
    private var collectionHeader: some View {
        Section {
            HStack(spacing:16) {
                CoverArtwork(id:coverID ?? playlistID ?? entries.first?.id,size:88,remote:entries.first?.remote)
                VStack(alignment:.leading,spacing:6) {
                    Text(title).font(.headline).lineLimit(3)
                    Text("\(entries.count) треков").font(.caption).foregroundStyle(.secondary)
                    if let description = playlist?.description, !description.isEmpty { Text(description).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
                    if let id = playlistID, pc.pendingEdits.contains(where:{$0.playlist == id}) { Label("Ожидает синхронизации",systemImage:"arrow.triangle.2.circlepath").font(.caption2).foregroundStyle(Color.undertone) }
                }
            }.padding(.vertical,8)
            HStack {
                Button("PLAY",systemImage:"play.fill") { play(entries) }.buttonStyle(.glassProminent)
                Button("SHUFFLE",systemImage:"shuffle") { play(entries,shuffle:true) }.labelStyle(.iconOnly).frame(width:44,height:44)
                Spacer()
                if let album { Menu { AlbumContextMenu(name:album) } label: { Image(systemName:"ellipsis").frame(width:44,height:44) } }
                if let playlist { Menu { PlaylistContextMenu(playlist:playlist) { editing = true } } label: { Image(systemName:"ellipsis").frame(width:44,height:44) } }
            }.disabled(entries.isEmpty)
        }.listRowBackground(Color.clear)
    }
    private var bulkActions: some View {
        Section("Выбрано: \(selected.count)") {
            Menu("SELECTION ACTIONS") {
                Button("DOWNLOAD ORIGINALS") { pc.download(entries.filter { selected.contains($0.id) }.compactMap(\.remote),library:library) }
                Menu("ADD TO PLAYLIST") { ForEach(pc.collections.playlists) { p in Button(p.name) { pc.edit(PCEdit(kind:"add_tracks",playlist:p.id,tracks:entries.filter { selected.contains($0.id) }.map(\.id))) } } }
                Button("LIKE") { for track in entries where selected.contains(track.id) { if track.id.count == 32 { pc.edit(PCEdit(kind:"like",track:track.id,liked:true)) } else { personal.update { $0.likes.insert(track.id) } } } }
                Button("REMOVE PHONE COPIES",role:.destructive) { let songs = entries.filter { selected.contains($0.id) }.compactMap(\.local); Task { await library.removeCopies(songs); player.forgetFiles(Set(songs.map(\.id))) }; selected = [] }
            }.disabled(selected.isEmpty)
        }
    }
    private func play(_ source: [UnifiedTrack], shuffle: Bool = false) { guard !source.isEmpty, !shuffle || source.count > 1 else { ActionFeedback.failed(); return }; if let first = shuffle ? source.randomElement() : source.first { Task { await player.play(first.song,queue:source.map(\.song),repository:library.repository,shuffle:shuffle) } } }
    private func rebuild() async {
        if !effectiveQuery.isEmpty { try? await Task.sleep(for:.milliseconds(180)); guard !Task.isCancelled else { return } }
        let local = library.songs, remote = pc.tracks, order = orderedIDs ?? playlist?.tracks
        let likes = personal.state.likes.union(pc.likedIDs)
        let query = effectiveQuery, album = album, artist = artist, localOnly = localFiles, downloaded = downloadsOnly, favorites = favoritesOnly
        let sort = LibrarySort(rawValue:sortValue) ?? .title
        let result = await Task.detached(priority:.userInitiated) {
            TrackCatalog.merged(local:local,remote:remote,order:order,sort:sort,albumOrder:album != nil).filter { track in
                let song = track.song
                return (!downloaded || track.local != nil) && (!localOnly || track.remote == nil) && (!favorites || !track.aliases.isDisjoint(with:likes)) && (album == nil || album == song.artist + " — " + song.album) && (artist == nil || artist == song.artist) && (query.isEmpty || (song.title + " " + song.artist + " " + song.album).localizedCaseInsensitiveContains(query))
            }
        }.value
        if !Task.isCancelled { entries = result }
    }
}

struct DownloadStatus: View {
    @EnvironmentObject private var downloads: BackgroundDownloads
    var body: some View {
        if !downloads.records.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text(downloads.title ?? "Загрузки приостановлены").font(.headline).lineLimit(2)
                Text("Осталось: \(downloads.records.count) · Готово: \(downloads.completed)").font(.caption).foregroundStyle(.secondary)
                DisclosureGroup("Список загрузок") {
                    ForEach(Array(downloads.records.prefix(30))) { record in HStack {
                        VStack(alignment:.leading) { Text(record.track.title).font(.caption).lineLimit(1); Text(["queued":"В очереди","downloading":"Загрузка","installing":"Проверка оригинала","paused":"Приостановлено","failed":"Ошибка"][record.state] ?? record.state).font(.caption2).foregroundStyle(.secondary) }
                        Spacer()
                        if ["paused","failed"].contains(record.state) { Button("RETRY",systemImage:"arrow.clockwise") { Task { await downloads.retry(record.id) } }.labelStyle(.iconOnly) }
                        Button("CANCEL",systemImage:"xmark") { Task { await downloads.cancel(record.id) } }.labelStyle(.iconOnly)
                    } }
                }
                Text("Можно заблокировать iPhone. Для передачи ПК должен работать, а телефон — оставаться в Wi-Fi.").font(.caption).foregroundStyle(.secondary)
                HStack {
                    Button(downloads.active ? "PAUSE" : "RESUME") { Task { if downloads.active { await downloads.pause() } else { await downloads.resume() } } }
                    Button("CLEAR QUEUE", role: .destructive) { Task { await downloads.cancelAll() } }
                }.buttonStyle(.glass).disabled(downloads.pausing)
            }.padding(20).modifier(GlassSurface())
        }
    }
}

struct DownloadErrorAlerts: View {
    @EnvironmentObject private var downloads: BackgroundDownloads
    var body: some View {
        Color.clear.frame(width: 0, height: 0).alert("Загрузка", isPresented: Binding(get: { downloads.error != nil }, set: { if !$0 { downloads.error = nil } })) {
            Button("OK", role: .cancel) { downloads.error = nil }
        } message: { Text(downloads.error ?? "") }
    }
}

private struct OptionalMusicSearch: ViewModifier {
    @Binding var query: String
    var enabled: Bool
    @ViewBuilder func body(content: Content) -> some View { if enabled { content.searchable(text:$query,prompt:"Песня, исполнитель, альбом") } else { content } }
}
