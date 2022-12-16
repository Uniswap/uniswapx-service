export class InjectionError extends Error {}
export class SfnInputValidationError extends Error {}
export class DynamoStreamInputValidationError extends Error {}

export const rejectAfterDelay = (ms: number): Promise<void> =>
  new Promise((_, reject) => {
    setTimeout(reject, ms, new Error('Request timed out.'))
  })
