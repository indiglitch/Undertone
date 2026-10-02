import SwiftUI

struct DownloadSample: Equatable { let bytes: Int64; let expected: Int64 }
@MainActor final class DownloadProgress: ObservableObject {
    @Published private(set) var samples: [String: DownloadSample] = [:]
    func update(_ id: String, bytes: Int64, expected: Int64) { samples[id] = DownloadSample(bytes:bytes,expected:expected) }
    func remove(_ id: String) { samples.removeValue(forKey:id) }
}

struct DownloadsView: View {
    @EnvironmentObject private var downloads: BackgroundDownloads
    var body: some View {
        List {
            Section {
                Text("QUEUE · \(downloads.records.count)  /  COMPLETED · \(downloads.completed)").font(.caption).monospacedDigit()
                HStack {
                    Button(downloads.active ? "PAUSE ALL" : "RESUME ALL") { Task { if downloads.active { await downloads.pause() } else { await downloads.resume() } } }
                    Spacer()
                    Button("CLEAR QUEUE",role:.destructive) { Task { await downloads.cancelAll() } }
                }.disabled(downloads.pausing || downloads.records.isEmpty)
            }
            if downloads.records.isEmpty { ContentUnavailableView("NO DOWNLOADS",systemImage:"arrow.down.circle",description:Text("Загрузки из меню трека, альбома или плейлиста появятся здесь.")) }
            ForEach(downloads.records) { record in
                VStack(alignment:.leading,spacing:8) {
                    HStack {
                        VStack(alignment:.leading,spacing:4) {
                            Text(record.track.title).font(.headline).lineLimit(2)
                            Text(record.track.artist).font(.caption).foregroundStyle(.secondary)
                            Text(["queued":"QUEUED","downloading":"DOWNLOADING","installing":"VERIFYING ORIGINAL","paused":"PAUSED","failed":"FAILED"][record.state] ?? record.state).font(.caption2).foregroundStyle(record.state == "failed" ? Color.red : Color.secondary)
                        }
                        Spacer()
                        if ["paused","failed"].contains(record.state) { Button("RETRY",systemImage:"arrow.clockwise") { Task { await downloads.retry(record.id) } }.labelStyle(.iconOnly).frame(width:44,height:44) }
                        Button("CANCEL",systemImage:"xmark") { Task { await downloads.cancel(record.id) } }.labelStyle(.iconOnly).frame(width:44,height:44)
                    }
                    if record.state == "downloading" { TransferProgressView(id:record.id,size:record.track.size,progress:downloads.progressState) }
                }.padding(.vertical,4)
            }
            if let error = downloads.error { Section("LAST ERROR") { Text(error).font(.caption).foregroundStyle(.red) } }
        }.listStyle(.plain).scrollContentBackground(.hidden).modifier(SoftScrollEdges())
            .navigationTitle("DOWNLOADS").navigationBarTitleDisplayMode(.inline)
    }
}
private struct TransferProgressView: View {
    let id: String
    let size: Int64
    @ObservedObject var progress: DownloadProgress
    var body: some View {
        let sample = progress.samples[id] ?? DownloadSample(bytes:0,expected:size)
        let total = max(1,sample.expected > 0 ? sample.expected : size)
        VStack(alignment:.leading,spacing:4) {
            ProgressView(value:Double(min(sample.bytes,total)),total:Double(total))
            Text("\(ByteCountFormatter.string(fromByteCount:sample.bytes,countStyle:.file)) / \(ByteCountFormatter.string(fromByteCount:total,countStyle:.file))").font(.caption2).monospacedDigit().foregroundStyle(.secondary)
        }
    }
}
