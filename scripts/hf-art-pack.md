# brand/v1 art pack — exact prompts (written before any request)

**Job cap: $7.00. Stop line: $6.50.** The runner is `scripts/hf-art-pack.ts`. It prices every request first, refuses to cross the stop line, allows at most 3 attempts per shot (the first plus 2 retries), and logs every request with its cost in `public/brand/v1/manifest.json`.

**Rules:** see `docs/DESIGN.md` §4. One world, one grade, one seed family. There is no text, no logo, no UI and no mockup in any image; type is set in code. Buttons, logos and whole pages are never generated.

## Models: Higgsfield API, researched 2026-09-29

| Use | Endpoint | Why | Price |
|---|---|---|---|
| New stills | `higgsfield-ai/soul/v2/standard` | Photoreal. Takes a fixed `seed` and a `batch_size` of 4, so one request gives four takes | ≈ $0.0057 per image at 1080p |
| Same frame / same person | `alibaba/qwen-image-3/edit` | A true reference edit (1–3 `image_urls`) with its own `seed` and `negative_prompt` | ≈ $0.04 |
| Hero loop (optional) | `kling-video/v3.0/std/image-to-video` | `last_image_url` = the first frame, so the clip returns to where it began | ≈ $0.23 for 5 s, sound off |

Nano Banana, Seedream and Flux are **not** in the Higgsfield API; they exist only in the consumer app. Soul v2 takes no reference image, so consistency between Soul shots comes from the shared bible, the shared `seed` and the default style.

**Seed:** `20260929` for every Soul and Qwen request.

## The world bible, appended to every prompt

**Exterior:**

> Night in Old Tbilisi, Georgia, just after rain. Wet dark cobblestones mirror warm sodium streetlights and a few cool cyan practical lights. Carved wooden balconies and old brick facades, a light mist in the air. Shot on a 35mm anamorphic cinema lens, shallow depth of field, gentle film grain, teal-and-amber night colour grade, deep true blacks, photorealistic, restrained, editorial. No text, no letters, no signage, no logos, no watermark, no user interface.

**Interior**, the same world:

> The same night in Tbilisi after rain: warm tungsten practical light against cool cyan light, 35mm anamorphic cinema lens, shallow depth of field, gentle film grain, teal-and-amber night colour grade, deep true blacks, photorealistic, restrained, editorial. No text, no letters, no visible labels, no logos, no watermark, no user interface.

## A — brand stills

### A1 · landing hero, 16:9
The hero. The left half is quiet negative space for the headline, which is set in code.

```json shot
{
  "id": "A1",
  "title": "landing hero 16:9",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "Wide cinematic establishing shot. A young Georgian woman videographer in her late twenties, dark hair tied back, black raincoat, stands in the right third of the frame on a narrow wet cobblestone street, holding a smartphone vertically at chest height and filming; the phone screen glows with a vertical video of the same glittering street. Her face is softly lit by the screen and a warm streetlamp, three-quarter profile, calm focus. The left half of the frame is open dark street receding into mist with long reflections, quiet negative space. Night in Old Tbilisi, Georgia, just after rain. Wet dark cobblestones mirror warm sodium streetlights and a few cool cyan practical lights. Carved wooden balconies and old brick facades, a light mist in the air. Shot on a 35mm anamorphic cinema lens, shallow depth of field, gentle film grain, teal-and-amber night colour grade, deep true blacks, photorealistic, restrained, editorial. No text, no letters, no signage, no logos, no watermark, no user interface.",
    "aspect_ratio": "16:9",
    "resolution": "1080p",
    "seed": 20260929,
    "batch_size": 4,
    "style_id": "3db34ab5-3439-4317-9e03-08dc30852e69",
    "enhance_prompt": false
  }
}
```

### A2 · landing hero, 9:16
The same frame, recomposed vertically from the selected A1. It is not a new picture.

