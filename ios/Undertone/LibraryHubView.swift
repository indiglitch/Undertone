import SwiftUI

struct LibraryHubView: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var personal: PersonalLibrary
    @State private var filter = "Всё"
    @State private var query = ""
    @State private var creating = false
    private func matches(_ name: String) -> Bool { query.isEmpty || name.localizedCaseInsensitiveContains(query) }
    private var playlists: [PCPlaylist] { pc.collections.playlists.filter { matches($0.name) }.sorted { a,b in
        let first = personal.state.pins.contains(a.id), second = personal.state.pins.contains(b.id)
        return first == second ? a.name.localizedStandardCompare(b.name) == .orderedAscending : first
    } }
    var body: some View {
        List {
            Section {
                HStack(spacing:6) { ForEach(["Всё","Плейлисты","Альбомы","Исполнители"],id: \.self) { name in
                    Button(name) { filter = name }.font(.caption).lineLimit(1).minimumScaleFactor(0.8).frame(maxWidth:.infinity,minHeight:44)
                        .background(filter == name ? Color.undertone.opacity(0.25) : .white.opacity(0.06),in:Capsule()).buttonStyle(.plain)
                } }
                NavigationLink { MusicLibraryView(showRoot:false).navigationTitle("Все треки") } label: { Label("Все треки",systemImage:"music.note") }
                NavigationLink { MusicLibraryView(favoritesOnly:true).navigationTitle("Любимые треки") } label: { Label("Любимые треки",systemImage:"heart") }
            }
            if filter == "Всё" || filter == "Плейлисты" { Section("Плейлисты") {
                ForEach(playlists) { SharedPlaylistLink(playlist:$0) }
                Button("Создать плейлист",systemImage:"plus") { creating = true }
            } }
            if filter == "Всё" || filter == "Альбомы" { Section("Сохранённые альбомы") {
                ForEach(personal.state.albums.filter(matches).sorted(),id:\.self) { SharedAlbumLink(name:$0) }
                if personal.state.albums.isEmpty { Text("Сохрани альбом через его меню").font(.caption).foregroundStyle(.secondary) }
            } }
            if filter == "Всё" || filter == "Исполнители" { Section("Исполнители") {
                ForEach(personal.state.artists.filter(matches).sorted(),id:\.self) { name in NavigationLink { MusicLibraryView(artist:name).navigationTitle(name) } label: { Label(name,systemImage:"person") } }
            } }
        }.listStyle(.plain).scrollContentBackground(.hidden).scrollDismissesKeyboard(.interactively)
            .searchable(text:$query,prompt:"Поиск в библиотеке")
            .sheet(isPresented:$creating) { CreateMusicView() }
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
                Button("Создать плейлист") {
                    pc.edit(PCEdit(kind:"create_playlist",playlist:UUID().uuidString.replacingOccurrences(of:"-",with:"").lowercased(),name:name.trimmingCharacters(in:.whitespacesAndNewlines)))
                    dismiss()
                }.disabled(name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || name.count > 120)
            }.navigationTitle("Новый плейлист").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement:.topBarTrailing) { Button("Закрыть") { dismiss() } } }
        }.presentationDetents([.medium])
    }
}

struct MobileSearchView: View {
    @EnvironmentObject private var personal: PersonalLibrary
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var pc: PCConnection
    @State private var query = ""
    @State private var filter = "Песни"
    @FocusState private var searchFocused: Bool
    private var albumNames: [String] { Set(pc.albums.keys).union(library.albums.keys).filter { query.isEmpty || $0.localizedCaseInsensitiveContains(query) }.sorted() }
    private var artists: [String] { Set(pc.tracks.map(\.artist)).union(library.songs.map(\.artist)).filter { query.isEmpty || $0.localizedCaseInsensitiveContains(query) }.sorted() }
    var body: some View {
        VStack(spacing: 0) {
            HStack { Image(systemName: "magnifyingglass"); TextField("Песня, альбом, исполнитель", text: $query).accessibilityIdentifier("musicSearchField").focused($searchFocused).submitLabel(.search).onSubmit { personal.rememberSearch(query); searchFocused = false }; if !query.isEmpty { Button("Очистить", systemImage: "xmark.circle.fill") { query = "" }.labelStyle(.iconOnly) } }.padding(12).background(.white.opacity(0.06),in: RoundedRectangle(cornerRadius: 14)).padding(.horizontal)
            HStack(spacing: 6) {
                ForEach(["Песни", "Альбомы", "Исполнители", "Плейлисты"], id: \.self) { name in
                    Button { searchFocused = false; filter = name } label: {
                        Text(name).font(.caption.weight(.medium)).lineLimit(1).minimumScaleFactor(0.85)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(filter == name ? Color.undertone.opacity(0.25) : .white.opacity(0.06), in: Capsule())
                    }.buttonStyle(.plain).accessibilityAddTraits(filter == name ? .isSelected : [])
                }
            }.padding(.horizontal, 16).padding(.vertical, 12)
            if query.isEmpty && !personal.state.searches.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) { HStack { ForEach(personal.state.searches, id: \.self) { text in Button(text) { query = text }.font(.caption).buttonStyle(.bordered) }; Button("Очистить историю") { personal.update { $0.searches = [] } } }.padding(.horizontal) }
            }
            if filter == "Песни" { MusicLibraryView(showRoot: false, externalQuery: query) }
            else {
                List {
                    if filter == "Альбомы" { ForEach(albumNames, id: \.self) { SharedAlbumLink(name:$0) } }
                    if filter == "Исполнители" { ForEach(artists, id: \.self) { name in NavigationLink { MusicLibraryView(artist: name).navigationTitle(name) } label: { Label(name,systemImage:"person") } } }
                    if filter == "Плейлисты" {
                        ForEach(pc.collections.playlists.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) }) { SharedPlaylistLink(playlist:$0) }
                    }
                }.listStyle(.plain).scrollContentBackground(.hidden)
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .onDisappear { searchFocused = false }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Готово") { personal.rememberSearch(query); searchFocused = false }.buttonStyle(.borderedProminent).controlSize(.small).tint(.undertone).padding(.bottom,6).accessibilityIdentifier("dismissSearchKeyboard")
            }
        }
    }
}

struct RecentListeningView: View {
    @EnvironmentObject private var personal: PersonalLibrary
    var body: some View { MusicLibraryView(downloadsOnly: true, orderedIDs: personal.state.recents, showRoot: false).navigationTitle("Недавно слушали") }
}

private struct LibraryPinSwipe: ViewModifier {
    @EnvironmentObject private var personal: PersonalLibrary
    let id: String
    func body(content: Content) -> some View { content.swipeActions(edge:.leading) { Button { personal.togglePin(id) } label: { Label(personal.state.pins.contains(id) ? "Открепить" : "Закрепить",systemImage:"pin") }.tint(.undertone) } }
}
