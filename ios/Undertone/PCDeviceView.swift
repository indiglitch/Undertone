import SwiftUI
import AVFoundation

struct PCDeviceView: View {
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var downloads: BackgroundDownloads
    @AppStorage("offlineMode") private var offline = false
    @FocusState private var codeFocused: Bool
    @State private var scanning = false
    @State private var code = ""
    @State private var connecting = false
    @State private var replacementCode: String?
    @State private var disconnecting = false
    private var paired: Bool { !pc.address.isEmpty }
    private var state: ComputerPresentation { .state(paired: paired, connecting: connecting, refreshing: pc.refreshing, offline: offline, online: pc.online) }
    private var busy: Bool { connecting || pc.refreshing }
    private var canPair: Bool { !busy && !downloads.active && !downloads.pausing && !offline }
    private var missing: [PCTrack] { DownloadSelection.missing(pc.tracks, ids: Set(pc.tracks.map(\.id)), installed: library.installedIDs) }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Label(paired ? "Сохранённый компьютер" : "Подключи компьютер", systemImage: "desktopcomputer")
                    .font(.title2.bold()).accessibilityIdentifier("computerIdentity")
                if state == .connecting || state == .refreshing { ProgressView(state.title).accessibilityIdentifier("computerProgress") }
                else { Label(state.title, systemImage: state == .available ? "checkmark.circle" : state == .offline ? "wifi.slash" : "desktopcomputer")
                    .foregroundStyle(state == .available ? Color.undertone : .secondary).accessibilityIdentifier("computerState") }
                Text(state.detail).font(.subheadline).foregroundStyle(.secondary)
            }
            if paired {
                catalog
                files
            } else {
                pairingControls
            }
            if let error = pc.connectionMessage {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Не удалось завершить операцию", systemImage: "exclamationmark.circle").font(.headline)
                    Text("Проверь код, подключение к Wi-Fi и доступ на ПК. Подключение и музыка на iPhone сохраняются.").font(.subheadline)
                    DisclosureGroup("Подробности ошибки") { Text(error).font(.caption).textSelection(.enabled) }
                    Button { pc.connectionMessage = nil } label: { Text("DISMISS ERROR").frame(minHeight: 44) }
                }.padding(16).modifier(GlassSurface())
            }
            if paired {
                DisclosureGroup("Управление подключением") {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Подключить заново можно кодом того же ПК. Код другого ПК заменит подключение и сбросит удалённые коллекции, ожидающие изменения и незавершённые загрузки. Файлы на iPhone сохранятся.").font(.caption).foregroundStyle(.secondary)
                        pairingControls
                        Button(role: .destructive) { disconnecting = true } label: {
                            Label("DISCONNECT COMPUTER", systemImage: "link").frame(minHeight: 44)
                        }.disabled(busy || downloads.pausing)
                    }.padding(.top, 8)
                }.accessibilityIdentifier("computerManagement")
                DisclosureGroup("Диагностика") {
                    LabeledContent("Адрес", value: pc.address).font(.caption).textSelection(.enabled)
                    Text("Имя компьютера не передаётся текущим протоколом.").font(.caption).foregroundStyle(.secondary)
                }
            }
            NavigationLink { MusicLibraryView(downloadsOnly: true, showRoot: false).navigationTitle("ON IPHONE") } label: {
                Label("ON IPHONE · \(library.songs.count)", systemImage: "internaldrive").frame(minHeight: 44)
            }.accessibilityIdentifier("computerLocalFiles")
        }
        .sheet(isPresented: $scanning) {
            QRScanner { value in scanning = false; requestPair(value) }
                .ignoresSafeArea().overlay(alignment: .topTrailing) {
                    Button { scanning = false } label: { Text("CLOSE").frame(minWidth: 44, minHeight: 44) }.buttonStyle(.glass).padding(24)
                }
        }
        .confirmationDialog("Заменить подключение?", isPresented: Binding(get: { replacementCode != nil }, set: { if !$0 { replacementCode = nil } }), titleVisibility: .visible) {
            if let value = replacementCode { Button("CONNECT") { connect(value) } }
            Button("CANCEL", role: .cancel) { replacementCode = nil }
        } message: { Text("Если это другой ПК, удалённые коллекции и ожидающие изменения будут сброшены. Файлы на iPhone сохранятся.") }
        .confirmationDialog("Отключить компьютер?", isPresented: $disconnecting, titleVisibility: .visible) {
            Button("DISCONNECT COMPUTER", role: .destructive) { pc.disconnect() }
            Button("CANCEL", role: .cancel) { }
        } message: { Text("Подключение, каталог ПК, ожидающие изменения и очередь загрузок будут удалены. Сохранённые файлы на iPhone останутся.") }
    }
    private var catalog: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Каталог и коллекции").font(.headline)
            Text("\(pc.tracks.count) треков в сохранённом каталоге").font(.subheadline).monospacedDigit()
            if let date = pc.lastCatalogRefresh {
                Text("Каталог обновлён: " + date.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
            }
            Text("Обновляет список музыки, плейлисты и отметки. Само обновление не скачивает аудиофайлы; любимые треки могут загружаться автоматически, как и раньше.").font(.caption).foregroundStyle(.secondary)
            Button { codeFocused = false; Task { await pc.refresh() } } label: {
                Label("UPDATE CATALOG", systemImage: "arrow.clockwise").frame(minHeight: 44)
            }.buttonStyle(.glass).disabled(busy || offline).accessibilityIdentifier("computerRefresh")
            NavigationLink { PendingEditsView() } label: {
                Label("Ожидают синхронизации · \(pc.pendingCount)", systemImage: "arrow.triangle.2.circlepath").frame(minHeight: 44)
            }
        }.padding(16).modifier(GlassSurface())
    }
    private var files: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Музыка на iPhone").font(.headline)
            Text("Скачивает недостающие оригиналы из сохранённого каталога для прослушивания без ПК. Компьютер должен быть доступен по Wi-Fi.").font(.caption).foregroundStyle(.secondary)
            if !pc.tracks.isEmpty && missing.isEmpty { Label("Весь сохранённый каталог уже на iPhone", systemImage: "checkmark.circle").font(.subheadline) }
            Button { pc.download(pc.tracks, library: library) } label: {
                Label("DOWNLOAD MUSIC · \(missing.count)", systemImage: "arrow.down.circle").frame(minHeight: 44)
            }.buttonStyle(.glassProminent).disabled(busy || offline || missing.isEmpty || library.importing || downloads.pausing)
                .accessibilityIdentifier("computerDownload")
            if !downloads.records.isEmpty { DownloadStatus() }
            else { NavigationLink { DownloadsView() } label: { Label("OPEN DOWNLOADS", systemImage: "arrow.down.circle").frame(minHeight: 44) } }
        }.padding(16).modifier(GlassSurface())
    }
    private var pairingControls: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { codeFocused = false; scanning = true } label: {
                Label("SCAN QR CODE", systemImage: "qrcode.viewfinder").frame(minHeight: 44)
            }.buttonStyle(.glassProminent).disabled(!canPair)
            DisclosureGroup("Вставить код вручную") {
                Text("Скопируй весь код подключения из окна «Музыка на iPhone» на ПК.").font(.caption).foregroundStyle(.secondary)
                TextEditor(text: $code).frame(minHeight: 100).font(.body).autocorrectionDisabled().textInputAutocapitalization(.never)
                    .focused($codeFocused).accessibilityLabel("Код подключения").accessibilityIdentifier("computerCode")
                HStack {
                    Button { requestPair(code) } label: { Text("CONNECT").frame(minHeight: 44) }.disabled(code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !canPair)
                    Spacer()
                    Button { codeFocused = false } label: { Text("DONE").frame(minHeight: 44) }
                }
            }
            if offline { Text("Для подключения отключи офлайн-режим в Settings.").font(.caption).foregroundStyle(.secondary) }
            else if downloads.active || downloads.pausing { Text("Перед переподключением приостанови очередь в Downloads и дождись сохранения текущего файла.").font(.caption).foregroundStyle(.secondary) }
        }
    }
    private func requestPair(_ value: String) {
        guard canPair else { return }
        codeFocused = false
        if paired { replacementCode = value } else { connect(value) }
    }
    private func connect(_ value: String) {
        guard canPair else { return }
        connecting = true; pc.error = nil
        Task { await pc.pair(value); connecting = false; if pc.connectionMessage == nil { code = "" } }
    }
}