```json shot
{
  "id": "A2",
  "title": "landing hero 9:16 (from A1)",
  "endpoint": "alibaba/qwen-image-3/edit",
  "needs": ["A1"],
  "input": {
    "image_urls": ["{{A1}}"],
    "prompt": "Recompose this exact photograph as a tall vertical 9:16 frame. Keep the same woman, her raincoat, the glowing phone, the wet cobblestone street, the balconies, the light and the teal-and-amber colour grade exactly as they are. Place her in the upper middle of the frame and extend the wet reflective street below her and the dark balconies and misty sky above. No text, no letters, no logos, no watermark, no user interface.",
    "negative_prompt": "text, letters, words, signage, logo, watermark, user interface, extra people, distorted hands, cartoon, illustration",
    "aspect_ratio": "9:16",
    "resolution": "2k",
    "seed": 20260929,
    "prompt_extend": false,
    "enable_thinking": false
  }
}
```

### A3 · dashboard atmosphere plate
It is shown at 8% opacity behind the greeting, so it must work as a mood with nothing to read.

```json shot
{
  "id": "A3",
  "title": "dashboard empty-state plate",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "Abstract, almost entirely dark frame: the lights of an Old Tbilisi street at night seen through a rain-covered window, large soft out-of-focus bokeh in warm amber with a few cyan points, raindrops sharp on the glass, very low key, most of the frame near black, calm and minimal. The same night in Tbilisi after rain: warm tungsten practical light against cool cyan light, 35mm anamorphic cinema lens, shallow depth of field, gentle film grain, teal-and-amber night colour grade, deep true blacks, photorealistic, restrained, editorial. No text, no letters, no visible labels, no logos, no watermark, no user interface.",
    "aspect_ratio": "16:9",
    "resolution": "1080p",
    "seed": 20260929,
    "batch_size": 4,
    "style_id": "3db34ab5-3439-4317-9e03-08dc30852e69",
    "enhance_prompt": false
  }
}
```

### A4 · service card — VIDEO (3:4, cropped to 4:5 in code)

```json shot
{
  "id": "A4",
  "title": "card VIDEO",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A compact cinema camera on a small handheld gimbal held low above the wet cobblestones of a narrow Old Tbilisi street at night, the lens in sharp focus catching reflections, a small warm on-camera light, streetlight bokeh and mist behind, the feeling of a film crew at work, no face visible. Night in Old Tbilisi, Georgia, just after rain. Wet dark cobblestones mirror warm sodium streetlights and a few cool cyan practical lights. Carved wooden balconies and old brick facades, a light mist in the air. Shot on a 35mm anamorphic cinema lens, shallow depth of field, gentle film grain, teal-and-amber night colour grade, deep true blacks, photorealistic, restrained, editorial. No text, no letters, no signage, no logos, no watermark, no user interface.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "seed": 20260929,
    "batch_size": 4,
    "style_id": "3db34ab5-3439-4317-9e03-08dc30852e69",
    "enhance_prompt": false
  }
}
```

### A5 · service card — IMAGE

```json shot
{
  "id": "A5",
  "title": "card IMAGE",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "Premium product photograph on a set in a dark studio: a dark unlabeled glass bottle of red wine and a single wine glass on a wet black stone slab, fine water droplets, a warm amber key light from the side and a thin cyan rim light, dramatic shadows, clean minimal composition, advertising still life. The same night in Tbilisi after rain: warm tungsten practical light against cool cyan light, 35mm anamorphic cinema lens, shallow depth of field, gentle film grain, teal-and-amber night colour grade, deep true blacks, photorealistic, restrained, editorial. No text, no letters, no visible labels, no logos, no watermark, no user interface.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "seed": 20260929,
    "batch_size": 4,
    "style_id": "3db34ab5-3439-4317-9e03-08dc30852e69",
    "enhance_prompt": false
  }
}
```

### A6 · service card — MUSIC

