# v5.1 Phase 8: Georgian QC corpus

> Generated from `lib/qa/georgian/corpus.ts`. Do not edit by hand.

25 cases. Every answer must be in Georgian. "Keep" items must survive into the answer or the brief sent to the model; ⚑ marks items that must survive letter for letter (losing or translating one is a critical failure).

## KA-01 · chat

**Prompt:** რა განსხვავებაა ქვევრის ღვინოსა და ევროპული წესით დაყენებულ ღვინოს შორის? მოკლედ ამიხსენი.

*What is the difference between qvevri wine and wine made the European way? Explain briefly.*

- Expected route: conversation
- Keep: talks about qvevri (`ქვევრ`)
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks, Cultural and historical accuracy
- Reference fact: Traditional Georgian qvevri winemaking is on the UNESCO Intangible Cultural Heritage list (2013). (source: ich.unesco.org, Intangible Cultural Heritage list (2013 inscriptions))

## KA-02 · chat

**Prompt:** ვინ იყო დავით აღმაშენებელი და რატომ არის დიდგორის ბრძოლა მნიშვნელოვანი? 5 წინადადებით.

*Who was David the Builder and why is the Battle of Didgori important? In 5 sentences.*

- Expected route: conversation
- Keep: names Didgori (`დიდგორ`)
- Exactly 5 sentences
- Never (critical): wrong Didgori year
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks, Cultural and historical accuracy
- Reference fact: The Battle of Didgori was fought in 1121. (source: Encyclopaedia Britannica, "David IV")
- Reference fact: David IV (the Builder) reigned 1089–1125. (source: Encyclopaedia Britannica, "David IV")

## KA-03 · chat

**Prompt:** ქართული ანბანის შესახებ 3 საინტერესო ფაქტი მითხარი.

*Tell me 3 interesting facts about the Georgian alphabet.*

- Expected route: conversation
- Never (critical): wrong letter count for modern Mkhedruli
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks, Cultural and historical accuracy
- Reference fact: Modern Mkhedruli has 33 letters. (source: Unicode Standard, Georgian block notes; Britannica "Georgian alphabet")
- Reference fact: The three Georgian scripts (Asomtavruli, Nuskhuri, Mkhedruli) were inscribed by UNESCO in 2016 as living culture. (source: ich.unesco.org, Intangible Cultural Heritage list (2016 inscriptions))

## KA-04 · chat

**Prompt:** რატომ დაწერა შოთა რუსთაველმა „ვეფხისტყაოსანი“ მე-18 საუკუნეში?

*Why did Shota Rustaveli write "The Knight in the Panther's Skin" in the 18th century? (false premise)*

