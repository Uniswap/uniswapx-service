import { UNIMIND_DEV_SWAPPER_ADDRESS } from "./constants";
import { UnimindParameters } from "../repositories/unimind-parameters-repository";
import { UnimindStatistics } from "../crons/unimind-algorithm";
import { default as Logger } from 'bunyan'
import { QuoteMetadata } from "../repositories/quote-metadata-repository";

const length_of_auction_in_blocks = 32;

export function unimindAddressFilter(address: string) {
  return address.toLowerCase() === UNIMIND_DEV_SWAPPER_ADDRESS.toLowerCase()
}

/**
 * @notice Adjusts Unimind parameters (intrinsic values) based on historical order statistics
 * @param statistics Aggregated order data containing arrays of wait times, fill statuses, and price impacts
 * @param pairData Previous parameters intrinsic values stored for the pair
 * @return Updated pi and tau parameters
 */
export function unimindAlgorithm(statistics: UnimindStatistics, pairData: UnimindParameters, log: Logger) {
  // Algorithm constants
  const target_fill_rate = 0.96;
  const target_wait_time = 2;
  // const alpha = 1;
  const beta = 1;
  const lambda1_learning_rate = 1;
  const lambda2_learning_rate = 1;
  const Sigma_learning_rate = 1;
  // const decay_granularity_in_blocks = 1;

  const previousParameters = JSON.parse(pairData.intrinsicValues);

  // Check if we have sufficient data
  if (statistics.waitTimes.length === 0 || statistics.fillStatuses.length === 0 || statistics.priceImpacts.length === 0) {
    return previousParameters;
  }

  // Set negative wait times to 0
  statistics.waitTimes = statistics.waitTimes.map((waitTime) => (waitTime && waitTime < 0) ? 0 : waitTime);

  // Algorithm logic
  const { waitTimes, fillStatuses, priceImpacts } = statistics;
  
  // Extract current parameters
  const lambda1 = previousParameters.lambda1;
  const lambda2 = previousParameters.lambda2;
  const Sigma = previousParameters.Sigma;
  
  // Create array of valid data points (the calculation is based on filled orders)
  const validDataPoints: { waitTime: number, priceImpact: number, fillStatus: number }[] = [];
  for (let i = 0; i < waitTimes.length; i++) {
    if (waitTimes[i] !== undefined && priceImpacts[i] !== undefined) {
      validDataPoints.push({
        waitTime: waitTimes[i]!,
        priceImpact: priceImpacts[i],
        fillStatus: fillStatuses[i]
      });
    }
  }
  
  // Log stats about what data we're using
  log.info({
    totalOrders: waitTimes.length,
    usedForOptimization: validDataPoints.length,
    ignoredOrders: waitTimes.length - validDataPoints.length
  }, 'Unimind algorithm data usage - NOTE: unfilled orders are being ignored');
  
  // Calculate gradients for each filled order
  const gradients = validDataPoints.map(({ waitTime, priceImpact }) => {
    // Calculate cost function for this data point
    const costFunction = J(waitTime, target_wait_time);
    
    // Calculate derivatives
    const d_J_d_WT_value = d_J_d_WT(waitTime, target_wait_time);
    const d_WT_d_pi_value = d_WT_d_pi(Sigma);
    const d_pi_d_PriceImpactFiller_value = d_pi_d_PriceImpactFiller(priceImpact);
    
    // Calculate lambda1 gradient
    const d_PriceImpactFiller_d_lambda1_value = d_PriceImpactFiller_d_lambda1(priceImpact, lambda2);
    const d_J_d_lambda1_value = d_J_d_WT_value * d_WT_d_pi_value * d_pi_d_PriceImpactFiller_value * d_PriceImpactFiller_d_lambda1_value;
    
    // Calculate lambda2 gradient
    const d_PriceImpactFiller_d_Lambda2_value = d_PriceImpactFiller_d_Lambda2(lambda1, lambda2, priceImpact);
    const d_Lambda2_d_lambda2_value = d_Lambda2_d_lambda2(lambda2);
    const d_J_d_lambda2_value = d_J_d_WT_value * d_WT_d_pi_value * d_pi_d_PriceImpactFiller_value * d_PriceImpactFiller_d_Lambda2_value * d_Lambda2_d_lambda2_value;
    
    return {
      costFunction,
      d_J_d_lambda1: d_J_d_lambda1_value,
      d_J_d_lambda2: d_J_d_lambda2_value
    };
  });
  
  // If we have no valid data points, return previous parameters
  if (gradients.length === 0) {
    log.warn('No valid data points for Unimind algorithm, keeping previous parameters');
    return previousParameters;
  }
  
  // Calculate average cost function and gradients
  const avgCostFunction = gradients.reduce((sum, g) => sum + g.costFunction, 0) / gradients.length;
  const d_J_d_lambda1_avg = gradients.reduce((sum, g) => sum + g.d_J_d_lambda1, 0) / gradients.length;
  const d_J_d_lambda2_avg = gradients.reduce((sum, g) => sum + g.d_J_d_lambda2, 0) / gradients.length;
  
  // Update parameters using gradient descent
  const lambda1_updated = lambda1 - lambda1_learning_rate * d_J_d_lambda1_avg;
  const lambda2_updated = lambda2 - lambda2_learning_rate * d_J_d_lambda2_avg;

  // Update Sigma with fill rate
  // Calculate average fill rate for the batch
  const fill_rate = statistics.fillStatuses.reduce((sum, status) => sum + status, 0) / statistics.fillStatuses.length;

  const d_J_d_FR = 2 * beta * (fill_rate - target_fill_rate);
  const d_FR_d_Sigma = Math.log(0.00001); // Assume constant for now
  const d_J_d_Sigma = d_J_d_FR * d_FR_d_Sigma;

  const Sigma_updated = Sigma + Sigma_learning_rate * d_J_d_Sigma;
  
  // Log the updates with important context
  log.info({
    avgCostFunction,
    lambda1_old: lambda1,
    lambda1_new: lambda1_updated,
    lambda1_gradient: d_J_d_lambda1_avg,
    lambda2_old: lambda2,
    lambda2_new: lambda2_updated,
    lambda2_gradient: d_J_d_lambda2_avg,
    sigma_old: Sigma,
    sigma_new: Sigma_updated,
    samples: gradients.length,
    targetFillRate: target_fill_rate,
    actualFillRate: statistics.fillStatuses.reduce((sum, status) => sum + status, 0) / statistics.fillStatuses.length,
    targetWaitTime: target_wait_time,
    avgWaitTime: validDataPoints.reduce((sum, p) => sum + p.waitTime, 0) / validDataPoints.length
  }, 'Unimind parameter updates - NOTE: only learning from filled orders');
  
  // Return updated parameters
  return {
    lambda1: lambda1_updated,
    lambda2: lambda2_updated,
    Sigma: Sigma_updated
  };
}

