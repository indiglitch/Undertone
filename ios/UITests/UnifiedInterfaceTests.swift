import XCTest

final class UnifiedInterfaceTests: XCTestCase {
    private func fixture(_ page:String = "home") -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication(); if page == "search" { app.launchEnvironment["UNDERTONE_UI_OFFLINE"] = "1" }; app.launchArguments = ["--ui-fixture","--preview-" + page]; app.launch()
        if page == "search" { XCTAssertTrue(app.textFields["musicSearchField"].waitForExistence(timeout:15)) }
        else { XCTAssertTrue(app.buttons["syncLibrary"].waitForExistence(timeout:15)) }
        return app
    }
    func testHomeTrackHasCommonMenuAndSyncButton() {
        let app = fixture()
        let menu = app.buttons["Меню Midnight city"].firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout:10)); menu.tap()
        for title in ["Играть следующим","В конец очереди","В плейлист"] { XCTAssertTrue(app.buttons[title].waitForExistence(timeout:3)) }
    }
    func testRemoteTapShowsShortNonblockingErrorAndOneTrackList() {
        let app = fixture("search")
        XCTAssertTrue(app.staticTexts["Far away"].waitForExistence(timeout:10))
        app.staticTexts["Far away"].tap()
        let message = app.staticTexts.containing(NSPredicate(format:"label CONTAINS %@","Трек не скачан")).firstMatch
        XCTAssertTrue(message.waitForExistence(timeout:5)); XCTAssertEqual(app.alerts.count,0)
        XCTAssertFalse(app.staticTexts["На компьютере · 1"].exists)
        XCTAssertFalse(app.staticTexts["На iPhone · 1"].exists)
    }
    func testSearchTrackHasSameMenu() {
        let app = fixture("search")
        let menu = app.buttons["Меню Midnight city"].firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout:10)); menu.tap()
        for title in ["Играть следующим","В конец очереди","В плейлист"] { XCTAssertTrue(app.buttons[title].waitForExistence(timeout:3)) }
    }
    func testMigratedPlaylistHasContextMenuAndNoFolderCreation() {
        let app = fixture()
        let menu = app.buttons["Меню Вечером"].firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout:10)); menu.tap()
        XCTAssertTrue(app.buttons["Редактировать плейлист"].waitForExistence(timeout:3))
        XCTAssertFalse(app.buttons["В папку"].exists)
    }
}
