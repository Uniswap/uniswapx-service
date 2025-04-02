import { UnimindStatistics } from "../crons/unimind-algorithm";
import { QuoteMetadata } from "../repositories/quote-metadata-repository";
import { UnimindParameters } from "../repositories/unimind-parameters-repository";
import { IUnimindAlgorithm } from "../util/unimind";

export class BatchedStrategy implements IUnimindAlgorithm {
    public unimindAlgorithm(statistics: UnimindStatistics, pairData: UnimindParameters, log: import("bunyan")) {
        const objective_wait_time = 2;
        const objective_fill_rate = 0.96;
        const learning_rate = 2;
        const auction_duration = 32;
        const previousParameters = JSON.parse(pairData.intrinsicValues);
      
        if (statistics.waitTimes.length === 0 || statistics.fillStatuses.length === 0 || statistics.priceImpacts.length === 0) {
          return previousParameters;
        }
        // Set negative wait times to 0
        statistics.waitTimes = statistics.waitTimes.map((waitTime) => (waitTime && waitTime < 0) ? 0 : waitTime);
      
        const average_wait_time = statistics.waitTimes.reduce((a: number, b) => a + (b === undefined ? auction_duration : b), 0) / statistics.waitTimes.length;
        const average_fill_rate = statistics.fillStatuses.reduce((a: number, b) => a + b, 0) / statistics.fillStatuses.length;
        log.info(`Unimind unimindAlgorithm: average_wait_time: ${average_wait_time}, average_fill_rate: ${average_fill_rate}`)
      
        const wait_time_proportion = (objective_wait_time - average_wait_time) / objective_wait_time;
        const fill_rate_proportion = (objective_fill_rate - average_fill_rate) / objective_fill_rate;
      
        const pi = previousParameters.pi + learning_rate * wait_time_proportion;
        const tau = previousParameters.tau + learning_rate * fill_rate_proportion;
      
        //return a record of pi and tau
        return {
          pi: pi,
          tau: tau,
        };
    }

    public computePi(intrinsicValues: any, extrinsicValues: QuoteMetadata): number {
        return intrinsicValues.pi * extrinsicValues.priceImpact
    }

    public computeTau(intrinsicValues: any, extrinsicValues: QuoteMetadata): number {
        return intrinsicValues.tau * extrinsicValues.priceImpact
    }
}