export function computePi(intrinsicValues: any, extrinsicValues: QuoteMetadata) {
  const price_impact_of_amm = extrinsicValues.priceImpact
  const price_impact_filler = compute_price_impact_filler(price_impact_of_amm, intrinsicValues)
  return (price_impact_of_amm- price_impact_filler) / (1 - price_impact_of_amm)
}

function compute_price_impact_filler(price_impact_of_amm: number, intrinsicValues: any) {
  const lambda1 = intrinsicValues.lambda1
  const lambda2 = intrinsicValues.lambda2

  const Lambda2 = (2 / (1 + Math.exp(-lambda2))) - 1
  const numerator = (1 - lambda1) * price_impact_of_amm * (1 - Lambda2)
  const denominator = 1 + Lambda2 - 2 * Lambda2 * price_impact_of_amm

  return lambda1 + (numerator / denominator)
}

export function computeTau(intrinsicValues: any, extrinsicValues: QuoteMetadata) {
  const exp_Sigma = Math.exp(intrinsicValues.Sigma)
  const tau = length_of_auction_in_blocks * exp_Sigma - computePi(intrinsicValues, extrinsicValues)
  return tau
}

function J(wait_time: number, target_wait_time: number) {
  return Math.pow(wait_time - target_wait_time, 2)
}

function d_PriceImpactFiller_d_lambda1(PriceImpactAmm: number, lambda2: number) {
  const Lambda2 = remapLambda(lambda2);
  const numerator = (1 + Lambda2) * (-1 + PriceImpactAmm)
  const denominator = (-1 + Lambda2 * (-1 + 2 * PriceImpactAmm))
  return numerator/denominator
}

function d_PriceImpactFiller_d_Lambda2(lambda1: number, lambda2: number, PriceImpactAmm: number) {
  const Lambda2 = remapLambda(lambda2);
  const numerator = -2 * (-1 + lambda1) * (-1 + PriceImpactAmm) * PriceImpactAmm
  const denominator = (1 + Lambda2 - 2 * Lambda2 * PriceImpactAmm)**2
  return numerator / denominator
}

function remapLambda(lambda: number) {
  return (2/(1 + Math.exp(-lambda))) - 1;
}

function d_Lambda2_d_lambda2(lambda2: number) {
  return 2 * Math.exp(-lambda2) / (1 + Math.exp(-lambda2))**2
}

function d_WT_d_pi(Sigma: number) {
  const exp_Sigma = Math.exp(Sigma)
  return 1 / exp_Sigma;
}

function d_J_d_WT(WT: number, target_WT: number) {
  return 2 * (WT - target_WT);
}

function d_pi_d_PriceImpactFiller(PriceImpactAmm: number) {
  return -(1/(1 - PriceImpactAmm))
}
