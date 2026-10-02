import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Image as ImageIcon } from 'lucide-react';
import { ImageCreatePanel, type ImageCreatePanelProps } from './ImageCreatePanel';
import { IMAGE_CREATE_COPY, imageCreateCopy } from './imageCreateCopy';
import { IMAGE_TEMPLATES, templateAddsLine, templateLang } from '@/lib/studio/templates';
import { creditsLabel, quoteCredits } from '@/lib/credits/quote';
import { IMG_ASPECTS, IMG_STYLES } from '@/lib/studio/imageCreate';
import { catalogueFor } from '@/lib/providers/catalogue';
import { MODELS, publicModel } from '@/lib/providers/registry';
import { __resetCatalogueStatusCache } from '../ui/useCatalogueStatus';
import { __resetStudioModelsCache } from './useStudioModels';

/**
 * The Image tool's Create screen (ref3), as a view: rows in the reference's order, pickers that open, values that follow props,
 * the price ON the button equal to the quote, top-up instead of a silent no-op, and nothing that existed left unreachable.
 */

const templateItems = (locale: string): ImageCreatePanelProps['templates'] => IMAGE_TEMPLATES.map((tp) => ({
  id: tp.id, label: tp.label[templateLang(locale)], hint: tp.hint[templateLang(locale)], thumb: tp.thumb, palette: tp.palette, Icon: ImageIcon,
  meta: `${tp.values.aspect} · ${tp.values.quality === 'ultra' ? '4K' : tp.values.quality === 'high' ? '2K' : '1K'}`,
  adds: templateAddsLine(tp, templateLang(locale)) ?? undefined,
}));

function props(over: Partial<ImageCreatePanelProps> = {}): ImageCreatePanelProps {
  const locale = over.locale ?? 'en';
  return {
    locale, desktop: false,
    onOpenTools: jest.fn(), onClose: jest.fn(),
    references: [], onAddReference: jest.fn(), onRemoveReference: jest.fn(), foreignFileCount: 0, onClearForeignFiles: jest.fn(),
    prompt: '', onPrompt: jest.fn(),
    templates: templateItems(locale), activeTemplate: null, onPickTemplate: jest.fn(),
    aspect: '1:1', onAspect: jest.fn(), quality: 'high', onQuality: jest.fn(), count: 1, onCount: jest.fn(),
    style: 'Auto', onStyle: jest.fn(), styleLabel: (s: string) => s, negative: '', onNegative: jest.fn(),
    balance: 100, onGenerate: jest.fn(), onTopUp: jest.fn(),
    ...over,
  };
}

const show = (over: Partial<ImageCreatePanelProps> = {}) => {
  const p = props(over);
  const view = render(<ImageCreatePanel {...p} />);
  return { p, ...view, rerenderWith: (next: Partial<ImageCreatePanelProps>) => view.rerender(<ImageCreatePanel {...p} {...next} />) };
};

const generate = () => screen.getByTestId('create-generate');

// The model pick is remembered per browser (lib/studio/modelPick): one test's pick must not leak into the next.
beforeEach(() => { try { window.localStorage.clear(); } catch { /* jsdom always has it */ } });

