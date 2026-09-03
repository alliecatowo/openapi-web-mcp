export type WebMcpErrorCode =
  | 'WEBMCP_UNAVAILABLE'
  | 'SPEC_NOT_READY'
  | 'SPEC_INVALID'
  | 'OPERATION_NOT_FOUND'
  | 'OPERATION_AMBIGUOUS'
  | 'OPERATION_UNSUPPORTED'
  | 'INPUT_INVALID'
  | 'CONTENT_TYPE_UNSUPPORTED'
  | 'AUTH_REQUIRED'
  | 'NETWORK_ERROR'
  | 'CORS_ERROR'
  | 'ABORTED'
  | 'RESPONSE_TOO_LARGE'
  | 'SWAGGER_EXECUTION_ERROR'
  | 'READ_ONLY_MODE'
  /** A person locked this operation for agents in the docs UI this session. */
  | 'LOCKED'
  /** The resolved exposure policy hides this operation from agents. */
  | 'OPERATION_DENIED'
  | 'BATCH_TOO_LARGE'
  | 'INTERNAL_ERROR';

export function toolError(code: WebMcpErrorCode, message: string) {
  return { ok: false as const, error: { code, message } };
}
