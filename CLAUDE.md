# UniswapX Service

## Overview

TypeScript API service for propagating signed UniswapX orders. Swappers post signed orders which fillers can fetch for execution. Built with AWS CDK for infrastructure.

## Commands

```bash
yarn && yarn build      # Install dependencies and compile
yarn test               # Run unit tests (no Java or .env needed)
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
- `lib/services/` - Business logic (OrderPoster validates, stores and starts tracking a posted order; GET reads by order type live in `lib/handlers/get-orders/order-reader.ts`)
- `lib/util/` - Validators, helpers, constants
- `test/` - Unit, integration, and e2e tests

## Environment Variables

Required for deployment:
- `RPC_PREFIX_URL` - Base RPC URL; `getRpcUrl(chainId)` in `lib/Config.ts` appends `/<chainId>`.
- `RPC_HEADER_SECRET` - Value sent as the `x-internal-service-secret` header on all RPC requests (see `RPC_HEADERS` in `lib/util/constants.ts`). Omitted when unset.

Optional:
- `GET_ORDERS_CACHE_TTL_MS` - TTL for the read-path query cache on the get-orders/get-limit-orders Lambdas (default 500; set to `0` to disable the cache). One entry per partition; the DynamoDB read rate it allows is roughly `executionEnvironments / TTL` per hot partition, which the Get Orders Lambda's reserved concurrency (`bin/app.ts`) caps.

For tests:
- e2e (`yarn test:e2e`) - the variables listed under `# e2e suite` in `.env.example`; `RUN_LIFECYCLE_TESTS=true` also posts dust mainnet limit orders and tracks them to expiry (only the beta pipeline gate sets it)

## Analytics Feed (Data Eng)

`bin/stacks/analytics-stack.ts` delivers two S3 feeds that Data Eng's `data-eng-workflows`
(`lib/spaces/uniswap_x`) loads hourly into BigQuery `uniswap_x.posted_orders` / `archived_orders`:

- `uniswapx-service-<stage>-analytics-posted-orders` — `AnalyticsService.postedOrderRecord`, which the post Lambdas
  put directly on the `GoudaService-<stage>-PostedOrdersDirect` stream (`lib/services/posted-order-analytics.ts`,
  awaited before the post returns: an un-awaited put is frozen with the Lambda and lost). Each record is
  `JSON.stringify(record)` plus a newline; a failed put is dropped and counted (`PostedOrderAnalyticsDropped`). The
  record's keys and key order are the file's bytes, so keep them as they are.
- `uniswapx-service-<stage>-analytics-fills` — `orderInfo` of `logFillInfo` / `logCancelled` lines
  (`{ $.orderInfo.orderStatus = "filled" || "cancelled" }` on the check-order-status log group).

Both streams buffer 5 MB / 300 s, uncompressed, under the default `YYYY/MM/DD/HH/` prefix. The fills feed is
a same-account subscription filter → Firehose → `lib/handlers/analytics-firehose-processor` (unwraps the
CloudWatch envelope) → S3. Only prod is read; the
loader is IAM user `bq-load-sa` (acct 867401673276), granted by bucket policy. The emitted record is the
schema of record: adding a column means emitting it here and adding a field to the Data Eng load YAML.
Renaming or removing a field breaks Dataform's `orders*` models. Do not override the S3 prefix: the loader lists
objects by hour under it. The check-order-status log group has only this subscription filter, and the post
log groups have none; the parameterization API no longer receives these logs, so the nested `orderInfo` shape is
constrained only by the processor and the Data Eng schema.

## Cross-Account IAM Roles (backend monorepo, ECO-861)

`bin/stacks/iam-stack.ts` creates two roles per stage that the UniswapX service being built in the
`backend` monorepo assumes cross-account, scoped to `Orders` + `LimitOrders` only (never `Nonces`):

- `uniswapx-shadow-read-<stage>` — Get/BatchGet/Query/DescribeTable on the tables and their indexes, plus
  DescribeStream/GetRecords/GetShardIterator/ListStreams on their streams. Used first, by the shadow
  comparator that diffs the new status tracker against the live tables.
- `uniswapx-orders-write-<stage>` — Put/Update/Get/Query/ConditionCheckItem on the tables and indexes. No
  Delete, no Scan, no batch writes. Stays unassumed until cutover; revoking it is the rollback.

Trust is per stage: beta trusts backend dev (411170392337) + staging (413367642260), prod trusts backend prod
(654200013602), each statement narrowed with `aws:PrincipalArn` to that account's ECS task role (`uniswapx-ecsTaskRole-*`,
not the wider `uniswapx-*`, which would admit other roles and bypass the backend cutover flag). Local stacks
do not create the nested stack at all (an empty nested stack fails to deploy). Role ARNs are stack outputs (`ShadowReadRoleArn`, `OrdersWriteRoleArn`). This is a
transitional arrangement that goes away with the DynamoDB migration; do not widen it to other tables.

## Gotchas

- `pair` on order entities (and the `pair-createdAt-all` GSI behind `GET /orders?pair=`) has had no writer since the Unimind quote-metadata path was removed in Sep 2026. Existing rows keep the attribute; new orders never set it.

## Auto-Update Instructions

After changes to files in this directory, run `/update-claude-md` to keep this documentation synchronized with the codebase.
