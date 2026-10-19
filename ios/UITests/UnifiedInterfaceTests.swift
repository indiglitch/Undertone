import XCTest

final class UnifiedInterfaceTests: XCTestCase {
    private func fixture(_ page:String = "home") -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication(); if page == "search" { app.launchEnvironment["UNDERTONE_UI_OFFLINE"] = "1" }; app.launchArguments = ["--ui-fixture","--preview-" + page]; app.launch()
        if page == "search" {
            let field = app.textFields["musicSearchField"]
            XCTAssertTrue(field.waitForExistence(timeout:15))
            field.tap(); field.typeText("Demo\n")
            XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout:5))
        }
        else { XCTAssertTrue(app.buttons["syncLibrary"].waitForExistence(timeout:15)) }
        return app
    }
    func testHomeTrackHasCommonMenuAndSyncButton() {
        let app = fixture()
        let menu = app.buttons["Меню Midnight city"].firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout:10)); menu.tap()
        for title in ["PLAY NEXT","ADD TO QUEUE","ADD TO PLAYLIST"] { XCTAssertTrue(app.buttons[title].waitForExistence(timeout:3)) }
    }
    func testShuffleIndicatesEnabledAndDisabled() {
        let app = fixture()
        app.buttons["miniPlayerOpen"].tap()
        let shuffle = app.buttons["SHUFFLE UPCOMING"]
        XCTAssertTrue(shuffle.waitForExistence(timeout:8))
        XCTAssertEqual(shuffle.value as? String,"OFF")
        shuffle.tap(); XCTAssertEqual(shuffle.value as? String,"ON")
        shuffle.tap(); XCTAssertEqual(shuffle.value as? String,"OFF")
    }
    func testQueueEditAndSelectHaveSeparateHitAreas() {
        let app = fixture()
        app.buttons["miniPlayerOpen"].tap()
        let queue = app.buttons["openPlayerQueue"]; XCTAssertTrue(queue.waitForExistence(timeout:8)); queue.tap()
        let edit = app.buttons["EDIT"], select = app.buttons["SELECT"]
        XCTAssertTrue(edit.waitForExistence(timeout:8)); XCTAssertTrue(select.isHittable)
        XCTAssertLessThan(edit.frame.maxX,select.frame.minX)
        select.tap(); XCTAssertTrue(app.buttons["DONE"].exists)
    }
    func testRemoteTapShowsShortNonblockingErrorAndOneTrackList() {
        let app = fixture("search")
        XCTAssertTrue(app.staticTexts["Far away"].waitForExistence(timeout:10))
        app.staticTexts["Far away"].tap()
        let message = app.staticTexts.containing(NSPredicate(format:"label CONTAINS %@","Трек не скачан")).firstMatch
        XCTAssertTrue(message.waitForExistence(timeout:5)); XCTAssertEqual(app.alerts.count,0)
        XCTAssertEqual(app.textFields["musicSearchField"].value as? String,"Demo")
        XCTAssertTrue(app.staticTexts["Far away"].isHittable)
        XCTAssertFalse(app.staticTexts["На компьютере · 1"].exists)
        XCTAssertFalse(app.staticTexts["На iPhone · 1"].exists)
    }
    func testSearchTrackHasSameMenu() {
        let app = fixture("search")
        let menu = app.buttons["Меню Midnight city"].firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout:10)); menu.tap()
        for title in ["PLAY NEXT","ADD TO QUEUE","ADD TO PLAYLIST"] { XCTAssertTrue(app.buttons[title].waitForExistence(timeout:3)) }
    }
    func testMigratedPlaylistHasContextMenuAndNoFolderCreation() {
        let app = fixture()
        let menu = app.buttons["Меню Вечером"].firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout:10)); menu.tap()
        XCTAssertTrue(app.buttons["EDIT PLAYLIST"].waitForExistence(timeout:3))
        XCTAssertTrue(app.buttons["downloadPlaylist"].exists)
        XCTAssertFalse(app.buttons["В папку"].exists)
    }
    func testDownloadsCanBeOpenedFromHome() {
        let app = fixture()
        app.buttons["openDownloads"].tap()
        XCTAssertTrue(app.navigationBars["DOWNLOADS"].waitForExistence(timeout:5))
        XCTAssertTrue(app.staticTexts["Очередь пуста"].waitForExistence(timeout:5))
    }
    func testLibraryAndTrackCollectionHaveVisibleTitles() {
        let app = fixture()
        app.tabBars.buttons["LIBRARY"].tap()
        XCTAssertTrue(app.navigationBars["LIBRARY"].waitForExistence(timeout:5))
        XCTAssertTrue(app.navigationBars["LIBRARY"].staticTexts["LIBRARY"].isHittable)
        app.buttons["ALL TRACKS"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["ALL TRACKS"].waitForExistence(timeout:5))
        XCTAssertTrue(app.navigationBars["ALL TRACKS"].staticTexts["ALL TRACKS"].isHittable)
    }
    func testRecentlyPlayedHeadingOpensHistory() {
        let app = fixture()
        let history = app.buttons["openRecentlyPlayed"]
        for _ in 0..<3 { if history.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(history.isHittable); history.tap()
        XCTAssertTrue(app.navigationBars["RECENTLY PLAYED"].waitForExistence(timeout:5))
    }

    func testAlbumsHeadingOpensAllAlbums() {
        let app = fixture()
        let albums = app.buttons["openAllAlbums"]
        for _ in 0..<5 { if albums.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(albums.isHittable); albums.tap()
        XCTAssertTrue(app.navigationBars["ALBUMS"].waitForExistence(timeout:5))
        XCTAssertTrue(app.staticTexts["Demo Artist — Night drive"].exists)
    }

    func testHomeActionsHaveSeparateHitAreasAndToolsRetainImport() {
        let app = fixture()
        let downloads = app.buttons["openDownloads"], sync = app.buttons["syncLibrary"], tools = app.buttons["homeTools"]
        XCTAssertTrue(sync.waitForExistence(timeout:10))
        XCTAssertTrue(downloads.isHittable); XCTAssertTrue(tools.isHittable)
        XCTAssertLessThan(downloads.frame.maxX,sync.frame.minX)
        XCTAssertGreaterThanOrEqual(sync.frame.width,44)
        XCTAssertGreaterThanOrEqual(downloads.frame.width,44)
        tools.tap()
        XCTAssertTrue(app.buttons["addHomeFiles"].waitForExistence(timeout:5))
        XCTAssertTrue(app.buttons["COMPUTER"].isHittable)
        XCTAssertFalse(app.buttons["refreshHomePlaylists"].exists)
    }

}
