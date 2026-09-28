# MyAvatar.ge → სრულფასოვანი ვიდეო სტუდია
### Claude Code-ის სამუშაო დავალება (Task Brief) · 2026-09-28

> **Claude Code-ს:** წაიკითხე მთლიანად, სანამ კოდს შეეხები. ყოველი ფაზის ბოლოს გაჩერდი და მოამზადე ანგარიში (რა გაკეთდა, რა ტესტები გაიარა, რა დარჩა). საიდუმლო გასაღებები არასდროს ჩაწერო კოდში, ლოგებში ან კომიტებში.

---

## 0. რა იცვლება და რატომ

**რა:** myavatar.ge აღარ იქნება „ჩატბოტი + ცალკეული გენერატორები“. ის ხდება **ვიდეო სტუდია**. აქ მომხმარებელი იდეიდან (ტექსტი, ფოტო, რეფერენსი) მიდის მზა, დამონტაჟებულ ვიდეომდე: კადრები, ხმა ქართულად, მუსიკა, სუბტიტრები, მონტაჟი. ყველაფერი ერთ ადგილას ხდება, ერთი ბალანსით (GEL) და ერთი ჩატიდან (Agent G).

**რატომ:**

1. **ხარისხი და მოდელების სიგანე.** ახლა თითოეული სერვისი ცალკე პროვაიდერზეა მიბმული (Replicate/Kling, FLUX, Pollinations…). Higgsfield-ის API ერთი ინტეგრაციით გვაძლევს 80-ზე მეტ image/video ენდპოინტს: Kling 3 / O3 / Motion Control, Seedance 2.5, Wan 3, MiniMax, Soul, Cinema Studio და სხვა. ერთი auth, ერთი async lifecycle, ერთი billing.
2. **ფასი იცის გენერაციამდე.** Higgsfield-ს აქვს `/estimate` ენდპოინტი. ეს პირდაპირ ხსნის ჩვენს მოთხოვნას: „ცოცხალი ფასი უნდა ჩანდეს, სანამ მომხმარებელი დაადასტურებს“.
3. **გამოცდილება.** Higgsfield-ის სიძლიერე მოწესრიგებულ UX-შია: მოდელის არჩევა, რეჟიმები, რეფერენსები, შაბლონები, პროექტები, ისტორია. სურვილი არ ხდება ტექნიკური ტვირთი. ჩვენ იგივე სიმარტივე გვინდა, ოღონდ ქართულად და ჩატიდან.
4. **დიფერენციაცია.** საბოლოო „wow“ არის სრული მუსიკალური კლიპი/რეკლამა/ტიზერი ერთი მოთხოვნიდან. ეს შეუძლებელია, სანამ ვიდეოს ფენა არ არის ერთიანი და საიმედო.

**რა არ იცვლება:** Next.js (App Router) + TypeScript + Supabase + Upstash + Vercel (პროექტი `avatar-g-frontend-v3`), ქართული ენა პირველ ადგილზე, GEL ფასები, TBC/BOG გადახდები, ElevenLabs ქართული TTS (stability 0.48), არსებული billing saga და ffmpeg/resvg მონტაჟის პაიპლაინი.

---

## 1. ჯერ სიმართლე: აუდიტი (Phase 0-მდე, სავალდებულო)

სანამ რამეს შეცვლი:

