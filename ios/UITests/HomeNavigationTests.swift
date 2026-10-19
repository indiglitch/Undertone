import XCTest

final class HomeNavigationTests: XCTestCase {
    private func fixture() -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-fixture"]
        app.launchEnvironment["UNDERTONE_UI_OFFLINE"] = "1"
        app.launchEnvironment["UNDERTONE_UI_HOME_NAVIGATION"] = "1"
        app.launch()
        XCTAssertTrue(app.buttons["homeAllTracks"].waitForExistence(timeout: 15))
        return app
    }

    private func back(_ app: XCUIApplication) {
        let back = app.navigationBars.buttons.element(boundBy: 0)
        XCTAssertTrue(back.isHittable)
        back.tap()
    }

    func testQuickCollectionsReturnHomeWithSystemBack() {
        let app = fixture()
        for (identifier, title) in [("homeLikedTracks", "LIKED TRACKS"), ("homeAllTracks", "ALL TRACKS"), ("homePlaylists", "PLAYLISTS")] {
            app.buttons[identifier].tap()
            XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 5))
            back(app)
            XCTAssertTrue(app.buttons[identifier].waitForExistence(timeout: 5))
            XCTAssertTrue(app.buttons[identifier].isHittable)
            XCTAssertTrue(app.tabBars.buttons["HOME"].isSelected)
        }
    }

    func testTabsKeepIndependentCollectionsAndSearchQuery() {
        let app = fixture()
        app.buttons["homeAllTracks"].tap()
        XCTAssertTrue(app.navigationBars["ALL TRACKS"].waitForExistence(timeout: 5))
        app.tabBars.buttons["SEARCH"].tap()
        let field = app.textFields["musicSearchField"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap(); field.typeText("Midnight\n")
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        app.tabBars.buttons["LIBRARY"].tap()
        app.buttons["ALL TRACKS"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["ALL TRACKS"].waitForExistence(timeout: 5))
        app.tabBars.buttons["HOME"].tap()
        XCTAssertTrue(app.navigationBars["ALL TRACKS"].waitForExistence(timeout: 5))
        back(app)
        XCTAssertTrue(app.buttons["homeAllTracks"].waitForExistence(timeout: 5))
        app.tabBars.buttons["LIBRARY"].tap()
        XCTAssertTrue(app.navigationBars["ALL TRACKS"].waitForExistence(timeout: 5))
        back(app)
        XCTAssertTrue(app.navigationBars["LIBRARY"].waitForExistence(timeout: 5))
        app.tabBars.buttons["SEARCH"].tap()
        XCTAssertEqual(field.value as? String, "Midnight")
    }

    func testInteractiveBackKeepsTheHomeTab() {
        let app = fixture()
        app.buttons["homeAllTracks"].tap()
        XCTAssertTrue(app.navigationBars["ALL TRACKS"].waitForExistence(timeout: 5))
        let edge = app.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.5))
        let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.5))
        edge.press(forDuration: 0.05, thenDragTo: end)
        XCTAssertTrue(app.buttons["homeAllTracks"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["homeAllTracks"].isHittable)
        XCTAssertTrue(app.tabBars.buttons["HOME"].isSelected)
    }

    func testHomeAndAlbumShelfKeepPositionThroughCollectionAndTabSwitch() {
        let app = fixture()
        let albums = app.buttons["openAllAlbums"]
        let pinnedAlbumMenu = app.buttons["Меню альбома Demo Artist — Album 24"].firstMatch
        let scroll = app.scrollViews.firstMatch
        for _ in 0..<6 {
            if pinnedAlbumMenu.isHittable { break }
            scroll.swipeUp()
        }
        XCTAssertTrue(pinnedAlbumMenu.isHittable)
        XCTAssertTrue(albums.isHittable)
        let y = albums.frame.minY
        albums.tap()
        XCTAssertTrue(app.navigationBars["ALBUMS"].waitForExistence(timeout: 5))
        back(app)
        assertPosition(albums, y: y)
        app.tabBars.buttons["SEARCH"].tap()
        app.tabBars.buttons["HOME"].tap()
        assertPosition(albums, y: y)

        let horizontal = app.scrollViews.allElementsBoundByIndex.first { $0.frame.width > $0.frame.height && $0.isHittable }
        XCTAssertNotNil(horizontal)
        guard let shelf = horizontal else { return }
        shelf.swipeLeft()
        let albumMenu = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Меню альбома ")).allElementsBoundByIndex.first { $0.isHittable }
        XCTAssertNotNil(albumMenu)
        guard let albumMenu else { return }
        let label = albumMenu.label, x = albumMenu.frame.minX
        albums.tap()
        XCTAssertTrue(app.navigationBars["ALBUMS"].waitForExistence(timeout: 5))
        back(app)
        let restored = app.buttons[label].firstMatch
        XCTAssertTrue(restored.isHittable)
        XCTAssertEqual(restored.frame.minX, x, accuracy: 2)
    }

    private func assertPosition(_ element: XCUIElement, y: CGFloat) {
        let predicate = NSPredicate { _, _ in element.isHittable && abs(element.frame.minY - y) <= 2 }
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: 5), .completed)
    }
}
