# MyAvatar.ge — RunPod Serverless FFmpeg Assembly Worker (Agent L)
# CUDA base so libx264 + minterpolate (60fps) run on GPU-backed nodes.
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-pip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt
COPY handler.py .

CMD ["python3", "-u", "handler.py"]
