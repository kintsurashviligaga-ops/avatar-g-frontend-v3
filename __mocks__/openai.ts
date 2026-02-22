type MockCreate = (...args: unknown[]) => Promise<unknown>;

let mockCreate: MockCreate = async () => ({
  choices: [{ message: { content: 'mock reply' } }],
});

export function __setMockCreate(fn: MockCreate): void {
  mockCreate = fn;
}

export function __resetMockCreate(): void {
  mockCreate = async () => ({
    choices: [{ message: { content: 'mock reply' } }],
  });
}

class OpenAI {
  chat = {
    completions: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  };

  constructor(_opts: unknown) {}
}

export default OpenAI;
