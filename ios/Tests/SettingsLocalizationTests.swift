import XCTest
@testable import Undertone

final class SettingsLocalizationTests: XCTestCase {
    func testBundledSettingsTranslationsHaveMatchingKeysAndNoMissingValues() throws {
        let app = Bundle(for: PCConnection.self)
        var tables: [[String: String]] = []
        for language in ["en", "ru"] {
            let folder = try XCTUnwrap(app.path(forResource: language, ofType: "lproj"))
            let bundle = try XCTUnwrap(Bundle(path: folder))
            let url = try XCTUnwrap(bundle.url(forResource: "Settings", withExtension: "strings"))
            let values = try PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil) as! [String: String]
            XCTAssertFalse(values.isEmpty)
            XCTAssertFalse(values.values.contains(where: { $0.isEmpty }))
            tables.append(values)
        }
        XCTAssertEqual(Set(tables[0].keys), Set(tables[1].keys))
        XCTAssertEqual(tables[0]["Settings"], "Settings")
        XCTAssertEqual(tables[1]["Settings"], "Настройки")
        XCTAssertEqual(tables[1]["%lld s"], "%lld с")
    }
}
