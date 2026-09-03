export const operationSelectorSchema = {
  type: 'object',
  properties: { operation: { type: 'string', minLength: 1 } },
  required: ['operation'],
  additionalProperties: false
};

/** Argument groups shared by the generic executor and each batch step. */
export const invocationProperties = {
  path: { type: 'object' },
  query: { type: 'object' },
  headers: { type: 'object' },
  body: {},
  contentType: { type: 'string' }
} as const;
