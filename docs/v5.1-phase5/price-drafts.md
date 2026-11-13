# Draft price rows for GG to approve, one by one

**Status: DRAFTS. None is approved, so none prices anything.** Source: [Vertex AI generative AI pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing), read 2026-11-13T13:15:00Z. Generated from `lib/billing/v5/priceDrafts.ts`; the SQL is `seed/20261113b_price_drafts.sql`.

## How these were priced

- **USD** is the price Google bills, exactly as the page lists it.
- **Full price, not the promo.** 3.8 Flash, 3.8 Flash TTS, Argon and Carbon show a lower "introductory" price that Google gives as *50 % credits back on net spend*. The invoice and the billing export carry the full price, so the drafts use it. Users then see no price jump on 2026-12-01 (Argon, Carbon) or 2027-01-01 (3.8 Flash), and the credits back is extra margin while it lasts. If you would rather pass the promo on to users, say so and these rows get redrafted as promo rows with end dates.
- **Credits per unit** is the smallest value (4 decimals) that meets your rule: 100 % profit over full cost, with the 5 % FX reserve and the 3 % card fee counted. 1 credit = 0.10 ₾, $1 = 2.7 ₾. So $1 of Google cost = 60.3192 credits.
- Argon and Carbon are drafted because their price is now known. D-06 still keeps both models off; approving their rows does not turn them on.

## Rows