describe('the rows, in the reference\'s order', () => {
  test('header → upload → prompt → templates → advanced → chips → Generate', () => {
    const { container } = show();
    const rows = [...container.querySelectorAll('[data-create-row]')].map((el) => el.getAttribute('data-create-row')).filter((r) => r !== 'footer');
    expect(rows).toEqual(['header', 'upload', 'prompt', 'templates', 'advanced', 'options', 'generate']);
  });

  test('the header is the tool name with a chevron that opens the tool switcher, and a ✕ where the sheet can close', () => {
    const { p } = show();
    const sw = screen.getByTestId('create-tool-switch');
    expect(sw.textContent).toContain('Create image');
    expect(sw.getAttribute('aria-haspopup')).toBe('dialog');
    fireEvent.click(sw);
    expect(p.onOpenTools).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('create-close'));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  test('no ✕ when nothing can close it (the desktop column)', () => {
    show({ onClose: undefined, desktop: true });
    expect(screen.queryByTestId('create-close')).toBeNull();
  });

  test('the prompt card IS the prompt, and its bottom row reads "Model … Auto"', () => {
    const { p, container } = show({ prompt: 'a red fox' });
    const prompt = screen.getByTestId('create-prompt') as HTMLTextAreaElement;
    expect(prompt.value).toBe('a red fox');
    expect(prompt.placeholder).toBe('Describe your concept, scene, or idea');
    fireEvent.change(prompt, { target: { value: 'a red fox in snow' } });
    expect(p.onPrompt).toHaveBeenCalledWith('a red fox in snow');
    const row = screen.getByTestId('model-row');
    expect(container.querySelector('[data-create-row="prompt"]')!.contains(row)).toBe(true);
    // The row follows the textarea inside the same card.
    expect(prompt.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.textContent).toContain('Model');
    expect(row.textContent).toContain('Auto');
    expect(row.getAttribute('aria-haspopup')).toBe('dialog');
  });

  test('Enter is a newline; Cmd/Ctrl+Enter runs Generate', () => {
    const { p } = show({ prompt: 'a lighthouse' });
    const prompt = screen.getByTestId('create-prompt');
    fireEvent.keyDown(prompt, { key: 'Enter' });
    expect(p.onGenerate).not.toHaveBeenCalled();
    fireEvent.keyDown(prompt, { key: 'Enter', ctrlKey: true });
    expect(p.onGenerate).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(prompt, { key: 'Enter', metaKey: true });
    expect(p.onGenerate).toHaveBeenCalledTimes(2);
  });

  test('the prompt\'s shortcuts (improve, dictate) are there only when the studio wires them', () => {
    const none = show({ prompt: 'x' });
    expect(screen.queryByRole('button', { name: 'Improve the prompt' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dictate' })).toBeNull();
    none.unmount();
    const onEnhance = jest.fn();
    const onMic = jest.fn();
    show({ prompt: 'x', onEnhance, onMic });
    fireEvent.click(screen.getByRole('button', { name: 'Improve the prompt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dictate' }));
    expect(onEnhance).toHaveBeenCalledTimes(1);
    expect(onMic).toHaveBeenCalledTimes(1);
  });
});

describe('the price is ON the button, and it is the quote', () => {
  test.each([1, 2, 4] as const)('×%s → Generate ✦ quoteCredits', (count) => {
    show({ count });
    const price = quoteCredits({ tool: 'image', count });
    expect(generate().getAttribute('data-price')).toBe(String(price));
    expect(generate().textContent).toContain('Generate');
    expect(generate().textContent).toContain(String(price));
  });

  test('the number follows the count when it changes', () => {
    const { rerenderWith } = show({ count: 1 });
    expect(generate().getAttribute('data-price')).toBe(String(quoteCredits({ tool: 'image', count: 1 })));
    rerenderWith({ count: 4 });
    expect(generate().getAttribute('data-price')).toBe(String(quoteCredits({ tool: 'image', count: 4 })));
  });

  test('the size does not change the price — every size is billed the same by the route', () => {
    const { rerenderWith } = show({ quality: 'standard' });
    const a = generate().getAttribute('data-price');
    rerenderWith({ quality: 'ultra' });
    expect(generate().getAttribute('data-price')).toBe(a);
  });

  test('a balance that cannot cover it turns the tap into top-up — and a covered balance generates', () => {
    const low = show({ prompt: 'a fox', balance: 1 });
    expect(generate().textContent).toContain('Top up');
    expect(generate().textContent).toContain(String(quoteCredits({ tool: 'image', count: 1 })));
    fireEvent.click(generate());
    expect(low.p.onTopUp).toHaveBeenCalledTimes(1);
    expect(low.p.onGenerate).not.toHaveBeenCalled();
    low.unmount();
    const ok = show({ prompt: 'a fox', balance: 2 });
    expect(generate().textContent).toContain('Generate');
    fireEvent.click(generate());
    expect(ok.p.onGenerate).toHaveBeenCalledTimes(1);
    expect(ok.p.onTopUp).not.toHaveBeenCalled();
  });

  test('an unknown balance (a guest, not loaded yet) never blocks: the studio asks for sign-in itself', () => {
    const { p } = show({ prompt: 'a fox', balance: null });
    expect(generate().textContent).toContain('Generate');
    fireEvent.click(generate());
    expect(p.onGenerate).toHaveBeenCalledTimes(1);
  });

  test('a ×4 batch that the balance cannot cover is "Top up" at ×4 but not at ×1', () => {
    const { rerenderWith } = show({ prompt: 'x', balance: 3, count: 1 });
    expect(generate().textContent).toContain('Generate');
    rerenderWith({ count: 4 });
    expect(generate().textContent).toContain('Top up');
  });
});

describe('Generate never silently does nothing', () => {
  test('an empty prompt: the prompt takes focus and the card says what is missing', () => {
    const { p } = show({ prompt: '   ' });
    fireEvent.click(generate());
    expect(p.onGenerate).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByTestId('create-prompt'));
    expect(screen.getByRole('alert').textContent).toBe('Describe what you want to create first.');
    expect(screen.getByTestId('create-prompt').getAttribute('aria-invalid')).toBe('true');
  });

  test('the refusal goes away as soon as there is a prompt', () => {
    const { rerenderWith } = show({ prompt: '' });
    fireEvent.click(generate());
    expect(screen.getByRole('alert')).toBeTruthy();
    rerenderWith({ prompt: 'a fox' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('a non-image file in the tray would turn the request into chat: it is named, removable, and Generate waits', () => {
    const { p } = show({ prompt: 'a fox', foreignFileCount: 2 });
    const note = screen.getByTestId('create-foreign-files');
    expect(note.textContent).toContain('only images work here');
    fireEvent.click(generate());
    expect(p.onGenerate).not.toHaveBeenCalled();
    fireEvent.click(within(note).getByRole('button', { name: 'Remove them' }));
    expect(p.onClearForeignFiles).toHaveBeenCalledTimes(1);
  });
});

describe('the chips show the live values and open large pickers', () => {
  test('aspect · quality · count read from the props, in that order', () => {
    const { container, rerenderWith } = show({ aspect: '9:16', quality: 'ultra', count: 4 });
    const chips = ['chip-aspect', 'chip-quality', 'chip-count'].map((id) => screen.getByTestId(id));
    expect(chips.map((c) => c.textContent)).toEqual(['9:16', '4K', '4']);
    const row = container.querySelector('[data-create-row="options"]')!;
    expect(chips.every((c) => row.contains(c))).toBe(true);
    expect(chips[0]!.compareDocumentPosition(chips[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    rerenderWith({ aspect: '21:9', quality: 'standard', count: 2 });
    expect(chips.map((c) => c.textContent)).toEqual(['21:9', '1K', '2']);
    expect(chips.map((c) => c.getAttribute('aria-label'))).toEqual(['Aspect ratio: 21:9', 'Quality: 1K', 'Count: 2']);
  });

  test('the aspect picker is a sheet of ten ratios, each a ≥ 44 px tile with its drawn shape; the current one is checked', () => {
    const { p } = show({ aspect: '4:5' });
    fireEvent.click(screen.getByTestId('chip-aspect'));
    const dialog = screen.getByRole('dialog', { name: 'Aspect ratio' });
    const options = within(dialog).getAllByRole('radio');
    expect(options.map((o) => o.textContent)).toEqual([...IMG_ASPECTS]);
    expect(options.every((o) => /min-h-\[(6[8-9]|[7-9]\d)px\]/.test(o.className))).toBe(true);
    expect(options.every((o) => o.querySelector('span[aria-hidden="true"]'))).toBe(true);
    expect(options.filter((o) => o.getAttribute('aria-checked') === 'true').map((o) => o.textContent)).toEqual(['4:5']);
    fireEvent.click(options[1]!); // 16:9
    expect(p.onAspect).toHaveBeenCalledWith('16:9');
    expect(screen.queryByRole('dialog', { name: 'Aspect ratio' })).toBeNull();
  });

  test('the quality picker names the model at each size and prices it from the quote', () => {
    const { p } = show({ quality: 'high' });
    fireEvent.click(screen.getByTestId('chip-quality'));
    const options = within(screen.getByRole('dialog', { name: 'Quality' })).getAllByRole('radio');
    expect(options.map((o) => o.querySelector('span.text-\\[15px\\]')?.textContent)).toEqual(['1K', '2K', '4K']);
    expect(options[0]!.textContent).toContain('Nano Banana V2');
    expect(options[2]!.textContent).toContain('Nano Banana Pro');
    const price = creditsLabel(quoteCredits({ tool: 'image', count: 1 }), 'en');
    for (const o of options) expect(o.textContent).toContain(price);
    expect(options.every((o) => o.className.includes('min-h-[56px]'))).toBe(true);
    fireEvent.click(options[2]!);
    expect(p.onQuality).toHaveBeenCalledWith('ultra');
  });

  test('the count picker prices each choice from the quote', () => {
    const { p } = show({ count: 2 });
    fireEvent.click(screen.getByTestId('chip-count'));
    const options = within(screen.getByRole('dialog', { name: 'How many images' })).getAllByRole('radio');
    expect(options.map((o) => o.textContent)).toEqual(
      [1, 2, 4].map((n) => `${n === 1 ? '1 image' : `${n} images`}${creditsLabel(quoteCredits({ tool: 'image', count: n }), 'en')}`),
    );
    expect(options[1]!.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(options[2]!);
    expect(p.onCount).toHaveBeenCalledWith(4);
  });

  test('arrow keys move through a picker and Escape closes it', () => {
    show();
    fireEvent.click(screen.getByTestId('chip-quality'));
    const dialog = screen.getByRole('dialog', { name: 'Quality' });
    const options = within(dialog).getAllByRole('radio');
    options[1]!.focus();
    fireEvent.keyDown(options[1]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(options[2]);
    fireEvent.keyDown(options[2]!, { key: 'Home' });
    expect(document.activeElement).toBe(options[0]);
    // One Tab stop: only the checked radio is tabbable.
    expect(options.map((o) => o.tabIndex)).toEqual([-1, 0, -1]);
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(screen.queryByRole('dialog', { name: 'Quality' })).toBeNull();
  });

  test('on a desktop the picker is a popover anchored to the chip (not the sheet), closed by Escape or an outside press', () => {
    show({ desktop: true });
    fireEvent.click(screen.getByTestId('chip-count'));
    const pop = screen.getByTestId('picker-popover');
    expect(pop.getAttribute('aria-label')).toBe('How many images');
    expect(screen.queryByTestId('picker-count')).toBeNull(); // the sheet's test id is absent
    expect(within(pop).getAllByRole('radio')).toHaveLength(3);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('picker-popover')).toBeNull();
    fireEvent.click(screen.getByTestId('chip-aspect'));
    expect(screen.getByTestId('picker-popover')).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId('picker-popover')).toBeNull();
  });
});

describe('the model row: the studio\'s ModelPicker — Google first and the default, Higgsfield opt-in, no price', () => {
  const rows = () => within(screen.getByRole('dialog', { name: 'Model' })).getAllByRole('radio');
  const row = (id: string) => rows().find((r) => r.getAttribute('data-model') === id)!;
  const realFetch = global.fetch;
  /** GET /api/studio/catalogue as this deployment would answer: the listed Higgsfield models run, the rest are not enabled. */
  const deployment = (runs: string[]) => {
    __resetCatalogueStatusCache();
    __resetStudioModelsCache();
    global.fetch = jest.fn(async (url: string) => {
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
      if (url.startsWith('/api/studio/catalogue')) {
        return ok({ models: catalogueFor('image').map((e) => (e.provider === 'higgsfield'
          ? { id: e.id, available: runs.includes(e.id), reason: runs.includes(e.id) ? null : 'not_enabled' }
          : { id: e.id, available: true, reason: null })) });
      }
      if (url.startsWith('/api/studio/models')) return ok({ models: MODELS.map(publicModel).filter((m) => runs.includes(m.id)) });
      return ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response;
    }) as unknown as typeof fetch;
  };
  afterEach(() => { global.fetch = realFetch; });

  test('Google\'s Nano Banana first (Auto checked); every Higgsfield image model listed, dimmed where this deployment cannot run it', async () => {
    deployment([]);
    show();
    fireEvent.click(screen.getByTestId('model-row'));
    const hf = catalogueFor('image').filter((e) => e.provider === 'higgsfield').map((e) => e.id);
    expect(rows().map((r) => r.getAttribute('data-model'))).toEqual(['nb/auto', 'nb/v2', 'nb/pro', ...hf]);
    await waitFor(() => expect(row('hf/soul-2').textContent).toContain('Not enabled yet'));
    expect(rows().filter((r) => r.getAttribute('aria-disabled') !== 'true').map((r) => r.getAttribute('data-model'))).toEqual(['nb/auto', 'nb/v2', 'nb/pro']);
    expect(row('nb/auto').getAttribute('aria-checked')).toBe('true');
    expect(row('nb/auto').textContent).toContain('V2 at 1K and 2K, Pro at 4K');
    expect(row('nb/pro').textContent).toContain('Max quality'); // the speed/quality badge
    for (const id of hf) expect(row(id).getAttribute('aria-disabled')).toBe('true');
    // ⚠️ No price anywhere in the model list — the request names the model and the server quotes it.
    const dialog = screen.getByRole('dialog', { name: 'Model' });
    expect(dialog.textContent).not.toContain(creditsLabel(quoteCredits({ tool: 'image', count: 1 }), 'en'));
    expect(dialog.textContent).not.toMatch(/credit/i);
  });

  test('a pick is one tap: it closes the sheet, the row reads the model, the browser remembers it — a dimmed row does nothing', async () => {
    deployment([]);
    show();
    fireEvent.click(screen.getByTestId('model-row'));
    await waitFor(() => expect(row('hf/soul-2').textContent).toContain('Not enabled yet'));
    fireEvent.click(row('hf/soul-2'));
    expect(screen.getByRole('dialog', { name: 'Model' })).toBeTruthy(); // still open: nothing happened
    fireEvent.click(row('nb/v2'));
    expect(screen.queryByRole('dialog', { name: 'Model' })).toBeNull();
    expect(screen.getByTestId('model-row').textContent).toContain('Nano Banana V2');
    expect(window.localStorage.getItem('myavatar:model:image')).toBe('nb/v2');
  });

  test('a Higgsfield model this deployment runs is a real choice: Generate becomes the saga\'s (its own price), the ×N chip steps aside', async () => {
    deployment(['hf/soul-2']);
    const { p } = show({ prompt: '' }); // no prompt: nothing to price, so the test ends with no request in flight
    fireEvent.click(screen.getByTestId('model-row'));
    await waitFor(() => expect(row('hf/soul-2').getAttribute('aria-disabled')).toBeNull());
    fireEvent.click(row('hf/soul-2'));
    expect(window.localStorage.getItem('myavatar:model:image')).toBe('hf/soul-2');
    expect(screen.getByTestId('model-row').textContent).toContain('Soul 2');
    expect(screen.getByTestId('hf-generate').getAttribute('data-model')).toBe('hf/soul-2');
    expect(screen.queryByTestId('chip-count')).toBeNull();
    // The panel's own Generate is not reachable for it: Cmd/Ctrl+Enter does not run the Google route.
    fireEvent.keyDown(screen.getByTestId('create-prompt'), { key: 'Enter', ctrlKey: true });
    expect(p.onGenerate).not.toHaveBeenCalled();
    // It reads the model's own parameters (Studio β's description) and says what it will render.
    await waitFor(() => expect(screen.getByTestId('hf-summary').textContent).toBe('Soul 2 — photoreal image · 1:1 · 1080p'));
  });

  test('a remembered Higgsfield pick the deployment no longer runs falls back to Google — once the server has said so', async () => {
    window.localStorage.setItem('myavatar:model:image', 'hf/soul-2');
    deployment([]);
    show();
    await waitFor(() => expect(window.localStorage.getItem('myavatar:model:image')).toBeNull());
    expect(screen.getByTestId('model-row').textContent).toContain('Auto');
    expect(screen.queryByTestId('hf-generate')).toBeNull();
  });

  test('a model without the size on screen moves the size chip to one it has (Nano Banana Pro starts at 2K) and names the gap', () => {
    const { p } = show({ quality: 'standard', model: 'nb/pro', onModel: jest.fn() });
    expect(p.onQuality).toHaveBeenCalledWith('high');
    fireEvent.click(screen.getByTestId('chip-quality'));
    const options = within(screen.getByRole('dialog', { name: 'Quality' })).getAllByRole('radio');
    expect((options[0] as HTMLButtonElement).disabled).toBe(true);
    expect(options[0]!.textContent).toContain('Nano Banana Pro does not render this size');
    expect(options[1]!.textContent).toContain('Nano Banana Pro');
  });

  test('controlled: `model` / `onModel` override the browser\'s pick', () => {
    const onModel = jest.fn();
    show({ model: 'nb/pro', onModel });
    expect(screen.getByTestId('model-row').textContent).toContain('Nano Banana Pro');
    fireEvent.click(screen.getByTestId('model-row'));
    fireEvent.click(row('nb/auto'));
    expect(onModel).toHaveBeenCalledWith('nb/auto');
  });
});

describe('the reference picture: the route takes one', () => {
  test('empty: the dashed card says "Choose an image to upload (max 1)" and picks a single image file', () => {
    const { p, container } = show();
    const row = container.querySelector('[data-create-row="upload"]')!;
    expect(row.textContent).toContain('Choose an image to upload');
    expect(row.textContent).toContain('(max 1)');
    const input = screen.getByTestId('reference-input') as HTMLInputElement;
    expect(input.accept).toBe('image/*');
    expect(input.multiple).toBe(false);
    const a = new File(['a'], 'a.png', { type: 'image/png' });
    const b = new File(['b'], 'b.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [a, b] } });
    // A second file is dropped before it reaches the studio: it would only be ignored by the route.
    expect(p.onAddReference).toHaveBeenCalledWith([a]);
  });

  test('the file input is a SIBLING of its label (a nested input cancels the picker on iOS)', () => {
    show();
    const input = screen.getByTestId('reference-input');
    const label = document.querySelector(`label[for="${input.id}"]`)!;
    expect(label).toBeTruthy();
    expect(label.contains(input)).toBe(false);
  });

  test('filled: the picture, a remove, a replace — and a plain note when more than one is attached', () => {
    const one = show({ references: [{ src: 'data:image/png;base64,AAAA', name: 'fox.png' }] });
    expect(screen.getByAltText('fox.png')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(one.p.onRemoveReference).toHaveBeenCalledWith(0);
    one.unmount();
    show({ references: [{ src: 'data:image/png;base64,AAAA' }, { src: 'data:image/png;base64,BBBB' }] });
    expect(screen.getByRole('status').textContent).toBe('Only the first image is used.');
    expect(screen.getAllByRole('button', { name: 'Remove image' })).toHaveLength(2);
  });
});

describe('the templates gallery stays — under the prompt, shut on a phone, open on a desktop', () => {
  test('a phone: collapsed behind a row that names the picked card; opening shows every card with its "Adds:" line', () => {
    show({ activeTemplate: 'poster' });
    const toggle = screen.getByTestId('templates-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain('Cinematic Poster');
    expect(screen.queryByTestId('image-templates')).toBeNull();
    fireEvent.click(toggle);
    const gallery = screen.getByTestId('image-templates');
    expect(within(gallery).getAllByRole('radio')).toHaveLength(IMAGE_TEMPLATES.length);
    expect(gallery.querySelectorAll('[data-template-adds]')).toHaveLength(IMAGE_TEMPLATES.length);
    expect(within(gallery).getByRole('radio', { name: 'Cinematic Poster' }).getAttribute('aria-checked')).toBe('true');
    expect(within(gallery).getByRole('radio', { name: 'Anime' }).getAttribute('aria-checked')).toBe('false');
  });

  test('the gallery sits directly under the prompt card', () => {
    const { container } = show({ desktop: true });
    const prompt = container.querySelector('[data-create-row="prompt"]')!;
    const templates = container.querySelector('[data-create-row="templates"]')!;
    expect(prompt.nextElementSibling).toBe(templates);
  });

  test('picking a card hands its id to the studio (which sets the values and remembers the PICK)', () => {
    const { p } = show({ desktop: true });
    fireEvent.click(within(screen.getByTestId('image-templates')).getByRole('radio', { name: 'Anime' }));
    expect(p.onPickTemplate).toHaveBeenCalledWith('anime');
  });

  test('a desktop: open by default (and the user can shut it)', () => {
    show({ desktop: true });
    expect(screen.getByTestId('templates-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('image-templates')).toBeTruthy();
    fireEvent.click(screen.getByTestId('templates-toggle'));
    expect(screen.queryByTestId('image-templates')).toBeNull();
  });

  test('crossing to a desktop width opens it unless the user already chose', () => {
    const { rerenderWith } = show({ desktop: false });
    expect(screen.queryByTestId('image-templates')).toBeNull();
    rerenderWith({ desktop: true });
    expect(screen.getByTestId('image-templates')).toBeTruthy();
  });
});

describe('Advanced keeps everything that is not on every run', () => {
  test('shut by default; open: all thirteen styles, the negative prompt and the studio\'s slotted section', () => {
    const { p } = show({ advancedExtra: <div data-testid="slot">Script → Storyboard</div>, styleLabel: (s) => `«${s}»` });
    const toggle = screen.getByTestId('advanced-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('create-negative')).toBeNull();
    expect(screen.queryByTestId('slot')).toBeNull();
    fireEvent.click(toggle);
    const styles = within(screen.getByRole('group', { name: 'Style' })).getAllByRole('button');
    expect(styles.map((b) => b.textContent)).toEqual(IMG_STYLES.map((s) => `«${s}»`));
    expect(styles[0]!.getAttribute('aria-pressed')).toBe('true'); // Auto
    expect(styles.every((b) => /min-h-\[44px\]/.test(b.className))).toBe(true);
    fireEvent.click(styles[4]!);
    expect(p.onStyle).toHaveBeenCalledWith('Anime');
    fireEvent.change(screen.getByTestId('create-negative'), { target: { value: 'blurry' } });
    expect(p.onNegative).toHaveBeenCalledWith('blurry');
    expect(screen.getByTestId('slot')).toBeTruthy();
  });

  test('a shut Advanced still shows that something in it is changed (a dot) and names a non-default style', () => {
    const quiet = show();
    expect(screen.getByTestId('advanced-toggle').hasAttribute('data-dirty')).toBe(false);
    quiet.unmount();
    const styled = show({ style: 'Cinematic', styleLabel: (s) => s });
    expect(screen.getByTestId('advanced-toggle').hasAttribute('data-dirty')).toBe(true);
    expect(screen.getByTestId('advanced-toggle').textContent).toContain('Cinematic');
    styled.unmount();
    show({ negative: 'text, watermark' });
    expect(screen.getByTestId('advanced-toggle').hasAttribute('data-dirty')).toBe(true);
  });

  test('the slotted section can flag itself dirty too (a pasted script)', () => {
    show({ advancedExtra: <div />, advancedExtraDirty: true });
    expect(screen.getByTestId('advanced-toggle').hasAttribute('data-dirty')).toBe(true);
  });
});

describe('ka · en · ru', () => {
  test('the three records have the same keys, and no string is empty or the English one', () => {
    const en = IMAGE_CREATE_COPY.en as unknown as Record<string, unknown>;
    for (const lang of ['ka', 'ru'] as const) {
      const other = IMAGE_CREATE_COPY[lang] as unknown as Record<string, unknown>;
      expect(Object.keys(other).sort()).toEqual(Object.keys(en).sort());
      for (const k of Object.keys(en)) {
        const a = en[k];
        const b = other[k];
        expect(typeof b).toBe(typeof a);
        if (typeof b === 'string') { expect(b.trim()).not.toBe(''); expect(b).not.toBe(a); }
        else if (typeof b === 'function') {
          expect((b as (n: number) => string)(2).trim()).not.toBe('');
          expect((b as (n: number) => string)(2)).not.toBe((a as (n: number) => string)(2));
        }
      }
    }
  });

  test.each([['ka', 'სურათის შექმნა', 'შექმნა'], ['ru', 'Создать изображение', 'Создать']] as const)('%s: the header and the button speak the language', (locale, title, button) => {
    show({ locale });
    expect(screen.getByTestId('create-tool-switch').textContent).toContain(title);
    expect(generate().textContent).toContain(button);
    expect(imageCreateCopy(locale).uploadLimit(1)).toMatch(/1/);
  });

  test('the Russian plural of credits follows the number (1 кредит · 2 кредита · 5 кредитов)', () => {
    expect(IMAGE_CREATE_COPY.ru.perImage(1)).toContain('1 кредит ');
    expect(IMAGE_CREATE_COPY.ru.perImage(2)).toContain('2 кредита');
    expect(IMAGE_CREATE_COPY.ru.perImage(5)).toContain('5 кредитов');
  });
});

describe('nothing in the panel can push a 375 px screen sideways', () => {
  test('no fixed width past a phone, no nowrap flex row, no viewport-wide element; chip and style rows wrap', () => {
    const { container } = show({ desktop: false });
    fireEvent.click(screen.getByTestId('advanced-toggle'));
    const bad: string[] = [];
    container.querySelectorAll('*').forEach((el) => {
      const cls = typeof el.className === 'string' ? el.className : '';
      for (const token of cls.split(/\s+/)) {
        const fixed = /^(?:min-|max-)?w-\[(\d+)px\]$/.exec(token);
        if (token === 'w-screen' || token === 'min-w-screen' || token === 'flex-nowrap' || (fixed && !token.startsWith('max-') && Number(fixed[1]) > 340)) bad.push(token);
      }
      // `whitespace-nowrap` is only for a short token ("(max 1)") that must not break in the middle.
      if (/\bwhitespace-nowrap\b/.test(cls) && (el.textContent ?? '').length > 24) bad.push(`nowrap on long text: ${el.textContent}`);
    });
    expect(bad).toEqual([]);
    expect(container.querySelector('[data-create-row="options"] [role="group"]')!.className).toContain('flex-wrap');
    expect(screen.getByRole('group', { name: 'Style' }).className).toContain('flex-wrap');
    expect(container.firstElementChild!.className).toContain('min-w-0');
  });

  test('every control a finger presses is ≥ 44 px (a floor in the class, not a hope)', () => {
    const { container } = show({ desktop: false, onClose: jest.fn() });
    const tooSmall = [...container.querySelectorAll('button')].filter((b) => {
      const cls = b.className;
      return !/(min-h-\[(4[4-9]|[5-9]\d)px\]|\bh-1[1-9]\b|\bh-12\b)/.test(cls);
    });
    expect(tooSmall.map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([]);
  });
});
