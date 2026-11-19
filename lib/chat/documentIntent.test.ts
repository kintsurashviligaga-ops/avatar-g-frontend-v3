import { detectDocumentIntent } from './documentIntent';

describe('detectDocumentIntent', () => {
  it.each([
    'შემიქმენი 5-გვერდიანი ქართული PDF ანგარიში, ლამაზი ცხრილით და ერთი გრაფიკით. მაჩვენე და ჩამომატვირთინე.',
    'დამიწერე ბიზნეს გეგმა PDF-ად',
    'მომიმზადე PDF ანგარიში საქართველოს ტურიზმზე',
    'Create a 3-page PDF report about solar energy',
    'write me a pdf with a table of the planets',
    'Сделай PDF отчёт о продажах на 2 страницы',
    'ანგარიში PDF ფორმატში გამიკეთე',
  ])('routes „%s"', (t) => expect(detectDocumentIntent(t)).toEqual({ fromLastReply: false }));

  it.each([
    'ეს PDF-ად მომეცი',
    'make this a PDF',
    'сохрани это в pdf',
  ])('„%s" is made from the last reply', (t) => expect(detectDocumentIntent(t)).toEqual({ fromLastReply: true }));

  it.each([
    'რა წერია ამ PDF-ში?',
    'summarize this pdf',
    'what is a PDF?',
    'როგორ შევქმნა PDF?',
    'შემიქმენი PDF პრეზენტაცია 10 სლაიდით',
    'დამიწერე ანგარიში ტურიზმზე',
    'pdf',
    '',
    null,
  ])('leaves „%s" to the chat', (t) => expect(detectDocumentIntent(t)).toBeNull());
});
