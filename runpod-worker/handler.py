"""
MyAvatar.ge — RunPod Serverless FFmpeg Assembly Worker (Agent L).

Consumes the EXACT manifest that app/api/video/assemble/route.ts dispatches:

    job["input"] = {
      "segments":     [{ "url", "durationSec", "cameraMotion", "render" }, ...]  # 2–8 clips
      "voiceoverUrl": str | None,        # primary vocal lane
      "musicUrl":     str | None,        # background music lane (ducked)
      "sfxUrl":       str | None,        # background SFX/atmosphere lane (ducked)
      "globalRender": { "transition", "caption_theme", "vocal_ducking_pct", "fps", "sfx_enabled" },
      "pipelineId":   str,
      "callbackUrl":  str | None         # POST lifecycle events here (bearer-authed)
    }

Pipeline:
  1. Download every segment + audio lane to /tmp.
  2. Build a video filtergraph: xfade transitions between the N clips
     (transition style from globalRender.transition), optional 60fps minterpolate.
  3. Build a dual-track audio mix: voiceover (full) + (music ∪ sfx) ducked by
     vocal_ducking_pct via sidechaincompress keyed on the voiceover.
  4. Encode H.264/AAC MP4, upload to Supabase Storage (`renders` bucket),
     POST a `pipeline.completed` event to callbackUrl, and return { "url": ... }.

On any failure it POSTs `pipeline.failed` and returns { "error": ... } so the
app's Saga can compensate (release credit lock + refund).

Env (set as RunPod endpoint secrets):
  • RUNPOD_RENDER_WEBHOOK_TOKEN   — bearer the app signs callbacks/dispatch with
  • SUPABASE_URL                  — https://<ref>.supabase.co
  • SUPABASE_SERVICE_ROLE_KEY     — to upload the master to Storage
  • RENDER_BUCKET (optional)      — defaults to "renders"
"""

import os
import subprocess
import tempfile
import uuid
import json
import urllib.request
import urllib.error

import runpod

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
RENDER_BUCKET = os.environ.get("RENDER_BUCKET", "renders")
CALLBACK_TOKEN = os.environ.get("RUNPOD_RENDER_WEBHOOK_TOKEN", "")

XFADE = {  # globalRender.transition → ffmpeg xfade transition name
    "crossfade": "fade",
    "dissolve": "dissolve",
    "wipe": "wiperight",
    "fade_to_black": "fadeblack",
}
TRANSITION_SEC = 0.5


def _download(url: str, dest: str) -> str:
    urllib.request.urlretrieve(url, dest)
    return dest


