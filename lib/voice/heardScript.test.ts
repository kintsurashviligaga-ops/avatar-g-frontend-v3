import { isMisheardScript, toCallScript } from './heardScript';
import { judgeUtterance } from './spokenYes';

describe('Georgian heard in Hindi letters is written back in Georgian ones (GG 2026-10-26)', () => {
  it('turns the short words a call hears into the Georgian ones they were', () => {
    expect(toCallScript('क्रेटा')).toBe('კრეტა');
    expect(toCallScript('की')).toBe('კი');
    expect(toCallScript('कि')).toBe('კი');
    expect(toCallScript('हो')).toBe('ჰო');
    expect(toCallScript('कारगी')).toBe('კარგი');
    expect(toCallScript('कार्गी')).toBe('კარგი');
    expect(toCallScript('काई')).toBe('კაი');
    expect(toCallScript('दियाख़')).toBe('დიახ');
  });

  it('reads the dotted letters, the marks and the digits', () => {
    expect(toCallScript('ख़ो')).toBe('ხო');
    expect(toCallScript('ख़ो')).toBe('ხო'); // the precomposed ख़ the transcription may send
    expect(toCallScript('ग़ा')).toBe('ღა');
    expect(toCallScript('ज़')).toBe('ზა');
    expect(toCallScript('मंगल')).toBe('მანგალ');
    expect(toCallScript('५')).toBe('5');
  });

  it('leaves everything that is not Devanagari as it is', () => {
    for (const t of ['კი, გააკეთე', 'yes please', 'да, давай', '', '  ', 'ok 👍']) expect(toCallScript(t)).toBe(t);
    expect(toCallScript('ok की')).toBe('ok კი');
    expect(toCallScript(undefined as unknown as string)).toBe('');
  });

  it('lets a spoken yes in Hindi letters count, and a no stays a no', () => {
    expect(judgeUtterance('की')).toBe('yes');
    expect(judgeUtterance('हो')).toBe('yes');
    expect(judgeUtterance('की, कारगी')).toBe('yes');
    expect(judgeUtterance('आरा')).toBe('no'); // „არა"
    expect(judgeUtterance('क्रेटा')).toBe('unclear');
  });

  it('turns Arabic and Persian letters into Georgian ones (GG 2026-10-26 06:23Z: „კი" came back as „كي?")', () => {
    expect(toCallScript('كي?')).toBe('კი?');
    expect(toCallScript('كي؟')).toBe('კი?');
    expect(toCallScript('هو')).toBe('ჰო');
    expect(toCallScript('خو')).toBe('ხო');
    expect(toCallScript('دياخ')).toBe('დიახ');
    expect(toCallScript('كاي')).toBe('კაი');
    expect(toCallScript('کارگی')).toBe('კარგი'); // Persian ک and ی
    expect(toCallScript('وا')).toBe('ვა');
    expect(toCallScript('\uFEDB\uFEF2')).toBe('კი'); // presentation forms
    expect(toCallScript('كَي')).toBe('კაი'); // a written vowel mark
  });

  it('turns Armenian letters into Georgian ones', () => {
    expect(toCallScript('կի')).toBe('კი');
    expect(toCallScript('հո')).toBe('ჰო');
    expect(toCallScript('Կարգի')).toBe('კარგი');
    expect(toCallScript('դիախ')).toBe('დიახ');
    expect(toCallScript('ուր')).toBe('ურ');
  });

  it('knows which words came in an alphabet the call never speaks', () => {
    for (const t of ['की', 'كي?', 'կի', 'ok كي']) expect(isMisheardScript(t)).toBe(true);
    for (const t of ['კი?', 'yes?', 'да?', '', undefined as unknown as string]) expect(isMisheardScript(t)).toBe(false);
  });

  it('a yes heard in another alphabet counts even with that language\'s question mark; a real question still does not', () => {
    expect(judgeUtterance('كي?')).toBe('yes');
    expect(judgeUtterance('كي؟')).toBe('yes');
    expect(judgeUtterance('կի՞')).toBe('yes');
    expect(judgeUtterance('آرا?')).toBe('no'); // „არა"
    expect(judgeUtterance('კი?')).toBe('unclear');
    expect(judgeUtterance('ok?')).toBe('unclear');
  });
});
