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
    @State private var description = ""
    @State private var coverImport = false
    @State private var coverRevision = 0
    private var coverID: String { id.replacingOccurrences(of:"-",with:"").lowercased() }
    private func title(_ identity: String) -> String { library.songs.first(where: { $0.id == identity || $0.sourceIDs.contains(identity) })?.title ?? pc.tracks.first(where: { $0.id == identity })?.title ?? "Недоступный трек" }
    var body: some View {
        NavigationStack {
            List {
                Section("Обложка на iPhone") {
                    HStack { CoverArtwork(id:coverID,size:72).id(coverRevision); Button("Выбрать изображение") { coverImport = true } }
                }
                Section("Описание") { TextField("Описание",text:$description,axis:.vertical) }
                Section("Треки · \(order.count)") {
                    ForEach(Array(order.enumerated()),id:\.offset) { _,track in Text(title(track)) }
                    .onDelete { order.remove(atOffsets:$0) }
                    .onMove { order.move(fromOffsets:$0,toOffset:$1) }
                    if order.isEmpty { Text("Добавь треки из меню песни").foregroundStyle(.secondary) }
                }
            }.environment(\.editMode,.constant(.active))
            .navigationTitle("Редактировать плейлист").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement:.topBarLeading) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement:.topBarTrailing) { Button("Сохранить") {
                    if isPC {
                        if order != baseline { pc.edit(PCEdit(kind:"replace_tracks",playlist:id,tracks:order,expected_tracks:baseline)) }
                        pc.edit(PCEdit(kind:"describe_playlist",playlist:id,description:description))
                    } else { personal.update { if let index = $0.playlists.firstIndex(where: { $0.id == id }) { $0.playlists[index].tracks = order; $0.playlists[index].description = description } } }
                    dismiss()
                }.disabled(description.count > 2000) }
            }
            .onAppear {
                if isPC { order = pc.collections.playlists.first(where: { $0.id == id })?.tracks ?? []; description = pc.collections.playlists.first(where: { $0.id == id })?.description ?? "" }
                else { order = personal.state.playlists.first(where: { $0.id == id })?.tracks ?? []; description = personal.state.playlists.first(where: { $0.id == id })?.description ?? "" }
                baseline = order
            }
            .fileImporter(isPresented:$coverImport,allowedContentTypes:[.image]) { result in Task { do {
                let url = try result.get(), access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
                let size = try url.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? 0; guard size <= 8*1024*1024 else { throw PCError.rejected }
                let data = try await Task.detached { try Data(contentsOf:url) }.value
                try await CoverStore.shared.install(data,id:coverID); coverRevision += 1
            } catch { personal.error = error.localizedDescription } } }
        }
    }
}
