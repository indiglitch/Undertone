import SwiftUI
import UIKit

struct SharePayload: Identifiable { let id = UUID(); let items: [Any] }
@MainActor final class ShareCoordinator: ObservableObject { @Published var payload: SharePayload? }
struct SystemShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) { }
}
struct ShareOriginalButton: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var share: ShareCoordinator
    let song: Song
    var body: some View { Button("SHARE ORIGINAL",systemImage:"square.and.arrow.up") { Task { do { share.payload = SharePayload(items:[try await library.repository.fileURL(song)]) } catch { library.error = error.localizedDescription } } } }
}
struct MobileSettingsView: View {
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var personal: PersonalLibrary
    @AppStorage("createTabVisible") private var createVisible = true
    @AppStorage("offlineMode") private var offline = false
    @AppStorage("canvasEnabled") private var canvas = true
    @AppStorage("lyricsPreview") private var lyrics = true
    @AppStorage("crossfadeSeconds") private var crossfade = 0.0
    @AppStorage("hiddenTrackIDs") private var hiddenTracks = ""
    @EnvironmentObject private var routes: RouteCoordinator
    @State private var scanning = false
    @State private var clearHistory = false
    @State private var clearTrash = false
    var body: some View {
        Form {
            Section {
                LabeledContent { Text("\(Int(crossfade)) s", tableName: "Settings").monospacedDigit() } label: {
                    SettingsLabel(title: "Crossfade", icon: "waveform.path")
                }
                Slider(value:$crossfade,in:0...12,step:1)
                    .frame(minHeight: MobileLayout.minimumTarget)
                    .accessibilityLabel(Text("Crossfade duration", tableName: "Settings"))
                    .accessibilityValue(Text("\(Int(crossfade)) s", tableName: "Settings"))
                    .accessibilityIdentifier("settingsCrossfade")
                Text("Original quality, without transcoding", tableName: "Settings").font(.subheadline)
            } header: { Text("Playback", tableName: "Settings") }
                footer: { Text("Crossfade overlaps tracks supported by the system player. Ogg Vorbis switches without overlap. The queue and position are restored paused; headphones and Lock Screen controls remain available.", tableName: "Settings") }
            Section {
                Toggle(isOn: $createVisible) { SettingsLabel(title: "Create tab", icon: "plus.square") }.accessibilityIdentifier("settingsCreateTab")
                Toggle(isOn: $lyrics) { SettingsLabel(title: "Lyrics preview", icon: "text.alignleft") }.accessibilityIdentifier("settingsLyrics")
                Toggle(isOn: $canvas) { SettingsLabel(title: "Local video loops", icon: "video") }.accessibilityIdentifier("settingsVideo")
            } header: { Text("Appearance", tableName: "Settings") }
                footer: { Text("Show Create in the tab bar, a short lyrics preview, and imported video loops in Now Playing. These switches do not remove your files or lyrics.", tableName: "Settings") }
            Section {
                Toggle(isOn: $offline) { SettingsLabel(title: "Offline mode", icon: "wifi.slash") }
                    .onChange(of:offline) { _, value in pc.offlineChanged(value); Task { if value { await BackgroundDownloads.shared.pause() } } }
                    .accessibilityIdentifier("settingsOffline")
                NavigationLink { DownloadsView() } label: { SettingsLabel(title: "Downloads", icon: "arrow.down.circle") }.accessibilityIdentifier("settingsDownloads")
                NavigationLink { RecentListeningView() } label: { SettingsLabel(title: "Recently played", icon: "clock") }.accessibilityIdentifier("settingsRecent")
            } header: { Text("Library & Downloads", tableName: "Settings") }
                footer: { Text("Offline mode stops requests to the computer and pauses downloads. Saved music remains available. Downloads shows the queue and completed operations; files on this iPhone are under Storage.", tableName: "Settings") }
            Section {
                NavigationLink {
                    ScrollView { PCDeviceView().padding(MobileLayout.contentInset) }.modifier(SoftScrollEdges()).navigationTitle(Text("Computer", tableName: "Settings"))
                } label: { SettingsLabel(title: "Computer connection", icon: "desktopcomputer") }.accessibilityIdentifier("settingsComputer")
            } header: { Text("Computer", tableName: "Settings") }
                footer: { Text("Pair or reconnect, update the catalog, or download original music over Wi-Fi.", tableName: "Settings") }
            Section {
                LabeledContent { Text(ByteCountFormatter.string(fromByteCount:library.bytes,countStyle:.file)).monospacedDigit() } label: {
                    SettingsLabel(title: "Music files", icon: "internaldrive")
                }
                NavigationLink { MusicLibraryView(downloadsOnly:true,showRoot:false).navigationTitle(Text("Files on this iPhone", tableName: "Settings")) } label: {
                    SettingsLabel(title: "Files on this iPhone", icon: "music.note.list")
                }.accessibilityIdentifier("settingsFiles")
                if library.trashBytes > 0 {
                    Button(role: .destructive) { clearTrash = true } label: {
                        HStack { SettingsLabel(title: "Empty Trash", icon: "trash", iconColor: .red); Spacer(); Text(ByteCountFormatter.string(fromByteCount:library.trashBytes,countStyle:.file)).font(.caption).foregroundStyle(.secondary) }
                    }.accessibilityIdentifier("settingsTrash")
                }
                if !library.removed.isEmpty {
                    Button { Task { await library.undoRemoval() } } label: { SettingsLabel(title: "Undo last removal", icon: "arrow.uturn.backward") }.accessibilityIdentifier("settingsUndo")
                }
            } header: { Text("Storage", tableName: "Settings") }
                footer: { Text("Removing a phone copy leaves the PC original intact. The last removal can be undone until Trash is emptied.", tableName: "Settings") }
            Section {
                if !hiddenTracks.isEmpty {
                    Button { hiddenTracks = "" } label: { SettingsLabel(title: "Show hidden tracks", icon: "eye") }.accessibilityIdentifier("settingsHidden")
                }
                Button { scanning = true } label: { SettingsLabel(title: "Open music code", icon: "qrcode.viewfinder") }.accessibilityIdentifier("settingsMusicCode")
                Button(role: .destructive) { clearHistory = true } label: { SettingsLabel(title: "Clear history", icon: "clock.arrow.circlepath", iconColor: .red) }.accessibilityIdentifier("settingsHistory")
                DisclosureGroup {
                    Text("Personal music player. Music and preferences stay on your device; the computer connection token is stored in Keychain.", tableName: "Settings").font(.subheadline).foregroundStyle(.secondary)
                } label: { SettingsLabel(title: "About Undertone", icon: "info.circle") }
            } header: { Text("Advanced", tableName: "Settings") }
                footer: { Text("Music codes open tracks or collections in your library. Clearing history removes listening and search history, not music files.", tableName: "Settings") }
        }
        .listSectionSpacing(MobileLayout.sectionSpacing)
        .environment(\.defaultMinListRowHeight, CollectionLayout.rowHeight)
        .scrollContentBackground(.hidden).background(Color.canvas)
        .modifier(SoftScrollEdges()).navigationTitle(Text("Settings", tableName: "Settings")).navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $scanning) {
            QRScanner { code in scanning = false; if let url = URL(string: code) { routes.open(url) } }
                .ignoresSafeArea().overlay(alignment: .topTrailing) {
                    Button { scanning = false } label: { Text("Close", tableName: "Settings").frame(minWidth: MobileLayout.minimumTarget, minHeight: MobileLayout.minimumTarget) }.buttonStyle(.glass).padding(MobileLayout.contentInset)
                }
        }
        .confirmationDialog(Text("Empty Trash permanently? PC originals are unchanged.", tableName: "Settings"), isPresented: $clearTrash, titleVisibility: .visible) {
            Button(role: .destructive) { Task { await library.emptyTrash() } } label: { Text("Empty Trash", tableName: "Settings") }
            Button(role: .cancel) { } label: { Text("Cancel", tableName: "Settings") }
        }
        .confirmationDialog(Text("Clear listening and search history?", tableName: "Settings"), isPresented: $clearHistory, titleVisibility: .visible) {
            Button(role: .destructive) { personal.update { $0.recents = []; $0.searches = [] } } label: { Text("Clear history", tableName: "Settings") }
            Button(role: .cancel) { } label: { Text("Cancel", tableName: "Settings") }
        }
    }
}
