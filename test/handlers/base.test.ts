import { BaseInjector } from '../../lib/handlers/base'

interface MockContainerInjected {
  foo: string
}

class MockInjector extends BaseInjector<MockContainerInjected> {
  protected buildContainerInjected(): Promise<MockContainerInjected> {
    throw new Error('Method not implemented.')
  }
}

describe('BaseInjector tests', () => {
  it('should throw if handlerName is not defined', () => {
    expect(() => {
      new MockInjector(undefined as any)
    }).toThrow()
  })

  it('should throw if build() method is not called before getRequestInjected()', () => {
    const inj = new MockInjector('foo')
    expect(() => {
      inj.getContainerInjected()
    }).toThrow('Container injected undefined. Must call build() before using.')
  })
})
