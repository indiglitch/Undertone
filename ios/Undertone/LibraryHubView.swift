import SwiftUI

struct LibraryHubView: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var personal: PersonalLibrary
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var filter = "Всё"
    init(initialFilter: String = "Всё") { _filter = State(initialValue: initialFilter) }
    @State private var query = ""
    @State private var creating = false
    private func matches(_ name: String) -> Bool { query.isEmpty || name.localizedCaseInsensitiveContains(query) }
    private var playlists: [PCPlaylist] {
        pc.collections.playlists.filter { matches($0.name) }.sorted { a, b in
            let first = personal.state.pins.contains(a.id), second = personal.state.pins.contains(b.id)
            if first != second { return first }
            let order = a.name.localizedStandardCompare(b.name)
            return order == .orderedSame ? a.id < b.id : order == .orderedAscending
        }
    }
    private var albums: [String] { personal.state.albums.filter(matches).sorted() }
    private var artists: [String] { personal.state.artists.filter(matches).sorted() }
    var body: some View {
        VStack(spacing: 0) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: typeSize.isAccessibilitySize ? 2 : 4), spacing: 6) {
                ForEach(["Всё", "Плейлисты", "Альбомы", "Исполнители"], id: \.self) { name in
                    Button { filter = name } label: {
                        Text(["Всё":"ALL", "Альбомы":"ALBUMS", "Исполнители":"ARTISTS", "Плейлисты":"PLAYLISTS"][name] ?? name)
                            .font(.caption.weight(.medium)).lineLimit(1).minimumScaleFactor(0.8)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(filter == name ? Color.undertone.opacity(0.25) : .white.opacity(0.06), in: Capsule())
                            .contentShape(Capsule())
                    }.buttonStyle(PressFeedbackStyle()).accessibilityAddTraits(filter == name ? .isSelected : [])
                }
            }.padding(.horizontal, 12).padding(.vertical, 6)
            List {
                Section {
                    NavigationLink { MusicLibraryView(favoritesOnly: true).navigationTitle("LIKED TRACKS") } label: {
                        CollectionRowLabel(title: "LIKED TRACKS", icon: "heart.fill")
                    }.modifier(CollectionRowStyle())
                    NavigationLink { MusicLibraryView(showRoot: false).navigationTitle("ALL TRACKS") } label: {
                        CollectionRowLabel(title: "ALL TRACKS", icon: "music.note")
                    }.modifier(CollectionRowStyle())
                    NavigationLink { RecentListeningView() } label: {
                        CollectionRowLabel(title: "RECENTLY PLAYED", icon: "clock")
                    }.modifier(CollectionRowStyle())
                }
                if filter == "Всё" || filter == "Плейлисты" {
                    Section {
                        ForEach(playlists) { SharedPlaylistLink(playlist: $0).modifier(CollectionRowStyle()) }
                        if playlists.isEmpty {
                            if filter == "Всё" {
                                Text(query.isEmpty ? "Создай плейлист и добавь треки через меню песни." : "Плейлисты не найдены.")
                                    .font(.caption).foregroundStyle(.secondary).modifier(CollectionRowStyle())
                            } else { empty("Нет плейлистов", detail: "Создай плейлист и добавь треки через меню песни.") }
                        }
                        Button { creating = true } label: { CollectionRowLabel(title: "CREATE PLAYLIST", icon: "plus") }
                            .accessibilityIdentifier("libraryCreatePlaylist").modifier(CollectionRowStyle())
                    } header: { heading("PLAYLISTS · PINNED FIRST") }
                }
                if (filter == "Всё" && !albums.isEmpty) || filter == "Альбомы" {
                    Section {
                        ForEach(albums, id: \.self) { SharedAlbumLink(name: $0).modifier(CollectionRowStyle()) }
                        if albums.isEmpty { empty("Нет сохранённых альбомов", detail: "Сохрани альбом через его меню.") }
                    } header: { heading("ALBUMS · A–Z") }
                }
                if (filter == "Всё" && !artists.isEmpty) || filter == "Исполнители" {
                    Section {
                        ForEach(artists, id: \.self) { name in
                            NavigationLink { MusicLibraryView(artist: name).navigationTitle(name) } label: {
                                CollectionRowLabel(title: name, icon: "person")
                            }.modifier(CollectionRowStyle())
                        }
                        if artists.isEmpty { empty("Нет сохранённых исполнителей", detail: "Открыть исполнителя можно из трека или поиска.") }
                    } header: { heading("ARTISTS · A–Z") }
                }
            }.modifier(CollectionListStyle()).scrollDismissesKeyboard(.interactively).accessibilityIdentifier("libraryHubList")
        }
        .searchable(text: $query, prompt: "Поиск в библиотеке")
        .sheet(isPresented: $creating) { CreateMusicView() }
        .navigationBarTitleDisplayMode(.inline)
    }
    private func heading(_ title: String) -> some View {
        Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary).textCase(nil)
    }
    private func empty(_ title: String, detail: String) -> some View {
        CollectionEmptyView(title: query.isEmpty ? title : "Ничего не найдено", detail: query.isEmpty ? detail : "Попробуй другой запрос.")
            .modifier(CollectionRowStyle())
    }
}
struct CreateMusicView: View {
    @EnvironmentObject private var pc: PCConnection
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    var body: some View {
        NavigationStack {
            Form {
                TextField("Название",text:$name)
                Text("Единый плейлист для iPhone и ПК. Изменения сохраняются офлайн и синхронизируются при подключении.").font(.caption).foregroundStyle(.secondary)
                Button("CREATE PLAYLIST") {
                    pc.edit(PCEdit(kind:"create_playlist",playlist:UUID().uuidString.replacingOccurrences(of:"-",with:"").lowercased(),name:name.trimmingCharacters(in:.whitespacesAndNewlines)))
                    dismiss()
                }.disabled(name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || name.count > 120).accessibilityIdentifier("createPlaylistSubmit")
            }.modifier(SoftScrollEdges()).navigationTitle("Новый плейлист").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement:.topBarTrailing) { Button("CLOSE") { dismiss() } } }
        }.presentationDetents([.medium])
    }
}

struct RecentListeningView: View {
    @EnvironmentObject private var personal: PersonalLibrary
    var body: some View { MusicLibraryView(orderedIDs: personal.state.recents, showRoot: false, recent: true).navigationTitle("RECENTLY PLAYED") }
}

private struct LibraryPinSwipe: ViewModifier {
    @EnvironmentObject private var personal: PersonalLibrary
    let id: String
    func body(content: Content) -> some View { content.swipeActions(edge:.leading) { Button { personal.togglePin(id) } label: { Label(personal.state.pins.contains(id) ? "UNPIN" : "PIN",systemImage:"pin") }.tint(.undertone) } }
}

struct AllAlbumsView: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var pc: PCConnection
    @State private var query = ""
    private var names: [String] { Set(library.albums.keys).union(pc.albums.keys).filter { query.isEmpty || $0.localizedCaseInsensitiveContains(query) }.sorted() }
    var body: some View {
        List {
            ForEach(names,id:\.self) { SharedAlbumLink(name:$0).modifier(CollectionRowStyle()) }
            if names.isEmpty { CollectionEmptyView(title: query.isEmpty ? "Нет альбомов" : "Ничего не найдено", detail: query.isEmpty ? "Добавь музыку на iPhone или подключи ПК.": "Попробуй другой запрос.", icon: "square.stack") }
        }.modifier(CollectionListStyle())
            .searchable(text:$query,prompt:"Поиск альбомов").navigationTitle("ALBUMS").navigationBarTitleDisplayMode(.inline)
    }
}
