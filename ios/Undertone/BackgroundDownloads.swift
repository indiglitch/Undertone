import Foundation
import UIKit
import Combine

struct DownloadRecord: Codable, Identifiable, Sendable {
    let track: PCTrack
    var state = "queued"
    var taskID: Int?
    var id: String { track.id }
}

actor DownloadPersistence {
    let root: URL
    init(root: URL = LibraryRepository.defaultRoot().appendingPathComponent("Transfers", isDirectory: true)) { self.root = root }
    func read() throws -> [DownloadRecord] {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let file = root.appendingPathComponent("queue.json")
        guard FileManager.default.fileExists(atPath: file.path) else { return [] }
        return try JSONDecoder().decode([DownloadRecord].self, from: Data(contentsOf: file))
    }
    func save(_ records: [DownloadRecord]) throws {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try JSONEncoder().encode(records).write(to: root.appendingPathComponent("queue.json"), options: .atomic)
    }
    func resume(_ id: String) -> Data? { try? Data(contentsOf: root.appendingPathComponent(id + ".resume")) }
    func setResume(_ id: String, data: Data?) throws {
        let file = root.appendingPathComponent(id + ".resume")
        if let data { try data.write(to: file, options: .atomic) }
        else { try? FileManager.default.removeItem(at: file) }
    }
}

// URLSession invokes this delegate off the UI thread. Move its temporary file before returning.
final class DownloadDelegate: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    weak var owner: BackgroundDownloads?
    private let pairingProvider: @Sendable () -> PCPairing?
    private let staging: URL
    init(pairingProvider: @escaping @Sendable () -> PCPairing?, staging: URL) {
        self.pairingProvider = pairingProvider; self.staging = staging; super.init()
    }
    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard let pairing = pairingProvider() else { completionHandler(.cancelAuthenticationChallenge, nil); return }
        PinnedPCSession(pairing).urlSession(session, didReceive: challenge, completionHandler: completionHandler)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        do {
            try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
            let file = staging.appendingPathComponent(UUID().uuidString + ".download")
            try FileManager.default.moveItem(at: location, to: file)
            let response = downloadTask.response as? HTTPURLResponse
            Task { @MainActor [weak owner] in await owner?.finished(downloadTask.taskIdentifier, trackID: downloadTask.taskDescription, file: file, response: response) }
        } catch { Task { @MainActor [weak owner] in owner?.error = error.localizedDescription } }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let error else { return }
        let resume = (error as NSError).userInfo[NSURLSessionDownloadTaskResumeData] as? Data
        Task { @MainActor [weak owner] in await owner?.failed(task.taskIdentifier, error: error, resume: resume) }
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        Task { @MainActor [weak owner] in owner?.progress(downloadTask.taskIdentifier, bytes: totalBytesWritten) }
    }
    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        Task { @MainActor [weak owner] in await owner?.finishBackgroundEvents() }
    }
}

