# Service Visuals

This document describes how to regenerate service card visuals for the app. The actual generator script is `scripts/generate-service-cards.mjs`.

## Generate images

```bash
REPLICATE_API_TOKEN=r8_xxx node scripts/generate-service-cards.mjs
```

Images will be saved as `{slug}.webp` and automatically used by the ServiceCardVisual component.
