import { toCallScript } from './heardScript';
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
});
