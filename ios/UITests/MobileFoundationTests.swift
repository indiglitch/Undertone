import XCTest

final class MobileFoundationTests: XCTestCase {
    private func fixture(longLibrary: Bool = false) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-fixture"]
        app.launchEnvironment["UNDERTONE_UI_OFFLINE"] = "1"
        if longLibrary { app.launchEnvironment["UNDERTONE_UI_LONG_LIBRARY"] = "1" }
        app.launch()
        XCTAssertTrue(app.buttons["miniPlayerOpen"].waitForExistence(timeout: 15))
        return app
    }

    func testMiniPlayerTargetsStaySeparateAcrossTabs() {
        let app = fixture()
        for tab in ["HOME", "SEARCH", "LIBRARY"] {
            app.tabBars.buttons[tab].tap()
            let open = app.buttons["miniPlayerOpen"]
            let toggle = app.buttons["miniPlayerToggle"]
            let next = app.buttons["miniPlayerNext"]
            let menu = app.buttons["miniPlayerMenu"]
            for target in [open, toggle, next, menu] {
                XCTAssertTrue(target.isHittable)
                XCTAssertGreaterThanOrEqual(target.frame.width, 44)
                XCTAssertGreaterThanOrEqual(target.frame.height, 44)
            }
            for pair in [(open, toggle), (toggle, next), (next, menu)] {
                XCTAssertLessThanOrEqual(pair.0.frame.maxX, pair.1.frame.minX)
            }
            XCTAssertLessThanOrEqual(open.frame.maxY, app.tabBars.firstMatch.frame.minY)
        }
    }

    func testKeyboardReleasesDockAndRestoresItAfterDone() {
        let app = fixture()
        app.tabBars.buttons["SEARCH"].tap()
        let field = app.textFields["musicSearchField"]
        field.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["miniPlayerOpen"].waitForNonExistence(timeout: 5))
        app.buttons["dismissSearchKeyboard"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.buttons["miniPlayerOpen"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.tabBars.buttons["LIBRARY"].isHittable)
    }

    func testPlayerAndNestedQueueReturnToSameDock() {
        let app = fixture()
        app.tabBars.buttons["SEARCH"].tap()
        app.buttons["miniPlayerOpen"].tap()
        let close = app.buttons["closePlayer"]
        XCTAssertTrue(close.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["miniPlayerToggle"].isHittable)
        app.buttons["openPlayerQueue"].tap()
        XCTAssertTrue(app.buttons["EDIT"].waitForExistence(timeout: 5))
        app.buttons["CLOSE"].tap()
        XCTAssertTrue(close.waitForExistence(timeout: 5))
        close.tap()
        XCTAssertTrue(app.buttons["miniPlayerOpen"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["musicSearchField"].isHittable)
        XCTAssertTrue(app.tabBars.buttons["SEARCH"].isSelected)
    }

    func testLastTrackScrollsFullyAboveDockInSearchAndLibrary() {
        let app = fixture(longLibrary: true)
        for tab in ["SEARCH", "LIBRARY"] {
            app.tabBars.buttons[tab].tap()
            if tab == "SEARCH" {
                let field = app.textFields["musicSearchField"]
                field.tap(); field.typeText("Demo\n")
                XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
            }
            if tab == "LIBRARY" { app.buttons["ALL TRACKS"].firstMatch.tap() }
            let list = app.collectionViews.firstMatch
            let last = app.staticTexts["ZZ Foundation 60"].firstMatch
            let menu = app.buttons["Меню ZZ Foundation 60"].firstMatch
            let dock = app.buttons["miniPlayerOpen"]
            XCTAssertTrue(list.waitForExistence(timeout: 5))
            for _ in 0..<24 {
                if last.exists && menu.isHittable && menu.frame.maxY + 12 <= dock.frame.minY { break }
                list.swipeUp()
            }
            XCTAssertTrue(last.isHittable)
            XCTAssertLessThanOrEqual(menu.frame.maxY + 12, dock.frame.minY)
            XCTAssertTrue(menu.isHittable)
        }
    }
}
