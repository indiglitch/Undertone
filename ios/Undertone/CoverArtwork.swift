import SwiftUI
import ImageIO
import AVFoundation

actor CoverStore {
    static let shared = CoverStore()
    private let root = LibraryRepository.defaultRoot().appendingPathComponent("Artwork", isDirectory: true)
    private let memory = NSCache<NSString, UIImage>()
    private init() { memory.countLimit = 120; memory.totalCostLimit = 16 * 1024 * 1024 }
    private func path(_ id: String) -> URL { root.appendingPathComponent(id + ".jpg") }
    func contains(_ id: String) -> Bool { FileManager.default.fileExists(atPath: path(id).path) }
    func install(_ bytes: Data, id: String) throws {
        guard id.count == 32 || id.count == 64, id.allSatisfy(\.isHexDigit), bytes.count <= 8 * 1024 * 1024,
              let source = CGImageSourceCreateWithData(bytes as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: 640,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceShouldCacheImmediately: true
              ] as CFDictionary), let jpeg = UIImage(cgImage: image).jpegData(compressionQuality: 0.85) else { return }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try jpeg.write(to: path(id), options: .atomic); memory.removeObject(forKey: id as NSString)
    }
    func image(_ id: String) -> UIImage? {
        if let image = memory.object(forKey: id as NSString) { return image }
        guard let source = CGImageSourceCreateWithURL(path(id) as CFURL, nil),
              let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: 350, kCGImageSourceShouldCacheImmediately: true] as CFDictionary) else { return nil }
        let image = UIImage(cgImage: cg); memory.setObject(image, forKey: id as NSString, cost: cg.bytesPerRow * cg.height); return image
    }
    func extract(_ file: URL, id: String) async {
        guard !contains(id) else { return }
        let asset = AVURLAsset(url: file)
        guard let metadata = try? await asset.load(.commonMetadata),
              let cover = metadata.first(where: { $0.commonKey == .commonKeyArtwork }),
              let bytes = try? await cover.load(.dataValue) else { return }
        try? install(bytes, id: id)
    }
    func fetchPC(_ track: PCTrack) async {
        guard track.has_cover == true, !contains(track.id), let pairing = PCKeychain.read(),
              let url = URL(string: pairing.address + "/v1/artwork/" + track.id) else { return }
        let config = URLSessionConfiguration.ephemeral; config.timeoutIntervalForRequest = 10
        let session = URLSession(configuration: config, delegate: PinnedPCSession(pairing), delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        var request = URLRequest(url: url); request.setValue("Bearer " + pairing.token, forHTTPHeaderField: "Authorization")
        if let (data, response) = try? await session.data(for: request), (response as? HTTPURLResponse)?.statusCode == 200 { try? install(data, id: track.id) }
    }
}

struct CoverArtwork: View {
    let id: String?
    var size: CGFloat = 52
    var remote: PCTrack?
    @State private var image: UIImage?
    var body: some View {
        Group {
            if let image { Image(uiImage: image).resizable().scaledToFill().frame(width: size, height: size).clipped() }
            else { Artwork(size: size) }
        }
        .frame(width: size, height: size).clipShape(RoundedRectangle(cornerRadius: size * 0.22))
        .overlay(RoundedRectangle(cornerRadius: size * 0.22).stroke(.white.opacity(0.1), lineWidth: 1))
        .task(id: id) {
            image = nil; guard let id else { return }
            image = await CoverStore.shared.image(id)
            if image == nil, let remote, remote.has_cover == true {
                await CoverStore.shared.fetchPC(remote)
                guard !Task.isCancelled else { return }; image = await CoverStore.shared.image(id)
            }
        }
        .accessibilityHidden(true)
    }
}