1. `git log --oneline -30`, `git status`, ბრენჩები. დაადგინე, საიდან ვიწყებთ. ბოლო ცნობილი სტაბილური წერტილია `feat/prod-upgrade-v180`, merge `08576f8` (803/803 ტესტი).
2. ჩამოწერე ყველა არსებული პროვაიდერის გამოძახება (`grep -rn "replicate\|kling\|flux\|pollinations\|elevenlabs\|suno\|fal\|runway"`). თითოეულისთვის მიუთითე, რომელ სერვისს ემსახურება.
3. გაუშვი ტესტები და build. მოამზადე `docs/AUDIT_2026-09.md`: რა მუშაობს რეალურად, რა არის mock და რა გატეხილი.
4. **საცნობარო ფაილები** (`docs/reference/`):
   - `myavatar-v39.html` („Imagine Studio v39“) არის სტუდიის **UX-ის ეტალონი**: Image/Video ტაბები, მოდელის/რეჟიმის არჩევა, რეფერენსები 0/5, პარამეტრები, შაბლონები, Projects/Library, ხარჯის ჩვენება.
   - `myavatar-v32-copilot.html` არის **ჩატის UX-ის ეტალონი**: focus რეჟიმები, slash ბრძანებები, params sheet, @mention ავატარები, ⌘K, სესიები.
   - ⚠️ ორივე მხოლოდ კლიენტის პროტოტიპია. გენერაცია მათში **ყალბია**: canvas-ის გრადიენტები, MediaRecorder WebM, `estimateCost` და credits ლოკალურ state-შია, მონაცემები IndexedDB-ში. **ლოგიკა არ გადმოიტანო.** აიღე მხოლოდ layout, ნაკადები და მიკრო-ინტერაქციები, და გადააკეთე არსებულ React/Next კომპონენტებად.

---

## 2. დაფიქსირებული გადაწყვეტილებები

| # | გადაწყვეტილება |
|---|---|
| D1 | **Higgsfield არის ძირითადი image + video პროვაიდერი.** პროდაქშენი მუშაობს მხოლოდ **server-side API key**-ით (`Authorization: Key ID:SECRET`), ოფიციალური `@higgsfield/client` (v2) SDK-ით. |
| D2 | **Higgsfield MCP (`https://mcp.higgsfield.ai/mcp`) განკუთვნილია Claude Code-ისთვის დეველოპმენტის დროს:** მოდელების გამოცდა, prompt-ების კალიბრაცია, შაბლონების ნიმუშების გენერაცია. საიტის მომხმარებლების მოთხოვნები MCP-ზე **არ გადის**. MCP GG-ის პირად გამოწერაზეა მიბმული (OAuth), საიტს კი API key სჭირდება. |
| D3 | Higgsfield-ის საჯარო API კატალოგი მოიცავს **image და video** მოდელებს. ქართული ხმა რჩება **ElevenLabs**-ზე. მუსიკა რჩება არსებულ პროვაიდერზე. თუ Higgsfield Console-ში audio/lip-sync ენდპოინტი გამოჩნდება, დაამატე როგორც ალტერნატივა და არა ჩანაცვლება. |
| D4 | პროვაიდერი ფარული უნდა იყოს ადაპტერის უკან. UI და Agent G ელაპარაკება **ჩვენს** model registry-ს და არა პირდაპირ Higgsfield-ს. ასე ხვალ ნებისმიერი მოდელი/პროვაიდერი მარტივად ჩანაცვლდება. |
| D5 | ყოველი გენერაციის წინ: **estimate → GEL-ში ფასი → მომხმარებლის დადასტურება → კრედიტის რეზერვი → submit**. |
| D6 | Higgsfield-ის შედეგები ინახება ≥7 დღე. ყოველი დასრულებული ფაილი დაუყოვნებლივ **კოპირდება Supabase Storage-ში**. მომხმარებელს ყოველთვის ჩვენი URL ეძლევა. |

---

## 3. Phase 0: Higgsfield-ის თავიდან შეერთება (პირველი და ბლოკირებადი)

### 3a. MCP Claude Code-ში (დეველოპმენტის ინსტრუმენტი)
```bash
claude mcp add --transport http higgsfield https://mcp.higgsfield.ai/mcp
# შემდეგ /mcp → higgsfield → Authenticate (ბრაუზერში GG ავტორიზდება)
```
ალტერნატივა ან დამატება (ოფიციალური CLI + skills):
```bash
npm i -g @higgsfield/cli && higgsfield auth login
npx skills add higgsfield-ai/skills
```
**შემოწმება:** MCP-ით დააგენერირე 1 სურათი (Soul 2) და 1 ხუთწამიანი ვიდეო (Kling 3 ან Seedance 2.5). შედეგი ჩაწერე ანგარიშში.

