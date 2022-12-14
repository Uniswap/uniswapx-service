import Logger from 'bunyan'

export class InjectionError extends Error {}
export class SfnInputValidationError extends Error {}
export class DynamoStreamInputValidationError extends Error {}

export const logAndThrowError = (objects: any, msg: string, log: Logger) => {
  log.error(objects, msg)
  throw new Error(msg)
}
