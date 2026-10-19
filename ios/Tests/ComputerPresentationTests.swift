import XCTest
@testable import Undertone

final class ComputerPresentationTests: XCTestCase {
    func testUnpairedNeverClaimsAvailableOrRefreshing() {
        XCTAssertEqual(ComputerPresentation.state(paired: false, connecting: false, refreshing: true, offline: false, online: true), .unpaired)
    }
    func testOfflineOverridesStaleOnlineAndRefreshing() {
        XCTAssertEqual(ComputerPresentation.state(paired: true, connecting: false, refreshing: true, offline: true, online: true), .offline)
    }
    func testBusyOperationsHaveOneState() {
        XCTAssertEqual(ComputerPresentation.state(paired: false, connecting: true, refreshing: true, offline: false, online: false), .connecting)
        XCTAssertEqual(ComputerPresentation.state(paired: true, connecting: false, refreshing: true, offline: false, online: true), .refreshing)
    }
    func testSavedConnectionDistinguishesAvailableFromUnavailable() {
        XCTAssertEqual(ComputerPresentation.state(paired: true, connecting: false, refreshing: false, offline: false, online: true), .available)
        XCTAssertEqual(ComputerPresentation.state(paired: true, connecting: false, refreshing: false, offline: false, online: false), .unavailable)
    }
}
