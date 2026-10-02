import SwiftUI

struct PendingEditsView: View {
    @EnvironmentObject private var pc: PCConnection
    var body: some View {
        List {
            Section {
                Text("Эти изменения сохранены на iPhone. Они отправятся, когда ПК станет доступен. Если песня или плейлист удалены на ПК, отмени соответствующее изменение свайпом.")
                    .font(.subheadline).foregroundStyle(.secondary)
                Button("SYNC NOW", systemImage: "arrow.triangle.2.circlepath") { Task { await pc.syncCollections() } }
            }
            ForEach(pc.pendingEdits) { edit in
                VStack(alignment: .leading, spacing: 4) {
                    Text(title(edit))
                    if let track = edit.track, let song = pc.tracks.first(where: { $0.id == track }) { Text(song.title).font(.caption).foregroundStyle(.secondary) }
                    if let id = edit.playlist, let playlist = pc.collections.playlists.first(where: { $0.id == id }) { Text(playlist.name).font(.caption).foregroundStyle(.secondary) }
                }
                .swipeActions { Button("CANCEL", role: .destructive) { pc.discardEdit(edit.id) } }
            }
            if pc.pendingEdits.isEmpty { Label("Все изменения синхронизированы", systemImage: "checkmark.circle") }
        }.navigationTitle("Синхронизация").modifier(SoftScrollEdges()).scrollContentBackground(.hidden)
    }
    private func title(_ edit: PCEdit) -> String {
        switch edit.kind {
        case "like": return edit.liked == true ? "Добавить в любимые" : "UNLIKE"
        case "create_playlist": return "Создать: \(edit.name ?? "Плейлист")"
        case "rename_playlist": return "Переименовать: \(edit.name ?? "Плейлист")"
        case "delete_playlist": return "DELETE PLAYLIST"
        case "add_tracks": return "Добавить \(edit.tracks?.count ?? 0) треков"
        case "remove_track": return "Убрать трек из плейлиста"
        default: return "Изменение библиотеки"
        }
    }
}
