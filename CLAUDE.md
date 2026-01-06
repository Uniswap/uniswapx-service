# UniswapX Service

## Overview

TypeScript API service for propagating signed UniswapX orders. Swappers post signed orders which fillers can fetch for execution. Built with AWS CDK for infrastructure.

## Commands

```bash
yarn && yarn build      # Install dependencies and compile
yarn test               # Run unit tests
yarn test:integ         # Run integration tests (requires Java)
yarn test:e2e           # Run end-to-end tests (requires deployed API)
yarn lint               # ESLint check
yarn fix                # Auto-fix lint and prettier issues
yarn coverage           # Run tests with coverage
cdk deploy GoudaServiceStack  # Deploy to AWS
```

## Key Dependencies

<!-- AUTO-GENERATED - Updated by /update-claude-md -->

- **@uniswap/uniswapx-sdk** - UniswapX order types and encoding
- **@uniswap/permit2-sdk** - Permit2 signature validation
- **aws-cdk-lib** - AWS infrastructure as code
- **dynamodb-toolbox** - DynamoDB ORM utilities
- **joi** - Request validation schemas
- **bunyan** - Structured logging
- **axios** - HTTP client for webhooks

## Project Structure

- `bin/` - CDK app entry and stack definitions
- `lib/handlers/` - Lambda handlers (get-orders, post-order, check-status, etc.)
- `lib/models/` - Order types (DutchV1/V2/V3, Priority, Relay, Limit)
- `lib/repositories/` - DynamoDB repositories
- `lib/services/` - Business logic (OrderDispatcher, UniswapXOrderService)
- `lib/util/` - Validators, helpers, constants
- `test/` - Unit, integration, and e2e tests

## Environment Variables

Required for deployment:
- `RPC_1`, `RPC_137`, `RPC_42161`, `RPC_10` - Chain RPC URLs
- `FAILED_EVENT_DESTINATION_ARN` - Failed event SNS ARN

For tests:
- `UNISWAP_API` - Deployed API URL (e2e tests)
- `LABS_COSIGNER` - Valid EVM address (unit tests)

## Auto-Update Instructions

After changes to files in this directory, run `/update-claude-md` to keep this documentation synchronized with the codebase.
