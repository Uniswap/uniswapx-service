import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { DashboardStack } from '../../../bin/stacks/dashboard-stack'

type Widget = { x: number; y: number; width: number; height: number; properties: { title?: string; markdown?: string } }

describe('DashboardStack', () => {
  const build = (): DashboardStack => {
    const app = new cdk.App()
    // A concrete region keeps the dashboard body a plain JSON string rather than an Fn::Join.
    const parent = new cdk.Stack(app, 'TestParent', { env: { account: '111111111111', region: 'us-east-2' } })
    return new DashboardStack(parent, 'TestDashboard', {
      apiName: 'test-api',
      postOrderLambdaName: 'post-order-fn',
      getOrdersLambdaName: 'get-orders-fn',
      getNonceLambdaName: 'get-nonce-fn',
      getUnimindLambdaName: 'get-unimind-fn',
      orderStatusLambdaName: 'order-status-fn',
      chainIdToStatusTrackingStateMachineArn: {},
      getOrdersReservedConcurrency: 3000,
    })
  }

  const mainDashboardWidgets = (stack: DashboardStack): Widget[] => {
    const dashboards = Template.fromStack(stack).findResources('AWS::CloudWatch::Dashboard')
    const main = Object.values(dashboards).find((r) => r.Properties.DashboardName.endsWith('ServiceDashboard'))
    expect(main).toBeDefined()
    expect(typeof main!.Properties.DashboardBody).toBe('string')
    return JSON.parse(main!.Properties.DashboardBody).widgets
  }

  it('charts the Get Orders query cache, concurrency cap, hot GSIs and WAF rule', () => {
    const body = JSON.stringify(mainDashboardWidgets(build()))

    for (const metric of [
      'GetOrdersQueryCacheHit',
      'GetOrdersQueryCacheMiss',
      'GetOrdersQueryCacheSize',
      'GetOrdersQueryCacheUncacheable',
      'GetOrdersQueryCacheTruncated',
      'GetOrdersQueryCacheBaseTruncated',
      'GetOrdersQueryCacheCapacityEviction',
      'GetLimitOrdersQueryCacheHit',
      'GetLimitOrdersQueryCacheMiss',
    ]) {
      expect(body).toContain(metric)
    }
    // Size is a per-environment gauge; only its Max is meaningful across the fleet.
    const sizeWidget = mainDashboardWidgets(build()).find((w) =>
      JSON.stringify(w).includes('GetOrdersQueryCacheSize')
    ) as (Widget & { properties: { stat: string } }) | undefined
    expect(sizeWidget?.properties.stat).toEqual('Maximum')
    expect(JSON.stringify(sizeWidget)).toContain('GetLimitOrdersQueryCacheSize')
    expect(body).toContain('"AWS/Lambda","ConcurrentExecutions","FunctionName","get-orders-fn"')
    expect(body).toContain('"label":"Reserved concurrency","value":3000')
    expect(body).toContain(
      '"ReadThrottleEvents","TableName","Orders","GlobalSecondaryIndexName","chainId_orderStatus-createdAt-all"'
    )
    expect(body).toContain('"AWS/WAFV2","BlockedRequests","WebACL","GoudaServiceIPThrottling","Rule","ip-get-orders"')
  })

  it('places every widget inside the 24-column grid with no overlaps', () => {
    const widgets = mainDashboardWidgets(build())
    const overlaps = (a: Widget, b: Widget) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
    const name = (w: Widget) => w.properties.title ?? w.properties.markdown ?? `${w.x},${w.y}`

    for (const w of widgets) {
      expect(w.x + w.width).toBeLessThanOrEqual(24)
    }
    for (let i = 0; i < widgets.length; i++) {
      for (let j = i + 1; j < widgets.length; j++) {
        const a = widgets[i]
        const b = widgets[j]
        expect({ a: name(a), b: name(b), overlap: overlaps(a, b) }).toEqual({ a: name(a), b: name(b), overlap: false })
      }
    }
  })

  it('keeps the cache and capacity charts in their own section below everything else', () => {
    const widgets = mainDashboardWidgets(build())
    const header = widgets.find((w) => w.properties.markdown === '# Get Orders Cache & Capacity')
    expect(header).toBeDefined()
    const bottom = (w: Widget) => w.y + w.height
    const others = widgets.filter((w) => w !== header && w.y < header!.y)
    // Nothing from earlier sections reaches into the cache section.
    expect(Math.max(...others.map(bottom))).toBeLessThanOrEqual(header!.y)
    // Every widget at or below the header is one of ours.
    const section = widgets.filter((w) => w !== header && w.y >= header!.y)
    expect(section.map((w) => w.properties.title).sort()).toEqual(
      [
        'Query Cache Hit Rate | 5min',
        'Query Cache Reads by Outcome | 5min',
        'Query Cache Live Keys per Environment (max)',
        'Query Cache Truncated Pages & Capacity Evictions | 5min',
        'Get Orders Lambda Concurrency & Throttles',
        'Hot GSI Consumed Read Capacity | 5min',
        'Hot GSI Read Throttles | 5min',
        'WAF ip-get-orders Blocked vs Allowed | 5min',
      ].sort()
    )
  })
})
