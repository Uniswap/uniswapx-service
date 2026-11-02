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

`bin/stacks/analytics-stack.ts` delivers two log-derived S3 feeds that Data Eng's `data-eng-workflows`
(`lib/spaces/uniswap_x`) loads hourly into BigQuery `uniswap_x.posted_orders` / `archived_orders`:

- `uniswapx-service-<stage>-analytics-posted-orders` — `AnalyticsService.postedOrderRecord`. The post Lambdas
  put it directly on the `GoudaService-<stage>-PostedOrdersDirect` stream (`lib/services/posted-order-analytics.ts`,
  awaited before the post returns: an un-awaited put is frozen with the Lambda and lost). Only when that put fails do
  they log the old `{ $.eventType = "OrderPosted" }` line, which the subscription filter on the post-order and
  post-limit-order log groups still forwards. Both paths write `JSON.stringify(record)`; the direct one adds a
  newline. The record's keys and key order are the file's bytes, so keep them as they are.
- `uniswapx-service-<stage>-analytics-fills` — `orderInfo` of `logFillInfo` / `logCancelled` lines
  (`{ $.orderInfo.orderStatus = "filled" || "cancelled" }` on the check-order-status log group).

Same-account subscription filters → Firehose (5 MB / 300 s, uncompressed, default `YYYY/MM/DD/HH/` prefix) →
`lib/handlers/analytics-firehose-processor` (unwraps the CloudWatch envelope) → S3. Only prod is read; the
loader is IAM user `bq-load-sa` (acct 867401673276), granted by bucket policy. The emitted record is the
schema of record: adding a column means emitting it here and adding a field to the Data Eng load YAML.
Renaming or removing a field breaks Dataform's `orders*` models. Do not override the S3 prefix: the loader lists
objects by hour under it. This is the only subscription filter on each of the three log groups; the
parameterization API no longer receives these logs, so the nested `body` / `orderInfo` shape is now constrained
only by the processor and the Data Eng schema.

## Cross-Account IAM Roles (backend monorepo, ECO-861)

`bin/stacks/iam-stack.ts` creates two roles per stage that the UniswapX service being built in the
`backend` monorepo assumes cross-account, scoped to `Orders`, `LimitOrders`, `Nonces`, the per-chain tracking
state machines and the chain owner file (`lib/chain-owners/location.ts`):

- `uniswapx-shadow-read-<stage>` — Get/BatchGet/Query/DescribeTable on the three tables and the order tables'
  indexes, DescribeStream/GetRecords/GetShardIterator/ListStreams on the order tables' streams, and GetObject
  on the owner file. Used first, by the shadow comparator and by nonce reads.
- `uniswapx-orders-write-<stage>` — Put/Update/Get/Query/ConditionCheckItem on the three tables and indexes
  (the post transaction's order put and nonce update are authorized by these), StartExecution on the
  tracking state machines, and GetObject on the owner file. No Delete, no Scan, no batch writes. Stays
  unassumed until uniswapx writes; revoking it is the rollback.

Both owner-file grants are conditioned on `s3:ResourceAccount` = this account, because the bucket name is
derived rather than created by this stack.

Trust is per stage: beta trusts backend dev (411170392337) + staging (413367642260), prod trusts backend prod
(654200013602), each statement narrowed with `aws:PrincipalArn` to that account's ECS task role (`uniswapx-ecsTaskRole-*`,
not the wider `uniswapx-*`, which would admit other roles and bypass the backend cutover flag). Local stacks
do not create the nested stack at all (an empty nested stack fails to deploy). Role ARNs are stack outputs (`ShadowReadRoleArn`, `OrdersWriteRoleArn`). This is a
transitional arrangement that goes away with the DynamoDB migration; do not widen it to other tables or actions.

## Chain Owner File (migration to backend uniswapx)

While posting and tracking move to the backend `uniswapx` service one chain at a time, one JSON object per
account says who owns each chain: `s3://uniswapx-chain-owners-<account>/chain-owners.json`
(`lib/chain-owners/`, created by `bin/stacks/chain-owners.ts`).

```json
{ "chains": { "1": { "posting": "legacy", "tracking": "legacy" }, "8453": { "posting": "uniswapx", "tracking": "draining" } } }
```

- `posting`: `legacy` | `uniswapx`. `tracking`: `legacy` | `draining` | `phase1`. Legacy writes a chain's statuses only
  while `tracking` is `legacy`; nobody writes them while it is `draining`.
- Legacy reads it before every tracker poll (a run on a non-legacy chain ends at once, via the state machine's
  `trackingHandedOff` succeed state, with no restart, analytics or write), before each reaper write, and before
  starting tracking for a new post. Each process reuses a read for 30 s, so a flip takes up to 30 s to land.
- A chain missing from the file is legacy / legacy. A failed read or an invalid file (one bad entry invalidates
  the whole file) emits `ChainOwnersUnreadable` (SEV3 alarm after two 5-minute periods in a row); the reader keeps
  the last file it read successfully, and only a process that has never read one treats every chain as legacy /
  legacy. So a bad edit still reaches new processes as all-legacy: check it parses before uploading. The uniswapx
  side must read it with the same rules.
- CDK creates the object once (every chain on legacy) and never writes it again, so a deploy can't undo a flip.
  Edits are by hand. Upload with `--if-match` on the ETag you downloaded, so a concurrent edit is rejected
  (`PreconditionFailed`: download again and redo yours) instead of silently lost. `--if-match` on
  `put-object` needs a late-2024 or newer AWS CLI (2.17 doesn't have it). The bucket's versions are the
  history:

```bash
aws s3api get-object --bucket uniswapx-chain-owners-<account> --key chain-owners.json chain-owners.json  # note ETag
yarn build && node -e "require('./dist/lib/chain-owners/owners').parseChainOwners(require('fs').readFileSync('chain-owners.json', 'utf8'))"
aws s3api put-object --bucket uniswapx-chain-owners-<account> --key chain-owners.json --body chain-owners.json \
  --content-type application/json --if-match '<ETag from get-object>'
aws s3api list-object-versions --bucket uniswapx-chain-owners-<account> --prefix chain-owners.json
```

## Gotchas

- `pair` on order entities (and the `pair-createdAt-all` GSI behind `GET /orders?pair=`) has had no writer since the Unimind quote-metadata path was removed in Sep 2026. Existing rows keep the attribute; new orders never set it.

## Auto-Update Instructions

After changes to files in this directory, run `/update-claude-md` to keep this documentation synchronized with the codebase.