### 3b. API key აპლიკაციაში (პროდაქშენი)
- GG ქმნის ორ წყვილ credential-ს Higgsfield Console-ში (`console.higgsfield.ai`): **dev** და **prod**.
- ცვლადები: `HF_API_KEY_ID`, `HF_API_KEY_SECRET` (ან `HF_CREDENTIALS="id:secret"` SDK-სთვის), `HF_WEBHOOK_SECRET` (ჩვენი, URL-ის ხელმოწერისთვის).
- Vercel env: Preview ← dev key, Production ← prod key. `.env.example` განახლდეს მნიშვნელობების გარეშე.
- ⚠️ გასაღები არასდროს ხვდება კლიენტში (SDK v2 ბრაუზერში თვითონაც იბლოკება).

### 3c. Smoke test ყველა სერვისზე
`scripts/hf-smoke.ts`: თითო რეალური მოთხოვნა თითოეულ რეგისტრირებულ მოდელზე (ჯერ `/estimate`, შემდეგ იაფი პარამეტრებით submit). შედეგი: ცხრილი `model | estimate | status | latency | output-url`.

**Phase 0 დასრულებულია, როცა:** MCP მუშაობს Claude Code-ში; API key მუშაობს Preview-ზე; smoke test მწვანეა ყველა ჩართულ მოდელზე; არცერთი secret არ ჩანს bundle-ში (`grep` build output-ში).

---

## 4. Phase 1: პროვაიდერის ფენა (backend)

```
lib/providers/
  types.ts              # GenerationRequest / GenerationResult / ProviderAdapter
  registry.ts           # ჩვენი model catalog (id, label_ka, service, provider, endpoint, params schema, tier)
  higgsfield/
    client.ts           # SDK wrapper, concurrency semaphore
    adapter.ts          # submit / status / cancel / estimate / upload
    models.ts           # endpoint map (მხოლოდ Console-ში დადასტურებული მოდელები)
  elevenlabs/ …         # არსებული, ადაპტერის ინტერფეისზე მორგებული
app/api/generate/route.ts          # ერთი შესასვლელი ყველა სერვისისთვის
app/api/estimate/route.ts          # ფასი GEL-ში გენერაციამდე
app/api/webhooks/higgsfield/route.ts
```

**Higgsfield-ის API წესები (დოკუმენტაციიდან, სავალდებულო):**
- Submit აბრუნებს `request_id` + `status_url` + `cancel_url`. `request_id` ბაზაში უნდა ჩაიწეროს **დაუყოვნებლივ**.
- სტატუსები: `queued`, `in_progress` → `completed` | `failed` | `nsfw` | `canceled`.
- **Webhook:** `?hf_webhook=<https url>`. პასუხი 10 წამში, 2xx მხოლოდ ბაზაში ჩაწერის შემდეგ. დედუპლიკაცია ხდება `request_id + status`-ით (დუბლიკატები მოსალოდნელია). Polling გამოიყენე მხოლოდ fallback-ად, exponential backoff + jitter-ით.
- **არასდროს** გაიმეორო generation `POST` გაურკვეველ timeout-ზე: idempotency key არ არსებობს, ორმაგი ჩამოჭრა მოხდება. გადაამოწმე status-ით.
- Concurrency ლიმიტი აბრუნებს `400`-ს („Maximum number of concurrent requests“). საჭიროა Upstash-ზე დაფუძნებული რიგი/semaphore და `pending` სტატუსი UI-ში.
- შეცდომები: 401 (key), 403 (**Higgsfield-ზე კრედიტი ამოიწურა**, admin alert!), 404/423/503 (მოდელი მიუწვდომელია, გამოიყენე fallback მოდელი registry-დან), 422 (ვალიდაცია).
- `failed`/`nsfw`/`canceled` Higgsfield-ზე არ ჩამოიჭრება. ჩვენთანაც **ავტომატური refund**.
- ინფუთ-ფაილები: `POST /files/generate-upload-url` → `PUT` → `public_url`. მხარდაჭერილი ტიპები: jpeg/png/webp/gif, wav, mp4.
- ყოველ მოთხოვნაზე ჩაიწერება `X-Correlation-ID`.

