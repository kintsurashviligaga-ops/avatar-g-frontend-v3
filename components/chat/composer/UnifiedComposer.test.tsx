/** @jest-environment jsdom */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef, useState } from 'react';
import { UnifiedComposer, isImeEnter, type ComposerAttachmentsApi, type ComposerDictationApi, type UnifiedComposerHandle, type UnifiedComposerProps } from './UnifiedComposer';
import type { Attachment } from './useAttachments';

// ─── Fakes ───────────────────────────────────────────────────────────────────────────────────────────────

function att(over: Partial<Attachment> = {}): Attachment {
  return {
    id: 'a1', name: 'photo.jpg', size: 120_000, kind: 'image', mimeType: 'image/jpeg',
    dataUrl: 'data:image/jpeg;base64,AAAA', previewUrl: 'data:image/jpeg;base64,AAAA',
    status: 'ready', source: 'photos', payloadBytes: 28, ...over,
  };
}

function attachmentsApi(over: Partial<ComposerAttachmentsApi> = {}): ComposerAttachmentsApi {
  return {
    items: [],
    processing: false,
    remove: jest.fn(),
    onPaste: jest.fn(),
    onInputChange: jest.fn(() => jest.fn()),
    ...over,
  };
}

function dictationApi(over: Partial<ComposerDictationApi> = {}): ComposerDictationApi {
  return { recording: false, transcribing: false, toggle: jest.fn(async () => undefined), markTyped: jest.fn(), warn: null, ...over };
}

type Props = Partial<UnifiedComposerProps>;

/** A controlled host, like OmniStudio: the text lives in the parent. */
function Host(props: Props & { initial?: string }) {
  const { initial = '', ...rest } = props;
  const [value, setValue] = useState(initial);
  return <UnifiedComposer locale="ka" value={value} onChange={setValue} onSubmit={jest.fn()} {...rest} />;
}

const textbox = () => screen.getByRole('textbox');

// ─── The ONE trailing slot (tests/landing.spec.ts asserts this on the real page) ─────────────────────────

