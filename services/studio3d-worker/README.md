# studio3d-worker (NOT DEPLOYED)

GPU worker for the Phase 8.8 3D Studio. Open-weights **TRELLIS.2-4B** (MIT) inside **our own** GCP project, as a
**Cloud Run Job** (billed only while a model is being built; no idle GPU).

| Setting | Value |
|---|---|
| Region | `europe-west4` |
| GPU | 1× `nvidia-rtx-pro-6000` (96 GB), no zonal redundancy |
| CPU / memory | 20 vCPU / 80 GiB (required with this GPU) |
| Task timeout | 600 s, max retries 0 (the app refunds; a retry would double the GPU bill) |
| Parallelism | quota 3 GPUs → the app admits at most 3 runs |
| Identity | its own service account with **no roles** (it only uses the signed links in its spec) |

The app's Vertex service account needs `roles/run.developer` (or `run.jobs.runWithOverrides` + `run.executions.get`) on this one job.

## Turn-on (only after GG says GREEN, decision D3, ~$2)
```bash
gcloud builds submit services/studio3d-worker --tag europe-west4-docker.pkg.dev/$PROJECT/studio3d/worker:$REF
gcloud run jobs create studio3d --region europe-west4 --image europe-west4-docker.pkg.dev/$PROJECT/studio3d/worker:$REF \
  --gpu 1 --gpu-type nvidia-rtx-pro-6000 --no-gpu-zonal-redundancy --cpu 20 --memory 80Gi \
  --task-timeout 600s --max-retries 0 --service-account studio3d-worker@$PROJECT.iam.gserviceaccount.com
```
Then set `STUDIO_3D_GCP_PROJECT`, `STUDIO_3D_JOB=studio3d` (and optionally `STUDIO_3D_REGION`, `STUDIO_3D_TIMEOUT_SEC`,
`STUDIO_3D_DAILY_CAP`) in Vercel. The probe measures real GPU seconds; prices in `lib/studio3d/price.ts` are re-checked
against them before `STUDIO_3D_V2=admin`.

## Contract
Spec and manifest: `lib/studio3d/engine.ts` (`WorkerSpec`, `WorkerManifest`). Tested from the app side with mocks.
