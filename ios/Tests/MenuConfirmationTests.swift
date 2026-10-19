import XCTest
@testable import Undertone

final class MenuConfirmationTests: XCTestCase {
    @MainActor func testRequestAndCancellationHaveNoSideEffects() {
        let coordinator = MenuConfirmationCoordinator()
        var removals = 0
        coordinator.confirm("Remove?", message: "Phone copy only", actionTitle: "REMOVE") { removals += 1 }
        XCTAssertEqual(removals, 0)
        XCTAssertEqual(coordinator.pending?.message, "Phone copy only")
        coordinator.pending = nil
        XCTAssertEqual(removals, 0)
    }

    @MainActor func testConfirmationUsesCapturedTargetEvenAfterSelectionChanges() {
        let coordinator = MenuConfirmationCoordinator()
        var selected = ["first"], removed: [String] = []
        let captured = selected
        coordinator.confirm("Remove?", message: "Selected copy", actionTitle: "REMOVE") { removed = captured }
        selected = ["second"]
        coordinator.pending?.action()
        XCTAssertEqual(removed, ["first"])
        XCTAssertEqual(selected, ["second"])
    }
}
