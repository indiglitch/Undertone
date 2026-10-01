import SwiftUI
import UniformTypeIdentifiers

struct LibraryHubView: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var personal: PersonalLibrary
    var folderID: String?
    @State private var filter = "Всё"
    @AppStorage("libraryGrid") private var grid = false
    @State private var query = ""
    @State private var creating = false
    @State private var renameID: String?
    @State private var rename = ""
    private var folders: [LibraryFolder] { personal.state.folders.filter { $0.parent == folderID && matches($0.name) }.sorted { ordered("folder:" + $0.id,$0.name,"folder:" + $1.id,$1.name) } }
    private func matches(_ name: String) -> Bool { query.isEmpty || name.localizedCaseInsensitiveContains(query) }
    private func ordered(_ a: String,_ titleA: String,_ b: String,_ titleB: String) -> Bool {
        let left = personal.state.pins.contains(a), right = personal.state.pins.contains(b)
        return left != right ? left : titleA.localizedStandardCompare(titleB) == .orderedAscending
    }
    var body: some View {
        List {
            if folderID == nil {
                Section {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack { ForEach(["Всё","Плейлисты","Альбомы","Исполнители"], id: \.self) { value in
                            Button(value) { filter = value }.buttonStyle(.bordered).tint(filter == value ? .undertone : .gray)
                        } }
                    }
                    NavigationLink { MusicLibraryView(favoritesOnly: true).navigationTitle("Любимые треки") } label: { Label("Любимые треки", systemImage: "heart.fill").foregroundStyle(Color.undertone) }
                    NavigationLink { MusicLibraryView(downloadsOnly: true, showRoot: false).navigationTitle("Скачано") } label: { Label("Скачано · \(library.songs.count)", systemImage: "arrow.down.circle") }
                    NavigationLink { MusicLibraryView(downloadsOnly: true, localFiles: true, showRoot: false).navigationTitle("Локальные файлы") } label: { Label("Локальные файлы", systemImage: "doc.badge.plus") }
                }
            }
            if filter == "Всё" || filter == "Плейлисты" || folderID != nil {
                Section("Папки") {
                    ForEach(folders) { folder in
                        NavigationLink { LibraryHubView(folderID: folder.id).navigationTitle(folder.name) } label: { entry(folder.name, id: "folder:" + folder.id, icon: "folder") }
                        .contextMenu {
                            pin("folder:" + folder.id)
                            Button("Переименовать") { rename = folder.name; renameID = folder.id }
                            Menu("Переместить") {
                                Button("В корень") { personal.update { _ = $0.moveFolder(folder.id, to: nil) } }
                                ForEach(personal.state.folders.filter { $0.id != folder.id }) { target in Button(target.name) { personal.update { _ = $0.moveFolder(folder.id, to: target.id) } } }
                            }
                            Button("Удалить папку", role: .destructive) { personal.update { $0.deleteFolder(folder.id) } }
                        }
                    }
                }
                Section("Плейлисты") {
                    ForEach(personal.state.playlists.filter { personal.state.playlistFolders[$0.id] == folderID && matches($0.name) }.sorted { ordered($0.id,$0.name,$1.id,$1.name) }) { playlist in
                        NavigationLink { PersonalPlaylistView(id: playlist.id).navigationTitle(playlist.name) } label: { entry(playlist.name, id: playlist.id, icon: "music.note.list") }
                        .contextMenu { pin(playlist.id); folderPicker(playlist.id) }
                    }
                    ForEach(pc.collections.playlists.filter { personal.state.playlistFolders[$0.id] == folderID && matches($0.name) }.sorted { ordered($0.id,$0.name,$1.id,$1.name) }) { playlist in
                        NavigationLink { MusicLibraryView(playlistID: playlist.id).navigationTitle(playlist.name) } label: { entry(playlist.name, id: playlist.id, icon: "desktopcomputer") }
                        .contextMenu { pin(playlist.id); folderPicker(playlist.id) }
                    }
                    Button("Создать", systemImage: "plus") { creating = true }
                }
            }
            if folderID == nil && (filter == "Всё" || filter == "Альбомы") {
                Section("Сохранённые альбомы") {
                    let albums = personal.state.albums.filter { matches($0) }.sorted { ordered("album:" + $0,$0,"album:" + $1,$1) }
                    if grid {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 130))], alignment: .leading, spacing: 18) {
                            ForEach(albums, id: \.self) { name in NavigationLink { MusicLibraryView(album: name).navigationTitle(name) } label: {
                                VStack(alignment: .leading) { CoverArtwork(id: library.albums[name]?.first.map { $0.syncID ?? $0.id } ?? pc.albums[name]?.first?.id, size: 120); Text(name).font(.caption).lineLimit(2) }
                            } }
                        }
                    } else { ForEach(albums, id: \.self) { name in NavigationLink { MusicLibraryView(album: name).navigationTitle(name) } label: { entry(name,id: "album:" + name, icon: "square.stack") }.contextMenu { pin("album:" + name) } } }
                    if albums.isEmpty { Text("Сохрани альбом со страницы альбома").font(.caption).foregroundStyle(.secondary) }
                }
            }
            if folderID == nil && (filter == "Всё" || filter == "Исполнители") {
                Section("Исполнители") { ForEach(personal.state.artists.filter { matches($0) }.sorted { ordered("artist:" + $0,$0,"artist:" + $1,$1) }, id: \.self) { name in
                    NavigationLink { MusicLibraryView(artist: name).navigationTitle(name) } label: { entry(name,id: "artist:" + name,icon: "person") }.contextMenu { pin("artist:" + name) }
                } }
            }
        }
        .listStyle(.plain).scrollContentBackground(.hidden)
        .searchable(text: $query, prompt: "Поиск в сохранённой библиотеке")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(grid ? "Список" : "Сетка", systemImage: grid ? "list.bullet" : "square.grid.2x2") { grid.toggle() } } }
        .sheet(isPresented: $creating) { CreateMusicView(parent: folderID) }
        .alert("Переименовать папку",isPresented:Binding(get:{renameID != nil},set:{if !$0 {renameID = nil}})) {
            TextField("Название",text:$rename)
            Button("Сохранить") { let title = rename.trimmingCharacters(in:.whitespacesAndNewlines); if !title.isEmpty, title.count <= 120 { personal.update { if let index = $0.folders.firstIndex(where:{$0.id == renameID}) { $0.folders[index].name = title } } }; renameID = nil }
            Button("Отмена",role:.cancel) { renameID = nil }
        }
    }
    private func entry(_ title: String,id: String,icon: String) -> some View {
        HStack { Label(title, systemImage: icon).lineLimit(2); Spacer(); if personal.state.pins.contains(id) { Image(systemName: "pin.fill").font(.caption).foregroundStyle(Color.undertone) } }.padding(.vertical, 6)
    }
    @ViewBuilder private func pin(_ id: String) -> some View { Button(personal.state.pins.contains(id) ? "Открепить" : "Закрепить", systemImage: "pin") { personal.togglePin(id) } }
    @ViewBuilder private func folderPicker(_ id: String) -> some View {
        Menu("В папку") {
            Button("В корень") { personal.update { $0.playlistFolders[id] = nil } }
            ForEach(personal.state.folders) { folder in Button(folder.name) { personal.update { $0.playlistFolders[id] = folder.id } } }
        }
    }
}