| # | id | capability | model | unit | USD / unit | credits / unit | page line |
|---|---|---|---|---|---|---|---|
| 1 | `pv_text_38flash_in` | text | gemini-3.8-flash | input_mtok | $1.5 | 90.4788 | input text/image/video/audio, per 1M tokens |
| 2 | `pv_text_38flash_out` | text | gemini-3.8-flash | output_mtok | $7.5 | 452.3937 | text output incl. reasoning, per 1M tokens |
| 3 | `pv_text_31pro_in` | text.le200k | gemini-3.1-pro-preview | input_mtok | $2 | 120.6383 | <=200K input, per 1M tokens |
| 4 | `pv_text_31pro_out` | text.le200k | gemini-3.1-pro-preview | output_mtok | $12 | 723.8298 | <=200K input, text output, per 1M tokens |
| 5 | `pv_text_31pro_in_gt200k` | text.gt200k | gemini-3.1-pro-preview | input_mtok | $4 | 241.2766 | >200K input, per 1M tokens |
| 6 | `pv_text_31pro_out_gt200k` | text.gt200k | gemini-3.1-pro-preview | output_mtok | $18 | 1085.7447 | >200K input, text output, per 1M tokens |
| 7 | `pv_text_argon_in` | text | gemini-4-argon | input_mtok | $4 | 241.2766 | input, per 1M tokens (D-06: model stays off) |
| 8 | `pv_text_argon_out` | text | gemini-4-argon | output_mtok | $20 | 1206.383 | output, per 1M tokens (D-06: model stays off) |
| 9 | `pv_text_carbon_in` | text | gemini-4-carbon | input_mtok | $4 | 241.2766 | input, per 1M tokens (D-06: model stays off) |
| 10 | `pv_text_carbon_out` | text | gemini-4-carbon | output_mtok | $20 | 1206.383 | output, per 1M tokens (D-06: model stays off) |
| 11 | `pv_tts_38flash_in` | tts | gemini-3.8-flash-tts | input_mtok | $1 | 60.3192 | text input, per 1M tokens |
| 12 | `pv_tts_38flash_out` | tts | gemini-3.8-flash-tts | output_mtok | $18 | 1085.7447 | audio output, per 1M tokens |
| 13 | `pv_live_38_audio_in` | live.audio | gemini-3.8-live | input_mtok | $3 | 180.9575 | non-global, input audio, per 1M tokens |
| 14 | `pv_live_38_audio_out` | live.audio | gemini-3.8-live | output_mtok | $12 | 723.8298 | non-global, output audio, per 1M tokens |
| 15 | `pv_live_38_text_in` | live.text | gemini-3.8-live | input_mtok | $0.75 | 45.2394 | non-global, input text, per 1M tokens |
| 16 | `pv_live_38_text_out` | live.text | gemini-3.8-live | output_mtok | $4.5 | 271.4362 | non-global, output text, per 1M tokens |
| 17 | `pv_live_38_video_in` | live.video | gemini-3.8-live | input_mtok | $1 | 60.3192 | non-global, input video/image, per 1M tokens |
| 18 | `pv_live_38_avatar_out` | live.avatar | gemini-3.8-live | output_mtok | $1 | 60.3192 | non-global, output avatar video, per 1M tokens |
| 19 | `pv_image_31flash_1k` | image.1k | gemini-3.1-flash-image | image | $0.067 | 4.0414 | 1K image (1,120 tokens at $60 / 1M) |
| 20 | `pv_image_31flash_2k` | image.2k | gemini-3.1-flash-image | image | $0.101 | 6.0923 | 2K image (1,680 tokens) |
| 21 | `pv_image_31flash_4k` | image.4k | gemini-3.1-flash-image | image | $0.15 | 9.0479 | 4K image (2,520 tokens) |
| 22 | `pv_image_31flash_in` | image.prompt | gemini-3.1-flash-image | input_mtok | $0.5 | 30.1596 | text/image input, per 1M tokens (each input image = 1,120 tokens) |
| 23 | `pv_video_omni12_out` | video.omni | gemini-omni-1.2-flash | output_mtok | $12 | 723.8298 | video output, per 1M tokens |
| 24 | `pv_video_omni12_in` | video.omni | gemini-omni-1.2-flash | input_mtok | $1.5 | 90.4788 | input text/image/video/audio, per 1M tokens |
| 25 | `pv_video_omni12_text_out` | video.omni.text | gemini-omni-1.2-flash | output_mtok | $9 | 542.8724 | text output (thinking), per 1M tokens |
| 26 | `pv_veo31_720_audio` | video.veo.720p.audio | veo-3.1-generate | second | $0.4 | 24.1277 | 720p/1080p with audio |
| 27 | `pv_veo31_1080_audio` | video.veo.1080p.audio | veo-3.1-generate | second | $0.4 | 24.1277 | 720p/1080p with audio |
| 28 | `pv_veo31_4k_audio` | video.veo.4k.audio | veo-3.1-generate | second | $0.6 | 36.1915 | 4K with audio |
| 29 | `pv_veo31_720_mute` | video.veo.720p.mute | veo-3.1-generate | second | $0.2 | 12.0639 | 720p/1080p without audio |
| 30 | `pv_veo31_1080_mute` | video.veo.1080p.mute | veo-3.1-generate | second | $0.2 | 12.0639 | 720p/1080p without audio |
| 31 | `pv_veo31fast_720_audio` | video.veo.720p.audio | veo-3.1-fast-generate | second | $0.1 | 6.032 | 720p with audio |
| 32 | `pv_veo31fast_1080_audio` | video.veo.1080p.audio | veo-3.1-fast-generate | second | $0.12 | 7.2383 | 1080p with audio |
| 33 | `pv_veo31fast_4k_audio` | video.veo.4k.audio | veo-3.1-fast-generate | second | $0.3 | 18.0958 | 4K with audio |
| 34 | `pv_veo31fast_720_mute` | video.veo.720p.mute | veo-3.1-fast-generate | second | $0.08 | 4.8256 | 720p without audio |
| 35 | `pv_veo31fast_1080_mute` | video.veo.1080p.mute | veo-3.1-fast-generate | second | $0.1 | 6.032 | 1080p without audio |
| 36 | `pv_veo31lite_720_audio` | video.veo.720p.audio | veo-3.1-lite-generate | second | $0.05 | 3.016 | 720p with audio |
| 37 | `pv_veo31lite_1080_audio` | video.veo.1080p.audio | veo-3.1-lite-generate | second | $0.08 | 4.8256 | 1080p with audio (no 4K on Lite) |
| 38 | `pv_veo31lite_720_mute` | video.veo.720p.mute | veo-3.1-lite-generate | second | $0.03 | 1.8096 | 720p without audio |
| 39 | `pv_veo31lite_1080_mute` | video.veo.1080p.mute | veo-3.1-lite-generate | second | $0.05 | 3.016 | 1080p without audio |
| 40 | `pv_music_lyria3_clip` | music.clip | lyria-3-clip-preview | call | $0.04 | 2.4128 | one 30-second clip |
| 41 | `pv_music_lyria3_pro` | music.song | lyria-3-pro-preview | call | $0.08 | 4.8256 | one full song |
| 42 | `pv_search_grounding` | search.grounding | gemini-3-grounding | call | $0.014 | 0.8445 | $14.00 per 1,000 grounded queries |

## Not drafted

- **gemini-embedding-001:** not named on the page; the "Gemini Embedding" line is $0.00015 per 1,000 characters. Memory embeddings cost a fraction of a credit a day, so they stay inside the plan price; drafting a row would only add noise. Say if you want one.
- **Chirp 3 speech-to-text, Cloud TTS (read-aloud fallback):** on the Cloud Speech pricing pages, not this one. Next batch, from those pages.
- **Vercel sandbox (code run, browser):** not a Google price; it stays on the $20 sandbox ledger.

## Approving one row (after the migration and the seed, staging first)

Approval is one row at a time. It starts the price at the moment of approval. After that the row can never be edited or deleted, only ended with `valid_to`:

```sql
update public.price_versions set valid_from = now(), approved_by = 'GG', approved_at = now()
where id = 'pv_text_38flash_out' and approved_by is null;
```

Nothing reads approved rows while `AGENT_PRICE_BOOK` is `off`. In `shadow`, each quote is also priced from the book and only the difference is logged; the user still pays today's price.
