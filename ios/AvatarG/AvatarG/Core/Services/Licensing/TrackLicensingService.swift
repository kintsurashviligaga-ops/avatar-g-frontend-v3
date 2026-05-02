import Foundation
import CryptoKit
import UIKit

// MARK: - Track Certificate

/// Cryptographic proof of AI music generation provenance
struct TrackCertificate: Codable, Identifiable {
    let id: String                  // UUID
    let trackId: String
    let userId: String
    let userDisplayName: String
    let prompt: String              // sanitised generation prompt
    let generatedAt: Date
    let platformVersion: String
    let contentHash: String         // SHA-256 of the audio file bytes
    let certificateHash: String     // SHA-256 of all above fields
    let signatureBase64: String     // server-signed (Ed25519) base64
    let nftTokenId: String?         // nil until minted
    let nftContractAddress: String?
    let nftTransactionHash: String?
    let blockchainNetwork: String?  // "polygon", "tezos" etc.
    let mintedAt: Date?

    var isMinted: Bool { nftTokenId != nil }

    var certificateURL: URL? {
        URL(string: "https://myavatar.ge/certificate/\(id)")
    }

    var openseaURL: URL? {
        guard let token = nftTokenId, let contract = nftContractAddress else { return nil }
        return URL(string: "https://opensea.io/assets/matic/\(contract)/\(token)")
    }
}

// MARK: - Licensing Tier

enum LicensingTier: String, CaseIterable {
    case personal    = "personal"    // free — personal use only
    case commercial  = "commercial"  // paid — commercial projects
    case exclusive   = "exclusive"   // premium — full ownership transfer

    var displayName: String {
        switch self {
        case .personal:   return "Personal Use"
        case .commercial: return "Commercial License"
        case .exclusive:  return "Exclusive Rights"
        }
    }

    var georgianName: String {
        switch self {
        case .personal:   return "პირადი გამოყენება"
        case .commercial: return "კომერციული ლიცენზია"
        case .exclusive:  return "ექსკლუზიური უფლებები"
        }
    }

    var price: Decimal {
        switch self {
        case .personal:   return 0
        case .commercial: return 9.99
        case .exclusive:  return 49.99
        }
    }

    var description: String {
        switch self {
        case .personal:   return "Stream, share, and enjoy for non-commercial purposes."
        case .commercial: return "Use in videos, podcasts, ads, and commercial projects."
        case .exclusive:  return "Full copyright transfer. Remove from Avatar G marketplace."
        }
    }
}

// MARK: - NFT Mint Request

struct NFTMintRequest: Encodable {
    let trackId: String
    let certificateId: String
    let walletAddress: String
    let network: String
    let metadata: NFTMetadata
}

struct NFTMetadata: Encodable {
    let name: String
    let description: String
    let prompt: String
    let imageURL: String?    // cover art
    let audioURL: String
    let attributes: [NFTAttribute]
}

struct NFTAttribute: Encodable {
    let trait_type: String
    let value: String
}

struct NFTMintResponse: Decodable {
    let tokenId: String
    let contractAddress: String
    let transactionHash: String
    let openseaURL: String
    let network: String
    let gasFeePaid: String   // in MATIC or XTZ
}

// MARK: - Track Licensing Service

@MainActor
final class TrackLicensingService: ObservableObject {

    static let shared = TrackLicensingService()

    @Published private(set) var certificates: [String: TrackCertificate] = [:]
    @Published private(set) var mintingProgress: MintingProgress?

    struct MintingProgress {
        let trackId: String
        var status: MintStatus
        var message: String
        enum MintStatus { case preparing, uploading, signing, minting, confirming, done, failed }
    }

    private let apiClient = APIClient.shared
    private init() {}

    // MARK: - Certificate Generation

    /// Generate a cryptographic certificate for a track immediately after generation
    func generateCertificate(for track: MusicTrack, audioData: Data) async throws -> TrackCertificate {
        guard let user = AppState.shared.currentUser else {
            throw LicensingError.notAuthenticated
        }

        // 1. Compute SHA-256 content hash of audio
        let contentHash = SHA256.hash(data: audioData)
            .map { String(format: "%02x", $0) }.joined()

        // 2. Build certificate payload
        struct CertificateRequest: Encodable {
            let trackId: String
            let userId: String
            let prompt: String
            let contentHash: String
            let generatedAt: Date
            let platformVersion: String
        }
        let version = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "1.0"
        let req = CertificateRequest(
            trackId: track.id,
            userId: user.id,
            prompt: track.prompt,
            contentHash: contentHash,
            generatedAt: track.generatedAt ?? .now,
            platformVersion: version
        )

        // 3. Server signs and returns certificate
        let cert: TrackCertificate = try await apiClient.post(Endpoints.licenseGenerate, body: req)
        certificates[track.id] = cert
        return cert
    }

