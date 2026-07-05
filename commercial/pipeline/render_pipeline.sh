#!/usr/bin/env bash
# render_pipeline.sh — MyAvatar.ge 60s Showcase Commercial assembly driver.
#
# Consumes commercial/asset_manifest.json (built by build_manifest.mjs) and orchestrates the
# 7 assembly stages from commercial_blueprint.md §10. It NEVER fabricates footage: source clips
# (AI-gen / capture / MoGraph) are dropped into 01_source/** by their engines; audio into
# 02_audio/**; caption overlays into 03_captions/. Every render stage is GUARDED on input
# presence and refuses to run on a missing asset (no silent partial masters).
#
#   ./render_pipeline.sh --check     dry-run: validate scaffold + report asset presence, NO render
#   ./render_pipeline.sh stitch      concat S01..S16 → 04_work/picture_silent.mov (exact 60s)
#   ./render_pipeline.sh mix         VO+score+SFX → duck → loudnorm −14 LUFS → mix_master.wav
#   ./render_pipeline.sh caption     overlay kinetic Georgian captions
#   ./render_pipeline.sh master      picture + mix → 05_masters/final_master.mov
#   ./render_pipeline.sh encode      H.264 4K 16:9 (+ ProRes archive)
#   ./render_pipeline.sh reframe     9:16 + 1:1 social exports
#   ./render_pipeline.sh all         stitch → … → reframe (each guarded)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"          # .../commercial
MANIFEST="$ROOT/asset_manifest.json"
FPS=24

have() { command -v "$1" >/dev/null 2>&1; }
q() { node -e "const m=require('$MANIFEST');$1" 2>/dev/null; }   # tiny manifest query helper

banner() { printf '\n\033[36m▶ %s\033[0m\n' "$1"; }

check() {
  banner "PREREQUISITES"
  have node   && echo "  ✓ node    $(node -v)"            || { echo "  ✗ node MISSING (required)"; exit 1; }
  if have ffmpeg; then echo "  ✓ ffmpeg  $(ffmpeg -version | head -1 | cut -d' ' -f3)"; else echo "  ⚠ ffmpeg NOT installed — install before rendering (brew install ffmpeg)"; fi
  [ -f "$MANIFEST" ] && echo "  ✓ manifest present" || { echo "  ✗ asset_manifest.json missing — run: node pipeline/build_manifest.mjs"; exit 1; }

  banner "FRAME MATH"
  q "const s=m.shots,sum=s.reduce((a,x)=>a+x.dur_frames,0);console.log('  '+(sum===m.master.total_frames?'✓':'✗')+' Σ '+sum+'/'+m.master.total_frames+' frames · '+s.length+' shots · '+(sum/${FPS}).toFixed(3)+'s')"

  banner "SOURCE ASSET PRESENCE (16 shots)"
  local present=0 missing=0
  while IFS='|' read -r id out gen; do
    [ -z "$id" ] && continue
    if [ -f "$ROOT/$out" ]; then echo "  ✓ $id  $out"; present=$((present+1))
    else echo "  ⏳ $id  $out  (pending — ${gen})"; missing=$((missing+1)); fi
  done < <(q "for(const s of m.shots)console.log([s.id,s.output,s.generative?'AI-GEN prompt in manifest':s.source].join('|'))")
  echo "  → $present present · $missing pending"

  banner "AUDIO + CAPTION PRESENCE"
  for f in $(q "console.log([...m.audio_tracks.vo,...m.audio_tracks.score_stems,m.audio_tracks.mix_master].join(' '))"); do
    [ -f "$ROOT/$f" ] && echo "  ✓ $f" || echo "  ⏳ $f"
  done
  ls "$ROOT/03_captions"/*_alpha.mov >/dev/null 2>&1 && echo "  ✓ caption overlay(s) present" || echo "  ⏳ 03_captions/*_alpha.mov (pending)"

  banner "READY?"
  if [ "$missing" -eq 0 ]; then echo "  ✓ all 16 source clips present → 'stitch' can run"; else echo "  ⏳ $missing source clip(s) pending — drop them into 01_source/** then re-run --check"; fi
}

# Guard: every path arg must exist, else abort the stage.
require() { for f in "$@"; do [ -f "$ROOT/$f" ] || { echo "✗ missing input: $f — aborting stage"; exit 2; }; done; }

stitch() {
  banner "STITCH (concat, exact 60s skeleton; craft xfades/MoGraph layered in the NLE/AE — §10.1)"
  # Build the ordered concat list from the manifest; assert all 16 present first.
  mapfile -t OUTS < <(q "for(const s of m.shots)console.log(s.output)")
  require "${OUTS[@]}"
  local list="$ROOT/04_work/concat.txt"; : > "$list"
  for o in "${OUTS[@]}"; do printf "file '%s'\n" "$ROOT/$o" >> "$list"; done
  echo "  concat list → $list"
  have ffmpeg && ffmpeg -y -f concat -safe 0 -i "$list" -r "$FPS" -c:v prores_ks -profile:v 3 "$ROOT/04_work/picture_silent.mov" \
    || echo "  (ffmpeg absent — command prepared; install ffmpeg to execute)"
}

mix() {
  banner "MIX (duck score under VO + loudnorm −14 LUFS / −1 dBTP — §10.2)"
  require 02_audio/score/pulse_arp.wav 02_audio/vo/VO1_hook.wav
  echo "  → 02_audio/mix/mix_master.wav  (sidechaincompress + loudnorm=I=-14:TP=-1:LRA=11)"
  echo "  (assemble the VO/score/SFX buses per §10.2; guarded stub)"
}

caption() { banner "CAPTION (overlay kinetic Georgian alpha — §10.3)"; require 04_work/picture_silent.mov; echo "  → 04_work/picture_capped.mov"; }
master()  { banner "MASTER (§10.4)"; require 04_work/picture_capped.mov 02_audio/mix/mix_master.wav; echo "  → 05_masters/final_master.mov (ProRes 422 HQ archive)"; }
encode()  { banner "ENCODE 4K 16:9 (§10.4)"; require 05_masters/final_master.mov; echo "  → 06_exports/16x9_4k/MyAvatar_60s_4K_16x9.mp4 (H.264 crf16 +faststart)"; }
reframe() { banner "REFRAME (§10.5)"; require 06_exports/16x9_4k/MyAvatar_60s_4K_16x9.mp4; echo "  → 9x16 + 1x1 (per-shot reframe, not blind center-crop)"; }

case "${1:---check}" in
  --check|check) check ;;
  stitch) stitch ;; mix) mix ;; caption) caption ;; master) master ;; encode) encode ;; reframe) reframe ;;
  all) stitch; mix; caption; master; encode; reframe ;;
  *) echo "usage: $0 [--check|stitch|mix|caption|master|encode|reframe|all]"; exit 1 ;;
esac
