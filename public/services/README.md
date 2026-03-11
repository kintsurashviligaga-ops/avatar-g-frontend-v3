# Service Visuals

This directory stores generated photorealistic service card visuals.

## Generate images

```bash
REPLICATE_API_TOKEN=r8_xxx node scripts/generate-service-visuals.mjs
```

Images will be saved as `{slug}.webp` and automatically used by the ServiceCardVisual component.
