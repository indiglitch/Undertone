import Foundation

enum RepeatMode: String, CaseIterable { case off, all, one
    var title: String { switch self { case .off: return "Без повтора"; case .all: return "Повтор очереди"; case .one: return "Повтор трека" } }
    var icon: String { self == .one ? "repeat.1" : "repeat" }
}

struct PlaybackQueue {
    private(set) var songs: [Song] = []
    private(set) var index: Int = 0
    var mode: RepeatMode = .off
    var current: Song? { songs.indices.contains(index) ? songs[index] : nil }
    var upcoming: [Song] { Array(songs.dropFirst(index + 1)) }
    mutating func replace(_ source: [Song], selected: Song) {
        var seen = Set<String>()
        songs = source.filter { seen.insert($0.id).inserted }
        if !songs.contains(where: { $0.id == selected.id }) { songs.insert(selected, at: 0) }
        index = songs.firstIndex(where: { $0.id == selected.id }) ?? 0
    }
    mutating func enqueue(_ song: Song, next: Bool) {
        guard !songs.isEmpty else { songs = [song]; index = 0; return }
        guard song.id != current?.id else { return }
        if let old = songs.firstIndex(where: { $0.id == song.id }) {
            songs.remove(at: old); if old < index { index -= 1 }
        }
        songs.insert(song, at: next ? index + 1 : songs.endIndex)
    }
    mutating func select(_ id: String) -> Song? {
        guard let target = songs.firstIndex(where: { $0.id == id }) else { return nil }
        index = target; return current
    }
    mutating func advance(_ offset: Int, automatic: Bool) -> Song? {
        guard !songs.isEmpty else { return nil }
        if automatic && mode == .one { return current }
        let target = index + offset
        if songs.indices.contains(target) { index = target; return current }
        if mode == .all { index = target < 0 ? songs.count - 1 : 0; return current }
        return nil
    }
    mutating func removeUpcoming(_ offsets: IndexSet) {
        for offset in offsets.sorted(by: >) {
            let target = index + 1 + offset
            if songs.indices.contains(target) { songs.remove(at: target) }
        }
    }
    mutating func moveUpcoming(_ offsets: IndexSet, to destination: Int) {
        var tail = upcoming
        guard destination >= 0, destination <= tail.count, offsets.allSatisfy({ tail.indices.contains($0) }) else { return }
        let moved = offsets.sorted().map { tail[$0] }
        let insertion = destination - offsets.filter { $0 < destination }.count
        for offset in offsets.sorted(by: >) { tail.remove(at: offset) }
        tail.insert(contentsOf: moved, at: insertion)
        songs = Array(songs.prefix(index + 1)) + tail
    }
    mutating func clearUpcoming() { songs = Array(songs.prefix(index + 1)) }
    mutating func shuffleUpcoming() { songs = Array(songs.prefix(index + 1)) + upcoming.shuffled() }
}

enum LibrarySort: String, CaseIterable, Identifiable, Sendable {
    case title, artist, album, newest
    var id: String { rawValue }
    var title: String { switch self { case .title: return "Название"; case .artist: return "Исполнитель"; case .album: return "Альбом"; case .newest: return "Недавно добавленные" } }
    func sorted(_ songs: [Song]) -> [Song] {
        songs.sorted { a, b in
            if self == .newest && a.addedAt != b.addedAt { return a.addedAt > b.addedAt }
            let left = self == .artist ? a.artist : self == .album ? a.album : a.title
            let right = self == .artist ? b.artist : self == .album ? b.album : b.title
            let comparison = left.localizedStandardCompare(right)
            if comparison != .orderedSame { return comparison == .orderedAscending }
            let title = a.title.localizedStandardCompare(b.title)
            return title == .orderedSame ? a.id < b.id : title == .orderedAscending
        }
    }
    func sorted(_ tracks: [PCTrack]) -> [PCTrack] {
        // PC catalog has no added-at field; keep its stable order for newest.
        guard self != .newest else { return tracks }
        return tracks.sorted { a, b in
            let left = self == .artist ? a.artist : self == .album ? a.album : a.title
            let right = self == .artist ? b.artist : self == .album ? b.album : b.title
            let comparison = left.localizedStandardCompare(right)
            if comparison != .orderedSame { return comparison == .orderedAscending }
            let title = a.title.localizedStandardCompare(b.title)
            return title == .orderedSame ? a.id < b.id : title == .orderedAscending
        }
    }
}
