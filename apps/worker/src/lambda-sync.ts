// EventBridge-scheduled Lambda: daily sync + insights for EVERY connected
// user, then publish newly derived events to SQS for the notifier. Reuses the
// CLI command code verbatim.
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { createDb } from "@platform/database";
import { runInsights } from "./commands/insights.js";
import { runSyncCommand } from "./commands/sync.js";
import { requireEnv } from "./env.js";

const db = createDb(requireEnv("DATABASE_URL"), { max: 1 });
const sqs = new SQSClient({});

export async function handler(): Promise<{
  users: number;
  synced: number;
  newEvents: number;
  queued: boolean;
}> {
  const userReports = await runSyncCommand(db);
  const reports = userReports.flatMap((u) => u.reports);
  const failed = reports.filter((r) => r.status === "error");
  if (failed.length > 0) {
    // Surface sync failures loudly (CloudWatch metric via error) but only
    // after all connections have been attempted.
    console.error("sync failures:", JSON.stringify(failed));
  }

  const summary = await runInsights(db);
  const newEvents = summary.users.flatMap((u) => u.newEvents);
  console.log(
    JSON.stringify({
      userReports,
      asOf: summary.asOf,
      users: summary.users.length,
      newEvents: newEvents.length,
    }),
  );

  // The digest currently goes to the single configured SES recipient, so the
  // queue message stays one aggregate batch. Per-user digests are the follow-up
  // slice when a second real tenant exists.
  let queued = false;
  if (newEvents.length > 0) {
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: requireEnv("EVENTS_QUEUE_URL"),
        MessageBody: JSON.stringify({ asOf: summary.asOf, events: newEvents }),
      }),
    );
    queued = true;
  }

  if (failed.length > 0) {
    throw new Error(`sync failed for ${failed.length} connection(s)`);
  }
  return {
    users: userReports.length,
    synced: reports.length,
    newEvents: newEvents.length,
    queued,
  };
}