```json shot
{
  "id": "A6",
  "title": "card MUSIC",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "A vintage analogue synthesizer and a studio condenser microphone on a stand in a dim home studio at night, a large window behind showing the Old Tbilisi skyline with the lit Narikala fortress in rain mist, raindrops on the glass, a warm desk lamp and cool cyan light from a monitor out of frame, no visible labels or writing on the equipment. The same night in Tbilisi after rain: warm tungsten practical light against cool cyan light, 35mm anamorphic cinema lens, shallow depth of field, gentle film grain, teal-and-amber night colour grade, deep true blacks, photorealistic, restrained, editorial. No text, no letters, no visible labels, no logos, no watermark, no user interface.",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
    "seed": 20260929,
    "batch_size": 4,
    "style_id": "3db34ab5-3439-4317-9e03-08dc30852e69",
    "enhance_prompt": false
  }
}
```

### A7 · service card — AVATAR
The same woman as the hero, in close-up, edited from the selected A1.

```json shot
{
  "id": "A7",
  "title": "card AVATAR (from A1)",
  "endpoint": "alibaba/qwen-image-3/edit",
  "needs": ["A1"],
  "input": {
    "image_urls": ["{{A1}}"],
    "prompt": "Close-up portrait of the same young woman from this photograph, head and shoulders, looking just past the camera with a calm, confident expression. Her face is lit from below by the soft cyan glow of a phone screen and from the side by warm streetlight; raindrops on her black raincoat; the Old Tbilisi street lights are soft bokeh behind her. Keep her face, hair and the colour grade exactly as in the photograph. Vertical 3:4 portrait. No text, no letters, no logos, no watermark, no user interface.",
    "negative_prompt": "text, letters, words, signage, logo, watermark, user interface, different person, distorted face, extra fingers, cartoon, illustration",
    "aspect_ratio": "3:4",
    "resolution": "2k",
    "seed": 20260929,
    "prompt_extend": false,
    "enable_thinking": false
  }
}
```

### A8 · the world, for the closing band and the share image
The share image, 1200×630, is this still with the logo lockup composited in code by `scripts/brand/build-v1.mjs`.

```json shot
{
  "id": "A8",
  "title": "world 16:9 (closing band + OG)",
  "endpoint": "higgsfield-ai/soul/v2/standard",
  "input": {
    "prompt": "Aerial wide establishing shot of Tbilisi at night just after rain: the Old Town rooftops and carved balconies, the Mtkvari river reflecting the city lights, the illuminated Narikala fortress on its hill and the softly glowing Bridge of Peace, low mist drifting over the river, calm and cinematic. Shot on a 35mm anamorphic cinema lens, gentle film grain, teal-and-amber night colour grade, deep true blacks, photorealistic, restrained, editorial. No text, no letters, no signage, no logos, no watermark, no user interface.",
    "aspect_ratio": "16:9",
    "resolution": "1080p",
    "seed": 20260929,
    "batch_size": 4,
    "style_id": "3db34ab5-3439-4317-9e03-08dc30852e69",
    "enhance_prompt": false
  }
}
```

## B — optional, only if ≥ $2 of the stop line remains

### B1 · a 5-second loop of the hero, 720p, silent
The last frame is the first frame, so it loops. The poster is A1. Desktop only, and hidden under reduced motion.

```json shot
{
  "id": "B1",
  "title": "hero loop 5 s (from A1)",
  "endpoint": "kling-video/v3.0/std/image-to-video",
  "needs": ["A1"],
  "optional": true,
  "input": {
    "prompt": "A living photograph: light rain keeps falling, reflections shimmer on the wet cobblestones, thin mist drifts slowly, the phone screen glows softly; the woman stays almost still, only breathing; the camera is locked off with an imperceptible slow push-in. No cuts, no new people, no text.",
    "image_url": "{{A1}}",
    "last_image_url": "{{A1}}",
    "duration": 5,
    "sound": "off"
  }
}
```

## C — never

- no buttons, logos, page mockups or UI;
- no text baked into an image;
- no second style: a shot that drifts is redone from A1 as the reference, not started over;
- no more than two retries per shot.
