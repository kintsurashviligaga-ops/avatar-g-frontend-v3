import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ModelSwitcher, selectPersona } from '@/components/chat/ModelSwitcher';
import { __resetChatModeMemo } from '@/lib/chat/chatModeStore';
import { CUSTOM_PERSONAS_KEY, PERSONA_STORAGE_KEY } from './PersonaPicker';

beforeEach(() => {
  localStorage.clear();
  __resetChatModeMemo();
});

// The thread sidebar no longer contains personas. Verify their current model-menu surface;
// tests/persona-selection.spec.ts verifies the composer chip and actual intercepted request payloads.
test.each([
  ['ka', 'პერსონა', 'რეჟისორი'],
  ['en', 'Persona', 'Director'],
  ['ru', 'Персона', 'Режиссёр'],
  ['fr', 'პერსონა', 'რეჟისორი'],
])('%s names the active specialist (unknown locales use Georgian)', (locale, label, name) => {
  localStorage.setItem(PERSONA_STORAGE_KEY, 'film-director');
  render(<ModelSwitcher variant="desktop" locale={locale} />);
  fireEvent.click(screen.getByTestId('model-switcher'));
  expect(within(screen.getByRole('menu')).getByRole('menuitem').textContent).toBe(label + name);
});

test('a custom specialist has its own name; clearing updates the menu without deleting the definition', () => {
  const custom = { id: 'custom:planner', name: { ka: 'ჩემი', en: 'My planning specialist', ru: 'Мой' }, directive: 'Plan briefly.' };
  localStorage.setItem(CUSTOM_PERSONAS_KEY, JSON.stringify([custom]));
  localStorage.setItem(PERSONA_STORAGE_KEY, custom.id);
  render(<ModelSwitcher variant="phone" locale="en" />);
  fireEvent.click(screen.getByTestId('model-switcher'));
  const row = () => within(screen.getByRole('menu')).getByRole('menuitem');
  expect(row().textContent).toBe('PersonaMy planning specialist');
  act(() => selectPersona(''));
  expect(row().textContent).toBe('PersonaDefault');
  expect(localStorage.getItem(PERSONA_STORAGE_KEY)).toBe('');
  expect(JSON.parse(localStorage.getItem(CUSTOM_PERSONAS_KEY)!)).toEqual([custom]);
});

test('an unknown stored id does not invent a specialist name', () => {
  localStorage.setItem(PERSONA_STORAGE_KEY, 'missing-specialist');
  render(<ModelSwitcher variant="phone" locale="en" />);
  fireEvent.click(screen.getByTestId('model-switcher'));
  expect(within(screen.getByRole('menu')).getByRole('menuitem').textContent).toBe('PersonaDefault');
});
