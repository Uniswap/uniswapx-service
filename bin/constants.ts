// IMPORANT: Once this has been changed once from the original value of 'Template',
// do not change again. Changing would cause every piece of infrastructure to change
// name, and thus be redeployed. Should be camel case and contain no non-alphanumeric characters.
export const SERVICE_NAME = 'GoudaService'

// CloudWatch Logs subscription filter patterns
export const FILTER_PATTERNS = {
  TERMINAL_ORDER_STATE: '{ $.orderInfo.orderStatus = "filled" || $.orderInfo.orderStatus = "cancelled" }',
} as const