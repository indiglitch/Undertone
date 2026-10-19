import XCTest

final class LibraryCollectionsTests: XCTestCase {
    private func fixture() -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-fixture"]
        app.launchEnvironment["UNDERTONE_UI_OFFLINE"] = "1"
        app.launchEnvironment["UNDERTONE_UI_COLLECTIONS_UX"] = "1"
        app.launch()
        XCTAssertTrue(app.buttons["syncLibrary"].waitForExistence(timeout: 15))
        app.tabBars.buttons["LIBRARY"].tap()
        return app
    }
    private func back(_ app: XCUIApplication) { app.navigationBars.buttons.element(boundBy: 0).tap() }

    func testCoreCollectionsOpenAndRecentlyPlayedHasNoRepeatedIdleStatuses() {
        let app = fixture()
        for title in ["LIKED TRACKS", "ALL TRACKS", "RECENTLY PLAYED"] {
            app.buttons[title].firstMatch.tap()
            XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 5))
            XCTAssertTrue(app.staticTexts["Midnight city"].waitForExistence(timeout: 5))
            XCTAssertFalse(app.staticTexts["На iPhone"].exists)
            XCTAssertFalse(app.staticTexts["Скачать и слушать"].exists)
            if title == "RECENTLY PLAYED" {
                XCTAssertTrue(app.staticTexts["LATEST FIRST"].exists)
                XCTAssertFalse(app.buttons["collectionSort"].exists)
            }
            back(app)
        }
    }

    func testSortChangesVisibleTrackOrder() {
        let app = fixture()
        app.buttons["ALL TRACKS"].firstMatch.tap()
        let sort = app.buttons["collectionSort"]
        XCTAssertTrue(sort.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Alpha Track"].waitForExistence(timeout: 5))
        XCTAssertLessThan(app.staticTexts["Alpha Track"].frame.minY, app.staticTexts["Zulu Track"].frame.minY)
        sort.tap(); app.buttons["ARTIST"].tap()
        let changed = NSPredicate { _, _ in sort.value as? String == "ARTIST" && app.staticTexts["Zulu Track"].frame.minY < app.staticTexts["Alpha Track"].frame.minY }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: changed, object: nil)], timeout: 5), .completed)
    }

    func testSelectingRowsDoesNotStartPlaybackAndBulkActionsStayAvailable() {
        let app = fixture()
        app.buttons["ALL TRACKS"].firstMatch.tap()
        app.buttons["collectionSelect"].tap()
        XCTAssertTrue(app.buttons["Выбрать Midnight city"].waitForExistence(timeout: 5))
        app.staticTexts["Midnight city"].firstMatch.tap()
        XCTAssertEqual(app.buttons["Выбрать Midnight city"].value as? String, "SELECTED")
        XCTAssertEqual(app.buttons["miniPlayerToggle"].label, "PLAY")
        app.buttons["SELECT ALL"].tap()
        XCTAssertTrue(app.buttons["CLEAR SELECTION"].exists)
        app.buttons["SELECTION ACTIONS"].tap()
        for title in ["DOWNLOAD ORIGINALS", "ADD TO PLAYLIST", "LIKE", "REMOVE PHONE COPIES"] {
            XCTAssertTrue(app.buttons[title].exists)
        }
    }

    func testEmptyPlaylistKeepsManagementAndHidesInapplicablePlaybackDownload() {
        let app = fixture()
        app.buttons["PLAYLISTS"].tap()
        app.buttons["Empty Collection"].tap()
        XCTAssertTrue(app.staticTexts["Пока нет треков"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["PLAY"].firstMatch.isEnabled)
        app.buttons["collectionActions"].tap()
        for title in ["EDIT PLAYLIST", "DELETE PLAYLIST"] { XCTAssertTrue(app.buttons[title].isEnabled) }
        XCTAssertFalse(app.buttons["DOWNLOAD PLAYLIST"].exists)
        app.buttons["EDIT PLAYLIST"].tap()
        XCTAssertTrue(app.navigationBars["EDIT PLAYLIST"].waitForExistence(timeout: 5))
        app.buttons["CANCEL"].tap()
        XCTAssertTrue(app.buttons["collectionActions"].waitForExistence(timeout: 5))
    }

    func testCreateRenameAndDeletePlaylistOffline() {
        let app = fixture()
        app.buttons["PLAYLISTS"].tap()
        app.buttons["libraryCreatePlaylist"].tap()
        let name = app.textFields["Название"]
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        name.tap(); name.typeText("Library UX")
        app.buttons["CREATE PLAYLIST"].tap()
        let created = app.buttons["Library UX"].firstMatch
        XCTAssertTrue(created.waitForExistence(timeout: 5)); created.tap()
        app.buttons["collectionActions"].tap(); app.buttons["EDIT PLAYLIST"].tap()
        XCTAssertTrue(name.waitForExistence(timeout: 5)); name.tap(); name.typeText(" Updated")
        let renamed = name.value as? String ?? ""
        XCTAssertNotEqual(renamed, "Library UX")
        app.buttons["SAVE"].tap()
        back(app)
        let row = app.buttons[renamed].firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 5)); row.tap()
        app.buttons["collectionActions"].tap(); app.buttons["DELETE PLAYLIST"].tap()
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
        app.alerts.buttons["DELETE PLAYLIST"].tap()
        back(app)
        XCTAssertTrue(row.waitForNonExistence(timeout: 5))
    }

    func testSavedAlbumsAndArtistsKeepTheirCollectionLinks() {
        let app = fixture()
        for (filter, title) in [("ALBUMS", "Demo Artist — Night drive"), ("ARTISTS", "Demo Artist")] {
            app.buttons[filter].tap()
            let row = app.buttons[title].firstMatch
            XCTAssertTrue(row.waitForExistence(timeout: 5)); row.tap()
            XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 5))
            XCTAssertTrue(app.staticTexts["Midnight city"].waitForExistence(timeout: 5))
            back(app)
        }
    }

    func testLongPlaylistNameAndMissingArtworkKeepSeparateNavigationAndMenu() {
        let app = fixture()
        app.buttons["PLAYLISTS"].tap()
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Long Collection — ")).firstMatch
        let menu = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Меню Long Collection — ")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        XCTAssertTrue(menu.isHittable)
        XCTAssertGreaterThanOrEqual(menu.frame.width, 44)
        XCTAssertLessThanOrEqual(row.frame.maxX, menu.frame.minX)
        let title = row.label
        row.tap()
        XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["collectionActions"].isHittable)
    }
}
