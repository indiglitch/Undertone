import XCTest

// These opt-in fixtures test rendering/actions, not a simulated successful network transfer.
final class DownloadsInteractionTests: XCTestCase {
    private func fixture(_ mode: String) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-fixture"]
        app.launchEnvironment["UNDERTONE_UI_OFFLINE"] = "1"
        app.launchEnvironment["UNDERTONE_UI_DOWNLOADS"] = mode
        app.launch()
        XCTAssertTrue(app.buttons["openDownloads"].waitForExistence(timeout: 15))
        app.buttons["openDownloads"].tap()
        XCTAssertTrue(app.navigationBars["DOWNLOADS"].waitForExistence(timeout: 5))
        return app
    }
    private func reveal(_ element: XCUIElement, app: XCUIApplication) {
        for _ in 0..<30 {
            if element.isHittable { return }
            app.swipeUp()
        }
        XCTAssertTrue(element.isHittable)
    }
    func testCompletedOperationsDoNotContradictEmptyQueueOrLocalFiles() {
        let app = fixture("done")
        XCTAssertTrue(app.staticTexts["Очередь пуста"].exists)
        XCTAssertFalse(app.staticTexts["NO DOWNLOADS"].exists)
        XCTAssertTrue(app.staticTexts["ЗАВЕРШЕНО ЗА ЭТОТ ЗАПУСК · 2"].exists)
        XCTAssertTrue(app.staticTexts["Completed 0"].exists)
        let files = app.buttons["openDownloadedFiles"]
        reveal(files, app: app); files.tap()
        XCTAssertTrue(app.navigationBars["ON IPHONE"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Midnight city"].exists)
        XCTAssertFalse(app.staticTexts["Completed 0"].exists)
    }
    func testEmptySessionDoesNotShowGlobalCompletedOrQueueActions() {
        let app = fixture("empty")
        XCTAssertTrue(app.staticTexts["Очередь пуста"].exists)
        XCTAssertTrue(app.staticTexts["За этот запуск завершённых операций пока нет."].exists)
        XCTAssertFalse(app.buttons["PAUSE ALL"].exists)
        XCTAssertFalse(app.buttons["RESUME ALL"].exists)
        XCTAssertFalse(app.buttons["CANCEL QUEUE"].exists)
    }
    func testMixedQueueShowsRealStateVocabularyProgressAndSupportedActions() {
        let app = fixture("mixed")
        XCTAssertFalse(app.staticTexts["Очередь пуста"].exists)
        XCTAssertTrue(app.buttons["PAUSE ALL"].exists)
        XCTAssertTrue(app.buttons["RESUME ALL"].exists)
        let progress = app.otherElements["downloadProgress-" + String(format: "%032x", 5011)]
        reveal(progress, app: app)
        XCTAssertEqual(progress.value as? String, "35%")
        XCTAssertFalse(app.buttons["Загрузка Saving"].isEnabled)
        let paused = app.buttons["Загрузка Paused"]
        reveal(paused, app: app); paused.tap()
        XCTAssertTrue(app.buttons["RESUME"].isEnabled)
        app.buttons["RESUME"].tap()
        let row = app.otherElements["downloadRow-" + String(repeating: "b", count: 32)]
        XCTAssertTrue(row.staticTexts["В очереди"].waitForExistence(timeout: 5))
    }
    func testFailedRetryBecomesQueuedAndCancelPreservesInstalledFiles() {
        let app = fixture("mixed")
        let failed = app.buttons["Загрузка Failed"]
        reveal(failed, app: app); failed.tap(); app.buttons["RETRY"].tap()
        let row = app.otherElements["downloadRow-" + String(repeating: "c", count: 32)]
        XCTAssertTrue(row.staticTexts["В очереди"].waitForExistence(timeout: 5))
        failed.tap(); app.buttons["CANCEL DOWNLOAD"].tap()
        XCTAssertTrue(failed.waitForNonExistence(timeout: 5))
        let files = app.buttons["openDownloadedFiles"]
        reveal(files, app: app); files.tap()
        XCTAssertTrue(app.staticTexts["Midnight city"].waitForExistence(timeout: 5))
    }
    func testTrackListsUseTheSamePausedIndicator() {
        let app = fixture("mixed")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.tabBars.buttons["SEARCH"].tap()
        let field = app.textFields["musicSearchField"]
        XCTAssertTrue(field.waitForExistence(timeout: 5)); field.tap(); field.typeText("Far away\n")
        XCTAssertTrue(app.staticTexts["Приостановлено"].waitForExistence(timeout: 5))
    }
    func testLongQueueLastRowAndMenuStayAboveMiniPlayer() {
        let app = fixture("long")
        let title = "Queue 59 · " + String(repeating: "Длинное название Long title ", count: 3)
        let menu = app.buttons["Загрузка " + title]
        reveal(menu, app: app)
        XCTAssertGreaterThanOrEqual(menu.frame.width, 44)
        XCTAssertGreaterThanOrEqual(menu.frame.height, 44)
        XCTAssertLessThanOrEqual(menu.frame.maxY, app.buttons["miniPlayerOpen"].frame.minY)
        menu.tap()
        XCTAssertTrue(app.buttons["CANCEL DOWNLOAD"].waitForExistence(timeout: 5))
    }
    func testErrorDetailsRemainAfterToastAndCanBeDismissed() {
        let app = fixture("mixed")
        let details = app.buttons["Подробности ошибки"]
        reveal(details, app: app); details.tap()
        XCTAssertTrue(app.staticTexts["Fixture diagnostic: verification failed"].waitForExistence(timeout: 5))
        let dismiss = app.buttons["DISMISS ERROR"]; reveal(dismiss, app: app); dismiss.tap()
        XCTAssertTrue(details.waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Failed"].exists)
    }
}
