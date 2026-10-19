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
                    Section("Сейчас играет") { row(song).disabled(selecting).modifier(CollectionRowStyle()) }
                }
                Section {
                    HStack {
                        Button { player.shuffleUpcoming() } label: { Label("SHUFFLE", systemImage: "shuffle").frame(minHeight: 44).contentShape(Rectangle()) }
                            .opacity(player.upcoming.count < 2 && !player.shuffled ? 0.45 : 1)
                            .foregroundStyle(player.shuffled ? Color.undertone : .primary)
                            .accessibilityValue(player.shuffled ? "ON" : "OFF")
                        Spacer()
                        Button { player.cycleRepeat() } label: { Label(player.repeatMode.title, systemImage: player.repeatMode.icon).frame(minHeight: 44).contentShape(Rectangle()) }
                            .tint(player.repeatMode == .off ? .secondary : Color.undertone)
                            .accessibilityValue(player.repeatMode == .off ? "OFF" : "ON")
                    }.buttonStyle(PressFeedbackStyle()).font(.caption).modifier(CollectionRowStyle())
                    if selecting {
                        HStack {
                            Text("Выбрано: \(selected.count)").font(.caption)
                            Spacer()
                            Button { selected = !player.upcoming.isEmpty && selected.count == player.upcoming.count ? [] : Set(player.upcoming.map(\.id)) } label: {
                                Text(!player.upcoming.isEmpty && selected.count == player.upcoming.count ? "CLEAR SELECTION" : "SELECT ALL").font(.caption).frame(minHeight: 44).contentShape(Rectangle())
                            }.buttonStyle(PressFeedbackStyle()).disabled(player.upcoming.isEmpty)
                        }.modifier(CollectionRowStyle())
                    }
                }
                Section("Далее · \(player.upcoming.count)") {
                    ForEach(player.upcoming) { song in
                        HStack {
                            if selecting { Button { toggleSelection(song.id) } label: { Image(systemName:selected.contains(song.id) ? "checkmark.circle.fill" : "circle").frame(width:44,height:44).contentShape(Rectangle()) }.buttonStyle(PressFeedbackStyle()).accessibilityLabel("Выбрать " + song.title).accessibilityValue(selected.contains(song.id) ? "SELECTED" : "") }
                            UnifiedTrackRow(track: UnifiedTrack(song), selectionMode: selecting, action: {
                                if selecting { toggleSelection(song.id) }
                                else { Task { await player.selectQueued(song) } }
                            })
                        }.modifier(CollectionRowStyle())
                    }
                    .onDelete { player.removeUpcoming($0) }
                    .onMove { player.moveUpcoming($0, to: $1) }
                    if player.upcoming.isEmpty { CollectionEmptyView(title: "Очередь пуста", detail: "Добавь треки через меню песни. Текущий трек сохранён.").modifier(CollectionRowStyle()) }
                }
                if selecting { Button("REMOVE SELECTED · \(selected.count)",role:.destructive) {
                    player.removeUpcoming(IndexSet(player.upcoming.enumerated().filter { selected.contains($0.element.id) }.map(\.offset))); selected = []
                }.disabled(selected.isEmpty) }
                if !player.upcoming.isEmpty { Button("CLEAR UPCOMING", role: .destructive) { player.clearUpcoming() } }
            }
            .modifier(CollectionListStyle()).background(Color.canvas)
            .environment(\.editMode,$editMode)
            .navigationTitle("QUEUE").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button(editMode == .active ? "DONE" : "EDIT") { selecting = false; selected = []; editMode = editMode == .active ? .inactive : .active } }.sharedBackgroundVisibility(.hidden)
                ToolbarItem(placement: .topBarTrailing) { Button(selecting ? "DONE" : "SELECT") { editMode = .inactive; selecting.toggle(); selected = [] }.padding(.trailing,12) }.sharedBackgroundVisibility(.hidden)
                ToolbarItem(placement: .topBarTrailing) { Button("CLOSE", systemImage: "xmark") { dismiss() }.labelStyle(.iconOnly) }.sharedBackgroundVisibility(.hidden)
            }
            .onChange(of: player.upcoming.map(\.id)) { _, ids in selected.formIntersection(Set(ids)) }
        }.modifier(MusicModalScope()).presentationDragIndicator(.visible)
    }
    private func toggleSelection(_ id: String) { if !selected.insert(id).inserted { selected.remove(id) } }
    private func row(_ song: Song) -> some View { UnifiedTrackRow(track:UnifiedTrack(song),action: { Task { await player.selectQueued(song) } }) }
}
