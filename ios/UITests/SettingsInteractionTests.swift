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
        for _ in 0..<15 { if element.isHittable { return }; app.swipeUp() }
        XCTAssertTrue(element.isHittable)
    }
    func testAppearanceSwitchesRemainReversibleWithNativeTargets() {
        let app = fixture()
        for id in ["settingsCreateTab", "settingsLyrics", "settingsVideo"] {
            let toggle = app.switches[id]; reveal(toggle, app: app)
            let original = toggle.value as? String
            XCTAssertGreaterThanOrEqual(toggle.frame.height, 44)
            toggle.tap(); XCTAssertNotEqual(toggle.value as? String, original)
            toggle.tap(); XCTAssertEqual(toggle.value as? String, original)
        }
    }
    func testCrossfadeCanBeChangedWithoutStartingPlayback() {
        let app = fixture()
        let slider = app.sliders["settingsCrossfade"]
        slider.adjust(toNormalizedSliderPosition: 0.5)
        XCTAssertEqual(slider.value as? String, "6 s")
        XCTAssertEqual(app.buttons["miniPlayerToggle"].label, "PLAY")
        slider.adjust(toNormalizedSliderPosition: 0)
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
        for _ in 0..<10 { if downloads.isHittable { break }; app.swipeDown() }
        XCTAssertTrue(downloads.isHittable); downloads.tap()
        XCTAssertTrue(app.navigationBars["DOWNLOADS"].waitForExistence(timeout: 5))
    }
}
