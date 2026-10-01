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
    private var fadingAudio: AVAudioPlayer?
    private var transitioning = false
    private var vorbis: VorbisPlayback?
    private var resumeAfterInterruption = false
    @Published private(set) var playbackQueue = PlaybackQueue()
    var upcoming: [Song] { playbackQueue.upcoming }
    var repeatMode: RepeatMode { playbackQueue.mode }
    private var repository: LibraryRepository?
    private var timer: AnyCancellable?
    private var observers: [AnyCancellable] = []
    private var playGeneration = 0
    private var sessionStorage = PlayerStorage()
    convenience init(storage: PlayerStorage) { self.init(); self.sessionStorage = storage }
    private var sessionSave: Task<Void,Never>?
    private var lastCheckpoint = Date.distantPast
    var onTrack: ((Song) -> Void)?
    func checkpoint() {
        guard let current else { return }
        let snapshot = PlayerSnapshot(ids: playbackQueue.songs.map(\.id), currentID: current.id, repeatMode: repeatMode.rawValue, position: position.isFinite ? max(0, position) : 0)
        let previous = sessionSave
        sessionSave = Task { await previous?.value; do { try await sessionStorage.save(snapshot) } catch { self.error = error.localizedDescription } }
    }
    func restore(_ songs: [Song], repository: LibraryRepository) async {
        guard current == nil else { return }
        do {
            guard let saved = try await sessionStorage.read() else { return }
            let mapped = Dictionary(songs.map { ($0.id, $0) }, uniquingKeysWith: { a,_ in a })
            guard let selected = mapped[saved.currentID] else { return }
            playbackQueue.replace(saved.ids.compactMap { mapped[$0] }, selected: selected)
            playbackQueue.mode = RepeatMode(rawValue: saved.repeatMode) ?? .off
            await start(selected, repository: repository, autoplay: false, initialPosition: saved.position)
        } catch { self.error = "Не удалось восстановить плеер: " + error.localizedDescription }
    }

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
            let next: Song? = self.repeatMode == .one ? self.playbackQueue.current :
                self.playbackQueue.songs.indices.contains(self.playbackQueue.index + 1) ? self.playbackQueue.songs[self.playbackQueue.index + 1] : self.repeatMode == .all ? self.playbackQueue.songs.first : nil
            let fade = CrossfadePolicy.duration(requested:UserDefaults.standard.double(forKey:"crossfadeSeconds"),current:self.duration,next:next?.duration ?? 0)
            if fade > 0, let audio = self.audio, self.vorbis == nil, !self.transitioning,
               self.duration > fade + 1, self.duration - audio.currentTime <= fade {
                self.transitioning = true
                Task { await self.advance(1,automatic:true,fadeDuration:fade); self.transitioning = false }
            }
            if Date().timeIntervalSince(self.lastCheckpoint) >= 5 { self.lastCheckpoint = Date(); self.checkpoint() }
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
        playbackQueue.replace(queue, selected: song)
        await start(song, repository: repository)
    }

    private func start(_ song: Song, repository: LibraryRepository, autoplay: Bool = true, initialPosition: Double = 0, fadeDuration: Double = 0) async {
        playGeneration += 1
        let generation = playGeneration
        // Stop before awaiting file resolution; never leave the old song playing behind new metadata.
        let oldAudio = audio
        fadingAudio?.stop(); fadingAudio = nil
        if fadeDuration <= 0 { oldAudio?.stop() } else { fadingAudio = oldAudio }; audio = nil; vorbis?.stop(); vorbis = nil
        playing = false
        do {
            let url = try await repository.fileURL(song)
            guard generation == playGeneration else { return }
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default)
            if autoplay { try session.setActive(true) }
            do {
                let prepared = try await Task.detached(priority: .userInitiated) {
                    let player = try AVAudioPlayer(contentsOf: url); player.prepareToPlay()
                    return PreparedNative(player: player)
                }.value
                guard generation == playGeneration else { return }
                let candidate = prepared.player; candidate.delegate = self
                candidate.currentTime = min(max(0, initialPosition.isFinite ? initialPosition : 0), max(0, candidate.duration - 0.01))
                let fade = (autoplay && oldAudio?.isPlaying == true) ? min(fadeDuration,max(0,(oldAudio?.duration ?? 0) - (oldAudio?.currentTime ?? 0)),candidate.duration/2) : 0
                candidate.volume = fade > 0 ? 0 : 1
                if autoplay { guard candidate.play() else { throw CocoaError(.fileReadUnknown) } }
                if fade > 0, let oldAudio {
                    fadingAudio = oldAudio; oldAudio.setVolume(0,fadeDuration:fade); candidate.setVolume(1,fadeDuration:fade)
                    Task { try? await Task.sleep(for:.seconds(fade)); oldAudio.stop(); if self.fadingAudio === oldAudio { self.fadingAudio = nil } }
                } else { oldAudio?.stop() }
                audio = candidate; duration = candidate.duration
            } catch {
                guard url.pathExtension.lowercased() == "ogg" else { throw error }
                oldAudio?.stop()
                let candidate = try await VorbisPlayback.open(url)
                guard generation == playGeneration else { candidate.stop(); return }
                candidate.finished = { [weak self] in Task { @MainActor in await self?.advance(1, automatic: true) } }
                if initialPosition > 0 { try await candidate.seek(initialPosition) }
                if autoplay { try candidate.play() }; vorbis = candidate; duration = candidate.duration
            }
            self.repository = repository
            current = song
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            position = audio?.currentTime ?? vorbis?.currentTime ?? 0
            playing = autoplay
            if autoplay { onTrack?(song) }; checkpoint()
            updateNowPlaying()
            let cover = await CoverStore.shared.image(song.syncID ?? song.id)
            if generation == playGeneration, let cover {
                var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
                info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: cover.size) { _ in cover }
                MPNowPlayingInfoCenter.default().nowPlayingInfo = info
            }
        } catch {
            guard generation == playGeneration else { return }
            oldAudio?.stop(); fadingAudio?.stop(); fadingAudio = nil
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
            updateNowPlaying(); if let current { onTrack?(current) }; checkpoint()
        } catch { self.error = error.localizedDescription }
    }
    func pause() { playGeneration += 1; fadingAudio?.stop(); fadingAudio = nil; audio?.pause(); audio?.setVolume(1,fadeDuration:0); vorbis?.pause(); playing = false; updateNowPlaying(); checkpoint() }
    func toggle() { playing ? pause() : resume() }
    func seek(_ value: Double) {
        guard value.isFinite else { return }
        let target = min(max(0, value), duration)
        if let vorbis { Task { do { try await vorbis.seek(target); position = vorbis.currentTime; updateNowPlaying(); checkpoint() } catch { self.error = error.localizedDescription } }; return }
        audio?.currentTime = target
        position = audio?.currentTime ?? 0
        updateNowPlaying(); checkpoint()
    }
    func advance(_ offset: Int, automatic: Bool = false, fadeDuration: Double = 0) async {
        guard let repository else { return }
        if offset < 0 && position > 3 { seek(0); return }
        guard let song = playbackQueue.advance(offset, automatic: automatic) else { pause(); return }
        await start(song, repository: repository, fadeDuration:fadeDuration)
    }
    func enqueue(_ song: Song, next: Bool, repository: LibraryRepository) async {
        guard current != nil else { await play(song, queue: [song], repository: repository); return }
        playbackQueue.enqueue(song, next: next); checkpoint()
    }
    func selectQueued(_ song: Song) async {
        guard let repository, let selected = playbackQueue.select(song.id) else { return }
        await start(selected, repository: repository)
    }
    func removeUpcoming(_ offsets: IndexSet) { playbackQueue.removeUpcoming(offsets); checkpoint() }
    func moveUpcoming(_ offsets: IndexSet, to destination: Int) { playbackQueue.moveUpcoming(offsets, to: destination); checkpoint() }
    func clearUpcoming() { playbackQueue.clearUpcoming(); checkpoint() }
    func forgetFiles(_ ids: Set<String>) {
        if let current, ids.contains(current.id) {
            pause(); audio?.stop(); audio = nil; vorbis?.stop(); vorbis = nil
            self.current = nil; position = 0; duration = 0
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            let previous = sessionSave
            sessionSave = Task { await previous?.value; do { try await sessionStorage.clear() } catch { self.error = error.localizedDescription } }
        }
        playbackQueue.removeFiles(ids); checkpoint()
    }
    func shuffleUpcoming() { playbackQueue.shuffleUpcoming(); checkpoint() }
    func cycleRepeat() {
        playbackQueue.mode = repeatMode == .off ? .all : repeatMode == .all ? .one : .off
        checkpoint()
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
            if flag { await self.advance(1, automatic: true) } else { self.updateNowPlaying() }
        }
    }
}

private struct PreparedNative: @unchecked Sendable { let player: AVAudioPlayer }
