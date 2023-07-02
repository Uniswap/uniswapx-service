import { StorageResolution, Unit } from 'aws-embedded-metrics';

export interface IMetrics {
  putMetric(key: string, value: number, unit?: Unit | string, storageResolution?: StorageResolution | number): void;
}

export class NullMetrics implements IMetrics {
  putMetric(_key: string, _value: number, _unit?: Unit | string, _storageResolution?: StorageResolution | number) {}
}

export let metrics: IMetrics = new NullMetrics();

export const setGlobalMetrics = (_metric: IMetrics) => {
  metrics = _metric;
};
