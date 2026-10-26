// Freezes Date.now() and `new Date()` at `now` while every timer stays real, so I/O such as
// DynamoDB Local calls keeps running. Move time with jest.setSystemTime(); undo with restoreClock().
// A jest.spyOn(Date, 'now') spy can't do this: it doesn't reach `new Date()`, which dynamodb-toolbox
// uses to stamp _ct and _md.
export function freezeClock(now: number | Date): void {
  jest.useFakeTimers({
    now,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  })
}

export function restoreClock(): void {
  jest.useRealTimers()
}
