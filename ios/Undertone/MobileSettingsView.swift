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
            Section("Приложение") {
                Toggle("CREATE TAB",isOn:$createVisible)
                Toggle("LYRICS PREVIEW",isOn:$lyrics)
                Toggle("LOCAL VIDEO LOOPS",isOn:$canvas)
            }
            Section("Сеть и офлайн") {
                Toggle("OFFLINE MODE",isOn:$offline)
                    .onChange(of:offline) { _, value in pc.offlineChanged(value); Task { if value { await BackgroundDownloads.shared.pause() } } }
                Text("Скачанная музыка доступна всегда. Офлайн-режим останавливает обращения к ПК. Загрузки работают в локальной сети Wi-Fi.").font(.caption).foregroundStyle(.secondary)
                NavigationLink("COMPUTER") { ScrollView { PCDeviceView().padding(22) }.navigationTitle("COMPUTER") }
            }
            Section("Память") {
                LabeledContent("Оригинальные файлы",value:ByteCountFormatter.string(fromByteCount:library.bytes,countStyle:.file))
                NavigationLink("MANAGE DOWNLOADS") { MusicLibraryView(downloadsOnly:true,showRoot:false).navigationTitle("На iPhone") }
                Text("Удаление с iPhone не удаляет оригиналы на ПК. Последнее удаление можно отменить. Файлы корзины освобождаются отдельно.").font(.caption).foregroundStyle(.secondary)
                if library.trashBytes > 0 { Button("EMPTY TRASH · " + ByteCountFormatter.string(fromByteCount:library.trashBytes,countStyle:.file),role:.destructive) { clearTrash = true } }
                if !library.removed.isEmpty { Button("UNDO DELETE") { Task { await library.undoRemoval() } } }
            }
            Section("Воспроизведение") {
                if !hiddenTracks.isEmpty { Button("SHOW HIDDEN TRACKS") { hiddenTracks = "" } }
                Text("Оригинальное качество · без перекодирования")
                LabeledContent("Плавный переход",value:"\(Int(crossfade)) с")
                Slider(value:$crossfade,in:0...12,step:1).accessibilityLabel("CROSSFADE DURATION")
                Text("Наложение следующих треков работает для файлов системного плеера. Ogg Vorbis переключается без наложения; музыкальные файлы не изменяются.").font(.caption).foregroundStyle(.secondary)
                Text("Плеер восстанавливает очередь и позицию на паузе. Управление доступно с экрана блокировки и наушников.").font(.caption).foregroundStyle(.secondary)
            }
            Section("История") {
                NavigationLink("RECENTLY PLAYED") { RecentListeningView() }
                Button("CLEAR HISTORY",role:.destructive) { clearHistory = true }
            }
            Section("Undertone") { Button("OPEN MUSIC CODE", systemImage:"qrcode.viewfinder") { scanning = true }; Text("Личный музыкальный плеер"); Text("Музыка и настройки хранятся на устройстве; токен подключения — в Keychain.").font(.caption).foregroundStyle(.secondary) }
        }.navigationTitle("SETTINGS")
        .sheet(isPresented: $scanning) {
            QRScanner { code in scanning = false; if let url = URL(string: code) { routes.open(url) } }
                .ignoresSafeArea().overlay(alignment: .topTrailing) { Button("CLOSE") { scanning = false }.buttonStyle(.glass).padding(24) }
        }
        .confirmationDialog("Удалить файлы из корзины без возможности отмены? Оригиналы на ПК не изменятся.",isPresented:$clearTrash) { Button("FREE SPACE",role:.destructive) { Task { await library.emptyTrash() } } }
        .confirmationDialog("Очистить историю прослушивания и поиска?",isPresented:$clearHistory) { Button("CLEAR",role:.destructive) { personal.update { $0.recents = []; $0.searches = [] } } }
    }
}
