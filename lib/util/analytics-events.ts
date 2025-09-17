/**
 * Analytics event type constants
 * Used by analytics service (producer) and subscription filters (consumer)
 */
export const ANALYTICS_EVENTS = {
  ORDER_POSTED: 'OrderPosted',
  ORDER_CANCELLED: 'Cancelled',
  INSUFFICIENT_FUNDS: 'InsufficientFunds',
  UNIMIND_RESPONSE: 'UnimindResponse',
  UNIMIND_PARAMETER_UPDATE: 'UnimindParameterUpdate',
} as const

export type AnalyticsEventType = typeof ANALYTICS_EVENTS[keyof typeof ANALYTICS_EVENTS]