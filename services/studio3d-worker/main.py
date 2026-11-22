"""
services/studio3d-worker/main.py — MyAvatar.ge 3D Studio GPU worker (Phase 8.8). NOT DEPLOYED.

Runs as a Cloud Run JOB (europe-west4, 1× NVIDIA RTX PRO 6000) in our own GCP project. One execution = one model.
Open-weights TRELLIS.2-4B (MIT) runs here; no third-party inference API is called.

Input: env STUDIO3D_SPEC = base64(JSON) written by lib/studio3d/engine.ts buildSpec():
  { v, jobId, mode: image|text|retexture, imageUrl, meshUrl?, grid: 1024|1536, faces, uploads: {glb, turntable, preview, manifest} }
  imageUrl / meshUrl are signed READ links; uploads.* are signed UPLOAD links into the private `studio3d` bucket. The job has
  no database or storage credentials: it can only write the four files this job owns.

Output: model.glb (PBR, WebP textures), turntable.mp4 (6 s, 720×720), preview.png, and manifest.json, which the app polls:
  {"v":1,"jobId":…,"step":"shape"|"texture"|"export"|"done"|"failed","faces":…,"gpuSeconds":…,"error":…}

The TRELLIS.2 calls follow the upstream README / example.py at the pinned commit in the Dockerfile; the paid probe (D3)
verifies them before anything is turned on.
"""
from __future__ import annotations

import base64
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.request
from urllib.parse import urlparse

ALLOWED_READ_HOST_SUFFIX = ".supabase.co"
MAX_INPUT_BYTES = 60 * 1024 * 1024
T0 = time.time()


def log(msg: str) -> None:
    print(json.dumps({"t": round(time.time() - T0, 1), "msg": msg}), flush=True)


def load_spec() -> dict:
    raw = os.environ.get("STUDIO3D_SPEC", "")
    spec = json.loads(base64.b64decode(raw).decode("utf-8"))
    if spec.get("v") != 1 or spec.get("mode") not in ("image", "text", "retexture"):
        raise ValueError("bad spec")
    for key in ("glb", "turntable", "preview", "manifest"):
        check_host(spec["uploads"][key])
    check_host(spec["imageUrl"])
    if spec.get("meshUrl"):
        check_host(spec["meshUrl"])
    if spec["grid"] not in (1024, 1536):
        raise ValueError("bad grid")
    return spec


def check_host(url: str) -> None:
    u = urlparse(url)
    if u.scheme != "https" or not (u.hostname or "").endswith(ALLOWED_READ_HOST_SUFFIX):
        raise ValueError("only our own storage is allowed")


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60) as r:  # noqa: S310 (host checked above)
        data = r.read(MAX_INPUT_BYTES + 1)
    if len(data) > MAX_INPUT_BYTES:
        raise ValueError("input too large")
    return data


def put(url: str, body: bytes, content_type: str) -> None:
    req = urllib.request.Request(url, data=body, method="PUT", headers={"content-type": content_type, "x-upsert": "true"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:  # noqa: S310
                if r.status < 300:
                    return
        except Exception:  # retry the upload, never the GPU work
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))


def manifest(spec: dict, step: str, **extra) -> None:
    body = {"v": 1, "jobId": spec["jobId"], "step": step, "gpuSeconds": round(time.time() - T0, 1), **extra}
    put(spec["uploads"]["manifest"], json.dumps(body).encode(), "application/json")


