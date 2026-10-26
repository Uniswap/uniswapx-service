import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { Alarm, Metric } from 'aws-cdk-lib/aws-cloudwatch'
import { AlarmNotifier } from '../../../bin/stacks/alerting'

const CHATBOT = 'arn:aws:sns:us-east-2:111111111111:SlackChatbotTopic'
const INCIDENT_IO = 'arn:aws:sns:us-east-2:111111111111:CloudWatch-alerts-incident-io'

describe('AlarmNotifier', () => {
  const build = (topics: { chatbotSNSArn?: string; incidentIoSNSArn?: string }) => {
    const stack = new cdk.Stack(new cdk.App(), 'Test')
    const alarm = (name: string) =>
      new Alarm(stack, name, {
        alarmName: name,
        metric: new Metric({ namespace: 'Test', metricName: name }),
        threshold: 1,
        evaluationPeriods: 1,
      })
    const notifier = new AlarmNotifier(stack, topics)
    notifier.page(alarm('Sev2'))
    notifier.notify(alarm('Sev3'))
    const alarms = Object.values(Template.fromStack(stack).findResources('AWS::CloudWatch::Alarm'))
    const props = (name: string) => alarms.find((a) => a.Properties.AlarmName === name)?.Properties
    return { sev2: props('Sev2'), sev3: props('Sev3') }
  }

  it('pages incident.io on ALARM and OK, and Slack on ALARM only', () => {
    const { sev2 } = build({ chatbotSNSArn: CHATBOT, incidentIoSNSArn: INCIDENT_IO })
    expect(sev2.AlarmActions).toEqual([CHATBOT, INCIDENT_IO])
    // incident.io only resolves an alert on OK; without it every later ALARM is folded into the
    // first one and pages nobody.
    expect(sev2.OKActions).toEqual([INCIDENT_IO])
  })

  it('sends SEV3 alarms to Slack only', () => {
    const { sev3 } = build({ chatbotSNSArn: CHATBOT, incidentIoSNSArn: INCIDENT_IO })
    expect(sev3.AlarmActions).toEqual([CHATBOT])
    expect(sev3.OKActions).toBeUndefined()
  })

  it('adds no actions when no topics are configured', () => {
    const { sev2, sev3 } = build({})
    expect(sev2.AlarmActions).toBeUndefined()
    expect(sev3.AlarmActions).toBeUndefined()
  })
})