**Billing saga (არსებულ ledger-ზე):** `estimate(credits,usd)` → GEL ფასი (`usd × კურსი × მარჟა`, კონფიგურირებადი) → `reserve` → submit → webhook `completed` → `settle` + Storage-ში კოპირება → შედეგი მომხმარებელს. `failed/nsfw` → `release`.
DB: `generation_jobs` (user, service, model_id, provider, provider_request_id UNIQUE, status, estimate_gel, charged_gel, input, output_urls, correlation_id, timestamps) + RLS.
ამავე ფაზაში შეიქმნას დაკარგული `agent_evolution_traces` ცხრილი (ამის გამო API ხარჯი 0-ად ჩანს).

**ტესტები:** adapter unit (mocked HTTP), webhook idempotency, refund გზები, concurrency-400 → რიგი, estimate → GEL.

---

## 5. Phase 2: სერვისების გადაწყობა და გაუმჯობესება

| სერვისი | რა ხდება | პროვაიდერი / მოდელები (registry-ში) |
|---|---|---|
| **Image** | text-to-image, edit, რეფერენსები (≤5), 1–4 ვარიანტი, 1K/2K | Higgsfield: Soul 2 / Soul Cinema, Seedream, Nano Banana, GPT Image, Recraft, Ideogram, Qwen Image (edit) |
| **Video** | text→video, image→video, first/last frame, reference→video, extend, video edit | Higgsfield: Kling 3 (std/pro/4K/turbo), Kling O3, Seedance 2.5, Wan 3, MiniMax H3, Cinema Studio 4 |
| **Avatar** | თანმიმდევრული პერსონაჟი ყველა კადრში | Higgsfield **Soul ID** (character training) + reference-to-video |
| **Motion Control** | მოძრაობის გადატანა ვიდეოდან ფოტოზე | Higgsfield: Kling 3 Motion Control, Genjutsu motion-transfer |
| **Remix** | ობიექტის ჩანაცვლება, ვიდეოს რედაქტირება | Higgsfield: Genjutsu object-swap, Kling O3 video-edit, Seedance 2.5 video-edit |
| **Voice** | ქართული TTS / voiceover | ElevenLabs (stability 0.48, უცვლელი) |
| **Music** | სიმღერა/ფონი | არსებული პროვაიდერი (ცვლილების გარეშე ამ ეტაპზე) |
| **Chat (Agent G)** | ყველა ზემოთ ჩამოთვლილის ერთი შესასვლელი | იხ. Phase 4 |

ზუსტი endpoint-ები და პარამეტრები აიღე **თითო მოდელის დოკუმენტაციიდან** (`docs.higgsfield.ai/docs/models/...`) და Console-იდან. ჩართე მხოლოდ ის, რაც GG-ის ანგარიშზე რეალურად ხელმისაწვდომია. registry-ში ყოველ მოდელს უნდა ჰქონდეს `label_ka`, მოკლე ქართული აღწერა, `tier` (fast/standard/pro) და fallback.

**თითო სერვისის მიღების კრიტერიუმი:** ქართული UI → ფასი ჩანს → დადასტურება → პროგრესი → შედეგი Library-ში → ბალანსი სწორად შემცირდა → შეცდომაზე refund და გასაგები ქართული შეტყობინება.

---

## 6. Phase 3: ვიდეო სტუდია (UI)

ეტალონი: `docs/reference/myavatar-v39.html`. აიგება არსებული დიზაინ-სისტემით, Next.js კომპონენტებად.

