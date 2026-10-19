import XCTest

// Screenshots document the fixture at assertion checkpoints, not visual approval.
final class SimulatorSmokeTests: XCTestCase {
    private var app: XCUIApplication!
    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["--ui-fixture", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launchEnvironment["UNDERTONE_UI_OFFLINE"] = "1"
        app.launchEnvironment["UNDERTONE_UI_LONG_LIBRARY"] = "1"
        app.launch()
        XCTAssertTrue(app.buttons["miniPlayerOpen"].waitForExistence(timeout: 15))
    }
    override func tearDownWithError() throws {
        if (testRun?.failureCount ?? 0) > 0 { capture("failure-last-screen") }
        app?.terminate()
    }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
    func testHomeBackTabsAndMiniPlayer() {
        XCTAssertTrue(app.buttons["homeAllTracks"].isHittable)
        capture("01-home")
        app.buttons["homeAllTracks"].tap()
        XCTAssertTrue(app.navigationBars["ALL TRACKS"].waitForExistence(timeout: 5))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.buttons["homeAllTracks"].waitForExistence(timeout: 5))
        app.tabBars.buttons["SEARCH"].tap()
        XCTAssertTrue(app.textFields["musicSearchField"].waitForExistence(timeout: 5))
        capture("02-search-empty")
        app.tabBars.buttons["LIBRARY"].tap()
        XCTAssertTrue(app.navigationBars["LIBRARY"].waitForExistence(timeout: 5))
        capture("04-library")
        let open = app.buttons["miniPlayerOpen"], toggle = app.buttons["miniPlayerToggle"]
        XCTAssertTrue(open.isHittable); XCTAssertTrue(toggle.isHittable)
        XCTAssertGreaterThanOrEqual(toggle.frame.height, 44)
        XCTAssertLessThanOrEqual(open.frame.maxX, toggle.frame.minX)
    }

    func testSearchListBottomAboveDock() {
        app.tabBars.buttons["SEARCH"].tap()
        let field = app.textFields["musicSearchField"]
        XCTAssertTrue(field.waitForExistence(timeout: 5)); field.tap(); field.typeText("Foundation\n")
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        let last = app.collectionViews["musicSearchList"].buttons["Меню ZZ Foundation 60"].firstMatch
        revealContent(last, app: app, attempts: 24)
        XCTAssertLessThanOrEqual(last.frame.maxY, app.buttons["miniPlayerOpen"].frame.minY)
        capture("03-search-list-bottom")
    }

    func testPlayerQueueModalRoundTrip() {
        app.tabBars.buttons["LIBRARY"].tap()
        app.buttons["miniPlayerOpen"].tap()
        XCTAssertTrue(app.buttons["playerToggle"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["miniPlayerToggle"].isHittable)
        capture("05-now-playing")
        app.buttons["openPlayerQueue"].tap()
        XCTAssertTrue(app.navigationBars["QUEUE"].waitForExistence(timeout: 5))
        capture("06-queue-modal")
        app.buttons["CLOSE"].tap()
        XCTAssertTrue(app.buttons["closePlayer"].waitForExistence(timeout: 5)); app.buttons["closePlayer"].tap()
        XCTAssertTrue(app.buttons["miniPlayerOpen"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.tabBars.buttons["LIBRARY"].isSelected)
        capture("07-restored-bottom-bars")
    }
}
