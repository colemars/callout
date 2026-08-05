import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import { Alarm, ComparisonOperator, TreatMissingData } from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Topic } from "aws-cdk-lib/aws-sns";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { Queue } from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";

// Not a secret (it's a row key, RLS-guarded); baked per the platform's
// bake-config-in convention.
const EMAIL = "cole@colemars.dev";

const bundling = {
  format: OutputFormat.ESM,
  target: "node22",
  minify: true,
  sourceMap: true,
  banner:
    "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
} as const;

/**
 * Phase 9: the platform's event pipeline, all AWS-native.
 * EventBridge (daily) -> sync Lambda -> SQS -> notifier Lambda -> SES.
 * Replaces the GitHub Actions cron and (at cutover) the legacy notify function.
 */
export class PlatformWorkersStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const dlq = new Queue(this, "EventsDLQ", { retentionPeriod: Duration.days(14) });
    const eventsQueue = new Queue(this, "EventsQueue", {
      visibilityTimeout: Duration.seconds(60),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    });

    const syncFn = new NodejsFunction(this, "SyncHandler", {
      entry: "../../apps/worker/src/lambda-sync.ts",
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.minutes(5),
      logRetention: RetentionDays.ONE_MONTH,
      bundling,
      environment: {
        DATABASE_URL: "{{resolve:secretsmanager:platform/database-url}}",
        PLAID_CLIENT_ID: "{{resolve:secretsmanager:platform/plaid-client-id}}",
        PLAID_SECRET: "{{resolve:secretsmanager:platform/plaid-secret}}",
        // Flipped by the deploy workflow's PLAID_ENV (repo variable); sandbox otherwise.
        PLAID_ENV: process.env.PLAID_ENV === "production" ? "production" : "sandbox",
        EVENTS_QUEUE_URL: eventsQueue.queueUrl,
        NODE_OPTIONS: "--enable-source-maps",
      },
    });
    eventsQueue.grantSendMessages(syncFn);

    // Daily 09:30 UTC — same slot the GitHub Actions cron held.
    new Rule(this, "DailySync", {
      schedule: Schedule.cron({ minute: "30", hour: "9" }),
      targets: [new LambdaFunction(syncFn)],
    });

    const notifyFn = new NodejsFunction(this, "NotifyHandler", {
      entry: "../../apps/worker/src/lambda-notify.ts",
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(30),
      logRetention: RetentionDays.ONE_MONTH,
      bundling,
      environment: {
        EMAIL_FROM: EMAIL,
        EMAIL_TO: EMAIL,
        NODE_OPTIONS: "--enable-source-maps",
      },
    });
    notifyFn.addEventSource(new SqsEventSource(eventsQueue, { batchSize: 1 }));
    notifyFn.addToRolePolicy(
      new PolicyStatement({
        actions: ["ses:SendEmail"],
        resources: [`arn:aws:ses:${this.region}:${this.account}:identity/*`],
      }),
    );

    // Roadmap Phase E: a broken nightly sync must page, not rot silently —
    // stale snapshots looked exactly like fresh ones until someone noticed.
    const alerts = new Topic(this, "OpsAlerts");
    alerts.addSubscription(new EmailSubscription(EMAIL));

    new Alarm(this, "SyncErrors", {
      metric: syncFn.metricErrors({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: "The nightly platform sync Lambda errored — snapshots may be stale.",
    }).addAlarmAction(new SnsAction(alerts));

    new Alarm(this, "EventsDLQBacklog", {
      metric: dlq.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: "Digest events landed in the DLQ — the notifier is failing.",
    }).addAlarmAction(new SnsAction(alerts));

    new CfnOutput(this, "EventsQueueUrl", { value: eventsQueue.queueUrl });
    new CfnOutput(this, "SyncFunctionName", { value: syncFn.functionName });
    new CfnOutput(this, "OpsAlertsTopicArn", { value: alerts.topicArn });
  }
}
