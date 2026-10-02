import SwiftUI
import AVKit
import UniformTypeIdentifiers

actor LocalVideoStorage {
    static let shared = LocalVideoStorage()
    private let root = LibraryRepository.defaultRoot().appendingPathComponent("Videos",isDirectory:true)
    private func directory(_ id: String) throws -> URL { guard id.count == 64,id.allSatisfy(\.isHexDigit) else { throw PCError.rejected }; return root.appendingPathComponent(id,isDirectory:true) }
    func file(_ id: String) throws -> URL? { let directory = try directory(id); guard FileManager.default.fileExists(atPath:directory.path) else { return nil }; return try FileManager.default.contentsOfDirectory(at:directory,includingPropertiesForKeys:nil).first(where:{["mp4","mov","m4v"].contains($0.pathExtension.lowercased())}) }
    func install(_ url: URL,id: String) throws {
        let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
        guard ["mp4","mov","m4v"].contains(url.pathExtension.lowercased()),(try url.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? 0) <= 500*1024*1024 else { throw PCError.rejected }
        let folder = try directory(id); try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
        let staged = folder.appendingPathComponent("new.tmp"); if FileManager.default.fileExists(atPath:staged.path) { try FileManager.default.removeItem(at:staged) }; try FileManager.default.copyItem(at:url,to:staged)
        for old in try FileManager.default.contentsOfDirectory(at:folder,includingPropertiesForKeys:nil) where old != staged { try FileManager.default.removeItem(at:old) }
        try FileManager.default.moveItem(at:staged,to:folder.appendingPathComponent("visual." + url.pathExtension.lowercased()))
    }
    func remove(_ id: String) throws { let folder = try directory(id); if FileManager.default.fileExists(atPath:folder.path) { try FileManager.default.removeItem(at:folder) } }
}
struct LocalVisualView: View {
    @EnvironmentObject private var player: MusicPlayer
    @Environment(\.scenePhase) private var phase
    @AppStorage("canvasEnabled") private var canvasEnabled = true
    @State private var video: AVQueuePlayer?
    @State private var loop: AVPlayerLooper?
    @State private var importing = false
    @State private var videoMode = false
    @State private var file: URL?
    @State private var error: String?
    var body: some View {
        VStack(alignment:.leading,spacing:12) {
            HStack { Text("Твоё видео").font(.headline); Spacer(); Menu("Видео",systemImage:"ellipsis") {
                Button("Добавить MP4 / MOV") { importing = true }
                Toggle("Зацикленное видео без звука",isOn:$canvasEnabled)
                if file != nil { Button("Удалить видео",role:.destructive) { if let id = player.current?.id { Task { try? await LocalVideoStorage.shared.remove(id); video?.pause(); video = nil; loop = nil; file = nil } } } }
            } }
            if let video,canvasEnabled { VideoPlayer(player:video).frame(height:220).clipShape(RoundedRectangle(cornerRadius:18)) }
            if file != nil { Button(videoMode ? "Вернуться к музыке" : "Открыть видео со звуком") { if videoMode { video?.pause(); player.resume() } else { player.pause(); video?.pause() }; videoMode.toggle() } }
            else { Text("Добавить клип к треку можно через меню ⋯").font(.caption).foregroundStyle(.secondary) }
        }.padding(file == nil ? 14 : 20).background(.white.opacity(0.055),in:RoundedRectangle(cornerRadius:20))
        .task(id:player.current?.id) { video?.pause(); video = nil; loop = nil; file = nil; guard let id = player.current?.id else { return }; await load(id) }
        .onChange(of:phase) { _,value in if value == .active && canvasEnabled && player.playing { video?.play() } else { video?.pause() } }
        .onChange(of:player.playing) { _,value in if value && canvasEnabled && phase == .active { video?.play() } else { video?.pause() } }
        .onChange(of:canvasEnabled) { _,value in if value && player.playing && phase == .active { video?.play() } else { video?.pause() } }
        .onDisappear { video?.pause() }
        .fileImporter(isPresented:$importing,allowedContentTypes:[.movie]) { result in Task { do { guard let id = player.current?.id else { return }; try await LocalVideoStorage.shared.install(result.get(),id:id); await load(id) } catch { self.error = error.localizedDescription } } }
        .sheet(isPresented:$videoMode) { if let file { LocalMusicVideoView(url:file) } }
        .alert("Видео",isPresented:Binding(get:{error != nil},set:{if !$0 {error = nil}})) { Button("Понятно") { error = nil } } message: { Text(error ?? "") }
    }
    private func load(_ id: String) async {
        file = try? await LocalVideoStorage.shared.file(id); guard let file else { return }
        let queue = AVQueuePlayer(); queue.isMuted = true; video = queue; loop = AVPlayerLooper(player:queue,templateItem:AVPlayerItem(url:file)); if player.playing && canvasEnabled && phase == .active { queue.play() }
    }
}
struct LocalMusicVideoView: View {
    @EnvironmentObject private var music: MusicPlayer
    @Environment(\.dismiss) private var dismiss
    let url: URL
    @State private var video: AVPlayer?
    var body: some View {
        NavigationStack { Group { if let video { VideoPlayer(player:video).ignoresSafeArea(edges:.bottom) } }.navigationTitle("Видео").toolbar { ToolbarItem(placement:.topBarTrailing) { Button("К музыке") { dismiss() } } } }
            .onAppear { let player = AVPlayer(url:url); video = player; player.seek(to:CMTime(seconds:music.position,preferredTimescale:600)); player.play() }
            .onDisappear { let position = video?.currentTime().seconds ?? music.position; video?.pause(); music.seek(position); music.resume() }
    }
}