- **Studio შელი:** მარცხნივ Studio / Projects / Library / Templates; ცენტრში სცენა (შედეგები, jobs queue პროგრესით); ქვემოთ prompt dock.
- **Prompt dock:** Image ↔ Video ტაბი · მოდელის არჩევა (registry-დან, ქართული აღწერებით) · რეჟიმი · რეფერენსები (0/5, upload → Higgsfield presigned) · პარამეტრები (aspect, resolution, duration, count, seed) · **ფასი ღილაკზე** („გენერაცია · 4.20 ₾“).
- **შაბლონები:** v39-ის სია (Photo Edit, Product Poster, Headshot, UGC, E-commerce…) პლუს ვიდეო შაბლონები (ჟანრი/გადაღების სტილი). თითოეული შაბლონი = წინასწარ შევსებული მოდელი + პარამეტრები + prompt-ის ჩარჩო + ნიმუში (ნიმუშები Claude Code-მა დააგენერიროს **MCP-ით**).
- **შედეგის ქმედებები** (Higgsfield-ის სტილი): Animate (სურათი → ვიდეო), Upscale, Extend, Use as reference, Remix, Download, Add to project.
- **Projects + ტაიმლაინი (MVP):** კადრების თანმიმდევრობა → ქართული voiceover (ElevenLabs) → მუსიკა → სუბტიტრები (resvg) → მონტაჟი (არსებული ffmpeg პაიპლაინი) → MP4 + „MyAvatar.ge“ watermark.
- **Flagship (შემდეგი ეტაპი, ამ ბრიფში მხოლოდ არქიტექტურულად უნდა იყოს მომზადებული):** 3–5 წუთიანი მუსიკალური კლიპი ერთი მოთხოვნიდან, ფასის წინასწარი ჩვენებით.
- მობილური პირველ რიგში: safe-area, კლავიატურა, 44px touch targets.

---

## 7. Phase 4: Agent G — ჩატბოტი, რომელიც სერვისს მარტივად აძლევს

მიზანი: მომხმარებელი წერს ჩვეულებრივ ქართულად („გამიკეთე 15 წამიანი რეკლამა ჩემი ყავისთვის, ეს ფოტოა“). Agent G ყველაფერს აწყობს ისე, როგორც Higgsfield-ის სტუდია, ოღონდ საუბრის ფორმით.

**ნაკადი:**
1. **Intent → Plan.** Agent G ადგენს სერვისს/სერვისებს და აჩვენებს **Plan ბარათს**: ნაბიჯები (მაგ. სურათი → ვიდეო → ხმა → მონტაჟი), არჩეული მოდელები, ჯამური ფასი GEL-ში.
2. **ბარათი ტექსტის ნაცვლად.** Plan-ში მოდელი, aspect და ხანგრძლივობა იცვლება ჩიპებით. ფასი ცოცხლად გადაითვლება (`/api/estimate`).
3. **დადასტურება** ერთი ღილაკით: „დაწყება · 12.80 ₾“. დადასტურების გარეშე ფული არ იხარჯება.
4. **პროგრესი** SSE-ით (Upstash/Redis streams): თითო ნაბიჯის სტატუსი, გაუქმება, სანამ `queued`-შია.
5. **შედეგი** მოდის ჩატში ქმედებების ღილაკებით (Animate / Extend / Remix / Studio-ში გახსნა) და ავტომატურად ხვდება Library-ში.

**ტექნიკურად:** Agent G იძახებს **ჩვენს** tool-ებს (`generate_image`, `generate_video`, `animate_image`, `motion_transfer`, `swap_object`, `create_character`, `tts_ka`, `make_music`, `assemble_video`, `estimate`, `list_models`, `get_history`). ყველა ერთსა და იმავე `/api/generate` + billing saga-ზე გადის. Agent G თვითონ **არასდროს** იძახებს Higgsfield-ს და ფულს დადასტურების გარეშე არ ხარჯავს.

**UX მოთხოვნები:**
- ცარიელ ეკრანზე: 6 სწრაფი ჩიპი (ვიდეო ფოტოდან · რეკლამა · ავატარი · ხმოვანი ვიდეო · მუსიკა · რემიქსი) + ტრენდული შაბლონები.
- slash ბრძანებები (`/ვიდეო`, `/სურათი`, `/ავატარი`…) და `@ავატარი` mention (v32 ეტალონი).
- ქართული prompt ინახება როგორც არის. მოდელისთვის ინგლისური თარგმანი/გაუმჯობესება კეთდება server-side. მომხმარებელს ორივე ვერსია ეჩვენება (გაშლადად).
- ⚠️ ცნობილი რისკი: ვიდეო მოდელები ეკრანზე ქართულ ტექსტს ხშირად „ამახინჯებენ“. ამიტომ ქართული ტექსტი/სუბტიტრები ედება **მონტაჟში (resvg)**, და არა გენერაციის prompt-ში.

