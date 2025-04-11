import { default as Logger } from 'bunyan'
import { UnimindStatistics } from "../crons/unimind-algorithm";
import { UnimindParameters } from "../repositories/unimind-parameters-repository";
import { IUnimindAlgorithm } from "../util/unimind";
import { QuoteMetadata } from '../repositories/quote-metadata-repository';

export type PriceImpactIntrinsicParameters = {
    lambda1: number;
    lambda2: number;
    Sigma: number;
}

export class PriceImpactStrategy implements IUnimindAlgorithm<PriceImpactIntrinsicParameters> {
    // Algorithm constants
    private TARGET_FILL_RATE = 0.96;
    private TARGET_WAIT_TIME_IN_BLOCKS = 4;
    private BETA = 1;
    private LAMBDA1_LEARNING_RATE = 1e-10;
    private LAMBDA2_LEARNING_RATE = 1e-1;
    private SIGMA_LEARNING_RATE = 1e-1;

    private LENGTH_OF_AUCTION_IN_BLOCKS = 32;
    private D_FR_D_SIGMA = Math.log(0.00001);

    public unimindAlgorithm(statistics: UnimindStatistics, pairData: UnimindParameters, log: Logger): PriceImpactIntrinsicParameters {
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

        // Update Sigma based on fill rate optimization
        const Sigma_updated = this.updateSigma(fillStatuses, Sigma);
        
        // Create array of valid data points
        const validDataPoints = this.collectValidDataPoints(waitTimes, fillStatuses, priceImpacts);
        
        // Log stats about what data we're using
        log.info({
            totalOrders: waitTimes.length,
            usedForOptimization: validDataPoints.length,
            ignoredOrders: waitTimes.length - validDataPoints.length
        }, 'Unimind algorithm data usage - NOTE: unfilled orders are being ignored');
        
        // Calculate and apply gradients to update lambda parameters
        const { lambda1_updated, lambda2_updated, avgCostFunction, gradientInfo } = 
            this.updateLambdaParameters(validDataPoints, lambda1, lambda2, Sigma, log);
        
        // Log the updates with important context
        log.info({
            avgCostFunction,
            lambda1_old: lambda1,
            lambda1_new: lambda1_updated,
            lambda1_gradient: gradientInfo.lambda1Gradient,
            lambda2_old: lambda2,
            lambda2_new: lambda2_updated,
            lambda2_gradient: gradientInfo.lambda2Gradient,
            sigma_old: Sigma,
            sigma_new: Sigma_updated,
            samples: validDataPoints.length,
            targetFillRate: this.TARGET_FILL_RATE,
            actualFillRate: this.calculateAverageFillRate(fillStatuses),
            targetWaitTime: this.TARGET_WAIT_TIME_IN_BLOCKS,
            avgWaitTime: validDataPoints.length > 0 ? 
                validDataPoints.reduce((sum, p) => sum + p.waitTime, 0) / validDataPoints.length : 0
        }, 'Unimind parameter updates - NOTE: only learning from filled orders');
        
        // Return updated parameters
        return {
            lambda1: lambda1_updated,
            lambda2: lambda2_updated,
            Sigma: Sigma_updated
        };
    }

    /**
     * Updates Sigma parameter based on fill rate optimization
     */
    private updateSigma(fillStatuses: number[], currentSigma: number): number {
        const fillRate = this.calculateAverageFillRate(fillStatuses);
        const d_J_d_FR = 2 * this.BETA * (fillRate - this.TARGET_FILL_RATE);
        const d_FR_d_Sigma = this.D_FR_D_SIGMA;
        const d_J_d_Sigma = d_J_d_FR * d_FR_d_Sigma;

        return currentSigma + this.SIGMA_LEARNING_RATE * d_J_d_Sigma;
    }

    /**
     * Calculates the average fill rate from fill statuses
     */
    private calculateAverageFillRate(fillStatuses: number[]): number {
        return fillStatuses.reduce((sum, status) => sum + status, 0) / fillStatuses.length;
    }

    /**
     * Collects valid data points for optimization (filled orders with defined wait times)
     */
    private collectValidDataPoints(waitTimes: (number | undefined)[], fillStatuses: number[], priceImpacts: number[]): 
        { waitTime: number, priceImpact: number, fillStatus: number }[] {
        
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
        return validDataPoints;
    }

