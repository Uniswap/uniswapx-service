# UniswapX Service

[![Unit Tests](https://github.com/Uniswap/uniswapx-service/actions/workflows/CI.yml/badge.svg)](https://github.com/Uniswap/uniswapx-service/actions/workflows/CI.yml)

UniswapX Service is an API to propagate signed, executable UniswapX orders. Swappers can post their signed orders which can be fetched by fillers for execution.

## Getting Started

1. Install and build the package
   ```
   yarn && yarn build
   ```
2. To deploy the API to your AWS account run:

   ```
   cdk deploy GoudaServiceStack
   ```

   Once complete it will output the url of your api:

   ```
   GoudaServiceStack.Url = https://...
   ```

3. (optional) To run dynamo-db integration tests, you need to have Java Runtime installed (https://www.java.com/en/download/manual.jsp).

## End-to-end Tests

1. Deploy your API using the intructions above.

1. Add your API url to your `.env` file as `UNISWAP_API`

   ```
   UNISWAP_API='<YourUrl>'
   ```

1. Run the tests with:
   ```
   yarn test:e2e
   ```

## Development Cycle

To test your changes you must redeploy your service. The dev cycle is thus:

1. Make code changes. Make sure all env variables are present in the .env file:

```
FAILED_EVENT_DESTINATION_ARN=<>
RPC_1=<>
RPC_5=<>
RPC_137=<>
RPC_11155111=<>
RPC_42161=<>
RPC_10=<>

# Only need these if testing against custom contract deployments
DL_REACTOR_TENDERLY=<>
QUOTER_TENDERLY=<>
PERMIT_TENDERLY=<>

# Only needed to run tests
LABS_COSIGNER=<valid evm address>  # needed for certain unit tests
```

1. `yarn build && cdk deploy GoudaServiceStack`

1. `yarn test:e2e`

1. If failures, look at logs in Cloudwatch Insights

1. Repeat

## API Endpoints

### POST /order

Submit a signed UniswapX order. The endpoint URL format is:

```
POST https://<your-api-url>/order
```

#### Request Body

The request body should include the signed order:

```json
{
  "encodedOrder": "0x...",
  "signature": "0x...",
  "chainId": 1,
  "orderType": "Dutch_V2",
  "quoteId": "optional-quote-id",
  "requestId": "optional-request-id"
}
```

For hybrid orders, an optional `hardQuote` field can be included (see Hybrid Orders section below).

#### Response

On success (HTTP 201), the endpoint returns the order hash:

```json
{
  "hash": "0x..."
}
```

#### Hybrid Orders

Hybrid orders currently mutually-exclusively support both Dutch auction (price curve) and priority order (basefee scaling) mechanisms.

##### Dutch-style Hybrid Orders
**Hybrid orders with a price curve (priceCurve.length > 0)**

These orders use Dutch auction mechanics. They can optionally include a `hardQuote` field to calculate the supplemental price curve:

```
POST https://<your-api-url>/order
Content-Type: application/json

{
  "encodedOrder": "0x...",
  "signature": "0x...",
  "chainId": 1,
  "orderType": "Hybrid",
  "quoteId": "quote-id",
  "requestId": "request-id",
  "hardQuote": {
    "quoteId": "quote-id",
    "requestId": "request-id",
    "tokenInChainId": 1,
    "tokenOutChainId": 1,
    "tokenIn": "0x...",
    "tokenOut": "0x...",
    "input": {
      "token": "0x...",
      "amount": "1000000"
    },
    "outputs": [{
      "token": "0x...",
      "amount": "2000000",
      "recipient": "0x..."
    }],
    "swapper": "0x...",
    "filler": "0x...",
    "orderHash": "0x...",
    "createdAt": 1234567890,
    "createdAtMs": "1234567890000"
  }
}
```

##### Priority-style Hybrid Orders
**Hybrid orders without a price curve (priceCurve.length == 0)**

These orders use priority fee scaling mechanics and do not require a `hardQuote`:

```
POST https://<your-api-url>/order
Content-Type: application/json

{
  "encodedOrder": "0x...",
  "signature": "0x...",
  "chainId": 1,
  "orderType": "Hybrid",
  "quoteId": "optional-quote-id",
  "requestId": "optional-request-id"
}
```

### GET /orders

Retrieve orders from the service (example):

```
GET https://<your-api-url>/orders?chainId=1&orderStatus=open&orderType=Hybrid
```

Query parameters:
- `chainId`: The chain ID to filter orders by
- `orderStatus`: Filter by order status (e.g., `open`, `filled`, `cancelled`)
- `orderHash`: Get a specific order by hash
- `orderHashes`: Comma-separated list of order hashes to retrieve
- `swapper`: Filter orders by swapper address
- `filler`: Filter orders by filler address
- `orderType`: Filter by order type. Valid values:
  - `Dutch` - Dutch V1 orders
  - `Dutch_V2` - Dutch V2 orders
  - `Dutch_V3` - Dutch V3 orders
  - `Dutch_V1_V2` - Both Dutch V1 and V2 orders
  - `Priority` - Priority orders
  - `Hybrid` - Hybrid orders
  - `Limit` - Limit orders
  - `Relay` - Relay orders
- `limit`: Maximum number of orders to return
- `cursor`: Pagination cursor for retrieving additional results
- `sortKey`: Field to sort by (requires `sort` parameter)
- `sort`: Sort order (e.g., `gt(0)` for ascending)
- `desc`: Boolean to sort in descending order
- `executeAddress`: Filter orders by execution address
- `pair`: Filter orders by token pair

## Order Notification Schema

Depending on the filler preferences, the notification webhook can POST orders with a specific exclusive filler address or all new orders. The following schema is what the filler execution endpoint can expect to receive.

```
{
   orderHash: string,
   createdAt: number,
   signature: string,
   offerer: string,
   orderStatus: string,
   encodedOrder: string,
   chainId: number,
   quoteId?: string,
   filler?: string,
}
```
