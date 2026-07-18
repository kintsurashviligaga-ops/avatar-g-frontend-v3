import { parsePhotoEditSliders } from './photoEditSliders';

describe('parsePhotoEditSliders — natural-language colour-grade edits drive the photo sliders', () => {
  it('brightness — verbs + explicit value (either word order)', () => {
    expect(parsePhotoEditSliders('brighten it')!.brightness).toBe(130);
    expect(parsePhotoEditSliders('გააღიავე')!.brightness).toBe(130);
    expect(parsePhotoEditSliders('make it much brighter')!.brightness).toBe(160);
    expect(parsePhotoEditSliders('darken')!.brightness).toBe(70);
    expect(parsePhotoEditSliders('темнее')!.brightness).toBe(70);
    expect(parsePhotoEditSliders('brightness 150%')!.brightness).toBe(150);
    expect(parsePhotoEditSliders('set brightness to 250')!.brightness).toBe(200); // clamped to 0–200
  });

  it('contrast — more / less / explicit (ka/en/ru)', () => {
    expect(parsePhotoEditSliders('add contrast')!.contrast).toBe(130);
    expect(parsePhotoEditSliders('კონტრასტი მოუმატე')!.contrast).toBe(130);
    expect(parsePhotoEditSliders('контрастнее')!.contrast).toBe(130);
    expect(parsePhotoEditSliders('less contrast')!.contrast).toBe(75);
    expect(parsePhotoEditSliders('contrast 120%')!.contrast).toBe(120);
  });

  it('saturation — black&white forces 0, saturate/less, explicit', () => {
    expect(parsePhotoEditSliders('make it black and white')!.saturation).toBe(0);
    expect(parsePhotoEditSliders('შავ-თეთრი')!.saturation).toBe(0);
    expect(parsePhotoEditSliders('черно-белый')!.saturation).toBe(0);
    expect(parsePhotoEditSliders('saturate')!.saturation).toBe(150);
    expect(parsePhotoEditSliders('ფერები მოუმატე')!.saturation).toBe(150);
    expect(parsePhotoEditSliders('saturation 80%')!.saturation).toBe(80);
  });

  it('temperature — warmer / cooler / explicit signed', () => {
    expect(parsePhotoEditSliders('warmer')!.temperature).toBe(45);
    expect(parsePhotoEditSliders('გაათბე')!.temperature).toBe(45);
    expect(parsePhotoEditSliders('cooler')!.temperature).toBe(-45);
    expect(parsePhotoEditSliders('холоднее')!.temperature).toBe(-45);
    expect(parsePhotoEditSliders('temperature -30')!.temperature).toBe(-30);
  });

  it('combines multiple grade adjustments in one command', () => {
    const c = parsePhotoEditSliders('brighten and add more contrast and make it warmer');
    expect(c).toEqual({ brightness: 130, contrast: 130, temperature: 45 });
  });

  it('returns null for prose with no grade intent; caps pathological input', () => {
    expect(parsePhotoEditSliders('hello there')).toBeNull();
    expect(parsePhotoEditSliders('')).toBeNull();
    expect(parsePhotoEditSliders('გააღიავე'.repeat(50000))!.brightness).toBe(130);
  });
});