    // MARK: - NFT Minting

    func mintNFT(for track: MusicTrack, walletAddress: String, network: String = "polygon") async throws -> TrackCertificate {
        guard let cert = certificates[track.id] else {
            throw LicensingError.noCertificate
        }

        mintingProgress = MintingProgress(trackId: track.id, status: .preparing, message: "Preparing metadata…")

        do {
            // Step 1: Upload cover art + audio to IPFS
            mintingProgress?.status = .uploading
            mintingProgress?.message = "Uploading to IPFS…"

            let attributes: [NFTAttribute] = [
                NFTAttribute(trait_type: "Platform", value: "Avatar G"),
                NFTAttribute(trait_type: "Language", value: "Georgian / Multi-language"),
                NFTAttribute(trait_type: "Stems", value: "\(track.stems.count)"),
                NFTAttribute(trait_type: "Duration", value: "\(Int(track.duration))s"),
                NFTAttribute(trait_type: "Generated At", value: ISO8601DateFormatter().string(from: track.generatedAt ?? .now)),
                NFTAttribute(trait_type: "Certificate", value: cert.id),
            ]

            let metadata = NFTMetadata(
                name: track.title,
                description: "AI-generated music by Avatar G. Prompt: \(track.prompt). "
                           + "Certificate: \(cert.id). Content hash: \(cert.contentHash)",
                prompt: track.prompt,
                imageURL: track.coverURL,
                audioURL: track.audioURL ?? "",
                attributes: attributes
            )

            mintingProgress?.status = .signing
            mintingProgress?.message = "Signing transaction…"

            let mintReq = NFTMintRequest(
                trackId: track.id,
                certificateId: cert.id,
                walletAddress: walletAddress,
                network: network,
                metadata: metadata
            )

            mintingProgress?.status = .minting
            mintingProgress?.message = "Minting NFT on \(network.capitalized)…"

            let resp: NFTMintResponse = try await apiClient.post(Endpoints.licenseMint, body: mintReq)

            mintingProgress?.status = .confirming
            mintingProgress?.message = "Confirming transaction…"

            // Poll for confirmation (up to 60s)
            try await pollMintConfirmation(transactionHash: resp.transactionHash)

            // Update certificate with NFT info
            var updatedCert = cert
            struct UpdateRequest: Encodable { let certificateId: String; let tokenId: String; let contractAddress: String; let txHash: String; let network: String }
            let updated: TrackCertificate = try await apiClient.post(
                Endpoints.licenseUpdateNFT,
                body: UpdateRequest(certificateId: cert.id, tokenId: resp.tokenId, contractAddress: resp.contractAddress, txHash: resp.transactionHash, network: resp.network)
            )
            updatedCert = updated
            certificates[track.id] = updatedCert

            mintingProgress?.status = .done
            mintingProgress?.message = "NFT minted successfully!"
            return updatedCert

        } catch {
            mintingProgress?.status = .failed
            mintingProgress?.message = error.localizedDescription
            throw error
        }
    }

    private func pollMintConfirmation(transactionHash: String) async throws {
        for _ in 0..<20 {
            try await Task.sleep(for: .seconds(3))
            struct StatusReq: Encodable { let txHash: String }
            struct StatusResp: Decodable { let confirmed: Bool }
            let resp: StatusResp = try await apiClient.post(Endpoints.licenseTxStatus, body: StatusReq(txHash: transactionHash))
            if resp.confirmed { return }
        }
        throw LicensingError.mintTimeout
    }

    // MARK: - License Purchase

    func upgradeLicense(for trackId: String, to tier: LicensingTier) async throws {
        struct LicenseRequest: Encodable { let trackId: String; let tier: String }
        struct LicenseResponse: Decodable { let success: Bool; let receiptId: String }
        let _: LicenseResponse = try await apiClient.post(
            Endpoints.licensePurchase,
            body: LicenseRequest(trackId: trackId, tier: tier.rawValue)
        )
    }

