import XCTest

final class SettingsInteractionTests: XCTestCase {
    private func fixture(_ language: String = "en") -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-fixture", "-AppleLanguages", "(\(language))", "-AppleLocale", language == "ru" ? "ru_RU" : "en_US"]
        app.launchEnvironment["UNDERTONE_UI_OFFLINE"] = "1"
        app.launch()
        XCTAssertTrue(app.buttons["homeTools"].waitForExistence(timeout: 15))
        app.buttons["homeTools"].tap(); app.buttons["SETTINGS"].tap()
        XCTAssertTrue(app.sliders["settingsCrossfade"].waitForExistence(timeout: 5))
        return app
    }
    private func reveal(_ element: XCUIElement, app: XCUIApplication) {
        revealContent(element, app: app)
    }
    func testAppearanceSwitchesRemainReversibleWithNativeTargets() {
        let app = fixture()
        for id in ["settingsCreateTab", "settingsLyrics", "settingsVideo"] {
            let toggle = app.switches[id]; reveal(toggle, app: app)
            let original = toggle.value as? String
            XCTAssertGreaterThanOrEqual(toggle.frame.height, 44)
            toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
            waitForValue(toggle, original == "1" ? "0" : "1")
            toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
            waitForValue(toggle, original ?? "")
        }
    }
    func testCrossfadeCanBeChangedWithoutStartingPlayback() {
        let app = fixture()
        let slider = app.sliders["settingsCrossfade"]
        slider.adjust(toNormalizedSliderPosition: 1)
        waitForValue(slider, "12 s")
        XCTAssertEqual(app.buttons["miniPlayerToggle"].label, "PLAY")
        slider.adjust(toNormalizedSliderPosition: 0)
        waitForValue(slider, "0 s")
    }
    func testEnglishHistoryConfirmationCancelsWithoutRemovingMusic() {
        let app = fixture()
        let history = app.buttons["settingsHistory"]; reveal(history, app: app); history.tap()
        XCTAssertTrue(app.buttons["Cancel"].waitForExistence(timeout: 5)); app.buttons["Cancel"].tap()
        XCTAssertTrue(app.buttons["miniPlayerOpen"].exists)
        XCTAssertTrue(history.isHittable)
    }
    func testRussianSettingsAndConfirmationUseRussianResources() {
        let app = fixture("ru")
        XCTAssertTrue(app.navigationBars["Настройки"].exists)
        XCTAssertTrue(app.staticTexts["Воспроизведение"].exists)
        let history = app.buttons["settingsHistory"]; reveal(history, app: app)
        XCTAssertEqual(history.label, "Очистить историю")
        history.tap()
        XCTAssertTrue(app.buttons["Отмена"].waitForExistence(timeout: 5)); app.buttons["Отмена"].tap()
        XCTAssertFalse(app.buttons["Cancel"].exists)
    }
    func testStorageAndQueueRemainDistinctDestinations() {
        let app = fixture()
        let files = app.buttons["settingsFiles"]; reveal(files, app: app); files.tap()
        XCTAssertTrue(app.navigationBars["Files on this iPhone"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Midnight city"].exists)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        // Scroll back to Library & Downloads using the native Form.
        let downloads = app.buttons["settingsDownloads"]
        revealContent(downloads, app: app); downloads.tap()
        XCTAssertTrue(app.navigationBars["DOWNLOADS"].waitForExistence(timeout: 5))
    }
}
