#!/usr/bin/env bash
# Real ffprobe/ffmpeg QC of the downloaded Lyria evidence files (docs/handoffs/music-studio/evidence/lyria-live/).
# Prints one JSON object per file: container/codec/rate/channels/duration, full-decode error count, EBU R128 (loudnorm)
# integrated loudness + true peak, silence spans, and a centre-vs-side energy ratio (a HEURISTIC hint of a centred
# lead voice — never proof of singing; that needs a listener).
set -euo pipefail
dir="${1:-docs/handoffs/music-studio/evidence/lyria-live}"
for f in "$dir"/*.mp3 "$dir"/*.wav; do
  [ -f "$f" ] || continue
  probe=$(ffprobe -v error -show_entries format=format_name,duration,bit_rate:stream=codec_name,sample_rate,channels -of json "$f")
  decode_errors=$(ffmpeg -v error -i "$f" -f null - 2>&1 | grep -c . || true)
  ln=$(ffmpeg -hide_banner -nostats -i "$f" -af loudnorm=print_format=json -f null - 2>&1)
  lufs=$(echo "$ln" | awk -F'"' '/"input_i"/{print $4}')
  tpk=$(echo "$ln" | awk -F'"' '/"input_tp"/{print $4}')
  silences=$(ffmpeg -hide_banner -nostats -i "$f" -af silencedetect=n=-50dB:d=1 -f null - 2>&1 | grep -c silence_end || true)
  mid=$(ffmpeg -hide_banner -nostats -i "$f" -af "pan=mono|c0=0.5*c0+0.5*c1,volumedetect" -f null - 2>&1 | awk '/mean_volume/{print $5}')
  side=$(ffmpeg -hide_banner -nostats -i "$f" -af "pan=mono|c0=0.5*c0-0.5*c1,volumedetect" -f null - 2>&1 | awk '/mean_volume/{print $5}')
  sha=$(shasum -a 256 "$f" | cut -d' ' -f1)
  printf '{"file":"%s","sha256":"%s","decodeErrors":%s,"integratedLufs":"%s","truePeakDbfs":"%s","silenceSpans_ge1s_below_-50dB":%s,"midMeanDb":"%s","sideMeanDb":"%s","probe":%s}\n' \
    "$(basename "$f")" "$sha" "$decode_errors" "$lufs" "$tpk" "$silences" "$mid" "$side" "$(echo "$probe" | tr -d '\n ')"
done
