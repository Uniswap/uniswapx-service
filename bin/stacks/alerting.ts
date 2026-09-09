import { Alarm } from 'aws-cdk-lib/aws-cloudwatch'
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions'
import * as aws_sns from 'aws-cdk-lib/aws-sns'
import { Construct } from 'constructs'

/**
 * SNS topics that alarms notify. Passed between nested stacks as ARN strings.
 *
 * Slack (the chatbot topic) gets ALARM transitions only: an OK message per recovery is noise
 * in a channel. incident.io gets ALARM *and* OK: it only resolves an alert on OK, and while an
 * alert is unresolved it folds every later ALARM into that first alert. Without OK actions the
 * connector receives exactly one page in its lifetime, which is how the Sep 2 Get Orders outage
 * fired three CloudWatch alarms and paged nobody.
 */
export interface AlarmTopics {
  chatbotSNSArn?: string
  incidentIoSNSArn?: string
}

export class AlarmNotifier {
  private readonly alarmActions: SnsAction[] = []
  private readonly okActions: SnsAction[] = []

  constructor(scope: Construct, topics: AlarmTopics) {
    if (topics.chatbotSNSArn) {
      this.alarmActions.push(
        new SnsAction(aws_sns.Topic.fromTopicArn(scope, 'ChatbotAlarmTopic', topics.chatbotSNSArn))
      )
    }
    if (topics.incidentIoSNSArn) {
      const action = new SnsAction(aws_sns.Topic.fromTopicArn(scope, 'IncidentIoAlarmTopic', topics.incidentIoSNSArn))
      this.alarmActions.push(action)
      this.okActions.push(action)
    }
  }

  /** Attach every configured ALARM and OK action. Safe to call with no topics configured. */
  public wire(...alarms: Alarm[]): void {
    for (const alarm of alarms) {
      this.alarmActions.forEach((action) => alarm.addAlarmAction(action))
      this.okActions.forEach((action) => alarm.addOkAction(action))
    }
  }
}