    // MARK: - Certificate Sharing

    func generateShareableCard(certificate: TrackCertificate, track: MusicTrack) -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 800, height: 500))
        return renderer.image { ctx in
            // Background
            UIColor(red: 0.04, green: 0.04, blue: 0.06, alpha: 1).setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 800, height: 500))

            // Gradient overlay
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                colors: [UIColor(red: 0, green: 0.83, blue: 1, alpha: 0.15).cgColor,
                         UIColor(red: 0.49, green: 0.23, blue: 0.93, alpha: 0.1).cgColor] as CFArray,
                locations: [0, 1])!
            ctx.cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: 800, y: 500), options: [])

            // Certificate border
            UIColor(red: 0, green: 0.83, blue: 1, alpha: 0.3).setStroke()
            let border = UIBezierPath(roundedRect: CGRect(x: 20, y: 20, width: 760, height: 460), cornerRadius: 20)
            border.lineWidth = 1
            border.stroke()

            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 28, weight: .bold),
                .foregroundColor: UIColor.white
            ]
            let titleStr = NSString(string: track.title)
            titleStr.draw(at: CGPoint(x: 48, y: 48), withAttributes: attrs)

            let subAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 14),
                .foregroundColor: UIColor(white: 1, alpha: 0.5)
            ]
            NSString(string: "Avatar G • Certificate of Digital Provenance").draw(at: CGPoint(x: 48, y: 90), withAttributes: subAttrs)
            NSString(string: "ID: \(certificate.id.prefix(16))…").draw(at: CGPoint(x: 48, y: 400), withAttributes: subAttrs)
            NSString(string: "Hash: \(certificate.contentHash.prefix(32))…").draw(at: CGPoint(x: 48, y: 424), withAttributes: subAttrs)

            if certificate.isMinted {
                let nftAttrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.systemFont(ofSize: 13, weight: .semibold),
                    .foregroundColor: UIColor(red: 0, green: 0.83, blue: 1, alpha: 1)
                ]
                NSString(string: "✦ NFT Minted on \(certificate.blockchainNetwork?.capitalized ?? "Polygon")").draw(at: CGPoint(x: 48, y: 450), withAttributes: nftAttrs)
            }
        }
    }
}

// MARK: - Errors

enum LicensingError: LocalizedError {
    case notAuthenticated, noCertificate, mintTimeout, insufficientFunds

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:   return "Please sign in to generate certificates."
        case .noCertificate:      return "No certificate found for this track. Generate one first."
        case .mintTimeout:        return "NFT minting transaction timed out. Check your wallet."
        case .insufficientFunds:  return "Insufficient wallet balance for gas fees."
        }
    }
}

// MARK: - Certificate View

struct CertificateView: View {
    let certificate: TrackCertificate
    let track: MusicTrack
    @ObservedObject var service: TrackLicensingService = .shared
    @State private var showMintSheet = false
    @State private var walletAddress = ""

    var body: some View {
        ZStack {
            Color(hex: "#0a0a0f").ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    // Certificate card
                    VStack(spacing: 16) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Certificate of Digital Provenance")
                                    .font(.system(.caption, weight: .semibold))
                                    .foregroundColor(Color(hex: "#00d4ff"))
                                    .textCase(.uppercase)
                                    .tracking(1.5)
                                Text(track.title)
                                    .font(.system(.title2, design: .rounded, weight: .bold))
                                    .foregroundColor(.white)
                            }
                            Spacer()
                            Image(systemName: certificate.isMinted ? "checkmark.seal.fill" : "seal")
                                .font(.system(size: 36))
                                .foregroundColor(certificate.isMinted ? Color(hex: "#00c896") : Color(hex: "#00d4ff"))
                        }

                        Divider().overlay(Color.white.opacity(0.08))

                        CertRow(label: "Certificate ID", value: String(certificate.id.prefix(16)) + "…")
                        CertRow(label: "Generated At", value: certificate.generatedAt.formatted(date: .long, time: .shortened))
                        CertRow(label: "Content Hash", value: String(certificate.contentHash.prefix(24)) + "…", isMonospaced: true)
                        CertRow(label: "Platform", value: "Avatar G v\(certificate.platformVersion)")

