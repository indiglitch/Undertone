import AVFoundation
import MediaPlayer
import Combine

@MainActor
final class MusicPlayer: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published private(set) var current: Song?
    @Published private(set) var playing = false
    @Published private(set) var position = 0.0
    @Published private(set) var duration = 0.0
    @Published var error: String?
    private var audio: AVAudioPlayer?
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
            guard let self, let audio = self.audio else { return }
            self.position = audio.currentTime
        }
        observers.append(NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)
            .receive(on: RunLoop.main).sink { [weak self] notification in
                guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                      let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
                if type == .began { self?.pause() }
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
        audio?.stop()
        playing = false
        do {
            let url = try await repository.fileURL(song)
            guard generation == playGeneration else { return }
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default)
            try session.setActive(true)
            let candidate = try AVAudioPlayer(contentsOf: url)
            candidate.delegate = self
            candidate.prepareToPlay()
            guard candidate.play() else { throw CocoaError(.fileReadUnknown) }
            audio = candidate
            self.repository = repository
            self.queue = queue
            current = song
            duration = candidate.duration
            position = 0
            playing = true
            updateNowPlaying()
        } catch {
            guard generation == playGeneration else { return }
            audio = nil
            current = nil
            position = 0
            duration = 0
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            self.error = "Не удалось воспроизвести \(song.title). \(error.localizedDescription)"
        }
    }

    func resume() {
        guard let audio else { return }
        do {
            try AVAudioSession.sharedInstance().setActive(true)
            playing = audio.play()
            updateNowPlaying()
        } catch { self.error = error.localizedDescription }
    }
    func pause() { audio?.pause(); playing = false; updateNowPlaying() }
    func toggle() { playing ? pause() : resume() }
    func seek(_ value: Double) {
        guard value.isFinite else { return }
        audio?.currentTime = min(max(0, value), duration)
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
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: current.title,
            MPMediaItemPropertyArtist: current.artist,
            MPMediaItemPropertyAlbumTitle: current.album,
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: audio?.currentTime ?? position,
            MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0
        ]
    }
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor [weak self] in
            guard let self, self.audio === player else { return }
            self.playing = false
            if flag { await self.advance(1) } else { self.updateNowPlaying() }
        }
    }
}
