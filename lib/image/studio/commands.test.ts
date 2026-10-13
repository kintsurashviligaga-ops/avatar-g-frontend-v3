/** @jest-environment node */
import { imageCommand } from './commands';
import { imageRequest, fakeImage } from './testing';
import { imageQuoteTool } from './agentTool';
import { bindTools } from '@/lib/agent/tools/registry';
import { toolDeclarations } from '@/lib/agent/tools/declarations';

test.each(['ფონი შეცვალე თეთრი სტუდიით', 'Replace the background with a white studio', 'Замени фон на белую студию'])('KA/EN/RU command keeps exact words: %s', originalPrompt => {
  const result = imageCommand({ ...imageRequest(), originalPrompt, references: [{ id: 'subject', role: 'subject', asset: { kind: 'upload', path: 'owner/source.png' } }] });
  expect(result.operation).toBe('replace_background');
  expect(result.originalPrompt).toBe(originalPrompt);
});
test('unsupported command is explicit and missing identity role is not silently invented', () => {
  expect(() => imageCommand({ ...imageRequest(), originalPrompt: 'Make transparent background' })).toThrow(/unsupported/);
  expect(() => imageCommand({ ...imageRequest(), originalPrompt: 'ჩააცვი ახალი ტანსაცმელი', references: [{ id: 'style', role: 'style', asset: { kind: 'upload', path: 'owner/style.png' } }] })).toThrow(/character reference/);
});
test('the live registered image tool quotes the trusted draft only and cannot start/bill', async () => {
  const f = await fakeImage(), onImageQuote = jest.fn();
  const ctx = { userId: 'me', media: true, imageDraft: imageRequest(), imageDeps: f.deps, onImageQuote };
  const [tool] = bindTools([imageQuoteTool], ctx);
  expect(toolDeclarations([imageQuoteTool], ctx)[0]?.parameters).toBeUndefined();
  await expect(tool!.run({ confirmed: true, prompt: 'replace' })).resolves.toMatchObject({ error: 'invalid_input' });
  await expect(tool!.run({})).resolves.toMatchObject({ planned: true, generated: false });
  expect(onImageQuote.mock.calls[0]![0].plan.request.originalPrompt).toBe(imageRequest().originalPrompt);
  expect(f.deps.reserve).not.toHaveBeenCalled();
  expect(f.deps.generate).not.toHaveBeenCalled();
  expect(bindTools([imageQuoteTool], { ...ctx, media: false })).toEqual([]);
  expect(bindTools([imageQuoteTool], { ...ctx, onImageQuote: undefined })).toEqual([]);
});
