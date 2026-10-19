import SwiftUI

struct MobileSearchView: View {
    @EnvironmentObject private var personal: PersonalLibrary
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var pc: PCConnection
    @Environment(\.dynamicTypeSize) private var typeSize
    @AppStorage("librarySort") private var sort = LibrarySort.title.rawValue
    @State private var query = ""
    @State private var filter: MobileSearchFilter = .songs
    @State private var results: MobileSearchResults?
    @FocusState private var searchFocused: Bool
    private let topAnchor = "mobileSearchTop"

    private var request: MobileSearchRequest {
        MobileSearchRequest(query: query, filter: filter,
                            libraryRevision: filter == .playlists ? 0 : library.revision,
                            catalogRevision: filter == .playlists ? 0 : pc.catalogRevision,
                            collectionsRevision: filter == .playlists ? pc.collectionsRevision : 0,
                            sort: filter == .songs ? sort : "")
    }
    private var currentResults: MobileSearchResults? { results?.request == request ? results : nil }

    var body: some View {
        VStack(spacing: 0) {
            searchField
            filters
            ScrollViewReader { proxy in
                List {
                    listHeading.id(topAnchor).listRowSeparator(.hidden)
                    if request.isEmpty {
                        history
                    } else if let currentResults {
                        matches(currentResults)
                    } else {
                        ProgressView("Поиск в библиотеке…")
                            .frame(maxWidth: .infinity, minHeight: 88)
                            .accessibilityIdentifier("searchInProgress")
                            .listRowSeparator(.hidden)
                    }
                }
                .listStyle(.plain).modifier(SoftScrollEdges()).scrollContentBackground(.hidden)
                .scrollDismissesKeyboard(.interactively)
                // A new query/filter starts at the first result. Back, focus,
                // playback ticks and tab switches don't reset this list.
                .onChange(of: query) { _, _ in proxy.scrollTo(topAnchor, anchor: .top) }
                .onChange(of: filter) { _, _ in proxy.scrollTo(topAnchor, anchor: .top) }
                .modifier(SearchRefresh(enabled: filter == .songs && !request.isEmpty) {
                    await pc.migratePlaylists(personal, library: library)
                    await pc.refresh()
                })
            }
        }
        .onDisappear { searchFocused = false }
        .task(id: request) { await find(request) }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button { submit() } label: {
                    Text("DONE").font(.caption.weight(.semibold))
                        .frame(minWidth: 64, minHeight: 44)
                        .background(Color.undertone, in: Capsule()).foregroundStyle(.white)
                        .contentShape(Capsule())
                }
                    .buttonStyle(PressFeedbackStyle())
                    .accessibilityIdentifier("dismissSearchKeyboard")
            }
        }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary).accessibilityHidden(true)
            TextField("Песня, альбом, исполнитель, плейлист", text: $query)
                .accessibilityLabel("Поиск музыки").accessibilityIdentifier("musicSearchField")
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .focused($searchFocused).submitLabel(.search).onSubmit { submit() }
                .frame(minHeight: 44)
            if !query.isEmpty {
                Button { query = ""; searchFocused = true } label: {
                    Image(systemName: "xmark.circle.fill").frame(width: 44, height: 44).contentShape(Rectangle())
                }
                .accessibilityLabel("CLEAR QUERY").accessibilityIdentifier("clearMusicSearch")
                .buttonStyle(PressFeedbackStyle())
            }
        }
        .padding(.leading, 12).padding(.trailing, query.isEmpty ? 12 : 0)
        .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal, 16)
    }

    private var filters: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: typeSize.isAccessibilitySize ? 2 : 4), spacing: 6) {
            ForEach(MobileSearchFilter.allCases) { item in
                Button { searchFocused = false; filter = item } label: {
                    Text(item.rawValue).font(.caption.weight(filter == item ? .semibold : .medium))
                        .lineLimit(1).minimumScaleFactor(0.85)
                        .padding(.horizontal, 4).frame(maxWidth: .infinity, minHeight: 44)
                        .foregroundStyle(filter == item ? Color.primary : .secondary)
                        .background(filter == item ? Color.undertone.opacity(0.28) : .white.opacity(0.06), in: Capsule())
                        .overlay(Capsule().strokeBorder(filter == item ? Color.undertone : .clear, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(PressFeedbackStyle())
                .accessibilityAddTraits(filter == item ? .isSelected : [])
                .accessibilityValue(filter == item ? "SELECTED" : "")
            }
        }.padding(.horizontal, 16).padding(.vertical, 8)
    }

    private var listHeading: some View {
        HStack(spacing: 8) {
            Text(request.isEmpty ? "SEARCH HISTORY" : "RESULTS")
                .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            Spacer(minLength: 4)
            if request.isEmpty && !personal.state.searches.isEmpty {
                Button { personal.update { $0.searches = [] } } label: {
                    Text("CLEAR HISTORY").font(.caption).frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                }
                    .buttonStyle(PressFeedbackStyle()).accessibilityIdentifier("clearSearchHistory")
            } else if let currentResults, !request.isEmpty {
                Text("\(currentResults.count)").font(.caption).monospacedDigit().foregroundStyle(.secondary)
            }
        }.frame(minHeight: 44)
    }

    @ViewBuilder private var history: some View {
        if personal.state.searches.isEmpty {
            ContentUnavailableView("Найди свою музыку", systemImage: "magnifyingglass",
                                   description: Text("Введи название песни, альбома, исполнителя или плейлиста. Поиск работает по библиотеке iPhone и сохранённому каталогу ПК."))
                .accessibilityIdentifier("searchEmptyQuery").listRowSeparator(.hidden)
        } else {
            ForEach(personal.state.searches, id: \.self) { text in
                HStack(spacing: 8) {
                    Button { query = text; personal.rememberSearch(text); searchFocused = false } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "clock.arrow.circlepath").foregroundStyle(.secondary)
                            Text(text).lineLimit(2).multilineTextAlignment(.leading)
                            Spacer(minLength: 0)
                        }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle())
                    }.accessibilityIdentifier("searchHistory_" + text)
                    Button { personal.update { $0.searches.removeAll { $0 == text } } } label: {
                        Image(systemName: "xmark").foregroundStyle(.secondary).frame(width: 44, height: 44).contentShape(Rectangle())
                    }.accessibilityLabel("Удалить запрос: " + text)
                }.buttonStyle(PressFeedbackStyle())
            }
        }
    }

    @ViewBuilder private func matches(_ result: MobileSearchResults) -> some View {
        if filter == .songs && !library.removed.isEmpty {
            Button { Task { await library.undoRemoval() } } label: {
                Label("UNDO DELETE", systemImage: "arrow.uturn.backward").frame(minHeight: 44).contentShape(Rectangle())
            }
        }
        if result.count == 0 {
            ContentUnavailableView("Ничего не найдено", systemImage: "magnifyingglass",
                                   description: Text("Попробуй другое название или фильтр. Поиск использует только доступную библиотеку и сохранённый каталог ПК."))
                .accessibilityIdentifier("searchNoMatches").listRowSeparator(.hidden)
        } else {
            switch filter {
            case .songs:
                ForEach(result.songs) { track in
                    UnifiedTrackRow(track: track, queue: result.songs.map(\.song))
                        .listRowInsets(EdgeInsets(top: 0, leading: 10, bottom: 0, trailing: 10))
                }
            case .albums:
                ForEach(result.albums, id: \.self) { SharedAlbumLink(name: $0) }
            case .artists:
                ForEach(result.artists, id: \.self) { name in
                    NavigationLink { MusicLibraryView(artist: name).navigationTitle(name) } label: {
                        Label(name, systemImage: "person").lineLimit(2).frame(minHeight: 44)
                    }
                }
            case .playlists:
                ForEach(result.playlists) { SharedPlaylistLink(playlist: $0) }
            }
        }
    }

    private func submit() {
        personal.rememberSearch(query)
        searchFocused = false
    }

    private func find(_ requested: MobileSearchRequest) async {
        guard !Task.isCancelled, requested == request else { return }
        guard !requested.isEmpty else { results = nil; return }
        do { try await Task.sleep(for: .milliseconds(180)) } catch { return }
        guard !Task.isCancelled else { return }
        let local = library.songs, remote = pc.tracks
        let albums: Set<String> = requested.filter == .albums ? Set(library.albums.keys).union(pc.albums.keys) : []
        let playlists = requested.filter == .playlists ? pc.collections.playlists : []
        let found = await Task.detached(priority: .userInitiated) {
            MobileSearchResults.find(requested, local: local, remote: remote, albumNames: albums, playlists: playlists)
        }.value
        guard !Task.isCancelled, requested == request else { return }
        results = found
    }
}

// Preserve the existing Songs pull-to-refresh without introducing network
// search or adding it to the other filters / history.
private struct SearchRefresh: ViewModifier {
    let enabled: Bool
    let refresh: () async -> Void
    @ViewBuilder func body(content: Content) -> some View {
        if enabled { content.refreshable { await refresh() } }
        else { content }
    }
}
