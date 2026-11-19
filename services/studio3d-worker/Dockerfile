# services/studio3d-worker — MyAvatar.ge 3D Studio GPU worker (Phase 8.8). NOT DEPLOYED; see README.md.
# Cloud Run Job, europe-west4, 1× nvidia-rtx-pro-6000, 20 vCPU / 80 GiB, task timeout 600 s, max retries 0.
FROM nvidia/cuda:12.4.1-cudnn-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 PYOPENGL_PLATFORM=egl
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3.10 python3-pip python3.10-dev git ffmpeg libegl1 libgl1 libglib2.0-0 ninja-build \
    && rm -rf /var/lib/apt/lists/* && ln -sf /usr/bin/python3.10 /usr/bin/python

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124 \
 && pip install --no-cache-dir -r requirements.txt

# TRELLIS.2 at a pinned commit (set at build time after the D3 probe). Its setup script builds o-voxel, nvdiffrast, flexgemm.
ARG TRELLIS_REF=main
RUN git clone --recursive https://github.com/microsoft/TRELLIS.2.git /opt/trellis2 \
 && cd /opt/trellis2 && git checkout "$TRELLIS_REF" \
 && bash setup.sh --basic --flash-attn --nvdiffrast --nvdiffrec --cumesh --o-voxel --flexgemm
ENV PYTHONPATH=/opt/trellis2

# Weights are baked into the image, so a run never downloads at start (and never calls the Hub at run time).
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download('microsoft/TRELLIS.2-4B', local_dir='/weights/TRELLIS.2-4B')"
ENV TRELLIS_WEIGHTS=/weights/TRELLIS.2-4B HF_HUB_OFFLINE=1

COPY main.py .
USER 1000
ENTRYPOINT ["python", "/app/main.py"]
