import XCTest
@testable import Undertone

final class PlayerPresentationTests: XCTestCase {
    func testTimelineHandlesInvalidValuesAndClampsToTheCurrentDuration() {
        XCTAssertEqual(PlayerTimePresentation.duration(.nan), 0)
        XCTAssertEqual(PlayerTimePresentation.duration(.infinity), 0)
        XCTAssertEqual(PlayerTimePresentation.clamp(-20, duration: 60), 0)
        XCTAssertEqual(PlayerTimePresentation.clamp(90, duration: 60), 60)
        XCTAssertEqual(PlayerTimePresentation.clamp(30, duration: 60), 30)
        XCTAssertEqual(PlayerTimePresentation.clamp(.nan, duration: 60), 0)
        XCTAssertEqual(PlayerTimePresentation.clamp(10, duration: 0), 0)
    }
    func testClockKeepsMinutesSecondsAndSupportsLongFiles() {
        XCTAssertEqual(PlayerTimePresentation.clock(0), "0:00")
        XCTAssertEqual(PlayerTimePresentation.clock(59.9), "0:59")
        XCTAssertEqual(PlayerTimePresentation.clock(60), "1:00")
        XCTAssertEqual(PlayerTimePresentation.clock(3661), "1:01:01")
        XCTAssertEqual(PlayerTimePresentation.clock(.nan), "0:00")
        XCTAssertEqual(PlayerTimePresentation.clock(-1), "0:00")
    }
    func testLRCPreviewUsesExistingParsedTimestamps() {
        let document = LyricsDocument.parse("[00:01.500][00:03]Ночная музыка\n[00:10]Next line")
        XCTAssertTrue(LyricsPresentation.hasText(document))
        XCTAssertNil(LyricsPresentation.active(document, position: 1))
        XCTAssertEqual(LyricsPresentation.active(document, position: 1.5), 1500)
        XCTAssertEqual(LyricsPresentation.active(document, position: 5), 3000)
        XCTAssertEqual(LyricsPresentation.active(document, position: 10), 10000)
        XCTAssertNil(LyricsPresentation.active(document, position: .nan))
    }
    func testPlainTXTAndEmptyDocumentsRemainDistinct() {
        let plain = LyricsDocument.parse("Plain text\nТекст без синхронизации")
        XCTAssertTrue(plain.lines.isEmpty)
        XCTAssertTrue(LyricsPresentation.hasText(plain))
        XCTAssertNil(LyricsPresentation.active(plain, position: 20))
        XCTAssertFalse(LyricsPresentation.hasText(LyricsDocument.parse(" \n\t")))
    }
}
