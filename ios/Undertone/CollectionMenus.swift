import SwiftUI

struct PlaylistContextMenu: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var personal: PersonalLibrary
    @EnvironmentObject private var confirmation: MenuConfirmationCoordinator
    @AppStorage("offlineMode") private var offline = false
    let playlist: PCPlaylist
    let edit: () -> Void
    private func entries() -> [UnifiedTrack] { TrackCatalog.merged(local:library.songs,remote:pc.tracks,order:playlist.tracks) }
    var body: some View {
        let source = entries()
        if !source.isEmpty {
            MusicMenuSection(group: .playback) {
                Button("PLAY",systemImage:"play.fill") { play(entries()) }
                if source.count > 1 { Button("SHUFFLE",systemImage:"shuffle") { play(entries(),shuffle:true) } }
            }
        }
        MusicMenuSection(group: .library) {
            Button("EDIT PLAYLIST",systemImage:"pencil") { edit() }
            Button(personal.state.pins.contains(playlist.id) ? "UNPIN" : "PIN",systemImage:personal.state.pins.contains(playlist.id) ? "pin.slash" : "pin") { personal.togglePin(playlist.id) }
        }
        MusicMenuSection(group: .file) {
            if source.contains(where: { $0.remote != nil && $0.local == nil }) {
                Button("DOWNLOAD PLAYLIST",systemImage:"arrow.down.circle") { pc.download(entries().compactMap(\.remote),library:library) }
                    .disabled(offline).accessibilityIdentifier("downloadPlaylist")
            }
            ShareLink(item:MusicLinks.make("playlist",playlist.id)) { Label("SHARE PLAYLIST",systemImage:"square.and.arrow.up") }
        }
        MusicMenuSection(group: .destructive) {
            Button("DELETE PLAYLIST",systemImage:"trash",role:.destructive) {
                let id = playlist.id
                confirmation.confirm("Удалить плейлист?", message: playlist.name + "\nСостав и описание плейлиста будут удалены и синхронизированы с ПК. Музыкальные файлы сохранятся.", actionTitle: "DELETE PLAYLIST") {
                    pc.edit(PCEdit(kind:"delete_playlist",playlist:id))
                }
            }
        }
    }
    private func play(_ source: [UnifiedTrack], shuffle: Bool = false) { guard !source.isEmpty, !shuffle || source.count > 1 else { ActionFeedback.failed(); return }; if let first = shuffle ? source.randomElement() : source.first { Task { await player.play(first.song,queue:source.map(\.song),repository:library.repository,shuffle:shuffle) } } }
}
struct AlbumContextMenu: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var personal: PersonalLibrary
    @EnvironmentObject private var confirmation: MenuConfirmationCoordinator
    @AppStorage("offlineMode") private var offline = false
    let name: String
    private var saved: Bool { personal.state.albums.contains(name) }
    private func entries() -> [UnifiedTrack] { TrackCatalog.merged(local:library.songs.filter { $0.artist + " — " + $0.album == name },remote:pc.albums[name] ?? [],albumOrder:true) }
    var body: some View {
        let source = entries()
        if !source.isEmpty {
            MusicMenuSection(group: .playback) {
                Button("PLAY",systemImage:"play.fill") { play(entries()) }
                if source.count > 1 { Button("SHUFFLE",systemImage:"shuffle") { play(entries(),shuffle:true) } }
            }
        }
        MusicMenuSection(group: .library) {
            if !saved { Button("SAVE ALBUM",systemImage:"square.stack.badge.plus") { toggleAlbum() } }
            Button(personal.state.pins.contains("album:" + name) ? "UNPIN" : "PIN",systemImage:personal.state.pins.contains("album:" + name) ? "pin.slash" : "pin") { personal.togglePin("album:" + name) }
        }
        MusicMenuSection(group: .file) {
            if source.contains(where: { $0.remote != nil && $0.local == nil }) {
                Button("DOWNLOAD ORIGINALS",systemImage:"arrow.down.circle") { pc.download(entries().compactMap(\.remote),library:library) }.disabled(offline)
            }
            ShareLink(item:MusicLinks.make("album",name)) { Label("SHARE ALBUM",systemImage:"square.and.arrow.up") }
        }
        if saved {
            MusicMenuSection(group: .destructive) {
                Button("REMOVE FROM LIBRARY",systemImage:"minus.circle",role:.destructive) {
                    confirmation.confirm("Убрать альбом из Library?", message: name + "\nБудет удалена только запись сохранённого альбома. Треки, плейлисты и файлы сохранятся.", actionTitle: "REMOVE FROM LIBRARY") {
                        personal.update { $0.albums.remove(name) }
                    }
                }
            }
        }
    }
    private func toggleAlbum() { personal.update { if !$0.albums.insert(name).inserted { $0.albums.remove(name) } } }
    private func play(_ source: [UnifiedTrack], shuffle: Bool = false) { guard !source.isEmpty, !shuffle || source.count > 1 else { ActionFeedback.failed(); return }; if let first = shuffle ? source.randomElement() : source.first { Task { await player.play(first.song,queue:source.map(\.song),repository:library.repository,shuffle:shuffle) } } }
}
struct SharedPlaylistLink: View {
    @Environment(\.compactCollectionRows) private var compact
    let playlist: PCPlaylist
    @State private var editing = false
    var body: some View {
        HStack {
            NavigationLink { MusicLibraryView(playlistID:playlist.id).navigationTitle(playlist.name) } label: {
                if compact { CollectionRowLabel(title: playlist.name, icon: "music.note.list", artworkID: playlist.id.replacingOccurrences(of: "-", with: "").lowercased(), showsArtwork: true) }
                else { Label(playlist.name,systemImage:"music.note.list").lineLimit(2).frame(maxWidth:.infinity,alignment:.leading) }
            }
            Menu { PlaylistContextMenu(playlist:playlist) { editing = true } } label: { MusicMenuLabel() }.buttonStyle(.borderless).accessibilityLabel("Меню " + playlist.name)
        }.contextMenu { PlaylistContextMenu(playlist:playlist) { editing = true } }.menuOrder(.fixed)
            .sheet(isPresented:$editing) { PlaylistEditorView(id:playlist.id,isPC:true) }
    }
}
struct SharedAlbumLink: View {
    @Environment(\.compactCollectionRows) private var compact
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var pc: PCConnection
    let name: String
    private var first: UnifiedTrack? { library.albums[name]?.first.map(UnifiedTrack.init) ?? pc.albums[name]?.first.map { UnifiedTrack($0, local: nil) } }
    var body: some View {
        HStack {
            NavigationLink { MusicLibraryView(album:name).navigationTitle(name) } label: {
                if compact { CollectionRowLabel(title: name, icon: "square.stack", artworkID: first?.id, remote: first?.remote, showsArtwork: true) }
                else { Label(name,systemImage:"square.stack").lineLimit(2) }
            }
            Menu { AlbumContextMenu(name:name) } label: { MusicMenuLabel() }.buttonStyle(.borderless).accessibilityLabel("Меню " + name)
        }.contextMenu { AlbumContextMenu(name:name) }.menuOrder(.fixed)
    }
}

struct AlbumTile: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var pc: PCConnection
    let name: String
    private var first: UnifiedTrack? { library.albums[name]?.first.map(UnifiedTrack.init) ?? pc.albums[name]?.first.map { UnifiedTrack($0,local:nil) } }
    var body: some View {
        VStack(alignment:.leading,spacing:4) {
            NavigationLink { MusicLibraryView(album:name).navigationTitle(first?.song.album ?? name) } label: {
                VStack(alignment:.leading,spacing:6) {
                    CoverArtwork(id:first?.id,size:116,remote:first?.remote)
                    Text(first?.song.album ?? name).font(.subheadline.weight(.semibold)).lineLimit(2)
                }
            }.buttonStyle(PressFeedbackStyle())
            HStack(spacing:0) {
                Text(first?.song.artist ?? "").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                Spacer(minLength:0)
                Menu { AlbumContextMenu(name:name) } label: { MusicMenuLabel() }.buttonStyle(.borderless).accessibilityLabel("Меню альбома " + name)
            }
        }.frame(width:116,alignment:.leading).contextMenu { AlbumContextMenu(name:name) }.menuOrder(.fixed)
    }
}
