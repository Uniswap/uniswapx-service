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
    expect(body).toContain('"AWS/Lambda","ConcurrentExecutions","FunctionName","get-orders-fn"')
    expect(body).toContain('"label":"Reserved concurrency","value":3000')
    expect(body).toContain(
      '"ReadThrottleEvents","TableName","Orders","GlobalSecondaryIndexName","chainId_orderStatus-createdAt-all"'
    )
    expect(body).toContain('"AWS/WAFV2","BlockedRequests","WebACL","GoudaServiceIPThrottling","Rule","ip-get-orders"')
  })

  it('places every widget inside the 24-column grid and the cache section overlaps nothing', () => {
    const widgets = mainDashboardWidgets(build())
    const overlaps = (a: Widget, b: Widget) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
    const name = (w: Widget) => w.properties.title ?? w.properties.markdown ?? `${w.x},${w.y}`

    for (const w of widgets) {
      expect(w.x + w.width).toBeLessThanOrEqual(24)
    }
    // The legacy layout has one known collision ("Orders Filled" spans the row the two
    // "... by Chain" widgets share; CloudWatch pushes them down). Guard the new section only.
    const section = widgets.filter((w) => w.y >= 74)
    expect(section.length).toBeGreaterThan(0)
    for (const a of section) {
      for (const b of widgets) {
        if (a === b) continue
        expect({ a: name(a), b: name(b), overlap: overlaps(a, b) }).toEqual({ a: name(a), b: name(b), overlap: false })
      }
    }
  })
})
