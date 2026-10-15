/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('../ai/llmText', () => ({ llmText: jest.fn(async () => null) }));

import { llmText } from '../ai/llmText';
import { briefNamesSettingOrWardrobe, briefRestagesPhoto, parsePersonVerdict, storyFeaturesPerson } from './storyPerson';

const llm = llmText as jest.MockedFunction<typeof llmText>;

describe('parsePersonVerdict', () => {
  it.each([
    ['{"person": true}', true],
    ['{"person":false}', false],
    ['```json\n{"person": false}\n```', false],
    ['YES', true],
    ['no.', false],
    ['true', true],
  ])('%p → %p', (raw, want) => {
    expect(parsePersonVerdict(raw)).toBe(want);
  });

  it.each([[null], [undefined], [''], ['   '], ['{"person": "no"}'], ['{"human": false}'], ['maybe'], ['no person, but a cat']])(
    '%p → null (unknown keeps the old behaviour)',
    (raw) => {
      expect(parsePersonVerdict(raw as string | null | undefined)).toBeNull();
    },
  );
});

describe('storyFeaturesPerson', () => {
  beforeEach(() => llm.mockReset());

  it('asks Gemini once, as JSON at temperature 0, and reads the verdict', async () => {
    llm.mockResolvedValueOnce('{"person": false}');
    await expect(storyFeaturesPerson('A red paper boat on a pond, a grey cat on the dock')).resolves.toBe(false);
    expect(llm).toHaveBeenCalledTimes(1);
    expect(llm.mock.calls[0]![0]).toMatchObject({ json: true, temperature: 0 });
    expect(llm.mock.calls[0]![0].system).toMatch(/HUMAN/);
  });

  it('an empty brief asks nothing', async () => {
    await expect(storyFeaturesPerson('   ')).resolves.toBeNull();
    expect(llm).not.toHaveBeenCalled();
  });

  it('a miss or a throw is null, never an exception', async () => {
    llm.mockResolvedValueOnce(null);
    await expect(storyFeaturesPerson('a singer on a stage')).resolves.toBeNull();
    llm.mockRejectedValueOnce(new Error('boom'));
    await expect(storyFeaturesPerson('a singer on a stage')).resolves.toBeNull();
  });

  it('cuts a very long brief before sending it', async () => {
    llm.mockResolvedValueOnce('{"person": true}');
    await storyFeaturesPerson('x'.repeat(5000));
    expect(llm.mock.calls[0]![0].user.length).toBe(1500);
  });
});

// GG's advert brief of 2026-10-15 (16:49Z), as the studio sent it: the re-stage check missed on Production at 18:17Z and
// the storyboard opened on the raw selfie instead of the actor in black on black.
const AD_BRIEF =
  'შექმენი 9:16 ფორმატის სარეკლამო ვიდეო: მსახიობი შავ ფონზე, შავ მაისურში და შავ პიჯაკში, ლაპარაკობს და პრეზენტაციას ' +
  'აკეთებს. კადრში არაფერი არ ჩანს მსახიობის გარდა, რომელიც ჟესტებით, ეფექტურად და შთამბეჭდავად ლაპარაკობს.';

describe('the classifiers leave room for the answer', () => {
  beforeEach(() => llm.mockReset());

  it('both ask for more than a thinking model can spend before it writes (20 ran out on Production)', async () => {
    llm.mockResolvedValue('{"person": true}');
    await storyFeaturesPerson('a singer on a stage');
    llm.mockResolvedValue('{"restage": true}');
    await briefRestagesPhoto(AD_BRIEF);
    for (const call of llm.mock.calls) expect(call[0].maxTokens).toBeGreaterThanOrEqual(128);
  });
});

describe('briefRestagesPhoto', () => {
  beforeEach(() => llm.mockReset());

  it("reads the classifier's verdict when it gives one, both ways", async () => {
    llm.mockResolvedValueOnce('{"restage": true}');
    await expect(briefRestagesPhoto('a man talks to the camera')).resolves.toBe(true);
    llm.mockResolvedValueOnce('{"restage": false}');
    await expect(briefRestagesPhoto(AD_BRIEF)).resolves.toBe(false); // an answer stands, even against the words
  });

  it('a miss on a brief that names the clothes and the background is still a re-stage (the 18:17Z board)', async () => {
    llm.mockResolvedValueOnce(null);
    await expect(briefRestagesPhoto(AD_BRIEF)).resolves.toBe(true);
    llm.mockRejectedValueOnce(new Error('boom'));
    await expect(briefRestagesPhoto('He presents in a black jacket on a black background')).resolves.toBe(true);
    llm.mockResolvedValueOnce('maybe');
    await expect(briefRestagesPhoto('Он выступает в чёрном пиджаке на чёрном фоне')).resolves.toBe(true);
  });

  it('a miss on a brief that names neither stays unknown, so the photo stays scene 1', async () => {
    llm.mockResolvedValue(null);
    await expect(briefRestagesPhoto('მსახიობი ჟესტებით და შთამბეჭდავად ლაპარაკობს, მეორე სცენაში ხსნის აგენტის ფუნქციას')).resolves.toBeNull();
    await expect(briefRestagesPhoto('he waves at the camera and smiles, slow zoom in')).resolves.toBeNull();
  });
});

describe('briefNamesSettingOrWardrobe', () => {
  it.each([
    [AD_BRIEF],
    ['მსახიობი სტუდიაში დგას'],
    ['კაცი თეთრ პერანგში'],
    ['a woman in a red dress'],
    ['on a white backdrop'],
    ['in a studio'],
    ['мужчина в костюме'],
    ['на белом фоне'],
  ])('%p names a place or clothes', (brief) => {
    expect(briefNamesSettingOrWardrobe(brief)).toBe(true);
  });

  it.each([
    ['ტელეფონზე ლაპარაკობს'], // "on the phone": the letters of ფონზე inside another word
    ['მიკროფონი ხელში უჭირავს'],
    ['მეორე სცენა გაგრძელებაა'], // სცენა is "scene" as often as "stage"
    ['говорит по телефону у фонтана'],
    ['an address to the nation, suitable for everyone'],
    ['he smiles and waves'],
  ])('%p names neither', (brief) => {
    expect(briefNamesSettingOrWardrobe(brief)).toBe(false);
  });
});
