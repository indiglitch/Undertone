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
        if host.lowercased() == "undertone-" + fingerprint.lowercased().prefix(16) + ".local" { return }
        let parts = host.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 4, parts.allSatisfy({ (0...255).contains($0) }),
              parts[0] == 10 || (parts[0] == 192 && parts[1] == 168) || (parts[0] == 172 && (16...31).contains(parts[1])) else { throw PCError.invalidCode }
    }
}
struct PCTrack: Codable, Identifiable, Sendable, Equatable {
    let sync_id: String
    let title: String
    let artist: String
    let album: String
    let duration: Double
    let format: String
    let size: Int64
    var has_cover: Bool? = nil
    var id: String { sync_id }
}
struct PCCatalog: Codable, Sendable { let version: Int; let tracks: [PCTrack] }
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
    @Published private(set) var catalogRevision = 0
    @Published private(set) var albums: [String: [PCTrack]] = [:]
    @Published private(set) var address = ""
    @Published private(set) var refreshing = false
    @Published private(set) var online = false
    @Published private(set) var collections = PCCollections()
    @Published private(set) var likedIDs: Set<String> = []
    @Published private(set) var pendingCount = 0
    @Published private(set) var collectionsRevision = 0
    @Published var error: String?
    private var pairing: PCPairing?
    private var session: URLSession?
    private var generation = 0
    private let storage = PCStorage()
    private var state = PCStoredState()
    private var initialized = false
    private var syncing = false
    private let discovery = PCDiscovery()
    private var refreshTask: Task<Void, Never>?
    var downloading: String? { BackgroundDownloads.shared.title }
    var completedDownloads: Int { BackgroundDownloads.shared.completed }
    init() {
        if let stored = PCKeychain.read(), (try? stored.validate()) != nil { configure(stored) }
        discovery.resolved = { [weak self] host, port in
            guard let self, let old = self.pairing else { return }
            let address = "https://\(host):\(port)"
            guard address != old.address else { return }
            let found = PCPairing(version: 1, address: address, token: old.token, fingerprint: old.fingerprint)
            guard (try? found.validate()) != nil else { return }
            Task {
                do {
                    try PCKeychain.save(found); self.configure(found)
                    await BackgroundDownloads.shared.addressChanged(); await self.refresh(quiet: true)
                } catch { self.error = error.localizedDescription }
            }
        }
    }
    func initialize() async {
        guard !initialized else { return }; initialized = true
        do {
            if let cached = try await storage.catalog(), cached.version == 1 { await accept(cached.tracks) }
            state = try await storage.read(); publishCollections()
        } catch { self.error = error.localizedDescription }
    }
    func activate() {
        guard let pairing else { return }
        discovery.start(fingerprint: pairing.fingerprint)
        refreshTask?.cancel()
        refreshTask = Task {
            await initialize()
            while !Task.isCancelled {
                await refresh(quiet: true)
                do { try await Task.sleep(for: .seconds(30)) } catch { return }
            }
        }
    }
    func deactivate() { discovery.stop(); refreshTask?.cancel(); refreshTask = nil }
    private func configure(_ pairing: PCPairing) {
        session?.invalidateAndCancel()
        self.pairing = pairing; address = pairing.address
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 60
        session = URLSession(configuration: configuration, delegate: PinnedPCSession(pairing), delegateQueue: nil)
    }
    private func accept(_ tracks: [PCTrack]) async {
        guard self.tracks != tracks else { return }
        let albums = await Task.detached(priority: .userInitiated) { Dictionary(grouping: tracks, by: { "\($0.artist) — \($0.album)" }) }.value
        self.tracks = tracks; self.albums = albums; catalogRevision += 1
    }
    func pair(_ code: String) async {
        guard !BackgroundDownloads.shared.active else { return }
        do {
            let decoded = try JSONDecoder().decode(PCPairing.self, from: Data(code.trimmingCharacters(in: .whitespacesAndNewlines).utf8))
            try decoded.validate()
            if let old = pairing, old.fingerprint != decoded.fingerprint {
                await BackgroundDownloads.shared.cancelAll(); state = PCStoredState(); try await storage.clear(); publishCollections()
            }
            try PCKeychain.save(decoded)
            generation += 1; tracks = []; configure(decoded)
            activate(); await refresh()
        } catch { self.error = error.localizedDescription }
    }
    func request(_ path: String) throws -> URLRequest {
        guard let pairing, let url = URL(string: pairing.address + path) else { throw PCError.disconnected }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(pairing.token)", forHTTPHeaderField: "Authorization")
        return request
    }
    func data(_ path: String) async throws -> Data {
        guard let session else { throw PCError.disconnected }
        let (data, response) = try await session.data(for: request(path))
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw PCError.rejected }
        return data
    }
    func refresh(quiet: Bool = false) async {
        guard !refreshing else { return }
        refreshing = true; let operation = generation
        defer { refreshing = false }
        do {
            let bytes = try await data("/v1/library")
            guard bytes.count <= 32 * 1024 * 1024, operation == generation else { return }
            let catalog = try await Task.detached(priority: .userInitiated) { try PCStorage.decodeCatalog(bytes) }.value
            _ = try await storage.catalog(bytes); await accept(catalog.tracks); online = true
            await syncCollections(quiet: quiet)
        } catch { if operation == generation { online = false; if !quiet { self.error = error.localizedDescription } } }
    }
    private func publishCollections() {
        var visible = state.collections
        for edit in state.pending { visible.apply(edit) }
        collections = visible; likedIDs = Set(visible.likes); pendingCount = state.pending.count; collectionsRevision += 1
    }
    func edit(_ edit: PCEdit) {
        state.pending.append(edit); publishCollections()
        Task {
            do { try await storage.save(state); await syncCollections(quiet: true) }
            catch { self.error = error.localizedDescription }
        }
    }
    func syncCollections(quiet: Bool = false) async {
        guard !syncing, let session else { return }; syncing = true; defer { syncing = false }
        let operation = generation
        do {
            repeat {
                let sending = Array(state.pending.prefix(500))
                let snapshot: PCCollections
                if sending.isEmpty {
                    let bytes = try await data("/v1/collections")
                    snapshot = try await Task.detached { try JSONDecoder().decode(PCCollections.self, from: bytes) }.value
                } else {
                    var request = try request("/v1/collections"); request.httpMethod = "POST"
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.httpBody = try JSONEncoder().encode(sending)
                    let (bytes, response) = try await session.data(for: request)
                    guard (response as? HTTPURLResponse)?.statusCode == 200 else {
                        let message = (try? JSONDecoder().decode([String:String].self, from: bytes)["error"]) ?? "Изменения не приняты ПК."
                        throw NSError(domain: "UndertoneSync", code: 409, userInfo: [NSLocalizedDescriptionKey: message])
                    }
                    snapshot = try await Task.detached { try JSONDecoder().decode(PCCollections.self, from: bytes) }.value
                }
                guard generation == operation else { return }
                let acknowledged = Set(sending.map(\.id)); state.pending.removeAll { acknowledged.contains($0.id) }
                state.collections = snapshot; publishCollections(); try await storage.save(state)
            } while !state.pending.isEmpty
        } catch { if !quiet || (error as NSError).domain == "UndertoneSync" { self.error = error.localizedDescription } }
    }
    func disconnect() {
        generation += 1; deactivate(); session?.invalidateAndCancel(); session = nil
        pairing = nil; address = ""; tracks = []; albums = [:]; online = false; PCKeychain.remove()
        state = PCStoredState(); publishCollections()
        Task { await BackgroundDownloads.shared.cancelAll(); try? await storage.clear() }
    }
    func cancelDownloads() { Task { await BackgroundDownloads.shared.pause() } }
    func download(_ selected: [PCTrack], library: LibraryStore) {
        let installed = Set(library.songs.compactMap(\.syncID))
        Task { await BackgroundDownloads.shared.enqueue(selected, installed: installed) }
    }
}
