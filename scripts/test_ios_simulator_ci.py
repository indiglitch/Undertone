"""Host-independent checks for CI runtime/device selection; no Apple tools needed."""
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("simulator_ci", pathlib.Path(__file__).with_name("ios-simulator-ci.py"))
ci = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci)


class SimulatorSelectionTests(unittest.TestCase):
    def runtime(self, version, available=True):
        return {"version": version, "isAvailable": available,
                "identifier": "com.apple.CoreSimulator.SimRuntime.iOS-" + version.replace(".", "-")}

    def test_runtime_excludes_unavailable_older_and_newer_than_sdk(self):
        values = [self.runtime("18.5"), self.runtime("26.1"), self.runtime("26.2"),
                  self.runtime("26.3"), self.runtime("26.2.1", False)]
        self.assertEqual(ci.choose_runtime(values, "26.2")["version"], "26.2")

    def test_no_compatible_runtime_fails_instead_of_installing_or_using_ios18(self):
        with self.assertRaises(RuntimeError):
            ci.choose_runtime([self.runtime("18.5")], "26.2")

    def test_two_screen_sizes_respect_device_runtime_limits(self):
        types = [{"name": name, "identifier": name, "productFamily": "iPhone",
                  "minRuntimeVersionString": minimum, "maxRuntimeVersionString": "65535.255.255"}
                 for name, minimum in [("iPhone 16e", "26.3"), ("iPhone 16", "18.0"), ("iPhone 16 Pro Max", "18.0")]]
        compact, large = ci.choose_devices(types, "26.2")
        self.assertEqual(compact["name"], "iPhone 16")
        self.assertEqual(large["name"], "iPhone 16 Pro Max")

    def test_missing_second_size_fails_explicitly(self):
        with self.assertRaises(RuntimeError):
            ci.choose_devices([], "26.2")


if __name__ == "__main__":
    unittest.main()
