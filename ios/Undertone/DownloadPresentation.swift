import SwiftUI

// A completion is an operation in this process, not proof that a file still exists.
struct DownloadCompletion: Identifiable {
    let id = UUID()
    let track: PCTrack
    let finishedAt: Date
}

struct DownloadRecordPresentation {
    let record: DownloadRecord
    var canResume: Bool { record.state == "paused" && record.taskID == nil }
    var canRetry: Bool { record.state == "failed" && record.taskID == nil }
    var canPause: Bool { ["queued", "downloading"].contains(record.state) }
    // Installation has already taken ownership of the temporary file.
    var canCancel: Bool { ["queued", "downloading", "paused", "failed"].contains(record.state) }
    static func hasControls(_ records: [DownloadRecord]) -> Bool {
        records.contains { let state = Self(record: $0); return state.canPause || state.canResume || state.canRetry || state.canCancel }
    }
    var title: String {
        switch record.state {
        case "queued": return "В очереди"
        case "downloading": return "Загружается"
        case "installing": return "Сохраняется на iPhone"
        case "paused": return "Приостановлено"
        case "failed": return "Не удалось сохранить"
        default: return "Статус обновляется"
        }
    }
    var icon: String {
        switch record.state {
        case "queued": return "clock"
        case "downloading": return "arrow.down.circle"
        case "installing": return "internaldrive"
        case "paused": return "pause.circle"
        case "failed": return "exclamationmark.circle"
        default: return "questionmark.circle"
        }
    }
}

enum DownloadProgressPresentation {
    static func fraction(_ sample: DownloadSample?, size: Int64) -> Double? {
        let reported = sample?.expected ?? 0
        let expected = reported > 0 ? reported : size
        guard expected > 0 else { return nil }
        return min(1, max(0, Double(sample?.bytes ?? 0) / Double(expected)))
    }
}

struct DownloadStateLabel: View {
    let record: DownloadRecord
    var body: some View {
        let state = DownloadRecordPresentation(record: record)
        Label(state.title, systemImage: state.icon)
            .foregroundStyle(record.state == "failed" ? Color.red : .secondary)
    }
}

struct TransferProgressView: View {
    let id: String
    let size: Int64
    @ObservedObject var progress: DownloadProgress
    var body: some View {
        let fraction = DownloadProgressPresentation.fraction(progress.samples[id], size: size)
        HStack(spacing: 12) {
            if let fraction {
                ProgressView(value: fraction).frame(maxWidth: .infinity)
                Text(fraction, format: .percent.precision(.fractionLength(0))).monospacedDigit().font(.caption)
            } else { ProgressView().frame(maxWidth: .infinity, alignment: .leading) }
        }.accessibilityElement(children: .ignore)
            .accessibilityLabel("Прогресс загрузки")
            .accessibilityValue(fraction.map { "\(Int($0 * 100))%" } ?? "Размер неизвестен")
            .accessibilityIdentifier("downloadProgress-" + id)
    }
}

struct DownloadConnectionNotice: View {
    @EnvironmentObject private var pc: PCConnection
    @AppStorage("offlineMode") private var offline = false
    var body: some View {
        if offline {
            Label("Офлайн-режим. Новые передачи ждут его отключения; очередь сохранена.", systemImage: "wifi.slash")
        } else if pc.address.isEmpty {
            Label("Подключи ПК через COMPUTER. Очередь сохранена; файлы на iPhone доступны без подключения.", systemImage: "desktopcomputer")
        } else if !pc.online {
            Label("ПК пока недоступен. Передача может ждать подключения. Проверь Wi-Fi и доступ в Undertone на ПК.", systemImage: "wifi.exclamationmark")
        }
    }
}

struct DownloadQueueControls: View {
    @EnvironmentObject private var downloads: BackgroundDownloads
    private var cancellable: [String] { downloads.records.filter { DownloadRecordPresentation(record: $0).canCancel }.map(\.id) }
    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 16) { actions }
            VStack(alignment: .leading, spacing: 0) { actions }
        }.buttonStyle(.borderless).disabled(downloads.pausing)
    }
    @ViewBuilder private var actions: some View {
        if downloads.records.contains(where: { DownloadRecordPresentation(record: $0).canPause }) {
            Button { Task { await downloads.pause() } } label: { Label("PAUSE ALL", systemImage: "pause").frame(minHeight: 44) }
        }
        if downloads.records.contains(where: { let state = DownloadRecordPresentation(record: $0); return state.canResume || state.canRetry }) {
            Button { Task { await downloads.resume() } } label: { Label("RESUME ALL", systemImage: "arrow.clockwise").frame(minHeight: 44) }
        }
        if !cancellable.isEmpty {
            Button(role: .destructive) {
                let ids = cancellable
                Task {
                    for id in ids {
                        guard let current = downloads.records.first(where: { $0.id == id }), DownloadRecordPresentation(record: current).canCancel else { continue }
                        await downloads.cancel(id)
                    }
                }
            } label: { Label("CANCEL QUEUE", systemImage: "xmark").frame(minHeight: 44) }
        }
    }
}

struct CollectionDownloadSummary: View {
    @EnvironmentObject private var downloads: BackgroundDownloads
    let tracks: [UnifiedTrack]
    var body: some View {
        let aliases = tracks.reduce(into: Set<String>()) { $0.formUnion($1.aliases) }
        let pending = downloads.records.filter { aliases.contains($0.id) }
        let saved = tracks.filter { $0.local != nil }.count
        if !tracks.isEmpty {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { summary(saved: saved, pending: pending) }
                VStack(alignment: .leading, spacing: 4) { summary(saved: saved, pending: pending) }
            }.font(.caption2).foregroundStyle(.secondary)
                .accessibilityIdentifier("collectionDownloadSummary")
        }
    }
    @ViewBuilder private func summary(saved: Int, pending: [DownloadRecord]) -> some View {
        Label("На iPhone · \(saved)/\(tracks.count)", systemImage: "checkmark.circle").fixedSize(horizontal: false, vertical: true)
        if !pending.isEmpty { Text("В очереди · \(pending.count)").fixedSize(horizontal: false, vertical: true) }
        if pending.contains(where: { $0.state == "failed" }) { Label("Есть ошибки загрузки", systemImage: "exclamationmark.circle").foregroundStyle(.red) }
        if pending.contains(where: { $0.state == "paused" }) { Label("Есть приостановленные загрузки", systemImage: "pause.circle") }
    }
}
