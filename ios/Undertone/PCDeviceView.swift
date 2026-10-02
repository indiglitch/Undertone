import SwiftUI
import AVFoundation

struct PCDeviceView: View {
    @EnvironmentObject private var pc: PCConnection
    @EnvironmentObject private var library: LibraryStore
    @State private var scanning = false
    @State private var code = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            Image(systemName: "desktopcomputer.and.arrow.down").font(.system(size: 48)).foregroundStyle(Color.undertone).frame(maxWidth: .infinity).padding(.vertical, 20)
            Text(pc.address.isEmpty ? "Подключи свой компьютер" : "Твоя библиотека на ПК").font(.title.bold())
            if pc.address.isEmpty {
                Text("На ПК открой Undertone → Настройки → Музыка на iPhone. Включи доступ и отсканируй QR-код. Оба устройства должны быть в одной сети Wi-Fi.").foregroundStyle(.secondary)
            } else {
                Text(pc.address).font(.caption).foregroundStyle(.secondary)
                Label("\(pc.tracks.count) треков в каталоге", systemImage: "music.note.list")
                Button(pc.refreshing ? "SYNCING…" : "SYNC LIBRARY", systemImage: "arrow.clockwise") { Task { await pc.refresh() } }.buttonStyle(.glass).disabled(pc.refreshing)
                Button("DOWNLOAD LIBRARY", systemImage: "arrow.down.circle") { pc.download(pc.tracks, library: library) }.buttonStyle(.glassProminent).disabled(pc.tracks.isEmpty || pc.downloading != nil || library.importing)
                NavigationLink { PendingEditsView() } label: { Label("SYNC · \(pc.pendingCount)", systemImage: "arrow.triangle.2.circlepath") }
                DownloadStatus()
                Button("DISCONNECT COMPUTER", role: .destructive) { pc.disconnect() }
            }
            Button("SCAN QR CODE", systemImage: "qrcode.viewfinder") { scanning = true }.buttonStyle(.glassProminent).disabled(pc.downloading != nil)
            DisclosureGroup("Вставить код вручную") {
                TextEditor(text: $code).frame(height: 100).font(.caption).autocorrectionDisabled().textInputAutocapitalization(.never)
                Button("CONNECT") { Task { await pc.pair(code) } }.disabled(code.isEmpty || pc.downloading != nil)
            }
            Text("После скачивания музыка работает без ПК и интернета. Подключение сохраняется, компьютер обнаруживается автоматически. Доступ можно приостановить в настройках ПК.").font(.caption).foregroundStyle(.secondary)
        }
        .sheet(isPresented: $scanning) {
            QRScanner { value in scanning = false; Task { await pc.pair(value) } }
                .ignoresSafeArea().overlay(alignment: .topTrailing) { Button("CLOSE") { scanning = false }.buttonStyle(.glass).padding(24) }
        }
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