---

## 8. ცნობილი ბაგები (ამ სამუშაოსთან ერთად)

- [ ] Wordmark მობილურზე იჭრება „MyAvata“-მდე.
- [ ] მუსიკის პანელის clipping.
- [ ] ვიდეოს სკრიპტის პანელი ინგლისურად ჩანს. უნდა იყოს ქართულად.
- [ ] `agent_evolution_traces` ცხრილი (Phase 1).
- [ ] Stripe live key: **მხოლოდ GG-სთან შეთანხმებით**, ავტომატურად არ ჩართო.

---

## 9. სამუშაო წესები

- ბრენჩი: `feat/studio-higgsfield` (Phase-ების მიხედვით ქვე-ბრენჩები). PR-ები მცირე ზომის. `main`-ში პირდაპირ არაფერი.
- არსებული 803 ტესტი რჩება მწვანე. ყოველ ახალ მოდულს აქვს საკუთარი ტესტები.
- Feature flag `STUDIO_V2`: ახალი სტუდია ჯერ Preview-ზე ჩაირთვება, შემდეგ prod-ზე.
- ძველი პროვაიდერები (Replicate/Kling, FLUX, Pollinations) იშლება **მხოლოდ მას შემდეგ**, რაც Higgsfield-ის ანალოგი prod-ზე 1 კვირა სტაბილურად იმუშავებს.
- ლოგოს ხელახლა ნუ დახატავ. მასტერ-ფაილი მოითხოვე GG-სგან.
- ყოველი ფაზის ბოლოს: `docs/REPORT_PHASE_N.md` (გაკეთდა / ტესტები / ღია საკითხები / Higgsfield-ის ხარჯი).

---

## 10. Definition of Done (მთლიანი დავალება)

1. Higgsfield MCP მუშაობს Claude Code-ში. API key მუშაობს prod-ზე. საიდუმლოებები მხოლოდ სერვერზეა.
2. Image, Video, Avatar, Motion, Remix სერვისები რეალურად აგენერირებენ Higgsfield-ით, ფასის წინასწარი ჩვენებით და სწორი GEL ბილინგით/refund-ით.
3. სტუდიის UI (v39-ის მიხედვით) მუშაობს desktop-სა და მობილურზე, ქართულად.
4. Agent G ქართულ მოთხოვნას აქცევს Plan ბარათად, შემდეგ დადასტურებად და შედეგად. ყველა სერვისი ჩატიდან ხელმისაწვდომია.
5. Project → მონტაჟი → MP4 (voiceover + მუსიკა + ქართული სუბტიტრები + watermark) მუშაობს end-to-end მინიმუმ ერთ შაბლონზე.
6. ყველა ტესტი მწვანეა. აუდიტი და ფაზების ანგარიშები `docs/`-შია.

---

## 11. რა სჭირდება GG-ს (Claude Code არ ელოდება, აქამდე აკეთებს იმას, რაც შეუძლია)

- Higgsfield Console-ში dev + prod API key და შევსებული ბალანსი.
- GEL-ის მარჟა და კურსის წყარო (default: `usd × NBG კურსი × 1.35`, კონფიგში).
- რომელი მოდელები ჩაირთოს პირველ ტალღაში (default: Soul 2, Nano Banana, Kling 3 std/pro, Seedance 2.5, Kling 3 Motion Control, Soul ID).
- ლოგოს მასტერ-ფაილი.

---

### Claude Code-ში ჩასაწერი საწყისი ბრძანება

```
წაიკითხე docs/MYAVATAR_STUDIO_BRIEF.md მთლიანად. დაიწყე §1 აუდიტით და Phase 0-ით
(Higgsfield MCP + API key + smoke test). Phase 0-ის ბოლოს გაჩერდი და მომეცი ანგარიში.
საცნობარო UI ფაილები docs/reference/-შია და მხოლოდ UX-ის ეტალონია, მათი ლოგიკა არ გადმოიტანო.
```
