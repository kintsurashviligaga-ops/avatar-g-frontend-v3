import Foundation
import NaturalLanguage
import Speech

// MARK: - Georgian Dialect Definitions

enum GeorgianDialect: String, CaseIterable, Codable {
    case standardKartlian  = "ka-GE"        // Standard written Georgian
    case imeretian         = "ka-GE-IM"     // Imereti region
    case kakhetian         = "ka-GE-KA"     // Kakheti region
    case gurian            = "ka-GE-GU"     // Guria region
    case adjarian          = "ka-GE-AD"     // Adjara region
    case mingrelian        = "ka-ZAN-MG"    // Mingrelian (Kartvelian branch)

    var displayName: String {
        switch self {
        case .standardKartlian: return "სტანდარტული ქართული"
        case .imeretian:        return "იმერული"
        case .kakhetian:        return "კახური"
        case .gurian:           return "გურული"
        case .adjarian:         return "აჭარული"
        case .mingrelian:       return "მეგრული"
        }
    }

    var region: String {
        switch self {
        case .standardKartlian: return "ქართლი"
        case .imeretian:        return "იმერეთი"
        case .kakhetian:        return "კახეთი"
        case .gurian:           return "გურია"
        case .adjarian:         return "აჭარა"
        case .mingrelian:       return "სამეგრელო"
        }
    }
}

// MARK: - Georgian Slang & Dialect Normaliser

/// Converts informal Georgian speech/slang to standard Georgian for LLM processing,
/// while preserving dialect context metadata for personalised responses.
final class GeorgianDialectNormaliser {

    // Imeretian characteristic substitutions → standard Georgian
    private let imeretianMap: [String: String] = [
        "ვაი მაგ": "ვაი მაგ",
        "ჩემო": "ჩემო",
        "გინახავ": "გინახავს",
        "მიქვია": "მიქვს",
        "ვქნათ": "ვქნათ",
        "კია": "კია",
        "ეგ ვინა": "ეს ვინ არის",
    ]

    // Modern Georgian slang → standard
    private let slangMap: [String: String] = [
        "ბიჭო": "მეგობარო",
        "ქელა": "ბავშვი",
        "სუპერ": "ძალიან კარგი",
        "ოქეი": "კარგი",
        "ჰო": "დიახ",
        "ნეა": "არა",
        "ვა": "ოჰ",
        "ბა": "სწორია",
        "ეგ მაგარია": "ეს საინტერესოა",
        "ჩილ": "მშვიდი",
        "ტრენდული": "მოდური",
        "ვაიმე": "ვაიმე",
        "კლასი": "შესანიშნავია",
        "ლაღი": "სახალისო",
        "გათბობილი": "მომზადებული",
        "ხეიბარი": "ზარმაცი",
    ]

    struct NormalisationResult {
        let normalised: String
        let detectedDialect: GeorgianDialect
        let slangCount: Int
        let dialectMarkers: [String]
    }

    func normalise(text: String) -> NormalisationResult {
        var result = text
        var slangCount = 0
        var dialectMarkers: [String] = []
        var detectedDialect: GeorgianDialect = .standardKartlian

        // Apply slang normalisation
        for (slang, standard) in slangMap {
            if result.contains(slang) {
                result = result.replacingOccurrences(of: slang, with: standard)
                slangCount += 1
                dialectMarkers.append(slang)
            }
        }

        // Detect Imeretian markers
        let imeretianMarkers = ["კია", "ვქნათ", "გინახავ"]
        if imeretianMarkers.filter({ text.contains($0) }).count >= 2 {
            detectedDialect = .imeretian
            for (dialect, standard) in imeretianMap {
                if result.contains(dialect) {
                    result = result.replacingOccurrences(of: dialect, with: standard)
                    dialectMarkers.append(dialect)
                }
            }
        }

        // Kakhetian detection: characteristic verb endings -ებოდა, -ოდა
        if text.hasSuffix("ებოდა") || text.contains("რო ") {
            detectedDialect = .kakhetian
        }

        return NormalisationResult(
            normalised: result,
            detectedDialect: detectedDialect,
            slangCount: slangCount,
            dialectMarkers: dialectMarkers
        )
    }

    /// Build dialect-aware Agent G context hint
    func buildDialectHint(_ result: NormalisationResult) -> String {
        guard result.detectedDialect != .standardKartlian || result.slangCount > 0 else { return "" }
        var hint = "\n[DIALECT NOTE] "
        if result.detectedDialect != .standardKartlian {
            hint += "User is speaking \(result.detectedDialect.displayName) dialect from \(result.detectedDialect.region). "
        }
        if result.slangCount > 0 {
            hint += "Message contains \(result.slangCount) informal/slang expression(s). "
            hint += "Respond in warm, natural Georgian that matches their informal register."
        }
        return hint
    }
}

// MARK: - Traditional Georgian Instruments Model

