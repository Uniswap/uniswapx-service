export const currentTimestampInSeconds = () => Math.floor(Date.now() / 1000).toString()
export const currentYearMonthDate = () => new Date().toISOString().split('T')[0]