    /**
     * Updates lambda1 and lambda2 parameters using gradient descent
     */
    private updateLambdaParameters(
        validDataPoints: { waitTime: number, priceImpact: number, fillStatus: number }[],
        lambda1: number,
        lambda2: number,
        Sigma: number,
        log: Logger
    ): { 
        lambda1_updated: number, 
        lambda2_updated: number, 
        avgCostFunction: number | undefined,
        gradientInfo: { 
            lambda1Gradient: number | undefined, 
            lambda2Gradient: number | undefined 
        }
    } {
        if (validDataPoints.length === 0) {
            return { 
                lambda1_updated: lambda1, 
                lambda2_updated: lambda2, 
                avgCostFunction: undefined,
                gradientInfo: { lambda1Gradient: undefined, lambda2Gradient: undefined }
            };
        }

        // Calculate gradients for each filled order
        const gradients = validDataPoints.map(({ waitTime, priceImpact }) => {
            return this.calculateGradients(waitTime, priceImpact, lambda1, lambda2, Sigma, log);
        });
        
        // Calculate average cost function and gradients
        const avgCostFunction = gradients.reduce((sum, g) => sum + g.costFunction, 0) / gradients.length;
        const lambda1Gradient = gradients.reduce((sum, g) => sum + g.d_J_d_lambda1, 0) / gradients.length;
        const lambda2Gradient = gradients.reduce((sum, g) => sum + g.d_J_d_lambda2, 0) / gradients.length;
        
        // Update parameters using gradient descent
        const lambda1_updated = lambda1 - this.LAMBDA1_LEARNING_RATE * lambda1Gradient;
        const lambda2_updated = lambda2 - this.LAMBDA2_LEARNING_RATE * lambda2Gradient;

        return { 
            lambda1_updated, 
            lambda2_updated, 
            avgCostFunction,
            gradientInfo: { lambda1Gradient, lambda2Gradient }
        };
    }

    /**
     * Calculates gradients for a single data point
     */
    private calculateGradients(
        waitTime: number, 
        priceImpact: number, 
        lambda1: number, 
        lambda2: number, 
        Sigma: number,
        log: Logger
    ): { 
        costFunction: number, 
        d_J_d_lambda1: number, 
        d_J_d_lambda2: number 
    } {
        // Log input values to help debug
        log.info({
            waitTime,
            priceImpact,
            lambda1,
            lambda2,
            Sigma,
            isWaitTimeValid: !isNaN(waitTime),
            isPriceImpactValid: !isNaN(priceImpact),
            isLambda1Valid: !isNaN(lambda1),
            isLambda2Valid: !isNaN(lambda2),
            isSigmaValid: !isNaN(Sigma)
        }, 'calculateGradients - Input values');

        // Calculate cost function for this data point
        const costFunction = this.calculateCostFunction(waitTime);
        
        // Calculate derivatives
        const d_J_d_WT_value = this.calculateD_J_D_WT(waitTime);
        const d_WT_d_pi_value = this.calculateD_WT_D_Pi(Sigma);
        const d_pi_d_PriceImpactFiller_value = this.calculateD_Pi_D_PriceImpactFiller(priceImpact);
        
        // Log intermediate derivative values
        log.info({
            costFunction,
            d_J_d_WT_value,
            d_WT_d_pi_value,
            d_pi_d_PriceImpactFiller_value,
            isCostFunctionValid: !isNaN(costFunction),
            isD_J_D_WT_Valid: !isNaN(d_J_d_WT_value),
            isD_WT_D_Pi_Valid: !isNaN(d_WT_d_pi_value),
            isD_Pi_D_PriceImpactFiller_Valid: !isNaN(d_pi_d_PriceImpactFiller_value)
        }, 'calculateGradients - Intermediate values');
        
        // Calculate lambda1 gradient
        const d_PriceImpactFiller_d_lambda1_value = this.calculateD_PriceImpactFiller_D_Lambda1(priceImpact, lambda2);
        const d_J_d_lambda1_value = d_J_d_WT_value * d_WT_d_pi_value * 
            d_pi_d_PriceImpactFiller_value * d_PriceImpactFiller_d_lambda1_value;
        
        log.info({
            d_PriceImpactFiller_d_lambda1_value,
            d_J_d_lambda1_value
        }, 'calculateGradients - Intermediate values (lambda1)');

        // Calculate lambda2 gradient
        const d_PriceImpactFiller_d_Lambda2_value = this.calculateD_PriceImpactFiller_D_Lambda2(lambda1, lambda2, priceImpact);
        const d_Lambda2_d_lambda2_value = this.calculateD_Lambda2_D_Lambda2(lambda2);
        const d_J_d_lambda2_value = d_J_d_WT_value * d_WT_d_pi_value * 
            d_pi_d_PriceImpactFiller_value * d_PriceImpactFiller_d_Lambda2_value * d_Lambda2_d_lambda2_value;
        
        log.info({
            d_PriceImpactFiller_d_Lambda2_value,
            d_Lambda2_d_lambda2_value,
            d_J_d_lambda2_value
        }, 'calculateGradients - Intermediate values (lambda2)');
        
        return {
            costFunction,
            d_J_d_lambda1: d_J_d_lambda1_value,
            d_J_d_lambda2: d_J_d_lambda2_value
        };
    }

