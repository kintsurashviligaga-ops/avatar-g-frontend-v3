# brand/v1 art pack — exact prompts (written before any request)

**Job cap: $7.00. Stop line: $6.50.** The runner is `scripts/hf-art-pack.ts`. It prices every request first, refuses to cross the stop line, allows at most 3 attempts per shot (the first plus 2 retries), and logs every request with its cost in `design/brand/v1/manifest.json` (raw takes in `design/brand/v1/raw/`, gitignored — neither lives under `public/`, which deploys).

**Rules:** see `docs/DESIGN.md` §4. One world, one grade, one seed family. There is no text, no logo, no UI and no mockup in any image; type is set in code. Buttons, logos and whole pages are never generated.

## Models: Higgsfield API, researched 2026-09-29

| Use | Endpoint | Why | Price |
|---|---|---|---|
| New stills | `higgsfield-ai/soul/v2/standard` | Photoreal. Takes a fixed `seed` and a `batch_size` of 4, so one request gives four takes | ≈ $0.0057 per image at 1080p |
| Same frame / same person | `alibaba/qwen-image-3/edit` | A true reference edit (1–3 `image_urls`) with its own `seed` and `negative_prompt` | ≈ $0.04 |
| Hero loop (optional) | `kling-video/v3.0/std/image-to-video` | `last_image_url` = the first frame, so the clip returns to where it began | ≈ $0.23 for 5 s, sound off |

Nano Banana, Seedream and Flux are **not** in the Higgsfield API; they exist only in the consumer app. Soul v2 takes no reference image, so consistency between Soul shots comes from the shared bible, the shared `seed` and the default style.

