import { IMetrics } from '../../lib/util/metrics'

// Records each putMetric call's arguments as passed.
export class RecordingMetrics implements IMetrics {
  public readonly calls: Parameters<IMetrics['putMetric']>[] = []

  putMetric(...args: Parameters<IMetrics['putMetric']>): void {
    this.calls.push(args)
  }
}