struct CreateMusicView: View {
    @EnvironmentObject private var personal: PersonalLibrary
    @Environment(\.dismiss) private var dismiss
    var parent: String?
    @State private var name = ""
    @State private var kind = "Плейлист"
    var body: some View {
        NavigationStack {
            Form {
                Picker("Создать", selection: $kind) { Text("Плейлист").tag("Плейлист"); Text("Папку").tag("Папка") }.pickerStyle(.segmented)
                TextField("Название", text: $name)
                Text("Папки и личные плейлисты хранятся на iPhone. Плейлисты компьютера синхронизируются отдельно.").font(.caption).foregroundStyle(.secondary)
                Button("Создать") {
                    let title = name.trimmingCharacters(in: .whitespacesAndNewlines)
                    personal.update {
                        if kind == "Папка" { $0.folders.append(LibraryFolder(name: title, parent: parent)) }
                        else { let playlist = PersonalPlaylist(name: title); $0.playlists.append(playlist); $0.playlistFolders[playlist.id] = parent }
                    }; dismiss()
                }.disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || name.count > 120)
            }.navigationTitle("Создать").toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Закрыть") { dismiss() } } }
        }.presentationDetents([.medium])
    }
}

struct PersonalPlaylistView: View {
    @EnvironmentObject private var personal: PersonalLibrary
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var pc: PCConnection
    let id: String
    @State private var editing = false
    @State private var name = ""
    @State private var description = ""
    @State private var confirmDelete = false
    @State private var editingTracks = false
    @Environment(\.dismiss) private var dismiss
    private var playlist: PersonalPlaylist? { personal.state.playlists.first { $0.id == id } }
    var body: some View {
        Group {
            if let playlist {
                MusicLibraryView(orderedIDs: playlist.tracks, showRoot: false, coverID:playlist.id.replacingOccurrences(of:"-",with:""),personalPlaylistID:playlist.id)
                    .safeAreaInset(edge: .top) { HStack {
                        Text(playlist.description).font(.caption).lineLimit(2)
                        Spacer()
                        Menu("Изменить", systemImage: "ellipsis") {
                            Button("Редактировать треки и обложку") { editingTracks = true }
                            Button("Название и описание") { name = playlist.name; description = playlist.description; editing = true }
                            Button("Удалить плейлист", role: .destructive) { confirmDelete = true }
                            ShareLink(item: playlist.name + "\n" + playlist.tracks.compactMap { id in library.songs.first(where: { $0.id == id || $0.sourceIDs.contains(id) })?.title ?? pc.tracks.first(where: { $0.id == id })?.title }.joined(separator: "\n")) { Label("Поделиться списком", systemImage: "square.and.arrow.up") }
                        }
                    }.padding(.horizontal) }
            } else { ContentUnavailableView("Плейлист удалён", systemImage: "music.note.list") }
        }
        .sheet(isPresented:$editingTracks) { PlaylistEditorView(id:id,isPC:false) }
        .sheet(isPresented: $editing) { NavigationStack { Form {
            TextField("Название", text: $name); TextField("Описание", text: $description, axis: .vertical)
            Button("Сохранить") { personal.update { if let index = $0.playlists.firstIndex(where: { $0.id == id }) { $0.playlists[index].name = name.trimmingCharacters(in: .whitespacesAndNewlines); $0.playlists[index].description = description } }; editing = false }.disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || name.count > 120)
        }.navigationTitle("Плейлист") } }
        .confirmationDialog("Удалить плейлист? Музыкальные файлы останутся на iPhone.", isPresented: $confirmDelete) { Button("Удалить", role: .destructive) { personal.update { $0.playlists.removeAll { $0.id == id }; $0.playlistFolders[id] = nil }; dismiss() } }
    }
}

