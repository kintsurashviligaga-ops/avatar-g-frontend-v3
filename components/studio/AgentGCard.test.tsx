import { fireEvent, render } from '@testing-library/react';
import { AgentGCard, type AgentGCardState } from './AgentGCard';

const card = (over: Partial<AgentGCardState> = {}): AgentGCardState => ({ kind: 'confirm', target: 'image', prompt: 'a red fox', credits: 3, ...over });

const setup = (c: AgentGCardState, props: { locale?: string; stale?: boolean } = {}) => {
  const onConfirm = jest.fn();
  const onEdit = jest.fn();
  const view = render(<AgentGCard card={c} locale={props.locale ?? 'en'} stale={props.stale ?? false} onConfirm={onConfirm} onEdit={onEdit} />);
  return { onConfirm, onEdit, ...view };
};

test('confirm card: Create carries the price (the same quote as the panel button) and Edit sits beside it', () => {
  const { getByTestId, onConfirm, onEdit } = setup(card());
  const create = getByTestId('agent-g-confirm');
  expect(create.textContent).toContain('Create');
  expect(create.textContent).toContain('3');
  expect(create.getAttribute('data-price')).toBe('3');
  expect(create.getAttribute('aria-label')).toBe('Create — 3 credits');
  fireEvent.click(create);
  expect(onConfirm).toHaveBeenCalledTimes(1);
  fireEvent.click(getByTestId('agent-g-edit'));
  expect(onEdit).toHaveBeenCalledTimes(1);
});

test('clarify card: one button — "create it as it is" — and no Edit (the user simply answers in the composer)', () => {
  const { getByTestId, queryByTestId } = setup(card({ kind: 'clarify' }));
  expect(getByTestId('agent-g-confirm').textContent).toContain('as it is');
  expect(queryByTestId('agent-g-edit')).toBeNull();
});

test('a film card carries no price on purpose — its charge is the storyboard\'s own button', () => {
  const { getByTestId } = setup(card({ target: 'video', credits: 0 }));
  expect(getByTestId('agent-g-confirm').getAttribute('data-price')).toBeNull();
  expect(getByTestId('agent-g-confirm').getAttribute('aria-label')).toBe('Create');
});

test('a decided card shows nothing — one decision, not a toolbar', () => {
  const { container } = setup(card({ done: true }));
  expect(container.firstChild).toBeNull();
});

test('a card for another mode explains itself instead of offering a button that would run the wrong tool', () => {
  const { getByTestId, queryByTestId } = setup(card(), { stale: true });
  expect(getByTestId('agent-g-stale')).toBeTruthy();
  expect(queryByTestId('agent-g-confirm')).toBeNull();
});

// Each render is queried inside its OWN container: two renders in one test would both be in the document.
const label = (locale: string): string => {
  const { container } = setup(card(), { locale });
  return container.querySelector('[data-testid="agent-g-confirm"]')?.textContent ?? '';
};

test('Georgian label', () => { expect(label('ka')).toContain('შექმნა'); });
test('Russian label', () => { expect(label('ru')).toContain('Создать'); });
