import { kickoffOrderTrackingSfn, OrderTrackingSfnInput } from '../../lib/handlers/shared/sfn'

export type StartTrackingCall = { input: OrderTrackingSfnInput; stateMachineArn: string }

// The service calls kickoffOrderTrackingSfn directly, so there is nothing to inject yet. Each test
// file using this declares, once:
//   jest.mock('<path to>/lib/handlers/shared/sfn', () => ({ kickoffOrderTrackingSfn: jest.fn() }))
// and this records through that mock. The most recently created instance is the one that records.
export class RecordingStartTracking {
  public readonly calls: StartTrackingCall[] = []
  private nextError?: Error

  constructor() {
    if (!jest.isMockFunction(kickoffOrderTrackingSfn)) {
      throw new Error('RecordingStartTracking needs jest.mock of lib/handlers/shared/sfn in the test file')
    }
    jest.mocked(kickoffOrderTrackingSfn).mockImplementation(async (input, stateMachineArn) => {
      this.calls.push({ input, stateMachineArn })
      const error = this.nextError
      this.nextError = undefined
      if (error) {
        throw error
      }
    })
  }

  // The next kickoff rejects with `error`; later ones succeed again.
  failNextWith(error: Error): void {
    this.nextError = error
  }
}
