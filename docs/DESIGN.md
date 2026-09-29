# MyAvatar.ge — DESIGN.md

Written before any pixel or any Higgsfield request. The landing page, the dashboard polish and the brand/v1 image pack all follow this file. If a change breaks a rule here, change this file first.

## 1. What the product is

**A Tbilisi video production studio for Reels.** You describe a shot in Georgian and get a finished vertical video: footage, Georgian voice, music, subtitles and edit. Image, music, voice and avatar are part of the same studio, always one click away. Video leads.

A guest must understand "video studio" within three seconds of landing. The picture says it, the headline says it, and the first card says it.

## 2. Look

**Dark studio, one accent, cinematic stills.** It should feel like a colour-graded night shoot in Old Tbilisi, not an AI dashboard.

| Token | Value | Use |
|---|---|---|
| ink | `#0A0A0A` | page background |
| surface | `#111214` / `#16171A` | panels, the composer, cards |
| hairline | white 8–12 % | borders; never a coloured border |
| text | `#F2F2F3` | headings and body |
| muted | `#A1A1AA` | secondary text. Never below AA (4.5:1) on ink |
| **accent** | **`#00E5FF`** | **the only accent**: the primary CTA, focus rings, `.ge`, active states, small badges |

**One accent only.** The brand sheet's lime (`#C5FF00`) and gold (`#D4AF37`) are brand-sheet colours, not UI colours. The product UI uses cyan and neutrals only. If a second colour seems necessary, the hierarchy is wrong.

The primary CTA is a solid cyan pill with ink text, used once per view. Secondary actions are outline or text.

## 3. Type

- Georgian text keeps **Noto Sans Georgian**, the current Georgian-capable face. Headlines are weight 700, body text 400/500.
- Latin display uses **Montserrat**, from the brand sheet. Latin body text uses Inter at small sizes only; Inter is not the only face on the page.
- Headline scale: 40 px on phones up to 72 px on desktop, tracking −1 %, line-height 1.1. Georgian has tall ascenders, so a headline line-height is never below 1.1.
- Body text is 16–18 px, line-height 1.6, with a measure of 60–70 characters.
- Numbers use `tabular-nums` wherever they change: prices and counters.

## 4. Imagery — the brand/v1 world

**One world, one grade.** It is Tbilisi at night after rain:
- wet cobblestones and carved Old-Town balconies;
- warm sodium streetlight against cool cyan practicals;
- mist, a 35 mm anamorphic look and fine grain;
- deep blacks with teal-and-amber separation.

Every still is the same world with the same grade and the same seed family. Shot 1 is the reference for the rest.

- **No text, logos, UI or watermarks inside an image.** Type is set in code over the picture.
- A phone screen shows **footage**, never interface.
- Images carry depth. The UI stays flat: hairlines and shadowless panels.
- Generated only from `scripts/hf-art-pack.md`, all costs logged in `public/brand/v1/manifest.json`. The hard cap is $7 and generation stops at $6.50.

## 5. Motion and density

- **Motion: low.** Fades and 8–12 px rises of 200–300 ms on `cubic-bezier(.2,.7,.2,1)`. No bounce, no spring overshoot, no parallax.
- `prefers-reduced-motion` disables every movement, including the hero loop, which then shows its poster.
- **Density: medium.** Section rhythm is 96–128 px on desktop and 64–80 px on phones, with an 8 px grid.
- Touch targets are ≥ 44 px, and safe-area insets are respected on every fixed edge.

## 6. Banned

- purple, violet or mesh gradients: the "AI purple" look;
- **glow soup**: neon box-shadows, blurred colour halos, pulsing glows. At most one soft shadow per elevated surface;
- emoji as UI: icons, labels and bullets made of emoji;
- cards inside cards, and borders inside borders;
- bounce and spring easing;
- text baked into generated images;
- a second accent colour, including lime and gold, in product UI;
- stock-looking "AI posters": eight shots in eight styles.

## 7. Copy — locked

**Dashboard empty state.**

| | ka | en | ru |
|---|---|---|---|
| H1 | რით დაგეხმარო? | What are we making? | Что снимем? |
| Sub | შექმენი ვიდეო, სურათი ან მუსიკა — ტექსტით, ხმით ან ფაილით. | Make a video, an image or music — by text, voice or file. | Создай видео, изображение или музыку — текстом, голосом или файлом. |
| Placeholder | აღწერე კადრი, ჩაწერე ხმა, ან მიამაგრე ფაილი… | Describe a shot, record your voice, or attach a file… | Опиши кадр, запиши голос или прикрепи файл… |

In en and ru, video is always named first.

**Landing, above the fold.** The ka copy leads; en and ru translate it.
- The H1 says video: **„ვიდეო ერთი იდეიდან.“**
- One sentence follows, naming Reels and the Georgian language.
- The primary CTA is **„შექმენი ვიდეო“** and goes to `/{lang}/dashboard`, signed in or not. The secondary is **„შესვლა“**.

**The three proof steps:** დაწერე → დაარენდერე → გამოაქვეყნე.

## 8. Components

- **Service cards (4):** image, name and one line. Video comes first and carries a **„მთავარი“** badge. There is no nested panel inside a card and no hover glow; hover lifts the image contrast only.
- **Chips (dashboard):** a hairline pill. Hover and press **invert** it to a white fill with ink text. A chip sets the service and prefills a starter; it never spends.
- **Composer:** unchanged in structure. When the text field has text, the voice/waveform button becomes **send**.
- **Header:** logo, language and „შესვლა“. On the landing, „შესვლა“ opens sign-in, and a signed-in visitor goes straight to the studio.

## 9. Routes (invariants)

- `/{lang}/dashboard`, `/chat`, `/agent`, `/pricing` and `/services/*` are untouched.
- Auth, the credit ledger and the generation contracts are untouched.
- `/` and `/{lang}` become the marketing landing for **guests**. A signed-in visitor keeps going straight to `/{lang}/dashboard`, as today.
- `/{lang}/landing`, the retired route, redirects to `/{lang}`.
- The PWA `start_url` stays `/ka/dashboard`.
