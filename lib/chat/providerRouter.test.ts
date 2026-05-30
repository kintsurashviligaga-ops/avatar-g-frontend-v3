/**
 * PHASE 49 §1 — Strict hybrid cognitive-routing decision.
 *
 * `prefersClaudeSpecialist` is the ONLY gate that may divert a request away from
 * the Gemini primary core. The platform contract is:
 *
 *   Gemini  = PRIMARY foundational model — ALL default interactions, customer
 *             chat, prompt execution and (critically) Georgian linguistic
 *             processing must stay Gemini-led.
 *   Claude  = SECONDARY specialist — invoked first ONLY for complex programming,
 *             deep science/math parsing, or large technical blueprints.
 *
 * These tests lock that boundary: anything conversational (especially Georgian)
 * must return false; only the heavy technical signals return true.
 */

import { prefersClaudeSpecialist } from './specialistRouting';

describe('prefersClaudeSpecialist — Claude specialist gate (Gemini stays primary)', () => {
  describe('stays GEMINI-primary (returns false)', () => {
    it('empty / whitespace-only input does not divert to Claude', () => {
      expect(prefersClaudeSpecialist('')).toBe(false);
      expect(prefersClaudeSpecialist('    ')).toBe(false);
      expect(prefersClaudeSpecialist('\n\t  \n')).toBe(false);
    });

    it('a Georgian conversational seed stays on the Gemini core', () => {
      // The exact kind of localized customer chat that MUST remain Gemini-led.
      expect(prefersClaudeSpecialist('გამარჯობა, როგორ ხარ? შემიძლია ვიდეო გავაკეთო?')).toBe(false);
      expect(prefersClaudeSpecialist('შემიქმენი ლამაზი სურათი ზღვის პეიზაჟით')).toBe(false);
      expect(prefersClaudeSpecialist('მინდა ავატარი ჩემი ხმით')).toBe(false);
    });

    it('plain English small-talk stays on the Gemini core', () => {
      expect(prefersClaudeSpecialist('hey, can you make me a short video?')).toBe(false);
      expect(prefersClaudeSpecialist('what can this app do for me today?')).toBe(false);
      expect(prefersClaudeSpecialist('write a friendly birthday message')).toBe(false);
    });

    it('does not false-positive on substrings inside ordinary words', () => {
      // "compile" is a signal, but "compilation" of memories is not a code task;
      // word-boundary anchoring keeps casual prose on Gemini.
      expect(prefersClaudeSpecialist('I love this compilation of holiday photos')).toBe(false);
      expect(prefersClaudeSpecialist('the matrixual vibe of the party')).toBe(false);
    });
  });

  describe('diverts to the CLAUDE specialist (returns true)', () => {
    it('a fenced code block is the strongest programming signal', () => {
      expect(prefersClaudeSpecialist('fix this:\n```ts\nconst x: number = "1";\n```')).toBe(true);
    });

    it('programming keywords route to the specialist', () => {
      expect(prefersClaudeSpecialist('help me refactor this TypeScript module')).toBe(true);
      expect(prefersClaudeSpecialist('debug the stack trace from my python service')).toBe(true);
      expect(prefersClaudeSpecialist('what is the big-O complexity of this algorithm?')).toBe(true);
      expect(prefersClaudeSpecialist('write a unit test for this endpoint')).toBe(true);
      expect(prefersClaudeSpecialist('there is a race condition in my async/await code')).toBe(true);
    });

    it('deep science / math parsing routes to the specialist', () => {
      expect(prefersClaudeSpecialist('compute the integral of x^2 dx')).toBe(true);
      expect(prefersClaudeSpecialist('prove this theorem using linear algebra')).toBe(true);
      expect(prefersClaudeSpecialist('find the eigen values of this matrix')).toBe(true);
      expect(prefersClaudeSpecialist('explain the probability distribution here')).toBe(true);
    });

    it('large technical blueprints route to the specialist', () => {
      expect(prefersClaudeSpecialist('draft a system design for this service')).toBe(true);
      expect(prefersClaudeSpecialist('write a technical specification document')).toBe(true);
      expect(prefersClaudeSpecialist('I need a migration plan for the database')).toBe(true);
      expect(prefersClaudeSpecialist('produce an implementation plan blueprint')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(prefersClaudeSpecialist('REFACTOR my TYPESCRIPT')).toBe(true);
      expect(prefersClaudeSpecialist('SYSTEM DESIGN review')).toBe(true);
    });
  });
});
