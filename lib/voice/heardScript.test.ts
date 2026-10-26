import { isMisheardScript, latinAsGeorgian, toCallScript } from './heardScript';
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

  it('turns Korean letters into Georgian ones (GG 2026-10-26 09:29Z: an answer came back as „대자.")', () => {
    expect(toCallScript('대자.')).toBe('დეჯა.');
    expect(toCallScript('끼')).toBe('კი');
    expect(toCallScript('키')).toBe('ქი');
    expect(toCallScript('기')).toBe('გი');
    expect(toCallScript('호')).toBe('ჰო');
    expect(toCallScript('디아흐')).toBe('დიაჰ'); // ㅡ is the vowel Korean adds, not a sound of the word
    expect(toCallScript('까르기')).toBe('კარგი');
    expect(toCallScript('아라')).toBe('არა');
    expect(toCallScript('빌리')).toBe('ბილი');
    expect(toCallScript('ok 끼?')).toBe('ok კი?');
    expect(toCallScript('ㅋ')).toBe(''); // a loose letter, not a syllable
  });

  it('knows which words came in an alphabet the call never speaks', () => {
    for (const t of ['की', 'كي?', 'կի', 'ok كي', '대자.', 'キ', '是', 'כן', 'ναι', 'ใช่']) expect(isMisheardScript(t)).toBe(true);
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

  it('a yes in Korean letters counts, with plain and ejective stops read as one; a no stays a no; „대자." is neither', () => {
    for (const t of ['끼', '키', '기', '기?', '호', '디아흐', '까르기', '가르기', '카이', '끼, 까르기']) expect(judgeUtterance(t)).toBe('yes');
    for (const t of ['아라', '아라, 모이짜데']) expect(judgeUtterance(t)).toBe('no');
    for (const t of ['대자.', '가', '고양이']) expect(judgeUtterance(t)).toBe('unclear');
    // The loose reading is only for words that came in another alphabet: Georgian ones are read as written.
    expect(judgeUtterance('გი')).toBe('unclear');
  });

  it('reads Georgian written in Latin letters by sound, and leaves captions in Latin (GG 2026-10-26 07:13Z: „da-adasture.")', () => {
    expect(latinAsGeorgian('daadasture')).toBe('დაადასტურე');
    expect(latinAsGeorgian('ki')).toBe('კი');
    expect(latinAsGeorgian("k'i")).toBe('კი');
    expect(latinAsGeorgian('Diakh')).toBe('დიახ');
    expect(latinAsGeorgian('diax')).toBe('დიახ');
    expect(latinAsGeorgian('gaushvi')).toBe('გაუშვი');
    expect(latinAsGeorgian('tsavedit')).toBe('ცავედიტ');
    expect(latinAsGeorgian('gaušvi')).toBe('გაუშვი');
    expect(latinAsGeorgian('kʼargí')).toBe('კარგი');
    for (const t of ['კი', 'да', '5', '']) expect(latinAsGeorgian(t)).toBe(t);
    expect(latinAsGeorgian(undefined as unknown as string)).toBe('');
    expect(toCallScript('da-adasture.')).toBe('da-adasture.');
    expect(isMisheardScript('da-adasture.')).toBe(false);
  });
});
