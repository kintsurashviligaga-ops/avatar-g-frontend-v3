# Site imagery v2 — the shot list (BILLABLE, hard-capped)

The owner's brief of 2026-10-03: fill the cards and presets that still show a placeholder with real stills — purposefully, in
ONE world and ONE grade (docs/DESIGN.md §4: Tbilisi at night after rain, warm sodium against cool cyan practicals, mist, 35 mm
anamorphic, fine grain, teal-and-amber, deep true blacks), each picture still clearly showing its own subject.

The prompts committed before the first call are exactly the prompts that run (scripts/hf-art-pack.ts reads these
```json shot``` blocks). One call per shot returns four variants, downloaded to `scripts/site-art/raw/<group>/`
(gitignored); the best one is selected after review (`--select <id>:<attempt> --output <n>`) and
`node scripts/site-art/build-site-art.mjs` writes the finals:

| group | where it shows | aspect | final |
|---|---|---|---|
| `vfx/<preset>` | the VFX tool's preset tiles and hero card (lib/genjutsu/presets.ts `thumb`) | 3:4 | `public/vfx/<preset>.jpg`, 600×800 JPEG q82 + blur |
| `hero/<id>` | the video tool's header card (`VideoHero`): Lite · Fast · Veo 3.1 · music video · another model | 21:9 | `public/brand/video-hero/<id>.jpg`, 1200×514 JPEG q82 + blur |
| `services/<id>` | the /services hub cards that 404'd into the SVG fallback | 1:1 | `public/services/<id>.webp`, 1024×1024 WebP q85 — the size and look of the 19 cards already there |
| `style/<id>` | the Image tool's style chips, a 24–28 px swatch: one cat on one balcony, in each style | 1:1 | `public/styles/image/<id>.jpg`, 96×96 JPEG q82 |

Every request — provider, prompt, price, request id — is logged in `scripts/site-art/manifest.json`, never under `public/`
(which deploys). The `site` pack is capped at $3.00 with a stop line at $2.70, priced from the static `PRICES_USD` table
(FLUX schnell on Replicate: $0.003 an image, four per shot → $0.012 a shot, ≈ $0.58 for all 48). At most three attempts per
shot. Run (from the repo root, with `REPLICATE_API_TOKEN` in the environment — never printed):

    npx jiti scripts/hf-art-pack.ts --pack site --provider replicate --dry        # price everything (offline) against the stop line
    npx jiti scripts/hf-art-pack.ts --pack site --provider replicate --yes-spend  # run the pending shots
    npx jiti scripts/hf-art-pack.ts --pack site --status                          # spend so far, takes per shot
    npx jiti scripts/hf-art-pack.ts --pack site --select vfx/fire:1 --output 2    # pick a take
    node scripts/site-art/build-site-art.mjs                                      # the selected takes → public/

