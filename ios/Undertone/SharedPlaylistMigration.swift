import Foundation

enum SharedPlaylistMigration {
    static func identity(_ id: String, songs: [Song]) -> String {
        songs.first(where: { $0.id == id || $0.sourceIDs.contains(id) })?.syncID ?? id
    }
    static func plan(_ legacy: [PersonalPlaylist], songs: [Song], visible: PCCollections) -> [PCEdit] {
        var edits: [PCEdit] = []
        for playlist in legacy {
            let id = playlist.id.replacingOccurrences(of:"-",with:"").lowercased()
            let existing = visible.playlists.first { $0.id == id }
            if existing == nil { edits.append(PCEdit(kind:"create_playlist",playlist:id,name:playlist.name)) }
            let present = Set(existing?.tracks ?? [])
            var seen = present
            for track in playlist.tracks {
                let mapped = identity(track,songs:songs)
                if seen.insert(mapped).inserted { edits.append(PCEdit(kind:"add_tracks",playlist:id,tracks:[mapped])) }
            }
            if existing == nil && !playlist.description.isEmpty { edits.append(PCEdit(kind:"describe_playlist",playlist:id,description:playlist.description)) }
        }
        return edits
    }
    static func remap(_ edits: [PCEdit], songs: [Song]) -> [PCEdit] {
        edits.map { edit in
            var mapped = edit
            mapped.track = edit.track.map { identity($0,songs:songs) }
            mapped.tracks = edit.tracks?.map { identity($0,songs:songs) }
            mapped.expected_tracks = edit.expected_tracks?.map { identity($0,songs:songs) }
            return mapped
        }
    }
    static func ready(_ edits: [PCEdit], limit: Int = 500) -> [PCEdit] {
        var blocked = Set<String>(), result: [PCEdit] = []
        for edit in edits {
            let references = (edit.tracks ?? []) + (edit.expected_tracks ?? []) + (edit.track.map { [$0] } ?? [])
            let waiting = references.contains { $0.count != 32 || !$0.allSatisfy(\.isHexDigit) }
            if let playlist = edit.playlist, waiting || blocked.contains(playlist) { blocked.insert(playlist); continue }
            if waiting { continue }
            result.append(edit)
            if result.count == limit { break }
        }
        return result
    }
}
