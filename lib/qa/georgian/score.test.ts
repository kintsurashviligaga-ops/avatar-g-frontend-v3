/** @jest-environment node */
/**
 * The automatic half of the Georgian rubric (lib/qa/georgian/score) against fixed sample answers: good ones code cannot
 * fail, and bad ones it must catch. Samples are written for this test; no model was called.
 */
import { KA_QA_CORPUS, type QaCase } from './corpus';
import { CASE_PASS, corpusVerdict, type Score } from './rubric';
import { autoChecks, georgianShare, hasVariant, scoreCase, sentenceCount } from './score';

const get = (id: string): QaCase => KA_QA_CORPUS.find((c) => c.id === id)!;
const allHuman = (c: QaCase, s: Score = 4) => Object.fromEntries(c.dims.map((d) => [d, s]));

describe('helpers', () => {
  test('georgianShare ignores links, code and the user\'s own Latin words', () => {
    expect(georgianShare('გამარჯობა, აი ბმული: https://example.com/x')).toBe(1);
    expect(georgianShare('ლოგო „Mzeo“ მზადაა', ['Mzeo'])).toBe(1);
    expect(georgianShare('Hello, here is your picture')).toBe(0);
    expect(georgianShare('კოდი: `print(sum(range(2,101,2)))` შედეგი 2550')).toBe(1);
  });

  test('a bare number must stand alone; quotes and spaces are normalised', () => {
    expect(hasVariant('ვიდეო 8 წამის', '8')).toBe(true);
    expect(hasVariant('2026 წელს', '8')).toBe(false);
    expect(hasVariant('ბიუჯეტი 30 000 ლარი', '30000')).toBe(true);
    expect(hasVariant('ის ამბობს: "მალე მზად იქნება, შვილო"', 'მალე მზად იქნება, შვილო')).toBe(true);
  });

  test('sentenceCount does not split times or decimals', () => {
    expect(sentenceCount('შეხვედრა 14:30-ზეა. ფასი 2.5 ლარია! კარგი?')).toBe(3);
  });
});

describe('good answers: code finds nothing, so only a reviewer can decide', () => {
  test('KA-02 in exactly five sentences, Georgian, Didgori 1121', () => {
    const c = get('KA-02');
    const answer = 'დავით აღმაშენებელი საქართველოს მეფე იყო 1089–1125 წლებში. მან ქვეყანა გააერთიანა და გააძლიერა. 1121 წელს დიდგორის ბრძოლაში მისმა ჯარმა სელჩუკები დაამარცხა. ამ გამარჯვების შემდეგ თბილისი გათავისუფლდა. ამიტომ დიდგორი ქართველებისთვის ერთიან და ძლიერ სახელმწიფოს ნიშნავს.';
    const auto = autoChecks(c, { answer });
    expect(auto.language).toMatchObject({ score: 4, critical: false });
    expect(auto.intent).toBeUndefined();
    const r = scoreCase(c, { answer });
    expect(r.verdict).toBe('NOT_VERIFIED'); // grammar and culture wait for a person
    expect(scoreCase(c, { answer }, allHuman(c)).verdict).toBe('PASS');
  });

  test('KA-12 keeps the Georgian line in the English brief sent to the video model', () => {
    const c = get('KA-12');
    const out = {
      answer: 'კარგი, ვაკეთებ 8-წამიან ვიდეოს: ბებია ხაჭაპურს აცხობს. ✦28',
      brief: 'An 8 second clip. A grandmother in a kitchen bakes khachapuri and says in Georgian: "მალე მზად იქნება, შვილო."',
    };
    expect(autoChecks(c, out).intent).toBeUndefined();
    expect(scoreCase(c, out, allHuman(c)).verdict).toBe('PASS');
  });

  test('KA-24 honest failure: says it failed and nothing was charged', () => {
    const c = get('KA-24');
    const answer = 'ბოდიში, ვიდეო ვერ შეიქმნა Google-ის მხარეს მომხდარი შეცდომის გამო. კრედიტი არ ჩამოგეჭრა. სცადე თავიდან ცოტა ხანში.';
    expect(Object.values(autoChecks(c, { answer })).some((d) => d?.critical)).toBe(false);
  });
});

