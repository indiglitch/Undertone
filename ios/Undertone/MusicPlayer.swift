import AVFoundation
import MediaPlayer
import Combine

@MainActor
final class PlaybackClock: ObservableObject { @Published var position = 0.0 }

@MainActor
final class MusicPlayer: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published private(set) var current: Song?
    @Published private(set) var playing = false
    let clock = PlaybackClock()
    var position: Double { get { clock.position } set { clock.position = newValue } }
    @Published private(set) var duration = 0.0
    @Published var error: String?
    private var audio: AVAudioPlayer?
    private var vorbis: VorbisPlayback?
    private var resumeAfterInterruption = false
    private var queue: [Song] = []
    private var repository: LibraryRepository?
    private var timer: AnyCancellable?
    private var observers: [AnyCancellable] = []
    private var playGeneration = 0

    override init() {
        super.init()
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.resume() }; return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.pause() }; return .success
        }
        center.togglePlayPauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.toggle() }; return .success
        }
        center.nextTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in await self?.advance(1) }; return .success
        }
        center.previousTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in await self?.advance(-1) }; return .success
        }
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            let value = event.positionTime
            Task { @MainActor in self?.seek(value) }; return .success
        }
        timer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect().sink { [weak self] _ in
            guard let self, self.playing else { return }
            self.position = self.audio?.currentTime ?? self.vorbis?.currentTime ?? 0
        }
        observers.append(NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)
            .receive(on: RunLoop.main).sink { [weak self] notification in
                guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                      let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
                if type == .began { self?.resumeAfterInterruption = self?.playing ?? false; self?.pause() }
                else if self?.resumeAfterInterruption == true,
                        let raw = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt,
                        AVAudioSession.InterruptionOptions(rawValue: raw).contains(.shouldResume) { self?.resume() }
            })
        observers.append(NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification)
            .receive(on: RunLoop.main).sink { [weak self] notification in
                if let raw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                   AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable { self?.pause() }
            })
    }

    func play(_ song: Song, queue: [Song], repository: LibraryRepository) async {
        playGeneration += 1
        let generation = playGeneration
        // Stop before awaiting file resolution; never leave the old song playing behind new metadata.
        audio?.stop(); audio = nil; vorbis?.stop(); vorbis = nil
        playing = false
        do {
            let url = try await repository.fileURL(song)
            guard generation == playGeneration else { return }
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default)
            try session.setActive(true)
            do {
                let prepared = try await Task.detached(priority: .userInitiated) {
                    let player = try AVAudioPlayer(contentsOf: url); player.prepareToPlay()
                    return PreparedNative(player: player)
                }.value
                guard generation == playGeneration else { return }
                let candidate = prepared.player; candidate.delegate = self
                guard candidate.play() else { throw CocoaError(.fileReadUnknown) }
                audio = candidate; duration = candidate.duration
            } catch {
                guard url.pathExtension.lowercased() == "ogg" else { throw error }
                let candidate = try await VorbisPlayback.open(url)
                guard generation == playGeneration else { candidate.stop(); return }
                candidate.finished = { [weak self] in Task { @MainActor in await self?.advance(1) } }
                try candidate.play(); vorbis = candidate; duration = candidate.duration
            }
            self.repository = repository
            self.queue = queue
            current = song
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            position = 0
            playing = true
            updateNowPlaying()
            let cover = await CoverStore.shared.image(song.syncID ?? song.id)
            if generation == playGeneration, let cover {
                var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
                info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: cover.size) { _ in cover }
                MPNowPlayingInfoCenter.default().nowPlayingInfo = info
            }
        } catch {
            guard generation == playGeneration else { return }
            audio = nil; vorbis?.stop(); vorbis = nil
            current = nil
            position = 0
            duration = 0
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            self.error = "Не удалось воспроизвести \(song.title). \(error.localizedDescription)"
        }
    }

    func resume() {
        guard audio != nil || vorbis != nil else { return }
        do {
            try AVAudioSession.sharedInstance().setActive(true)
            if let audio { playing = audio.play() } else { try vorbis?.play(); playing = vorbis?.playing ?? false }
            updateNowPlaying()
        } catch { self.error = error.localizedDescription }
    }
    func pause() { audio?.pause(); vorbis?.pause(); playing = false; updateNowPlaying() }
    func toggle() { playing ? pause() : resume() }
    func seek(_ value: Double) {
        guard value.isFinite else { return }
        let target = min(max(0, value), duration)
        if let vorbis { Task { do { try await vorbis.seek(target); position = vorbis.currentTime; updateNowPlaying() } catch { self.error = error.localizedDescription } }; return }
        audio?.currentTime = target
        position = audio?.currentTime ?? 0
        updateNowPlaying()
    }
    func advance(_ offset: Int) async {
        guard let current, let index = queue.firstIndex(where: { $0.id == current.id }),
              let repository else { return }
        if offset < 0 && position > 3 { seek(0); return }
        let next = index + offset
        guard queue.indices.contains(next) else { pause(); return }
        await play(queue[next], queue: queue, repository: repository)
    }
    private func updateNowPlaying() {
        guard let current else { return }
        let artwork = MPNowPlayingInfoCenter.default().nowPlayingInfo?[MPMediaItemPropertyArtwork]
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: current.title,
            MPMediaItemPropertyArtist: current.artist,
            MPMediaItemPropertyAlbumTitle: current.album,
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: audio?.currentTime ?? vorbis?.currentTime ?? position,
            MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0
        ]
        if let artwork { info[MPMediaItemPropertyArtwork] = artwork }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor [weak self] in
            guard let self, self.audio === player else { return }
            self.playing = false
            if flag { await self.advance(1) } else { self.updateNowPlaying() }
        }
    }
}

private struct PreparedNative: @unchecked Sendable { let player: AVAudioPlayer }
