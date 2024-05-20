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
```

1. `yarn build && cdk deploy GoudaServiceStack`

1. `yarn test:e2e`

1. If failures, look at logs in Cloudwatch Insights

1. Repeat

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