                        if certificate.isMinted, let token = certificate.nftTokenId {
                            Divider().overlay(Color.white.opacity(0.08))
                            CertRow(label: "NFT Token ID", value: token, isMonospaced: true)
                            CertRow(label: "Network", value: certificate.blockchainNetwork?.capitalized ?? "Polygon")
                        }
                    }
                    .padding(20)
                    .background(RoundedRectangle(cornerRadius: 20).fill(Color.white.opacity(0.04)).overlay(RoundedRectangle(cornerRadius: 20).stroke(Color(hex: "#00d4ff").opacity(0.2), lineWidth: 1)))

                    // Actions
                    if !certificate.isMinted {
                        Button {
                            showMintSheet = true
                        } label: {
                            Label("Mint as NFT", systemImage: "die.face.5.fill")
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(LinearGradient(colors: [Color(hex: "#00d4ff"), Color(hex: "#7c3aed")], startPoint: .leading, endPoint: .trailing))
                                .foregroundColor(.white)
                                .cornerRadius(14)
                                .fontWeight(.semibold)
                        }
                    } else if let url = certificate.openseaURL {
                        Link(destination: url) {
                            Label("View on OpenSea", systemImage: "arrow.up.right.square")
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color.white.opacity(0.06))
                                .foregroundColor(Color(hex: "#00d4ff"))
                                .cornerRadius(14)
                                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: "#00d4ff").opacity(0.3), lineWidth: 1))
                        }
                    }
                }
                .padding(20)
            }
        }
        .sheet(isPresented: $showMintSheet) {
            NFTMintSheet(track: track, certificate: certificate, service: service)
        }
    }
}

private struct CertRow: View {
    let label: String; let value: String; var isMonospaced = false
    var body: some View {
        HStack(alignment: .top) {
            Text(label).font(.system(.caption)).foregroundColor(.white.opacity(0.45)).frame(width: 110, alignment: .leading)
            Text(value).font(isMonospaced ? .system(.caption, design: .monospaced) : .system(.caption, weight: .medium)).foregroundColor(.white).lineLimit(2)
            Spacer()
        }
    }
}

private struct NFTMintSheet: View {
    let track: MusicTrack; let certificate: TrackCertificate; @ObservedObject var service: TrackLicensingService
    @Environment(\.dismiss) var dismiss
    @State private var walletAddress = ""; @State private var isMinting = false; @State private var network = "polygon"
    var body: some View {
        NavigationView {
            ZStack {
                Color(hex: "#0a0a0f").ignoresSafeArea()
                VStack(spacing: 20) {
                    if let progress = service.mintingProgress {
                        VStack(spacing: 8) {
                            ProgressView().tint(Color(hex: "#00d4ff"))
                            Text(progress.message).font(.system(.subheadline)).foregroundColor(.white.opacity(0.7))
                        }.padding(40)
                    } else {
                        TextField("Wallet address (0x…)", text: $walletAddress).textFieldStyle(.roundedBorder).padding(.horizontal)
                        Picker("Network", selection: $network) {
                            Text("Polygon (MATIC)").tag("polygon")
                            Text("Tezos (XTZ)").tag("tezos")
                        }.pickerStyle(.segmented).padding(.horizontal)
                        Button("Mint NFT") {
                            isMinting = true
                            Task { _ = try? await service.mintNFT(for: track, walletAddress: walletAddress, network: network); dismiss() }
                        }
                        .disabled(walletAddress.isEmpty || isMinting)
                        .padding().background(Color(hex: "#00d4ff")).foregroundColor(.white).cornerRadius(14).padding(.horizontal)
                    }
                    Spacer()
                }
            }
            .navigationTitle("Mint NFT")
            .toolbar { ToolbarItem(placement: .navigationBarLeading) { Button("Cancel") { dismiss() }.foregroundColor(Color(hex: "#00d4ff")) } }
        }
    }
}

private extension Color {
    init(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var i: UInt64 = 0; Scanner(string: h).scanHexInt64(&i)
        let (a,r,g,b): (UInt64,UInt64,UInt64,UInt64) = h.count == 6 ? (255,i>>16&0xFF,i>>8&0xFF,i&0xFF) : (255,0,0,0)
        self.init(.sRGB, red: Double(r)/255, green: Double(g)/255, blue: Double(b)/255, opacity: Double(a)/255)
    }
}