struct MobileSearchView: View {
    @EnvironmentObject private var personal: PersonalLibrary
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var pc: PCConnection
    @State private var query = ""
    @State private var filter = "Песни"
    @State private var scanning = false
    @EnvironmentObject private var routes: RouteCoordinator
    private var albumNames: [String] { Set(pc.albums.keys).union(library.albums.keys).filter { query.isEmpty || $0.localizedCaseInsensitiveContains(query) }.sorted() }
    private var artists: [String] { Set(pc.tracks.map(\.artist)).union(library.songs.map(\.artist)).filter { query.isEmpty || $0.localizedCaseInsensitiveContains(query) }.sorted() }
    var body: some View {
        VStack(spacing: 0) {
            Button("Сканировать код Undertone",systemImage:"qrcode.viewfinder") { scanning = true }.font(.caption).padding(.bottom,8)
            HStack { Image(systemName: "magnifyingglass"); TextField("Песня, альбом, исполнитель", text: $query).submitLabel(.search).onSubmit { personal.rememberSearch(query) }; if !query.isEmpty { Button("Очистить", systemImage: "xmark.circle.fill") { query = "" }.labelStyle(.iconOnly) } }.padding(12).background(.white.opacity(0.06),in: RoundedRectangle(cornerRadius: 14)).padding(.horizontal)
            ScrollView(.horizontal, showsIndicators: false) { HStack { ForEach(["Песни","Альбомы","Исполнители","Плейлисты"], id: \.self) { name in Button(name) { filter = name }.buttonStyle(.bordered).tint(filter == name ? .undertone : .gray) } }.padding() }
            if query.isEmpty && !personal.state.searches.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) { HStack { ForEach(personal.state.searches, id: \.self) { text in Button(text) { query = text }.font(.caption).buttonStyle(.bordered) }; Button("Очистить историю") { personal.update { $0.searches = [] } } }.padding(.horizontal) }
            }
            if filter == "Песни" { MusicLibraryView(showRoot: false, externalQuery: query) }
            else {
                List {
                    if filter == "Альбомы" { ForEach(albumNames, id: \.self) { name in NavigationLink { MusicLibraryView(album: name).navigationTitle(name) } label: { Label(name,systemImage:"square.stack") } } }
                    if filter == "Исполнители" { ForEach(artists, id: \.self) { name in NavigationLink { MusicLibraryView(artist: name).navigationTitle(name) } label: { Label(name,systemImage:"person") } } }
                    if filter == "Плейлисты" {
                        ForEach(personal.state.playlists.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) }) { p in NavigationLink { PersonalPlaylistView(id:p.id).navigationTitle(p.name) } label: { Label(p.name,systemImage:"music.note.list") } }
                        ForEach(pc.collections.playlists.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) }) { p in NavigationLink { MusicLibraryView(playlistID:p.id).navigationTitle(p.name) } label: { Label(p.name,systemImage:"desktopcomputer") } }
                    }
                }.listStyle(.plain).scrollContentBackground(.hidden)
            }
        }.sheet(isPresented:$scanning) { QRScanner { code in scanning = false; if let url = URL(string:code) { routes.open(url) } }.ignoresSafeArea().overlay(alignment:.topTrailing) { Button("Закрыть") { scanning = false }.buttonStyle(.glass).padding(24) } }
    }
}

struct RecentListeningView: View {
    @EnvironmentObject private var personal: PersonalLibrary
    var body: some View { MusicLibraryView(downloadsOnly: true, orderedIDs: personal.state.recents, showRoot: false).navigationTitle("Недавно слушали") }
}
