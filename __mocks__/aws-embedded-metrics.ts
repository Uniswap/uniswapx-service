const original = jest.requireActual('aws-embedded-metrics')

class MockMetricsLogger {
  public setNamespace = jest.fn()
  public putMetric = jest.fn()
  public flush = jest.fn()
}

const metricScope = jest.fn((fn) => fn(new MockMetricsLogger()))

module.exports = {
  ...original,
  metricScope,
  MockMetricsLogger,
}