    /**
     * Cost function: (wait_time - target_wait_time)^2
     */
    private calculateCostFunction(waitTime: number): number {
        return Math.pow(waitTime - this.TARGET_WAIT_TIME_IN_BLOCKS, 2);
    }

    /**
     * Derivative of cost function with respect to wait time
     */
    private calculateD_J_D_WT(waitTime: number): number {
        return 2 * (waitTime - this.TARGET_WAIT_TIME_IN_BLOCKS);
    }

    /**
     * Derivative of wait time with respect to pi
     */
    private calculateD_WT_D_Pi(Sigma: number): number {
        const exp_Sigma = Math.exp(Sigma);
        return 1 / exp_Sigma;
    }

    /**
     * Derivative of pi with respect to price impact filler
     */
    private calculateD_Pi_D_PriceImpactFiller(priceImpactAmm: number): number {
        return -(1/(1 - priceImpactAmm));
    }

    /**
     * Derivative of price impact filler with respect to lambda1
     */
    private calculateD_PriceImpactFiller_D_Lambda1(priceImpactAmm: number, lambda2: number): number {
        const Lambda2 = this.remapLambda(lambda2);
        const numerator = (1 + Lambda2) * (-1 + priceImpactAmm);
        const denominator = (-1 + Lambda2 * (-1 + 2 * priceImpactAmm));
        return numerator/denominator;
    }

    /**
     * Derivative of price impact filler with respect to Lambda2 (remapped lambda2)
     */
    private calculateD_PriceImpactFiller_D_Lambda2(lambda1: number, lambda2: number, priceImpactAmm: number): number {
        const Lambda2 = this.remapLambda(lambda2);
        const numerator = -2 * (-1 + lambda1) * (-1 + priceImpactAmm) * priceImpactAmm;
        const denominator = Math.pow(1 + Lambda2 - 2 * Lambda2 * priceImpactAmm, 2);
        return numerator / denominator;
    }

    /**
     * Remap lambda2 to a range between -1 and 1
     */
    private remapLambda(lambda: number): number {
        return (2/(1 + Math.exp(-lambda))) - 1;
    }

    /**
     * Derivative of remapped Lambda2 with respect to lambda2
     */
    private calculateD_Lambda2_D_Lambda2(lambda2: number): number {
        return 2 * Math.exp(-lambda2) / Math.pow(1 + Math.exp(-lambda2), 2);
    }

    /**
     * Computes price impact filler from price impact of AMM and intrinsic parameters
     */
    private computePriceImpactFiller(priceImpactOfAmm: number, intrinsicValues: PriceImpactIntrinsicParameters): number {
        const lambda1 = intrinsicValues.lambda1;
        const lambda2 = intrinsicValues.lambda2;
      
        // Map lambda2 to a range between -1 and 1
        const Lambda2 = this.remapLambda(lambda2);
    
        const numerator = (1 - lambda1) * priceImpactOfAmm * (1 - Lambda2);
        const denominator = 1 + Lambda2 - 2 * Lambda2 * priceImpactOfAmm;
        if (denominator === 0) {
            throw new Error('Denominator is 0');
        }
      
        return lambda1 + (numerator / denominator);
    }

    public computePi(intrinsicValues: PriceImpactIntrinsicParameters, extrinsicValues: QuoteMetadata): number {
        const priceImpactOfAmm = extrinsicValues.priceImpact;
        if (priceImpactOfAmm === 1) { // Prevent division by 0
            return 0;
        }
        try {
            const priceImpactFiller = this.computePriceImpactFiller(priceImpactOfAmm, intrinsicValues);
            return (priceImpactOfAmm - priceImpactFiller) / (1 - priceImpactOfAmm);
        } catch (error) {
            return 0;
        }
    }

    public computeTau(intrinsicValues: PriceImpactIntrinsicParameters, extrinsicValues: QuoteMetadata): number {
        const expSigma = Math.exp(intrinsicValues.Sigma);
        const tau = this.LENGTH_OF_AUCTION_IN_BLOCKS * expSigma - this.computePi(intrinsicValues, extrinsicValues);
        return tau;
    }
}