def _post_callback(callback_url, payload):
    if not callback_url:
        return
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(callback_url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        if CALLBACK_TOKEN:
            req.add_header("Authorization", f"Bearer {CALLBACK_TOKEN}")
        urllib.request.urlopen(req, timeout=15).read()
    except Exception as exc:  # callbacks are best-effort
        print(f"[callback] {exc}")


def _upload_to_supabase(local_path: str, object_name: str) -> str:
    """Upload the master MP4 to Supabase Storage; return the object URL."""
    if not (SUPABASE_URL and SUPABASE_KEY):
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured")
    with open(local_path, "rb") as fh:
        body = fh.read()
    endpoint = f"{SUPABASE_URL}/storage/v1/object/{RENDER_BUCKET}/{object_name}"
    req = urllib.request.Request(endpoint, data=body, method="POST")
    req.add_header("Authorization", f"Bearer {SUPABASE_KEY}")
    req.add_header("Content-Type", "video/mp4")
    req.add_header("x-upsert", "true")
    urllib.request.urlopen(req, timeout=120).read()
    # Internal object URL — the app re-signs it (storage-adapter.reSignIfInternal).
    return f"{SUPABASE_URL}/storage/v1/object/{RENDER_BUCKET}/{object_name}"


def _build_filtergraph(n_clips, has_voice, has_music, has_sfx, fps, duck_pct):
    """Return (filter_complex, video_out_label, audio_out_label)."""
    parts = []

    # ── Video: normalize then xfade-chain the clips ──────────────────────────
    for i in range(n_clips):
        parts.append(f"[{i}:v]settb=AVTB,fps={min(fps,30)},format=yuv420p[v{i}]")
    trans = "fade"
    if n_clips == 1:
        vlabel = "[v0]"
    else:
        prev = "v0"
        offset = 6.0 - TRANSITION_SEC
        for i in range(1, n_clips):
            out = f"vx{i}"
            parts.append(
                f"[{prev}][v{i}]xfade=transition={trans}:duration={TRANSITION_SEC}:offset={offset:.2f}[{out}]"
            )
            prev = out
            offset += 6.0 - TRANSITION_SEC
        vlabel = f"[{prev}]"

    # Optional AI-ish 60fps interpolation (heavy — GPU recommended).
    if fps >= 60:
        parts.append(f"{vlabel}minterpolate=fps=60:mi_mode=mci[vout]")
        vlabel = "[vout]"

    # ── Audio: voiceover (full) + ducked background (music ∪ sfx) ────────────
    bg_inputs = []
    audio_index = n_clips  # audio inputs are appended after video inputs
    voice_idx = music_idx = sfx_idx = None
    if has_voice:
        voice_idx = audio_index; audio_index += 1
    if has_music:
        music_idx = audio_index; audio_index += 1
    if has_sfx:
        sfx_idx = audio_index; audio_index += 1

    for idx in [music_idx, sfx_idx]:
        if idx is not None:
            bg_inputs.append(f"[{idx}:a]")

    duck = max(0.0, min(1.0, duck_pct / 100.0))
    alabel = None
    if has_voice and bg_inputs:
        # Mix background lanes, then sidechain-compress them keyed on the voice
        # (true ducking), then mix the ducked bed with the voice.
        if len(bg_inputs) > 1:
            parts.append(f"{''.join(bg_inputs)}amix=inputs={len(bg_inputs)}:normalize=0[bg]")
            bg = "[bg]"
        else:
            bg = bg_inputs[0]
        ratio = 1 + int(duck * 19)  # 0%→1 (off) … 100%→~20 (hard duck)
        parts.append(f"[{voice_idx}:a]asplit=2[vk][vmix]")
        parts.append(f"{bg}[vk]sidechaincompress=threshold=0.03:ratio={ratio}:attack=20:release=300[bgduck]")
        parts.append(f"[bgduck][vmix]amix=inputs=2:normalize=0[aout]")
        alabel = "[aout]"
    elif has_voice:
        alabel = f"[{voice_idx}:a]"
    elif bg_inputs:
        if len(bg_inputs) > 1:
            parts.append(f"{''.join(bg_inputs)}amix=inputs={len(bg_inputs)}:normalize=0[aout]")
            alabel = "[aout]"
        else:
            alabel = bg_inputs[0]

    return ";".join(parts), vlabel, alabel


def handler(job):
    inp = job.get("input", {}) or {}
    pipeline_id = inp.get("pipelineId", str(uuid.uuid4()))
    callback_url = inp.get("callbackUrl")
    segments = [s for s in (inp.get("segments") or []) if s.get("url")]
    if len(segments) < 1:
        return {"error": "no segments"}

    glob = inp.get("globalRender", {}) or {}
    fps = 60 if str(glob.get("fps")) == "60" else 24
    duck_pct = float(glob.get("vocal_ducking_pct", 30) or 30)

    work = tempfile.mkdtemp(prefix="render_")
    _post_callback(callback_url, {"pipelineId": pipeline_id, "topic": "media.pipeline.initiated"})

    try:
        # 1. Download inputs
        inputs = []
        for i, seg in enumerate(segments):
            inputs.append(_download(seg["url"], os.path.join(work, f"seg{i}.mp4")))
        _post_callback(callback_url, {"pipelineId": pipeline_id, "topic": "assembling"})

        voice = music = sfx = None
        if inp.get("voiceoverUrl"):
            voice = _download(inp["voiceoverUrl"], os.path.join(work, "voice.mp3"))
        if inp.get("musicUrl"):
            music = _download(inp["musicUrl"], os.path.join(work, "music.mp3"))
        if inp.get("sfxUrl"):
            sfx = _download(inp["sfxUrl"], os.path.join(work, "sfx.mp3"))

        # 2. Build ffmpeg command
        cmd = ["ffmpeg", "-y"]
        for p in inputs:
            cmd += ["-i", p]
        for a in [voice, music, sfx]:
            if a:
                cmd += ["-i", a]

        filtergraph, vlabel, alabel = _build_filtergraph(
            len(inputs), bool(voice), bool(music), bool(sfx), fps, duck_pct
        )
        out_path = os.path.join(work, "master.mp4")
        cmd += ["-filter_complex", filtergraph, "-map", vlabel]
        if alabel:
            cmd += ["-map", alabel]
        cmd += [
            "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out_path,
        ]
        _post_callback(callback_url, {"pipelineId": pipeline_id, "topic": "encoded"})
        subprocess.run(cmd, check=True, capture_output=True)

        # 3. Upload + callback
        object_name = f"{pipeline_id}/{uuid.uuid4().hex}.mp4"
        url = _upload_to_supabase(out_path, object_name)
        _post_callback(callback_url, {"pipelineId": pipeline_id, "topic": "media.pipeline.completed", "url": url})
        return {"url": url, "pipelineId": pipeline_id}

    except subprocess.CalledProcessError as exc:
        msg = (exc.stderr or b"").decode("utf-8", "ignore")[-500:]
        _post_callback(callback_url, {"pipelineId": pipeline_id, "topic": "media.pipeline.failed", "error": msg})
        return {"error": f"ffmpeg failed: {msg}"}
    except Exception as exc:  # noqa: BLE001
        _post_callback(callback_url, {"pipelineId": pipeline_id, "topic": "media.pipeline.failed", "error": str(exc)})
        return {"error": str(exc)}


runpod.serverless.start({"handler": handler})
