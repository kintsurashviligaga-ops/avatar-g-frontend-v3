# EU AI Act Article 50: how MyAvatar.ge marks AI output

Status: draft, every switch off. GG decided on 2026-11-27 to close the Article 50 gaps found in the
2026-11-26 static check. Article 50 has applied since 2026-08-02.

## What the article asks, and what covers it

| Article 50 | What it asks | What covers it here |
|---|---|---|
| 50(1) | Tell people they are talking to an AI | Live voice `aiNotice` (components/voice/live/liveOverlayCopy.ts), already in production |
| 50(2) | Machine-readable marking of synthetic image, video and audio | SynthID from Google's models (we never remove it) **plus** IPTC/XMP metadata from `lib/provenance/aiMarking.ts` (this PR) |
| 50(4) | Disclose deepfakes (a real person's likeness) | Machine-readable `likeness` description in the metadata. A visible label exists only as an opt-in (below) |
| Visible label | Code of Practice: a visible mark next to the machine-readable one | Opt-in only (`NEXT_PUBLIC_AI_LABELS` exactly `1`), **off on myavatar.ge** |

**Product decision (GG, 2026-11-27):** the public site shows clean results with no visible "AI" badge,
watermark or deepfake label, like Google AI Studio and Gemini. Compliance there rests on the invisible
layers: SynthID from Google's models plus the IPTC/XMP metadata below. The visible badge
(`components/studio/ui/AiContentBadge`) is kept only for a deployment whose client legally demands it.
Neither layer changes what the user sees in the result or in the downloaded file.

We never crop, blur or cover a provider's watermark. The Veo bottom-band crop
(`stripBottomWatermark`) was deleted in a separate PR.

## Machine-readable layer (this PR)

`maybeMarkAiOutput(bytes, contentType, mark)` writes one XMP packet into the file before it goes to
Supabase Storage. Downloads, shares and the Library all serve that stored file, so the mark travels
with it. The packet holds:

- `Iptc4xmpExt:DigitalSourceType`: `trainedAlgorithmicMedia` for a generation,
  `compositeWithTrainedAlgorithmicMedia` for an AI edit;
- `Iptc4xmpExt:AISystemUsed` = "Google Vertex AI (via MyAvatar.ge)", `xmp:CreatorTool` = "MyAvatar.ge";
- `dc:description`: "AI-generated" (plus "not a real recording" when `likeness` is set).

| Format | Where the packet goes | Notes |
|---|---|---|
| PNG | `iTXt` chunk `XML:com.adobe.xmp` before IDAT | |
| JPEG | APP1 `http://ns.adobe.com/xap/1.0/` after JFIF/Exif | |
| WebP | `XMP ` chunk, VP8X flag set (VP8X header added for simple files) | |
| MP4/MOV | top-level `uuid` box BE7ACFCB-97A9-42E8-9C71-999491E3AFAC, appended | nothing before it moves, so `moov` offsets stay valid |
| MP3 | ID3v2 `TXXX:AI_GENERATED` + `PRIV:XMP` | new ID3v2.3 tag, or added to a plain existing v2.3/v2.4 tag |
| WAV | `_PMX` RIFF chunk, RIFF size fixed | |
| WebM, Ogg, FLAC, GLB, PDF | not marked (returned unchanged) | SynthID and the visible badge still apply |

Rules the code keeps:

- It never throws and never re-encodes: pixels and samples are byte-identical (tested with sharp).
- It is idempotent: a file that already has XMP is left alone.
- A file it cannot parse safely is uploaded unchanged, with an `[ai-provenance] not marked:` log line.
- Only calls that pass `{ aiMark: AI_GENERATED }` are marked. User uploads, reference images, plain
  ffmpeg trims/concats of the user's own media and PDFs are never marked.

Marked call sites: image (nanobanana route, chat gemini-image, storyboard frames), video (Veo/Omni
delivery, director, genjutsu scene, agent queue, longform, final cut, assembly, music video), audio
(music route, Music Studio, Lyria beds, Georgian song, film voiceover TTS, orchestrator voice), and
Studio job outputs.

Known gap: an ffmpeg pass that re-encodes an already-marked clip (caption burn, overlays, remix
edits) writes a new file without the box. Those outputs still carry SynthID and the visible badge.
Marking them needs `{ aiMark: { source: 'edited' } }` at each of those call sites once we confirm
the input is always our own AI output.

## C2PA (not done: needs a certificate)

C2PA Content Credentials are a signed manifest. Signing needs a certificate from a CA on the C2PA
trust list plus the `c2pa` signing library. The project has neither. When GG has a certificate,
add a signer next to `maybeMarkAiOutput` (same call sites) and keep the XMP packet as the fallback.

## Switches

| Variable | Values | Default | Effect |
|---|---|---|---|
| `AI_PROVENANCE_META` | exactly `1` | off | writes the invisible XMP metadata at upload |
| `NEXT_PUBLIC_AI_LABELS` | exactly `1` | off (keep unset on myavatar.ge) | visible labels, enterprise opt-in only |

Turn-on: set the variable in Vercel Production, redeploy, generate one image, one clip and one song,
then check with `exiftool -XMP:all <file>` that `DigitalSourceType` is present.
