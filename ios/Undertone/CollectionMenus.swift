import SwiftUI

struct PlaylistContextMenu: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var personal: PersonalLibrary
    let playlist: PCPlaylist
    let edit: () -> Void
    private func entries() -> [UnifiedTrack] { TrackCatalog.merged(local:library.songs,remote:pc.tracks,order:playlist.tracks) }
    var body: some View {
        Button("PLAY",systemImage:"play.fill") { play(entries()) }
        Button("SHUFFLE",systemImage:"shuffle") { play(entries(),shuffle:true) }
        Button("DOWNLOAD ORIGINALS",systemImage:"arrow.down.circle") { pc.download(entries().compactMap(\.remote),library:library) }
        Button(personal.state.pins.contains(playlist.id) ? "UNPIN" : "PIN",systemImage:"pin") { personal.togglePin(playlist.id) }
        Button("EDIT PLAYLIST",systemImage:"pencil") { edit() }
        ShareLink(item:MusicLinks.make("playlist",playlist.id)) { Label("SHARE",systemImage:"square.and.arrow.up") }
        Button("DELETE PLAYLIST",systemImage:"trash",role:.destructive) { pc.edit(PCEdit(kind:"delete_playlist",playlist:playlist.id)) }
    }
    private func play(_ source: [UnifiedTrack], shuffle: Bool = false) { if let first = shuffle ? source.randomElement() : source.first { Task { await player.play(first.song,queue:source.map(\.song),repository:library.repository,shuffle:shuffle) } } }
}
struct AlbumContextMenu: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var personal: PersonalLibrary
    let name: String
    private func entries() -> [UnifiedTrack] { TrackCatalog.merged(local:library.songs.filter { $0.artist + " — " + $0.album == name },remote:pc.albums[name] ?? [],albumOrder:true) }
    var body: some View {
        Button("PLAY",systemImage:"play.fill") { play(entries()) }
        Button("SHUFFLE",systemImage:"shuffle") { play(entries(),shuffle:true) }
        Button("DOWNLOAD ORIGINALS",systemImage:"arrow.down.circle") { pc.download(entries().compactMap(\.remote),library:library) }
        Button(personal.state.albums.contains(name) ? "REMOVE FROM LIBRARY" : "SAVE ALBUM",systemImage:"square.stack") { personal.update { if !$0.albums.insert(name).inserted { $0.albums.remove(name) } } }
        Button(personal.state.pins.contains("album:" + name) ? "UNPIN" : "PIN",systemImage:"pin") { personal.togglePin("album:" + name) }
        ShareLink(item:MusicLinks.make("album",name)) { Label("SHARE",systemImage:"square.and.arrow.up") }
    }
    private func play(_ source: [UnifiedTrack], shuffle: Bool = false) { if let first = shuffle ? source.randomElement() : source.first { Task { await player.play(first.song,queue:source.map(\.song),repository:library.repository,shuffle:shuffle) } } }
}
struct SharedPlaylistLink: View {
    let playlist: PCPlaylist
    @State private var editing = false
    var body: some View {
        HStack {
            NavigationLink { MusicLibraryView(playlistID:playlist.id).navigationTitle(playlist.name) } label: { Label(playlist.name,systemImage:"music.note.list").lineLimit(2).frame(maxWidth:.infinity,alignment:.leading) }
            Menu { PlaylistContextMenu(playlist:playlist) { editing = true } } label: { Image(systemName:"ellipsis").frame(width:44,height:44) }.accessibilityLabel("Меню " + playlist.name)
        }.contextMenu { PlaylistContextMenu(playlist:playlist) { editing = true } }
            .sheet(isPresented:$editing) { PlaylistEditorView(id:playlist.id,isPC:true) }
    }
}
struct SharedAlbumLink: View {
    let name: String
    var body: some View {
        HStack {
            NavigationLink { MusicLibraryView(album:name).navigationTitle(name) } label: { Label(name,systemImage:"square.stack").lineLimit(2) }
            Menu { AlbumContextMenu(name:name) } label: { Image(systemName:"ellipsis").frame(width:44,height:44) }.accessibilityLabel("Меню " + name)
        }.contextMenu { AlbumContextMenu(name:name) }
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
                Menu { AlbumContextMenu(name:name) } label: { Image(systemName:"ellipsis").frame(width:44,height:44) }.accessibilityLabel("Меню альбома " + name)
            }
        }.frame(width:116,alignment:.leading).contextMenu { AlbumContextMenu(name:name) }
    }
}
