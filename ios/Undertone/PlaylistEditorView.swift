import SwiftUI
import UniformTypeIdentifiers

struct PlaylistEditorView: View {
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var personal: PersonalLibrary
    @EnvironmentObject private var library: LibraryStore
    @Environment(\.dismiss) private var dismiss
    let id: String
    let isPC: Bool
    @State private var order: [String] = []
    @State private var baseline: [String] = []
    @State private var name = ""
    @State private var description = ""
    @State private var coverImport = false
    @State private var coverRevision = 0
    private var coverID: String { id.replacingOccurrences(of:"-",with:"").lowercased() }
    private func title(_ identity: String) -> String { library.songs.first(where: { $0.id == identity || $0.sourceIDs.contains(identity) })?.title ?? pc.tracks.first(where: { $0.id == identity })?.title ?? "Недоступный трек" }
    var body: some View {
        NavigationStack {
            List {
                Section("Обложка на iPhone") {
                    HStack { CoverArtwork(id:coverID,size:72).id(coverRevision); Button("CHOOSE IMAGE") { coverImport = true } }
                }
                Section("Плейлист") { TextField("Название",text:$name); TextField("Описание",text:$description,axis:.vertical) }
                Section("Треки · \(order.count)") {
                    ForEach(Array(order.enumerated()),id:\.offset) { _,identity in
                        if let item = TrackCatalog.merged(local:library.songs,remote:pc.tracks,order:[identity]).first { UnifiedTrackRow(track:item) }
                        else { Text("Недоступный трек").foregroundStyle(.secondary) }
                    }
                    .onDelete { order.remove(atOffsets:$0) }
                    .onMove { order.move(fromOffsets:$0,toOffset:$1) }
                    if order.isEmpty { Text("Добавь треки из меню песни").foregroundStyle(.secondary) }
                }
            }.modifier(SoftScrollEdges()).environment(\.editMode,.constant(.active))
            .navigationTitle("EDIT PLAYLIST").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement:.topBarLeading) { Button("CANCEL") { dismiss() } }
                ToolbarItem(placement:.topBarTrailing) { Button("SAVE") {
                    if order != baseline { pc.edit(PCEdit(kind:"replace_tracks",playlist:id,tracks:order,expected_tracks:baseline)) }
                    pc.edit(PCEdit(kind:"rename_playlist",playlist:id,name:name.trimmingCharacters(in:.whitespacesAndNewlines)))
                    pc.edit(PCEdit(kind:"describe_playlist",playlist:id,description:description))
                    dismiss()
                }.disabled(description.count > 2000 || name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || name.count > 120) }
            }
            .onAppear {
                let playlist = pc.collections.playlists.first { $0.id == id }
                order = playlist?.tracks ?? []; name = playlist?.name ?? ""; description = playlist?.description ?? ""
                baseline = order
            }
            .fileImporter(isPresented:$coverImport,allowedContentTypes:[.image]) { result in Task { do {
                let url = try result.get(), access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
                let size = try url.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? 0; guard size <= 8*1024*1024 else { throw PCError.rejected }
                let data = try await Task.detached { try Data(contentsOf:url) }.value
                try await CoverStore.shared.install(data,id:coverID); coverRevision += 1
            } catch { personal.error = error.localizedDescription } } }
        }.modifier(MusicModalScope())
    }
}
