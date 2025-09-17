// IMPORANT: Once this has been changed once from the original value of 'Template',
// do not change again. Changing would cause every piece of infrastructure to change
// name, and thus be redeployed. Should be camel case and contain no non-alphanumeric characters.
export const SERVICE_NAME = 'GoudaService'
export const HEALTH_CHECK_PORT = 80
export const UNIMIND_ALGORITHM_CRON_INTERVAL = 15 // minutes

// CloudWatch Logs subscription filter patterns
export const FILTER_PATTERNS = {
  ORDER_POSTED: '{ $.eventType = "OrderPosted" }',
  UNIMIND_RESPONSE: '{ $.eventType = "UnimindResponse" }',
  UNIMIND_PARAMETER_UPDATE: '{ $.eventType = "UnimindParameterUpdate" }',
  TERMINAL_ORDER_STATE: '{ $.orderInfo.orderStatus = "filled" || $.orderInfo.orderStatus = "cancelled" }',
  INSUFFICIENT_FUNDS: '{ $.orderInfo.orderStatus = "insufficient-funds" }',
} as const