struct QRScanner: UIViewControllerRepresentable {
    var onCode: (String) -> Void
    func makeUIViewController(context: Context) -> ScannerController { ScannerController(onCode: onCode) }
    func updateUIViewController(_ controller: ScannerController, context: Context) { }
}
final class ScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    private let capture = AVCaptureSession()
    private let worker = DispatchQueue(label: "undertone.qr-camera")
    private var preview: AVCaptureVideoPreviewLayer?
    private var delivered = false
    private let onCode: (String) -> Void
    init(onCode: @escaping (String) -> Void) { self.onCode = onCode; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("Not supported") }
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .black
        AVCaptureDevice.requestAccess(for: .video) { [weak self] allowed in
            guard let self else { return }
            guard allowed else {
                DispatchQueue.main.async { let label = UILabel(); label.text = "Разреши доступ к камере в настройках iPhone или вставь код вручную."; label.numberOfLines = 0; label.textColor = .white; label.frame = self.view.bounds.insetBy(dx: 30, dy: 100); self.view.addSubview(label) }; return
            }
            self.worker.async {
                guard let camera = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: camera), self.capture.canAddInput(input) else { return }
                self.capture.addInput(input)
                let output = AVCaptureMetadataOutput()
                guard self.capture.canAddOutput(output) else { return }
                self.capture.addOutput(output); output.setMetadataObjectsDelegate(self, queue: .main); output.metadataObjectTypes = [.qr]
                DispatchQueue.main.async { let preview = AVCaptureVideoPreviewLayer(session: self.capture); preview.videoGravity = .resizeAspectFill; preview.frame = self.view.bounds; self.view.layer.addSublayer(preview); self.preview = preview }
                self.capture.startRunning()
            }
        }
    }
    override func viewDidLayoutSubviews() { super.viewDidLayoutSubviews(); preview?.frame = view.bounds }
    override func viewWillDisappear(_ animated: Bool) { super.viewWillDisappear(animated); worker.async { [capture] in capture.stopRunning() } }
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !delivered, let value = (metadataObjects.first as? AVMetadataMachineReadableCodeObject)?.stringValue else { return }
        delivered = true; onCode(value)
    }
}