def build(spec: dict, workdir: str) -> tuple[str, int]:
    """Image → textured GLB (or repaint an existing mesh). Returns (glb path, face count)."""
    import torch  # noqa: F401  (imported here so the spec checks run without a GPU)
    from PIL import Image
    import o_voxel
    from trellis2.pipelines import Trellis2ImageTo3DPipeline

    image = Image.open(io.BytesIO(fetch(spec["imageUrl"]))).convert("RGBA")
    pipeline = Trellis2ImageTo3DPipeline.from_pretrained(os.environ.get("TRELLIS_WEIGHTS", "/weights/TRELLIS.2-4B"))
    pipeline.cuda()

    manifest(spec, "shape")
    pipeline_type = "1536_cascade" if spec["grid"] == 1536 else "1024_cascade"
    if spec["mode"] == "retexture":
        # Texture-only pass on the user's existing mesh (upstream texturing example): shape is kept, PBR re-baked.
        import trimesh
        mesh_path = os.path.join(workdir, "in.glb")
        with open(mesh_path, "wb") as f:
            f.write(fetch(spec["meshUrl"]))
        src = trimesh.load(mesh_path, force="mesh")
        out = pipeline.run_texturing(image, mesh=src)[0]  # API name verified in the D3 probe
    else:
        out = pipeline.run(image, pipeline_type=pipeline_type)[0]
        out.simplify(16_777_216)  # nvdiffrast limit

    manifest(spec, "texture")
    glb = o_voxel.postprocess.to_glb(
        vertices=out.vertices,
        faces=out.faces,
        attr_volume=out.attrs,
        coords=out.coords,
        attr_layout=out.layout,
        voxel_size=out.voxel_size,
        aabb=[[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
        decimation_target=int(spec["faces"]),
        texture_size=2048,
        remesh=True,
        remesh_band=1,
        remesh_project=0,
        verbose=False,
    )
    path = os.path.join(workdir, "model.glb")
    glb.export(path, extension_webp=True)
    import trimesh
    return path, int(len(trimesh.load(path, force="mesh").faces))


def turntable(glb_path: str, workdir: str) -> tuple[str, str]:
    """6 s, 24 fps, 720×720 spin + the first frame as preview.png (offscreen EGL)."""
    os.environ.setdefault("PYOPENGL_PLATFORM", "egl")
    import numpy as np
    import pyrender
    import trimesh
    from PIL import Image

    scene_t = trimesh.load(glb_path)
    bounds = scene_t.bounds
    center = bounds.mean(axis=0)
    radius = float(np.linalg.norm(bounds[1] - bounds[0])) or 1.0
    scene = pyrender.Scene.from_trimesh_scene(scene_t, bg_color=[0.93, 0.93, 0.94, 1.0], ambient_light=[0.35, 0.35, 0.35])
    cam = pyrender.PerspectiveCamera(yfov=np.pi / 4.5)
    cam_node = scene.add(cam)
    scene.add(pyrender.DirectionalLight(intensity=3.0), pose=np.eye(4))
    r = pyrender.OffscreenRenderer(720, 720)
    frames_dir = os.path.join(workdir, "frames")
    os.makedirs(frames_dir, exist_ok=True)
    n = 144
    for i in range(n):
        a = 2 * np.pi * i / n
        eye = center + radius * 1.25 * np.array([np.sin(a), 0.35, np.cos(a)])
        f = center - eye
        f /= np.linalg.norm(f)
        s = np.cross(f, [0, 1, 0]); s /= np.linalg.norm(s)
        u = np.cross(s, f)
        pose = np.eye(4); pose[:3, 0] = s; pose[:3, 1] = u; pose[:3, 2] = -f; pose[:3, 3] = eye
        scene.set_pose(cam_node, pose)
        color, _ = r.render(scene)
        Image.fromarray(color).save(os.path.join(frames_dir, f"{i:04d}.png"))
    r.delete()
    mp4 = os.path.join(workdir, "turntable.mp4")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-framerate", "24", "-i", os.path.join(frames_dir, "%04d.png"),
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", mp4],
        check=True,
    )
    return mp4, os.path.join(frames_dir, "0000.png")


def main() -> int:
    try:
        spec = load_spec()
    except Exception as e:  # nothing we can report to: no valid manifest url
        log(f"bad spec: {e}")
        return 2
    log(f"job {spec['jobId']} mode={spec['mode']} grid={spec['grid']}")
    try:
        with tempfile.TemporaryDirectory() as wd:
            glb_path, faces = build(spec, wd)
            manifest(spec, "export")
            mp4, png = turntable(glb_path, wd)
            with open(glb_path, "rb") as f:
                put(spec["uploads"]["glb"], f.read(), "model/gltf-binary")
            with open(mp4, "rb") as f:
                put(spec["uploads"]["turntable"], f.read(), "video/mp4")
            with open(png, "rb") as f:
                put(spec["uploads"]["preview"], f.read(), "image/png")
            manifest(spec, "done", faces=faces)
        log("done")
        return 0
    except Exception as e:
        traceback.print_exc()
        try:
            manifest(spec, "failed", error=str(e)[:300])
        except Exception:
            pass
        return 1


if __name__ == "__main__":
    sys.exit(main())
