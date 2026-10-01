import SwiftUI

struct QueueView: View {
    @EnvironmentObject private var player: MusicPlayer
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                if let song = player.current {
                    Section("Сейчас играет") { row(song) }
                }
                Section {
                    HStack {
                        Button("Перемешать", systemImage: "shuffle") { player.shuffleUpcoming() }
                            .disabled(player.upcoming.count < 2)
                        Spacer()
                        Button(player.repeatMode.title, systemImage: player.repeatMode.icon) { player.cycleRepeat() }
                            .tint(player.repeatMode == .off ? .secondary : Color.undertone)
                    }.buttonStyle(.borderless).font(.subheadline)
                }
                Section("Далее · \(player.upcoming.count)") {
                    ForEach(player.upcoming) { song in
                        Button { Task { await player.selectQueued(song) } } label: { row(song) }.buttonStyle(.plain)
                    }
                    .onDelete { player.removeUpcoming($0) }
                    .onMove { player.moveUpcoming($0, to: $1) }
                    if player.upcoming.isEmpty { Text("Добавь треки через меню песни").foregroundStyle(.secondary) }
                }
                if !player.upcoming.isEmpty { Button("Очистить следующие треки", role: .destructive) { player.clearUpcoming() } }
            }
            .scrollContentBackground(.hidden).background(Color.canvas)
            .navigationTitle("Очередь").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { EditButton() }
                ToolbarItem(placement: .topBarTrailing) { Button("Закрыть", systemImage: "xmark") { dismiss() }.labelStyle(.iconOnly) }
            }
        }.presentationDragIndicator(.visible)
    }
    private func row(_ song: Song) -> some View {
        HStack(spacing: 12) {
            CoverArtwork(id: song.syncID ?? song.id)
            VStack(alignment: .leading, spacing: 4) {
                Text(song.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                Text(song.artist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
        }.padding(.vertical, 4).contentShape(Rectangle())
    }
}