describe('the Live / Send slot', () => {
  test('empty → Live („ცოცხალი ხმა"), no Send; typing swaps Live for Send', () => {
    const onLive = jest.fn();
    render(<Host onLive={onLive} labels={{ send: 'ვიდეოს შექმნა' }} />);
    const live = screen.getByRole('button', { name: 'ცოცხალი ხმა' });
    expect(screen.queryByRole('button', { name: 'ვიდეოს შექმნა' })).toBeNull();
    fireEvent.click(live);
    expect(onLive).toHaveBeenCalledTimes(1);

    fireEvent.change(textbox(), { target: { value: 'ღამის თბილისი წვიმის შემდეგ' } });
    expect(screen.getByRole('button', { name: 'ვიდეოს შექმნა' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ცოცხალი ხმა' })).toBeNull();
  });

  test('whitespace alone is not something to send', () => {
    render(<Host initial="   " onLive={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'ცოცხალი ხმა' })).toBeTruthy();
  });

  test('an attachment alone brings Send', () => {
    render(<Host onLive={jest.fn()} attachments={attachmentsApi({ items: [att()] })} />);
    expect(screen.getByRole('button', { name: 'გაგზავნა' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ცოცხალი ხმა' })).toBeNull();
  });

  test('canSubmit overrides the rule (a generative tool with only a file keeps Live)', () => {
    render(<Host onLive={jest.fn()} canSubmit={false} attachments={attachmentsApi({ items: [att()] })} />);
    expect(screen.getByRole('button', { name: 'ცოცხალი ხმა' })).toBeTruthy();
  });

  test('busy → Stop in the slot; the mic stays beside it', () => {
    const onStop = jest.fn();
    render(<Host initial="x" busy onStop={onStop} onLive={jest.fn()} dictation={dictationApi()} />);
    fireEvent.click(screen.getByRole('button', { name: 'შეჩერება' }));
    expect(onStop).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'გაგზავნა' })).toBeNull();
    expect(screen.getByRole('button', { name: 'ხმის ჩაწერა' })).toBeTruthy();
  });

  test('while a file is still processing, Send is disabled', () => {
    const onSubmit = jest.fn();
    render(<Host initial="hi" onSubmit={onSubmit} attachments={attachmentsApi({ items: [att({ status: 'processing' })], processing: true })} />);
    const send = screen.getByRole('button', { name: 'გაგზავნა' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.keyDown(textbox(), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('en / ru labels', () => {
    const { unmount } = render(<Host locale="en" onLive={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Live voice' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeTruthy();
    unmount();
    render(<Host locale="ru" initial="привет" />);
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeTruthy();
  });
});

// ─── Keyboard ────────────────────────────────────────────────────────────────────────────────────────────

describe('keyboard', () => {
  test('Enter sends; Shift+Enter does not', () => {
    const onSubmit = jest.fn();
    render(<Host initial="hello" onSubmit={onSubmit} />);
    const shift = fireEvent.keyDown(textbox(), { key: 'Enter', shiftKey: true });
    expect(shift).toBe(true); // not prevented → the browser inserts the newline
    expect(onSubmit).not.toHaveBeenCalled();
    const plain = fireEvent.keyDown(textbox(), { key: 'Enter' });
    expect(plain).toBe(false); // prevented → no stray newline
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('Enter on an empty box does nothing', () => {
    const onSubmit = jest.fn();
    render(<Host onSubmit={onSubmit} />);
    fireEvent.keyDown(textbox(), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('IME: Enter while composing (isComposing, a composition in progress, or keyCode 229) does not send', () => {
    const onSubmit = jest.fn();
    render(<Host initial="にほん" onSubmit={onSubmit} />);
    fireEvent.keyDown(textbox(), { key: 'Enter', isComposing: true });
    fireEvent.keyDown(textbox(), { key: 'Enter', keyCode: 229 });
    fireEvent.compositionStart(textbox());
    fireEvent.keyDown(textbox(), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.compositionEnd(textbox());
    fireEvent.keyDown(textbox(), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('isImeEnter', () => {
    expect(isImeEnter({ keyCode: 13, nativeEvent: { isComposing: false } }, false)).toBe(false);
    expect(isImeEnter({ keyCode: 229, nativeEvent: { isComposing: false } }, false)).toBe(true);
    expect(isImeEnter({ keyCode: 13, nativeEvent: { isComposing: true } }, false)).toBe(true);
    expect(isImeEnter({ keyCode: 13 }, true)).toBe(true);
  });

  test('typing calls onChange and tells dictation the box is now keyboard text', () => {
    const d = dictationApi();
    const onChange = jest.fn();
    render(<UnifiedComposer value="" onChange={onChange} onSubmit={jest.fn()} dictation={d} />);
    fireEvent.change(textbox(), { target: { value: 'a' } });
    expect(onChange).toHaveBeenCalledWith('a');
    expect(d.markTyped).toHaveBeenCalled();
  });
});

// ─── Mic ─────────────────────────────────────────────────────────────────────────────────────────────────

describe('mic', () => {
  test('idle → „ხმის ჩაწერა"; recording → a stop control; transcribing → a status, not a button', () => {
    const d = dictationApi();
    const { rerender } = render(<UnifiedComposer value="" onChange={jest.fn()} onSubmit={jest.fn()} dictation={d} />);
    fireEvent.click(screen.getByRole('button', { name: 'ხმის ჩაწერა' }));
    expect(d.toggle).toHaveBeenCalledTimes(1);

    rerender(<UnifiedComposer value="" onChange={jest.fn()} onSubmit={jest.fn()} dictation={{ ...d, recording: true }} />);
    const stop = screen.getByRole('button', { name: 'ჩაწერის შეჩერება' });
    expect(stop.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(stop);
    expect(d.toggle).toHaveBeenCalledTimes(2);

    rerender(<UnifiedComposer value="" onChange={jest.fn()} onSubmit={jest.fn()} dictation={{ ...d, transcribing: true }} />);
    expect(screen.getByRole('status', { name: 'ტრანსკრიფცია' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ხმის ჩაწერა' })).toBeNull();
  });

  test('no dictation prop → no mic', () => {
    render(<Host />);
    expect(screen.queryByRole('button', { name: 'ხმის ჩაწერა' })).toBeNull();
  });

  test('a dictation warning is shown above the pill', () => {
    render(<Host dictation={dictationApi({ warn: 'ტრანსკრიფცია არ პასუხობს' })} />);
    expect(screen.getByText('ტრანსკრიფცია არ პასუხობს')).toBeTruthy();
  });
});

// ─── „+" ─────────────────────────────────────────────────────────────────────────────────────────────────

describe('the „+" button', () => {
  test('with onPlus, the parent owns the sheet (OmniStudio ToolSheet): data-testid="plus", aria-haspopup=dialog', () => {
    const onPlus = jest.fn();
    render(<Host onPlus={onPlus} plusExpanded={false} attachments={attachmentsApi()} />);
    const plus = screen.getByTestId('plus');
    expect(plus.getAttribute('aria-haspopup')).toBe('dialog');
    expect(plus.getAttribute('aria-label')).toBe('დამატება და ხელსაწყოები');
    fireEvent.click(plus);
    expect(onPlus).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  test('without onPlus, a built-in menu: Photos / Camera / Files / Tools, Escape closes', () => {
    const onTools = jest.fn();
    render(<Host attachments={attachmentsApi()} onTools={onTools} />);
    const plus = screen.getByTestId('plus');
    expect(plus.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.click(plus);
    expect(plus.getAttribute('aria-expanded')).toBe('true');
    const items = screen.getAllByRole('menuitem').map((b) => b.textContent);
    expect(items).toEqual(['ფოტოები', 'კამერა', 'ფაილები', 'ხელსაწყოები']);
    expect(document.activeElement).toBe(screen.getAllByRole('menuitem')[0]);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getAllByRole('menuitem')[1]);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(plus);

    fireEvent.click(plus);
    fireEvent.click(screen.getByRole('menuitem', { name: 'ხელსაწყოები' }));
    expect(onTools).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  test('menu items open the matching hidden picker', () => {
    render(<Host attachments={attachmentsApi()} />);
    const photos = screen.getByTestId('composer-photos-input') as HTMLInputElement;
    const camera = screen.getByTestId('composer-camera-input') as HTMLInputElement;
    const files = screen.getByTestId('composer-files-input') as HTMLInputElement;
    const clicks = [jest.spyOn(photos, 'click'), jest.spyOn(camera, 'click'), jest.spyOn(files, 'click')];
    for (const [i, name] of ['ფოტოები', 'კამერა', 'ფაილები'].entries()) {
      fireEvent.click(screen.getByTestId('plus'));
      fireEvent.click(screen.getByRole('menuitem', { name }));
      expect(clicks[i]).toHaveBeenCalledTimes(1);
    }
    expect(camera.getAttribute('capture')).toBe('environment');
    expect(photos.accept).toBe('image/*');
    expect(files.accept).toContain('.docx');
  });

  test('a click outside closes the menu', () => {
    render(<Host attachments={attachmentsApi()} />);
    fireEvent.click(screen.getByTestId('plus'));
    expect(screen.getByRole('menu')).toBeTruthy();
    act(() => { fireEvent.mouseDown(document.body); });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  test('the imperative handle opens pickers for a parent-owned sheet', () => {
    const ref = createRef<UnifiedComposerHandle>();
    render(<UnifiedComposer ref={ref} value="" onChange={jest.fn()} onSubmit={jest.fn()} attachments={attachmentsApi()} onPlus={jest.fn()} />);
    const click = jest.spyOn(screen.getByTestId('composer-files-input') as HTMLInputElement, 'click');
    ref.current!.openFiles();
    expect(click).toHaveBeenCalled();
    ref.current!.focus();
    expect(document.activeElement).toBe(textbox());
    expect(ref.current!.textarea).toBe(textbox());
  });
});

// ─── Attachments in the pill ─────────────────────────────────────────────────────────────────────────────

describe('attachments', () => {
  test('chips show a thumbnail for a photo and name + size for a document; remove is labelled by name', () => {
    const api = attachmentsApi({ items: [att(), att({ id: 'a2', name: 'script.docx', kind: 'doc', mimeType: 'text/plain', previewUrl: undefined, size: 52_000 })] });
    render(<Host attachments={api} />);
    expect(screen.getByRole('list', { name: 'მიმაგრებული ფაილები' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'photo.jpg' })).toBeTruthy();
    expect(screen.getByText('script.docx')).toBeTruthy();
    expect(screen.getByText('51 KB')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'წაშლა: script.docx' }));
    expect(api.remove).toHaveBeenCalledWith('a2');
  });

  test('a processing chip is marked busy', () => {
    render(<Host attachments={attachmentsApi({ items: [att({ status: 'processing', kind: 'pdf', name: 'a.pdf', previewUrl: undefined })], processing: true })} />);
    expect(screen.getByTitle('a.pdf').getAttribute('aria-busy')).toBe('true');
  });

  test('paste on the box goes to the attachments hook', () => {
    const api = attachmentsApi();
    render(<Host attachments={api} />);
    fireEvent.paste(textbox(), { clipboardData: { items: [], files: [], types: [] } });
    expect(api.onPaste).toHaveBeenCalledTimes(1);
  });

  test('a file drag over the composer shows the drop hint', () => {
    render(<Host locale="en" attachments={attachmentsApi({ dragActive: true, dropHandlers: { onDragEnter: jest.fn(), onDragOver: jest.fn(), onDragLeave: jest.fn(), onDrop: jest.fn() } })} />);
    expect(screen.getByText('Drop files here')).toBeTruthy();
  });

  test('the textarea ref is forwarded', () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<UnifiedComposer value="" onChange={jest.fn()} onSubmit={jest.fn()} textareaRef={ref} />);
    expect(ref.current).toBe(textbox());
  });
});
