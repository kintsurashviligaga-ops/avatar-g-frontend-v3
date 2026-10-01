# Template gallery thumbnails — the shot list (BILLABLE, hard-capped)

The prompts committed before the first call are exactly the prompts that run (scripts/hf-art-pack.ts reads these
```json shot``` blocks). One Soul v2 call per template returns four 3:4 variants; the best one is selected after review
(`--select <id>:<attempt> --output <n>`), resized to 600×800 and written to `public/templates/<tool>/<id>.jpg`, and
the template's `thumb` in lib/studio/templates.ts is pointed at it.

Money: the `templates` pack is capped at $5.00 (the owner's 2026-10-01 budget) with a stop line at $4.50; every
request is priced first by the provider's free /estimate. Run:

    npx jiti scripts/hf-art-pack.ts --pack templates --dry        # price everything (free)
    npx jiti scripts/hf-art-pack.ts --pack templates --yes-spend  # run the pending shots

Art direction (shared tail): premium dark cinematic thumbnails, deep true blacks, one clear subject, empty lower third
for the card's label, and never any text, logo or UI — the label is set by the app, not baked into the picture.

## Video teaser

```json shot
{
  "id": "video/teaser",
  "title": "Video teaser",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A single striking cinematic frame: a lone figure on a rain-soaked rooftop in Old Tbilisi at blue hour, holding an umbrella, city lights blurred far below, vertical composition, anamorphic lens flare, teal-and-amber grade. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```

## Video anime

```json shot
{
  "id": "video/anime",
  "title": "Video anime",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "Hand-drawn anime film still: a young woman on a hillside above a glowing night city, wind in her hair, a meteor streaking across a star-filled indigo sky, cel shading, soft painterly background, Studio-style animation quality, vertical composition. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```

## Video neon nights

```json shot
{
  "id": "video/neon-nights",
  "title": "Video neon nights",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A narrow city street at night drenched in magenta and electric blue neon reflections on wet asphalt, a motorcyclist passing in motion blur, haze and rain, cyberpunk mood, vertical composition, cinematic. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```

## Video nature documentary

```json shot
{
  "id": "video/nature-doc",
  "title": "Video nature documentary",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A snow leopard on a rocky ridge in the Caucasus mountains at golden hour, mist in the valleys behind, telephoto wildlife documentary photography, crisp detail on the fur, epic and calm. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```

## Video film noir

```json shot
{
  "id": "video/noir",
  "title": "Video film noir",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "Black-and-white film noir still: a detective in a fedora and trench coat under a single streetlamp, venetian-blind shadows across a brick wall, cigarette smoke curling, hard high-contrast lighting, 1940s cinema. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```

## Video music video

```json shot
{
  "id": "video/music-video",
  "title": "Video music video",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A singer performing on a dark stage in a cloud of haze, backlit by sweeping electric-blue and violet light beams, microphone in hand, dynamic music-video energy, vertical composition, cinematic. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```

## Image social post

```json shot
{
  "id": "image/social",
  "title": "Image social post",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A stylish young woman at a sunlit Tbilisi café terrace holding a coffee cup, laughing, warm natural light, shallow depth of field, lifestyle social-media photography, candid and premium. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```

## Image cinematic poster

```json shot
{
  "id": "image/poster",
  "title": "Image cinematic poster",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A cinematic movie-poster image without any text: a silhouetted hero standing before a vast burning orange sky and a lone mountain fortress, dramatic scale, volumetric smoke, epic composition. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```

## Image wallpaper

```json shot
{
  "id": "image/wallpaper",
  "title": "Image wallpaper",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A breathtaking widescreen landscape wallpaper: the Caucasus mountains under the aurora at night, a glassy alpine lake reflecting the peaks and stars, ultra-detailed, serene. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```

## Image concept art

```json shot
{
  "id": "image/concept",
  "title": "Image concept art",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "Digital concept art of a floating city of glass towers above a sea of clouds at sunrise, airships drifting between spires, painterly sci-fi worldbuilding, detailed matte painting. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```

## Image anime

```json shot
{
  "id": "image/anime",
  "title": "Image anime",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "Anime illustration of a girl with short silver hair in a school uniform under falling cherry blossoms at dusk, glowing lanterns, clean line art, vibrant cel-shaded colours. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```

## Image oil painting

```json shot
{
  "id": "image/oil-painting",
  "title": "Image oil painting",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A classical oil painting of an old Georgian winemaker holding a clay qvevri cup by candlelight, thick visible brush strokes on canvas, Rembrandt-like chiaroscuro, warm umber palette. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```

## Image 3D render

```json shot
{
  "id": "image/3d-render",
  "title": "Image 3D render",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A glossy 3D render of a cute stylised blue rocket toy on a matte black pedestal, soft studio lighting with a rim light, subsurface highlights, clean product-render look. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```

## Music cinematic score

```json shot
{
  "id": "music/hollywood-cinematic",
  "title": "Music cinematic score",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A grand symphony orchestra on a dark concert-hall stage seen from behind the conductor, golden stage light on violins and brass, dust floating in the beams, epic and emotional. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```

## Music R&B beat

```json shot
{
  "id": "music/rnb-beat",
  "title": "Music R&B beat",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "Late-night recording-studio still life: a glowing beat-making pad and studio monitors, a vinyl record and headphones on a desk, warm magenta and amber light, smooth R&B mood. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```

## Music R&B hip-hop

```json shot
{
  "id": "music/rnb-hiphop-core",
  "title": "Music R&B hip-hop",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A hip-hop artist in a hooded jacket performing to a crowd in a smoky club, purple and gold spotlights, raised hands in silhouette, gritty energetic concert photography. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```

## Music Georgian folk

```json shot
{
  "id": "music/georgian-folk",
  "title": "Music Georgian folk",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A Georgian folk musician playing a panduri in a candlelit stone cellar, traditional chokha costume, warm firelight, wooden beams and clay qvevri jars in the background, intimate and timeless. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```

## Music electronic cyber

```json shot
{
  "id": "music/electronic-cyber",
  "title": "Music electronic cyber",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A DJ silhouetted behind a booth facing a crowd, a wall of laser beams in electric blue and cyan cutting through haze, festival night, high energy electronic music. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```

## Music jazz lounge

```json shot
{
  "id": "music/retro-jazz-lounge",
  "title": "Music jazz lounge",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A smoky 1950s jazz lounge: a saxophonist under a warm amber spotlight, a stand-up bass and a grand piano in soft focus, red velvet booths, vintage film grain. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```

## Music documentary ambient

```json shot
{
  "id": "music/documentary-ambient",
  "title": "Music documentary ambient",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A misty pine forest at dawn with soft light rays filtering through the fog, a calm river in the foreground, meditative ambient atmosphere, muted teal and grey tones. Premium dark cinematic thumbnail art for a creative app: deep true blacks, rich contrast, one clear subject, generous negative space at the bottom third, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261001
  }
}
```
