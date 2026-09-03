import type { AgentConsole, ConsentOutcome, ConsentRequest } from '../../src/ui/console.js';

export interface FakeConsole extends AgentConsole {
  /** Every consent card the gate raised, in order. */
  prompts: ConsentRequest[];
  notes: Array<{ text: string; tone: string }>;
  calls: string[];
  /** Decide how the simulated human answers the next prompt. */
  answer: (request: ConsentRequest) => ConsentOutcome;
}

export function fakeConsole(answer: (request: ConsentRequest) => ConsentOutcome = () => 'once'): FakeConsole {
  const prompts: ConsentRequest[] = [];
  const notes: Array<{ text: string; tone: string }> = [];
  const calls: string[] = [];

  const instance: FakeConsole = {
    prompts,
    notes,
    calls,
    answer,
    element: undefined,
    setStatus: () => {},
    setSummary: () => {},
    async requestConsent(request) {
      prompts.push(request);
      return instance.answer(request);
    },
    beginCall(label) {
      calls.push(label);
      return () => {};
    },
    note(text, tone = 'info') {
      notes.push({ text, tone });
    }
  };

  return instance;
}
