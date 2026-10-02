# Template gallery thumbnails — the shot list (BILLABLE, hard-capped)

The prompts committed before the first call are exactly the prompts that run (scripts/hf-art-pack.ts reads these
```json shot``` blocks). One call per template returns four 3:4 variants, downloaded to
`scripts/templates/raw/<tool>/` (gitignored); the best one is selected after review
(`--select <id>:<attempt> --output <n>`), resized to 600×800 and written to `public/templates/<tool>/<id>.jpg` by
`node scripts/templates/build-thumbs.mjs`, which also prints the `thumb:` lines of lib/studio/templates.ts to change.
Every request — provider, prompt, price, request id — is logged in `scripts/templates/manifest.json`, never under
`public/` (which deploys).

Providers (`--provider`, scripts/art-providers.ts): `hf` (default) runs the shots as written on Soul v2; `replicate`
(FLUX schnell, $0.003 an image → about $0.24 for all 20) and `imagen` (Imagen 4, $0.04 an image → about $3.20) take
the same prompt, aspect ratio and image count, without the Soul-only fields.

Money: the `templates` pack is capped at $5.00 (the owner's 2026-10-01 budget) with a stop line at $4.50, whichever
provider spends it; every request is priced before it is sent — by Higgsfield's free /estimate, or from the static
`PRICES_USD` table for replicate/imagen (offline: their dry run needs no key) — and a dry run adds its quotes up against
the stop line. Run (from the repo root, after `npm run hf:credentials` — or with `REPLICATE_API_TOKEN` /
`GEMINI_API_KEY` set for the other providers):

    npm run art:templates -- --dry                         # price everything (free): the projected total, and where it would STOP
    npm run art:templates -- --provider replicate --dry    # the same on FLUX schnell — offline
    npm run art:templates -- --yes-spend                   # run the pending shots (add --provider … to match the dry run)
    npm run art:templates -- --status                      # spend so far, takes per shot (and who was paid)
    node scripts/templates/build-thumbs.mjs                # the selected takes → public/templates/*.jpg, + the thumb: edits
    node scripts/templates/build-thumb-blur.mjs            # blur placeholders + content versions (build-thumbs runs it too)

A second `--yes-spend` skips every shot whose take is still waiting for review; add `--retry` to pay for another.

A picture added or replaced BY HAND (under public/templates/, or a presenter face a card points at) needs the second
command too: it writes lib/studio/templateThumbs.generated.ts — the ≤ 16 px blur next/image shows while the card loads,
and the `?v=<hash>` that makes a replaced picture a new URL past the year-long cache. lib/studio/templateThumbs.test.ts
fails until it is re-run; commit the regenerated module with the picture.

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

## ── Interior designer + Photographer styles (the `interior/` and `photoshoot/` cards) ──

Added with the two image workspaces (components/studio/create). Same format, same 3:4, same rules: no text in the picture. The prompts are FLUX-safe (plain descriptive English, no style tokens) so `--provider replicate` carries them over. After the run: `--select <id>:<attempt> --output <n>`, then `node scripts/templates/build-thumbs.mjs` (it writes `public/templates/<tool>/<id>.jpg` and prints the `thumb:` lines to change in lib/studio/templates.interior.ts / templates.photoshoot.ts).

## Interior Scandinavian

```json shot
{
  "id": "interior/scandinavian",
  "title": "Interior Scandinavian",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A bright Scandinavian living room: white walls, pale oak flooring, a light linen sofa with a wool throw, a birch side table, a few green plants, a large window with soft overcast daylight, calm hygge atmosphere, interior-design photography, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Interior modern

```json shot
{
  "id": "interior/modern",
  "title": "Interior modern",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A contemporary modern living room: clean geometric lines, a low greige sectional sofa, a sculptural coffee table, matte black and brushed brass accents, a statement floor lamp, large abstract art, soft recessed lighting, interior-design photography, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Interior minimalist

```json shot
{
  "id": "interior/minimalist",
  "title": "Interior minimalist",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A minimalist living room: plain white walls, only one sofa and one low table, a monochrome white-grey-black palette with a single natural wood accent, bare uncluttered surfaces, generous empty floor, serene gallery-like calm, interior-design photography, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Interior Japandi

```json shot
{
  "id": "interior/japandi",
  "title": "Interior Japandi",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A Japandi living room: low oak and walnut furniture, a woven rug, a rice-paper lantern light, a muted palette of oatmeal, clay and charcoal, a ceramic vase with bare branches, natural linen, quiet balanced emptiness, interior-design photography, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Interior industrial loft

```json shot
{
  "id": "interior/loft",
  "title": "Interior industrial loft",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "An industrial loft living room: exposed red brick wall, raw concrete, black steel-framed windows, a worn cognac leather sofa, reclaimed wood, Edison-bulb pendant lights, tall ceilings, warm urban evening atmosphere, interior-design photography, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Interior classic

```json shot
{
  "id": "interior/classic",
  "title": "Interior classic",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A classic traditional living room: white wainscoting and crown mouldings, a symmetrical layout, a tufted sofa and two wingback chairs in deep blue fabric, a carved wood coffee table, a crystal chandelier, heavy drapes, a patterned wool rug, timeless elegance, interior-design photography, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Interior Art Deco

```json shot
{
  "id": "interior/art-deco",
  "title": "Interior Art Deco",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "An Art Deco living room: bold geometric patterns, brass and gold inlays, deep emerald velvet sofa, a sunburst mirror, black lacquer and marble surfaces, fluted glass, a sculptural chandelier, 1920s glamour, interior-design photography, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Interior boho

```json shot
{
  "id": "interior/boho",
  "title": "Interior boho",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A bohemian living room: layered kilim rugs, rattan and wicker furniture, a macrame wall hanging, a low sofa with patterned cushions, many trailing plants, warm terracotta and mustard tones, soft golden light, interior-design photography, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Interior Mediterranean

```json shot
{
  "id": "interior/mediterranean",
  "title": "Interior Mediterranean",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A Mediterranean villa living room: whitewashed rough-plaster walls, terracotta floor tiles, an arched opening to a sunlit terrace, dark timber beams, blue and ochre ceramics, linen curtains, olive-green accents, warm sunlit atmosphere, interior-design photography, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Interior Georgian traditional

```json shot
{
  "id": "interior/georgian-traditional",
  "title": "Interior Georgian traditional",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A traditional Georgian living room: carved dark walnut woodwork, arched niches, handwoven kilim and carpets in deep red and indigo, a low wooden sofa with embroidered cushions, painted ceramics and clay qvevri vessels, warm timber and stone, brass and copper details, cosy and hospitable, interior-design photography, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Interior mid-century modern

```json shot
{
  "id": "interior/mid-century",
  "title": "Interior mid-century modern",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A mid-century modern living room: walnut furniture with tapered legs, a low-slung sofa, a moulded lounge chair, a teak sideboard, a geometric rug, mustard and teal accents, globe pendant lights, 1960s optimism, interior-design photography, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Interior luxury

```json shot
{
  "id": "interior/luxury",
  "title": "Interior luxury",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A luxury contemporary living room: book-matched marble, brass and champagne-gold details, plush velvet and silk upholstery, a bespoke chandelier, high-gloss lacquer, layered ambient lighting, a rich neutral palette with deep jewel accents, five-star hotel finish, interior-design photography, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Photoshoot e-commerce white

```json shot
{
  "id": "photoshoot/ecom-white",
  "title": "Photoshoot e-commerce white",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A single stylish white sneaker photographed for an online store on a pure white seamless background, even soft shadowless studio light, a subtle contact shadow, the whole product centred and crisp, catalogue photography, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Photoshoot lifestyle

```json shot
{
  "id": "photoshoot/lifestyle",
  "title": "Photoshoot lifestyle",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A young woman laughing at a sunlit kitchen table with a cup of coffee and a notebook, natural window light, shallow depth of field, warm authentic lifestyle photography, candid composition, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Photoshoot editorial fashion

```json shot
{
  "id": "photoshoot/editorial-fashion",
  "title": "Photoshoot editorial fashion",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A high-fashion editorial photograph of a model in a sculptural red coat against a seamless pale blue backdrop, a striking pose, dramatic directional light, magazine-cover polish, fine film grain, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Photoshoot luxury product

```json shot
{
  "id": "photoshoot/luxury-product",
  "title": "Photoshoot luxury product",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A glass perfume bottle on a black glossy surface with a soft mirror reflection, a dark moody backdrop, dramatic rim light with a single soft key, rich contrast, premium advertising photography, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Photoshoot food

```json shot
{
  "id": "photoshoot/food",
  "title": "Photoshoot food",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A rustic wooden table with a freshly baked khachapuri, melting cheese and a soft egg yolk, a little steam, natural side light, shallow depth of field, rich warm colour, appetising food photography, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Photoshoot jewelry

```json shot
{
  "id": "photoshoot/jewelry",
  "title": "Photoshoot jewelry",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A gold ring with a diamond on dark blue velvet, fine-jewelry macro photography, crisp facets and metal highlights, soft gradient reflections, controlled sparkle, extreme detail, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Photoshoot cosmetics

```json shot
{
  "id": "photoshoot/cosmetics",
  "title": "Photoshoot cosmetics",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A frosted skincare jar and a dropper bottle on a clean pastel pink gradient backdrop with water droplets, soft glowing light, a fresh dewy feel, minimal elegant styling, cosmetics product photography, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Photoshoot headshot

```json shot
{
  "id": "photoshoot/headshot",
  "title": "Photoshoot headshot",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A professional corporate headshot of a confident smiling man in a navy blazer, soft flattering studio light, a neutral blurred grey office backdrop, sharp eyes, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Photoshoot real-estate exterior

```json shot
{
  "id": "photoshoot/real-estate-exterior",
  "title": "Photoshoot real-estate exterior",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A modern two-storey house with a manicured lawn photographed in a wide level view, a bright blue sky, soft golden daylight, straight vertical lines, sharp from front to back, real-estate exterior photography, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Photoshoot street

```json shot
{
  "id": "photoshoot/street",
  "title": "Photoshoot street",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A candid street photograph of a woman crossing a narrow old-town street in Tbilisi at golden hour, natural available light, a dynamic composition, cinematic city colours, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Photoshoot studio portrait

```json shot
{
  "id": "photoshoot/studio-portrait",
  "title": "Photoshoot studio portrait",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A classic studio portrait of a woman against a seamless dark-grey backdrop, Rembrandt key light with a soft fill, expressive eyes, natural skin texture, a timeless fine-art look, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Photoshoot film noir

```json shot
{
  "id": "photoshoot/film-noir",
  "title": "Photoshoot film noir",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A black-and-white film noir photograph of a man in a trench coat and fedora in a doorway, hard single-source light, venetian-blind shadow patterns, deep chiaroscuro, a smoky atmosphere, 1940s cinema grain, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```

## Photoshoot flat lay

```json shot
{
  "id": "photoshoot/flat-lay",
  "title": "Photoshoot flat lay",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A styled flat-lay photograph from directly above: a notebook, a pair of sunglasses, a ceramic mug and dried flowers arranged neatly on a textured linen surface, soft even daylight, balanced negative space, vertical composition. Premium editorial thumbnail art for a creative app: one clear subject, a calm uncluttered composition with an empty lower third for the card's label, photographic polish. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "batch_size": 4,
    "enhance_prompt": false,
    "seed": 261003
  }
}
```
