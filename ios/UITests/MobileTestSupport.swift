import XCTest

extension XCTestCase {
    // SwiftUI can report hittable for content clipped behind a safeAreaInset.
    // Require the entire target to lie between navigation and the fixed panels.
    func isContentVisible(_ element: XCUIElement, app: XCUIApplication) -> Bool {
        guard element.exists, element.isHittable else { return false }
        let top = app.navigationBars.allElementsBoundByIndex.filter { $0.isHittable }.map(\.frame.maxY).max() ?? app.frame.minY
        let dock = app.buttons["miniPlayerOpen"]
        let timeline = app.sliders["playerTimeline"]
        let bottom = timeline.exists && timeline.isHittable ? timeline.frame.minY : dock.exists && dock.isHittable ? dock.frame.minY : app.frame.maxY
        return element.frame.minY >= top && element.frame.maxY <= bottom
    }
    func revealContent(_ element: XCUIElement, app: XCUIApplication, attempts: Int = 16) {
        for _ in 0..<attempts {
            if isContentVisible(element, app: app) { return }
            let lists = app.collectionViews.allElementsBoundByIndex + app.scrollViews.allElementsBoundByIndex
            guard let scroll = lists.first(where: { $0.isHittable }) else { break }
            if element.exists && !element.frame.isEmpty && element.frame.minY < (app.navigationBars.firstMatch.exists ? app.navigationBars.firstMatch.frame.maxY : 0) { scroll.swipeDown() }
            else { scroll.swipeUp() }
        }
        XCTAssertTrue(isContentVisible(element, app: app), "Target must be visible above fixed panels: \(element)")
    }
    func waitForValue(_ element: XCUIElement, _ value: String, timeout: TimeInterval = 5) {
        let expectation = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", value), object: element)
        XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: timeout), .completed)
    }
}
