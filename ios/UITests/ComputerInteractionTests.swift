import XCTest

final class ComputerInteractionTests: XCTestCase {
    private func fixture(_ mode: String) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-fixture"]
        app.launchEnvironment["UNDERTONE_UI_COMPUTER"] = mode
        app.launchEnvironment["UNDERTONE_UI_OFFLINE"] = mode == "offline" ? "1" : "0"
        app.launch()
        XCTAssertTrue(app.buttons["homeTools"].waitForExistence(timeout: 15))
        app.buttons["homeTools"].tap(); app.buttons["COMPUTER"].tap()
        XCTAssertTrue(app.staticTexts["computerIdentity"].waitForExistence(timeout: 5))
        return app
    }
    private func reveal(_ element: XCUIElement, app: XCUIApplication) {
        for _ in 0..<10 { if element.isHittable { return }; app.swipeUp() }
        XCTAssertTrue(element.isHittable)
    }
    func testUnpairedHasQRManualCodeAndOfflineFilesWithoutCatalogActions() {
        let app = fixture("unpaired")
        XCTAssertTrue(app.staticTexts["Компьютер не подключён"].exists)
        XCTAssertTrue(app.buttons["SCAN QR CODE"].isEnabled)
        XCTAssertFalse(app.buttons["computerRefresh"].exists)
        app.buttons["Вставить код вручную"].tap()
        let field = app.textViews["computerCode"]
        XCTAssertTrue(field.waitForExistence(timeout: 5)); field.tap(); field.typeText("bad code")
        app.buttons["DONE"].tap(); app.buttons["CONNECT"].tap()
        XCTAssertTrue(app.staticTexts["Не удалось завершить операцию"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["SCAN QR CODE"].isEnabled)
        let files = app.buttons["computerLocalFiles"]; reveal(files, app: app); files.tap()
        XCTAssertTrue(app.staticTexts["Midnight city"].waitForExistence(timeout: 5))
    }
    func testOfflineKeepsSavedCatalogButDisablesNetworkActions() {
        let app = fixture("offline")
        XCTAssertTrue(app.staticTexts["Офлайн-режим"].exists)
        XCTAssertFalse(app.buttons["computerRefresh"].isEnabled)
        XCTAssertFalse(app.buttons["computerDownload"].isEnabled)
        XCTAssertFalse(app.staticTexts["ПК доступен"].exists)
        let files = app.buttons["computerLocalFiles"]; reveal(files, app: app); files.tap()
        XCTAssertTrue(app.staticTexts["Midnight city"].waitForExistence(timeout: 5))
    }
    func testUnavailableKeepsReconnectAndHonestSyncError() {
        let app = fixture("unavailable")
        XCTAssertTrue(app.staticTexts["ПК пока недоступен"].exists)
        app.buttons["computerRefresh"].tap()
        XCTAssertTrue(app.staticTexts["Не удалось завершить операцию"].waitForExistence(timeout: 5))
        let manage = app.buttons["computerManagement"]; reveal(manage, app: app); manage.tap()
        let qr = app.buttons["SCAN QR CODE"]; reveal(qr, app: app)
        XCTAssertTrue(qr.isEnabled)
        let disconnect = app.buttons["DISCONNECT COMPUTER"]; reveal(disconnect, app: app); disconnect.tap()
        XCTAssertTrue(app.buttons["CANCEL"].waitForExistence(timeout: 5)); app.buttons["CANCEL"].tap()
        XCTAssertTrue(app.staticTexts["Сохранённый компьютер"].exists)
    }
    func testAvailableShowsCatalogDateAndDiagnosticsWithoutAddressInMainContent() {
        let app = fixture("available")
        XCTAssertTrue(app.staticTexts["ПК доступен"].exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Каталог обновлён:")).firstMatch.exists)
        XCTAssertTrue(app.buttons["computerRefresh"].isEnabled)
        XCTAssertFalse(app.staticTexts["https://192.168.1.4:3210"].isHittable)
        let diagnostic = app.buttons["Диагностика"]; reveal(diagnostic, app: app); diagnostic.tap()
        XCTAssertTrue(app.staticTexts["https://192.168.1.4:3210"].exists)
    }
    func testRefreshingDoesNotAlsoClaimAvailableAndBlocksDuplicateActions() {
        let app = fixture("refreshing")
        XCTAssertTrue(app.progressIndicators["computerProgress"].exists)
        XCTAssertFalse(app.staticTexts["ПК доступен"].exists)
        XCTAssertFalse(app.buttons["computerRefresh"].isEnabled)
        XCTAssertFalse(app.buttons["computerDownload"].isEnabled)
    }
    func testConfirmedDisconnectKeepsPhoneMusic() {
        let app = fixture("unavailable")
        let manage = app.buttons["computerManagement"]; reveal(manage, app: app); manage.tap()
        let disconnect = app.buttons["DISCONNECT COMPUTER"]; reveal(disconnect, app: app); disconnect.tap()
        XCTAssertTrue(app.buttons["CANCEL"].waitForExistence(timeout: 5))
        app.buttons["DISCONNECT COMPUTER"].firstMatch.tap()
        let files = app.buttons["computerLocalFiles"]; reveal(files, app: app); files.tap()
        XCTAssertTrue(app.staticTexts["Midnight city"].waitForExistence(timeout: 5))
    }
}