Art direction. The VFX tiles put one subject in the middle of a vertical frame with a dark lower third (the tile's label sits
there, and a desktop crops the middle to 4:3). The video banners keep the subject in the left third and the centre calm (the
title is set in the middle, the „change" button sits top right). The service cards copy the existing set's own style line from
scripts/generate-service-cards.mjs, so the grid reads as one set. The style swatches all show the same cat on the same balcony
(the same seed), so the chips compare like for like. Every prompt ends with the shared negative tail — never any text, logo
or UI in a picture; the app sets the type.

# VFX presets (3:4)

## VFX · Cinematic hero

```json shot
{
  "id": "vfx/hero-cinematic",
  "title": "VFX · Cinematic hero",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "An epic action-film hero moment on a wet cobblestone street in Old Tbilisi at night: a lone figure in a long coat stands backlit by a warm sodium streetlight, drifting dust and glowing embers in the air, mist, carved wooden balconies in shadow, anamorphic lens flare. One clear subject in the centre of a vertical frame, the lower third dark and calm for a label. Cinematic film still: 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Neon stage

```json shot
{
  "id": "vfx/neon-stage",
  "title": "VFX · Neon stage",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A dancer caught mid-move on a dark stage filled with haze, cyan and magenta laser beams cutting through the smoke above, a warm amber key light, a glossy black floor reflecting the light. One clear subject in the centre of a vertical frame, the lower third dark and calm for a label. Cinematic film still: 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Rain street

```json shot
{
  "id": "vfx/rain-street",
  "title": "VFX · Rain street",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A figure with an umbrella walking down a narrow Old Tbilisi street in heavy rain at night, wet cobblestones full of reflections of warm sodium streetlights and cool cyan shop lights, steam rising, carved wooden balconies overhead. One clear subject in the centre of a vertical frame, the lower third dark and calm for a label. Cinematic film still: 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Zero gravity

```json shot
{
  "id": "vfx/zero-gravity",
  "title": "VFX · Zero gravity",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "Inside a dark space-station module: an astronaut floating weightless, loose objects and water droplets drifting slowly around them, Earth glowing through a round window behind, soft cool cyan light with one warm amber practical lamp. One clear subject in the centre of a vertical frame, the lower third dark and calm for a label. Cinematic film still: 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Mecha robot

```json shot
{
  "id": "vfx/mecha-robot",
  "title": "VFX · Mecha robot",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A sleek chrome mecha robot with articulated armour plates and glowing blue joints standing on wet cobblestones in an Old Tbilisi street at night, its reflective hard-surface metal catching warm sodium streetlight, mist. One clear subject in the centre of a vertical frame, the lower third dark and calm for a label. Cinematic film still: 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Stone golem

Revised before attempt 2 — attempt 1 (the takes read as a blue robot, and the runes came out as letters). Attempt 1's prompt is in the manifest.

```json shot
{
  "id": "vfx/stone-golem",
  "title": "VFX · Stone golem",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A towering golem built of rough grey granite boulders, cracked and mossy, glowing orange molten light shining through the cracks in its chest and arms, standing in a narrow Old Tbilisi street at night, dust and small stones falling from its shoulders, warm amber glow against cool cyan mist. One clear subject in the centre of a vertical frame, the picture filling the whole frame edge to edge. Cinematic film still: 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Glass crystal

```json shot
{
  "id": "vfx/glass-crystal",
  "title": "VFX · Glass crystal",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A human figure made entirely of translucent glass crystal, refracting the light into prismatic highlights and caustics, standing on a wet cobblestone street at night, warm streetlight and cool cyan reflections passing through the body. One clear subject in the centre of a vertical frame, the lower third dark and calm for a label. Cinematic film still: 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Gold statue

Revised before attempt 2 — attempt 1 (every take stood on a plinth with a lettered plaque). Attempt 1's prompt is in the manifest.

```json shot
{
  "id": "vfx/gold-statue",
  "title": "VFX · Gold statue",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A person transformed into a polished liquid-gold statue, standing directly on the wet cobblestones of an Old Tbilisi street at night, mirror-like gold reflections, slow drips of molten gold running down the body, warm sodium streetlight and cool cyan reflections, no pedestal and no plaque. One clear subject in the centre of a vertical frame, the picture filling the whole frame edge to edge. Cinematic film still: 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Tokyo night

Revised before attempt 2 — attempt 1 (every take had lettering on a lantern or a sign). Attempt 1's prompt is in the manifest.

```json shot
{
  "id": "vfx/tokyo-night",
  "title": "VFX · Tokyo night",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A figure under a clear umbrella walking down a narrow Japanese alley at night in light drizzle, rows of glowing blank white paper lanterns overhead, soft out-of-focus pink and cyan neon bokeh, steam rising from a street-food stall, wet reflective ground, every lantern and wall plain and unmarked. One clear subject in the centre of a vertical frame, the picture filling the whole frame edge to edge. Cinematic film still: 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Alien desert

```json shot
{
  "id": "vfx/alien-desert",
  "title": "VFX · Alien desert",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A lone figure standing on a red dune in an alien desert, two suns low on the horizon, enormous rocks floating in the sky, dust drifting in warm light, long shadows, epic science-fiction still. One clear subject in the centre of a vertical frame, the lower third dark and calm for a label. Cinematic film still: 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Underwater city

```json shot
{
  "id": "vfx/underwater-city",
  "title": "VFX · Underwater city",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A diver floating above a sunken city deep underwater: glowing coral towers, shafts of light from the surface, drifting bubbles and small fish, soft blue-green haze, photoreal. One clear subject in the centre of a vertical frame, the lower third dark and calm for a label. Cinematic film still: 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Arctic peak

```json shot
{
  "id": "vfx/arctic-peak",
  "title": "VFX · Arctic peak",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A climber standing on an arctic mountain summit at sunrise in a blizzard, swirling snow, golden light breaking through the clouds, ice-crusted rocks, a dramatic wide landscape. One clear subject in the centre of a vertical frame, the lower third dark and calm for a label. Cinematic film still: 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Anime

Revised before attempt 2 — attempt 1 (all four takes had a black or white letterbox band at the foot). Attempt 1's prompt is in the manifest.

```json shot
{
  "id": "vfx/anime",
  "title": "VFX · Anime",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "Hand-drawn Japanese anime film still: a girl holding an umbrella on a rainy Old Tbilisi street at night under carved wooden balconies, clean cel shading, bold outlines, a painterly night sky, warm lamplight and cool cyan reflections on the wet street. One clear subject in the centre of a vertical frame, the picture filling the whole frame edge to edge, deep blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Claymation

```json shot
{
  "id": "vfx/claymation",
  "title": "VFX · Claymation",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "Stop-motion claymation still: a small clay figure holding an umbrella on a miniature Old Tbilisi street with carved wooden balconies, every surface hand-sculpted from clay with visible fingerprints and tool marks, warm miniature-set lighting at night. One clear subject in the centre of a vertical frame, the lower third dark and calm for a label, deep blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Film noir

```json shot
{
  "id": "vfx/film-noir",
  "title": "VFX · Film noir",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "Classic black-and-white film noir still: a figure in a fedora and trench coat under a single streetlamp on a wet cobblestone street, hard venetian-blind shadows on a wall, drifting cigarette smoke, 1940s cinematography, fine film grain. One clear subject in the centre of a vertical frame, the lower third dark and calm for a label, deep blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Cyberpunk

Revised before attempt 2 — attempt 1 (pseudo-lettering on the neon signs, and a letterbox band at the foot ("the lower third dark" was read as a black bar)). Attempt 1's prompt is in the manifest.

```json shot
{
  "id": "vfx/cyberpunk",
  "title": "VFX · Cyberpunk",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "Cyberpunk film still: a figure in a reflective jacket on a rain-soaked futuristic street at night, magenta and cyan neon light strips and glowing abstract geometric holograms, lens flares, dense city haze, every surface free of signs and lettering. One clear subject in the centre of a vertical frame, the picture filling the whole frame edge to edge, deep blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Watercolour

```json shot
{
  "id": "vfx/watercolor",
  "title": "VFX · Watercolour",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A watercolour painting: a figure with a red umbrella on an Old Tbilisi street with carved wooden balconies, translucent washes of paint bleeding and flowing, visible paper texture, soft pigment edges. One clear subject in the centre of a vertical frame, the lower third dark and calm for a label, deep blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · 3D toy

```json shot
{
  "id": "vfx/toy-3d",
  "title": "VFX · 3D toy",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A glossy 3D collectible toy figure of a person in a yellow raincoat standing on a miniature cobblestone street against a dark backdrop, soft rounded forms, smooth plastic with subtle reflections, bright studio lighting, charming animated-feature look. One clear subject in the centre of a vertical frame, the lower third dark and calm for a label, deep blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Fire

```json shot
{
  "id": "vfx/fire",
  "title": "VFX · Fire",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A figure on a wet cobblestone street at night wreathed in roaring flames, embers and sparks streaming upward, heat haze distorting the air, flickering orange light on the surroundings, photoreal. One clear subject in the centre of a vertical frame, the lower third dark and calm for a label. Cinematic film still: 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Ice

Revised before attempt 2 — attempt 1 (the takes showed blue mist, not ice — and one carried a watermark). Attempt 1's prompt is in the manifest.

```json shot
{
  "id": "vfx/ice",
  "title": "VFX · Ice",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A figure standing on a frozen night street, encased in frost: thick white frost and jagged translucent ice crystals growing over the shoulders, arms and the ground around the feet, icicles hanging, cold breath mist, cold blue light, glittering ice particles in the air, photoreal. One clear subject in the centre of a vertical frame, the picture filling the whole frame edge to edge. Cinematic film still: 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Smoke

```json shot
{
  "id": "vfx/smoke",
  "title": "VFX · Smoke",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A figure dissolving into thick drifting smoke at night, soft volumetric trails curling away from the body, a single warm streetlight cutting through the smoke, moody dramatic light, photoreal. One clear subject in the centre of a vertical frame, the lower third dark and calm for a label. Cinematic film still: 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Lightning

```json shot
{
  "id": "vfx/lightning",
  "title": "VFX · Lightning",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A figure on a wet street at night surrounded by bright electric arcs crackling through the air, flickering white-blue light across the scene, sparks and brief flashes, photoreal. One clear subject in the centre of a vertical frame, the lower third dark and calm for a label. Cinematic film still: 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Glitch

Revised before attempt 2 — attempt 1 (the glitch was barely visible, and two takes had shop lettering). Attempt 1's prompt is in the manifest.

```json shot
{
  "id": "vfx/glitch",
  "title": "VFX · Glitch",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A cinematic portrait of a figure on a night street, the whole image visibly corrupted by a heavy digital glitch: strong RGB channel splitting into offset red, green and blue copies, thick horizontal slices of the picture shifted sideways, blocky datamosh pixels and scanlines across the frame, cyan and amber light. One clear subject in the centre of a vertical frame, the picture filling the whole frame edge to edge. Cinematic film still: 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## VFX · Portal

```json shot
{
  "id": "vfx/portal",
  "title": "VFX · Portal",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A swirling circular energy portal opening in the middle of a misty Old Tbilisi street at night, its bright rim throwing sparks, wind pulling dust and leaves toward its centre, cyan and warm amber light spilling onto a figure standing before it. One clear subject in the centre of a vertical frame, the lower third dark and calm for a label. Cinematic film still: 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, rich contrast. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "3:4",
    "batch_size": 4,
    "seed": 261102
  }
}
```

# Video header banners (21:9)

## Video hero · Lite

Revised before attempt 2 — attempt 1 (the phone screens showed a camera app's interface (DESIGN.md §4: a screen shows footage, never UI), and two had shop lettering). Attempt 1's prompt is in the manifest.

```json shot
{
  "id": "hero/lite",
  "title": "Video hero · Lite",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A smartphone on a small tripod on a café table by a rain-streaked window at night, seen from behind so its screen faces away toward the street it is filming, warm Old Tbilisi streetlights blurred outside, a cup of coffee beside it, soft bokeh across the frame. Ultra-wide cinematic frame with the subject in the left third and the centre calm and dark for a title. 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, mist. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "21:9",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Video hero · Fast

```json shot
{
  "id": "hero/fast",
  "title": "Video hero · Fast",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A cyclist speeding through a wet Old Tbilisi street at night, followed by a handheld gimbal camera, motion blur on the streetlights, spray from the tyres, the energy of a quick social reel. Ultra-wide cinematic frame with the subject in the left third and the centre calm and dark for a title. 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, mist. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "21:9",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Video hero · Veo 3.1

```json shot
{
  "id": "hero/standard",
  "title": "Video hero · Veo 3.1",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A wide establishing shot of Old Tbilisi at night after rain, seen from across the river: the old town and the fortress on the hill lit warm, mist over the water, a cinema camera on a crane in silhouette in the foreground, the polish of a feature-film trailer. Ultra-wide cinematic frame with the subject in the left third and the centre calm and dark for a title. 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, mist. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "21:9",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Video hero · Music video

```json shot
{
  "id": "hero/musicvideo",
  "title": "Video hero · Music video",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A singer silhouetted on a misty rooftop stage above Old Tbilisi at night, a single warm spotlight from above, a cool cyan rim light, haze, the city lights blurred far below, music-video mood. Ultra-wide cinematic frame with the subject in the left third and the centre calm and dark for a title. 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, mist. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "21:9",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Video hero · Other models

```json shot
{
  "id": "hero/model",
  "title": "Video hero · Other models",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "An extreme close-up of a professional cinema camera lens, reflections of warm and cyan city lights curving across its glass, a blurred rainy night street behind it, shallow depth of field. Ultra-wide cinematic frame with the subject in the left third and the centre calm and dark for a title. 35 mm anamorphic look, fine film grain, teal-and-amber grade, deep true blacks, mist. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "21:9",
    "batch_size": 4,
    "seed": 261102
  }
}
```

# /services hub cards (1:1, the existing set's look)

## Service · Voice

```json shot
{
  "id": "services/voice",
  "title": "Service · Voice",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A premium AI voice cloning scene: a professional studio condenser microphone on a shock mount in the centre, a glowing holographic sound waveform flowing out of it and curling into the soft profile of a human head made of light particles, warm amber highlights, cinematic lighting, dark premium atmosphere, elegant color grading, moody blue and cyan accents, photorealistic, 8k ultra detailed, professional studio quality, dramatic contrast, wide composition suitable for card crop, the subject centred in the middle band of a square frame. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "1:1",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Service · Content writer

```json shot
{
  "id": "services/content-writer",
  "title": "Service · Content writer",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A premium AI content writing scene: a sleek open laptop on a dark desk, glowing holographic article cards and social media post panels floating above it, filled with abstract lines of light instead of words, a luminous pen of light, warm amber and cool cyan tones, cinematic lighting, dark premium atmosphere, elegant color grading, moody blue and cyan accents, photorealistic, 8k ultra detailed, professional studio quality, dramatic contrast, wide composition suitable for card crop, the subject centred in the middle band of a square frame. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "1:1",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Service · Podcast

```json shot
{
  "id": "services/podcast",
  "title": "Service · Podcast",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A premium AI podcast studio scene: two broadcast microphones on boom arms facing each other across a dark round table, studio headphones resting between them, glowing cyan sound waves flowing from one microphone to the other, a warm amber practical light, intimate late-night broadcast atmosphere, cinematic lighting, dark premium atmosphere, elegant color grading, moody blue and cyan accents, photorealistic, 8k ultra detailed, professional studio quality, dramatic contrast, wide composition suitable for card crop, the subject centred in the middle band of a square frame. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "1:1",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Service · Character

```json shot
{
  "id": "services/character",
  "title": "Service · Character",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A premium AI character design scene: an ornate carnival mask floating in the centre, glowing holographic character silhouettes emerging from it in layers of light particles, small points of light orbiting it, warm gold highlights, cinematic lighting, dark premium atmosphere, elegant color grading, moody blue and cyan accents, photorealistic, 8k ultra detailed, professional studio quality, dramatic contrast, wide composition suitable for card crop, the subject centred in the middle band of a square frame. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "1:1",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Service · Event

```json shot
{
  "id": "services/event",
  "title": "Service · Event",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A premium AI event production scene: an elegant event stage at night with warm spotlights cutting through haze, rows of chairs facing a glowing stage arch, confetti made of light drifting in the air, celebratory yet refined atmosphere, warm gold and cool cyan tones, cinematic lighting, dark premium atmosphere, elegant color grading, moody blue and cyan accents, photorealistic, 8k ultra detailed, professional studio quality, dramatic contrast, wide composition suitable for card crop, the subject centred in the middle band of a square frame. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "1:1",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Service · Prompt builder

```json shot
{
  "id": "services/prompt-builder",
  "title": "Service · Prompt builder",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A premium prompt builder visualization: translucent glass building blocks of light being assembled into a precise structure by thin beams of light, a slim glowing wand of light directing them, modular and geometric, warm amber highlights, cinematic lighting, dark premium atmosphere, elegant color grading, moody blue and cyan accents, photorealistic, 8k ultra detailed, professional studio quality, dramatic contrast, wide composition suitable for card crop, the subject centred in the middle band of a square frame. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "1:1",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Service · Terminal

```json shot
{
  "id": "services/terminal",
  "title": "Service · Terminal",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A premium AI coding scene: a glowing terminal window floating in dark space filled with abstract lines of light, a sleek mechanical keyboard in the foreground lit in cyan, circuit patterns of light underneath, warm amber highlights, cinematic lighting, dark premium atmosphere, elegant color grading, moody blue and cyan accents, photorealistic, 8k ultra detailed, professional studio quality, dramatic contrast, wide composition suitable for card crop, the subject centred in the middle band of a square frame. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "1:1",
    "batch_size": 4,
    "seed": 261102
  }
}
```

# Image style swatches (1:1, the same cat in every style)

## Style · Photorealistic

```json shot
{
  "id": "style/photorealistic",
  "title": "Style · Photorealistic",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A photorealistic photograph of a ginger cat sitting on the railing of a carved wooden balcony in Old Tbilisi, soft natural daylight, sharp detail, close-up. The cat fills the centre of a square frame. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "1:1",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Style · Cinematic

```json shot
{
  "id": "style/cinematic",
  "title": "Style · Cinematic",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A cinematic film still of a ginger cat sitting on the railing of a carved wooden balcony in Old Tbilisi at night, warm streetlight and teal shadows, anamorphic, shallow depth of field, close-up. The cat fills the centre of a square frame. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "1:1",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Style · Digital art

```json shot
{
  "id": "style/digital-art",
  "title": "Style · Digital art",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A digital art illustration of a ginger cat sitting on the railing of a carved wooden balcony in Old Tbilisi, vibrant painterly digital brushwork, glowing saturated colours, close-up. The cat fills the centre of a square frame. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "1:1",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Style · Anime

```json shot
{
  "id": "style/anime",
  "title": "Style · Anime",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "An anime illustration of a ginger cat sitting on the railing of a carved wooden balcony in Old Tbilisi, clean cel shading, bold outlines, bright flat colours, close-up. The cat fills the centre of a square frame. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "1:1",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Style · 3D render

```json shot
{
  "id": "style/3d-render",
  "title": "Style · 3D render",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A 3D render of a ginger cat sitting on the railing of a carved wooden balcony in Old Tbilisi, smooth stylised animated-film 3D look, soft global illumination, close-up. The cat fills the centre of a square frame. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "1:1",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Style · Oil painting

```json shot
{
  "id": "style/oil-painting",
  "title": "Style · Oil painting",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "An oil painting of a ginger cat sitting on the railing of a carved wooden balcony in Old Tbilisi, thick impasto brushstrokes, rich classical colours, close-up. The cat fills the centre of a square frame. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "1:1",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Style · Watercolour

```json shot
{
  "id": "style/watercolor",
  "title": "Style · Watercolour",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A watercolour painting of a ginger cat sitting on the railing of a carved wooden balcony in Old Tbilisi, translucent washes of paint, white paper texture, soft bleeding edges, close-up. The cat fills the centre of a square frame. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "1:1",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Style · Cyberpunk

```json shot
{
  "id": "style/cyberpunk",
  "title": "Style · Cyberpunk",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "Cyberpunk artwork of a ginger cat sitting on the railing of a carved wooden balcony in Old Tbilisi at night, magenta and cyan neon light, rain, futuristic, close-up. The cat fills the centre of a square frame. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "1:1",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Style · Fantasy

```json shot
{
  "id": "style/fantasy",
  "title": "Style · Fantasy",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A fantasy storybook painting of a ginger cat sitting on the railing of a carved wooden balcony in Old Tbilisi, a magical golden glow, floating sparkles of light, ethereal, close-up. The cat fills the centre of a square frame. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "1:1",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Style · Minimalist

```json shot
{
  "id": "style/minimalist",
  "title": "Style · Minimalist",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A minimalist flat illustration of a ginger cat sitting on the railing of a carved wooden balcony in Old Tbilisi, a few simple flat shapes, a limited palette of two colours, lots of empty space. The cat fills the centre of a square frame. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "1:1",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Style · Line art

```json shot
{
  "id": "style/line-art",
  "title": "Style · Line art",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A black ink line art drawing of a ginger cat sitting on the railing of a carved wooden balcony in Old Tbilisi, clean single-weight lines on plain white paper, no shading, close-up. The cat fills the centre of a square frame. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "1:1",
    "batch_size": 4,
    "seed": 261102
  }
}
```

## Style · Pixel art

Revised before attempt 2 — attempt 1 (it came out as a smooth illustration — no pixels to see). Attempt 1's prompt is in the manifest.

```json shot
{
  "id": "style/pixel-art",
  "title": "Style · Pixel art",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "Low-resolution 8-bit pixel art of a ginger cat sitting on the railing of a carved wooden balcony in Old Tbilisi, a tiny retro video game sprite scene upscaled with huge square pixels clearly visible, a flat limited palette of a few colours, no smooth gradients, close-up. The cat fills the centre of a square frame. No text, no letters, no numbers, no logos, no watermark, no user interface, no frames or borders.",
    "aspect_ratio": "1:1",
    "batch_size": 4,
    "seed": 261102
  }
}
```
