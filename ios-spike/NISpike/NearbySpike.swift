import Foundation
import MultipeerConnectivity
import NearbyInteraction
import UIKit

/// Spike harness for the one question that gates the tap flow: does a Nearby
/// Interaction session between two iPhones survive backgrounding, or must both
/// apps be in the foreground?
///
/// This is throwaway measurement code, not a draft of the real module. It uses
/// MultipeerConnectivity to swap discovery tokens so the spike needs no server,
/// and it logs every lifecycle event with a timestamp so the answer is on
/// screen rather than inferred.
///
/// The real module sends one more thing over this same channel: the connect
/// token from `public.mint_connect_token()`, which is what tells the server
/// which account the nearby phone belongs to. A discovery token identifies a
/// radio, not a person. The spike leaves it out because it needs no server and
/// is only measuring session lifetime. See docs/05-how-the-uwb-path-works.md.
///
/// Read docs/02-uwb-spike.md for the protocol this is meant to run.
@MainActor
final class NearbySpike: NSObject, ObservableObject {

    enum State: String {
        case idle
        case discovering
        case connected      // peer found, tokens not yet swapped
        case ranging        // receiving distance updates
        case suspended      // NISession told us it was suspended
        case unsupported
    }

    struct Entry: Identifiable {
        let id = UUID()
        let at: Date
        let text: String
    }

    @Published private(set) var state: State = .idle
    @Published private(set) var distance: Float?
    @Published private(set) var log: [Entry] = []

    /// Set on the first distance reading after a session starts, so step 1 and
    /// step 3 of the protocol can be compared directly.
    @Published private(set) var msToFirstReading: Int?

    private var session: NISession?
    private var peerToken: NIDiscoveryToken?
    private var sessionStartedAt: Date?

    private let serviceType = "guy-ni-spike"
    private let localPeer = MCPeerID(displayName: UIDevice.current.name)
    private var mcSession: MCSession?
    private var advertiser: MCNearbyServiceAdvertiser?
    private var browser: MCNearbyServiceBrowser?

    // MARK: - Lifecycle

    func start() {
        guard NISession.deviceCapabilities.supportsPreciseDistanceMeasurement else {
            state = .unsupported
            note("This device has no U1/U2 chip. The spike needs iPhone 11 or later.")
            return
        }

        note("start()")
        startSession()
        startMultipeer()
        observeAppLifecycle()
    }

    private func startSession() {
        let session = NISession()
        session.delegate = self
        self.session = session
        sessionStartedAt = Date()
        msToFirstReading = nil

        if let token = session.discoveryToken {
            note("local discovery token ready")
            send(token: token)
        } else {
            note("NISession produced no discovery token")
        }
    }

    /// The measurement that matters for step 3: whether returning to the
    /// foreground resumes the existing session, or whether we had to build a
    /// new one. The harness never rebuilds automatically, so if ranging only
    /// comes back after you tap Restart, that IS the finding.
    func restart() {
        note("restart() — tearing down and rebuilding the session")
        session?.invalidate()
        session = nil
        peerToken = nil
        distance = nil
        startSession()
        if let token = session?.discoveryToken { send(token: token) }
    }

    // MARK: - App lifecycle, which is the whole point

    private func observeAppLifecycle() {
        let center = NotificationCenter.default
        center.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.note("APP → background") }
        }
        center.addObserver(
            forName: UIApplication.willEnterForegroundNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.note("APP → foreground") }
        }
        center.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.note("APP → active") }
        }
    }

    // MARK: - Token exchange over MultipeerConnectivity

    private func startMultipeer() {
        let session = MCSession(peer: localPeer, securityIdentity: nil, encryptionPreference: .required)
        session.delegate = self
        mcSession = session

        let advertiser = MCNearbyServiceAdvertiser(peer: localPeer, discoveryInfo: nil, serviceType: serviceType)
        advertiser.delegate = self
        advertiser.startAdvertisingPeer()
        self.advertiser = advertiser

        let browser = MCNearbyServiceBrowser(peer: localPeer, serviceType: serviceType)
        browser.delegate = self
        browser.startBrowsingForPeers()
        self.browser = browser

        state = .discovering
        note("advertising and browsing for peers")
    }

    private func send(token: NIDiscoveryToken) {
        guard let mcSession, !mcSession.connectedPeers.isEmpty else { return }
        do {
            let data = try NSKeyedArchiver.archivedData(
                withRootObject: token, requiringSecureCoding: true
            )
            try mcSession.send(data, toPeers: mcSession.connectedPeers, with: .reliable)
            note("sent our discovery token to \(mcSession.connectedPeers.count) peer(s)")
        } catch {
            note("failed to send token: \(error.localizedDescription)")
        }
    }

    private func run(with token: NIDiscoveryToken) {
        peerToken = token
        sessionStartedAt = Date()
        msToFirstReading = nil
        session?.run(NINearbyPeerConfiguration(peerToken: token))
        state = .ranging
        note("NISession.run() with the peer token")
    }

    // MARK: - Logging

    private func note(_ text: String) {
        log.insert(Entry(at: Date(), text: text), at: 0)
        if log.count > 200 { log.removeLast() }
    }

    /// The whole log as plain text, for pasting into the spike report.
    var transcript: String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss.SSS"
        return log.reversed()
            .map { "\(f.string(from: $0.at))  \($0.text)" }
            .joined(separator: "\n")
    }
}

