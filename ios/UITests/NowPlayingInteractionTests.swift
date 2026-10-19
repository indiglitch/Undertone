import XCTest

final class NowPlayingInteractionTests: XCTestCase {
    private func fixture(lyrics: String = "lrc") -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-fixture"]
        app.launchEnvironment["UNDERTONE_UI_OFFLINE"] = "1"
        app.launchEnvironment["UNDERTONE_UI_PLAYER_UX"] = "1"
        app.launchEnvironment["UNDERTONE_UI_PLAYER_LYRICS"] = lyrics
        app.launch()
        XCTAssertTrue(app.buttons["miniPlayerOpen"].waitForExistence(timeout: 15))
        app.buttons["miniPlayerOpen"].tap()
        XCTAssertTrue(app.buttons["playerToggle"].waitForExistence(timeout: 5))
        return app
    }
    private func scrollTo(_ element: XCUIElement, app: XCUIApplication) {
        for _ in 0..<8 {
            if element.isHittable { return }
            guard let scroll = app.scrollViews.allElementsBoundByIndex.first(where: { $0.isHittable }) else { break }
            scroll.swipeUp()
        }
        XCTAssertTrue(element.isHittable)
    }
    private func elapsed(_ app: XCUIApplication) -> Int {
        app.staticTexts["playerElapsed"].label.split(separator: ":").reduce(0) { $0 * 60 + (Int($1) ?? 0) }
    }

    func testSeekAndModalRoundTripsKeepPausedPosition() {
        let app = fixture()
        XCTAssertEqual(app.buttons["playerToggle"].label, "PLAY")
        app.sliders["playerTimeline"].adjust(toNormalizedSliderPosition: 0.5)
        XCTAssertTrue((28...32).contains(elapsed(app)))
        let position = elapsed(app)
        app.buttons["openPlayerQueue"].tap()
        XCTAssertTrue(app.navigationBars["QUEUE"].waitForExistence(timeout: 5))
        app.buttons["CLOSE"].tap()
        XCTAssertEqual(elapsed(app), position)
        app.buttons["closePlayer"].tap()
        XCTAssertTrue(app.buttons["miniPlayerOpen"].waitForExistence(timeout: 5))
        app.buttons["miniPlayerOpen"].tap()
        XCTAssertEqual(app.buttons["playerToggle"].label, "PLAY")
        XCTAssertEqual(elapsed(app), position)
    }

    func testTransportTargetsAndNextPreviousKeepExistingSemantics() {
        let app = fixture()
        for name in ["SHUFFLE UPCOMING", "PREVIOUS TRACK", "NEXT TRACK"] {
            XCTAssertTrue(app.buttons[name].isHittable)
            XCTAssertGreaterThanOrEqual(app.buttons[name].frame.width, 44)
            XCTAssertGreaterThanOrEqual(app.buttons[name].frame.height, 44)
        }
        XCTAssertGreaterThanOrEqual(app.buttons["playerToggle"].frame.width, 72)
        app.buttons["NEXT TRACK"].tap()
        let advanced = NSPredicate { _, _ in app.staticTexts["playerTrackTitle"].label == "Far away" && app.buttons["playerToggle"].label == "PAUSE" }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: advanced, object: nil)], timeout: 5), .completed)
        app.buttons["playerToggle"].tap()
        XCTAssertEqual(app.buttons["playerToggle"].label, "PLAY")
        app.sliders["playerTimeline"].adjust(toNormalizedSliderPosition: 0)
        app.buttons["PREVIOUS TRACK"].tap()
        let returned = NSPredicate { _, _ in app.staticTexts["playerTrackTitle"].label.hasPrefix("Midnight city") }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: returned, object: nil)], timeout: 5), .completed)
    }

    func testShuffleAndRepeatRemainReversible() {
        let app = fixture()
        let shuffle = app.buttons["SHUFFLE UPCOMING"], repeatButton = app.buttons["playerRepeat"]
        XCTAssertEqual(shuffle.value as? String, "OFF")
        shuffle.tap(); XCTAssertEqual(shuffle.value as? String, "ON")
        shuffle.tap(); XCTAssertEqual(shuffle.value as? String, "OFF")
        XCTAssertEqual(repeatButton.value as? String, "OFF")
        repeatButton.tap(); XCTAssertEqual(repeatButton.value as? String, "ON")
        repeatButton.tap(); XCTAssertEqual(repeatButton.value as? String, "ON")
        repeatButton.tap(); XCTAssertEqual(repeatButton.value as? String, "OFF")
        XCTAssertEqual(app.buttons["playerToggle"].label, "PLAY")
    }

    func testQueueSelectionDoesNotStartTrackAndRemovalKeepsCurrent() {
        let app = fixture()
        let title = app.staticTexts["playerTrackTitle"].label
        app.buttons["openPlayerQueue"].tap()
        XCTAssertTrue(app.buttons["SELECT"].waitForExistence(timeout: 5)); app.buttons["SELECT"].tap()
        app.staticTexts["Far away"].tap()
        XCTAssertEqual(app.buttons["Выбрать Far away"].value as? String, "SELECTED")
        app.buttons["REMOVE SELECTED · 1"].tap()
        XCTAssertTrue(app.staticTexts["Far away"].waitForNonExistence(timeout: 5))
        app.buttons["CLOSE"].tap()
        XCTAssertEqual(app.staticTexts["playerTrackTitle"].label, title)
        XCTAssertEqual(app.buttons["playerToggle"].label, "PLAY")
    }

    func testQueueEditReordersOnlyUpcoming() {
        let app = fixture()
        let title = app.staticTexts["playerTrackTitle"].label
        app.buttons["openPlayerQueue"].tap()
        XCTAssertTrue(app.buttons["EDIT"].waitForExistence(timeout: 5)); app.buttons["EDIT"].tap()
        let handles = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Reorder ")).allElementsBoundByIndex
        XCTAssertEqual(handles.count, 2)
        guard handles.count == 2 else { return }
        handles[0].press(forDuration: 0.2, thenDragTo: handles[1])
        XCTAssertGreaterThan(app.staticTexts["Far away"].frame.minY, app.staticTexts["Morning light"].frame.minY)
        app.buttons["DONE"].tap(); app.buttons["CLOSE"].tap()
        XCTAssertEqual(app.staticTexts["playerTrackTitle"].label, title)
        XCTAssertEqual(app.buttons["playerToggle"].label, "PLAY")
    }

    func testLRCAutoFollowYieldsToManualScrollAndLineTapSeeks() {
        let app = fixture()
        let full = app.buttons["openFullLyrics"]
        scrollTo(full, app: app); full.tap()
        let follow = app.buttons["lyricsFollow"]
        XCTAssertTrue(follow.waitForExistence(timeout: 5))
        XCTAssertEqual(follow.value as? String, "ON")
        let line = app.buttons["Line 10 Ночная музыка"].firstMatch
        scrollTo(line, app: app)
        XCTAssertEqual(follow.value as? String, "OFF")
        line.tap()
        app.buttons["closeFullLyrics"].tap()
        XCTAssertTrue((29...31).contains(elapsed(app)))
        XCTAssertEqual(app.buttons["playerToggle"].label, "PLAY")
        XCTAssertTrue(app.buttons["openPlayerQueue"].isHittable)
    }

    func testPlainTextAndPreviewToggleKeepFullLyricsAvailable() {
        let app = fixture(lyrics: "plain")
        let full = app.buttons["openFullLyrics"]
        scrollTo(full, app: app)
        app.buttons["lyricsActions"].tap(); app.buttons["PREVIEW"].tap()
        XCTAssertFalse(app.staticTexts["lyricsPreview"].exists)
        full.tap()
        XCTAssertTrue(app.staticTexts["Plain TXT lyrics\nВторая строка без синхронизации"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["lyricsFollow"].exists)
        app.buttons["closeFullLyrics"].tap()
        XCTAssertEqual(app.buttons["playerToggle"].label, "PLAY")
    }

    func testMissingLyricsOfferImportAndControlsStayReachable() {
        let app = fixture(lyrics: "none")
        let importButton = app.buttons["IMPORT LRC / TXT"].firstMatch
        scrollTo(importButton, app: app)
        XCTAssertFalse(app.buttons["openFullLyrics"].exists)
        for name in ["playerToggle", "playerRepeat", "openPlayerQueue"] { XCTAssertTrue(app.buttons[name].isHittable) }
        XCTAssertTrue(app.staticTexts["playerTrackTitle"].label.count > 40)
        XCTAssertTrue(app.staticTexts["playerTrackArtist"].label.count > 40)
    }
}
