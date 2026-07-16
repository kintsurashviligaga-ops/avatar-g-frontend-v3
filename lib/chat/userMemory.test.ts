/** @jest-environment node */
import { extractProfileFacts, buildProfilePreamble, type ProfileFact } from './userMemory';

const factMap = (facts: ProfileFact[]) => Object.fromEntries(facts.map((f) => [f.key, f.value]));

describe('extractProfileFacts — conservative personal-fact extraction', () => {
  test('weight in English + Georgian (with range clamp)', () => {
    expect(factMap(extractProfileFacts('I weigh 80kg after the holidays')).weight).toBe('80 kg');
    expect(factMap(extractProfileFacts('ჩემი წონა 75 კგ')).weight).toBe('75 kg');
    expect(extractProfileFacts('it cost 5000 kg of effort')).toEqual([]); // out of sane range → ignored
  });

  test('height', () => {
    expect(factMap(extractProfileFacts('my height is 180cm')).height).toBe('180 cm');
    expect(factMap(extractProfileFacts('სიმაღლე 172 სმ')).height).toBe('172 cm');
  });

  test('age', () => {
    expect(factMap(extractProfileFacts("I'm 25 years old")).age).toBe('25');
    expect(factMap(extractProfileFacts('მე 30 წლის ვარ')).age).toBe('30');
  });

  test("user's OWN name in English / Georgian / Russian", () => {
    expect(factMap(extractProfileFacts('my name is Gaga')).name).toBe('Gaga');
    expect(factMap(extractProfileFacts('call me Nika')).name).toBe('Nika');
    expect(factMap(extractProfileFacts('меня зовут Гага')).name).toBe('Гага');
    // The launch-contract example: name + age from one Georgian turn.
    const facts = factMap(extractProfileFacts('ჩემი სახელია გაგა, ვარ 30 წლის'));
    expect(facts.name).toBe('გაგა');
    expect(facts.age).toBe('30');
  });

  test('user-name extractor does NOT fire on phrasal-verb tails', () => {
    expect(factMap(extractProfileFacts('call me back later')).name).toBeUndefined();
    expect(factMap(extractProfileFacts('please call me now')).name).toBeUndefined();
  });

  test('companion / bot-name override', () => {
    expect(factMap(extractProfileFacts('from now on I will call you Jarvis')).preferred_bot_name).toBe('Jarvis');
    expect(factMap(extractProfileFacts('your name is Nova now')).preferred_bot_name).toBe('Nova');
  });

  test('does NOT extract from unrelated chatter', () => {
    expect(extractProfileFacts('what is the weather like today?')).toEqual([]);
    expect(extractProfileFacts('write me a poem about the sea')).toEqual([]);
  });

  test('does NOT mint bogus facts from substrings inside other words (\\b-anchored)', () => {
    expect(extractProfileFacts('the average temperature is 50 degrees')).toEqual([]); // "age" in "average"
    expect(extractProfileFacts('please install version 180 today')).toEqual([]);       // "tall" in "install"
    expect(extractProfileFacts('the message has 3 parts')).toEqual([]);                // "age" in "message"
  });
});

describe('buildProfilePreamble', () => {
  test('null when there are no facts', () => {
    expect(buildProfilePreamble([])).toBeNull();
  });

  test('formats bio facts + the preferred bot name', () => {
    const p = buildProfilePreamble([
      { key: 'weight', value: '80 kg', category: 'personal_bio' },
      { key: 'preferred_bot_name', value: 'Jarvis', category: 'preferred_bot_name' },
    ]);
    expect(p).toContain('USER PROFILE');
    expect(p).toContain('weight: 80 kg');
    expect(p).toContain('"Jarvis"');
  });
});