@MainActor
final class BackgroundDownloads: ObservableObject {
    static let shared = BackgroundDownloads()
    @Published private(set) var records: [DownloadRecord] = []
    @Published private(set) var received: Int64 = 0
    @Published private(set) var completed = 0
    @Published var error: String?
    var onInstall: (() async -> Void)?
    var backgroundCompletion: (() -> Void)?
    private let persistence: DownloadPersistence
    private let repository: LibraryRepository
    private let delegate: DownloadDelegate
    private let pairingProvider: @Sendable () -> PCPairing?
    private let sessionSuffix: String
    private let testConfiguration: URLSessionConfiguration?
    private var initialized = false
    @Published private(set) var pausing = false
    private var starting = false
    private var transfers: [Int: URLSessionDownloadTask] = [:]
    private var pendingInstalls = 0
    private var lastProgress = Date.distantPast
    private lazy var session: URLSession = {
        let identifier = (Bundle.main.bundleIdentifier ?? "local.undertone.ios") + "." + sessionSuffix
        let config = testConfiguration ?? URLSessionConfiguration.background(withIdentifier: identifier)
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        config.waitsForConnectivity = true
        config.allowsCellularAccess = false
        config.timeoutIntervalForResource = 7 * 24 * 3600
        let queue = OperationQueue(); queue.maxConcurrentOperationCount = 1
        return URLSession(configuration: config, delegate: delegate, delegateQueue: queue)
    }()
    var active: Bool { records.contains { ["queued", "downloading", "installing"].contains($0.state) } }
    var title: String? { records.first { $0.state == "downloading" || $0.state == "installing" }?.track.title ?? (active ? "В очереди" : nil) }
    init(root: URL = LibraryRepository.defaultRoot(), pairingProvider: @escaping @Sendable () -> PCPairing? = { PCKeychain.read() }, sessionSuffix: String = "original-downloads", testConfiguration: URLSessionConfiguration? = nil) {
        self.pairingProvider = pairingProvider; self.sessionSuffix = sessionSuffix; self.testConfiguration = testConfiguration
        repository = LibraryRepository(root: root)
        persistence = DownloadPersistence(root: root.appendingPathComponent("Transfers", isDirectory: true))
        delegate = DownloadDelegate(pairingProvider: pairingProvider, staging: root.appendingPathComponent("Transfers", isDirectory: true))
        delegate.owner = self
    }
    func initialize() async {
        guard !initialized else { return }; initialized = true
        do {
            records = try await persistence.read()
            let tasks = await session.allTasks
            for task in tasks {
                guard let task = task as? URLSessionDownloadTask, let id = task.taskDescription,
                      let index = records.firstIndex(where: { $0.id == id }) else { task.cancel(); continue }
                transfers[task.taskIdentifier] = task; records[index].taskID = task.taskIdentifier
                records[index].state = task.state == .suspended ? "paused" : "downloading"
            }
            for index in records.indices where !transfers.values.contains(where: { $0.taskDescription == records[index].id }) {
                if ["downloading", "installing"].contains(records[index].state) { records[index].state = "queued"; records[index].taskID = nil }
            }
            try await persistence.save(records)
            await schedule()
        } catch { self.error = error.localizedDescription }
    }
    func enqueue(_ tracks: [PCTrack], installed: Set<String>) async {
        await initialize()
        let existing = Set(records.map(\.id))
        records += tracks.filter { !installed.contains($0.id) && !existing.contains($0.id) }.map { DownloadRecord(track: $0) }
        await save(); await schedule()
    }
    private func save() async { do { try await persistence.save(records) } catch { self.error = error.localizedDescription } }
    private func schedule() async {
        guard !starting, !pausing, let pairing = pairingProvider() else { return }
        starting = true; defer { starting = false }
        while transfers.count < 2, let record = records.first(where: { $0.state == "queued" }) {
            guard let url = URL(string: pairing.address + "/v1/file/" + record.id) else { return }
            let task: URLSessionDownloadTask
            if let data = await persistence.resume(record.id) { task = session.downloadTask(withResumeData: data) }
            else {
                var request = URLRequest(url: url); request.setValue("Bearer " + pairing.token, forHTTPHeaderField: "Authorization")
                task = session.downloadTask(with: request)
            }
            guard let index = records.firstIndex(where: { $0.id == record.id && $0.state == "queued" }) else { task.cancel(); continue }
            task.taskDescription = record.id; records[index].taskID = task.taskIdentifier; records[index].state = "downloading"
            transfers[task.taskIdentifier] = task
            await save(); task.resume()
        }
    }
    func progress(_ task: Int, bytes: Int64) {
        guard transfers[task] != nil, Date().timeIntervalSince(lastProgress) >= 0.5 else { return }
        lastProgress = Date(); received = bytes
    }
    func finished(_ task: Int, trackID: String?, file: URL, response: HTTPURLResponse?) async {
        pendingInstalls += 1
        defer { pendingInstalls -= 1; completeBackgroundIfReady(); try? FileManager.default.removeItem(at: file) }
        guard let index = records.firstIndex(where: { $0.taskID == task || ($0.id == trackID && $0.state != "paused") }) else { return }
        let record = records[index]; records[index].state = "installing"; transfers.removeValue(forKey: task)
        await save()
        do {
            guard let response, [200, 206].contains(response.statusCode), let hash = response.value(forHTTPHeaderField: "X-Content-SHA256"), hash.count == 64 else { throw PCError.rejected }
            try await repository.installDownload(file, track: record.track, expectedHash: hash)
            try await persistence.setResume(record.id, data: nil)
            records.removeAll { $0.id == record.id }; completed += 1; await save()
            await onInstall?()
            await CoverStore.shared.fetchPC(record.track)
        } catch {
            if let index = records.firstIndex(where: { $0.id == record.id }) { records[index].state = "failed"; records[index].taskID = nil }
            try? await persistence.setResume(record.id, data: nil); await save(); self.error = error.localizedDescription
        }
        await schedule()
    }
    func failed(_ task: Int, error: Error, resume: Data?) async {
        transfers.removeValue(forKey: task)
        guard let index = records.firstIndex(where: { $0.taskID == task }) else { return }
        let id = records[index].id
        records[index].state = "paused"; records[index].taskID = nil
        if let resume { try? await persistence.setResume(id, data: resume) }; await save()
        if (error as NSError).code != NSURLErrorCancelled { self.error = "Загрузка приостановлена: \(error.localizedDescription)" }
        await schedule()
    }
    func pause() async {
        guard !pausing else { return }; pausing = true; defer { pausing = false }
        for index in records.indices where ["queued", "downloading"].contains(records[index].state) {
            records[index].state = "paused"; records[index].taskID = nil
        }
        let tasks = Array(transfers.values); transfers.removeAll(); await save()
        for task in tasks {
            let data: Data? = await withCheckedContinuation { continuation in task.cancel { continuation.resume(returning: $0) } }
            guard let id = task.taskDescription, records.contains(where: { $0.id == id }) else { continue }
            try? await persistence.setResume(id, data: data)
        }
    }
    func resume() async {
        guard !pausing else { return }
        for index in records.indices where ["paused", "failed"].contains(records[index].state) && records[index].taskID == nil { records[index].state = "queued" }
        await save(); await schedule()
    }
    func cancelAll() async {
        let tasks = Array(transfers.values); transfers.removeAll()
        let ids = records.map(\.id); records = []; await save()
        tasks.forEach { $0.cancel() }
        for id in ids { try? await persistence.setResume(id, data: nil) }
    }
    func addressChanged() async {
        // A resume blob embeds the old URL. Preserve originals, restart incomplete transfers at the new address.
        await pause()
        for record in records { try? await persistence.setResume(record.id, data: nil) }
        for index in records.indices { records[index].taskID = nil; records[index].state = "queued" }
        transfers.removeAll(); await save(); await schedule()
    }
    func finishBackgroundEvents() async { await initialize(); completeBackgroundIfReady() }
    private func completeBackgroundIfReady() {
        guard pendingInstalls == 0, let completion = backgroundCompletion else { return }
        backgroundCompletion = nil; completion()
    }
}

final class UndertoneAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String,
                     completionHandler: @escaping () -> Void) {
        Task { @MainActor in
            BackgroundDownloads.shared.backgroundCompletion = completionHandler
            await BackgroundDownloads.shared.initialize()
        }
    }
}