struct GeorgianInstrument: Identifiable {
    let id: String
    let georgianName: String
    let englishName: String
    let description: String
    let musicGenTag: String      // sent to music generation API as style modifier
    let audioSampleFile: String  // bundled sample file name
    let category: InstrumentCategory

    enum InstrumentCategory: String {
        case stringed    = "stringed"
        case percussion  = "percussion"
        case wind        = "wind"
        case vocal       = "vocal"
    }

    static let all: [GeorgianInstrument] = [
        GeorgianInstrument(
            id: "panduri",
            georgianName: "პანდური",
            englishName: "Panduri",
            description: "Three-stringed long-necked lute from Eastern Georgia, associated with Kakhetian folk music.",
            musicGenTag: "panduri_lute_folk_eastern_georgia",
            audioSampleFile: "panduri_sample.m4a",
            category: .stringed
        ),
        GeorgianInstrument(
            id: "chonguri",
            georgianName: "ჩონგური",
            englishName: "Chonguri",
            description: "Four-stringed instrument from Western Georgia, central to Gurian polyphony.",
            musicGenTag: "chonguri_western_georgia_polyphony",
            audioSampleFile: "chonguri_sample.m4a",
            category: .stringed
        ),
        GeorgianInstrument(
            id: "doli",
            georgianName: "დოლი",
            englishName: "Doli",
            description: "Traditional Georgian drum, provides the rhythmic foundation in folk and ritual music.",
            musicGenTag: "doli_georgian_drum_rhythm",
            audioSampleFile: "doli_sample.m4a",
            category: .percussion
        ),
        GeorgianInstrument(
            id: "salamuri",
            georgianName: "სალამური",
            englishName: "Salamuri",
            description: "End-blown flute carved from wood or bone, played by Georgian shepherds.",
            musicGenTag: "salamuri_flute_shepherd_georgian",
            audioSampleFile: "salamuri_sample.m4a",
            category: .wind
        ),
        GeorgianInstrument(
            id: "duduki",
            georgianName: "დუდუკი",
            englishName: "Duduki",
            description: "Double-reed instrument producing a deeply emotional, mournful tone.",
            musicGenTag: "duduki_double_reed_mournful_caucasus",
            audioSampleFile: "duduki_sample.m4a",
            category: .wind
        ),
        GeorgianInstrument(
            id: "changi",
            georgianName: "ჩანგი",
            englishName: "Changi",
            description: "Ancient Georgian harp, revived in contemporary Georgian folk music.",
            musicGenTag: "changi_harp_ancient_georgian",
            audioSampleFile: "changi_sample.m4a",
            category: .stringed
        ),
        GeorgianInstrument(
            id: "bagpipe",
            georgianName: "გუდასტვირი",
            englishName: "Gudastviri",
            description: "Georgian bagpipe, used in Svaneti and other mountain regions for ceremonial music.",
            musicGenTag: "gudastviri_bagpipe_svaneti_mountain",
            audioSampleFile: "gudastviri_sample.m4a",
            category: .wind
        ),
        GeorgianInstrument(
            id: "accordion",
            georgianName: "გარმონი",
            englishName: "Garmoni",
            description: "Button accordion widely adopted in Georgian folk and wedding music.",
            musicGenTag: "garmoni_accordion_georgian_wedding",
            audioSampleFile: "garmoni_sample.m4a",
            category: .wind
        ),
    ]

    static func find(by voiceCommand: String) -> GeorgianInstrument? {
        let lower = voiceCommand.lowercased()
        return all.first { instrument in
            lower.contains(instrument.georgianName.lowercased()) ||
            lower.contains(instrument.englishName.lowercased()) ||
            lower.contains(instrument.id)
        }
    }
}

// MARK: - Georgian Polyphony Style

struct PolyphonyStyle: Identifiable {
    let id: String
    let name: String         // Georgian
    let englishName: String
    let region: String
    let voices: Int
    let musicGenTag: String

    static let all: [PolyphonyStyle] = [
        PolyphonyStyle(id: "kartlian", name: "ქართლური მრავალხმიანობა", englishName: "Kartlian Polyphony",
                       region: "ქართლი", voices: 3, musicGenTag: "kartlian_three_voice_polyphony"),
        PolyphonyStyle(id: "kakhetian", name: "კახური მრავალხმიანობა", englishName: "Kakhetian Polyphony",
                       region: "კახეთი", voices: 3, musicGenTag: "kakhetian_table_song_polyphony"),
        PolyphonyStyle(id: "gurian", name: "გურული მრავალხმიანობა", englishName: "Gurian Polyphony",
                       region: "გურია", voices: 3, musicGenTag: "gurian_yodel_polyphony_tchrimeli"),
        PolyphonyStyle(id: "svan", name: "სვანური მრავალხმიანობა", englishName: "Svan Polyphony",
                       region: "სვანეთი", voices: 3, musicGenTag: "svan_mountain_ritual_polyphony"),
        PolyphonyStyle(id: "megrelian", name: "მეგრული მრავალხმიანობა", englishName: "Megrelian Polyphony",
                       region: "სამეგრელო", voices: 3, musicGenTag: "megrelian_lullaby_polyphony"),
    ]
}

