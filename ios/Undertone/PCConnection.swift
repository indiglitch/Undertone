import Foundation
import Security
import CryptoKit
import Combine

struct PCPairing: Codable {
    let version: Int
    let address: String
    let token: String
    let fingerprint: String
    func validate() throws {
        guard version == 1, let url = URL(string: address), url.scheme == "https", let host = url.host,
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              url.path.isEmpty, let port = url.port, (1...65535).contains(port),
              token.count == 64, fingerprint.count == 64,
              token.allSatisfy({ $0.isHexDigit }), fingerprint.allSatisfy({ $0.isHexDigit }) else { throw PCError.invalidCode }
        let parts = host.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 4, parts.allSatisfy({ (0...255).contains($0) }),
              parts[0] == 10 || (parts[0] == 192 && parts[1] == 168) || (parts[0] == 172 && (16...31).contains(parts[1])) else { throw PCError.invalidCode }
    }
}
struct PCTrack: Codable, Identifiable, Sendable {
    let sync_id: String
    let title: String
    let artist: String
    let album: String
    let duration: Double
    let format: String
    let size: Int64
    var id: String { sync_id }
}
struct PCCatalog: Codable { let version: Int; let tracks: [PCTrack] }
enum PCError: LocalizedError {
    case invalidCode, disconnected, rejected, corruptDownload
    var errorDescription: String? {
        switch self {
        case .invalidCode: return "Некорректный код подключения. Отсканируй QR-код в Undertone на ПК."
        case .disconnected: return "Сначала подключи компьютер."
        case .rejected: return "ПК отклонил запрос. Проверь Wi-Fi и включённый доступ в Undertone. Если код изменился, отсканируй его заново."
        case .corruptDownload: return "Проверка файла не прошла. Повтори загрузку: оригинал на ПК мог измениться."
        }
    }
}
final class PinnedPCSession: NSObject, URLSessionDelegate, URLSessionTaskDelegate, @unchecked Sendable {
    let pairing: PCPairing
    init(_ pairing: PCPairing) { self.pairing = pairing }
    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              challenge.protectionSpace.host == URL(string: pairing.address)?.host,
              let trust = challenge.protectionSpace.serverTrust,
              let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate], let cert = chain.first else {
            completionHandler(.cancelAuthenticationChallenge, nil); return
        }
        let digest = SHA256.hash(data: SecCertificateCopyData(cert) as Data).map { String(format: "%02x", $0) }.joined()
        guard digest == pairing.fingerprint.lowercased() else { completionHandler(.cancelAuthenticationChallenge, nil); return }
        // Trust only the exact certificate accepted by scanning this PC's code.
        completionHandler(.useCredential, URLCredential(trust: trust))
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
enum PCKeychain {
    static let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "local.undertone.ios.pc", kSecAttrAccount as String: "paired-pc"]
    static func read() -> PCPairing? {
        var request = query; request[kSecReturnData as String] = true
        var result: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(PCPairing.self, from: data)
    }
    static func save(_ pairing: PCPairing) throws {
        let data = try JSONEncoder().encode(pairing)
        let result = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if result == errSecItemNotFound {
            var request = query; request[kSecValueData as String] = data
            request[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            guard SecItemAdd(request as CFDictionary, nil) == errSecSuccess else { throw PCError.rejected }
        } else if result != errSecSuccess { throw PCError.rejected }
    }
    static func remove() { SecItemDelete(query as CFDictionary) }
}

@MainActor
final class PCConnection: ObservableObject {
    @Published private(set) var tracks: [PCTrack] = []
    @Published private(set) var address = ""
    @Published private(set) var refreshing = false
    @Published private(set) var downloading: String?
    @Published private(set) var completedDownloads = 0
    @Published var error: String?
    private var pairing: PCPairing?
    private var session: URLSession?
    private var generation = 0
    private var downloadTask: Task<Void, Never>?
    private let cache = LibraryRepository.defaultRoot().appendingPathComponent("pc-catalog.json")
    init() {
        if let stored = PCKeychain.read(), (try? stored.validate()) != nil { configure(stored) }
        if let data = try? Data(contentsOf: cache), let catalog = try? JSONDecoder().decode(PCCatalog.self, from: data), catalog.version == 1 { tracks = catalog.tracks }
    }
    private func configure(_ pairing: PCPairing) {
        session?.invalidateAndCancel()
        self.pairing = pairing; address = pairing.address
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 120
        configuration.timeoutIntervalForResource = 3600
        session = URLSession(configuration: configuration, delegate: PinnedPCSession(pairing), delegateQueue: nil)
    }
    func pair(_ code: String) async {
        guard downloading == nil else { return }
        do {
            let decoded = try JSONDecoder().decode(PCPairing.self, from: Data(code.trimmingCharacters(in: .whitespacesAndNewlines).utf8))
            try decoded.validate()
            try PCKeychain.save(decoded)
            generation += 1; tracks = []; configure(decoded)
            await refresh()
        } catch { self.error = error.localizedDescription }
    }
    private func request(_ path: String) throws -> URLRequest {
        guard let pairing, let url = URL(string: pairing.address + path) else { throw PCError.disconnected }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(pairing.token)", forHTTPHeaderField: "Authorization")
        return request
    }
    func refresh() async {
        guard !refreshing else { return }
        refreshing = true; let operation = generation
        defer { refreshing = false }
        do {
            guard let session else { throw PCError.disconnected }
            let (data, response) = try await session.data(for: request("/v1/library"))
            guard operation == generation else { return }
            guard (response as? HTTPURLResponse)?.statusCode == 200, data.count <= 32 * 1024 * 1024 else { throw PCError.rejected }
            let catalog = try JSONDecoder().decode(PCCatalog.self, from: data)
            guard catalog.version == 1, catalog.tracks.allSatisfy({ $0.sync_id.count == 32 && $0.sync_id.allSatisfy(\.isHexDigit) && $0.size >= 0 }) else { throw PCError.rejected }
            try FileManager.default.createDirectory(at: cache.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: cache, options: .atomic)
            tracks = catalog.tracks
        } catch { if operation == generation { self.error = error.localizedDescription } }
    }
    func disconnect() {
        generation += 1; cancelDownloads(); session?.invalidateAndCancel(); session = nil
        pairing = nil; address = ""; tracks = []; PCKeychain.remove(); try? FileManager.default.removeItem(at: cache)
    }
    func cancelDownloads() { downloadTask?.cancel(); downloadTask = nil }
    func download(_ selected: [PCTrack], library: LibraryStore) {
        guard downloading == nil, !library.importing else { return }
        downloading = "Подготовка"; completedDownloads = 0
        let operation = generation
        downloadTask = Task {
            defer { downloading = nil; downloadTask = nil }
            do {
                guard let session else { throw PCError.disconnected }
                for track in selected {
                    try Task.checkCancellation()
                    guard operation == generation else { return }
                    if library.songs.contains(where: { $0.syncID == track.id }) { continue }
                    downloading = track.title
                    let (file, response) = try await session.download(for: request("/v1/file/\(track.id)"))
                    defer { try? FileManager.default.removeItem(at: file) }
                    try Task.checkCancellation()
                    guard let response = response as? HTTPURLResponse, response.statusCode == 200,
                          let hash = response.value(forHTTPHeaderField: "X-Content-SHA256"), hash.count == 64 else { throw PCError.rejected }
                    try await library.repository.installDownload(file, track: track, expectedHash: hash)
                    await library.load(); completedDownloads += 1
                }
            } catch is CancellationError { }
            catch { if operation == generation && !Task.isCancelled { self.error = error.localizedDescription } }
        }
    }
}
