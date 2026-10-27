import { checkDefined } from '../preconditions/preconditions'

// The cosigners posted orders must carry. CDK sets both on every API Lambda (bin/app.ts).
export function cosignersFromEnv(): { cosigner: string; priorityCosigner: string } {
  return {
    cosigner: checkDefined(process.env.LABS_COSIGNER, 'LABS_COSIGNER is not defined'),
    priorityCosigner: checkDefined(process.env.LABS_PRIORITY_COSIGNER, 'LABS_PRIORITY_COSIGNER is not defined'),
  }
}