// MARK: - Georgian Cultural Context Service

@MainActor
final class GeorgianCulturalLayer: ObservableObject {

    static let shared = GeorgianCulturalLayer()

    private let dialectNormaliser = GeorgianDialectNormaliser()

    @Published private(set) var detectedDialect: GeorgianDialect = .standardKartlian

    private init() {}

    // MARK: - Text Processing

    /// Normalise Georgian dialect/slang input before sending to Agent G
    func processInput(_ text: String) -> (processed: String, contextHint: String) {
        let result = dialectNormaliser.normalise(text: text)
        detectedDialect = result.detectedDialect
        let hint = dialectNormaliser.buildDialectHint(result)
        return (result.normalised, hint)
    }

    // MARK: - Instrument Voice Command Parsing

    /// Detect instrument addition request from voice/text command
    func parseInstrumentCommand(_ text: String) -> GeorgianInstrument? {
        GeorgianInstrument.find(by: text)
    }

    /// Parse polyphony style request
    func parsePolyphonyCommand(_ text: String) -> PolyphonyStyle? {
        let lower = text.lowercased()
        return PolyphonyStyle.all.first {
            lower.contains($0.name.lowercased()) || lower.contains($0.englishName.lowercased())
        }
    }

    // MARK: - Music Generation Enhancement

    /// Build Georgian-enriched music generation tags from a prompt
    func enrichMusicPrompt(_ prompt: String) -> String {
        var enriched = prompt
        var tags: [String] = []

        // Detect requested instruments
        for instrument in GeorgianInstrument.all {
            if prompt.lowercased().contains(instrument.georgianName.lowercased()) ||
               prompt.lowercased().contains(instrument.englishName.lowercased()) {
                tags.append(instrument.musicGenTag)
            }
        }

        // Detect polyphony requests
        for style in PolyphonyStyle.all {
            if prompt.lowercased().contains(style.name.lowercased()) ||
               prompt.lowercased().contains(style.englishName.lowercased()) ||
               prompt.lowercased().contains("მრავალხმიანობა") ||
               prompt.lowercased().contains("polyphon") {
                tags.append(style.musicGenTag)
            }
        }

        // Generic Georgian folk markers
        if prompt.lowercased().contains("ქართული") ||
           prompt.lowercased().contains("georgian") ||
           prompt.lowercased().contains("folk") ||
           prompt.lowercased().contains("ხალხური") {
            tags.append("georgian_traditional_folk_caucasus")
        }

        if !tags.isEmpty {
            enriched += " [style: \(tags.joined(separator: ", "))]"
        }
        return enriched
    }

    // MARK: - Cultural Proverbs & Quotes (for Georgian Muse personality)

    private let georgianProverbs: [(georgian: String, transliteration: String, meaning: String)] = [
        (georgian: "ენა მახვილზე მახვილია",
         transliteration: "Ena makhvilze makhvilia",
         meaning: "The tongue is sharper than a sword"),
        (georgian: "ვინც ვარდი გინდა — ეკალს ეთმობა",
         transliteration: "Vinc vardi ginda — ekals etmoba",
         meaning: "He who wants a rose must endure thorns"),
        (georgian: "სიბრძნე საუნჯეა, ის არ ილევა",
         transliteration: "Sibrdzne saunje a, is ar ileva",
         meaning: "Wisdom is treasure that never depletes"),
        (georgian: "ერთი ხელი ტაშს ვერ ჰკრავს",
         transliteration: "Erti kheli tash vers hkravs",
         meaning: "One hand cannot clap (teamwork matters)"),
        (georgian: "ლამაზი ვაზი ყოველ წელს ტკბილ ყურძენს გამოიტანს",
         transliteration: "Lamazi vazi q'ovel tsels tkbil q'urdzens gamoitans",
         meaning: "A healthy vine brings sweet grapes every year"),
    ]

    func randomProverb() -> (georgian: String, transliteration: String, meaning: String) {
        georgianProverbs.randomElement() ?? georgianProverbs[0]
    }

    /// Rustaveli quotes (The Knight in Panther's Skin)
    private let rustaveliQuotes: [String] = [
        "რაც შენი არ არი, ნუ შეიქ'ებ, ნუ გახდი სიამოვნება.",
        "ვისცა ჰყვარობ, ეყვარებოდ, ესე სჯობს სიახლოვესა.",
        "მოყვარეთა სიყვარულმა, ვინ მე გამომიყვანა?",
        "ჭირი ჭირსა ყველაა, სჯობს ყველასა სიჭირე.",
        "ვეფხისტყაოსანი — ქართული სულის სარკე.",
    ]

    func randomRustaveliQuote() -> String {
        rustaveliQuotes.randomElement() ?? rustaveliQuotes[0]
    }
}
