import { render, screen } from '@testing-library/react';
import { FilmQaBadge, filmQaText } from './FilmQaBadge';

describe('FilmQaBadge — the finished film says whether it passed the quality check', () => {
  test('nothing without a check', () => {
    const { container } = render(<FilmQaBadge qa={null} locale="en" />);
    expect(container.textContent).toBe('');
  });

  test('a pass is a quiet line with grade and score', () => {
    render(<FilmQaBadge qa={{ pass: true, score: 92, grade: 'A', issues: [] }} locale="en" />);
    const el = screen.getByTestId('film-qa');
    expect(el.getAttribute('data-pass')).toBe('true');
    expect(el.getAttribute('role')).toBeNull();
    expect(el.textContent).toContain('Quality check passed · A · 92/100');
  });

  test('a failed check is an alert, never shown as final without a word', () => {
    render(<FilmQaBadge qa={{ pass: false, score: 41, grade: 'D', issues: ['black_frames'] }} locale="ka" />);
    const el = screen.getByTestId('film-qa');
    expect(el.getAttribute('role')).toBe('alert');
    expect(el.textContent).toContain('ხარისხის გაფრთხილება');
  });

  test('three languages', () => {
    const qa = { pass: true, score: 80, grade: 'B', issues: [] };
    expect(filmQaText(qa, 'en')).toMatch(/^Quality check passed/);
    expect(filmQaText(qa, 'ru')).toMatch(/^Проверка качества пройдена/);
    expect(filmQaText(qa, 'ka')).toMatch(/^ხარისხის შემოწმება გავლილია/);
  });
});
