import SwiftUI

struct QueueView: View {
    @EnvironmentObject private var player: MusicPlayer
    @Environment(\.dismiss) private var dismiss
    @State private var editMode: EditMode = .inactive
    @State private var selecting = false
    @State private var selected = Set<String>()
    var body: some View {
        NavigationStack {
            List {
                if let song = player.current {
                    Section("Сейчас играет") { row(song) }
                }
                Section {
                    HStack {
                        Button("SHUFFLE", systemImage: "shuffle") { player.shuffleUpcoming() }
                            .disabled(player.upcoming.count < 2)
                        Spacer()
                        Button(player.repeatMode.title, systemImage: player.repeatMode.icon) { player.cycleRepeat() }
                            .tint(player.repeatMode == .off ? .secondary : Color.undertone)
                    }.buttonStyle(.borderless).font(.subheadline)
                }
                Section("Далее · \(player.upcoming.count)") {
                    ForEach(player.upcoming) { song in
                        HStack {
                            if selecting { Button { if !selected.insert(song.id).inserted { selected.remove(song.id) } } label: { Image(systemName:selected.contains(song.id) ? "checkmark.circle.fill" : "circle").frame(width:32,height:44) } }
                            row(song)
                        }
                    }
                    .onDelete { player.removeUpcoming($0) }
                    .onMove { player.moveUpcoming($0, to: $1) }
                    if player.upcoming.isEmpty { Text("Добавь треки через меню песни").foregroundStyle(.secondary) }
                }
                if selecting { Button("REMOVE SELECTED · \(selected.count)",role:.destructive) {
                    player.removeUpcoming(IndexSet(player.upcoming.enumerated().filter { selected.contains($0.element.id) }.map(\.offset))); selected = []
                }.disabled(selected.isEmpty) }
                if !player.upcoming.isEmpty { Button("CLEAR UPCOMING", role: .destructive) { player.clearUpcoming() } }
            }
            .modifier(SoftScrollEdges()).scrollContentBackground(.hidden).background(Color.canvas)
            .environment(\.editMode,$editMode)
            .navigationTitle("QUEUE").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button(editMode == .active ? "DONE" : "EDIT") { selecting = false; selected = []; editMode = editMode == .active ? .inactive : .active } }.sharedBackgroundVisibility(.hidden)
                ToolbarItem(placement: .topBarTrailing) { Button(selecting ? "DONE" : "SELECT") { editMode = .inactive; selecting.toggle(); selected = [] }.padding(.trailing,12) }.sharedBackgroundVisibility(.hidden)
                ToolbarItem(placement: .topBarTrailing) { Button("CLOSE", systemImage: "xmark") { dismiss() }.labelStyle(.iconOnly) }
            }
        }.modifier(MusicModalScope()).presentationDragIndicator(.visible)
    }
    private func row(_ song: Song) -> some View { UnifiedTrackRow(track:UnifiedTrack(song),action: { Task { await player.selectQueued(song) } }) }
}