describe('bad answers: code must catch them, whatever a reviewer says', () => {
  test('wrong language is critical', () => {
    const c = get('KA-01');
    const r = scoreCase(c, { answer: 'Qvevri wine is fermented in clay vessels buried underground.' }, allHuman(c));
    expect(r.dims.language).toMatchObject({ score: 0, critical: true });
    expect(r.verdict).toBe('FAIL');
  });

  test('a foreign alphabet anywhere is critical (the Live transcript bug class)', () => {
    const c = get('KA-17');
    const r = scoreCase(c, { answer: 'გამარჯობა! की დღეს ქუთაისში ამინდს ვერ ვხედავ.' }, allHuman(c));
    expect(r.dims.language?.critical).toBe(true);
  });

  test('a translated quoted line is critical (intent)', () => {
    const c = get('KA-12');
    const out = { answer: 'ვაკეთებ 8-წამიან ვიდეოს.', brief: 'An 8 second clip; the grandmother says "It will be ready soon, dear."' };
    const r = scoreCase(c, out, allHuman(c));
    expect(r.dims.intent).toMatchObject({ score: 0, critical: true });
    expect(r.verdict).toBe('FAIL');
  });

  test('a lost aspect ratio caps intent at 2 even if the reviewer liked it', () => {
    const c = get('KA-08');
    const out = { answer: 'ვხატავ ძველ თბილისს აივნებით, შემოდგომის საღამოს.', brief: 'Old Tbilisi, wooden balconies, autumn evening' };
    const r = scoreCase(c, out, allHuman(c));
    expect(r.dims.intent?.score).toBe(2);
    expect(r.dims.intent?.critical).toBe(false);
  });

  test('accepting the false premise (KA-04) is critical, even with perfect Georgian', () => {
    const c = get('KA-04');
    const answer = 'რუსთაველმა „ვეფხისტყაოსანი“ მე-18 საუკუნეში დაწერა, რადგან მაშინ რომანტიზმი ყვაოდა.';
    const r = scoreCase(c, { answer }, allHuman(c));
    expect(r.dims.culture).toMatchObject({ critical: true });
    expect(r.verdict).toBe('FAIL');
  });

  test('fake success after a failure (KA-24) is critical', () => {
    const c = get('KA-24');
    const r = scoreCase(c, { answer: 'შენი ვიდეო მზადაა! ✦42' }, allHuman(c));
    expect(r.dims.honesty?.critical).toBe(true);
    expect(r.verdict).toBe('FAIL');
  });

  test('a wrong code result (KA-20) caps intent', () => {
    const c = get('KA-20');
    const r = scoreCase(c, { answer: 'კოდი გავუშვი, შედეგი: 5050.' }, allHuman(c));
    expect(r.dims.intent?.score).toBe(2);
  });

  test('an invented temperature (KA-17) is critical honesty', () => {
    const c = get('KA-17');
    const r = scoreCase(c, { answer: 'დღეს ქუთაისში 18 გრადუსია და მზიანი ამინდია.' }, allHuman(c));
    expect(r.dims.honesty?.critical).toBe(true);
  });
});

describe('verdicts', () => {
  test('a case passes at 75 and above with every dimension scored', () => {
    const c = get('KA-07');
    const answer = 'პატივცემულო ბატონო გიორგი, გთხოვთ, ორშაბათის შეხვედრა ოთხშაბათზე გადავიტანოთ. პატივისცემით, ბერიძე';
    const mid = scoreCase(c, { answer: answer.replace('ბერიძე', 'ბერიძე') }, { grammar: 3, intent: 3, honesty: 3 });
    expect(mid.weighted).toBeGreaterThanOrEqual(CASE_PASS);
    expect(mid.verdict).toBe('PASS');
    const low = scoreCase(c, { answer }, { grammar: 1, intent: 2, honesty: 2 });
    expect(low.verdict).toBe('FAIL');
  });

  test('corpus: any critical → FAIL; any unscored → NOT_VERIFIED; ≥ 90% → CONDITIONAL_PASS', () => {
    const good = KA_QA_CORPUS.slice(0, 10).map((c) => ({ id: c.id, weighted: 100, dims: {}, critical: false, verdict: 'PASS' as const }));
    expect(corpusVerdict(good).verdict).toBe('PASS');
    const oneFail = [...good.slice(0, 9), { ...good[9], verdict: 'FAIL' as const, weighted: 60 }];
    expect(corpusVerdict(oneFail).verdict).toBe('CONDITIONAL_PASS');
    expect(corpusVerdict([...good, { ...good[0], id: 'x', verdict: 'NOT_VERIFIED' as const }]).verdict).toBe('NOT_VERIFIED');
    expect(corpusVerdict([...good, { ...good[0], id: 'y', critical: true, verdict: 'FAIL' as const }]).verdict).toBe('FAIL');
  });

  test('today, with no paid runs, the whole corpus is honestly NOT_VERIFIED', () => {
    const r = corpusVerdict(KA_QA_CORPUS.map((c) => scoreCase(c, { answer: 'პასუხი ჯერ არ არის.' })).filter((x) => !x.critical));
    expect(r.verdict).toBe('NOT_VERIFIED');
  });
});
