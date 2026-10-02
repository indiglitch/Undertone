import Foundation

enum HomeRotation {
    static func page<T>(_ items: [T], offset: Int, limit: Int = 3) -> [T] {
        guard !items.isEmpty, limit > 0 else { return [] }
        return (0..<min(limit,items.count)).map { items[(max(0,offset) + $0) % items.count] }
    }
    static func next(_ offset: Int, count: Int, limit: Int = 3) -> Int {
        count > limit ? (offset + limit) % count : 0
    }
}