// MARK: - NISessionDelegate

extension NearbySpike: NISessionDelegate {

    nonisolated func session(_ session: NISession, didUpdate nearbyObjects: [NINearbyObject]) {
        guard let object = nearbyObjects.first else { return }
        let d = object.distance
        Task { @MainActor in
            if self.msToFirstReading == nil, let started = self.sessionStartedAt {
                self.msToFirstReading = Int(Date().timeIntervalSince(started) * 1000)
                self.note("first distance reading after \(self.msToFirstReading ?? 0) ms")
            }
            self.distance = d
            if self.state != .ranging { self.state = .ranging }
        }
    }

    nonisolated func session(
        _ session: NISession,
        didRemove nearbyObjects: [NINearbyObject],
        reason: NINearbyObject.RemovalReason
    ) {
        Task { @MainActor in
            self.note("peer removed, reason: \(String(describing: reason))")
            self.distance = nil
        }
    }

    /// The event the spike is really looking for.
    nonisolated func sessionWasSuspended(_ session: NISession) {
        Task { @MainActor in
            self.state = .suspended
            self.distance = nil
            self.note("*** sessionWasSuspended ***")
        }
    }

    nonisolated func sessionSuspensionEnded(_ session: NISession) {
        Task { @MainActor in
            self.note("*** sessionSuspensionEnded ***")
            // Apple's guidance is to re-run the configuration here. Whether
            // ranging resumes without a full rebuild is step 3 of the protocol.
            if let token = self.peerToken {
                session.run(NINearbyPeerConfiguration(peerToken: token))
                self.sessionStartedAt = Date()
                self.msToFirstReading = nil
                self.state = .ranging
                self.note("re-ran the existing session after suspension")
            } else {
                self.note("no peer token to resume with")
            }
        }
    }

    nonisolated func session(_ session: NISession, didInvalidateWith error: Error) {
        Task { @MainActor in
            self.state = .idle
            self.note("session invalidated: \(error.localizedDescription)")
        }
    }
}

// MARK: - MultipeerConnectivity

extension NearbySpike: MCSessionDelegate {

    nonisolated func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        Task { @MainActor in
            switch state {
            case .connected:
                self.note("peer connected: \(peerID.displayName)")
                self.state = .connected
                if let token = self.session?.discoveryToken { self.send(token: token) }
            case .connecting:
                self.note("peer connecting: \(peerID.displayName)")
            case .notConnected:
                self.note("peer disconnected: \(peerID.displayName)")
                self.state = .discovering
            @unknown default:
                break
            }
        }
    }

    nonisolated func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        Task { @MainActor in
            guard
                let token = try? NSKeyedUnarchiver.unarchivedObject(
                    ofClass: NIDiscoveryToken.self, from: data
                )
            else {
                self.note("received data that was not a discovery token")
                return
            }
            self.note("received peer discovery token")
            self.run(with: token)
        }
    }

    nonisolated func session(_ s: MCSession, didReceive: InputStream, withName: String, fromPeer: MCPeerID) {}
    nonisolated func session(_ s: MCSession, didStartReceivingResourceWithName: String, fromPeer: MCPeerID, with: Progress) {}
    nonisolated func session(_ s: MCSession, didFinishReceivingResourceWithName: String, fromPeer: MCPeerID, at: URL?, withError: Error?) {}
}

extension NearbySpike: MCNearbyServiceAdvertiserDelegate {
    nonisolated func advertiser(
        _ advertiser: MCNearbyServiceAdvertiser,
        didReceiveInvitationFromPeer peerID: MCPeerID,
        withContext context: Data?,
        invitationHandler: @escaping (Bool, MCSession?) -> Void
    ) {
        Task { @MainActor in
            self.note("accepting invitation from \(peerID.displayName)")
            invitationHandler(true, self.mcSession)
        }
    }
}

extension NearbySpike: MCNearbyServiceBrowserDelegate {
    nonisolated func browser(
        _ browser: MCNearbyServiceBrowser,
        foundPeer peerID: MCPeerID,
        withDiscoveryInfo info: [String: String]?
    ) {
        Task { @MainActor in
            guard let mcSession = self.mcSession else { return }
            self.note("found peer \(peerID.displayName), inviting")
            browser.invitePeer(peerID, to: mcSession, withContext: nil, timeout: 10)
        }
    }

    nonisolated func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        Task { @MainActor in self.note("lost peer \(peerID.displayName)") }
    }
}
