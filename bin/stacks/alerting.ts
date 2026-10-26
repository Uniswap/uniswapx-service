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
  private readonly slack?: SnsAction
  private readonly incidentIo?: SnsAction

  constructor(scope: Construct, topics: AlarmTopics) {
    if (topics.chatbotSNSArn) {
      this.slack = new SnsAction(aws_sns.Topic.fromTopicArn(scope, 'ChatbotAlarmTopic', topics.chatbotSNSArn))
    }
    if (topics.incidentIoSNSArn) {
      this.incidentIo = new SnsAction(
        aws_sns.Topic.fromTopicArn(scope, 'IncidentIoAlarmTopic', topics.incidentIoSNSArn)
      )
    }
  }

  /** Slack only. For SEV3 alarms, which flap often enough that paging on them would be noise. */
  public notify(...alarms: Alarm[]): void {
    if (!this.slack) return
    for (const alarm of alarms) alarm.addAlarmAction(this.slack)
  }

  /** Slack, plus incident.io on ALARM and OK. For SEV2 alarms. */
  public page(...alarms: Alarm[]): void {
    this.notify(...alarms)
    if (!this.incidentIo) return
    for (const alarm of alarms) {
      alarm.addAlarmAction(this.incidentIo)
      alarm.addOkAction(this.incidentIo)
    }
  }
}
