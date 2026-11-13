import { readableServiceError } from './serviceErrorText'

describe('readableServiceError (/services/<slug> form)', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}))
  afterEach(() => jest.restoreAllMocks())

  it('maps a known code to the page language', () => {
    expect(readableServiceError({ error: 'rate_limited' }, 'en', 'Failed')).toBe('Too many requests. Wait a minute and try again.')
    expect(readableServiceError({ error: 'rate_limited' }, 'ka', 'ვერ')).toMatch(/ძალიან ბევრი მოთხოვნა/)
  })

  it('reads a code nested under data', () => {
    expect(readableServiceError({ data: { error: 'insufficient_credits' } }, 'en', 'Failed')).toMatch(/credit/i)
  })

  it('never echoes unknown server text', () => {
    expect(readableServiceError({ error: 'TypeError: cannot read properties of undefined' }, 'ka', 'ვერ შეიქმნა')).toBe('ვერ შეიქმნა')
    expect(readableServiceError({ error: 'some_code', message: 'Upstream exploded at line 42' }, 'en', 'Failed')).toBe('Failed')
  })

  it('falls back on empty or odd payloads', () => {
    expect(readableServiceError(null, 'ru', 'Ошибка')).toBe('Ошибка')
    expect(readableServiceError('boom', 'ru', 'Ошибка')).toBe('Ошибка')
    expect(readableServiceError({}, 'ru', 'Ошибка')).toBe('Ошибка')
  })
})
