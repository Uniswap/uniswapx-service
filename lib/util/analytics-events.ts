/**
 * Analytics event type constants
 * Used by analytics service (producer) and subscription filters (consumer)
 */
export const ANALYTICS_EVENTS = {
  ORDER_POSTED: 'OrderPosted',
} as const

// Names the post Lambdas' posted-orders delivery stream. Set by the Lambda stack; unset on the
// local stack and in tests, where records stay log lines.
export const POSTED_ORDERS_STREAM_ENV = 'POSTED_ORDERS_ANALYTICS_STREAM'
