// EventBridge-scheduled Lambda: daily sync + insights, then publish any newly
// derived events to SQS for the notifier. Reuses the CLI command code verbatim.
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { createDb } from "@platform/database";
import { runInsights } from "./commands/insights.js";
import { runSyncCommand } from "./commands/sync.js";
import { requireEnv } from "./env.js";

const db = createDb(requireEnv("DATABASE_URL"), { max: 1 });
const sqs = new SQSClient({});

export async function handler(): Promise<{
  synced: number;
  newEvents: number;
  queued: boolean;
}> {
  const reports = await runSyncCommand(db);
  const failed = reports.filter((r) => r.status === "error");
  if (failed.length > 0) {
    // Surface sync failures loudly (CloudWatch metric via error) but only
    // after all connections have been attempted.
    console.error("sync failures:", JSON.stringify(failed));
  }

  const summary = await runInsights(db);
  console.log(
    JSON.stringify({
      reports,
      asOf: summary.asOf,
      newEvents: summary.newEvents.length,
      alreadyRanToday: summary.alreadyRanToday,
    }),
  );

  let queued = false;
  if (summary.newEvents.length > 0) {
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: requireEnv("EVENTS_QUEUE_URL"),
        MessageBody: JSON.stringify({ asOf: summary.asOf, events: summary.newEvents }),
      }),
    );
    queued = true;
  }

  if (failed.length > 0) {
    throw new Error(`sync failed for ${failed.length} connection(s)`);
  }
  return { synced: reports.length, newEvents: summary.newEvents.length, queued };
}
