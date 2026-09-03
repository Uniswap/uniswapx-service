# uniswapx-service

[![Unit Tests](https://github.com/Uniswap/uniswapx-service/actions/workflows/CI.yml/badge.svg)](https://github.com/Uniswap/uniswapx-service/actions/workflows/CI.yml)

The service that propagates signed [UniswapX](https://docs.uniswap.org/contracts/uniswapx/overview)
orders. Swappers submit orders — self-contained Permit2 instructions that anyone may execute
onchain — and this service validates them, stores them, tracks their lifecycle, and serves
them to the fillers who compete to execute them.

The service holds no funds and takes no custody: every order it stores is inert until a filler
submits it to a reactor contract. What it does own is the truth about order *state* — open,
filled, cancelled, expired — and most of the machinery here exists to keep that truth current.

## The life of an order

1. **Posted.** `POST /dutch-auction/order` (or `/limit/order`) receives
   `{ encodedOrder, signature, chainId, orderType, ... }`. The body is schema-validated,
   decoded with `@uniswap/uniswapx-sdk`, checked offchain (deadlines, decay windows, cosigner)
   and onchain, then written to DynamoDB. Priority and Hybrid orders are cosigned here with a
   KMS secp256k1 key that never leaves AWS.
2. **Tracked.** Persisting an order starts a Step Functions execution (`check-order-status`)
   that polls chain state until the order reaches a terminal status:
   `open → filled | cancelled | expired | error | insufficient-funds`. A reaper task (ECS)
   sweeps for orders the state machine lost track of.
3. **Served.** Fillers poll `GET /orders` with filters. Responses are validated against the
   same joi schemas the published API docs are pinned to (see below).

## API

| This stack                 | Public (`api.uniswap.org/v2`) | Purpose                            |
| -------------------------- | ----------------------------- | ---------------------------------- |
| `POST /dutch-auction/order`| fronted by the Trading API    | Submit a signed order              |
| `GET /dutch-auction/orders`| `GET /orders`                 | Order feed for fillers             |
| `POST /limit/order`        | fronted by the Trading API    | Submit a signed limit order        |
| `GET /limit/orders`        | `GET /limit-orders`           | Limit order feed                   |
| `GET /dutch-auction/nonce` | not exposed                   | Next Permit2 nonce for an address  |
| `GET /unimind`             | not exposed                   | Unimind parameters (internal)      |
| `GET /docs.json`, `/api-docs` | `GET /uniswapx/docs`       | OpenAPI spec and Swagger UI        |

Query semantics worth knowing before you file a bug:

- `GET /orders` requires at least one filter (`orderHash`, `orderHashes`, `chainId`,
  `orderStatus`, `swapper`, `filler`, `pair`). A bare `?limit=10` is a 400 by design —
  there are no unbounded scans.
- `swapper` cannot be combined with `chainId`.
- `GET /orders` returns a single page of the newest orders (`createdAt` descending, at most 50).
  `sortKey=createdAt`, `sort=gt(0)` and `desc=true` are accepted (they describe that page) and
  dropped; any other value, or any `cursor`, is a 400. Every distinct page or ordering used to
  be its own read against the hot `chainId_orderStatus` partitions.
- Open-order queries that add a `filler` or `swapper` are answered from the cached
  chain/status page, filtered in memory. Terminal statuses read their own index.
- `GET /limit-orders` still pages with `cursor` and accepts `sortKey`/`sort`/`desc`:
  `orderHashes` cannot be combined with `sortKey`, and `sortKey` is required whenever `sort`
  or `desc` is present. Use it, not `GET /orders?orderType=Limit`, to enumerate limit orders.

The full contract lives in [swagger.json](./swagger.json), served at
<https://api.uniswap.org/v2/uniswapx/docs>. It is pinned to the joi validators by
[test/unit/swagger.test.ts](./test/unit/swagger.test.ts): change the API or the spec without
changing the other and `yarn test` names the exact divergence. See
[.CONTRIBUTING.md](./.CONTRIBUTING.md) for the editing workflow.

## Layout

| Path                | Contents                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `bin/`              | CDK app: `api-stack` (API Gateway + WAF), `lambda-stack`, `dynamo-stack`, `step-function-stack` / `status-stack`, `cron-stack`, `reaper-stack` (ECS), `dashboard-stack`, `kms-stack` |
| `lib/handlers/`     | Lambda entry points: `post-order`, `get-orders`, `get-limit-orders`, `get-nonce`, `get-unimind`, `check-order-status`, `order-notification`, `get-docs` |
| `lib/models/`       | Order types: Dutch V1/V2/V3, Priority, Hybrid, Relay, Limit                                                                                 |
| `lib/services/`     | `OrderDispatcher` routes by order type into the order services                                                                              |
| `lib/repositories/` | DynamoDB access, one repository per order family, plus index mappers                                                                        |
| `lib/crons/`        | `unimind-algorithm` (parameter updates), `gs-reaper` (status hygiene)                                                                       |

## Development

There is no local server; the dev cycle runs against a real AWS account: build, deploy,
exercise, read CloudWatch.

Prerequisites: Node ≥ 20, yarn, Java (DynamoDB Local for tests), AWS credentials.

```bash
yarn && yarn build
cdk deploy GoudaServiceStack   # outputs your API url
```

Environment (`.env`):

| Variable                       | Meaning                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `RPC_PREFIX_URL`               | Base RPC URL. `getRpcUrl(chainId)` appends `/<chainId>`, so the endpoint must route per-chain on that suffix |
| `RPC_HEADER_SECRET`            | Sent as `x-internal-service-secret` on every RPC request; omitted when unset                               |
| `FAILED_EVENT_DESTINATION_ARN` | SNS destination for failed lambda events                                                                   |
| `UNISWAP_API`                  | Deployed API url — e2e tests only                                                                          |
| `LABS_COSIGNER`                | Any valid EVM address — certain unit tests only                                                            |

## Tests

| Tier        | Command          | Needs                              |
| ----------- | ---------------- | ---------------------------------- |
| Unit        | `yarn test`      | Java (DynamoDB Local)              |
| Integration | `yarn test:integ`| Java                               |
| End-to-end  | `yarn test:e2e`  | A deployed stack + `UNISWAP_API`   |

CI runs lint, unit tests, and `rdme openapi:validate` against the swagger.

## Alerting

CloudWatch alarms live in `api-stack` (API Gateway 5xx/4xx/latency), `lambda-stack` (per-endpoint
5xx rates, Get Orders Lambda throttles, notification and step-function error rates) and
`dynamo-stack` (table throttles/errors and read throttles on the hot Orders GSIs). Every alarm
notifies through `bin/stacks/alerting.ts`: the Slack chatbot topic on ALARM, and the incident.io
CloudWatch connector on ALARM **and** OK. incident.io only resolves an alert on OK and folds later
ALARMs into an unresolved one, so an alarm without an OK action pages exactly once, ever. The
connector endpoint is a credential (the alert-source id in the URL authorizes the caller) and is
read from Secrets Manager via `INCIDENT_IO_CLOUDWATCH_ENDPOINT_SECRET_ARN` in `bin/app.ts`; it must
never be committed.

## Sharp edges

- **The public edge rewrites paths.** `api.uniswap.org/v2/orders` maps to this stack's
  `/dutch-auction/orders`. Don't grep this repo for the public path, and don't quote the
  internal path to integrators.
- **`type: "DutchLimit"`** still appears in responses — a deprecated alias kept for backwards
  compatibility until legacy rows are purged. Treat it as the Dutch shape.
- **Order status lags the chain.** Transitions come from the polling state machine and the
  reaper, not from the fill transaction itself, so a just-filled order may briefly read `open`.
- **`kms-stack` is `RETAIN`ed on purpose.** The key is the order cosigner; changing the
  construct orphans it. Read the comment in the file before touching it.
- **"Gouda"** is the service's original codename. `GoudaServiceStack`, the dashboards, and the
  WAF metrics all use it; this repo and that stack are the same thing.
