import AVFoundation

private final class VorbisHandle: @unchecked Sendable {
    let pointer: OpaquePointer
    init(_ pointer: OpaquePointer) { self.pointer = pointer }
    deinit { ut_vorbis_close(pointer) }
}
struct PCMChunk: @unchecked Sendable { let buffer: AVAudioPCMBuffer }
actor VorbisReader {
    private let handle: VorbisHandle
    let rate: Double
    let channels: Int
    let duration: Double
    init(file: URL) throws {
        var error: Int32 = 0
        guard let pointer = ut_vorbis_open(file.path, &error) else {
            throw NSError(domain: "OggVorbis", code: Int(error), userInfo: [NSLocalizedDescriptionKey: "Файл не является поддерживаемым Ogg Vorbis."])
        }
        handle = VorbisHandle(pointer)
        rate = Double(ut_vorbis_rate(pointer)); channels = Int(ut_vorbis_channels(pointer))
        guard rate > 0, channels > 0, channels <= 2 else { throw CocoaError(.fileReadUnknown) }
        duration = Double(ut_vorbis_length(pointer)) / rate
    }
    func read() -> PCMChunk? {
        let capacity = 8192
        var samples = [Float](repeating: 0, count: capacity * channels)
        let frames = samples.withUnsafeMutableBufferPointer { ut_vorbis_read(handle.pointer, $0.baseAddress, Int32($0.count)) }
        guard frames > 0, let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: AVAudioChannelCount(channels)),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)), let output = buffer.floatChannelData else { return nil }
        buffer.frameLength = AVAudioFrameCount(frames)
        for channel in 0..<channels { for frame in 0..<Int(frames) { output[channel][frame] = samples[frame * channels + channel] } }
        return PCMChunk(buffer: buffer)
    }
    func seek(_ seconds: Double) throws {
        guard ut_vorbis_seek(handle.pointer, UInt32(min(max(0, seconds * rate), Double(UInt32.max)))) != 0 else { throw CocoaError(.fileReadUnknown) }
    }
}

@MainActor
final class VorbisPlayback {
    private let engine = AVAudioEngine()
    private let node = AVAudioPlayerNode()
    private let reader: VorbisReader
    private let rate: Double
    let duration: Double
    private var base = 0.0
    private var pausedPosition = 0.0
    private var generation = 0
    private var queued = 0
    private var filling = false
    private var end = false
    private(set) var playing = false
    var finished: (() -> Void)?
    var currentTime: Double {
        guard playing, let time = node.lastRenderTime, let player = node.playerTime(forNodeTime: time) else { return pausedPosition }
        return min(duration, base + Double(player.sampleTime) / rate)
    }
    static func open(_ file: URL) async throws -> VorbisPlayback {
        let reader = try await Task.detached(priority: .userInitiated) { try VorbisReader(file: file) }.value
        let result = await VorbisPlayback(reader: reader)
        await result.fill(); return result
    }
    private init(reader: VorbisReader) async {
        self.reader = reader; rate = await reader.rate; duration = await reader.duration
        let channels = await reader.channels
        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: AVAudioFormat(standardFormatWithSampleRate: rate, channels: AVAudioChannelCount(channels)))
    }
    private func fill() async {
        guard !filling else { return }; filling = true; let operation = generation
        defer { filling = false }
        while queued < 4 && !end {
            guard let chunk = await reader.read() else { end = true; break }
            guard generation == operation else { return }
            queued += 1
            node.scheduleBuffer(chunk.buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
                Task { @MainActor in
                    guard let self, self.generation == operation else { return }
                    self.queued -= 1
                    if self.end && self.queued == 0 { self.playing = false; self.finished?() }
                    else { await self.fill() }
                }
            }
        }
    }
    func play() throws {
        if !engine.isRunning { try engine.start() }
        node.play(); playing = true
    }
    func pause() { pausedPosition = currentTime; node.pause(); playing = false }
    func stop() { generation += 1; node.stop(); engine.stop(); queued = 0; playing = false }
    func seek(_ seconds: Double) async throws {
        let wasPlaying = playing; generation += 1; node.stop(); queued = 0; end = false
        base = min(max(0, seconds), max(0, duration - 0.001)); pausedPosition = base
        try await reader.seek(base)
        // An old pump can be suspended in reader.read(); wait for it to discard its stale buffer.
        while filling { await Task.yield() }
        await fill(); if wasPlaying { try play() }
    }
}
