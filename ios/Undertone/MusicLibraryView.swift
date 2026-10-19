import SwiftUI

struct MusicLibraryView: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var personal: PersonalLibrary
    @EnvironmentObject private var confirmation: MenuConfirmationCoordinator
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
    var recent = false
    @AppStorage("offlineMode") private var offline = false
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
    private var orderMode: CollectionOrderPresentation { .mode(playlist: playlistID != nil, album: album != nil, ordered: orderedIDs != nil, recent: recent) }
    private var allSelected: Bool { !entries.isEmpty && selected.count == entries.count }
    var body: some View {
        List {
            collectionHeader
            if selecting { bulkActions }
            if !library.removed.isEmpty { Button("UNDO DELETE",systemImage:"arrow.uturn.backward") { Task { await library.undoRemoval() } } }
            ForEach(entries) { track in
                HStack(spacing: 4) {
                    if selecting {
                        Button { toggleSelection(track.id) } label: {
                            Image(systemName: selected.contains(track.id) ? "checkmark.circle.fill" : "circle")
                                .frame(width: 44, height: 44).contentShape(Rectangle())
                        }.buttonStyle(PressFeedbackStyle())
                            .accessibilityLabel("Выбрать " + track.song.title)
                            .accessibilityValue(selected.contains(track.id) ? "SELECTED" : "")
                    }
                    UnifiedTrackRow(track: track, queue: entries.map(\.song), playlistID: playlistID,
                                    selectionMode: selecting, action: selecting ? { toggleSelection(track.id) } : nil)
                }.modifier(CollectionRowStyle())
            }
            if entries.isEmpty { emptyCollection.modifier(CollectionRowStyle()) }
        }.modifier(CollectionListStyle()).scrollDismissesKeyboard(.interactively)
            .navigationBarTitleDisplayMode(.inline)
            .modifier(OptionalMusicSearch(query:$query,enabled:externalQuery == nil))
            .refreshable { await pc.migratePlaylists(personal,library:library); await pc.refresh() }
            .toolbar {
                if externalQuery == nil { ToolbarItem(placement:.topBarTrailing) { NavigationLink { DownloadsView() } label: { Label("DOWNLOADS",systemImage:"arrow.down.circle") } }.sharedBackgroundVisibility(.hidden) }

                if externalQuery == nil { ToolbarItem(placement: .topBarTrailing) {
                    Button(selecting ? "DONE" : "SELECT TRACKS") { selecting.toggle(); selected = [] }
                        .disabled(entries.isEmpty && !selecting).accessibilityIdentifier("collectionSelect")
                }.sharedBackgroundVisibility(.hidden) }
            }
            .sheet(isPresented:$editing) { PlaylistEditorView(id:playlistID ?? "",isPC:true) }
            .task(id:refreshKey) { await rebuild() }
    }
    private var collectionHeader: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                if hasHeader { CoverArtwork(id: coverID ?? playlistID?.replacingOccurrences(of: "-", with: "").lowercased() ?? entries.first?.id, size: CollectionLayout.summaryArtwork, remote: entries.first?.remote) }
                Button { play(entries) } label: {
                    Label("PLAY", systemImage: "play.fill").frame(minHeight: 44)
                }.buttonStyle(.glassProminent).disabled(entries.isEmpty)
                Button { play(entries, shuffle: true) } label: {
                    Image(systemName: "shuffle").frame(width: 44, height: 44).contentShape(Rectangle())
                }.buttonStyle(PressFeedbackStyle()).accessibilityLabel("SHUFFLE").disabled(entries.isEmpty)
                Spacer(minLength: 0)
                if playlist != nil || album != nil {
                    Menu {
                        if let playlist { PlaylistContextMenu(playlist: playlist) { editing = true } }
                        if let album { AlbumContextMenu(name: album) }
                    } label: { MusicMenuLabel() }
                        .menuOrder(.fixed).accessibilityLabel("COLLECTION ACTIONS").accessibilityIdentifier("collectionActions")
                }
            }
            HStack(spacing: 8) {
                Text("\(entries.count) треков").font(.caption).foregroundStyle(.secondary)
                    .accessibilityLabel(title + ", \(entries.count) треков")
                Spacer(minLength: 0)
                if orderMode == .sortable {
                    Menu {
                        Picker("SORT", selection: $sortValue) {
                            ForEach(LibrarySort.allCases) { Text($0.title).tag($0.rawValue) }
                        }
                    } label: {
                        Label((LibrarySort(rawValue: sortValue) ?? .title).title, systemImage: "arrow.up.arrow.down")
                            .font(.caption).frame(minHeight: 44).contentShape(Rectangle())
                    }.accessibilityLabel("SORT").accessibilityValue((LibrarySort(rawValue: sortValue) ?? .title).title)
                        .accessibilityIdentifier("collectionSort")
                } else { Text(orderMode.rawValue).font(.caption).foregroundStyle(.secondary) }
            }
            CollectionDownloadSummary(tracks: entries)
            if let description = playlist?.description, !description.isEmpty {
                Text(description).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            if let id = playlistID, pc.pendingEdits.contains(where: { $0.playlist == id }) {
                Label("Ожидает синхронизации", systemImage: "arrow.triangle.2.circlepath").font(.caption2).foregroundStyle(Color.undertone)
            }
        }.modifier(CollectionRowStyle()).listRowSeparator(.hidden)
    }
    private var emptyCollection: some View {
        CollectionEmptyView(title: effectiveQuery.isEmpty ? "Пока нет треков" : "Ничего не найдено",
                            detail: !effectiveQuery.isEmpty ? "Попробуй другой запрос." : recent ? "Послушай музыку — здесь появятся последние треки." : playlistID != nil ? "Добавь треки через меню песни." : favoritesOnly ? "Отмечай любимые треки сердцем в меню песни." : "Подключи ПК или добавь аудиофайлы.")
    }
    private func toggleSelection(_ id: String) {
        if !selected.insert(id).inserted { selected.remove(id) }
    }
    private var bulkActions: some View {
        Section {
            HStack {
                Text("Выбрано: \(selected.count)").font(.caption).accessibilityIdentifier("collectionSelectedCount")
                Spacer()
                Button {
                    selected = allSelected ? [] : Set(entries.map(\.id))
                } label: {
                    Text(allSelected ? "CLEAR SELECTION" : "SELECT ALL")
                        .font(.caption).frame(minHeight: 44).contentShape(Rectangle())
                }.buttonStyle(PressFeedbackStyle()).disabled(entries.isEmpty)
            }
            Menu {
                MusicMenuSection(group: .library) {
                    Button("LIKE", systemImage: "heart") { for track in entries where selected.contains(track.id) { if track.id.count == 32 { pc.edit(PCEdit(kind:"like",track:track.id,liked:true)) } else { personal.update { $0.likes.insert(track.id) } } } }
                    Menu("ADD TO PLAYLIST", systemImage: "text.badge.plus") {
                        ForEach(pc.collections.playlists) { p in Button(p.name) { pc.edit(PCEdit(kind:"add_tracks",playlist:p.id,tracks:entries.filter { selected.contains($0.id) }.map(\.id))) } }
                        if pc.collections.playlists.isEmpty { Text("Создай плейлист в Library или Create") }
                    }
                }
                if entries.contains(where: { selected.contains($0.id) && $0.remote != nil && $0.local == nil }) {
                    MusicMenuSection(group: .file) {
                        Button("DOWNLOAD ORIGINALS", systemImage: "arrow.down.circle") { pc.download(entries.filter { selected.contains($0.id) }.compactMap(\.remote),library:library) }.disabled(offline)
                    }
                }
                if entries.contains(where: { selected.contains($0.id) && $0.local != nil }) {
                    MusicMenuSection(group: .destructive) {
                        Button("REMOVE PHONE COPIES",systemImage:"trash",role:.destructive) {
                            let songs = entries.filter { selected.contains($0.id) }.compactMap(\.local)
                            confirmation.confirm("Убрать копии с iPhone?", message: "Файлов: \(songs.count). Они будут перенесены в корзину iPhone. Доступна UNDO DELETE до очистки корзины. Файлы на ПК не изменятся; воспроизведение выбранной копии остановится.", actionTitle: "REMOVE PHONE COPIES") {
                                Task { await library.removeCopies(songs); player.forgetFiles(Set(songs.map(\.id))) }; selected = []
                            }
                        }
                    }
                }
            } label: { Text("SELECTION ACTIONS").frame(minHeight: 44).contentShape(Rectangle()) }.menuOrder(.fixed).disabled(selected.isEmpty)
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
        if !Task.isCancelled {
            entries = result
            selected.formIntersection(Set(result.map(\.id)))
        }
    }
}

struct DownloadStatus: View {
    @EnvironmentObject private var downloads: BackgroundDownloads
    var body: some View {
        if !downloads.records.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Очередь загрузок · \(downloads.records.count)").font(.headline).monospacedDigit()
                DownloadQueueControls()
                NavigationLink { DownloadsView() } label: {
                    Label("OPEN DOWNLOADS", systemImage: "arrow.down.circle").frame(minHeight: 44)
                }
            }.padding(16).modifier(GlassSurface())
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
