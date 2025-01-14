export enum ErrorCode {
  OrderParseFail = 'ORDER_PARSE_FAIL',
  InvalidOrder = 'INVALID_ORDER',
  TooManyOpenOrders = 'TOO_MANY_OPEN_ORDERS',
  InternalError = 'INTERNAL_ERROR',
  ValidationError = 'VALIDATION_ERROR',
  TooManyRequests = 'TOO_MANY_REQUESTS',
  InvalidTokenInAddress = 'INVALID_TOKEN_IN_ADDRESS',
  NoIntrinsicValuesFound = 'NO_INTRINSIC_VALUES_FOUND',
}
