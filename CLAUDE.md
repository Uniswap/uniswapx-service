# UniswapX Service

## Overview

TypeScript API service for propagating signed UniswapX orders. Swappers post signed orders which fillers can fetch for execution. Built with AWS CDK for infrastructure.

## Commands

```bash
yarn && yarn build      # Install dependencies and compile
yarn test               # Run unit tests
yarn test:integ --runInBand  # Integration tests (requires Java); suites share one DynamoDB Local and race in parallel, so serialize as CI's yarn coverage does
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
- `lib/models/` - Order types (DutchV1/V2/V3, Priority, Limit)
- `lib/repositories/` - DynamoDB repositories
- `lib/services/` - Business logic (OrderDispatcher, UniswapXOrderService)
- `lib/util/` - Validators, helpers, constants
- `test/` - Unit, integration, and e2e tests

## Environment Variables

Required for deployment:
- `RPC_PREFIX_URL` - Base RPC URL; `getRpcUrl(chainId)` in `lib/Config.ts` appends `/<chainId>`.
- `RPC_HEADER_SECRET` - Value sent as the `x-internal-service-secret` header on all RPC requests (see `RPC_HEADERS` in `lib/util/constants.ts`). Omitted when unset.
- `FAILED_EVENT_DESTINATION_ARN` - Failed event SNS ARN

Optional:
- `GET_ORDERS_CACHE_TTL_MS` - TTL for the read-path query cache on the get-orders/get-limit-orders Lambdas (default 500; set to `0` to disable the cache). One entry per partition; the DynamoDB read rate it allows is roughly `executionEnvironments / TTL` per hot partition, which the Get Orders Lambda's reserved concurrency (`bin/app.ts`) caps.

For tests:
- `UNISWAP_API` - Deployed API URL (e2e tests)
- `LABS_COSIGNER` - Valid EVM address (unit tests)

## Analytics Feed (Data Eng)

`bin/stacks/analytics-stack.ts` delivers two log-derived S3 feeds that Data Eng's `data-eng-workflows`
(`lib/spaces/uniswap_x`) loads hourly into BigQuery `uniswap_x.posted_orders` / `archived_orders`:

- `uniswapx-service-<stage>-analytics-posted-orders` — `body` of `AnalyticsService.logOrderPosted` lines
  (`{ $.eventType = "OrderPosted" }` on the post-order and post-limit-order log groups).
- `uniswapx-service-<stage>-analytics-fills` — `orderInfo` of `logFillInfo` / `logCancelled` lines
  (`{ $.orderInfo.orderStatus = "filled" || "cancelled" }` on the check-order-status log group).

Same-account subscription filters → Firehose (5 MB / 300 s, uncompressed, default `YYYY/MM/DD/HH/` prefix) →
`lib/handlers/analytics-firehose-processor` (unwraps the CloudWatch envelope) → S3. Only prod is read; the
loader is IAM user `bq-load-sa` (acct 867401673276), granted by bucket policy. The emitted record is the
schema of record: adding a column means emitting it here and adding a field to the Data Eng load YAML.
Renaming or removing a field breaks Dataform's `orders*` models. Do not override the S3 prefix or change the
log-line shape (nested `body` / `orderInfo`) while the legacy cross-account filters to the parameterization
API still exist; CloudWatch allows two filters per log group and both slots are in use until those are removed.

## Gotchas

- `pair` on order entities (and the `pair-createdAt-all` GSI behind `GET /orders?pair=`) has had no writer since the Unimind quote-metadata path was removed in Sep 2026. Existing rows keep the attribute; new orders never set it.

## Auto-Update Instructions

After changes to files in this directory, run `/update-claude-md` to keep this documentation synchronized with the codebase.
