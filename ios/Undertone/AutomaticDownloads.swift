import Foundation

struct LikedDownloadTrigger: Hashable {
    let likes: Set<String>
    let catalogRevision: Int
    let ready: Bool
    let online: Bool
    let offline: Bool
}

enum DownloadSelection {
    static func missing(_ tracks: [PCTrack], ids: Set<String>, installed: Set<String>) -> [PCTrack] {
        var seen = Set<String>()
        return tracks.filter { ids.contains($0.id) && !installed.contains($0.id) && seen.insert($0.id).inserted }
    }
}
