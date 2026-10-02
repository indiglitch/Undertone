import XCTest

final class SearchInteractionTests: XCTestCase {
    private func searchApp() -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-fixture", "--preview-search"]
        app.launch()
        XCTAssertTrue(app.textFields["musicSearchField"].waitForExistence(timeout: 15))
        return app
    }
    func testKeyboardDoneAndSubmitDismiss() {
        let app = searchApp()
        let field = app.textFields["musicSearchField"]
        field.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        let done = app.buttons["dismissSearchKeyboard"]
        XCTAssertTrue(done.waitForExistence(timeout: 5))
        XCTAssertEqual(app.buttons.matching(identifier:"dismissSearchKeyboard").count,1)
        XCTAssertFalse(app.navigationBars.buttons["DONE"].exists)
        done.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        field.tap()
        field.typeText("rain\n")
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        XCTAssertEqual(field.value as? String, "rain")
    }
    func testFiltersDismissKeyboardAndFitScreen() {
        let app = searchApp()
        app.textFields["musicSearchField"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        app.buttons["ALBUMS"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Сканировать код Undertone"].exists)
        for title in ["SONGS", "ALBUMS", "ARTISTS", "PLAYLISTS"] {
            let button = app.buttons[title]
            XCTAssertTrue(button.isHittable)
            XCTAssertGreaterThanOrEqual(button.frame.minX, app.frame.minX)
            XCTAssertLessThanOrEqual(button.frame.maxX, app.frame.maxX)
        }
    }
}
