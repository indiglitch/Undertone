import SwiftUI

struct DownloadSample: Equatable { let bytes: Int64; let expected: Int64 }
@MainActor final class DownloadProgress: ObservableObject {
    @Published private(set) var samples: [String: DownloadSample] = [:]
    func update(_ id: String, bytes: Int64, expected: Int64) { samples[id] = DownloadSample(bytes:bytes,expected:expected) }
    func remove(_ id: String) { samples.removeValue(forKey:id) }
}

struct DownloadsView: View {
    @EnvironmentObject private var downloads: BackgroundDownloads
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var pc: PCConnection
    @AppStorage("offlineMode") private var offline = false
    var body: some View {
        List {
            Section {
                if downloads.records.isEmpty {
                    CollectionEmptyView(title: "Очередь пуста", detail: "Незавершённых загрузок нет. Добавить треки можно через меню песни, альбома или плейлиста.", icon: "arrow.down.circle")
                        .accessibilityIdentifier("downloadQueueEmpty")
                } else {
                    if offline || pc.address.isEmpty || !pc.online { DownloadConnectionNotice().font(.subheadline).foregroundStyle(.secondary) }
                    if DownloadRecordPresentation.hasControls(downloads.records) { DownloadQueueControls() }
                }
            } header: { Text("QUEUE · \(downloads.records.count)").monospacedDigit() }
            ForEach(downloads.records) { record in
                DownloadQueueRow(record: record).modifier(CollectionRowStyle())
            }
            if let error = downloads.lastFailureMessage {
                Section("Последнее сообщение") {
                    Text("Проверь статусы в очереди и подключение к ПК. Если доступен RESUME или RETRY, повтори попытку.").font(.subheadline)
                    DisclosureGroup("Подробности ошибки") { Text(error).font(.caption).foregroundStyle(.secondary).textSelection(.enabled) }
                    Button { downloads.dismissFailureMessage() } label: { Label("DISMISS ERROR", systemImage: "xmark.circle").frame(minHeight: 44).contentShape(Rectangle()) }
                }
            }
            Section {
                if downloads.recentCompletions.isEmpty {
                    Text("За этот запуск завершённых операций пока нет.").font(.subheadline).foregroundStyle(.secondary)
                }
                ForEach(downloads.recentCompletions) { item in
                    HStack(spacing: 12) {
                        CoverArtwork(id: item.track.id, size: 44, remote: item.track)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.track.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                            Text(item.track.artist).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                            Text(item.finishedAt, style: .time).font(.caption2).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "checkmark.circle").foregroundStyle(Color.undertone).accessibilityLabel("Операция завершена")
                    }.modifier(CollectionRowStyle())
                }
            } header: { Text("ЗАВЕРШЕНО ЗА ЭТОТ ЗАПУСК · \(downloads.completed)").monospacedDigit() }
                footer: { Text("Последние 50 успешных операций. История сбрасывается при новом запуске; наличие файлов смотри в «На iPhone».") }
            Section("НА IPHONE") {
                NavigationLink {
                    MusicLibraryView(downloadsOnly: true, showRoot: false).navigationTitle("ON IPHONE")
                } label: {
                    CollectionRowLabel(title: "ON IPHONE · \(library.songs.count)", icon: "internaldrive")
                }.accessibilityIdentifier("openDownloadedFiles")
                Text("Сохранённые и импортированные файлы, доступные без ПК. Этот список не является историей загрузок.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }.modifier(CollectionListStyle()).buttonStyle(.borderless)
            .navigationTitle("DOWNLOADS").navigationBarTitleDisplayMode(.inline)
    }
}

private struct DownloadQueueRow: View {
    @EnvironmentObject private var downloads: BackgroundDownloads
    let record: DownloadRecord
    private var state: DownloadRecordPresentation { DownloadRecordPresentation(record: record) }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                CoverArtwork(id: record.id, size: 44, remote: record.track)
                VStack(alignment: .leading, spacing: 3) {
                    Text(record.track.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                    Text(record.track.artist).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    DownloadStateLabel(record: record).font(.caption2)
                }.frame(maxWidth: .infinity, alignment: .leading)
                Menu {
                    if state.canResume || state.canRetry {
                        Button(state.canResume ? "RESUME" : "RETRY", systemImage: "arrow.clockwise") {
                            Task { await downloads.retry(record.id) }
                        }
                    }
                    if state.canCancel {
                        Button("CANCEL DOWNLOAD", systemImage: "xmark", role: .destructive) {
                            Task {
                                guard let current = downloads.records.first(where: { $0.id == record.id }), DownloadRecordPresentation(record: current).canCancel else { return }
                                await downloads.cancel(record.id)
                            }
                        }
                    }
                } label: { MusicMenuLabel() }
                    .accessibilityLabel("Загрузка " + record.track.title)
                    .disabled(!state.canCancel && !state.canResume && !state.canRetry).menuOrder(.fixed)
            }
            if record.state == "downloading" { TransferProgressView(id: record.id, size: record.track.size, progress: downloads.progressState) }
            if record.state == "installing" { ProgressView().accessibilityLabel("Сохраняется на iPhone") }
        }.accessibilityElement(children: .contain).accessibilityIdentifier("downloadRow-" + record.id)
    }
}
