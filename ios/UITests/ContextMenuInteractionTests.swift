import XCTest

final class ContextMenuInteractionTests: XCTestCase {
    private func fixture() -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-fixture"]
        app.launchEnvironment["UNDERTONE_UI_OFFLINE"] = "1"
        app.launchEnvironment["UNDERTONE_UI_CONTEXT_MENUS"] = "1"
        app.launch()
        XCTAssertTrue(app.buttons["syncLibrary"].waitForExistence(timeout: 15))
        return app
    }
    private func search(_ text: String, app: XCUIApplication) {
        app.tabBars.buttons["SEARCH"].tap()
        let field = app.textFields["musicSearchField"]
        XCTAssertTrue(field.waitForExistence(timeout: 5)); field.tap(); field.typeText(text + "\n")
        XCTAssertTrue(app.buttons["Меню " + text].firstMatch.waitForExistence(timeout: 5))
    }
    private func open(_ title: String, app: XCUIApplication) {
        let menu = app.collectionViews.buttons.matching(NSPredicate(format: "label == %@", "Меню " + title)).firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout: 5)); menu.tap()
        XCTAssertTrue(app.buttons["PLAY NEXT"].waitForExistence(timeout: 5))
    }
    private func cancelAlert(_ app: XCUIApplication) {
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
        app.alerts.buttons["CANCEL"].tap()
        XCTAssertTrue(app.alerts.firstMatch.waitForNonExistence(timeout: 5))
    }

    func testLocalMenuKeepsFileToolsAndPlaybackBeforeRareActions() {
        let app = fixture()
        search("Midnight city", app: app)
        let menu = app.buttons["Меню Midnight city"].firstMatch
        XCTAssertGreaterThanOrEqual(menu.frame.width, 44)
        XCTAssertGreaterThanOrEqual(menu.frame.height, 44)
        open("Midnight city", app: app)
        for title in ["ADD TO QUEUE", "ADD TO PLAYLIST", "SHARE ORIGINAL", "FILE INFO", "TRACK CODE", "REMOVE PHONE COPY"] {
            XCTAssertTrue(app.buttons[title].exists)
        }
        XCTAssertFalse(app.buttons["DOWNLOAD ORIGINAL"].exists)
        XCTAssertFalse(app.buttons["REMOVE FROM PLAYLIST"].exists)
        XCTAssertLessThan(app.buttons["PLAY NEXT"].frame.minY, app.buttons["TRACK CODE"].frame.minY)
        app.buttons["FILE INFO"].tap()
        XCTAssertTrue(app.navigationBars["FILE INFO"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["На iPhone"].exists)
        app.buttons["closeTrackInformation"].tap()
        open("Midnight city", app: app); app.buttons["TRACK CODE"].tap()
        XCTAssertTrue(app.staticTexts["Код Undertone"].waitForExistence(timeout: 5))
        app.buttons["CLOSE"].tap()
        XCTAssertTrue(menu.waitForExistence(timeout: 5))
    }

    func testRemoteOfflineMenuKeepsMetadataAndQueueWithoutFileRemoval() {
        let app = fixture()
        search("Far away", app: app); open("Far away", app: app)
        XCTAssertTrue(app.buttons["ADD TO QUEUE"].isEnabled)
        XCTAssertTrue(app.buttons["DOWNLOAD ORIGINAL"].exists)
        XCTAssertFalse(app.buttons["DOWNLOAD ORIGINAL"].isEnabled)
        XCTAssertFalse(app.buttons["SHARE ORIGINAL"].isEnabled)
        XCTAssertFalse(app.buttons["REMOVE PHONE COPY"].exists)
        app.buttons["FILE INFO"].tap()
        XCTAssertTrue(app.staticTexts["На компьютере"].waitForExistence(timeout: 5))
    }

    func testMissingMetadataHasNoEmptyArtistAlbumLinks() {
        let app = fixture()
        search("Morning light", app: app); open("Morning light", app: app)
        XCTAssertFalse(app.buttons["GO TO ARTIST"].exists)
        XCTAssertFalse(app.buttons["GO TO ALBUM"].exists)
        XCTAssertTrue(app.buttons["TRACK CODE"].isEnabled)
    }

    func testCurrentTrackRemovalRequiresConfirmationAndKeepsUndo() {
        let app = fixture()
        search("Midnight city", app: app); open("Midnight city", app: app)
        app.buttons["REMOVE PHONE COPY"].tap(); cancelAlert(app)
        XCTAssertTrue(app.buttons["miniPlayerOpen"].exists)
        open("Midnight city", app: app); app.buttons["REMOVE PHONE COPY"].tap()
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
        app.alerts.buttons["REMOVE PHONE COPY"].tap()
        XCTAssertTrue(app.buttons["miniPlayerOpen"].waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.buttons["UNDO DELETE"].waitForExistence(timeout: 5))
        open("Midnight city", app: app)
        XCTAssertFalse(app.buttons["REMOVE PHONE COPY"].exists)
        XCTAssertTrue(app.buttons["DOWNLOAD ORIGINAL"].exists)
    }

    func testRemoveFromPlaylistPreservesLocalCopy() {
        let app = fixture()
        app.tabBars.buttons["LIBRARY"].tap(); app.buttons["PLAYLISTS"].tap()
        app.buttons["Вечером"].firstMatch.tap()
        open("Midnight city", app: app); app.buttons["REMOVE FROM PLAYLIST"].tap(); cancelAlert(app)
        XCTAssertTrue(app.collectionViews["musicCollectionList"].staticTexts["Midnight city"].exists)
        open("Midnight city", app: app); app.buttons["REMOVE FROM PLAYLIST"].tap()
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
        app.alerts.buttons["REMOVE FROM PLAYLIST"].tap()
        XCTAssertTrue(app.collectionViews["musicCollectionList"].staticTexts["Midnight city"].waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.buttons["miniPlayerOpen"].exists)
        search("Midnight city", app: app); open("Midnight city", app: app)
        XCTAssertTrue(app.buttons["REMOVE PHONE COPY"].exists)
    }

    func testPlaylistDeleteCancelKeepsCollectionAndFiles() {
        let app = fixture()
        let menu = app.buttons["Меню Вечером"].firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout: 5)); menu.tap()
        app.buttons["DELETE PLAYLIST"].tap(); cancelAlert(app)
        XCTAssertTrue(app.buttons["Вечером"].firstMatch.exists)
        XCTAssertTrue(app.buttons["miniPlayerOpen"].exists)
    }

    func testAlbumRemovalOnlyRemovesSavedLibraryEntry() {
        let app = fixture()
        app.tabBars.buttons["LIBRARY"].tap(); app.buttons["ALBUMS"].tap()
        let menu = app.buttons["Меню Demo Artist — Night drive"]
        XCTAssertTrue(menu.waitForExistence(timeout: 5)); menu.tap()
        app.buttons["REMOVE FROM LIBRARY"].tap(); cancelAlert(app)
        XCTAssertTrue(menu.exists); menu.tap()
        app.buttons["REMOVE FROM LIBRARY"].tap()
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
        app.alerts.buttons["REMOVE FROM LIBRARY"].tap()
        XCTAssertTrue(app.collectionViews["libraryHubList"].buttons["Меню Demo Artist — Night drive"].waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.buttons["miniPlayerOpen"].exists)
        search("Midnight city", app: app); open("Midnight city", app: app)
        XCTAssertTrue(app.buttons["REMOVE PHONE COPY"].exists)
    }

    func testBulkCopyRemovalCancellationPreservesSelectionAndPlayback() {
        let app = fixture()
        app.tabBars.buttons["LIBRARY"].tap(); app.buttons["ALL TRACKS"].firstMatch.tap()
        app.buttons["collectionSelect"].tap()
        app.buttons["Выбрать Midnight city"].tap()
        app.buttons["SELECTION ACTIONS"].tap()
        XCTAssertFalse(app.buttons["DOWNLOAD ORIGINALS"].exists)
        app.buttons["REMOVE PHONE COPIES"].tap(); cancelAlert(app)
        XCTAssertEqual(app.buttons["Выбрать Midnight city"].value as? String, "SELECTED")
        XCTAssertTrue(app.buttons["miniPlayerOpen"].exists)
        XCTAssertFalse(app.buttons["UNDO DELETE"].exists)
    }

    func testLongPressMenuAndPlayerMenuUseSameActions() {
        let app = fixture()
        search("Midnight city", app: app)
        app.collectionViews["musicSearchList"].staticTexts["Midnight city"].firstMatch.press(forDuration: 1)
        XCTAssertTrue(app.buttons["PLAY NEXT"].waitForExistence(timeout: 5))
        app.buttons["TRACK CODE"].tap()
        XCTAssertTrue(app.staticTexts["Код Undertone"].waitForExistence(timeout: 5)); app.buttons["CLOSE"].tap()
        app.buttons["miniPlayerOpen"].tap()
        app.buttons["TRACK ACTIONS"].tap()
        XCTAssertTrue(app.buttons["FILE INFO"].waitForExistence(timeout: 5))
        app.buttons["REMOVE PHONE COPY"].tap(); cancelAlert(app)
        XCTAssertTrue(app.buttons["playerToggle"].isHittable)
    }
}