**Seed:** `260929` for every Soul and Qwen request. Soul caps the seed at 1,000,000; the first dry run refused `20260929`.

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
    "seed": 260929,
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
    "seed": 260929,
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
    "seed": 260929,
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
    "seed": 260929,
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
    "seed": 260929,
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
    "seed": 260929,
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
    "seed": 260929,
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
    "seed": 260929,
    "batch_size": 4,
    "style_id": "3db34ab5-3439-4317-9e03-08dc30852e69",
    "enhance_prompt": false
  }
}
```

## A-revisions — text removal (added after review, before the request)

The first Soul takes of A4 and A5 put **lettering into the picture**: gibberish on the camera's screen and body, and labels on every wine bottle, although the A5 prompt asked for an unlabelled bottle. Per §C, a shot is fixed from the chosen take as the reference, not started over. These are reference edits of the selected take, with the same seed and the same grade; each one counts as that shot's second attempt.

```json shot
{
  "id": "A4r",
  "title": "card VIDEO — lettering removed (from A4)",
  "endpoint": "alibaba/qwen-image-3/edit",
  "needs": ["A4"],
  "input": {
    "image_urls": ["{{A4}}"],
    "prompt": "Remove every letter, number, logo and on-screen interface marking from the camera body and from its screen; the screen shows only the picture of the wet street. Keep the camera, the gimbal, the cable, the street, the light, the composition and the teal-and-amber colour grade exactly as they are. No text anywhere.",
    "negative_prompt": "text, letters, numbers, words, logo, brand name, watermark, user interface, icons",
    "aspect_ratio": "3:4",
    "resolution": "2k",
    "seed": 260929,
    "prompt_extend": false,
    "enable_thinking": false
  }
}
```

```json shot
{
  "id": "A5r",
  "title": "card IMAGE — label removed (from A5)",
  "endpoint": "alibaba/qwen-image-3/edit",
  "needs": ["A5"],
  "input": {
    "image_urls": ["{{A5}}"],
    "prompt": "Remove the paper label and all lettering from the wine bottle so it is plain dark glass with only the reflections of the light, and remove the pale marks on the stone base. Keep the bottle shape, the wine glass, the stone, the cyan and amber light, the shadows, the composition and the colour grade exactly as they are. No text anywhere.",
    "negative_prompt": "text, letters, numbers, words, label, logo, brand name, watermark, user interface",
    "aspect_ratio": "3:4",
    "resolution": "2k",
    "seed": 260929,
    "prompt_extend": false,
    "enable_thinking": false
  }
}
```

A5r removed the label but left pale letter-like marks on the front edge of the stone. **A5r2** is the IMAGE card's third and last allowed attempt: the first plus two retries.

```json shot
{
  "id": "A5r2",
  "title": "card IMAGE — stone marks removed (from A5r)",
  "endpoint": "alibaba/qwen-image-3/edit",
  "needs": ["A5r"],
  "input": {
    "image_urls": ["{{A5r}}"],
    "prompt": "Remove the pale white marks and letters on the front edge of the dark stone slab so the stone is plain, dark and natural. Keep the bottle, the wine glass, the light, the shadows, the composition and the colour grade exactly as they are. No text anywhere.",
    "negative_prompt": "text, letters, numbers, words, label, logo, watermark, white marks",
    "aspect_ratio": "3:4",
    "resolution": "2k",
    "seed": 260929,
    "prompt_extend": false,
    "enable_thinking": false
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

## R — reels for the landing (brand/v1.1, 2026-09-29)

The owner's follow-up: the site must feel like the studio it is, and the studio makes VIDEO — yet the landing
showed motion only in the desktop hero. Three 5-second vertical loops, made from brand/v1 masters we already
own (no new stills): what "a photo becomes a shot" looks like. Same world, same grade; the last frame is the
first frame so each loops; silent. Sources are the committed masters cropped to 9:16 and served from the site
(`public/brand/v1/src/`), because only A2 is 9:16 already and A5r's retouch exists only locally.

Budget: this job shares the manifest's $7 cap and $6.50 stop line with brand/v1 ($0.744 spent). Three shots at
the Kling std price ≈ $0.69; at most two retries per shot.

```json shot
{
  "id": "R1",
  "title": "reel · the street (from A2)",
  "endpoint": "kling-video/v3.0/std/image-to-video",
  "input": {
    "prompt": "A living photograph: light rain keeps falling, reflections ripple on the wet cobblestones, thin mist drifts through the streetlight, the phone screen glows; the woman keeps filming, only breathing with a slight shift of weight; the camera holds with an imperceptible slow push-in. No cuts, no new people, no text.",
    "image_url": "https://myavatar.ge/brand/v1/src/reel-street.jpg",
    "last_image_url": "https://myavatar.ge/brand/v1/src/reel-street.jpg",
    "duration": 5,
    "sound": "off"
  }
}
```

```json shot
{
  "id": "R2",
  "title": "reel · the product (from A5r)",
  "endpoint": "kling-video/v3.0/std/image-to-video",
  "input": {
    "prompt": "A premium product shot that breathes: a slow, smooth push-in toward the bottle and the glass; a thin warm light glides across the glass and the shoulder of the bottle; fine droplets glisten on the dark stone; the wine barely moves. Calm and locked, no cuts, no hands, no text, no labels.",
    "image_url": "https://myavatar.ge/brand/v1/src/reel-product.jpg",
    "last_image_url": "https://myavatar.ge/brand/v1/src/reel-product.jpg",
    "duration": 5,
    "sound": "off"
  }
}
```

```json shot
{
  "id": "R3",
  "title": "reel · the portrait (from A7)",
  "endpoint": "kling-video/v3.0/std/image-to-video",
  "input": {
    "prompt": "A living portrait: she breathes, blinks once and gives a faint, calm smile; a loose strand of hair stirs; the phone's screen light flickers softly on her face; mist drifts in the rainy street behind her. The camera is still. No cuts, no speech, no new people, no text.",
    "image_url": "https://myavatar.ge/brand/v1/src/reel-portrait.jpg",
    "last_image_url": "https://myavatar.ge/brand/v1/src/reel-portrait.jpg",
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
