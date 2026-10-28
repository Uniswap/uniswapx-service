import { StartExecutionCommand } from '@aws-sdk/client-sfn'
import { OrderTrackingSfnInput, StartExecutionClient } from '../../lib/handlers/shared/sfn'

export type StartTrackingCall = { input: OrderTrackingSfnInput; stateMachineArn: string }

// Stands in for the Step Functions client: records each execution the post path starts.
export class RecordingStartTracking implements StartExecutionClient {
  public readonly calls: StartTrackingCall[] = []
  public readonly executionNames: string[] = []
  private nextError?: Error

  async send(command: StartExecutionCommand): Promise<void> {
    const { input, stateMachineArn, name } = command.input
    this.calls.push({ input: JSON.parse(input ?? 'null'), stateMachineArn: stateMachineArn ?? '' })
    this.executionNames.push(name ?? '')
    const error = this.nextError
    this.nextError = undefined
    if (error) {
      throw error
    }
  }

  // The next start rejects with `error`; later ones succeed again.
  failNextWith(error: Error): void {
    this.nextError = error
  }
}
