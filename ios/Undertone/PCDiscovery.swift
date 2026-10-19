import Foundation

@MainActor
final class PCDiscovery: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
    private let browser = NetServiceBrowser()
    private var services: [NetService] = []
    private var fingerprint = ""
    var resolved: ((String, Int) -> Void)?
    func start(fingerprint: String) {
        stop(); self.fingerprint = fingerprint.lowercased()
        browser.delegate = self
        browser.searchForServices(ofType: "_undertone._tcp.", inDomain: "local.")
    }
    func stop() { browser.stop(); services.forEach { $0.stop() }; services = [] }
    func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
        guard service.name == "undertone-" + fingerprint.prefix(16) else { return }
        services.append(service); service.delegate = self; service.resolve(withTimeout: 5)
    }
    func netServiceDidResolveAddress(_ sender: NetService) {
        guard let host = sender.hostName, let data = sender.txtRecordData(),
              let advertised = NetService.dictionary(fromTXTRecord: data)["fingerprint"],
              String(data: advertised, encoding: .utf8) == fingerprint else { return }
        let trimmed = host.hasSuffix(".") ? String(host.dropLast()) : host
        resolved?(trimmed, sender.port)
    }
}