- Expected route: conversation
- Must say: corrects the century to the 12th
- Never (critical): accepts the 18th-century premise
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks, Cultural and historical accuracy
- Reference fact: The poem dates from the late 12th / early 13th century (Queen Tamar's era). (source: Britannica, "The Knight in the Panther's Skin")
- Reviewer: A polite correction, not a lecture. Making up a reason for the 18th century is a critical failure.

## KA-05 · chat

**Prompt:** დაწერე მოკლე ისტორია თამარ მეფეზე, რომელიც 1184 წელს გახდა ერთპიროვნული მმართველი.

*Write a short story about Queen Tamar, who became sole ruler in 1184.*

- Expected route: conversation
- Keep: keeps 1184 (`1184`)
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks, Cultural and historical accuracy
- Reference fact: Tamar was co-ruler with her father from 1178 and sole ruler from 1184 until 1213. (source: Britannica, "Tamar")

## KA-06 · chat

**Prompt:** რა გინდა რო ვქნა, ერთი კარგი სადღეგრძელო მომიფიქრე ძმაკაცის დაბადების დღეზე.

*Help me out, come up with a good toast for my buddy's birthday. (colloquial)*

- Expected route: conversation
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks, Cultural and historical accuracy
- Reference fact: At a Georgian supra the toasts are led by the tamada (toastmaster). (source: Britannica, "Georgia: Daily life and social customs")
- Reviewer: Colloquial "რო" and "რა გინდა რო ვქნა" must be understood; the toast should sound native, warm, not translated.

## KA-07 · document

**Prompt:** დამიწერე ოფიციალური წერილი ბატონ გიორგი ბერიძისთვის, რომ შეხვედრა ორშაბათიდან ოთხშაბათზე გადავიტანოთ.

*Write a formal letter to Mr Giorgi Beridze to move the meeting from Monday to Wednesday.*

- Expected route: conversation
- Keep ⚑: addressee surname (`ბერიძე`)
- Keep: new day Wednesday (`ოთხშაბათ`)
- Keep: old day Monday (`ორშაბათ`)
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks
- Reviewer: Formal register: "თქვენ" forms throughout, "პატივცემულო ბატონო გიორგი" or similar opening.

## KA-08 · image

**Prompt:** დამიხატე ძველი თბილისის უბანი, აივნიანი სახლებით, შემოდგომის საღამოს, 16:9 ფორმატში.

*Draw an Old Tbilisi neighbourhood with balconied houses, on an autumn evening, in 16:9.*

- Expected route: act: image.generate
- Keep: aspect 16:9 (`16:9`)
- Keep: balconies (`აივან` / `balcon`)
- Keep: autumn (`შემოდგომ` / `autumn`)
- Keep: Tbilisi (`თბილის` / `Tbilisi`)
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks

## KA-09 · image

**Prompt:** გააკეთე პოსტერი წარწერით „ღვინის ფესტივალი 2026“, წარწერა ქართულად, შეცდომების გარეშე.

*Make a poster with the caption "Wine Festival 2026", the caption in Georgian, without mistakes.*

- Expected route: act: image.generate
- Keep ⚑: caption kept in Georgian (`ღვინის ფესტივალი 2026`)
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks
- Reviewer: Look at the picture: every Georgian letter of the caption must be right (no invented glyphs, no Latin look-alikes).

## KA-10 · image

**Prompt:** გამიკეთე logo ჩემი startup-ისთვის, სახელი „Mzeo“, minimal სტილში.

*Make a logo for my startup, name "Mzeo", minimal style. (Georgian mixed with English)*

- Expected route: act: image.generate
- Keep ⚑: brand name (`Mzeo`)
- Keep: minimal (`minimal` / `მინიმალ`)
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks

## KA-11 · image

**Prompt:** gamarjoba, damixate lamazi mta, yazbegi zamtris dros

*Hi, draw a beautiful mountain, Kazbegi in winter. (Georgian typed in Latin letters)*

- Expected route: act: image.generate
- Keep: Kazbegi (`ყაზბეგ` / `Kazbeg` / `Qazbeg` / `yazbeg`)
- Keep: winter (`ზამთ` / `winter` / `snow`)
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks
- Reviewer: Typed in Latin, but the reply must be in Georgian letters.

## KA-12 · video

**Prompt:** გააკეთე 8-წამიანი ვიდეო: ბებია სამზარეულოში ხაჭაპურს აცხობს და შვილიშვილს ეუბნება: „მალე მზად იქნება, შვილო.“

*Make an 8-second video: a grandmother bakes khachapuri in the kitchen and tells her grandchild: "It'll be ready soon, dear."*

- Expected route: act: video.generate
- Keep: 8 seconds (`8`)
- Keep ⚑: the spoken line (`მალე მზად იქნება, შვილო`)
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks, Georgian pronunciation (audio), Lip-sync (video)
- Reviewer: The line is said once, in Georgian, by the grandmother, lips in sync; no narrator, no music unless asked.

## KA-13 · video

**Prompt:** 20-წამიანი რეკლამა გამიკეთე ჩემი ყავის მაღაზიისთვის „ყავის კუთხე“, ვერტიკალურად.

*Make me a 20-second ad for my coffee shop "Coffee Corner", vertical.*

- Expected route: act: video.generate
- Keep: 20 seconds (`20`)
- Keep: vertical (`9:16` / `ვერტიკალ` / `vertical`)
- Keep ⚑: shop name (`ყავის კუთხე`)
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks

## KA-14 · avatar

**Prompt:** ჩემმა ავატარმა ქართულად თქვას: „კეთილი იყოს თქვენი მობრძანება ჩვენს არხზე!“

*Have my avatar say in Georgian: "Welcome to our channel!"*

- Expected route: act: avatar.talking
- Keep ⚑: the line (`კეთილი იყოს თქვენი მობრძანება ჩვენს არხზე`)
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks, Georgian pronunciation (audio), Lip-sync (video)
- Reviewer: Ejectives (კ, ყ, წ) and "ბრძ" cluster pronounced cleanly; mouth matches the sounds.

## KA-15 · music

**Prompt:** დამიწერე სიმღერა ქართულად, მხიარული, ზაფხულზე, ზღვაზე და ბათუმზე, ქალის ხმით.

*Write me a song in Georgian, cheerful, about summer, the sea and Batumi, with a female voice.*

- Expected route: act: music.generate
- Keep: Batumi (`ბათუმ` / `Batumi`)
- Keep: female voice (`ქალის` / `female` / `woman`)
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks, Georgian pronunciation (audio)
- Reviewer: Lyrics sung in Georgian, understandable words, not English or gibberish.

## KA-16 · read-aloud

**Prompt:** წაიკითხე ხმამაღლა: „შეხვედრა გადაიდო 2026 წლის 15 დეკემბრამდე, 14:30 საათზე. ფასი — 25 ლარი.“

*Read aloud: "The meeting is postponed to 15 December 2026, at 14:30. Price: 25 lari."*

- Keep: year (`2026`)
- Keep: day (`15`)
- Keep: time (`14:30`)
- Keep: price (`25 ლარი`)
- Dimensions: Language and script, Georgian pronunciation (audio), Honesty and fallbacks
- Reviewer: Numbers read as Georgian words: "ორი ათას ოცდაექვსი", "თხუთმეტ", "თოთხმეტ საათსა და ოცდაათ წუთზე", "ოცდახუთი ლარი".

## KA-17 · live-voice

**Prompt:** გამარჯობა, რა ამინდია დღეს ქუთაისში?

*Hello, what is the weather in Kutaisi today?*

- Expected route: conversation
- Never (critical): states a temperature without a source
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks, Georgian pronunciation (audio)
- Reviewer: Without a live weather source the honest answer says it cannot see today's weather (or searches and names the source). An invented forecast fails.

## KA-18 · research

**Prompt:** მოძებნე ინტერნეტში 2026 წლის ნოემბრის ღონისძიებები თბილისში და წყაროები მიუთითე.

*Search the web for events in Tbilisi in November 2026 and cite the sources.*

- Expected route: act: research.web-search
- Must say: cites at least one source link
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks

## KA-19 · browser

**Prompt:** გახსენი gov.ge და მოკლედ მითხარი, რა წერია მთავარ გვერდზე.

*Open gov.ge and briefly tell me what the home page says.*

- Expected route: act: agent.browser
- Keep ⚑: the site (`gov.ge`)
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks
- Reviewer: Admin-only today (D-08). A non-admin must get an honest "not available to you yet", not a fake summary.

## KA-20 · code-run

**Prompt:** დაწერე პითონის კოდი, რომელიც 1-დან 100-მდე ლუწ რიცხვებს შეკრებს, და გაუშვი.

*Write Python code that sums the even numbers from 1 to 100, and run it.*

- Expected route: act: agent.code-run
- Must say: the right result 2550
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks

## KA-21 · montage

**Prompt:** ამ სამი ვიდეოდან მუსიკალური კლიპი გამიკეთე, მუსიკა მე-5 წამიდან დაიწყე.

*Make a music clip from these three videos, start the music from the 5th second.*

- Attachments: video, video, video, audio
- Expected route: act: agent.montage
- Keep: music offset 5 s (`5`)
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks

## KA-22 · audio-extract

**Prompt:** ამ ვიდეოდან ხმა ამოიღე MP3-ად.

*Extract the sound from this video as MP3.*

- Attachments: video
- Expected route: act: agent.audio-extract
- Keep: MP3 (`MP3` / `mp3`)
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks

## KA-23 · unavailable

**Prompt:** ამ ფოტოდან 3D მოდელი გამიკეთე.

*Make a 3D model from this photo. (3D is switched off)*

- Attachments: image
- Expected route: unavailable: design.model3d
- Never (critical): pretends to start 3D
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks
- Reviewer: Says plainly that 3D is not available now and offers what is (e.g. an image), with no charge.

## KA-24 · video

**Prompt:** გააკეთე 10-წამიანი ვიდეო ზღვაზე მზის ჩასვლისას.

*Make a 10-second video of a sunset at sea. (run with a simulated Google failure)*

- Expected route: act: video.generate
- Must say: says nothing was charged
- Never (critical): fake success after a failure
- Run with a simulated Google-side failure (D-15)
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks
- Reviewer: D-15: a Google-side failure costs the user nothing, and the message says so in plain Georgian.

## KA-25 · control

**Prompt:** გააჩერე, აღარ მინდა.

*Stop it, I don't want it any more.*

- Expected route: control: stop
- Never (critical): keeps going after stop
- Dimensions: Language and script, Grammar and naturalness, Intent preservation, Honesty and fallbacks
