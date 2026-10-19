import XCTest

final class SearchInteractionTests: XCTestCase {
    private func searchApp(historyFixture: Bool = false) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-fixture", "--preview-search"]
        app.launchEnvironment["UNDERTONE_UI_OFFLINE"] = "1"
        if historyFixture { app.launchEnvironment["UNDERTONE_UI_SEARCH_UX"] = "1" }
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
            XCTAssertGreaterThanOrEqual(button.frame.height, 44)
        }
        XCTAssertTrue(app.buttons["ALBUMS"].isSelected)
    }

    func testEmptyQueryIsHistoryAndNeverAllTracks() {
        let app = searchApp(historyFixture: true)
        XCTAssertTrue(app.staticTexts["SEARCH HISTORY"].exists)
        XCTAssertTrue(app.buttons["searchHistory_Midnight"].isHittable)
        XCTAssertFalse(app.collectionViews["musicSearchList"].buttons["Меню Midnight city"].exists)
        XCTAssertFalse(app.staticTexts["RESULTS"].exists)
        app.buttons["searchHistory_Midnight"].tap()
        XCTAssertTrue(app.staticTexts["Midnight city"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["RESULTS"].exists)
        XCTAssertFalse(app.staticTexts["SEARCH HISTORY"].exists)
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
    }

    func testQueryAndHistoryClearHaveSeparateActionsAndLargeTargets() {
        let app = searchApp(historyFixture: true)
        app.buttons["searchHistory_Midnight"].tap()
        XCTAssertTrue(app.staticTexts["Midnight city"].waitForExistence(timeout: 5))
        let clear = app.buttons["clearMusicSearch"]
        XCTAssertGreaterThanOrEqual(clear.frame.width, 44)
        XCTAssertGreaterThanOrEqual(clear.frame.height, 44)
        clear.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        app.buttons["dismissSearchKeyboard"].tap()
        let history = app.buttons["searchHistory_Midnight"]
        XCTAssertTrue(history.isHittable)
        app.buttons["Удалить запрос: Midnight"].tap()
        XCTAssertFalse(history.exists)
        XCTAssertTrue(app.buttons["searchHistory_Ночной Drive"].exists)
        let clearHistory = app.buttons["clearSearchHistory"]
        XCTAssertGreaterThanOrEqual(clearHistory.frame.height, 44)
        clearHistory.tap()
        XCTAssertTrue(app.staticTexts["Найди свою музыку"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["searchHistory_Ночной Drive"].exists)
        XCTAssertFalse(app.staticTexts["RESULTS"].exists)
    }

    func testNoMatchesIsExplicitForEveryFilterAndQueryStaysIntact() {
        let app = searchApp()
        let field = app.textFields["musicSearchField"]
        field.tap(); field.typeText("zzzz_no_matching_123\n")
        for title in ["SONGS", "ALBUMS", "ARTISTS", "PLAYLISTS"] {
            app.buttons[title].tap()
            XCTAssertTrue(app.staticTexts["Ничего не найдено"].waitForExistence(timeout: 5))
            XCTAssertEqual(field.value as? String, "zzzz_no_matching_123")
            XCTAssertTrue(app.buttons[title].isSelected)
            XCTAssertFalse(app.staticTexts["SEARCH HISTORY"].exists)
        }
    }

    func testLatestQueryWinsAfterClearDuringSearch() {
        let app = searchApp()
        let field = app.textFields["musicSearchField"]
        field.tap(); field.typeText("Midnight")
        app.buttons["clearMusicSearch"].tap()
        field.typeText("Far away\n")
        XCTAssertTrue(app.staticTexts["Far away"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.collectionViews["musicSearchList"].staticTexts["Midnight city"].exists)
        XCTAssertEqual(field.value as? String, "Far away")
    }

    func testMixedLanguageLongResultKeepsCommonActions() {
        let app = searchApp(historyFixture: true)
        app.buttons["searchHistory_Ночной Drive"].tap()
        let menu = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Меню Ночной Drive · ")).firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout: 5))
        XCTAssertTrue(menu.isHittable)
        XCTAssertEqual(app.textFields["musicSearchField"].value as? String, "Ночной Drive")
        menu.tap()
        XCTAssertTrue(app.buttons["PLAY NEXT"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["ADD TO QUEUE"].exists)
    }

    func testEntityBackPreservesQueryFilterAndDismissedKeyboard() {
        let app = searchApp(historyFixture: true)
        let field = app.textFields["musicSearchField"]
        field.tap(); field.typeText("Demo\n")
        app.buttons["ALBUMS"].tap()
        let album = app.buttons["Demo Artist — Night drive"].firstMatch
        XCTAssertTrue(album.waitForExistence(timeout: 5)); album.tap()
        XCTAssertTrue(app.navigationBars["Demo Artist — Night drive"].waitForExistence(timeout: 5))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        XCTAssertEqual(field.value as? String, "Demo")
        XCTAssertTrue(app.buttons["ALBUMS"].isSelected)
        XCTAssertTrue(album.isHittable)
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        app.tabBars.buttons["HOME"].tap()
        app.tabBars.buttons["SEARCH"].tap()
        XCTAssertEqual(field.value as? String, "Demo")
        XCTAssertTrue(app.buttons["ALBUMS"].isSelected)
    }

    func testArtistAndPlaylistResultsStillOpenTheirCollections() {
        let app = searchApp(historyFixture: true)
        let field = app.textFields["musicSearchField"]
        field.tap(); field.typeText("Demo\n")
        for (filter, name) in [("ARTISTS", "Demo Artist"), ("PLAYLISTS", "Demo вечерний Mix")] {
            app.buttons[filter].tap()
            let result = app.buttons[name].firstMatch
            XCTAssertTrue(result.waitForExistence(timeout: 5)); result.tap()
            XCTAssertTrue(app.navigationBars[name].waitForExistence(timeout: 5))
            app.navigationBars.buttons.element(boundBy: 0).tap()
            XCTAssertTrue(field.waitForExistence(timeout: 5))
            XCTAssertEqual(field.value as? String, "Demo")
            XCTAssertTrue(app.buttons[filter].isSelected)
        }
    }
}
