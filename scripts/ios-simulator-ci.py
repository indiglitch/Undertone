"""Select installed iOS 26+ runtimes/device types; never download SDKs or credentials."""
import json
import os
import re
import subprocess
from pathlib import Path


def version(value):
    return tuple(int(part) for part in re.findall(r"\d+", value))


def choose_runtime(runtimes, sdk):
    candidates = [item for item in runtimes if item.get("isAvailable")
                  and item["identifier"].startswith("com.apple.CoreSimulator.SimRuntime.iOS-")
                  and (26, 0) <= version(item["version"])[:2] <= version(sdk)[:2]]
    if not candidates:
        raise RuntimeError("No installed iOS 26+ runtime compatible with the selected Simulator SDK")
    return max(candidates, key=lambda item: version(item["version"]))


def choose_devices(types, runtime_version):
    # Same generation where possible; compact and Max have different screen sizes.
    names = {item["name"]: item for item in types if item.get("productFamily") == "iPhone"
             and version(item.get("minRuntimeVersionString", "0"))[:2] <= version(runtime_version)[:2]
             and version(item.get("maxRuntimeVersionString", "999"))[:2] >= version(runtime_version)[:2]}
    compact = next((names[name] for name in ["iPhone 16e", "iPhone 16", "iPhone 15", "iPhone 14"] if name in names), None)
    large = next((names[name] for name in ["iPhone 16 Pro Max", "iPhone 15 Pro Max", "iPhone 14 Pro Max"] if name in names), None)
    if compact is None or large is None:
        raise RuntimeError("Two supported iPhone sizes were not found; inspect simulator-inventory.json")
    return compact, large


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def main():
    output = Path(os.environ["IOS_CI_OUTPUT"])
    output.mkdir(parents=True, exist_ok=True)
    sdk = run("xcrun", "--sdk", "iphonesimulator", "--show-sdk-version")
    inventory = json.loads(run("xcrun", "simctl", "list", "--json"))
    (output / "simulator-inventory.json").write_text(json.dumps(inventory, indent=2))
    runtime = choose_runtime(inventory["runtimes"], sdk)
    compact, large = choose_devices(inventory["devicetypes"], runtime["version"])
    devices = {}
    for role, device in [("primary", compact), ("secondary", large)]:
        udid = run("xcrun", "simctl", "create", f"Undertone CI {role}", device["identifier"], runtime["identifier"])
        devices[role] = {"name": device["name"], "udid": udid, "runtime": runtime["version"]}
    (output / "devices.json").write_text(json.dumps(devices, indent=2))
    with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as env:
        env.write(f"IOS_PRIMARY={devices['primary']['udid']}\nIOS_SECONDARY={devices['secondary']['udid']}\n")
    print(f"Selected iOS {runtime['version']}: {compact['name']} and {large['name']}")


if __name__ == "__main__":
    main()
