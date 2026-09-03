/**
 * Which operation, if any, the browser agent is executing right now.
 *
 * Exposed so a page can distinguish agent-driven traffic from a person using
 * "Try it out" — for example to tag it in a request interceptor for audit
 * logging. Executions are serialised, so at most one is ever in flight.
 */
export const agentExecution: { current: string | null } = { current: null };
